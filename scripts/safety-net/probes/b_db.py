"""LANE SAFETY-NET-B (2026-10-01) — the ONE way half B's probes read a database. Run under aidream's env (psycopg).

WHY THIS EXISTS (chair, 2026-10-01 ~03:20 PT, data integrity on production): probes sent as one psql string
`begin read only; …; rollback;` through Supabase's TRANSACTION pooler (port 6543) left a backend inside an open
READ-ONLY transaction whenever a statement errored or timed out (psql stops before the rollback); the pooler then
handed that backend to the aidream server, whose writes failed "cannot execute UPDATE in a read-only transaction"
(ops.app_log bursts 09:39–10:14Z). So:
  1. never the transaction pooler: the SESSION pooler (same host, port 5432), and 6543 is REFUSED for production;
  2. the rollback is guaranteed by the client (try/finally), never by the last line of a script;
  3. every read runs `read_only` with its own statement_timeout, on its own connection, closed after.

    uv run --project ../aidream python scripts/safety-net/probes/b_db.py --self-test
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

CODE = Path(__file__).resolve().parents[4]
SESSION_PORT = 5432
TRANSACTION_PORT = 6543


def env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if path.exists():
        for line in path.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                out.setdefault(k.strip().removeprefix("export ").strip(), v.strip().strip('"').strip("'"))
    return out


def refuse_transaction_pooler(target: str, port: int) -> None:
    if int(port) == TRANSACTION_PORT:
        raise SystemExit(f"refused: {target} through the transaction pooler (port {TRANSACTION_PORT}) — a probe's open "
                         f"transaction can be handed to the server. Use the session pooler (port {SESSION_PORT}).")


def live_conninfo() -> dict:
    e = env_file(CODE / "aidream/.env")
    # The configured port is the server's (transaction pooler); probes always take the session port of the same host.
    info = {"host": e["SUPABASE_MATRIX_HOST"], "port": SESSION_PORT, "user": e["SUPABASE_MATRIX_USER"],
            "password": e["SUPABASE_MATRIX_PASSWORD"], "dbname": e["SUPABASE_MATRIX_DATABASE_NAME"]}
    refuse_transaction_pooler("production", info["port"])
    return info


def clone_dsn() -> str:
    ref = re.search(r"^clone_ref\s*=\s*(\S+)", (CODE / "common-docs/operations/clone/CLONE-REF").read_text(), re.M).group(1)
    dsn = env_file(CODE / "matrx-frontend/.env.local").get("CLONE_DATABASE_URL", "")
    if f"postgres.{ref}" not in dsn:
        raise SystemExit(f"refused: CLONE_DATABASE_URL does not name the current clone {ref}")
    return session_dsn(dsn)


def session_dsn(dsn: str) -> str:
    """The same DSN on the session pooler port (the clone's server shares its pooler too)."""
    parts = urlsplit(dsn)
    netloc = re.sub(r":(\d+)$", f":{SESSION_PORT}", parts.netloc)
    return urlunsplit(parts._replace(netloc=netloc))


def read(sql: str, target: str, timeout_s: int = 120) -> list[tuple]:
    """One read-only transaction on its own connection; rolled back and closed in `finally`, whatever happens."""
    import psycopg

    conn = (psycopg.connect(clone_dsn(), connect_timeout=30, application_name="safety-net-b") if target == "clone"
            else psycopg.connect(**live_conninfo(), connect_timeout=30, application_name="safety-net-b-live"))
    try:
        conn.read_only = True
        with conn.cursor() as cur:
            cur.execute(f"set local statement_timeout = '{int(timeout_s)}s'")
            # Belt and braces (lane SAFETY-NET's W27 fix): even a client that dies mid-transaction is ended by the server.
            cur.execute("set local idle_in_transaction_session_timeout = '90s'")
            cur.execute(sql)
            return cur.fetchall() if cur.description else []
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def self_test() -> int:
    ok = True
    try:
        refuse_transaction_pooler("production", TRANSACTION_PORT)
        print("FAIL: port 6543 was not refused for production")
        ok = False
    except SystemExit as e:
        print(f"PASS: 6543 refused — {e}")
    if live_conninfo()["port"] != SESSION_PORT:
        print("FAIL: the live connection is not on the session port")
        ok = False
    else:
        print("PASS: the live connection uses the session pooler port 5432")
    d = session_dsn("postgresql://postgres.abc:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres")
    if ":5432/" not in d:
        print(f"FAIL: session_dsn did not move the port: {d}")
        ok = False
    else:
        print("PASS: a 6543 DSN is moved to 5432")
    # The rollback is the client's: a failing statement still leaves no transaction behind on that connection.
    import psycopg

    conn = psycopg.connect(clone_dsn(), connect_timeout=30)
    try:
        conn.read_only = True
        try:
            with conn.cursor() as cur:
                cur.execute("select 1/0")
        except psycopg.Error:
            pass
    finally:
        conn.rollback()
        status = conn.info.transaction_status
        conn.close()
    if status != psycopg.pq.TransactionStatus.IDLE:
        print(f"FAIL: after an error the connection was left in transaction status {status}")
        ok = False
    else:
        print("PASS: after an error inside a read-only transaction the client rolled back (status IDLE) before closing")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv else 0)
