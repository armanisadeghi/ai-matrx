"""LANE SAFETY-NET (2026-10-01, chair request) — A12: the agents' DATASET TOOL WRITES one row into a store
table and reads it back, through a REAL agent run.

Why: PB-02's blind BEFORE on live found the dataset tool reads fine but every WRITE fails ("data must be a
dict of field values"); A02 only proves the routing door. A fixer is changing the tool's argument shape in
aidream; until that reaches live this check reads FAIL, and that is the truth.

The chain (admin@admin.com, Cedar Ridge Physical Therapy, everything disposable and archived at the end):
  1. sign in through Supabase auth (password grant) — the seat's own JWT;
  2. make a small custom table "Treatment Room Requests <stamp>" (agent_writable) through the store doors;
  3. run the agent "General Chat (Copy)" (admin's Workspace; it carries the `dataset` tool) through the
     platform's own MCP `agent_run` (the same server path a person's run takes), asking it to add ONE row
     with a unique marker through the dataset tool and to read the table back;
  4. read the table through the store's read door as the seat: the marker row must be there (the deciding
     marker), exactly once;
  5. archive the table (and with it the row).

RED (planted wrong-shape argument): with SN_A12_PLANT=wrong-shape the agent is told to pass the row's
values to the tool as a JSON ARRAY instead of field→value pairs; the tool must refuse, no row lands, and
step 4 FAILs. Plant file: plants/a12-wrong-shape.mjs (mode env).

    SN_TARGET=live uv run --project ../aidream python scripts/safety-net/probes/a12_dataset_write.py
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

CODE = Path(__file__).resolve().parents[4]
TARGET = os.environ.get("SN_TARGET", "live")
OUT = Path(os.environ.get("SN_OUT", str("/tmp/matrx-evidence/2026-10-01/safety-net/adhoc")))
OUT.mkdir(parents=True, exist_ok=True)
STAMP = os.environ.get("SN_STAMP") or datetime.now(ZoneInfo("America/Los_Angeles")).strftime("%b %-d %H%M")
PLANT = os.environ.get("SN_A12_PLANT", "")

ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04"  # Cedar Ridge Physical Therapy
AGENT = os.environ.get("SN_A12_AGENT", "4075cc74-eae8-4885-ad50-963570c30a49")  # General Chat (Copy), carries `dataset`
FORBIDDEN = ("3e790542-fdaf-40b2-8bf3-658bf94fe67f", "c1aabdc0-4d94-42d4-9ddc-91b68ef9c0a7")
UA = {"user-agent": "matrx-safety-net-a12/1.0", "X-Matrx-Agent-Traffic": "safety-net-a12"}  # marker mirrors lib/agent-traffic/marker.ts


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
    import subprocess

    ref = re.search(r"^clone_ref\s*=\s*(\S+)", (CODE / "common-docs/operations/clone/CLONE-REF").read_text(), re.M).group(1)
    shell = subprocess.run(["uv", "run", "python", "scripts/clone/server_env.py", "--shell"], cwd=CODE / "aidream",
                           capture_output=True, text=True, timeout=240).stdout
    cenv = {m.group(1): m.group(2).strip("'\"") for m in re.finditer(r"^export (\w+)=(.*)$", shell, re.M)}
    if "SUPABASE_MATRIX_PUBLISHABLE_KEY" not in cenv:
        raise SystemExit("could not read the clone's keys (aidream: uv run python scripts/clone/server_env.py --check)")
    DB_URL = cenv.get("SUPABASE_MATRIX_URL", f"https://{ref}.supabase.co").rstrip("/")
    ANON = cenv["SUPABASE_MATRIX_PUBLISHABLE_KEY"]
    SERVER = os.environ.get("SN_CLONE_SERVER", "http://localhost:8200/api")
else:
    raise SystemExit("SN_TARGET must be live or clone")
MCP_URL = SERVER + "/matrx-mcp"

results: list[dict] = []
SECRETS: list[str] = []
log: list[str] = []


def redact(text: str) -> str:
    for s in SECRETS:
        if s:
            text = text.replace(s, "<redacted>")
    return text


def step(items: list[str], name: str, ok: bool | None, detail: str) -> bool:
    status = "SKIP" if ok is None else "PASS" if ok else "FAIL"
    results.append({"walk": "a12-dataset-write", "items": items, "step": name, "status": status, "detail": redact(detail)[:600], "ms": 0, "shot": None})
    print(f"{status} [{','.join(items)}] {name} — {redact(detail)[:300]}", flush=True)
    return bool(ok)


def http(method: str, url: str, body=None, headers: dict | None = None) -> tuple[int, object]:
    if any(b in url or (body and b in json.dumps(body)) for b in FORBIDDEN):
        raise SystemExit("refused: a call names Arman's organization or table")
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers={"content-type": "application/json", **UA, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:  # noqa: S310
            raw, status = r.read().decode() or "null", r.status
    except urllib.error.HTTPError as e:
        raw, status = e.read().decode() or "null", e.code
    try:
        parsed = json.loads(raw)
    except ValueError:
        parsed = raw
    log.append(redact(f"{method} {url.replace(DB_URL, '{db}').replace(SERVER, '{server}')} -> {status} {json.dumps(parsed)[:800]}"))
    return status, parsed


def sign_in() -> str:
    if ENV.get("AI_ADMIN_USERNAME") != "admin@admin.com":
        raise SystemExit("refused: the admin seat is not admin@admin.com")
    SECRETS.append(ENV["AI_ADMIN_PASSWORD"])
    status, body = http("POST", f"{DB_URL}/auth/v1/token?grant_type=password", {"email": ENV["AI_ADMIN_USERNAME"], "password": ENV["AI_ADMIN_PASSWORD"]}, {"apikey": ANON})
    if status != 200:
        raise SystemExit(f"sign-in failed: {status}")
    SECRETS.append(body["access_token"])
    return body["access_token"]


def rpc(jwt: str, fn: str, args: dict, schema: str = "custom") -> tuple[int, object]:
    return http("POST", f"{DB_URL}/rest/v1/rpc/{fn}", args, {"apikey": ANON, "authorization": f"Bearer {jwt}", "content-profile": schema, "accept-profile": schema})


def make_table(jwt: str) -> str:
    s, kernel = rpc(jwt, "person_kernel_id", {})
    assert s == 200, ("person_kernel_id", s, kernel)
    s, home = rpc(jwt, "record_write", {"p_organization_id": ORG, "p_table_id": kernel, "p_data": {"name": f"Treatment Room Requests {STAMP} Home"}})
    assert s == 200, ("home", s, home)
    spec = {"name": f"Treatment Room Requests {STAMP}", "slug": f"treatment_room_requests_{int(time.time())}", "type": "entity",
            "label_singular": "Room request", "label_plural": f"Treatment Room Requests {STAMP}", "display": "list", "weight": "light",
            "ordered": False, "row_order": "manual", "title_field": "room", "retention_days": 365, "agent_writable": True,
            "default_sort": [{"field": "room", "direction": "asc"}], "fields": [{"name": "room"}, {"name": "notes"}], "parent_id": home}
    s, table = rpc(jwt, "table_declare", {"p_organization_id": ORG, "p_spec": spec})
    assert s == 200, ("table_declare", s, table)
    for f in ({"key": "room", "label": "Room", "type": "text"}, {"key": "notes", "label": "Notes", "type": "text"}):
        s, fid = rpc(jwt, "field_declare", {"p_organization_id": ORG, "p_table_id": table, "p_spec": f})
        assert s == 200, ("field_declare", f["key"], s, fid)
    s, rid = rpc(jwt, "record_write", {"p_organization_id": ORG, "p_table_id": table, "p_data": {"room": "Therapy Gym A", "notes": "Seed row"}})
    assert s == 200, ("seed", s, rid)
    return str(table)


def rows_with(jwt: str, table: str, marker: str) -> tuple[int, int]:
    s, body = rpc(jwt, "read_records", {"p_organization_id": ORG, "p_table_id": table})
    text = json.dumps(body, ensure_ascii=False)
    return s, text.count(marker)


def run_agent(jwt: str, message: str) -> tuple[bool, str]:
    """The real agent run: POST /ai/agents/{id} on the server (the route a person's chat run takes),
    as the seat, in Cedar Ridge; the NDJSON stream is read to its end."""
    base = SERVER.removesuffix("/api")
    url = f"{base}/ai/agents/{AGENT}"
    import uuid

    body = {"user_input": message, "organization_id": ORG, "stream": True, "conversation_id": str(uuid.uuid4()), "is_new": True, "store": True}
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"content-type": "application/json", "authorization": f"Bearer {jwt}", "x-organization-id": ORG, **UA})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:  # noqa: S310
            raw, status = r.read().decode(errors="replace"), r.status
    except urllib.error.HTTPError as e:
        raw, status = e.read().decode(errors="replace"), e.code
    (OUT / "a12-agent-stream.ndjson").write_text(redact(raw))
    events = []
    for line in raw.splitlines():
        try:
            events.append(json.loads(line))
        except ValueError:
            pass
    tool_events = [e for e in events if "tool" in json.dumps(e)[:400].lower() and "dataset" in json.dumps(e).lower()]
    errors = [e for e in events if str(e.get("event", e.get("type", ""))).lower() in ("error",)]
    text = "".join(str((e.get("data") or {}).get("content", "")) for e in events if isinstance(e.get("data"), dict) and e.get("event") in ("chunk", "text", "content"))
    summary = f"HTTP {status}; {len(events)} events; dataset tool events {len(tool_events)}; errors {len(errors)}; " + (json.dumps(errors[-1])[:300] if errors else "") + f" text: {text[:200]}"
    log.append(redact(f"POST {{server}}/ai/agents/{AGENT} -> {summary}"))
    # The tool's own answer: applied, or held for a person (approval_id) — the store's agent-change rule.
    results_ = [e["data"]["data"].get("result") for e in events if e.get("event") == "tool_event" and isinstance(e.get("data"), dict)
                and e["data"].get("event") == "tool_completed" and e["data"].get("tool_name") == "dataset"]
    RUN["tool_results"] = [r for r in results_ if isinstance(r, dict)]
    RUN["tool_errors"] = [{"message": e["data"].get("message"), "arguments": None} for e in events if e.get("event") == "tool_event"
                          and isinstance(e.get("data"), dict) and e["data"].get("event") == "tool_error" and e["data"].get("tool_name") == "dataset"]
    return status == 200 and not errors, summary


RUN: dict = {}


def main() -> int:
    jwt = sign_in()
    marker = f"Hydrotherapy Pool {STAMP}"
    table = None
    try:
        try:
            table = make_table(jwt)
            step(["A12"], "make a custom table in Cedar Ridge (agent-writable)", True, f"table {table}")
        except AssertionError as e:
            step(["A12"], "make a custom table in Cedar Ridge (agent-writable)", False, f"refused: {e}")
            return 1
        shape = ("Pass the row's values to the tool as a JSON ARRAY of strings, e.g. [\"" + marker + "\", \"Lift chair serviced Sept 30\"], never as named fields."
                 if PLANT == "wrong-shape" else "")
        message = (f"Use the dataset tool to add exactly one new row to the table with id {table} in organization {ORG}: "
                   f"Room = \"{marker}\", Notes = \"Lift chair serviced Sept 30\". {shape} "
                   f"Then read that table back with the dataset tool and reply with the new row's Room exactly as stored.")
        ok, text = run_agent(jwt, message)
        step(["A12"], "a real agent run with the dataset tool", ok, f"agent {AGENT}; answer: {text[:400]}")
        # A custom table that existed before the run asks a person first (the organization's agent-change
        # rule, default "Ask"): the seat approves the held write through the same door the chat card uses.
        writes = [r for r in RUN.get("tool_results", []) if r.get("action") in ("record_write", "add_rows", "update_row")]
        held = [r for r in writes if r.get("awaiting_approval") and r.get("approval_id")]
        refused = [r for r in RUN.get("tool_results", []) if r.get("error") or r.get("success") is False]
        refused = refused + RUN.get("tool_errors", [])
        step(["A12"], "the dataset tool took the write (applied, or held for a person)", bool(writes),
             f"{len(writes)} write answers, {len(held)} held for approval; tool errors on the way: {json.dumps(refused)[:300] if refused else 'none'}")
        approve = PLANT != "approval-refused"  # the plant: the seat REFUSES the held write, so nothing may land
        for h in held:
            s, body = rpc(jwt, "work_approval_decide", {"p_organization_id": ORG, "p_approval_id": h["approval_id"], "p_approve": approve, "p_note": None})
            step(["A12"], "the seat approves the held write" if approve else "PLANT: the seat refuses the held write", s == 200, f"{s} {json.dumps(body)[:200]}")
        s, n = rows_with(jwt, table, marker)
        step(["A12"], "the row the agent wrote is in the custom table, exactly once (read back as the seat)", s == 200 and n == 1,
             f"read door {s}; marker rows {n}" + ("" if n == 1 else f"; the agent said: {text[:300]}"))
        # The second half of a write: CHANGE that row through the tool (PB-02 saw every change refused with
        # "data must be a dict of field values").
        note2 = f"Pool reopened {STAMP}"
        RUN.clear()
        ok2, text2 = run_agent(jwt, f"Use the dataset tool to update the existing row whose Room is \"{marker}\" in the table with id {table} "
                                    f"(organization {ORG}): set Notes to \"{note2}\". Change only that field of that row. {shape}")
        changes = [r for r in RUN.get("tool_results", []) if isinstance(r, dict)]
        bad = [r for r in changes if r.get("error") or r.get("success") is False or "must be a dict" in json.dumps(r)] + RUN.get("tool_errors", [])
        step(["A12"], "a second agent run changes that row through the dataset tool", ok2 and bool(changes) and not bad,
             f"{len(changes)} tool answers, {len(RUN.get('tool_errors', []))} tool errors; refusals: {json.dumps(bad)[:400] if bad else 'none'}")
        for h in [r for r in changes if r.get("awaiting_approval") and r.get("approval_id")]:
            s, body = rpc(jwt, "work_approval_decide", {"p_organization_id": ORG, "p_approval_id": h["approval_id"], "p_approve": True, "p_note": None})
            step(["A12"], "the seat approves the held change", s == 200, f"{s} {json.dumps(body)[:200]}")
        s, n2 = rows_with(jwt, table, note2)
        step(["A12"], "the changed value is in the custom table (read back as the seat)", s == 200 and n2 == 1, f"read door {s}; rows with the new Notes {n2}")
    finally:
        if table:
            s, body = rpc(jwt, "table_archive", {"p_organization_id": ORG, "p_table_id": table})
            step([], "cleanup: archive the table (and its rows)", s == 200, f"{s} {json.dumps(body)[:160]}")
        (OUT / "a12-dataset-write.json").write_text(json.dumps({"walk": "a12-dataset-write", "target": TARGET, "plant": PLANT or None, "results": results, "log": log}, indent=2))
    return 0 if all(r["status"] != "FAIL" for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
