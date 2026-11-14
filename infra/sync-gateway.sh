#!/usr/bin/env bash
# Recreate the gateway container if its bind-mounted config is stale.
#   Usage: infra/sync-gateway.sh   (called by infra/deploy.sh after compose up)
#
# docker-compose.yml bind-mounts single files into gateway. `git checkout` (or an
# editor) replaces such a file with a new inode, the container keeps seeing the
# old one, and `docker compose up` does not recreate gateway because its service
# config did not change. So compare checksums and force-recreate on a mismatch.
# Only checksums are compared; file contents are never printed (CI output is public).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# <host path>:<path inside the gateway container>, as mounted in docker-compose.yml
MOUNTS=(
  "infra/nginx/gateway.conf:/etc/nginx/conf.d/default.conf"
  "infra/nginx/htpasswd:/etc/nginx/htpasswd"
)

stale=""
for m in "${MOUNTS[@]}"; do
  host_path="${m%%:*}"
  container_path="${m#*:}"
  want="$(sha256sum "$host_path" | cut -d' ' -f1)"
  # Fails when gateway is not running; an empty checksum then counts as stale.
  have="$(docker compose exec -T gateway sha256sum "$container_path" 2>/dev/null | cut -d' ' -f1)" || have=""
  if [[ "$want" != "$have" ]]; then
    stale="$host_path"
    break
  fi
done

if [[ -n "$stale" ]]; then
  docker compose up -d --no-deps --force-recreate gateway
  echo "==> gateway config changed ($stale) -> recreated gateway"
else
  echo "==> gateway config unchanged"
fi
