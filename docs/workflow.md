# Workflow

## Git

1. Update: `git switch main && git pull`.
2. Branch: `git switch -c <module>/<feature>` — module = folder (`harmonize`, `db`, `api`, `web`, `docs`).
3. Commit with Conventional Commits, scope = module:
   - `feat(web): add calendar heatmap`
   - `fix(api): reject radius_km <= 0`
   - `docs(contracts): add /calendar response`
   - Types: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`.
4. Push and open a PR into `main`.
5. **1 approving review** is required before merge. Reviewer checks: it runs, and `docs/contracts.md` matches any shape change.
6. Squash-merge. Delete the branch.

Keep PRs small. Merge often — long branches cause conflicts.

## Syncs

- **Blocker sync** every 90 min: say only what blocks you.
- **Stand-up** every 3–4 h: current objective, progress, next work.

## Data

Raw and processed files live in `data/` and are gitignored. To use a new file, add its download command to `docs/data-sources.md`.
