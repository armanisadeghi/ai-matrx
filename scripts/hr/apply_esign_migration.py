#!/usr/bin/env python3
"""Apply one esign migration file and ledger it in BOTH stores.

    cd /Users/armanisadeghi/code/aidream && \
      uv run python /Users/armanisadeghi/code/matrx-frontend/scripts/hr/apply_esign_migration.py esign_01_schema_and_evidence

The whole file runs in ONE transaction: if any assertion in it raises, nothing lands and neither
ledger is written. Both ledgers are written inside that same transaction, so "applied" and
"recorded as applied" can never disagree.

statement_cache_size=0 is required — the host is pgbouncer in transaction pooling mode.
"""
import asyncio, hashlib, os, sys, time
from datetime import datetime, timezone

import asyncpg
from dotenv import load_dotenv

load_dotenv("/Users/armanisadeghi/code/aidream/.env")
MIGRATIONS = "/Users/armanisadeghi/code/matrx-frontend/migrations"


async def main() -> int:
    if len(sys.argv) < 2:
        print("usage: apply_esign_migration.py <migration_stem> [...]")
        return 2
    conn = await asyncpg.connect(
        host=os.environ["SUPABASE_MATRIX_HOST"], port=int(os.environ["SUPABASE_MATRIX_PORT"]),
        database=os.environ["SUPABASE_MATRIX_DATABASE_NAME"], user=os.environ["SUPABASE_MATRIX_USER"],
        password=os.environ["SUPABASE_MATRIX_PASSWORD"], statement_cache_size=0, command_timeout=900)
    rc = 0
    try:
        for stem in sys.argv[1:]:
            path = os.path.join(MIGRATIONS, f"{stem}.sql")
            sql = open(path, encoding="utf-8").read()
            checksum = hashlib.sha256(sql.encode("utf-8")).hexdigest()
            version = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S") + f"{int(time.time()*1000)%1000:03d}"
            t0 = time.time()
            tr = conn.transaction()
            await tr.start()
            try:
                await conn.execute(sql)
                ms = int((time.time() - t0) * 1000)
                await conn.execute(
                    """insert into public._schema_migrations (source, filename, checksum, duration_ms)
                       values ('matrx-frontend', $1, $2, $3)
                       on conflict (source, filename) do update
                         set checksum = excluded.checksum, applied_at = now(),
                             duration_ms = excluded.duration_ms""",
                    f"{stem}.sql", checksum, ms)
                await conn.execute(
                    """insert into supabase_migrations.schema_migrations (version, name, statements)
                       values ($1, $2, array[$3])""",
                    version, stem, sql)
                await tr.commit()
                print(f"APPLIED  {stem}  ({ms} ms)  sha256={checksum[:16]}…  version={version}")
            except Exception as exc:
                await tr.rollback()
                print(f"FAILED   {stem}: {type(exc).__name__}: {exc}")
                rc = 1
                break
    finally:
        await conn.close()
    return rc


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
