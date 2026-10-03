"""LANE 5 VISION-REACH, WAVE 3 — `external-visibility` (+ the read-only promise) for a table synced from an
outside Postgres, through every door a person or an agent reaches it by.

What it does, as real seats over real HTTP (no privileged role anywhere):
  1. admin@admin.com connects an outside database through the SERVER (`/external-databases/inspect`, then
     `/tables`) and picks `scratch.appointments` — it lands as a Synced table in Cedar Ridge Physical Therapy.
     A second pick of the same table refreshes it (rows updated, none added).
  2. THE READ-ONLY PROMISE (REC-N-11), from the client channel: an edit of an outside column is refused 42501
     in one sentence; a new row is refused; `custom.table_sync` for an outside database sent from a client is
     refused; a column of the owner's OWN on those rows is written (REC-N-8 — our fields on stub records); a
     Visits table with a relation to the synced table links one appointment.
  3. EXTERNAL VISIBILITY: the owner sets the table "Only me"; test@test.com (a plain member) must not meet it
     on the data home, in its search, in the table pickers' doors, in REST v1 `GET /v1/tables`, nor in the MCP
     `tables` list — and must read 0 of its rows through `read_records_page`, REST rows and MCP list_rows.
     Control: the owner still reads all of them through REST v1 and the MCP (the MCP reads it).
  4. The connection string is in no response body this probe received (every body is scanned).

SELF-TEST (`SN_EXT_PLANT=grant`): the owner ALSO shares the table with test@test.com before step 3 — every
visibility step must then go RED. The plant is a share made and revoked through the store's own doors.

    SN_TARGET=clone SN_EXT_DSN_FILE=<file holding the outside connection string> \
      uv run --project ../aidream python scripts/safety-net/probes/external_tables.py

Outside source for the acceptance: a schema on the nightly CLONE (never production data, never a customer
database), read through a SELECT-only role. The file named by SN_EXT_DSN_FILE is read, never printed.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

CODE = Path(__file__).resolve().parents[4]
TARGET = os.environ.get("SN_TARGET", "clone")
OUT = Path(os.environ.get("SN_OUT", str(Path(tempfile.gettempdir()) / "safety-net-external-tables")))
OUT.mkdir(parents=True, exist_ok=True)
STAMP = os.environ.get("SN_STAMP") or datetime.now(ZoneInfo("America/Los_Angeles")).strftime("%b %-d %H%M")
PLANT = os.environ.get("SN_EXT_PLANT", "")
ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04"  # Cedar Ridge Physical Therapy
FORBIDDEN = ("3e790542-fdaf-40b2-8bf3-658bf94fe67f", "c1aabdc0-4d94-42d4-9ddc-91b68ef9c0a7")
UA = {"user-agent": "matrx-safety-net-external-tables/1.0"}
OUTSIDE_SCHEMA, OUTSIDE_TABLE = os.environ.get("SN_EXT_TABLE", "scratch.appointments").split(".", 1)


def _env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if path.exists():
        for line in path.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                out.setdefault(k.strip().removeprefix("export ").strip(), v.strip().strip('"').strip("'"))
    return out


ENV = {**_env_file(CODE / "aidream/.env"), **_env_file(CODE / "matrx-frontend/.env.local"), **_env_file(CODE / "matrx-frontend/.env")}
if TARGET == "live":
    DB_URL, SERVER = "https://db.matrxserver.com", "https://server.app.matrxserver.com"
    ANON = ENV["SUPABASE_MATRIX_PUBLISHABLE_KEY"]
elif TARGET == "clone":
    import subprocess

    shell = subprocess.run(["uv", "run", "python", "scripts/clone/server_env.py", "--shell"], cwd=CODE / "aidream",
                           capture_output=True, text=True, timeout=240).stdout
    cenv = {m.group(1): m.group(2).strip("'\"") for m in re.finditer(r"^export (\w+)=(.*)$", shell, re.M)}
    if "SUPABASE_MATRIX_PUBLISHABLE_KEY" not in cenv:
        raise SystemExit("could not read the clone's keys (aidream: uv run python scripts/clone/server_env.py --check)")
    DB_URL = cenv["SUPABASE_MATRIX_URL"].rstrip("/")
    ANON = cenv["SUPABASE_MATRIX_PUBLISHABLE_KEY"]
    SERVER = os.environ.get("SN_CLONE_SERVER", "http://localhost:8200")
else:
    raise SystemExit("SN_TARGET must be live or clone")
SERVER = os.environ.get("SN_EXT_SERVER", SERVER).rstrip("/")
DSN_FILE = os.environ.get("SN_EXT_DSN_FILE")
if not DSN_FILE or not Path(DSN_FILE).exists():
    raise SystemExit("SN_EXT_DSN_FILE must name a file holding the outside connection string")
DSN = Path(DSN_FILE).read_text().strip()
PASSWORD = re.match(r"^[a-z]+://[^:]+:([^@]+)@", DSN).group(1) if re.match(r"^[a-z]+://[^:]+:([^@]+)@", DSN) else ""

results: list[dict] = []
SECRETS: list[str] = [DSN, PASSWORD]
log: list[str] = []
LEAKS: list[str] = []


def redact(text: str) -> str:
    for s in SECRETS:
        if s:
            text = text.replace(s, "<redacted>")
    return text


def step(items: list[str], name: str, ok: bool | None, detail: str) -> bool:
    status = "SKIP" if ok is None else "PASS" if ok else "FAIL"
    results.append({"walk": "external-tables", "items": items, "step": name, "status": status,
                    "detail": redact(detail)[:900], "ms": 0, "shot": None})
    print(f"{status} [{','.join(items)}] {name} — {redact(detail)[:500]}", flush=True)
    return bool(ok)


def http(method: str, url: str, body=None, headers: dict | None = None, timeout: int = 180) -> tuple[int, object, str]:
    if any(b in url or (body is not None and b in json.dumps(body)) for b in FORBIDDEN):
        raise SystemExit("refused: a call names Arman's organization or table")
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers={"content-type": "application/json", **UA, **(headers or {})})
    resp_headers = ""
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310
            raw, status, resp_headers = r.read().decode() or "null", r.status, str(r.headers)
    except urllib.error.HTTPError as e:
        raw, status, resp_headers = e.read().decode() or "null", e.code, str(e.headers)
    except Exception as e:  # noqa: BLE001 — unreachable is an answer, said
        raw, status = json.dumps({"client_error": str(e)}), 0
    for secret in (DSN, PASSWORD):
        if secret and (secret in raw or secret in resp_headers):
            LEAKS.append(f"{method} {url.replace(SERVER, '{server}').replace(DB_URL, '{db}')}")
    try:
        parsed = json.loads(raw)
    except ValueError:
        parsed = raw
    log.append(redact(f"{method} {url.replace(DB_URL, '{db}').replace(SERVER, '{server}')} -> {status} {raw[:500]}"))
    return status, parsed, raw


class Seat:
    def __init__(self, email_key: str, password_key: str, expected_email: str):
        self.email = ENV.get(email_key)
        if self.email != expected_email:
            raise SystemExit(f"refused: {email_key} is not {expected_email}")
        SECRETS.append(ENV[password_key])
        s, body, _ = http("POST", f"{DB_URL}/auth/v1/token?grant_type=password",
                          {"email": self.email, "password": ENV[password_key]}, {"apikey": ANON})
        if s != 200 or body["user"]["email"] != expected_email:
            raise SystemExit(f"sign-in failed for {expected_email}: {s}")
        self.jwt = body["access_token"]
        self.user_id = body["user"]["id"]
        SECRETS.append(self.jwt)

    def rpc(self, fn: str, args: dict, schema: str = "custom") -> tuple[int, object, str]:
        return http("POST", f"{DB_URL}/rest/v1/rpc/{fn}", args,
                    {"apikey": ANON, "authorization": f"Bearer {self.jwt}", "content-profile": schema, "accept-profile": schema})

    def server(self, path: str, body: dict) -> tuple[int, object, str]:
        return http("POST", f"{SERVER}{path}", body, {"authorization": f"Bearer {self.jwt}", "x-organization-id": ORG})


def _rows(body: object) -> list:
    if isinstance(body, dict):
        for k in ("rows", "records", "items"):
            if isinstance(body.get(k), list):
                return body[k]
    return body if isinstance(body, list) else []


def connect(admin: Seat, fx: dict) -> bool:
    s, b, raw = admin.server("/external-databases/inspect", {"organization_id": ORG, "connection_string": DSN})
    listed = [t for t in (b.get("tables", []) if isinstance(b, dict) else [])
              if t.get("schema_name") == OUTSIDE_SCHEMA and t.get("name") == OUTSIDE_TABLE]
    if not step(["EXT01"], f"inspect lists {OUTSIDE_SCHEMA}.{OUTSIDE_TABLE} with its key", s == 200 and bool(listed) and bool(listed[0]["key"]),
                f"status {s} {raw[:200] if s != 200 else listed[:1]}"):
        return False
    pick = {"organization_id": ORG, "connection_string": DSN, "schema_name": OUTSIDE_SCHEMA, "table_name": OUTSIDE_TABLE}
    s, b, raw = admin.server("/external-databases/tables", pick)
    if not step(["EXT01"], "the picked table lands as a Synced table", s == 200 and isinstance(b, dict) and b.get("rows_inserted", 0) > 0,
                f"status {s} {raw[:300]}"):
        return False
    fx["table"] = b["table_id"]
    fx["rows"] = b["rows_inserted"] + b["rows_updated"]
    s, b, raw = admin.server("/external-databases/refresh", {"organization_id": ORG, "table_id": fx["table"]})
    step(["EXT01"], "Refresh syncs again: nothing added, every row found again",
         s == 200 and isinstance(b, dict) and b.get("rows_inserted") == 0 and b.get("rows_updated") == fx["rows"], f"status {s} {raw[:300]}")
    s, b, raw = admin.rpc("read_records_page", {"p_organization_id": ORG, "p_table_id": fx["table"]})
    rows = _rows(b)
    fx["row_id"] = (rows[0].get("id") if rows else None)
    step(["EXT01"], "the owner reads its rows", s == 200 and bool(rows), f"status {s} rows {len(rows)}")
    return bool(fx["row_id"])


def read_only(admin: Seat, fx: dict) -> None:
    s, b, raw = admin.rpc("record_update", {"p_organization_id": ORG, "p_record_id": fx["row_id"], "p_patch": {"patient_name": "Edited here"}})
    step(["EXT02"], "an edit of an outside column is refused in one sentence",
         s >= 400 and '"42501"' in raw and "synced from outside AI Matrx" in raw, f"status {s} {raw[:300]}")
    s, b, raw = admin.rpc("record_write", {"p_organization_id": ORG, "p_table_id": fx["table"], "p_data": {"patient_name": "Walk-in"}})
    step(["EXT02"], "a new row in the synced table is refused", s >= 400 and '"42501"' in raw, f"status {s} {raw[:300]}")
    spec = {"source": {"provider": "postgres", "external_id": "00000000-0000-4000-8000-000000000000", "tab_id": "scratch.appointments"},
            "table_name": "Forged", "columns": ["Patient name"], "rows": []}
    s, b, raw = admin.rpc("table_sync", {"p_organization_id": ORG, "p_home_id": ORG, "p_spec": spec})
    step(["EXT02"], "an outside-database sync sent from a client is refused", s >= 400 and '"42501"' in raw, f"status {s} {raw[:300]}")
    s, fid, raw = admin.rpc("field_declare", {"p_organization_id": ORG, "p_table_id": fx["table"],
                                              "p_spec": {"key": "front_desk_note", "label": "Front desk note", "type": "text"}})
    ok = s == 200
    if ok:
        s, b, raw = admin.rpc("record_update", {"p_organization_id": ORG, "p_record_id": fx["row_id"],
                                                "p_patch": {"front_desk_note": "Prefers morning slots"}})
        ok = s == 200
    step(["EXT02"], "a column of our own on a synced row is written (REC-N-8)", ok, f"status {s} {raw[:300]}")


def relation(admin: Seat, fx: dict) -> None:
    s, kernel, raw = admin.rpc("person_kernel_id", {})
    s, home, raw = admin.rpc("record_write", {"p_organization_id": ORG, "p_table_id": kernel, "p_data": {"name": f"Outside Visits {STAMP}"}})
    if s != 200:
        step(["EXT03"], "relation fixture", False, f"{s} {raw[:200]}")
        return
    fx["home"] = str(home)
    spec = {"name": f"Visits {STAMP}", "slug": f"ext_visits_{int(time.time() * 1000)}", "type": "entity", "label_singular": "Visit",
            "label_plural": "Visits", "display": "list", "weight": "light", "ordered": False, "row_order": "manual",
            "title_field": "visit", "retention_days": 365, "agent_writable": True,
            "default_sort": [{"field": "visit", "direction": "asc"}], "fields": [{"name": "visit"}], "parent_id": home}
    s, visits, raw = admin.rpc("table_declare", {"p_organization_id": ORG, "p_spec": spec})
    if s != 200:
        step(["EXT03"], "Visits table", False, f"{s} {raw[:200]}")
        return
    fx["visits"] = str(visits)
    s, _, raw = admin.rpc("field_declare", {"p_organization_id": ORG, "p_table_id": visits, "p_spec": {
        "key": "appointment", "label": "Appointment", "type": "relation", "relation_target": fx["table"]}})
    ok = s == 200
    if ok:
        s, _, raw = admin.rpc("record_write", {"p_organization_id": ORG, "p_table_id": visits,
                                               "p_data": {"visit": "Follow-up visit note", "appointment": fx["row_id"]}})
        ok = s == 200
    step(["EXT03"], "a Visits relation points at the synced table and links an appointment", ok, f"status {s} {raw[:300]}")


def make_key(seat: Seat, name: str) -> tuple[str | None, str | None]:
    s, made, _ = seat.rpc("personal_api_key_create", {"p_name": f"{name} {STAMP}", "p_organization_id": ORG}, schema="iam")
    if s != 200 or not isinstance(made, dict):
        return None, None
    SECRETS.append(made["api_key"])
    return made["api_key"], made["id"]


async def mcp_calls(key: str, calls: list[dict]) -> list[tuple[bool, str]]:
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client
    out = []
    async with streamablehttp_client(f"{SERVER}/api/matrx-mcp", headers={"Authorization": f"Bearer {key}", **UA}) as (r_, w_, _):
        async with ClientSession(r_, w_) as sess:
            await sess.initialize()
            for args in calls:
                r = await sess.call_tool("tables", args)
                raw = json.dumps(r.structuredContent) if r.structuredContent else (r.content[0].text if r.content else "")
                for secret in (DSN, PASSWORD):
                    if secret and secret in raw:
                        LEAKS.append(f"MCP tables {args.get('action')}")
                out.append((bool(r.isError), raw))
    return out


def visibility(admin: Seat, member: Seat, fx: dict, member_key: str | None, admin_key: str | None) -> None:
    T = fx["table"]
    s, b, raw = member.rpc("data_home", {"p_organization_id": None, "p_search": None, "p_include_app_tables": True})
    step(["EXT04"], "data home: test@test.com does not meet the table", s == 200 and T not in raw, f"status {s} listed={T in raw}")
    s, b, raw = member.rpc("data_home", {"p_organization_id": None, "p_search": "Appointments", "p_include_app_tables": True})
    step(["EXT04"], "data home search 'Appointments': not found", s == 200 and T not in raw, f"status {s} listed={T in raw}")
    for door, args in (("table_list_everywhere", {"p_organization_id": ORG, "p_include_app_tables": True}),
                       ("tables_i_can_open", {})):
        s, b, raw = member.rpc(door, args)
        step(["EXT04"], f"picker door custom.{door}: not offered", s == 200 and T not in raw, f"status {s} listed={T in raw}")
    s, b, raw = member.rpc("read_records_page", {"p_organization_id": ORG, "p_table_id": T})
    n = len(_rows(b)) if s == 200 else 0
    step(["EXT04"], "read_records_page: 0 rows", n == 0, f"status {s} rows {n}")
    if member_key:
        H = {"authorization": f"Bearer {member_key}", "x-organization-id": ORG}
        s, b, raw = http("GET", f"{SERVER}/api/v1/tables", None, H)
        step(["EXT04"], "REST v1 GET /v1/tables: not listed", s == 200 and T not in raw, f"status {s} listed={T in raw}")
        s, b, raw = http("GET", f"{SERVER}/api/v1/tables/{T}/rows?limit=50", None, H)
        n = len(_rows(b)) if s == 200 else 0
        step(["EXT04"], "REST v1 rows: 0", n == 0, f"status {s} rows {n}")
        try:
            (lerr, lraw), (rerr, rraw) = asyncio.run(mcp_calls(member_key, [
                {"action": "list_tables", "organization_id": ORG},
                {"action": "list_rows", "organization_id": ORG, "table": T, "limit": 50}]))
            step(["EXT04"], "MCP tables.list_tables: not listed", not lerr and T not in lraw, f"error={lerr} listed={T in lraw}")
            try:
                n = len(_rows(json.loads(rraw).get("result", json.loads(rraw)))) if not rerr else 0
            except (ValueError, AttributeError):
                n = 0
            step(["EXT04"], "MCP tables.list_rows: 0", n == 0, f"error={rerr} rows {n}")
        except Exception as e:  # noqa: BLE001
            step(["EXT04"], "MCP as test@test.com", False, f"{type(e).__name__}: {str(e)[:200]}")
    else:
        step(["EXT04"], "personal key for test@test.com", False, "iam.personal_api_key_create refused")
    if admin_key:
        H = {"authorization": f"Bearer {admin_key}", "x-organization-id": ORG}
        s, b, raw = http("GET", f"{SERVER}/api/v1/tables/{T}/rows?limit=200", None, H)
        n = len(_rows(b)) if s == 200 else 0
        step(["EXT05"], "control: the owner reads its rows through REST v1", n == fx["rows"], f"status {s} rows {n} of {fx['rows']}")
        try:
            ((err, raw),) = asyncio.run(mcp_calls(admin_key, [{"action": "list_rows", "organization_id": ORG, "table": T, "limit": 200}]))
            n = len(_rows(json.loads(raw).get("result", json.loads(raw)))) if not err else 0
            step(["EXT05"], "control: the MCP reads the synced table", n == fx["rows"], f"error={err} rows {n}")
        except Exception as e:  # noqa: BLE001
            step(["EXT05"], "MCP as admin", False, f"{type(e).__name__}: {str(e)[:200]}")


def archive(admin: Seat, table: str) -> tuple[bool, str]:
    for _ in range(20):
        s, body, raw = admin.rpc("table_archive", {"p_organization_id": ORG, "p_table_id": table})
        if s != 200:
            return False, f"{s} {raw[:200]}"
        if isinstance(body, dict) and body.get("table_archived"):
            return True, str(body.get("message"))[:160]
    return False, "archive did not finish in 20 chunks"


def main() -> int:
    admin = Seat("AI_ADMIN_USERNAME", "AI_ADMIN_PASSWORD", "admin@admin.com")
    member = Seat("AI_MEMBER_USERNAME", "AI_MEMBER_PASSWORD", "test@test.com")
    fx: dict = {}
    keys: list[tuple[Seat, str]] = []
    try:
        if not connect(admin, fx):
            return 1
        read_only(admin, fx)
        relation(admin, fx)
        s, b, raw = admin.rpc("share_lane_set", {"p_organization_id": ORG, "p_subject_id": fx["table"], "p_choice": "mine"})
        step(["EXT04"], "the owner keeps the table to herself (Only me)", s == 200, f"status {s} {raw[:200]}")
        if PLANT == "grant":
            s, b, raw = admin.rpc("share_grant", {"p_organization_id": ORG, "p_subject_id": fx["table"], "p_principal_kind": "user",
                                                  "p_principal_id": member.user_id, "p_level": "viewer"})
            step([], "PLANT grant: the table is ALSO shared with test@test.com", s == 200, f"status {s} {raw[:200]}")
        member_key, mid = make_key(member, "Synced table check")
        admin_key, aid = make_key(admin, "Synced table control")
        keys = [(member, mid), (admin, aid)]
        visibility(admin, member, fx, member_key, admin_key)
        step(["EXT06"], "the connection string is in no response this probe received", not LEAKS, "; ".join(LEAKS) or "none")
    finally:
        for seat, kid in keys:
            if kid:
                seat.rpc("personal_api_key_revoke", {"p_id": kid}, schema="iam")
        if PLANT == "grant" and fx.get("table"):
            admin.rpc("share_revoke", {"p_organization_id": ORG, "p_subject_id": fx["table"], "p_principal_kind": "user",
                                       "p_principal_id": member.user_id})
        if os.environ.get("SN_EXT_KEEP") != "1":
            for t in (fx.get("visits"), fx.get("table")):
                if t:
                    ok, said = archive(admin, t)
                    step([], f"cleanup: archive {t}", ok, said)
            if fx.get("home"):
                admin.rpc("record_delete", {"p_organization_id": ORG, "p_record_id": fx["home"]})
        (OUT / "external-tables.json").write_text(json.dumps({"walk": "external-tables", "target": TARGET, "plant": PLANT or None,
                                                              "results": results, "log": log}, indent=2, ensure_ascii=False))
    return 0 if all(r["status"] != "FAIL" for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
