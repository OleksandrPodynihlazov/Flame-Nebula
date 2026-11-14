#!/usr/bin/env bash
# Deploy one commit on the VPS. Run by the GitHub "Deploy" workflow over ssh.
#   Usage: infra/deploy.sh <git-sha>
#
# The VPS working copy is owned by CI: it is checked out detached at the deployed
# commit, and any local edits there get discarded on the next deploy.
# Only .env and infra/nginx/htpasswd (both gitignored) live there permanently.
set -euo pipefail

SHA="${1:-}"
if [[ -z "$SHA" ]]; then
  echo "usage: $0 <git-sha>" >&2
  exit 2
fi

cd "$(dirname "${BASH_SOURCE[0]}")/.."

for f in .env infra/nginx/htpasswd; do
  if [[ ! -f "$f" ]]; then
    echo "error: missing $(pwd)/$f — see docs/deploy.md, section 'One-time VPS setup'" >&2
    exit 1
  fi
done

GATEWAY_PORT="$(grep -E '^GATEWAY_PORT=' .env | tail -n1 | cut -d= -f2- | tr -d '"'"'"' \r' || true)"
GATEWAY_PORT="${GATEWAY_PORT:-8090}"
HEALTH_URL="http://127.0.0.1:${GATEWAY_PORT}/api/health"

echo "==> checking out $SHA"
git fetch --quiet origin
git checkout --quiet --detach "$SHA"

export APP_VERSION="$SHA"

echo "==> docker compose up (APP_VERSION=$APP_VERSION)"
docker compose up -d --build --remove-orphans
bash infra/sync-gateway.sh

# The gateway API cache outlives deploys that keep gateway.conf: drop answers from the old API
# so the new frontend and the post-deploy e2e never see old response shapes. Empty dir is fine.
docker compose exec -T gateway sh -c 'rm -rf /var/cache/nginx/api/*'
echo "==> gateway API cache cleared"

echo "==> waiting for $HEALTH_URL to report version $SHA"
deadline=$((SECONDS + 90))
body=""
while (( SECONDS < deadline )); do
  if body="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null)" \
     && grep -q "\"version\":\"${SHA}\"" <<<"$body"; then
    echo "==> healthy: $body"
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 2
done

echo "error: health check failed after 90s" >&2
docker compose ps
# CI output is public: keep container logs on the VPS only.
docker compose logs --tail=200 > "deploy-failure.log" 2>&1 || true
echo "logs saved to $(pwd)/deploy-failure.log on the VPS; also at https://nebula.excl.sh/logs/" >&2
exit 1
