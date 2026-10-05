#!/usr/bin/env python3
# matrx-agent-traffic: exempt it talks to the database directly (Postgres), never to the app or the server
"""Put the chat-package-move seed records back to their seeded state on LIVE, between real-test runs.

Records (docs: common-docs/operations/real-tests/chat-package-move/SEED.md, SEED-TRIGGERS.md): the Harbor
Dental notes and their per-trigger copies, task(s), boards (nodes), the Patients table rows, shortcuts, the
two agent copies, the F3 files, and the run leftovers (run memories, run-made notes). Every record is found
by exact name/title + created_by admin@admin.com + the Harbor Dental Group organization (never by a stored
id), so no other user's row can match.

Usage:
  reset-seed.py                      dry run: print what would change, row by row (default)
  reset-seed.py --commit             apply, then read every record back and print PASS/DIFF
  reset-seed.py --only PB-02         only the records playbook PB-02 reads or writes
  reset-seed.py --trigger A          only the per-trigger copies of trigger A (+ the shared originals)

Notes keep their version history through the database's own _history trigger (every content update is
captured as a new row_versions entry, the same as the editor's save); nothing here writes history by hand.
DB access: DSN from aidream/.env SUPABASE_MATRIX_* (never printed). Writes run in one transaction that
first sets app.actor_system (the actor-tier trigger refuses writes otherwise).
"""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

import psycopg
from psycopg.types.json import Jsonb

ADMIN = "87a6e699-3622-4869-8843-d0867456c0dd"  # admin@admin.com
ORG = "11f4e747-c13a-49c7-81a3-66e6391f8a9b"  # Harbor Dental Group
ACTOR = "claude-code:chat-package-chair"
ALL_PBS = ["PB-01", "PB-02", "PB-03", "PB-04", "PB-05", "PB-06"]

# ---------------------------------------------------------------- seed bodies (md5 = SEED.md / SEED-TRIGGERS.md)
N1 = """# New-patient welcome call

1. Greet: "Thanks for calling Harbor Dental Group, this is Renata."
2. Ask how they heard about us.
3. Offer the first open new-patient exam.
4. Email the intake packet and ask them to bring their insurance card."""
R1_HEAD = """# Insurance verification — what to ask

- Carrier name and subscriber name exactly as on the card.
- Subscriber date of birth.
- Is this plan through an employer? Which one?
"""
R1_B = R1_HEAD + "- Premera members: read back the 9-digit group number after GRP on the back of the card."
R1_FRONT = R1_HEAD + (
    "- Premera members: read back the 9-digit group number after GRP on the back of the card, "
    "and copy the card's issue date (top right) onto the intake form."
)
R1_CHECKIN = R1_B + (
    "\n- Delta Dental of Washington members: read back the 3-digit division number printed under the group name"
    " — our biller needs it for every retiree plan."
)
N3 = """# Recall list — overdue cleanings

- Tunde Oyelaran — last prophy March; batch with his exam in one afternoon.
- Agata Kowalczyk — night guard check due; lab case returned.
- Graham Whitfield — Bayview Endodontics referral sent 9/12; recall after root canal."""
N2 = """# Thursday 10/16 — hygiene column

- 8:00 — Marisol Rivera — adult prophy (D1110)
- 10:30 — open
- 1:15 — Dara Whitehorse — new-patient exam + cleaning
- 3:00 — Dana Kowalczyk, RDH — open"""
N2_OLD = """# Thursday 10/16 — hygiene column (draft from September)

- 8:00 — open
- 10:30 — open
- 3:00 — Dana Kowalczyk, RDH — open"""
N4 = """# Ingrid Strand — crown seat prep (HD-10470)

Skip to main content | Patient portal | Self-pay estimate — Crown #30 porcelain/zirconia — Estimate $1,385.00 — Plan: 4 monthly payments | Cookie settings

Ingrid asked whether her husband can sit in the operatory during the seat appointment.

Crown seat booked Thursday 10/23 at 9:20 with Dr. Alina Reyes; the lab case from Cascade Dental Lab arrives 10/21.

Allergies on file: sulfa drugs, local anaesthetic."""
N5 = """# Brigid O'Connell — crown seat (HD-10489)

Brigid prefers texts after 5 p.m. Her crown seat is with Dr. Marcus Webb. Bayview Endodontics cleared tooth #19 on 9/18, so the crown can go ahead.

Balance: patient portion from the last Delta Dental claim."""

MD5 = {  # documented md5s; the script refuses to run if a body above drifts from them
    "N1": (N1, "fe245c0c767fcc102173a9e807c97b93"),
    "R1_B": (R1_B, "112958fc5c448958b7e17fc8c0cb3ada"),
    "R1_FRONT": (R1_FRONT, "cc0e9d57e487fd40628a1f2650397e55"),
    "R1_CHECKIN": (R1_CHECKIN, "ca33c354d73f5c979ee4e71368220d4b"),
    "N3": (N3, "d9898ec3677baf3a4d00eb741aa5b59e"),
    "N2": (N2, "06695c8b20ce2f8e847794485b2f1471"),
    "N2_OLD": (N2_OLD, "01f5025c0fa5b34acba201ce7d1a6881"),
    "N4": (N4, "cbbece52bf046905ddcc9567108dc6cb"),
    "N5": (N5, "56f2bdd3d4fb383fbf171146ce827c8a"),
}
for _k, (_body, _md5) in MD5.items():
    if hashlib.md5(_body.encode()).hexdigest() != _md5:
        sys.exit(f"seed body {_k} does not match its documented md5 {_md5}; fix the script, not the database")

R1_T = "Insurance verification — what to ask"
N1_T = "New-patient welcome call — script"
N3_T = "Recall list — overdue cleanings"
N2_T = "Thursday hygiene column — Oct 16"
N4_T = "Ingrid Strand — crown seat prep"
N5_T = "Brigid O'Connell — crown seat"
TASK_T = "Confirm Hieu Tran's premedication with Dr. Reyes"
BOARD_T = "Harbor Dental — October"
F3 = "new-patient-financial-policy-2026-10"
F3_OLD = "new-patient-financial-policy-2026-09"
F3_SHA = "fcc72b5d718f7be805d10c2e918f06e938f092f636d57f42e7fd5f6a43d279a4"
F3_OLD_SHA = "e9a9aa935b75f0fcc295411465e07ed289c75a63f8110d2a82791a0e25d02fd1"

# ---------------------------------------------------------------- the seed plan
# Every entry: kind, name (exact), pbs, trigger (None = shared original), spec.
PLAN = []


def add(kind, name, pbs, trig=None, **spec):
    PLAN.append(dict(kind=kind, name=name, pbs=set(pbs), trig=trig, spec=spec))


def note(label, folder, body, pbs, trig=None):
    add("note", f"{label} @ {folder}", pbs, trig, label=label, folder=folder, body=body)


# PB-01: three trigger copies (A front desk, B reception, C phones) + originals
note(N1_T, "Front desk", N1, ["PB-01"])
note(R1_T, "Front desk", R1_B, ["PB-01", "PB-05"])
note(N3_T, "Front desk", N3, ["PB-01", "PB-02"])
for trig, sfx, r1 in (("A", "(front desk)", R1_FRONT), ("B", "(reception)", R1_B), ("C", "(phones)", R1_B)):
    note(f"{N1_T} {sfx}", "Front desk", N1, ["PB-01"], trig)
    note(f"{R1_T} {sfx}", "Front desk", r1, ["PB-01"], trig)
    note(f"{N3_T} {sfx}", "Front desk", N3, ["PB-01"], trig)
# PB-02: two trigger copies (A hygiene, B checkout) + originals
note(N2_T, "Front desk", N2, ["PB-02"])
note(N2_T, "Archive", N2_OLD, ["PB-02"])
for trig, sfx in (("A", "(hygiene)"), ("B", "(checkout)")):
    note(f"{N2_T} {sfx}", "Front desk", N2, ["PB-02"], trig)
    note(f"{N2_T} {sfx}", "Archive", N2_OLD, ["PB-02"], trig)
    note(f"{N3_T} {sfx}", "Front desk", N3, ["PB-02"], trig)
# PB-04 / PB-05
note(N4_T, "Front desk", N4, ["PB-04"])
note(N5_T, "Front desk", N5, ["PB-04", "PB-05"])
note(f"{N5_T} (check-in)", "Front desk", N5, ["PB-05"], "A")
note(f"{R1_T} (check-in)", "Front desk", R1_CHECKIN, ["PB-05"], "A")

# Boards: nodes back to the seed layout (N2 tile, N3 tile, October label); anything a run added is removed.
BOARDS = {
    # title: (suffix for the note labels, [n2 node id, n3 node id, label node id])
    f"{BOARD_T} front desk": ("", ["note:a1816809", "note:a82b4e21", "label:85dd4e4a"], None),
    f"{BOARD_T} (hygiene)": ("(hygiene)", ["note:98d068ee", "note:eac0a76e", "label:d953892c"], "A"),
    f"{BOARD_T} (checkout)": ("(checkout)", ["note:92ba9930", "note:d59d73a4", "label:0dc33d36"], "B"),
}
for title, (sfx, ids, trig) in BOARDS.items():
    add("board", title, ["PB-02"], trig, suffix=sfx, ids=ids)

# Tasks (R2): original + one per trigger copy
add("task", TASK_T, ["PB-02"], None, desc="Dr. Reyes confirmed 9/29: amoxicillin 2 g one hour before the 10:30 visit.")
add("task", f"{TASK_T} (hygiene)", ["PB-02"], "A", desc="Dr. Reyes confirmed 9/29: amoxicillin 2 g one hour before the 10:30 visit.")
add("task", f"{TASK_T} (checkout)", ["PB-02"], "B", desc="Dr. Reyes confirmed 9/29: amoxicillin 2 g one hour before the 10:30 visit.")

# Shortcuts (mandate.vw_shortcut)
add("shortcut", "Patient reminder card", ["PB-04"], None, want=dict(
    use_latest=False, agent_version_id="c1a8c063-bed5-4a0b-8ced-77d8e3962654", display_mode="modal-compact",
    allow_chat=True, auto_run=True, show_pre_execution_gate=True, is_active=True, surface_name="matrx-user/notes",
    default_user_input="Write a two-sentence reminder card for this patient's next visit.", deleted_at=None))
add("shortcut", "Front desk assistant", ["PB-01", "PB-04"], "B", want=dict(
    use_latest=False, agent_version_id="f079f308-8145-4b75-9379-833cdd871d45", display_mode="sidebar",
    allow_chat=True, auto_run=False, show_pre_execution_gate=False, is_active=True, surface_name="matrx-user/notes",
    default_user_input=None, deleted_at=None))

# Agent copies: restored to their rename snapshot (definition_version 2 = the seeded state)
add("agent", "Harbor front desk helper", ["PB-01", "PB-02", "PB-05"], None, snapshot=2)
add("agent", "Harbor billing helper", ["PB-06"], None, snapshot=2)

# Files (F3 + copies, F3-old): name, folder, bytes pointer, size, checksum
for trig, sfx in ((None, ""), ("A", "-front-desk"), ("B", "-reception"), ("C", "-phones"), ("D", "-check-in")):
    pbs = ["PB-03", "PB-06"] if trig is None else ["PB-03"]
    add("file", f"{F3}{sfx}.md", pbs, trig, sha=F3_SHA, size=274)
add("file", f"{F3_OLD}.md", ["PB-03"], None, sha=F3_OLD_SHA, size=273)

# Patients table rows (to the first captured version) + run leftovers
add("table", "Patients", ["PB-03"], None)
add("memories", "run memories (premera|delta|division|issue_date|crown_deposit|kenji|checkin)",
    ["PB-01", "PB-02", "PB-03", "PB-05"], None)
add("leftover_notes", "run-made notes (Thursday huddle…)", ["PB-02"], None, rx="^Thursday huddle")
add("leftover_notes", "run-made notes (Kenji Nakamura…, Leila Abadi…)", ["PB-03"], None, rx="^(Kenji Nakamura|Leila Abadi)")


# ---------------------------------------------------------------- connection
def connect():
    env = {}
    for line in (Path.home() / "code/aidream/.env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"')
    p = "SUPABASE_MATRIX_"
    dsn = (f"host={env[p + 'HOST']} port={env.get(p + 'PORT', '5432')} dbname={env[p + 'DATABASE_NAME']} "
           f"user={env[p + 'USER']} password={env[p + 'PASSWORD']} sslmode=require connect_timeout=15")
    return psycopg.connect(dsn)


def one(cur, sql, args=()):
    cur.execute(sql, args)
    cols = [d.name for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def short(v, n=60):
    s = v if isinstance(v, str) else json.dumps(v, default=str, sort_keys=True)
    return s if len(s) <= n else s[:n] + "…"


# ---------------------------------------------------------------- handlers: plan(cur, entry) -> (label, changes, apply_fn|None, problem|None)
# changes = list of "field: now -> want" strings; apply_fn(cur) performs the writes.

def h_note(cur, e):
    s = e["spec"]
    rows = one(cur, """select id, content, deleted_at from workbench.notes
        where label=%s and folder_name=%s and created_by=%s and organization_id=%s
        order by (deleted_at is not null), updated_at desc""", (s["label"], s["folder"], ADMIN, ORG))
    if not rows:
        return None, [], None, "MISSING (no note with this title in this folder)"
    r = rows[0]
    ch = []
    if r["content"] != s["body"]:
        ch.append(f"content md5 {hashlib.md5((r['content'] or '').encode()).hexdigest()[:8]} -> "
                  f"{hashlib.md5(s['body'].encode()).hexdigest()[:8]}")
    if r["deleted_at"] is not None:
        ch.append("deleted_at set -> null")

    def apply(c):
        c.execute("update workbench.notes set content=%s, deleted_at=null where id=%s and created_by=%s and organization_id=%s",
                  (s["body"], r["id"], ADMIN, ORG))
    return str(r["id"]), ch, apply, None


def board_nodes(cur, sfx, ids):
    def label(base):
        return f"{base} {sfx}".strip()
    out = []
    for nid, base, x, y in ((ids[0], N2_T, 483, 417), (ids[1], N3_T, 80, 1097)):
        folder = "Front desk"
        n = one(cur, "select id from workbench.notes where label=%s and folder_name=%s and created_by=%s and organization_id=%s and deleted_at is null",
                (label(base), folder, ADMIN, ORG))
        if len(n) != 1:
            return None
        out.append({"id": nid, "rect": {"h": 620, "w": 560, "x": x, "y": y}, "title": label(base),
                    "source": {"id": str(n[0]["id"]), "kind": "entity", "entity": "note"}})
    out.append({"id": ids[2], "rect": {"h": 120, "w": 520, "x": 680, "y": 1097}, "title": "Label",
                "source": {"kind": "label", "text": "October"}})
    return out


def h_board(cur, e):
    s = e["spec"]
    rows = one(cur, "select id, nodes from projects.boards where title=%s and created_by=%s and organization_id=%s and deleted_at is null",
               (e["name"], ADMIN, ORG))
    if len(rows) != 1:
        return None, [], None, f"MISSING or ambiguous ({len(rows)} boards with this title)"
    want = board_nodes(cur, s["suffix"], s["ids"])
    if want is None:
        return None, [], None, "MISSING (a note this board's tiles point at)"
    r = rows[0]
    key = lambda ns: sorted(ns, key=lambda n: n["id"])
    ch = []
    if key(r["nodes"]) != key(want):
        have_ids = {n["id"] for n in r["nodes"]}
        want_ids = {n["id"] for n in want}
        extra = sorted(have_ids - want_ids)
        gone = sorted(want_ids - have_ids)
        ch.append(f"nodes: {len(r['nodes'])} tiles -> {len(want)}; remove {[ (n['title']) for n in r['nodes'] if n['id'] in extra] or 'none'}, "
                  f"re-add {gone or 'none'}, other tile drift {'yes' if not extra and not gone else 'maybe'}")

    def apply(c):
        c.execute("update projects.boards set nodes=%s where id=%s and created_by=%s and organization_id=%s",
                  (Jsonb(want), r["id"], ADMIN, ORG))
    return str(r["id"]), ch, apply, None


def h_task(cur, e):
    s = e["spec"]
    pr = one(cur, "select id from projects.projects where name='Harbor Dental — front desk' and organization_id=%s and created_by=%s and deleted_at is null",
             (ORG, ADMIN))
    if len(pr) != 1:
        return None, [], None, "MISSING project 'Harbor Dental — front desk'"
    rows = one(cur, """select id, description, status, project_id, completed_at, deleted_at from projects.tasks
        where title=%s and created_by=%s and organization_id=%s order by (deleted_at is not null), created_at""",
               (e["name"], ADMIN, ORG))
    if not rows:
        return None, [], None, "MISSING"
    r = rows[0]
    want = dict(description=s["desc"], status="planned", project_id=pr[0]["id"], completed_at=None, deleted_at=None)
    ch = [f"{k}: {short(r[k])} -> {short(v)}" for k, v in want.items() if r[k] != v]

    def apply(c):
        c.execute("update projects.tasks set description=%s, status=%s, project_id=%s, completed_at=null, deleted_at=null where id=%s and created_by=%s",
                  (want["description"], want["status"], want["project_id"], r["id"], ADMIN))
    return str(r["id"]), ch, apply, None


def h_shortcut(cur, e):
    want = dict(e["spec"]["want"])
    rows = one(cur, "select * from mandate.vw_shortcut where label=%s and created_by=%s and organization_id=%s order by (deleted_at is not null)",
               (e["name"], ADMIN, ORG))
    if not rows:
        return None, [], None, "MISSING"
    r = rows[0]
    norm = lambda v: str(v) if hasattr(v, "hex") else v
    ch = [f"{k}: {short(norm(r[k]))} -> {short(v)}" for k, v in want.items() if norm(r[k]) != v]

    def apply(c):
        sets = ", ".join(f"{k}=%s" for k in want)
        c.execute(f"update mandate.vw_shortcut set {sets} where id=%s and created_by=%s", (*want.values(), r["id"], ADMIN))
    return str(r["id"]), ch, apply, None


AGENT_FIELDS = ["description", "messages", "variable_definitions", "model_id", "model_tiers", "settings", "tools",
                "custom_tools", "mcp_servers", "tool_config", "skill_config", "context_policies", "ui_gates",
                "matrx_actions"]


def h_agent(cur, e):
    rows = one(cur, "select * from agent.definition where name=%s and created_by=%s and organization_id=%s order by (deleted_at is not null)",
               (e["name"], ADMIN, ORG))
    if not rows:
        return None, [], None, "MISSING"
    r = rows[0]
    snaps = one(cur, "select * from agent.definition_version where agent_id=%s and version_number=%s",
                (r["id"], e["spec"]["snapshot"]))
    if not snaps:
        return None, [], None, f"MISSING seed snapshot v{e['spec']['snapshot']}"
    sn = snaps[0]
    want = {k: sn[k] for k in AGENT_FIELDS if k in sn}
    want["is_active"] = True
    want["deleted_at"] = None
    ch = []
    for k, v in want.items():
        if r.get(k) != v:
            if k == "tools":
                a, b = set(map(str, r[k] or [])), set(map(str, v or []))
                ch.append(f"tools: missing {sorted(b - a) or 'none'}, extra {sorted(a - b) or 'none'}")
            else:
                ch.append(f"{k}: {short(r.get(k))} -> {short(v)}")

    def apply(c):
        diff = {k: v for k, v in want.items() if r.get(k) != v}
        wrap = lambda k, v: Jsonb(v) if isinstance(v, (dict, list)) and k not in ("tools", "mcp_servers") else v
        sets = ", ".join(f"{k}=%s" for k in diff)
        c.execute(f"update agent.definition set {sets} where id=%s and created_by=%s and organization_id=%s",
                  (*[wrap(k, v) for k, v in diff.items()], r["id"], ADMIN, ORG))
    return str(r["id"]), ch, apply, None


def h_file(cur, e):
    s = e["spec"]
    fo = one(cur, "select id from files.folders where folder_name='Harbor Dental' and created_by=%s and organization_id=%s and deleted_at is null",
             (ADMIN, ORG))
    if len(fo) != 1:
        return None, [], None, f"MISSING or ambiguous folder 'Harbor Dental' ({len(fo)})"
    rows = one(cur, """select id, file_name, file_path, parent_folder_id, storage_uri, size_bytes, checksum, deleted_at
        from files.files where file_name=%s and created_by=%s and organization_id=%s order by (deleted_at is not null), created_at""",
               (e["name"], ADMIN, ORG))
    if not rows:
        return None, [], None, "MISSING"
    r = rows[0]
    want = dict(parent_folder_id=fo[0]["id"], file_path=f"Harbor Dental/{e['name']}",
                storage_uri=f"s3://matrx-user-files/{ADMIN}/{r['id']}", size_bytes=s["size"], checksum=s["sha"], deleted_at=None)
    ch = [f"{k}: {short(str(r[k]) if r[k] is not None else None)} -> {short(str(v) if v is not None else None)}"
          for k, v in want.items() if r[k] != v]

    def apply(c):
        sets = ", ".join(f"{k}=%s" for k in want)
        c.execute(f"update files.files set {sets} where id=%s and created_by=%s and organization_id=%s",
                  (*want.values(), r["id"], ADMIN, ORG))
    return str(r["id"]), ch, apply, None


def h_table(cur, e):
    tb = one(cur, "select id from custom.\"table\" where name='Patients' and created_by=%s and organization_id=%s",
             (ADMIN, ORG))
    if len(tb) != 1:
        return None, [], None, f"MISSING or ambiguous table 'Patients' ({len(tb)})"
    tid = tb[0]["id"]
    rows = one(cur, "select id, data, deleted_at from custom.record where table_id=%s", (tid,))
    ch, fixes = [], []
    for r in rows:
        first = one(cur, "select row_data->'data' as d from history.row_versions where entity_type='custom.record' and row_id=%s and operation='INSERT' order by version limit 1",
                    (r["id"],))
        if not first or r["data"].get("_source", {}).get("via") != "import":
            # a row no seed import made: a run added it
            if r["deleted_at"] is None:
                ch.append(f"row {str(r['id'])[:8]} {short(r['data'].get('title'))}: run-added -> soft-delete")
                fixes.append(("del", r["id"], None))
            continue
        want = first[0]["d"]
        if r["data"] != want or r["deleted_at"] is not None:
            keys = sorted(k for k in set(r["data"]) | set(want) if r["data"].get(k) != want.get(k) and not k.startswith("_"))
            ch.append(f"row {str(r['id'])[:8]} {short(want.get('title'))}: fields {keys or ['(bookkeeping only)']} -> first-captured version")
            fixes.append(("set", r["id"], want))

    def apply(c):
        for op, rid, want in fixes:
            if op == "del":
                c.execute("update custom.record set deleted_at=now() where id=%s and table_id=%s and created_by=%s", (rid, tid, ADMIN))
            else:
                c.execute("update custom.record set data=%s, deleted_at=null where id=%s and table_id=%s", (Jsonb(want), rid, tid))
    return str(tid), ch, apply, None


MEM_RE = "premera|delta|division|issue_date|crown_deposit|kenji|checkin"


def h_memories(cur, e):
    rows = one(cur, """select id, key from chat.agent_memory where created_by=%s and organization_id=%s and deleted_at is null
        and (key ~* %s or content::text ~* 'premera|division number|issue date|crown deposit')""", (ADMIN, ORG, MEM_RE))
    ch = [f"memory {r['key']} ({str(r['id'])[:8]}) -> soft-delete" for r in rows]

    def apply(c):
        for r in rows:
            c.execute("update chat.agent_memory set deleted_at=now() where id=%s and created_by=%s and organization_id=%s",
                      (r["id"], ADMIN, ORG))
    return "chat.agent_memory", ch, apply, None


def h_leftover(cur, e):
    rows = one(cur, """select id, label from workbench.notes where created_by=%s and organization_id=%s and deleted_at is null
        and label ~ %s""", (ADMIN, ORG, e["spec"]["rx"]))
    ch = [f"note '{r['label']}' ({str(r['id'])[:8]}) -> soft-delete" for r in rows]

    def apply(c):
        for r in rows:
            c.execute("update workbench.notes set deleted_at=now() where id=%s and created_by=%s and organization_id=%s",
                      (r["id"], ADMIN, ORG))
    return "workbench.notes", ch, apply, None


HANDLERS = dict(note=h_note, board=h_board, task=h_task, shortcut=h_shortcut, agent=h_agent, file=h_file,
                table=h_table, memories=h_memories, leftover_notes=h_leftover)


def selected(args):
    out = []
    for e in PLAN:
        if args.only and args.only not in e["pbs"]:
            continue
        if args.trigger and e["trig"] not in (None, args.trigger):
            continue
        out.append(e)
    return out


def survey(cur, entries):
    res = []
    for e in entries:
        rid, ch, apply, problem = HANDLERS[e["kind"]](cur, e)
        res.append((e, rid, ch, apply, problem))
    return res


def report(res, header):
    print(header)
    n_ch = n_prob = 0
    for e, rid, ch, _, problem in res:
        tag = f"[{','.join(sorted(e['pbs']))}{'/' + e['trig'] if e['trig'] else ''}] {e['kind']} {e['name']}" + (f" id={rid}" if rid else "")
        if problem:
            n_prob += 1
            print(f"  PROBLEM {tag}: {problem}")
        elif ch:
            n_ch += 1
            print(f"  CHANGE  {tag}")
            for c in ch:
                print(f"            {c}")
        else:
            print(f"  ok      {tag}")
    print(f"  -> {n_ch} to change, {n_prob} problem(s), {len(res) - n_ch - n_prob} already at seed")
    return n_ch, n_prob


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="print what would change (default)")
    ap.add_argument("--commit", action="store_true", help="apply, then read back every record")
    ap.add_argument("--only", choices=ALL_PBS, help="only the records this playbook reads or writes")
    ap.add_argument("--trigger", choices=list("ABCD"), help="only this trigger's copies (+ shared originals)")
    args = ap.parse_args()
    if args.commit and args.dry_run:
        ap.error("--commit and --dry-run are exclusive")
    entries = selected(args)
    scope = f"{args.only or 'all playbooks'}{' trigger ' + args.trigger if args.trigger else ''}"

    with connect() as conn:
        cur = conn.cursor()
        who = one(cur, "select email from auth.users where id=%s", (ADMIN,))
        if not who or who[0]["email"] != "admin@admin.com":
            sys.exit("identity check failed: the owner id is not admin@admin.com")
        org = one(cur, "select name from iam.organizations where id=%s", (ORG,))
        if not org or org[0]["name"] != "Harbor Dental Group":
            sys.exit("identity check failed: the organization id is not Harbor Dental Group")
        res = survey(cur, entries)
        n_ch, n_prob = report(res, f"{'COMMIT' if args.commit else 'DRY RUN'} — {scope} (live, admin@admin.com, Harbor Dental Group)")
        conn.rollback()
        if not args.commit:
            print("dry run: nothing written. Re-run with --commit to apply.")
            return 1 if n_prob else 0
        cur.execute("select set_config('app.actor_system', %s, true)", (ACTOR,))
        for e, rid, ch, apply, problem in res:
            if ch and apply and not problem:
                cur.execute("savepoint s")
                try:
                    apply(cur)
                    cur.execute("release savepoint s")
                except Exception as ex:  # keep going: report which record refused
                    cur.execute("rollback to savepoint s")
                    print(f"  WRITE REFUSED {e['kind']} {e['name']}: {str(ex).splitlines()[0]}")
        conn.commit()

    with connect() as conn:  # read back in a fresh transaction
        cur = conn.cursor()
        back = survey(cur, entries)
        conn.rollback()
    print(f"READ-BACK — {scope}")
    bad = 0
    for e, rid, ch, _, problem in back:
        tag = f"[{','.join(sorted(e['pbs']))}{'/' + e['trig'] if e['trig'] else ''}] {e['kind']} {e['name']}" + (f" id={rid}" if rid else "")
        if problem:
            bad += 1
            print(f"  DIFF {tag}: {problem}")
        elif ch:
            bad += 1
            print(f"  DIFF {tag}")
            for c in ch:
                print(f"         {c}")
        else:
            print(f"  PASS {tag}")
    print(f"  -> {len(back) - bad} PASS, {bad} DIFF")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
