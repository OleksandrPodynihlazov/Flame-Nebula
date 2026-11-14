# frontend

React + TypeScript + Vite. Map (Leaflet), stats and burning calendar over `GET /api/*` from `docs/contracts.md` [3].

## Run

```bash
npm ci
echo "VITE_USE_MOCKS=true" > .env.local
npm run dev
```

`VITE_USE_MOCKS=true` serves `src/api/mocks.ts` instead of the API. Without it, `/api` is proxied to `http://localhost:3000`. Restart `npm run dev` after changing `.env.local`.

`npm run build` and `npm run lint` must pass before a PR.

## Layout

| Path | What |
|---|---|
| `src/types/api.ts` | API shapes, mirrors `docs/contracts.md` [3] |
| `src/api/` | `client.ts` (fetch, CSV), `mocks.ts` |
| `src/hooks/` | `useDashboardData` — loads calendar, stats, hotspots for the current filters |
| `src/utils/` | `filters.ts` (filters → query), `calendar.ts` (day grid, ramp) |
| `src/constants/` | Fire types, colors, defaults |
| `src/components/` | UI |

## Docker

`Dockerfile` builds with `VITE_USE_MOCKS=true` by default until the API endpoints ship; set the build arg to `false` then.
