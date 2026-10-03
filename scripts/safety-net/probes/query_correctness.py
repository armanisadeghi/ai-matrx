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
here. `SN_QC_LLM=1` adds one real agent run of Q1 (through the server, as the MEMBER seat, against the
agent a member on a table page actually gets — whatever `ambient.page_guidance` resolves to for her; override
with SN_QC_AGENT). Graded: that agent's run reaches the `records` tool (red when the agent loses the tool —
2026-10-02, the earlier default 517d0d6e, admin's "Untitled Agent", lost it to the INTEGRATION lane's
records_only_the_agents_that_chose_it_carry_it and the leg answered without it). The answer is INFO.

Seat: test@test.com (a MEMBER of Cedar Ridge Physical Therapy) asks; admin@admin.com (owner) builds the
disposable tables, hides one visit from members ("Only me") and restricts one column, then archives both
tables at the end.

    SN_TARGET=live uv run --project ../aidream python scripts/safety-net/probes/query_correctness.py
    node scripts/safety-net/run.mjs --target live --only query.correctness

AND FIVE MORE (VISION-REACH W2 verifier findings, 2026-10-02):
  Q11 related_to — the copay of Daniel's and Hannah's visits named by the PATIENT ids (tool `related_to`): 130.
      Red before: the tool raised `TypeError: Object of type UUID is not JSON serializable`, and behind it
      the roll-up door walked outward from the patients and answered 0.
  Q12 a cut group list says so — Q10 (top 5 of 6 patients) carries truncated + groups_total 6, tool AND REST.
  Q13 the roll-up door never answers 0 from a walk that missed the field — `custom.query_rollup_sum` with the
      patients as roots is REFUSED (detail `rollup_field_not_reached:copay`), not 0.
  Q14 REST v1 with a personal key (test@test.com's own, made through `iam.personal_api_key_create`, held in
      memory, revoked in `finally`): `POST /v1/tables/<id>/aggregate` answers Q1–Q11 exactly.
  Q15 the AI Matrx MCP `tables` tool, action `aggregate`, with the same key: Q1–Q11 exactly.
  REST/MCP go to SN_QC_SERVER (default: the target's server), so a build without the door is red there.

AND TWO MORE (VISION-REACH W2 B1, 2026-10-03):
  Q17 a related row named by its NAME — `match {"Patient": "Daniel Reyes"}`: 80, tool + REST + MCP. Red before:
      a relation cell stores an id, the name was compared with ids, and every door answered a silent 0.
  Q18 groups of a relation column carry each related row's `name` (tool buckets, REST groups) — before, the
      model read each patient back (4 more calls) to say who the top patients were.

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
#: The chat agent for the LLM leg: an explicit override, else the one the PRODUCT gives a member on a table page.
RECORDS_AGENT = os.environ.get("SN_QC_AGENT") or None
TABLE_PAGE_MANDATE = "ambient.page_guidance"  # /data-v2/<table> is not a mapped module, so the system ambient rung answers
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
# The patient a member may not see: no visits, no restricted or confidential field on Patients (Q08b).
HIDDEN_PATIENT = ("Lucía Navarro", "Dr. Alicia Moreno")
TRUTH_Q8B = len(PATIENTS)  # 6 patients for a member; the owner sees 7
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
EXTRA_IDS = ["Q11", "Q12", "Q13", "Q14", "Q15", "Q17", "Q18"]
ALL_IDS = ITEM_IDS + EXTRA_IDS
API_SERVER = os.environ.get("SN_QC_SERVER", SERVER).rstrip("/")
TRUTH_Q11 = 130  # Daniel 40+40, Hannah 25+25 — named by their patient ids, not by the physician
TRUTH_Q17 = 80  # Daniel Reyes's visits, the patient NAMED (not his id): 40 + 40. Red before 2026-10-03: 0.


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
    # Q08b (2026-10-02, only-me-listing): a PLAIN table — Patients has no restricted or confidential field —
    # carries one "Only me" row too. Before that fix a plain table listed and counted it for every member
    # (the restricted Visit Copays table hid it only by another path), so Q08 now asks both tables.
    s, rid = admin.rpc("record_write", {"p_organization_id": ORG, "p_table_id": fx["patients"],
                                        "p_data": {"name": HIDDEN_PATIENT[0], "referring_physician": HIDDEN_PATIENT[1]}})
    assert s == 200, ("hidden patient", s, rid)
    fx["hidden_patient"] = str(rid)
    s, body = admin.rpc("share_lane_set", {"p_organization_id": ORG, "p_subject_id": fx["hidden_patient"], "p_choice": "mine"})
    assert s == 200, ("share_lane_set mine (patient)", s, body)
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
        for q, args in {**ask_args(fx), "Q11": q11_args(fx), "Q17": q17_args(fx)}.items():
            try:
                res = await records(dict(args), _Ctx())
            except Exception as e:  # noqa: BLE001 — a tool that RAISES (the related_to TypeError) is a red, said
                out[q] = {"success": False, "output": None, "error": f"raised {type(e).__name__}: {e}"}
                continue
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


# ── REST v1 AND THE MCP — the same questions, by column NAME, with test@test.com's own personal key ─────────
def q17_args(fx: dict) -> dict:
    """Q17: a relation condition given the related row's NAME — a relation cell stores an id, so before
    2026-10-03 the name was compared with ids and every door answered a silent 0 (tool, REST and MCP)."""
    return {"action": "record_aggregate", "table_id": fx["visits"], "measure": "sum", "field_key": "Copay",
            "match": {"Patient": "Daniel Reyes"}}


def q11_args(fx: dict) -> dict:
    return {"action": "record_aggregate", "table_id": fx["visits"], "measure": "sum", "field_key": "Copay",
            "related_to": [fx["patient_ids"]["daniel"], fx["patient_ids"]["hannah"]]}


def rest_args(fx: dict) -> dict:
    """Each question as `POST /v1/tables/<id>/aggregate` asks it (AggregateRequest: names, never keys)."""
    out: dict = {}
    for q, a in {**ask_args(fx), "Q11": q11_args(fx), "Q17": q17_args(fx)}.items():
        body = {"measure": a.get("measure", "count")}
        for src, dst in (("field_key", "column"), ("group_by", "group_by"), ("match", "where"), ("as_of", "as_of"),
                         ("order", "order"), ("limit", "limit"), ("related_to", "related_to"), ("bucket", "bucket")):
            if a.get(src) is not None:
                body[dst] = a[src]
        out[q] = body
    return out


def api_value(q: str, body, fx: dict):
    """Reduce an AggregateResult to the question's one value — a refusal stays a refusal."""
    if not isinstance(body, dict) or "groups" not in body:
        return {"refused": json.dumps(body, default=str)[:240]}
    groups = body["groups"] or []
    names = {fx["patient_ids"][k]: n for k, n, _ in PATIENTS}

    def val(g):
        return "withheld" if g.get("withheld") else _num(g.get("value"))

    if q in ("Q2", "Q9"):
        return {str(g.get("group")): val(g) for g in groups}
    if q == "Q10":
        return [(names.get(str(g.get("group")), g.get("group")), val(g)) for g in groups]
    if q == "Q6":
        return _num(groups[0].get("rows")) if groups else 0.0
    return val(groups[0]) if groups else None


def make_key(member: Seat) -> tuple[str | None, str | None]:
    _, made = member.rpc("personal_api_key_create", {"p_name": f"Query correctness {STAMP}", "p_organization_id": ORG}, schema="iam")
    key = made.get("api_key") if isinstance(made, dict) else None
    if key:
        SECRETS.append(key)
    return key, (made.get("id") if isinstance(made, dict) else None)


def rest_answers(key: str, fx: dict) -> dict:
    out: dict = {}
    for q, body in rest_args(fx).items():
        out[q] = http("POST", f"{API_SERVER}/api/v1/tables/{fx['visits']}/aggregate", body,
                      {"authorization": f"Bearer {key}", "x-organization-id": ORG})
    return out


async def mcp_answers(key: str, fx: dict) -> dict:
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client

    out: dict = {}
    async with streamablehttp_client(f"{API_SERVER}/api/matrx-mcp", headers={"Authorization": f"Bearer {key}", **UA}) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            for q, body in rest_args(fx).items():
                r = await session.call_tool("tables", {"action": "aggregate", "table": fx["visits"], "organization_id": ORG, **body})
                text = r.content[0].text if r.content else ""
                got = r.structuredContent or (json.loads(text) if text.strip().startswith("{") else {"text": text})
                got = got.get("result", got) if isinstance(got, dict) else got
                log.append(redact(f"MCP tables aggregate {q} -> {json.dumps(got, default=str)[:600]}"))
                out[q] = got
    return out


def rollup_door_refuses(member: Seat, fx: dict) -> tuple[bool, str]:
    """Q13: the patients hold no copay and nothing they point at does — the door must say so, never 0."""
    roots = [fx["patient_ids"]["daniel"], fx["patient_ids"]["hannah"]]
    s, b = member.rpc("query_rollup_sum", {"p_organization_id": ORG, "p_roots": roots, "p_field_key": "copay"})
    ok = s != 200 and isinstance(b, dict) and str(b.get("details") or "").startswith("rollup_field_not_reached:")
    return ok, f"{s} {json.dumps(b, default=str)[:300]}"


# ── OPTIONAL: one real chat run of Q1 by the member, on the agent the product gives her ───────────────────
def table_page_agent(seat: Seat) -> tuple[str | None, str]:
    """The agent a person on a table page gets: SN_QC_AGENT, else the mandate's resolution for this seat."""
    if RECORDS_AGENT:
        return RECORDS_AGENT, "SN_QC_AGENT override"
    s, body = http("GET", f"{SERVER}/mandates/{TABLE_PAGE_MANDATE}/resolution", None,
                   {"authorization": f"Bearer {seat.jwt}", "x-organization-id": ORG})
    if s != 200 or not isinstance(body, dict) or not body.get("agent_id"):
        return None, f"{TABLE_PAGE_MANDATE} did not resolve to an agent: {s} {json.dumps(body, default=str)[:300]}"
    return str(body["agent_id"]), f"{TABLE_PAGE_MANDATE} -> {body['agent_id']} ({body.get('provenance')})"


def llm_q1(seat: Seat, fx: dict) -> tuple[bool, str, str]:
    """(reached `records`, how the agent was chosen + the tools it called, the answer)."""
    agent, how = table_page_agent(seat)
    if not agent:
        return False, how, ""
    body = {"user_input": f"In the table with id {fx['visits']} (Cedar Ridge Physical Therapy), what is the sum of the "
                          f"Expected copay total column across all records?", "organization_id": ORG, "stream": True,
            "conversation_id": str(uuid.uuid4()), "is_new": True, "store": True}
    req = urllib.request.Request(f"{SERVER}/ai/agents/{agent}", data=json.dumps(body).encode(), method="POST",
                                 headers={"content-type": "application/json", "authorization": f"Bearer {seat.jwt}", "x-organization-id": ORG, **UA})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:  # noqa: S310
            raw = r.read().decode(errors="replace")
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
    (OUT / "query-correctness-llm-q1.ndjson").write_text(redact(raw))
    text, tools = "", []
    for line in raw.splitlines():
        try:
            e = json.loads(line)
        except ValueError:
            continue
        d = e.get("data") if isinstance(e, dict) else None
        if isinstance(d, dict) and e.get("event") == "completion":
            text = str((d.get("result") or {}).get("output") or "")
        if isinstance(d, dict) and e.get("event") == "tool_event" and d.get("event") == "tool_started":
            tools.append(f"{d.get('tool_name')}:{((d.get('data') or {}).get('arguments') or {}).get('action', '')}")
    detail = f"{how}; conversation {body['conversation_id']}; tools {tools}"
    # The member does not see the "Only me" visit: her truth is TRUTH['Q1'].
    return any(t.startswith("records:") for t in tools), detail, f"member's truth {TRUTH['Q1']}; answer: {text.strip()[:500]}"


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
            step(ALL_IDS, "fixture: Patients + Visit Copays in Cedar Ridge, one visit 'Only me', one restricted column, one edit after T0",
                 True, f"visits {fx['visits']}; patients {fx['patients']}; T0 {fx['t0']}")
        except AssertionError as e:
            step(ALL_IDS, "fixture", False, f"refused: {e}")
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
        # Q08b — the plain Patients table: a member counts and lists 6, never the owner's "Only me" patient.
        n8b = _num(_one(_agg(member, fx["patients"], [{"op": "count"}]), "count"))
        s, page = member.rpc("read_records_page", {"p_organization_id": ORG, "p_table_id": fx["patients"]})
        listed = page.get("total") if isinstance(page, dict) else None
        leaked = HIDDEN_PATIENT[0] in json.dumps(page, ensure_ascii=False)
        so, opage = admin.rpc("read_records_page", {"p_organization_id": ORG, "p_table_id": fx["patients"]})
        owner = opage.get("total") if isinstance(opage, dict) else None
        step(["Q08"], "Q8b how many patients (a plain table with one 'Only me' row)",
             n8b == TRUTH_Q8B and listed == TRUTH_Q8B and not leaked and owner == TRUTH_Q8B + 1,
             f"truth {TRUTH_Q8B} | door count {n8b} | page total {listed} | hidden name listed {leaked} | owner {owner}")
        # Q11 — related_to, tool and door (the door half is the Rule filter on the visits' Patient field).
        F = fx["field_ids"]
        rule = {"op": "or", "args": [{"op": "eq", "args": [{"field": F["patient"]}, {"const": fx["patient_ids"][k]}]} for k in ("daniel", "hannah")]}
        door11 = _num(_one(_agg(member, fx["visits"], [{"op": "sum", "key": "copay"}], filt=rule), "sum_copay"))
        ask11 = ask_value("Q11", ask["Q11"], fx)
        step(["Q11"], "Q11 the copay of Daniel's and Hannah's visits, named by the patients (related_to)",
             same("Q11", door11, TRUTH_Q11) and same("Q11", ask11, TRUTH_Q11),
             f"truth {TRUTH_Q11} | door {door11} | ask {json.dumps(ask11, default=str)}")
        # Q12 — a cut list says so: top 5 of 6 patients. With a page ceiling at or under 5 the count of
        # groups cannot be exact, so then it must say truncated AND not exact.
        out10 = (ask["Q10"].get("output") or {}) if ask["Q10"]["success"] else {}
        exact = out10.get("groups_total_is_exact")
        ok12 = out10.get("truncated") is True and (out10.get("groups_total") == 6 if exact else exact is False)
        step(["Q12"], "Q12 the top-5 list of 6 patients says it is cut (tool)", ok12,
             f"truncated {out10.get('truncated')} groups_total {out10.get('groups_total')} exact {exact} shown {out10.get('groups_shown')}")
        ask17 = ask_value("Q17", ask["Q17"], fx)
        step(["Q17"], "Q17 the copay of the visits of the patient NAMED Daniel Reyes (tool) — a name, never a silent 0",
             same("Q17", ask17, TRUTH_Q17), f"truth {TRUTH_Q17} | ask {json.dumps(ask17, default=str)}")
        # Q18 — groups of a relation column carry the related row's NAME (the model needed four more calls to
        # say the patients' names before 2026-10-03). The top-5 list's names, in order, are TRUTH['Q10']'s.
        out10_all = ((ask["Q10"].get("output") or {}).get("buckets") or []) if ask["Q10"]["success"] else []
        names18 = [b.get("name") for b in out10_all]
        step(["Q18"], "Q18 the top-5 patients come back with each patient's name (tool)",
             names18 == [n for n, _ in TRUTH["Q10"]], f"truth {[n for n, _ in TRUTH['Q10']]} | tool {names18}")
        ok13, said13 = rollup_door_refuses(member, fx)
        step(["Q13"], "Q13 the roll-up door, rooted at patients, refuses rather than answering 0", ok13, said13)
        # Q14 / Q15 — REST v1 and the MCP with test@test.com's own personal key.
        key, key_id = make_key(member)
        try:
            if not key:
                step(["Q14", "Q15"], "personal key for test@test.com", False, "iam.personal_api_key_create refused")
            else:
                truth = {**TRUTH, "Q11": TRUTH_Q11, "Q17": TRUTH_Q17}
                rest = rest_answers(key, fx)
                bad = {q: api_value(q, b, fx) for q, (st, b) in rest.items() if not same(q, api_value(q, b, fx), truth[q])}
                cut = rest["Q10"][1] if isinstance(rest["Q10"][1], dict) else {}
                rest_names = [g.get("name") for g in (cut.get("groups") or [])]
                step(["Q18"], "Q18 REST v1: the top-5 groups carry each patient's name", rest_names == [n for n, _ in TRUTH["Q10"]],
                     f"truth {[n for n, _ in TRUTH['Q10']]} | REST {rest_names}")
                step(["Q14", "Q12", "Q17"], "Q14 REST v1 /v1/tables/<id>/aggregate with a personal key: Q1–Q11 and Q17 exact, Q10 says it is cut",
                     not bad and cut.get("truncated") is True,
                     f"server {API_SERVER} | wrong {json.dumps(bad, default=str, ensure_ascii=False)[:500]} | Q10 truncated "
                     f"{cut.get('truncated')} total {cut.get('groups_total')} | statuses {sorted({st for st, _ in rest.values()})}")
                try:
                    mcp = asyncio.run(mcp_answers(key, fx))
                    bad = {q: api_value(q, b, fx) for q, b in mcp.items() if not same(q, api_value(q, b, fx), truth[q])}
                    step(["Q15", "Q17"], "Q15 the AI Matrx MCP tables.aggregate with the same key: Q1–Q11 and Q17 exact", not bad,
                         f"server {API_SERVER} | wrong {json.dumps(bad, default=str, ensure_ascii=False)[:500]}")
                except Exception as e:  # noqa: BLE001 — an unreachable MCP is a red, said
                    step(["Q15"], "Q15 the AI Matrx MCP tables.aggregate", False, f"{type(e).__name__}: {str(e)[:300]}")
        finally:
            if key_id:
                s, _ = member.rpc("personal_api_key_revoke", {"p_id": key_id}, schema="iam")
                step([], "cleanup: revoke test@test.com's personal key", s == 200, f"{s}")
        if LLM:
            reached, how, said = llm_q1(member, fx)
            step(["Q01"], "the agent a member gets on a table page answers Q1 through the records tool", reached, how)
            step([], "INFO the model's Q1 answer (not graded)", None, said)
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
