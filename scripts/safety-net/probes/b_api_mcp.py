"""LANE SAFETY-NET-B (2026-10-01) — the agents / API / MCP half of the switch-hour safety net.

ONE probe, the same on LIVE and on the CLONE, run BEFORE and AFTER the final switch press:

    cd matrx-frontend
    SN_TARGET=live  SN_OUT=<dir> uv run --project ../aidream python scripts/safety-net/probes/b_api_mcp.py
    SN_TARGET=clone SN_OUT=<dir> uv run --project ../aidream python scripts/safety-net/probes/b_api_mcp.py
    ... --compare <earlier b-api-mcp.json>    # the AFTER run: every signature must equal the BEFORE one

(The runner does this: `node scripts/safety-net/run-b.mjs --target live|clone`.)

What it proves, per organization — the SWITCHING one (admin's Workspace, pressed by the final switch)
and the CONTROL (Cedar Ridge Physical Therapy, already switched):
  A06 REST v1 with a PERSONAL KEY: list tables, columns, create, get, update (version), archive, restore.
  A10 Idempotency-Key: a replay answers the first answer and says so; the same key with another body is refused.
  A07 AI Matrx MCP with the personal key: list_tables, list_rows, create_row (idempotency_key), archive_row.
  A08 AI Matrx MCP with the person's sign-in token (the bearer an OAuth sign-in hands the client).
  A09 Refusals: test@test.com (a member, viewer on the fixture) writing is refused in a person's words;
      a call naming an organization the caller is not in is refused; a revoked key is refused.
  A01 The variable-binding preview (what "Fill automatically" → a table delivers to an agent's Run):
      working in admin's Workspace, a binding to a table in Cedar Ridge reads the marker row.
  A11 Same before and after: every step writes a SIGNATURE (status + the shape that matters); --compare
      diffs them. Plus, on admin's Workspace, a READ PARITY check: an older table's live rows == what
      REST v1 lists for its same-id copy (the copy a program reads before the press is current).

Fixtures (realistic, stamped, archived at the end through the store's own door, even on failure):
  Cedar Ridge  — "Front Desk Callbacks <stamp>"  (Patient, Status [Waiting, Called back], Callback date, Minutes)
  admin's Ws   — "Supply Reorders <stamp>"       (Item, Status [To order, Ordered], Needed by, Quantity)
Never Arman's account, organization or table. The personal key is created through iam.personal_api_key_create
as admin@admin.com, kept in memory only, revoked in `finally`. Keys and passwords are never printed or written.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

CODE = Path(__file__).resolve().parents[4]
TARGET = os.environ.get("SN_TARGET", "clone")
OUT = Path(os.environ.get("SN_OUT", str(CODE / "common-docs/operations/for-arman/2026-10-01/safety-net/adhoc")))
OUT.mkdir(parents=True, exist_ok=True)
STAMP = os.environ.get("SN_STAMP") or datetime.now(ZoneInfo("America/Los_Angeles")).strftime("%b %-d %H%M")
COMPARE = sys.argv[sys.argv.index("--compare") + 1] if "--compare" in sys.argv else (os.environ.get("SN_B_BEFORE_API") or None)

ADMIN_ID = "87a6e699-3622-4869-8843-d0867456c0dd"
SWITCHING = {"key": "switching", "id": "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f", "name": "admin's Workspace"}
CONTROL = {"key": "control", "id": "0a54df90-eab8-4d07-ab29-81a45fb41e04", "name": "Cedar Ridge Physical Therapy"}
NOT_A_MEMBER_OF = "d3138341-5359-455e-8b27-70d538ec05f1"  # Maxwell's Org: neither admin@admin.com nor test@test.com is a member (read 2026-10-01)
FORBIDDEN = {"3e790542-fdaf-40b2-8bf3-658bf94fe67f", "c1aabdc0-4d94-42d4-9ddc-91b68ef9c0a7"}
# Developer words a person must never read in a refusal (store door names, register codes, sqlstates).
DEV_WORDS = re.compile(r"\b(custom|iam|platform|workbench|public)\.[a-z_]+|\bDOOR-\d+|\bREC-\d+|\bFLD-\d+|sqlstate|\bP0001\b|\b42501\b", re.I)


def _env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if path.exists():
        for line in path.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                out.setdefault(k.strip().removeprefix("export ").strip(), v.strip().strip('"').strip("'"))
    return out


ENV = {**_env_file(CODE / "aidream/.env"), **_env_file(CODE / "matrx-frontend/.env.local")}
if TARGET == "live":
    DB_URL, SERVER = "https://db.matrxserver.com", "https://server.app.matrxserver.com/api"
    ANON = ENV["SUPABASE_MATRIX_PUBLISHABLE_KEY"]
elif TARGET == "clone":
    ref = re.search(r"^clone_ref\s*=\s*(\S+)", (CODE / "common-docs/operations/clone/CLONE-REF").read_text(), re.M).group(1)
    clone_env: dict[str, str] = {}
    for _ in range(4):  # the clone's API-key lookup is slow when the clone is busy; ask again before refusing
        shell = subprocess.run(["uv", "run", "python", "scripts/clone/server_env.py", "--shell"], cwd=CODE / "aidream",
                               capture_output=True, text=True, timeout=180).stdout
        clone_env = {m.group(1): m.group(2).strip("'\"") for m in re.finditer(r"^export (\w+)=(.*)$", shell, re.M)}
        if "SUPABASE_MATRIX_PUBLISHABLE_KEY" in clone_env:
            break
        time.sleep(10)
    if "SUPABASE_MATRIX_PUBLISHABLE_KEY" not in clone_env:
        raise SystemExit("could not read the clone's keys (aidream: uv run python scripts/clone/server_env.py --check)")
    DB_URL = clone_env.get("SUPABASE_MATRIX_URL", f"https://{ref}.supabase.co").rstrip("/")
    ANON = clone_env["SUPABASE_MATRIX_PUBLISHABLE_KEY"]
    SERVER = os.environ.get("SN_CLONE_SERVER", "http://localhost:8200/api")
    if ref not in DB_URL:
        raise SystemExit(f"refused: the clone env does not name the current clone {ref}")
    with urllib.request.urlopen(SERVER.removesuffix("/api") + "/health/database-identity", timeout=10) as r:  # noqa: S310
        pairing = json.loads(r.read() or b"{}")
    if pairing.get("database_project_ref") != ref:
        raise SystemExit(f"refused: the local server is not paired with the clone {ref}: {pairing}")
else:
    raise SystemExit("SN_TARGET must be live or clone")
MCP_URL = SERVER + "/matrx-mcp"
UA = {"user-agent": "matrx-safety-net-b/1.0"}

results: list[dict] = []
signatures: dict[str, object] = {}
bodies: list[str] = []
SECRETS: list[str] = []


def redact(text: str) -> str:
    for s in SECRETS:
        if s:
            text = text.replace(s, "<redacted>")
    return re.sub(r"mx_live_[A-Za-z0-9_]+", "mx_live_<redacted>", text)


def step(items: list[str], name: str, ok: bool | None, detail: str, sig: object = None) -> bool:
    status = "SKIP" if ok is None else "PASS" if ok else "FAIL"
    results.append({"step": name, "items": items, "status": status, "detail": redact(detail)[:600]})
    if sig is not None:
        signatures[name] = sig
    print(f"[{status}] {name}: {redact(detail)[:240]}", flush=True)
    return bool(ok)


def http(method: str, url: str, body=None, headers: dict | None = None) -> tuple[int, object, dict]:
    for bad in FORBIDDEN:
        if bad in url or (body and bad in json.dumps(body)):
            raise SystemExit("refused: a call names Arman's organization or table")
    data = None if body is None else json.dumps(body).encode()
    for attempt in range(24):
        req = urllib.request.Request(url, data=data, method=method, headers={"content-type": "application/json", **UA, **(headers or {})})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:  # noqa: S310
                raw = r.read().decode() or "null"
                status, hdrs = r.status, dict(r.headers)
        except urllib.error.HTTPError as e:
            raw = e.read().decode() or "null"
            status, hdrs = e.code, dict(e.headers)
        # PostgREST reloading its schema cache (PGRST002) answers 503 and says "Retrying": wait and ask again, said in the log.
        if status == 503 and ("PGRST00" in raw or "schema cache" in raw) and attempt < 23:
            bodies.append(f"(503 PGRST002 on {method} {url.split('?')[0].replace(DB_URL, '{db}')}; retry {attempt + 1} in 8 s)")
            time.sleep(8)
            continue
        break
    try:
        parsed = json.loads(raw)
    except ValueError:
        parsed = raw
    bodies.append(redact(f"{method} {url.replace(SERVER, '{server}').replace(DB_URL, '{db}')}\n  -> {status} {json.dumps(parsed)[:1500]}"))
    return status, parsed, hdrs


def sign_in(seat: str) -> str:
    user, pw = ("AI_ADMIN_USERNAME", "AI_ADMIN_PASSWORD") if seat == "admin" else ("AI_MEMBER_USERNAME", "AI_MEMBER_PASSWORD")
    if ENV.get(user) not in ("admin@admin.com", "test@test.com"):
        raise SystemExit(f"refused: the {seat} seat resolves to an account this lane may not use")
    SECRETS.append(ENV[pw])
    status, body, _ = http("POST", f"{DB_URL}/auth/v1/token?grant_type=password", {"email": ENV[user], "password": ENV[pw]}, {"apikey": ANON})
    if status != 200:
        raise SystemExit(f"sign-in failed for the {seat} seat: {status}")
    SECRETS.append(body["access_token"])
    return body["access_token"]


def rpc(jwt: str, schema: str, fn: str, args: dict) -> tuple[int, object]:
    status, body, _ = http("POST", f"{DB_URL}/rest/v1/rpc/{fn}", args,
                           {"apikey": ANON, "authorization": f"Bearer {jwt}", "content-profile": schema, "accept-profile": schema})
    return status, body


def api(token: str, method: str, path: str, body=None, org: str | None = None, idem: str | None = None) -> tuple[int, object, dict]:
    h = {"authorization": f"Bearer {token}"}
    if org:
        h["x-organization-id"] = org
    if idem:
        h["idempotency-key"] = idem
    return http(method, f"{SERVER}/v1/tables{path}", body, h)


def msg(body: object) -> str:
    """The sentence a person reads (ApiError.message; the MCP's says)."""
    if isinstance(body, dict):
        d = body.get("detail") if isinstance(body.get("detail"), dict) else body
        return str(d.get("message") or d.get("says") or d.get("error") or json.dumps(body)[:300])
    return str(body)[:300]


def hint(body: object) -> str:
    if isinstance(body, dict):
        d = body.get("detail") if isinstance(body.get("detail"), dict) else body
        return str(d.get("hint") or "")
    return ""


# ── fixtures ────────────────────────────────────────────────────────────────────────────────
FIXTURES = {
    "control": {
        "name": f"Front Desk Callbacks {STAMP}", "slug": f"front_desk_callbacks_{STAMP.replace(' ', '_').lower()}",
        "single": "Callback", "title": "patient",
        "fields": [
            {"key": "patient", "label": "Patient", "type": "text", "sort": 1, "required": True},
            {"key": "status", "label": "Status", "type": "select", "sort": 2, "options": ["Waiting", "Called back"]},
            {"key": "callback_date", "label": "Callback date", "type": "datetime", "kind": "datetime", "sort": 3},
            {"key": "minutes", "label": "Minutes", "type": "number", "sort": 4},
        ],
        "seed": [{"patient": "Marisol Ortega — knee follow-up", "status": "Waiting", "callback_date": "2026-10-02", "minutes": 10}],
        "marker": "Marisol Ortega — knee follow-up",
        "row": {"Patient": "Devon Pike — shoulder re-eval", "Status": "Waiting", "Minutes": 15},
        "row2": {"Patient": "Devon Pike — shoulder re-eval", "Status": "Called back", "Minutes": 20},
    },
    "switching": {
        "name": f"Supply Reorders {STAMP}", "slug": f"supply_reorders_{STAMP.replace(' ', '_').lower()}",
        "single": "Reorder", "title": "item",
        "fields": [
            {"key": "item", "label": "Item", "type": "text", "sort": 1, "required": True},
            {"key": "status", "label": "Status", "type": "select", "sort": 2, "options": ["To order", "Ordered"]},
            {"key": "needed_by", "label": "Needed by", "type": "datetime", "kind": "datetime", "sort": 3},
            {"key": "quantity", "label": "Quantity", "type": "number", "sort": 4},
        ],
        "seed": [{"item": "Nitrile gloves, medium (box of 100)", "status": "To order", "needed_by": "2026-10-06", "quantity": 12}],
        "marker": "Nitrile gloves, medium (box of 100)",
        "row": {"Item": "Copper fittings 1/2 in. (bag of 25)", "Status": "To order", "Quantity": 4},
        "row2": {"Item": "Copper fittings 1/2 in. (bag of 25)", "Status": "Ordered", "Quantity": 6},
    },
}


def make_table(jwt: str, org: dict, spec: dict, made: dict) -> str:
    status, kernel = rpc(jwt, "custom", "person_kernel_id", {})
    assert status == 200, ("person_kernel_id", status, kernel)
    status, home = rpc(jwt, "custom", "record_write", {"p_organization_id": org["id"], "p_table_id": kernel, "p_data": {"name": f"{spec['name']} Home"}})
    assert status == 200, ("home", status, home)
    tspec = {"name": spec["name"], "slug": spec["slug"], "type": "entity", "label_singular": spec["single"],
             "label_plural": spec["name"], "display": "list", "weight": "light", "ordered": False, "row_order": "manual",
             "title_field": spec["title"], "retention_days": 365, "agent_writable": True,
             "default_sort": [{"field": spec["title"], "direction": "asc"}], "fields": [{"name": f["key"]} for f in spec["fields"]],
             "parent_id": home}
    status, table = rpc(jwt, "custom", "table_declare", {"p_organization_id": org["id"], "p_spec": tspec})
    assert status == 200, ("table_declare", status, table)
    made[org["key"]] = str(table)  # archived in `finally` even if a column below is refused
    for f in spec["fields"]:
        status, fid = rpc(jwt, "custom", "field_declare", {"p_organization_id": org["id"], "p_table_id": table, "p_spec": f})
        assert status == 200, ("field_declare", f["label"], status, fid)
    for row in spec["seed"]:
        status, rid = rpc(jwt, "custom", "record_write", {"p_organization_id": org["id"], "p_table_id": table, "p_data": row})
        assert status == 200, ("seed", status, rid)
    return str(table)


def archive_table(jwt: str, org: dict, table: str) -> str:
    status, body = rpc(jwt, "custom", "table_archive", {"p_organization_id": org["id"], "p_table_id": table})
    return f"{status} {json.dumps(body)[:200]}"


# ── the REST half ───────────────────────────────────────────────────────────────────────────
def rest_half(key: str, org: dict, table: str, spec: dict) -> None:
    k = org["key"]
    s, b, _ = api(key, "GET", "", org=org["id"])
    names = [t.get("name") for t in (b.get("tables") if isinstance(b, dict) else []) or []]
    step(["A06"], f"{k}.rest.list_tables", s == 200 and spec["name"] in names,
         f"{s}; {len(names)} tables; fixture listed={spec['name'] in names}", {"status": s, "fixture_listed": spec["name"] in names})
    s, b, _ = api(key, "GET", f"/{table}/columns", org=org["id"])
    cols = [c.get("name") for c in (b.get("columns") if isinstance(b, dict) else []) or []]
    want = [f["label"] for f in spec["fields"]]
    step(["A06"], f"{k}.rest.columns", s == 200 and all(w in cols for w in want), f"{s}; columns {cols}", {"status": s, "columns": sorted(c for c in cols if c in want)})
    idem = f"sn-b-{k}-{STAMP.replace(' ', '')}-{int(time.time())}"
    s, b, h = api(key, "POST", f"/{table}/rows", {"values": spec["row"]}, org=org["id"], idem=idem)
    row_id = (b.get("row") or {}).get("id") if isinstance(b, dict) else None
    version = (b.get("row") or {}).get("version") if isinstance(b, dict) else None
    step(["A06"], f"{k}.rest.create_row", s == 201 and bool(row_id), f"{s}; row {row_id} v{version}", {"status": s, "made": bool(row_id)})
    s2, b2, h2 = api(key, "POST", f"/{table}/rows", {"values": spec["row"]}, org=org["id"], idem=idem)
    replay_id = (b2.get("row") or {}).get("id") if isinstance(b2, dict) else None
    replayed = isinstance(b2, dict) and b2.get("replayed") is True and str(h2.get("Idempotent-Replayed", h2.get("idempotent-replayed", ""))).lower() == "true"
    step(["A10"], f"{k}.rest.idempotent_replay", s2 in (200, 201) and replay_id == row_id and replayed,
         f"{s2}; same row={replay_id == row_id}; replayed body+header={replayed}", {"status": s2, "same_row": replay_id == row_id, "replayed": replayed})
    s3, b3, _ = api(key, "POST", f"/{table}/rows", {"values": spec["row2"]}, org=org["id"], idem=idem)
    step(["A10"], f"{k}.rest.idempotency_conflict", s3 == 422 and "idempotency" in json.dumps(b3).lower(),
         f"{s3}; {msg(b3)}", {"status": s3})
    if not row_id:
        return
    s, b, _ = api(key, "GET", f"/{table}/rows/{row_id}", org=org["id"])
    got = (b.get("values") or (b.get("row") or {}).get("values") or {}) if isinstance(b, dict) else {}
    title = next(iter(spec["row"].values()))
    step(["A06"], f"{k}.rest.get_row", s == 200 and title in json.dumps(got, ensure_ascii=False), f"{s}; values {json.dumps(got)[:200]}", {"status": s, "title_back": title in json.dumps(got, ensure_ascii=False)})
    s, b, _ = api(key, "PATCH", f"/{table}/rows/{row_id}", {"values": spec["row2"], "expected_version": version}, org=org["id"], idem=idem + "-u")
    step(["A06"], f"{k}.rest.update_row", s == 200, f"{s}; {json.dumps(b)[:200]}", {"status": s})
    s, b, _ = api(key, "PATCH", f"/{table}/rows/{row_id}", {"values": spec["row"], "expected_version": version}, org=org["id"])
    step(["A06", "A09"], f"{k}.rest.stale_version_refused", s == 409 and not DEV_WORDS.search(msg(b)), f"{s}; {msg(b)}", {"status": s})
    s, b, _ = api(key, "DELETE", f"/{table}/rows/{row_id}", org=org["id"], idem=idem + "-a")
    step(["A06"], f"{k}.rest.archive_row", s == 200, f"{s}; {json.dumps(b)[:200]}", {"status": s})
    s, b, _ = api(key, "POST", f"/{table}/rows/{row_id}/restore", org=org["id"], idem=idem + "-r")
    step(["A06"], f"{k}.rest.restore_row", s == 200, f"{s}; {json.dumps(b)[:200]}", {"status": s})
    api(key, "DELETE", f"/{table}/rows/{row_id}", org=org["id"], idem=idem + "-a2")


def read_parity(key: str, admin_jwt: str) -> None:
    """admin's Workspace: an older table's live rows == what REST lists for its same-id copy (a program reads
    a current copy before the press, and the same rows after it)."""
    s, tables = rpc(admin_jwt, "custom", "table_list_everywhere", {"p_organization_id": SWITCHING["id"]})
    s, b, _ = api(key, "GET", "", org=SWITCHING["id"])
    listed = {t.get("id"): t for t in (b.get("tables") if isinstance(b, dict) else []) or []}
    # The older tables the press moves are named by readiness on live; here, by the copies REST lists that were made by the mover.
    probe = [tid for tid in ("494df967-eb2a-4829-af4f-7ccd4a64ce91", "415c3e23-2f90-4c66-9040-b246fa1c4b36") if tid in listed]
    if not probe:
        step(["A11"], "switching.read_parity", None, "neither probe table is listed in admin's Workspace on this target")
        return
    for tid in probe:
        s, b, _ = api(key, "GET", f"/{tid}/rows?limit=200", org=SWITCHING["id"])
        total = b.get("total") if isinstance(b, dict) else None
        n = len(b.get("rows") or []) if isinstance(b, dict) else None
        step(["A11", "A06"], f"switching.read_parity.{listed[tid].get('name')}", s == 200 and n is not None,
             f"{s}; REST lists {n} rows (total {total})", {"status": s, "rows": n})


# ── the MCP half ────────────────────────────────────────────────────────────────────────────
async def mcp_half(token: str, label: str, org: dict, table: str, spec: dict) -> None:
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client

    k = org["key"]
    items = ["A07"] if label == "key" else ["A08"]
    try:
        async with streamablehttp_client(MCP_URL, headers={"Authorization": f"Bearer {token}", **UA}) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                tools = [t.name for t in (await session.list_tools()).tools]

                async def call(**args):
                    args.setdefault("organization_id", org["id"])
                    r = await session.call_tool("tables", args)
                    body = r.structuredContent or (json.loads(r.content[0].text) if r.content and r.content[0].text.strip().startswith(("{", "[")) else {"text": r.content[0].text if r.content else ""})
                    body = body.get("result", body) if isinstance(body, dict) else body
                    bodies.append(redact(f"MCP[{label}] tables {json.dumps({x: y for x, y in args.items() if x != 'organization_id'})[:300]}\n  -> {json.dumps(body)[:1200]}"))
                    return body, bool(getattr(r, "isError", False))

                listed, err = await call(action="list_tables")
                names = [t.get("name") for t in (listed.get("tables") or [])] if isinstance(listed, dict) else []
                step(items, f"{k}.mcp_{label}.list_tables", "tables" in tools and not err and spec["name"] in names,
                     f"tools {tools}; fixture listed={spec['name'] in names}", {"listed": spec["name"] in names})
                page, err = await call(action="list_rows", table=table)
                rows = page.get("rows") or [] if isinstance(page, dict) else []
                marker = spec["marker"]
                step(items, f"{k}.mcp_{label}.list_rows", not err and marker in json.dumps(rows, ensure_ascii=False), f"{len(rows)} rows; marker read={marker in json.dumps(rows, ensure_ascii=False)}", {"marker": marker in json.dumps(rows, ensure_ascii=False)})
                idem = f"sn-b-mcp-{label}-{k}-{int(time.time())}"
                made, err = await call(action="create_row", table=table, values=spec["row"], idempotency_key=idem)
                rid = ((made.get("row") or {}).get("id") if isinstance(made, dict) else None)
                held = isinstance(made, dict) and (made.get("done") is False or "approval" in json.dumps(made).lower())
                step(items + ["A10"], f"{k}.mcp_{label}.create_row", not err and (bool(rid) or held),
                     f"row {rid}; held for approval={held}; {json.dumps(made)[:200]}", {"made_or_held": bool(rid) or held, "held": held})
                if rid:
                    again, err2 = await call(action="create_row", table=table, values=spec["row"], idempotency_key=idem)
                    rid2 = ((again.get("row") or {}).get("id") if isinstance(again, dict) else None)
                    step(["A10"], f"{k}.mcp_{label}.idempotent_replay", not err2 and rid2 == rid and isinstance(again, dict) and again.get("replayed") is True,
                         f"same row={rid2 == rid}; replayed={isinstance(again, dict) and again.get('replayed')}", {"same_row": rid2 == rid})
                    arch, err3 = await call(action="archive_row", table=table, row_id=rid)
                    step(items, f"{k}.mcp_{label}.archive_row", not err3, json.dumps(arch)[:200], {"ok": not err3})
    except Exception as e:  # noqa: BLE001 — a transport failure is the finding, said plainly
        step(items, f"{k}.mcp_{label}.session", False, f"{type(e).__name__}: {e}")


# ── the binding preview (A01) ───────────────────────────────────────────────────────────────
def binding_preview(admin_jwt: str, table: str, marker: str) -> None:
    binding = {"kind": "merge_field", "source": "record", "semantic_type": "collection", "table_id": table, "limit": 20, "missing": "absent"}
    s, b, _ = http("POST", f"{SERVER}/agents/variable-bindings/preview",
                   {"organization_id": SWITCHING["id"], "binding": binding, "variable_name": "front_desk_callbacks"},
                   {"authorization": f"Bearer {admin_jwt}", "x-organization-id": SWITCHING["id"]})
    text = (b.get("text") or "") if isinstance(b, dict) else ""
    present = isinstance(b, dict) and b.get("present") is True
    step(["A01"], "binding.cross_org_preview", s == 200 and present and marker in text,
         f"{s}; working in admin's Workspace, table in Cedar Ridge: present={present}, marker in text={marker in text}; outcome={b.get('outcome') if isinstance(b, dict) else b}",
         {"status": s, "present": present, "marker": marker in text})


# ── refusals (A09) ──────────────────────────────────────────────────────────────────────────
def refusals(member_jwt: str, key: str, table: str, spec: dict) -> None:
    s, b, _ = api(member_jwt, "POST", f"/{table}/rows", {"values": spec["row"]}, org=CONTROL["id"])
    words = msg(b)
    step(["A09"], "control.member_write_refused", s in (403, 404) and bool(words), f"{s}; {words}", {"status": s})
    step(["A09"], "control.member_refusal_is_peoples_words", s in (403, 404) and not DEV_WORDS.search(words),
         (f"developer words in the sentence: {DEV_WORDS.findall(words)} — {words[:200]}" if DEV_WORDS.search(words) else f"plain: {words[:200]}")
         + (f" · hint: {hint(b)[:160]}" if hint(b) else ""), {"plain": not DEV_WORDS.search(words)})
    # An organization the caller is not in: refused by name (table_api FEATURE: 400 organization_forbidden), never ignored.
    s, b, _ = api(member_jwt, "GET", "", org=NOT_A_MEMBER_OF)
    step(["A09"], "outsider.list_naming_a_foreign_org_refused", s in (400, 403) and not DEV_WORDS.search(msg(b)),
         f"{s}; {msg(b)[:200]}" + (f"; answered organization_id={b.get('organization_id')!r}" if isinstance(b, dict) and s == 200 else ""), {"status": s})
    s, b, _ = api(key, "POST", f"/{table}/rows", {"values": spec["row"]}, org=NOT_A_MEMBER_OF)
    step(["A09"], "outsider.write_naming_a_foreign_org_refused", s in (400, 403), f"{s}; {msg(b)[:200]}", {"status": s})
    if s in (200, 201) and isinstance(b, dict) and (b.get("row") or {}).get("id"):
        api(key, "DELETE", f"/{table}/rows/{b['row']['id']}", org=CONTROL["id"])


async def main() -> int:
    admin = sign_in("admin")
    member = sign_in("member")
    key_id = None
    tables: dict[str, str] = {}
    try:
        s, made = rpc(admin, "iam", "personal_api_key_create", {"p_name": f"Safety net B {STAMP}", "p_organization_id": SWITCHING["id"]})
        api_key = made.get("api_key") if isinstance(made, dict) else None
        key_id = made.get("id") if isinstance(made, dict) else None
        if api_key:
            SECRETS.append(api_key)
        if not step(["A06"], "key.created", s == 200 and bool(api_key), f"{s}; key id {key_id}" + ("" if s == 200 else f"; {json.dumps(made)[:300]}")):
            return write_out()
        for org in (CONTROL, SWITCHING):
            make_table(admin, org, FIXTURES[org["key"]], tables)
            step([], f"{org['key']}.fixture", True, f"{FIXTURES[org['key']]['name']} = {tables[org['key']]} in {org['name']}")
        for org in (CONTROL, SWITCHING):
            rest_half(api_key, org, tables[org["key"]], FIXTURES[org["key"]])
            await mcp_half(api_key, "key", org, tables[org["key"]], FIXTURES[org["key"]])
            await mcp_half(admin, "signin", org, tables[org["key"]], FIXTURES[org["key"]])
        read_parity(api_key, admin)
        binding_preview(admin, tables["control"], FIXTURES["control"]["marker"])
        refusals(member, api_key, tables["control"], FIXTURES["control"])
    finally:
        for org in (CONTROL, SWITCHING):
            if org["key"] in tables:
                step([], f"{org['key']}.fixture_archived", None, archive_table(admin, org, tables[org["key"]]))
        if key_id:
            s, b = rpc(admin, "iam", "personal_api_key_revoke", {"p_id": key_id})
            step([], "key.revoked", s == 200, f"{s}")
            if s == 200 and SECRETS:
                ss, bb, _ = api([x for x in SECRETS if x.startswith("mx_")][0] if any(x.startswith("mx_") for x in SECRETS) else "", "GET", "", org=SWITCHING["id"])
                step(["A09"], "key.revoked_key_refused", ss == 401 and not DEV_WORDS.search(msg(bb)), f"{ss}; {msg(bb)}", {"status": ss})

    return write_out()


def write_out() -> int:
    if COMPARE:
        before = json.loads(Path(COMPARE).read_text()).get("signatures", {})
        for name, sig in before.items():
            now = signatures.get(name)
            step(["A11"], f"same_as_before.{name}", now == sig, f"before {json.dumps(sig)} · now {json.dumps(now)}")
    (OUT / "b-api-mcp.json").write_text(json.dumps({"target": TARGET, "stamp": STAMP, "at": datetime.now(ZoneInfo("UTC")).isoformat(),
                                                    "results": results, "signatures": signatures}, indent=2))
    (OUT / "b-api-mcp-bodies.txt").write_text("\n\n".join(bodies))
    fails = [r for r in results if r["status"] == "FAIL"]
    print(f"\nb_api_mcp: {sum(r['status'] == 'PASS' for r in results)} pass · {len(fails)} fail · {sum(r['status'] == 'SKIP' for r in results)} skip → {OUT / 'b-api-mcp.json'}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
