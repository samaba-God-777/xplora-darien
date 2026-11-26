#!/usr/bin/env bash
# Respaldo de PostgreSQL en formato custom (restaurable con pg_restore).
# Uso:
#   ./infrastructure/backup.sh                       # base local (DATABASE_URL o xplora_darien)
#   ./infrastructure/backup.sh docker                # contenedor de docker compose
# Restaurar:
#   pg_restore --clean --if-exists -d xplora_darien backups/xplora_darien-AAAAMMDD-HHMMSS.dump
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
stamp=$(date +%Y%m%d-%H%M%S)
out="backups/xplora_darien-$stamp.dump"

if [[ "${1:-}" == "docker" ]]; then
  docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d xplora_darien -Fc' > "$out"
else
  pg_dump "${DATABASE_URL:-xplora_darien}" -Fc -f "$out"
fi

# Conserva los últimos 14 respaldos.
ls -1t backups/xplora_darien-*.dump | tail -n +15 | xargs -r rm --
echo "respaldo: $out ($(du -h "$out" | cut -f1))"
