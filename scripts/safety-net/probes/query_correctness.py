"""LANE 5 VISION-REACH (2026-10-02) — `query-correctness`: ten questions about one clinic's visit copays,
each answered three ways and held to a number written down BEFORE the run.

The defect it exists for (production, 2026-10-01, conversation 19a178ed-…): asked for "the sum of the
Expected copay total column across all records", the chat agent answered $640 — one row — when the
truth was $1,440. The chain, read back out of chat.tool_call:
  1. the `records` tool's `record_aggregate` takes no filter, so the model's `match` was stripped by the
     executor's flattened-variant recovery and the COUNT came back unfiltered (5, not 1);
  2. `record_aggregate` sum over `expected_copay_total` came back NULL in every bucket — the field is a
     FORMULA (`compute_on: read`) and custom.agg_sql sums the STORED `r.data`, where a formula has no
     value; nothing in the answer said so;
  3. the model then read the rows into the prompt (`record_read`, a page of ≤200) and added them up
     itself, and answered the filtered sum as the total.

THE THREE ANSWERS PER QUESTION
  * truth  — a literal below, worked out by hand from the seed (never computed by the code under test);
  * door   — the store's aggregate door called DIRECTLY as the seat: `custom.record_aggregate` over
             PostgREST with the seat's own JWT (rollup / as-of questions use the query door that owns
             them; the door's answer is reduced to the question's one number by plain arithmetic here);
  * ask    — the SAME path the chat agent uses today: the `records` agent tool
             (`matrx_records.agent.tool.records`, the function the executor calls), run IN-PROCESS as the
             seat, with the arguments a model needs for that question. Its arguments are the contract this
             guard assumes the tool will speak (ASK_ARGS below); when the tool cannot express a question it
             FAILS here, because in production the model then falls back to reading rows into its prompt.

A question PASSES only when ask == truth AND door == truth. Red today on the $640 class (Q1: a formula
summed through the door is NULL), on every question the tool cannot express (filter, as-of, roll-up,
top-N by a measure), and wherever the door itself is wrong.

WHAT THIS DOES NOT COVER (said plainly): it does not run the language model. It proves the tool and the
doors can give the right number; whether a model PICKS that call is not deterministic and is not graded
here. `SN_QC_LLM=1` adds one real agent run of Q1 (through the server, as the admin seat, against the
agent that carries only `records`) whose answer is printed as INFO, never graded.

Seat: test@test.com (a MEMBER of Cedar Ridge Physical Therapy) asks; admin@admin.com (owner) builds the
disposable tables, hides one visit from members ("Only me") and restricts one column, then archives both
tables at the end.

    SN_TARGET=live uv run --project ../aidream python scripts/safety-net/probes/query_correctness.py
    node scripts/safety-net/run.mjs --target live --only query.correctness

SELF-TEST (planted breaks, in memory, never on disk): query_correctness_selftest.py beside this file runs
this probe three times — sound with pages of 5 (all PASS), a one-page total (Q04 RED), a dropped filter
(Q03/Q05/Q06 RED). Green since VISION-REACH W2 (2026-10-02), when the door learned to measure a formula
column and a measure's `order`, and the tool learned match / as_of / bucket / order / related_to.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

CODE = Path(__file__).resolve().parents[4]
TARGET = os.environ.get("SN_TARGET", "live")
OUT = Path(os.environ.get("SN_OUT", str(CODE / "common-docs/operations/for-arman/2026-10-02/query-correctness/adhoc")))
OUT.mkdir(parents=True, exist_ok=True)
STAMP = os.environ.get("SN_STAMP") or datetime.now(ZoneInfo("America/Los_Angeles")).strftime("%b %-d %H%M")
LLM = os.environ.get("SN_QC_LLM") == "1"

ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04"  # Cedar Ridge Physical Therapy
RECORDS_AGENT = os.environ.get("SN_QC_AGENT", "517d0d6e-fa38-4cd7-8df9-9abdd925c236")  # admin's agent carrying only `records`
FORBIDDEN = ("3e790542-fdaf-40b2-8bf3-658bf94fe67f", "c1aabdc0-4d94-42d4-9ddc-91b68ef9c0a7")
UA = {"user-agent": "matrx-safety-net-query-correctness/1.0"}


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
    DB_URL, SERVER = "https://db.matrxserver.com", "https://server.app.matrxserver.com"
    ANON = ENV["SUPABASE_MATRIX_PUBLISHABLE_KEY"]
    # W27: the in-process tool reaches production on the SESSION pooler only, never 6543.
    os.environ["SUPABASE_MATRIX_PORT"] = os.environ.get("SN_LIVE_SESSION_PORT", "5432")
elif TARGET == "clone":
    import subprocess

    shell = subprocess.run(["uv", "run", "python", "scripts/clone/server_env.py", "--shell"], cwd=CODE / "aidream",
                           capture_output=True, text=True, timeout=240).stdout
    cenv = {m.group(1): m.group(2).strip("'\"") for m in re.finditer(r"^export (\w+)=(.*)$", shell, re.M)}
    if "SUPABASE_MATRIX_PUBLISHABLE_KEY" not in cenv:
        raise SystemExit("could not read the clone's keys (aidream: uv run python scripts/clone/server_env.py --check)")
    os.environ.update(cenv)
    DB_URL = cenv["SUPABASE_MATRIX_URL"].rstrip("/")
    ANON = cenv["SUPABASE_MATRIX_PUBLISHABLE_KEY"]
    SERVER = os.environ.get("SN_CLONE_SERVER", "http://localhost:8200")
else:
    raise SystemExit("SN_TARGET must be live or clone")

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
    results.append({"walk": "query-correctness", "items": items, "step": name, "status": status,
                    "detail": redact(detail)[:900], "ms": 0, "shot": None})
    print(f"{status} [{','.join(items)}] {name} — {redact(detail)[:600]}", flush=True)
    return bool(ok)


def http(method: str, url: str, body=None, headers: dict | None = None, timeout: int = 120) -> tuple[int, object]:
    if any(b in url or (body and b in json.dumps(body)) for b in FORBIDDEN):
        raise SystemExit("refused: a call names Arman's organization or table")
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers={"content-type": "application/json", **UA, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310
            raw, status = r.read().decode() or "null", r.status
    except urllib.error.HTTPError as e:
        raw, status = e.read().decode() or "null", e.code
    try:
        parsed = json.loads(raw)
    except ValueError:
        parsed = raw
    log.append(redact(f"{method} {url.replace(DB_URL, '{db}').replace(SERVER, '{server}')} {json.dumps(body)[:300] if body else ''} -> {status} {json.dumps(parsed)[:700]}"))
    return status, parsed


class Seat:
    def __init__(self, email_key: str, password_key: str, expected_email: str):
        self.email = ENV.get(email_key)
        if self.email != expected_email:
            raise SystemExit(f"refused: {email_key} is not {expected_email}")
        SECRETS.append(ENV[password_key])
        s, body = http("POST", f"{DB_URL}/auth/v1/token?grant_type=password",
                       {"email": self.email, "password": ENV[password_key]}, {"apikey": ANON})
        if s != 200:
            raise SystemExit(f"sign-in failed for {expected_email}: {s}")
        self.jwt = body["access_token"]
        self.user_id = body["user"]["id"]
        SECRETS.append(self.jwt)

    def rpc(self, fn: str, args: dict, schema: str = "custom") -> tuple[int, object]:
        return http("POST", f"{DB_URL}/rest/v1/rpc/{fn}", args,
                    {"apikey": ANON, "authorization": f"Bearer {self.jwt}", "content-profile": schema, "accept-profile": schema})


# ── THE SEED — Cedar Ridge's visit copays for the week of Sep 28. Every truth below is worked from it by hand.
PATIENTS = [  # key, name, referring physician
    ("margaret", "Margaret Ellison", "Dr. Alicia Moreno"),
    ("daniel", "Daniel Reyes", "Dr. Samuel Okafor"),
    ("hannah", "Hannah Brooks", "Dr. Samuel Okafor"),
    ("tomas", "Tomás Vega", "Dr. Alicia Moreno"),
    ("rosa", "Rosa Delgado", "Dr. Priya Shah"),
    ("priya", "Priya Natarajan", "Dr. Priya Shah"),
]
# visit title, patient key, date, status, copay, sessions authorized, write-off (restricted column)
VISITS = [
    ("Margaret Ellison — knee TKA rehab, visit 4", "margaret", "2026-09-28", "Completed", 35, 12, None),
    ("Daniel Reyes — rotator cuff repair, eval", "daniel", "2026-09-28", "Insurance check", 40, 16, None),
    ("Hannah Brooks — chronic low back pain, visit 2", "hannah", "2026-09-28", "Scheduled", 25, 8, None),
    ("Tomás Vega — ankle sprain grade II, visit 3", "tomas", "2026-09-29", "Completed", 30, 6, None),  # copay edited to 32 after T0
    ("Rosa Delgado — plantar fasciitis, eval", "rosa", "2026-09-29", "No-show", 0, 10, 35),
    ("Margaret Ellison — knee TKA rehab, visit 5", "margaret", "2026-09-30", "Completed", 35, 12, None),
    ("Daniel Reyes — rotator cuff repair, visit 2", "daniel", "2026-09-30", "Scheduled", 40, 16, None),
    ("Priya Natarajan — post-op ACL, visit 6", "priya", "2026-10-01", "Completed", 45, 10, 20),
    ("Hannah Brooks — chronic low back pain, visit 3", "hannah", "2026-10-01", "No-show", 25, 8, 25),
    # The visit a member may not see: the owner set it to "Only me".
    ("Tomás Vega — ankle sprain grade II, visit 4", "tomas", "2026-10-02", "Insurance check", 30, 6, None),
]
HIDDEN_VISIT = 9
EDITED_VISIT, EDIT_FROM, EDIT_TO = 3, 30, 32

# THE TEN QUESTIONS, as the member (test@test.com) sees the table — nine visits, Tomás's visit 3 at $32.
# Hand-worked; the comment under each shows the arithmetic.
TRUTH = {
    "Q1": 3162,
    # expected copay total = copay × sessions: 420+640+200+192+0+420+640+450+200 = 3162 (the $640 class)
    "Q2": {"Completed": 4, "Insurance check": 1, "Scheduled": 2, "No-show": 2},
    "Q3": 147,  # copay where status = Completed: 35+32+35+45
    "Q4": 275,  # copay total as of T0 (before the 30 → 32 edit): 35+40+25+30+0+35+40+45+25
    "Q5": 130,  # roll-up: copay across the visits of patients Dr. Samuel Okafor referred (Daniel 40+40, Hannah 25+25)
    "Q6": 0,  # visits with status Cancelled: none — an empty answer, never an error and never a total
    "Q7": "withheld",  # sum of Write-off, a restricted column: a member gets the withheld state, never a number
    "Q8": 9,  # how many visits: 9 for a member (the 10th is "Only me")
    "Q9": {"2026-09-28": 3, "2026-09-29": 2, "2026-09-30": 2, "2026-10-01": 2},  # visits per day
    "Q10": [("Daniel Reyes", 80), ("Margaret Ellison", 70), ("Hannah Brooks", 50), ("Priya Natarajan", 45), ("Tomás Vega", 32)],
    # top 5 patients by copay; Rosa ($0) is sixth
}
QUESTIONS = {
    "Q1": "What is the Expected copay total across all visits?",
    "Q2": "How many visits are there in each status?",
    "Q3": "What is the total copay of Completed visits?",
    "Q4": "What was the total copay before this morning's correction (as of T0)?",
    "Q5": "What is the total copay across the visits of patients Dr. Samuel Okafor referred?",
    "Q6": "What is the total copay of Cancelled visits?",
    "Q7": "What is the total Write-off?",
    "Q8": "How many visits are there?",
    "Q9": "How many visits were there each day?",
    "Q10": "Which five patients have the highest total copay?",
}


def item_id(q: str) -> str:
    """Q1 → Q01: the safety-net coverage item the question proves (scripts/safety-net/checks.mjs)."""
    return f"Q{int(q[1:]):02d}"


ITEM_IDS = [item_id(q) for q in TRUTH]


def _assert_truth_matches_seed() -> None:
    """The literals above must agree with the seed — a typo in either is caught before any door is asked."""
    seen = [v for i, v in enumerate(VISITS) if i != HIDDEN_VISIT]
    copay = [EDIT_TO if VISITS.index(v) == EDITED_VISIT else v[4] for v in seen]
    assert sum(c * v[5] for c, v in zip(copay, seen)) == TRUTH["Q1"]
    assert sum(c for c, v in zip(copay, seen) if v[3] == "Completed") == TRUTH["Q3"]
    assert sum(v[4] for v in seen) == TRUTH["Q4"]
    assert len(seen) == TRUTH["Q8"]


# ── FIXTURE (admin@admin.com, through the store's own doors) ─────────────────────────────────────────────
def make_tables(admin: Seat, fx: dict) -> dict:
    """Fills `fx` as it goes, so a refusal half way still leaves the caller every table to archive."""
    fx.setdefault("tables", [])
    s, kernel = admin.rpc("person_kernel_id", {})
    assert s == 200, ("person_kernel_id", s, kernel)
    s, home = admin.rpc("record_write", {"p_organization_id": ORG, "p_table_id": kernel, "p_data": {"name": f"Copay Review {STAMP}"}})
    assert s == 200, ("home", s, home)
    fx["home"] = str(home)

    def declare(name: str, single: str, slug: str, title: str, fields: list[dict]) -> str:
        spec = {"name": name, "slug": f"{slug}_{int(time.time() * 1000)}", "type": "entity", "label_singular": single,
                "label_plural": name, "display": "list", "weight": "light", "ordered": False, "row_order": "manual",
                "title_field": title, "retention_days": 365, "agent_writable": True,
                "default_sort": [{"field": title, "direction": "asc"}], "fields": [{"name": title}], "parent_id": home}
        s, table = admin.rpc("table_declare", {"p_organization_id": ORG, "p_spec": spec})
        assert s == 200, ("table_declare", name, s, table)
        fx["tables"].append(str(table))
        fx.setdefault("field_ids", {})
        for f in fields:
            s, fid = admin.rpc("field_declare", {"p_organization_id": ORG, "p_table_id": table, "p_spec": f})
            assert s == 200, ("field_declare", name, f["key"], s, fid)
            fx["field_ids"][f["key"]] = fid
        return str(table)

    fx["patients"] = declare(f"Patients {STAMP}", "Patient", "qc_patients", "name", [
        {"key": "name", "label": "Name", "type": "text"},
        {"key": "referring_physician", "label": "Referring physician", "type": "text"},
    ])
    fx["visits"] = declare(f"Visit Copays {STAMP}", "Visit", "qc_visit_copays", "visit", [
        {"key": "visit", "label": "Visit", "type": "text"},
        {"key": "patient", "label": "Patient", "type": "relation", "relation_target": fx["patients"]},
        {"key": "visit_date", "label": "Visit date", "type": "datetime", "config": {"kind": "date"}},
        {"key": "status", "label": "Status", "type": "text"},
        {"key": "copay", "label": "Copay", "type": "currency", "unit": "USD"},
        {"key": "sessions_authorized", "label": "Sessions authorized", "type": "number"},
        {"key": "expected_copay_total", "label": "Expected copay total", "type": "formula",
         "formula_text": "{Copay} * {Sessions authorized}"},
        {"key": "write_off", "label": "Write-off", "type": "currency", "unit": "USD", "sensitivity": "restricted"},
    ])
    fx["patient_ids"] = {}
    for key, name, doc in PATIENTS:
        s, rid = admin.rpc("record_write", {"p_organization_id": ORG, "p_table_id": fx["patients"],
                                            "p_data": {"name": name, "referring_physician": doc}})
        assert s == 200, ("patient", name, s, rid)
        fx["patient_ids"][key] = str(rid)
    fx["visit_ids"] = []
    for title, pkey, day, status, copay, sessions, write_off in VISITS:
        data = {"visit": title, "patient": fx["patient_ids"][pkey], "visit_date": day, "status": status,
                "copay": copay, "sessions_authorized": sessions}
        if write_off is not None:
            data["write_off"] = write_off
        s, rid = admin.rpc("record_write", {"p_organization_id": ORG, "p_table_id": fx["visits"], "p_data": data})
        assert s == 200, ("visit", title, s, rid)
        fx["visit_ids"].append(str(rid))
    s, body = admin.rpc("share_lane_set", {"p_organization_id": ORG, "p_subject_id": fx["visit_ids"][HIDDEN_VISIT], "p_choice": "mine"})
    assert s == 200, ("share_lane_set mine", s, body)
    return fx


def edit_after_t0(admin: Seat, fx: dict) -> str:
    time.sleep(2)
    t0 = datetime.now(timezone.utc).isoformat()
    time.sleep(2)
    rid = fx["visit_ids"][EDITED_VISIT]
    s, body = admin.rpc("record_update", {"p_organization_id": ORG, "p_record_id": rid, "p_patch": {"copay": EDIT_TO}})
    assert s == 200, ("record_update", s, body)
    return t0


# ── THE DOOR — the store's aggregate door, called directly as the member over PostgREST ─────────────────
def _agg(seat: Seat, table: str, measures: list, *, group_by=None, filt=None, bucket=None, limit=200):
    s, body = seat.rpc("record_aggregate", {"p_organization_id": ORG, "p_table_id": table, "p_group_by": group_by or [],
                                            "p_measures": measures, "p_bucket": bucket, "p_filter": filt or {}, "p_limit": limit})
    if s != 200:
        return {"refused": f"{s} {json.dumps(body)[:300]}"}
    return body


def _one(rows, name):
    if isinstance(rows, dict):
        return rows
    if not rows:
        return None
    m = rows[0].get("measures") or {}
    if name in (m.get("_withheld") or {}):
        return "withheld"
    return m.get(name)


def _num(v):
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return v


def door_answers(member: Seat, fx: dict) -> dict:
    V, F = fx["visits"], fx["field_ids"]
    names = {pid: name for (key, name, _), pid in zip(PATIENTS, [fx["patient_ids"][k] for k, _, _ in PATIENTS])}
    out: dict = {}
    out["Q1"] = _num(_one(_agg(member, V, [{"op": "sum", "key": "expected_copay_total"}]), "sum_expected_copay_total"))
    rows = _agg(member, V, [{"op": "count"}], group_by=["status"])
    out["Q2"] = rows if isinstance(rows, dict) else {r["groups"]["status"]: r["measures"]["count"] for r in rows}
    out["Q3"] = _num(_one(_agg(member, V, [{"op": "sum", "key": "copay"}], filt={"status": "Completed"}), "sum_copay"))
    # As of T0: the as-of door is a PAGE of rows (custom.query_table_as_of); this guard adds the page up.
    s, page = member.rpc("query_table_as_of", {"p_organization_id": ORG, "p_table_id": V, "p_recorded_at": fx["t0"], "p_limit": 200})
    out["Q4"] = _num(sum(float((r.get("data") or {}).get("copay") or 0) for r in page)) if s == 200 else {"refused": s}
    # Roll-up across the relation, in the two calls the store needs today: Okafor's patients, then the visits that point at them.
    s, pts = member.rpc("read_records", {"p_organization_id": ORG, "p_table_id": fx["patients"]})
    okafor = [p["id"] for p in (pts if s == 200 else []) if (p.get("document") or {}).get("referring_physician") == "Dr. Samuel Okafor"]
    rule = {"op": "or", "args": [{"op": "eq", "args": [{"field": F["patient"]}, {"const": pid}]} for pid in okafor]}
    out["Q5"] = _num(_one(_agg(member, V, [{"op": "sum", "key": "copay"}], filt=rule), "sum_copay")) if okafor else {"refused": "no Okafor patients read"}
    rows = _agg(member, V, [{"op": "count"}], filt={"status": "Cancelled"})
    out["Q6"] = rows if isinstance(rows, dict) else (_num(rows[0]["row_count"]) if rows else 0.0)
    out["Q7"] = _one(_agg(member, V, [{"op": "sum", "key": "write_off"}]), "sum_write_off")
    out["Q8"] = _num(_one(_agg(member, V, [{"op": "count"}]), "count"))
    rows = _agg(member, V, [{"op": "count"}], group_by=["visit_date"])
    out["Q9"] = rows if isinstance(rows, dict) else {r["groups"]["visit_date"]: r["measures"]["count"] for r in rows}
    # Top N BY THE MEASURE: the door's `order` on the measure (VISION-REACH W2); without it the door
    # orders groups by row count, which is a different question.
    rows = _agg(member, V, [{"op": "sum", "key": "copay", "order": "desc"}], group_by=["patient"], limit=5)
    out["Q10"] = rows if isinstance(rows, dict) else [(names.get(r["groups"]["patient"], r["groups"]["patient"]), _num(r["measures"]["sum_copay"])) for r in rows]
    return out


# ── ASK — the `records` agent tool, IN-PROCESS, as the member: the function the executor calls for a chat ──
# THE CONTRACT THIS GUARD ASSUMES the tool speaks (the fix may rename an argument: change it HERE only).
#   filter  — `match`, the word `record_read` already uses (field label → value; a label "Patient.Referring
#             physician" reaches across a relation);  as_of — `as_of` (ISO moment, the system clock);
#   order   — `order: "measure_desc"` for top-N by the measured value.
def ask_args(fx: dict) -> dict:
    V = fx["visits"]
    base = {"action": "record_aggregate", "table_id": V}
    return {
        "Q1": {**base, "measure": "sum", "field_key": "Expected copay total"},
        "Q2": {**base, "measure": "count", "group_by": "Status"},
        "Q3": {**base, "measure": "sum", "field_key": "Copay", "match": {"Status": "Completed"}},
        "Q4": {**base, "measure": "sum", "field_key": "Copay", "as_of": fx["t0"]},
        "Q5": {**base, "measure": "sum", "field_key": "Copay", "match": {"Patient.Referring physician": "Dr. Samuel Okafor"}},
        "Q6": {**base, "measure": "count", "match": {"Status": "Cancelled"}},
        "Q7": {**base, "measure": "sum", "field_key": "Write-off"},
        "Q8": {**base, "measure": "count"},
        "Q9": {**base, "measure": "count", "group_by": "Visit date"},
        "Q10": {**base, "measure": "sum", "field_key": "Copay", "group_by": "Patient", "limit": 5, "order": "measure_desc"},
    }


async def _ask_all(member: Seat, fx: dict) -> dict:
    from matrx_connect.context.app_context import AppContext, clear_app_context, set_app_context
    from matrx_orm import register_platform_db
    from matrx_records import configure_records
    from matrx_records.agent.tool import records

    # The five SUPABASE_MATRIX_* values for this target, in THIS process only (live: port already forced to the
    # session pooler above; the clone: its own values came from scripts/clone/server_env.py).
    for k in ("USER", "PASSWORD", "HOST", "DATABASE_NAME"):
        os.environ.setdefault(f"SUPABASE_MATRIX_{k}", ENV.get(f"SUPABASE_MATRIX_{k}", ""))
    os.environ.setdefault("SUPABASE_MATRIX_SSL", "require")
    from matrx_orm.core.config import get_all_database_project_names

    if "matrx_records_query_correctness" not in (get_all_database_project_names() or []):
        register_platform_db("matrx_records_query_correctness", additional_schemas=["custom", "platform", "iam", "history", "auth"],
                             pool_min=1, pool_max=2, package="safety-net query-correctness")
    configure_records(database="matrx_records_query_correctness")

    class _Quiet:
        async def emit(self, *a, **k):
            return None

    class _Ctx:
        call_id = "query-correctness"

    token = set_app_context(AppContext(emitter=_Quiet(), user_id=member.user_id, email=member.email, auth_type="token",
                                       is_authenticated=True, organization_id=ORG, token=member.jwt))
    out: dict = {}
    try:
        for q, args in ask_args(fx).items():
            res = await records(dict(args), _Ctx())
            out[q] = {"success": bool(getattr(res, "success", False)), "output": getattr(res, "output", None),
                      "error": (res.error.message if getattr(res, "error", None) else None)}
    finally:
        clear_app_context(token)
    return out


def ask_value(q: str, r: dict, fx: dict):
    """Reduce the tool's answer to the question's one value — a refusal stays a refusal, never a number."""
    if not r["success"]:
        return {"refused": (r["error"] or "")[:240]}
    buckets = (r["output"] or {}).get("buckets") or []
    names = {fx["patient_ids"][k]: n for k, n, _ in PATIENTS}

    def measure(b):
        m = b.get("measure") or {}
        if any(k == "_withheld" for k in m):
            return "withheld"
        vals = [v for k, v in m.items() if k != "_withheld"]
        return _num(vals[0]) if vals else None

    if q in ("Q2", "Q9"):
        return {str(b.get("bucket")): measure(b) for b in buckets}
    if q == "Q10":
        return [(names.get(str(b.get("bucket")), b.get("bucket")), measure(b)) for b in buckets]
    if q == "Q6":
        return _num(buckets[0].get("row_count")) if buckets else 0.0
    if q == "Q7":
        m = (buckets[0].get("measure") or {}) if buckets else {}
        return "withheld" if "_withheld" in m else _num(m.get("sum_write_off"))
    return measure(buckets[0]) if buckets else None


def same(q: str, got, want) -> bool:
    if isinstance(got, dict) and "refused" in got:
        return False
    if q in ("Q2", "Q9"):
        return isinstance(got, dict) and {str(k): _num(v) for k, v in got.items()} == {k: _num(v) for k, v in want.items()}
    if q == "Q10":
        return isinstance(got, list) and [(n, _num(v)) for n, v in got] == [(n, _num(v)) for n, v in want]
    if q == "Q7":
        return got == "withheld"
    return _num(got) == _num(want)


# ── OPTIONAL: one real chat run of Q1 (INFO only — a model's choice is not graded) ─────────────────────────
def llm_q1(admin: Seat, fx: dict) -> str:
    body = {"user_input": f"In the table with id {fx['visits']} (Cedar Ridge Physical Therapy), what is the sum of the "
                          f"Expected copay total column across all records?", "organization_id": ORG, "stream": True,
            "conversation_id": str(uuid.uuid4()), "is_new": True, "store": True}
    req = urllib.request.Request(f"{SERVER}/ai/agents/{RECORDS_AGENT}", data=json.dumps(body).encode(), method="POST",
                                 headers={"content-type": "application/json", "authorization": f"Bearer {admin.jwt}", "x-organization-id": ORG, **UA})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:  # noqa: S310
            raw = r.read().decode(errors="replace")
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
    (OUT / "query-correctness-llm-q1.ndjson").write_text(redact(raw))
    text = ""
    for line in raw.splitlines():
        try:
            e = json.loads(line)
        except ValueError:
            continue
        d = e.get("data") if isinstance(e, dict) else None
        if isinstance(d, dict) and e.get("event") == "completion":
            text = str((d.get("result") or {}).get("output") or "")
    # The admin (owner) also sees the "Only me" visit: 3162 + 30 × 6.
    return f"conversation {body['conversation_id']}; owner's truth {TRUTH['Q1'] + 180}; answer: {text.strip()[:500]}"


def archive(admin: Seat, table: str) -> tuple[bool, str]:
    for _ in range(20):
        s, body = admin.rpc("table_archive", {"p_organization_id": ORG, "p_table_id": table})
        if s != 200:
            return False, f"{s} {json.dumps(body)[:200]}"
        if isinstance(body, dict) and body.get("table_archived"):
            return True, str(body.get("message"))[:160]
    return False, "archive did not finish in 20 chunks"


def main() -> int:
    _assert_truth_matches_seed()
    admin = Seat("AI_ADMIN_USERNAME", "AI_ADMIN_PASSWORD", "admin@admin.com")
    member = Seat("AI_MEMBER_USERNAME", "AI_MEMBER_PASSWORD", "test@test.com")
    fx: dict = {}
    try:
        try:
            make_tables(admin, fx)
            fx["t0"] = edit_after_t0(admin, fx)
            step(ITEM_IDS, "fixture: Patients + Visit Copays in Cedar Ridge, one visit 'Only me', one restricted column, one edit after T0",
                 True, f"visits {fx['visits']}; patients {fx['patients']}; T0 {fx['t0']}")
        except AssertionError as e:
            step(ITEM_IDS, "fixture", False, f"refused: {e}")
            return 1
        door = door_answers(member, fx)
        # THE GRID'S SUMMARY BAR asks the same door in ONE call for several measures of the column
        # (@ai-matrx/records client.recordAggregate: p_group_by [], p_measures [...], p_filter {}).
        # Hand-worked from the seed: 420, 640, 200, 192, 0, 420, 640, 450, 200 -> sum 3162, min 0,
        # max 640, average 351.33.
        bar = _agg(member, fx["visits"], [{"op": op, "key": "expected_copay_total"} for op in ("sum", "min", "max", "avg")])
        m = (bar[0].get("measures") or {}) if isinstance(bar, list) and bar else {}
        got = {k: _num(m.get(f"{k}_expected_copay_total")) for k in ("sum", "min", "max", "avg")}
        ok = got["sum"] == 3162 and got["min"] == 0 and got["max"] == 640 and got["avg"] is not None and round(got["avg"], 2) == 351.33
        step(["Q01"], "Q1b the grid summary bar's sum / min / max / average of the formula column, in one call", ok,
             f"truth sum 3162 min 0 max 640 avg 351.33 | door {json.dumps(got)}")
        ask = asyncio.run(_ask_all(member, fx))
        for q in TRUTH:
            want, got_door, got_ask = TRUTH[q], door[q], ask_value(q, ask[q], fx)
            ok_door, ok_ask = same(q, got_door, want), same(q, got_ask, want)
            step([item_id(q)], f"{q} {QUESTIONS[q]}", ok_door and ok_ask,
                 f"truth {json.dumps(want, ensure_ascii=False)} | door {json.dumps(got_door, ensure_ascii=False, default=str)} "
                 f"{'OK' if ok_door else 'WRONG'} | ask {json.dumps(got_ask, ensure_ascii=False, default=str)} {'OK' if ok_ask else 'WRONG'}")
        if LLM:
            step([], "INFO real chat run of Q1 (not graded)", None, llm_q1(admin, fx))
    finally:
        for t in reversed(fx.get("tables", [])):
            ok, said = archive(admin, t)
            step([], f"cleanup: archive {t}", ok, said)
        if fx.get("home"):
            s, body = admin.rpc("record_delete", {"p_organization_id": ORG, "p_record_id": fx["home"]})
            step([], "cleanup: archive the home", s == 200, f"{s} {json.dumps(body)[:120]}")
        (OUT / "query-correctness.json").write_text(json.dumps({"walk": "query-correctness", "target": TARGET, "results": results,
                                                                 "log": log}, indent=2, ensure_ascii=False))
    return 0 if all(r["status"] != "FAIL" for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
