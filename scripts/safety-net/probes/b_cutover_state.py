"""LANE SAFETY-NET-B (2026-10-01) — the cutover-mechanics state check, READ-ONLY, live or clone, before or after.

    cd matrx-frontend
    SN_TARGET=live SN_OUT=<dir> uv run --project ../aidream python scripts/safety-net/probes/b_cutover_state.py            # BEFORE
    SN_TARGET=live SN_OUT=<dir> SN_B_BEFORE=<before dir>/b-cutover-state.json uv run --project ../aidream python …         # AFTER

Every read goes through b_db.read: the SESSION pooler (5432; the transaction pooler is refused for production), a
read-only transaction on its own connection, rolled back and closed by the client in `finally`. Nothing is written.

BEFORE (state old) it proves:
  C01 readiness is Ready with 0 blocked, 0 need Copy again, 0 need the context copy, every platform check met, and
      it answers inside the 8 s a signed-in page's statement may run (the page 500s past that; FINAL-SWITCH-2 #3).
  C02 THE PLAN — the exact organizations the press will switch (written to b-cutover-state.json for the AFTER run).
  C08 the context follow backlog is 0 (every organization).
  A11 who has edits on a copy that the press will put back ("test edits"): only the test seats' own organizations.
  C04/C06 the 23 older write doors are still open to signed-in callers and births still follow each organization's
      switch (the before-state the press changes) — so the AFTER run can see the change.
  C10 the personal-key policy (window file) is named: absent before, present after.
  C12 the undo is reachable: platform.final_switch_undo exists and a signed-in admin may call it; the window file's
      inverse is on disk.
AFTER (state new, --after <before json>):
  C02 every planned organization is switched and NO organization outside the plan got a press row since BEFORE.
  C04 no older write door is executable by anon/authenticated; C05 no planned organization keeps a live older pick
      list or table; C06 the platform values say "born on the new side"; C08 backlog 0; C12 may_undo is offered.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

CODE = Path(__file__).resolve().parents[4]
TARGET = os.environ.get("SN_TARGET", "clone")
OUT = Path(os.environ.get("SN_OUT", str("/tmp/matrx-evidence/2026-10-01/safety-net/adhoc")))
OUT.mkdir(parents=True, exist_ok=True)
AFTER = sys.argv[sys.argv.index("--after") + 1] if "--after" in sys.argv else (os.environ.get("SN_B_BEFORE") or None)
TEST_SEAT_ORGS = {"884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f": "admin's Workspace", "0a54df90-eab8-4d07-ab29-81a45fb41e04": "Cedar Ridge Physical Therapy"}
PAGE_BUDGET_MS = 8000
WINDOW_POLICY = "api_keys_personal_rows_are_their_owners"
WINDOW_INVERSE = CODE / "matrx-frontend/migrations/inverse/tableapi1_a_personal_keys_row_is_its_persons_alone_down.sql"


def _env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if path.exists():
        for line in path.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                out.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    return out


sys.path.insert(0, str(Path(__file__).resolve().parent))
import b_db  # noqa: E402 — the one read path: session pooler, client-side rollback, 6543 refused for production


def q(sql: str) -> str:
    """One read-only transaction on its own connection (b_db.read); returns the single value of the one statement."""
    try:
        rows = b_db.read(sql, TARGET)
    except Exception as e:  # noqa: BLE001 — said, never swallowed
        raise RuntimeError(str(e)[-600:]) from e
    if not rows:
        return ""
    v = rows[-1][0]
    if isinstance(v, bool):
        return "t" if v else "f"
    if isinstance(v, (dict, list)):
        return json.dumps(v, default=str)
    return "" if v is None else str(v)


def qj(sql: str):
    return json.loads(q(sql) or "null")


results: list[dict] = []
facts: dict[str, object] = {}


def step(items: list[str], name: str, ok: bool | None, detail: str) -> None:
    status = "SKIP" if ok is None else "PASS" if ok else "FAIL"
    results.append({"step": name, "items": items, "status": status, "detail": detail[:900]})
    print(f"[{status}] {name}: {detail[:300]}", flush=True)


def main() -> int:
    # RETIRED after step two (2026-10-01 20:37Z, lane POST-MOVE-GATES): the six older tables are in the deprecated schema and the
    # undo is retired, so the readiness function this probe times and the older-table facts it plans/compares no longer
    # exist to be judged (platform._final_switch_orphan_lists reads the moved tables -> 42P01). The probe judged the
    # hour BEFORE the press; it SKIPs, said, once the older tables are gone. The retired board is proven by the
    # public door (cutover.old-system-unreachable, the census), not by this inner read.
    if q("select (to_regclass('workbench.udt_datasets') is null)") == "t":
        step(["C01", "C02", "C04", "C05", "C06", "C08", "C09", "C10", "C12", "A11"], "cutover.state.retired_after_step_two", None,
             "the older tables moved to the deprecated schema and the undo is retired: this probe judged the hour before the switch and reads tables that no longer exist")
        (OUT / "b-cutover-state.json").write_text(json.dumps({"target": TARGET, "after": bool(AFTER), "at": datetime.now(timezone.utc).isoformat(),
                                                              "results": results, "facts": {"retired": True}}, indent=2, default=str))
        print(f"\nb_cutover_state: 0 pass · 0 fail · 1 skip (retired after step two) → {OUT / 'b-cutover-state.json'}")
        return 0
    if TARGET == "live":
        quarantine = q("select count(*) from cron.job where active;")
        facts["active_cron_jobs"] = int(quarantine)
    # ── readiness, timed inside the database (what the page's signed-in statement must fit in) ──
    t = qj("""select jsonb_build_object('t0', extract(epoch from clock_timestamp())) || jsonb_build_object('r', platform._final_switch_readiness())
                     || jsonb_build_object('t1', extract(epoch from clock_timestamp()));""")
    r = t["r"]
    ms = round((t["t1"] - t["t0"]) * 1000)
    facts["readiness_ms"] = ms
    facts["readiness_says"] = r.get("says")
    facts["state"] = r.get("state")
    tot = r.get("totals") or {}
    unmet = [p["key"] for p in r.get("platform") or [] if not p.get("met")]
    plan = [{"id": o["id"], "name": o["name"], "plan": o["plan"]} for o in r.get("organizations") or []
            if o["plan"].get("press_tables") or o["plan"].get("press_context") or o["plan"].get("sweep_tables") or o["plan"].get("sweep_lists")]
    state = r.get("state")
    step(["C01"], "readiness.answers_in_time", ms < PAGE_BUDGET_MS, f"{ms} ms in the database (the page's budget {PAGE_BUDGET_MS} ms)")

    if not AFTER:
        step(["C01"], "readiness.ready", state == "old" and r.get("ready") is True and tot.get("blocked") == 0 and tot.get("need_copy_again") == 0
             and tot.get("need_context_copy") == 0 and not unmet,
             f"state {state}; {r.get('says')} totals {json.dumps(tot)}; unmet platform checks {unmet}; blocking {r.get('blocking')[:3] if r.get('blocking') else []}"
             + "".join(f"; needs Step 1: {o['name']} — " + "; ".join((c.get('detail') or c.get('says') or '')[:160] for c in (o.get('rerun_clears') or []) + (o.get('context_clears') or []))
                       for o in r.get("organizations") or [] if o.get("needs_copy_again") or o.get("needs_context_copy")))
        names = ", ".join(sorted(p["name"] for p in plan))
        step(["C02"], "plan.named", len(plan) > 0 and tot.get("to_switch") == len(plan),
             f"{len(plan)} organizations in the press's plan ({tot.get('to_switch')} to switch): {names}")
        facts["plan"] = plan
        facts["before_at"] = datetime.now(timezone.utc).isoformat()
        # Test edits the press puts back: who has them.
        ev = qj("""select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'evaluation', platform.cutover_tables_copied(o.id) -> 'evaluation')), '[]')
                     from iam.organizations o
                    where o.id in (select (x ->> 'id')::uuid from jsonb_array_elements(platform._final_switch_readiness() -> 'organizations') x
                                    where (x -> 'plan' ->> 'press_tables')::boolean);""")
        edited = [e for e in ev if (e["evaluation"] or {}).get("rows", 0) > 0]
        strangers = [e for e in edited if e["id"] not in TEST_SEAT_ORGS]
        step(["A11", "C02"], "plan.copy_edits_the_press_puts_back_are_only_test_seats",
             not strangers,
             "copy edits the press replaces with the older rows: "
             + ("; ".join(f"{e['name']}: {json.dumps(e['evaluation'])}" for e in edited) or "none")
             + (f" — NOT a test seat: {[e['name'] for e in strangers]}" if strangers else ""))
        # Step 1 adopts an ownerless list whose users are in one organization, but leaves its CHOICES with no
        # organization, and Copy again then refuses that organization ("custom.record_write_many: organization_id is
        # required") — found on clone-20261001 tonight (SAFETY-NET-B). Predict it: any list that already has an
        # organization whose choices (live or archived — the mover carries both) have none, and any list Step 1 would
        # adopt whose choices have none — the latter only while the adoption door does not give choices their list's
        # organization (lane ORPHAN-CHOICES, orphanchoices_an_adopted_lists_choices_take_its_organization.sql).
        orgless = q("""select coalesce(string_agg(l.list_name || ' (' || coalesce(o.name, 'to be adopted') || ')', '; '), '')
                         from workbench.udt_structured_lists l left join iam.organizations o on o.id = l.organization_id
                        where (l.organization_id is not null
                               or (l.deleted_at is null
                                   and pg_get_functiondef('platform.final_switch_adopt_orphan_lists(uuid)'::regprocedure) not like '%choices_given_their_list_organization%'
                                   and l.id in (select (x ->> 'id')::uuid from jsonb_array_elements(platform._final_switch_orphan_lists()) x where x ->> 'resolution' = 'organization')))
                          and not platform._older_list_moved_by_switch(l.id)
                          and exists (select 1 from workbench.udt_structured_list_items i where i.list_id = l.id and i.organization_id is null);""")
        step(["C01"], "step1.no_adopted_list_with_orgless_choices", orgless == "",
             "no list Step 1 adopts or copies has choices without an organization" if not orgless else f"Copy again will refuse these (their choices have no organization): {orgless}")
        doors_open = int(q("select count(*) filter (where has_function_privilege('authenticated', x, 'EXECUTE')) from unnest(platform._final_switch_old_write_doors()) x;"))
        n_doors = int(q("select cardinality(platform._final_switch_old_write_doors());"))
        step(["C04"], "doors.before_open_to_signed_in", doors_open == n_doors, f"{doors_open} of {n_doors} older write doors open to signed-in callers before the press")
        knob = q("select coalesce((select value::text from platform.feature_knob where feature='data_tables' and key='older_tables_moved'), 'absent');")
        step(["C06"], "births.before_follow_each_organization", knob == "false", f"data_tables/older_tables_moved = {knob} (the press sets it true)")
    else:
        before = json.loads(Path(AFTER).read_text())["facts"]
        step(["C01", "C02"], "state.after_is_new", state == "new", f"state {state}; {r.get('says')}")
        planned = {p["id"]: p for p in before["plan"]}
        rows = qj(f"""select coalesce(jsonb_agg(jsonb_build_object('org', p.organization_id, 'seam', p.seam_key, 'direction', p.direction, 'outcome', p.outcome, 'at', p.pressed_at)), '[]')
                        from platform.cutover_seam_press p
                       where p.pressed_at > '{before['before_at']}'::timestamptz and p.outcome = 'done'
                         and p.seam_key in ('older_tables', 'agent_context');""")
        pressed = {x["org"] for x in rows}
        outside = sorted(pressed - set(planned))
        missing = []
        for oid, p in planned.items():
            if p["plan"].get("press_tables"):
                d = q(f"select coalesce((platform._cutover_seam_last_done('older_tables', '{oid}')).direction, 'old');")
                if d != "new":
                    missing.append(p["name"])
        step(["C02"], "press.switched_exactly_the_plan", not outside and not missing,
             f"{len(planned)} planned; not switched: {missing or 'none'}; pressed outside the plan: {outside or 'none'}")
        live_older = qj(f"""select coalesce(jsonb_agg(jsonb_build_object('org', o.name, 'tables', (select count(*) from workbench.udt_datasets d where d.organization_id = o.id and d.deleted_at is null),
                                         'lists', (select count(*) from workbench.udt_structured_lists l where l.organization_id = o.id and l.deleted_at is null))), '[]')
                              from iam.organizations o where o.id = any('{{{",".join(planned)}}}'::uuid[]);""")
        left = [x for x in live_older if x["tables"] or x["lists"]]
        step(["C05", "C02"], "press.no_planned_org_keeps_live_older_tables_or_lists", not left, f"left live: {left or 'none'}")
        doors_open = int(q("select count(*) filter (where has_function_privilege('authenticated', x, 'EXECUTE') or has_function_privilege('anon', x, 'EXECUTE')) from unnest(platform._final_switch_old_write_doors()) x;"))
        step(["C04"], "doors.after_closed_to_clients", doors_open == 0, f"{doors_open} older write doors still executable by anon/authenticated")
        knob = q("select coalesce((select value::text from platform.feature_knob where feature='data_tables' and key='older_tables_moved'), 'absent');")
        step(["C06"], "births.after_in_the_store", knob == "true", f"data_tables/older_tables_moved = {knob}")
        step(["C12"], "undo.offered_after", r.get("state") == "new" and (r.get("undo") is not None), f"undo plan for {len((r.get('undo') or {}).get('plan') or [])} organizations; needs_confirm={(r.get('undo') or {}).get('needs_confirm')}")

    # C09 — the hour moves nothing to the deprecated schema (chair's ruling 2026-10-01 02:30 PT): every older table is where it
    # was, and nothing of the older systems sits in `deprecated`.
    kept = q("""select concat_ws(',', to_regclass('workbench.udt_datasets') is not null, to_regclass('workbench.udt_dataset_rows') is not null,
                       to_regclass('workbench.udt_structured_lists') is not null, to_regclass('context.scopes') is not null,
                       to_regclass('context.scope_types') is not null,
                       (select count(*) from pg_tables where schemaname = 'deprecated' and (tablename like 'udt\\_%' or tablename like 'scope%' or tablename like 'context%')));""")
    parts = kept.split(",")
    step(["C09"], "deprecated.nothing_moved", parts[:5] == ["t"] * 5 and parts[5] == "0",
         f"older tables in place (udt_datasets, udt_dataset_rows, udt_structured_lists, context.scopes, context.scope_types): {parts[:5]}; older-system tables in deprecated: {parts[5]}")
    lag = qj("""select jsonb_build_object('n', count(*), 'orgs', count(distinct organization_id), 'oldest', min(created_at))
                  from custom.io_outbox where event_key = 'context.follow' and consumed_at is null and deleted_at is null;""")
    step(["C08"], "follow.backlog_zero", lag["n"] == 0, f"{lag['n']} context edits waiting in {lag['orgs']} organizations (oldest {lag['oldest']})")
    has_policy = q(f"select exists (select 1 from pg_policy where polrelid = 'iam.api_keys'::regclass and polname = '{WINDOW_POLICY}');") == "t"
    facts["window_policy_present"] = has_policy
    step(["C10"], "window_policy.state", None if not AFTER else has_policy,
         f"{WINDOW_POLICY} on iam.api_keys: {'present' if has_policy else 'absent (the watched-window file has not been applied)'}")
    undo_ok = q("select has_function_privilege('authenticated', 'platform.final_switch_undo(text,boolean)', 'EXECUTE');") == "t"
    step(["C12"], "undo.reachable", undo_ok and WINDOW_INVERSE.exists(),
         f"final_switch_undo callable by a signed-in admin: {undo_ok}; window-file inverse on disk: {WINDOW_INVERSE.exists()}")

    (OUT / "b-cutover-state.json").write_text(json.dumps({"target": TARGET, "after": bool(AFTER), "at": datetime.now(timezone.utc).isoformat(),
                                                          "results": results, "facts": facts}, indent=2, default=str))
    fails = [x for x in results if x["status"] == "FAIL"]
    print(f"\nb_cutover_state: {sum(x['status'] == 'PASS' for x in results)} pass · {len(fails)} fail · {sum(x['status'] == 'SKIP' for x in results)} skip → {OUT / 'b-cutover-state.json'}")
    return 1 if fails else 0


if __name__ == "__main__":
    t0 = time.time()
    try:
        sys.exit(main())
    except RuntimeError as e:
        print(f"[FAIL] b_cutover_state could not read the database: {e}")
        sys.exit(1)
