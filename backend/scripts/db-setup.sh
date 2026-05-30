#!/usr/bin/env bash
# =============================================================================
# db-setup.sh — Initialize the Raven Protocol database from scratch
#
# Usage:
#   # defaults to local docker-compose postgres
#   ./backend/scripts/db-setup.sh
#
#   # or supply a DATABASE_URL
#   DATABASE_URL=postgres://user:pass@host:5432/dbname ./backend/scripts/db-setup.sh
#
# What it does:
#   1. Applies all SQL migrations in order (0001 → 0003)
#   2. Optionally seeds demo data (--seed flag)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/../migrations"

DATABASE_URL="${DATABASE_URL:?DATABASE_URL must be set (e.g. postgres://user:pass@localhost:5433/dbname)}"
SEED="${1:-}"

echo "=== Raven Protocol — DB Setup ==="
echo "Target: $DATABASE_URL"
echo ""

# Wait for postgres to be ready (up to 30s)
echo "Waiting for database..."
for i in $(seq 1 30); do
    if psql "$DATABASE_URL" -c "SELECT 1" >/dev/null 2>&1; then
        echo "Database is ready."
        break
    fi
    if [[ $i -eq 30 ]]; then
        echo "ERROR: Database did not become ready after 30 seconds."
        exit 1
    fi
    sleep 1
done

# Apply migrations in order
for migration in "$MIGRATIONS_DIR"/0001_core.sql \
                 "$MIGRATIONS_DIR"/0002_orderbook.sql \
                 "$MIGRATIONS_DIR"/0003_fractal_v2.sql; do
    if [[ -f "$migration" ]]; then
        echo "Applying $(basename "$migration")..."
        psql "$DATABASE_URL" -f "$migration"
        echo "  ✓ done"
    else
        echo "  ⚠  $(basename "$migration") not found, skipping"
    fi
done

echo ""
echo "Schema applied successfully."

# Optional seed
if [[ "${SEED:-}" == "--seed" ]]; then
    echo ""
    echo "Seeding demo data..."
    psql "$DATABASE_URL" -f "$SCRIPT_DIR/seed-demo.sql"
    echo "Demo data seeded."
fi

echo ""
echo "=== Setup complete ==="
