"""LANE ONE-HOME (wave 4, after the switch's soak) — the store-only state check, READ-ONLY, live or clone.

    cd matrx-frontend
    SN_TARGET=live SN_OUT=<dir> uv run --project ../aidream python scripts/safety-net/probes/b_cutover_state.py
    uv run --project ../aidream python scripts/safety-net/probes/b_cutover_state.py --self-test

The probe that judged the hour of the final switch (readiness, the plan, the undo) retired with the switch: the
press is done, the undo is retired, the six older data tables are in the `deprecated` schema. What it proves now is
that the old side stays out of reach — the record store (`custom.*`) is the only home:

  C05 the deprecated schema holds the six older data tables, and none of them lives anywhere else;
  C05 no client role (anon, authenticated) holds any privilege on them;
  C04 no function a client may call names one of them (comments aside) without answering the refusal "The older
      tables moved…", except the doors check:old-system-unreachable's baseline owns by name (`db_doors`).
  C08 the context follow backlog is 0 (the record store's copy of the scope tables follows every edit; it stays
      until lane 9 moves the scope screens onto the store — the CTX clock).

Every read goes through b_db.read: the SESSION pooler (5432; the transaction pooler is refused for production), a
read-only transaction on its own connection, rolled back and closed by the client in `finally`. Nothing is written.
`--self-test` judges planted facts in memory, one rule at a time (each must go red alone), then clean facts (green).
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

TARGET = os.environ.get("SN_TARGET", "clone")
OUT = Path(os.environ.get("SN_OUT", str("/tmp/matrx-evidence/2026-10-01/safety-net/adhoc")))

REFUSAL = "The older tables moved"
CLIENT_ROLES = "'anon', 'authenticated'"

# The older tables are found by where they live (`deprecated`, `udt_` prefix), never named here, so this probe is not
# itself a place that names them (check:old-system-unreachable).
FACTS_SQL = f"""
with old as (
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'deprecated' and c.relname like 'udt\\_%' and c.relkind in ('r', 'p')
)
select jsonb_build_object(
  'old_tables_in_deprecated', (select count(*) from old),
  'old_tables_outside_deprecated', coalesce((
    select jsonb_agg(n.nspname || '.' || c.relname order by n.nspname, c.relname)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relname in (select relname from old) and n.nspname <> 'deprecated'), '[]'::jsonb),
  'client_grants_on_deprecated', coalesce((
    select jsonb_agg(r.rolname || ' on deprecated.' || c.relname order by r.rolname, c.relname)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join pg_roles r
     where n.nspname = 'deprecated' and c.relname in (select relname from old) and r.rolname in ({CLIENT_ROLES})
       and (has_table_privilege(r.oid, c.oid, 'SELECT') or has_table_privilege(r.oid, c.oid, 'INSERT')
            or has_table_privilege(r.oid, c.oid, 'UPDATE') or has_table_privilege(r.oid, c.oid, 'DELETE'))), '[]'::jsonb),
  'open_old_doors', coalesce((
    select jsonb_agg(p.oid::regprocedure::text order by 1)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname not in ('deprecated', 'pg_catalog', 'information_schema')
       and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
       and exists (select 1 from pg_roles r where r.rolname in ({CLIENT_ROLES}) and has_function_privilege(r.oid, p.oid, 'EXECUTE'))
       and exists (select 1 from old
                    where regexp_replace(regexp_replace(p.prosrc, '/\\*.*?\\*/', '', 'g'), '--[^\\n]*', '', 'g') ~ ('\\m' || old.relname || '\\M'))
       and position('{REFUSAL}' in p.prosrc) = 0), '[]'::jsonb),
  'follow_backlog', (
    select jsonb_build_object('n', count(*), 'orgs', count(distinct organization_id), 'oldest', min(created_at))
      from custom.io_outbox where event_key = 'context.follow' and consumed_at is null and deleted_at is null)
);
"""

#: Doors the old-system guard's baseline owns by name (`db_doors`, with an owner and why): the same list, one home.
BASELINE = Path(__file__).resolve().parents[2] / "old-system-unreachable" / "baseline.json"


def owned_doors() -> set[str]:
    return set(json.loads(BASELINE.read_text()).get("db_doors", {}))


#: How many older data tables the switch moved to `deprecated` (data sets, fields, rows, row versions, lists, items).
OLD_TABLE_COUNT = 6


def judge(facts: dict, owned: set[str] = frozenset()) -> list[dict]:
    """Every step from the facts alone (no database): the same function the live run and the self-test call.
    `owned` = the doors the old-system guard's baseline names with an owner (they leave with their machinery)."""
    out: list[dict] = []

    def step(items, name, ok, detail):
        out.append({"step": name, "items": items, "status": "PASS" if ok else "FAIL", "detail": detail[:900]})

    held = facts.get("old_tables_in_deprecated") or 0
    step(["C05"], "store_only.the_older_tables_are_in_deprecated", held >= OLD_TABLE_COUNT,
         f"{held} older data tables held in the deprecated schema (the switch moved {OLD_TABLE_COUNT})")
    outside = facts.get("old_tables_outside_deprecated") or []
    step(["C05"], "store_only.old_tables_only_in_deprecated", not outside,
         "no older data table lives outside the deprecated schema" if not outside
         else f"older data tables outside deprecated: {', '.join(outside)}")
    grants = facts.get("client_grants_on_deprecated") or []
    step(["C05"], "store_only.no_client_reaches_deprecated", not grants,
         "no client role holds a privilege on a deprecated older table" if not grants
         else f"client privileges on deprecated older tables: {', '.join(grants)}")
    doors = [d for d in facts.get("open_old_doors") or [] if d not in owned]
    step(["C04"], "store_only.no_older_door_answers", not doors,
         "no function a client may call names an older table without refusing" if not doors
         else f"functions a client may call that name an older table and do not refuse: {', '.join(doors)}")
    lag = facts.get("follow_backlog") or {}
    step(["C08"], "follow.backlog_zero", lag.get("n") == 0,
         f"{lag.get('n')} context edits waiting in {lag.get('orgs')} organizations (oldest {lag.get('oldest')})")
    return out


CLEAN = {
    "old_tables_in_deprecated": 6,
    "old_tables_outside_deprecated": [],
    "client_grants_on_deprecated": [],
    "open_old_doors": ["platform.owned_by_its_machinery(text)"],
    "follow_backlog": {"n": 0, "orgs": 0, "oldest": None},
}
OWNED = {"platform.owned_by_its_machinery(text)"}
PLANTS = {
    "store_only.the_older_tables_are_in_deprecated": {"old_tables_in_deprecated": 0},
    "store_only.old_tables_only_in_deprecated": {"old_tables_outside_deprecated": ["workbench.<an older table>"]},
    "store_only.no_client_reaches_deprecated": {"client_grants_on_deprecated": ["authenticated on deprecated.<an older table>"]},
    "store_only.no_older_door_answers": {"open_old_doors": ["platform.owned_by_its_machinery(text)", "public.a_reader_nobody_owns(uuid)"]},
    "follow.backlog_zero": {"follow_backlog": {"n": 3, "orgs": 1, "oldest": "2026-10-03T19:00:00Z"}},
}


def self_test() -> int:
    bad = 0
    clean = judge(CLEAN, OWNED)
    if any(s["status"] != "PASS" for s in clean):
        print(f"[FAIL] self-test: clean facts are not green: {clean}")
        bad += 1
    for rule, plant in PLANTS.items():
        steps = judge({**CLEAN, **plant}, OWNED)
        red = sorted(s["step"] for s in steps if s["status"] == "FAIL")
        if red != [rule]:
            print(f"[FAIL] self-test: planting {rule} turned {red or 'nothing'} red")
            bad += 1
        else:
            print(f"[PASS] self-test: planting {rule} turns exactly it red")
    print("self-test: " + ("GREEN" if not bad else f"{bad} failure(s)"))
    return 1 if bad else 0


def main() -> int:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import b_db  # noqa: E402 — the one read path: session pooler, client-side rollback, 6543 refused for production

    try:
        rows = b_db.read(FACTS_SQL, TARGET)
    except Exception as e:  # noqa: BLE001 — said, never swallowed
        print(f"[FAIL] b_cutover_state could not read the database: {str(e)[-600:]}")
        return 1
    facts = rows[-1][0] if rows else {}
    if isinstance(facts, str):
        facts = json.loads(facts)
    results = judge(facts, owned_doors())
    for s in results:
        print(f"[{s['status']}] {s['step']}: {s['detail'][:300]}", flush=True)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "b-cutover-state.json").write_text(json.dumps({"target": TARGET, "at": datetime.now(timezone.utc).isoformat(),
                                                          "results": results, "facts": facts}, indent=2, default=str))
    fails = [x for x in results if x["status"] == "FAIL"]
    print(f"\nb_cutover_state: {len(results) - len(fails)} pass · {len(fails)} fail → {OUT / 'b-cutover-state.json'}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv else main())
