#!/usr/bin/env bash
# =============================================================================
# db-backup.sh — Dump the Raven Protocol database for live demo restore
#
# Usage:
#   # create a timestamped backup in ./backups/
#   ./backend/scripts/db-backup.sh
#
#   # supply a DATABASE_URL
#   DATABASE_URL=postgres://user:pass@host:5432/dbname ./backend/scripts/db-backup.sh
#
#   # restore from a backup
#   ./backend/scripts/db-backup.sh --restore backups/demo_20260601_120000.dump
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$SCRIPT_DIR/../backups"
DATABASE_URL="${DATABASE_URL:-postgres://tpp:tpp_secret@localhost:5433/tpp_protocol}"

mkdir -p "$BACKUP_DIR"

ACTION="${1:-}"
RESTORE_FILE="${2:-}"

if [[ "$ACTION" == "--restore" ]]; then
    if [[ -z "$RESTORE_FILE" ]]; then
        echo "Usage: $0 --restore <dump_file>"
        exit 1
    fi
    if [[ ! -f "$RESTORE_FILE" ]]; then
        echo "ERROR: File not found: $RESTORE_FILE"
        exit 1
    fi
    echo "=== Restoring from $RESTORE_FILE ==="
    echo "Target: $DATABASE_URL"
    echo ""
    echo "WARNING: This will DROP and recreate the schema. Continue? [y/N]"
    read -r confirm
    if [[ "${confirm,,}" != "y" ]]; then
        echo "Aborted."
        exit 0
    fi
    pg_restore --no-owner --no-acl --clean --if-exists -d "$DATABASE_URL" "$RESTORE_FILE"
    echo ""
    echo "=== Restore complete ==="
else
    # Create backup
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BACKUP_FILE="$BACKUP_DIR/demo_${TIMESTAMP}.dump"

    echo "=== Raven Protocol — DB Backup ==="
    echo "Source:  $DATABASE_URL"
    echo "Output:  $BACKUP_FILE"
    echo ""

    pg_dump \
        --format=custom \
        --no-owner \
        --no-acl \
        --compress=6 \
        --file="$BACKUP_FILE" \
        "$DATABASE_URL"

    SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
    echo "Backup created: $BACKUP_FILE ($SIZE)"
    echo ""
    echo "To restore:"
    echo "  DATABASE_URL=<url> $0 --restore $BACKUP_FILE"
    echo ""
    echo "=== Backup complete ==="
fi
