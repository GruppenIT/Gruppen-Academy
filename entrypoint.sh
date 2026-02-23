#!/bin/sh
set -e

# On a fresh database, create_all builds the full latest schema and
# "alembic stamp head" records that we're already at the latest migration.
# On an existing database, "alembic upgrade head" applies incremental changes.

echo "==> Initialising database schema (create_all + inline migrations) ..."
python -c "
import asyncio
from app.init_db import init_db
asyncio.run(init_db())
"

# Check whether Alembic has been initialised (alembic_version table with rows)
ALEMBIC_CURRENT=$(alembic current 2>/dev/null || true)

if echo "$ALEMBIC_CURRENT" | grep -q "(head)"; then
    echo "==> Alembic already at head, nothing to migrate."
elif [ -n "$ALEMBIC_CURRENT" ]; then
    echo "==> Existing alembic history found, running upgrade head ..."
    alembic upgrade head
else
    echo "==> Fresh database detected, stamping alembic head ..."
    alembic stamp head
fi

echo "==> Starting uvicorn ..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
