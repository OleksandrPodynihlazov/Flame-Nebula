#!/usr/bin/env bash
# Apply every db/init/*.sql, in alphabetical order, to the compose `db` service.
#   Usage: infra/apply-db-schema.sh   (called by infra/deploy.sh and CI; safe on a laptop too)
#
# Postgres runs db/init only on an EMPTY volume, so an existing DB never saw later schema changes.
# This script starts `db` if needed, waits for its healthcheck, and applies each file in one
# transaction with psql's ON_ERROR_STOP. Every file must therefore be safe to re-run.
# On failure only psql's ERROR line is printed, never DETAIL (it can quote row values; CI output is public).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

export LC_ALL=C  # glob order = byte order, same as the Postgres entrypoint
shopt -s nullglob
files=(db/init/*.sql)
if (( ${#files[@]} == 0 )); then
  echo "error: db schema: no db/init/*.sql files in $(pwd)" >&2
  exit 1
fi

docker compose up -d --wait db

for f in "${files[@]}"; do
  if ! err="$(docker compose exec -T -e PGOPTIONS='-c client_min_messages=warning' db \
      sh -c 'psql -X -q -1 -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null' \
      < "$f" 2>&1)"; then
    line="$(grep -m1 -E 'ERROR:|FATAL:' <<<"$err" || true)"
    echo "error: db schema: $f failed: ${line:-psql exited non-zero without an ERROR line (is the db service running?)}" >&2
    exit 1
  fi
  echo "==> db schema: applied $f"
done
