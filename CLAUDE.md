# Flame-Nebula

NASA Space Apps 2026 — "Harmonization of MODIS and VIIRS Hot Spots".
A web app that shows a **burning activity calendar** (hotspot counts per month/day) for a selected area, built from NASA FIRMS satellite fire data.

**MVP scope (fixed):** Italy · year 2008 · MODIS only. VIIRS and harmonization come after the MVP works end to end.

## Pipeline

Each stage reads only the previous stage's **contract** — the exact shape defined in `docs/contracts.md`.

```
FIRMS CSV ─▶ harmonize/ ─▶ data/processed/*.csv ─▶ db/ (Postgres + aggregates) ─▶ api/ (Express) ─▶ web/ (React)
```

| Folder | Stack | Owns |
|---|---|---|
| `harmonize/` | Python 3.12, venv + pip, `requirements.txt` | Clean/merge raw FIRMS CSVs into the processed CSV |
| `db/` | PostgreSQL 17 | Schema, load script, aggregate views |
| `api/` | Node 20, Express, plain JavaScript | HTTP endpoints over the DB |
| `web/` | React, plain JavaScript | Map, area picker, calendar, stats, CSV download |
| `data/` | — | `raw/` and `processed/`, both gitignored |
| `docs/` | Markdown | Specs everyone follows |
| `infra/`, `.github/` | Docker Compose, nginx, bash, GitHub Actions | DevOps: compose stubs, nginx, deploy script, CI/deploy workflows |

Run everything with `docker compose up --build` from the repo root, then open http://localhost:8090 (setup in `docs/deploy.md`). Secrets and ports go in `.env` (copy `.env.example`); `.env` is never committed.

## Docs — read before you touch the matching area

- `docs/contracts.md` — **before changing any data shape**: CSV columns, DB tables, API request/response. A shape change means editing this file in the same PR.
- `docs/data-sources.md` — before reading FIRMS data: download links, column meanings, `type` codes, Terra/Aqua and day/night.
- `docs/challenge.md` — before adding a feature: challenge asks and our Must/Should/Could list. Build Must first.
- `docs/workflow.md` — before branching, committing, or opening a PR.
- `docs/deploy.md` — before changing `docker-compose.yml`, a Dockerfile, ports, or anything under `infra/` or `.github/`.

## Conventions

- **Branch:** `<module>/<feature>`, module = folder name. Example: `web/calendar-heatmap`, `harmonize/clean-modis`.
- **Commit:** Conventional Commits, scope = module. Example: `feat(api): add /stats endpoint`, `fix(harmonize): parse acq_time as HHMM`.
- **Merge:** PR into `main` with 1 approving review. `main` must always run with `docker compose up`.
- **Dates and times:** store UTC. `acq_date` is `YYYY-MM-DD`, `acq_time` is `HHMM` UTC, always 4 digits.
- **Coordinates:** WGS84 decimal degrees, order `latitude, longitude` in CSV and JSON fields; GeoJSON uses `[longitude, latitude]` as its spec requires.
- **Raw data:** never commit files from `data/`. Document how to fetch a file in `docs/data-sources.md` instead.
- **Python deps:** add to `harmonize/requirements.txt` with a pinned version (`pandas==2.2.3`).
- **Commits and PRs carry human authors only** — no AI attribution trailers or footers.

## Not decided yet — ask the owner, do not invent

- Harmonization method (MODIS↔VIIRS) — teammate owns it; `docs/contracts.md` marks it TBD.
- JS lint/format rules — teammate owns it.
- Map and chart libraries for `web/`.
