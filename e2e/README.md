# e2e

Playwright tests (plain JS) for the live site and the PR stack. DevOps-owned.

- Local stack: `cd e2e && npm ci && npx playwright install chromium && BASE_URL=http://localhost:8090 npm run test:local`
- Live: `BASE_URL=https://nebula.excl.sh npx playwright test` (add `EXPECTED_VERSION=<sha>` to pin the deployed version).
- `@prod` tests check host nginx (TLS, http→https, security headers); `test:local` excludes them and they skip on non-https URLs.
- `tests/contract-api.spec.js` covers future endpoints as `test.fixme`: change one to `test` in the PR that ships its endpoint.
- Never put the logs password in tests: CI traces and reports are public.
