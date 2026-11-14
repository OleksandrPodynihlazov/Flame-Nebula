# Deploy

## URLs

- App: https://nebula.excl.sh
- Health: https://nebula.excl.sh/api/health
- Logs: https://nebula.excl.sh/logs/ — team password, ask DevOps.

## How deploy works

Every merge to `main` runs the **Deploy** workflow (`.github/workflows/deploy.yml`):

```
merge to main ─▶ Deploy workflow ─▶ ssh VPS ─▶ infra/deploy.sh <sha> ─▶ /api/health reports <sha> ─▶ smoke job ─▶ e2e job
```

`infra/deploy.sh` checks out the commit, runs `docker compose up -d --build`, and waits up to 90 s for `/api/health` to return that commit's sha as `version`. If it never does, the job fails and saves container logs to `deploy-failure.log` in the repo dir on the VPS (CI output is public, so logs are not printed). The smoke job then checks the public URL.

The e2e job then runs the Playwright suite in `e2e/` against the public URL. Its HTML report is a downloadable artifact on the Actions run.

PRs into `main` run **CI** (`.github/workflows/ci.yml`): build the whole stack, wait for health, then run the e2e suite without `@prod` tests.

Changes that touch only Markdown or `docs/` skip CI and Deploy.
Frontend checks run only when `frontend/` changes.
For a manual deploy, use **Run workflow** on the Deploy workflow in the Actions tab.

Do not edit files on the VPS: its checkout is reset on every deploy.

## Logs

- Browser: Dozzle at `/logs/` (only this project's containers; it reads Docker through a read-only socket proxy, never the raw socket).
- On the VPS, from the repo dir: `docker compose logs -f api`.

Log to stdout, one line per event. Docker keeps 3 × 10 MB per container.

## Swap a stub for your real service

`infra/stubs/` holds placeholder `api` and `web` images so the pipeline runs before the real code exists.

1. Put a `Dockerfile` in your folder (`api/` or `web/`).
2. Meet the contract:
   - **api** listens on port **3000** and serves `GET /api/health`: HTTP 200 when ready, JSON with a `"version"` field set from env `APP_VERSION`. Read the DB from env `DATABASE_URL`.
   - **web** container serves the built app on port **80**. `/api/*` is proxied to the api by the gateway, so call relative URLs.
3. In the same PR, change the one `build:` `context:` line for your service in `docker-compose.yml` (e.g. `./infra/stubs/api` → `./api`).

CI must be green before merge.

### web: built from `frontend/`

`web` now builds from `frontend/` (`frontend/Dockerfile`: Node build stage, then nginx on port 80 with SPA fallback). The **Frontend** workflow (`.github/workflows/frontend.yml`) runs `npm ci`, `npm run lint`, `npm run build` in `frontend/`.

The stub stays in `infra/stubs/web`. To fall back to it, change the `web` `build:` `context:` in `docker-compose.yml` from `./frontend` back to `./infra/stubs/web`.

## Run locally

```sh
cp .env.example .env
docker run --rm httpd:2.4-alpine htpasswd -nbB team <password> > infra/nginx/htpasswd
docker compose up --build
```

Open http://localhost:8090. Stop with `docker compose down` (add `-v` to wipe the DB).

## One-time VPS setup

DevOps only.

1. Add the deploy user to the docker group: `sudo usermod -aG docker excl` (log in again).
2. Host nginx vhost:
   ```sh
   sudo cp infra/nginx/host/nebula.excl.sh.conf /etc/nginx/conf.d/
   sudo nginx -t && sudo systemctl reload nginx
   ```
3. In `/home/excl/hackathlone/Flame-Nebula`: create `.env` from `.env.example` with a real password, and `infra/nginx/htpasswd` with the command from **Run locally**.
4. Deploy key: generate an ed25519 key pair, add the public key to `~excl/.ssh/authorized_keys`. In GitHub repo secrets set `VPS_SSH_KEY` (private key) and `VPS_KNOWN_HOSTS` (output of `ssh-keyscan -p 2222 excl.sh`). Optional repo variables `VPS_HOST`, `VPS_USER`, `VPS_PORT` override the defaults.
