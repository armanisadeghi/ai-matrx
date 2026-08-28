"""HRB-008 / HRB-009 — the jurisdiction rule-fixture gate is hermetic (SNAP-01).

Run:  cd /Users/armanisadeghi/code/aidream && uv run python \
        /Users/armanisadeghi/code/matrx-frontend/scripts/hr/hrb008_snap01_hermetic_proof.py

hr.run_rule_fixtures is a BLOCKING gate — migrations refuse to commit on a red run. SNAP-01 was red
(66/67, green=false) because its §4.4 enumeration counted `calculation_snapshot` rows CROSS-ORG, so
14 ambient snapshots in the sandbox org citing the same rule tipped its expected count from 1 to 15.
hr_c4_49 org-scoped the enumeration to the batch's org (v_org) — the faithful §4.4 semantic, and
hermetic because the fixture org holds only the probe's own transient write.

🚨 hr.calculation_snapshot is PROTECTED EVIDENCE (SPEC-JURISDICTION §4.5 — never deleted), so the
sandbox pollution is permanent and only grows. The gate must be green anyway; that is what this
proves. Everything runs in ONE rolled-back transaction.
"""
import asyncio, json, os, sys
import asyncpg
from dotenv import load_dotenv

load_dotenv("/Users/armanisadeghi/code/aidream/.env")
SANDBOX = "2643e470-b275-47f3-95f3-ae275ad3ca47"
FIXTURE_ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b"
R = []
def rec(n, ok, d=""):
    R.append((n, bool(ok), str(d)[:280]))

async def main():
    conn = await asyncpg.connect(
        host=os.environ["SUPABASE_MATRIX_HOST"], port=int(os.environ["SUPABASE_MATRIX_PORT"]),
        database=os.environ["SUPABASE_MATRIX_DATABASE_NAME"], user=os.environ["SUPABASE_MATRIX_USER"],
        password=os.environ["SUPABASE_MATRIX_PASSWORD"], statement_cache_size=0, command_timeout=900)
    try:
        # the gate is green, with the permanent evidence trail present
        full = json.loads(await conn.fetchval("select hr.run_rule_fixtures(null)::text"))
        snap = next(r for r in full["results"] if r["code"] == "SNAP-01")
        ambient = await conn.fetchval(
            "select count(*) from hr.calculation_snapshot where organization_id=$1", SANDBOX)
        rec("🚨 the BLOCKING gate run_rule_fixtures(NULL) is GREEN — migrations can commit again",
            full["green"] is True and full["failed"] == 0, f"{full['passed']}/{full['total']} green={full['green']}")
        rec("🚨 and SNAP-01 passes with the permanent evidence trail present — the fixture is hermetic, "
            "not dependent on ambient snapshot volume",
            snap["passed"] is True, f"ambient snapshots in sandbox org = {ambient}")
        rec("the enumeration stays EXACT (org-scoped), never loosened to >= 1",
            await conn.fetchval(
                "select prosrc like '%organization_id = v_org%' and prosrc like '%ORG-SCOPED (hr_c4_49)%' "
                "from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
                "where n.nspname='hr' and p.proname='_run_fixture_probe'"))

        # 🚨 HERMETICITY, DEMONSTRATED: write MORE ambient snapshots citing the same rule, in the
        # sandbox org, then SNAP-01 must STILL find exactly 1 (its own, in the fixture org). Rolled back.
        vrule = await conn.fetchval(
            "select r.id from hr.jurisdiction_rule r join hr.jurisdiction_rule_class rc on rc.id=r.rule_class_id "
            "where rc.slug='overtime' and r.jurisdiction_key='US-CA' and r.deleted_at is null limit 1")
        before = await conn.fetchval(
            "select count(*) from hr.calculation_snapshot where organization_id=$1 "
            "and resolution @> jsonb_build_object('resolved', jsonb_build_object('overtime', "
            "jsonb_build_object('rules', jsonb_build_array(jsonb_build_object('rule_id', $2::uuid)))))",
            SANDBOX, vrule)
        sp = conn.transaction(); await sp.start()
        await conn.execute("select set_config('hr.privileged_write','on',true)")
        for _ in range(5):
            await conn.execute(
                "select hr.write_calculation_snapshot($1,'hr_workweek', gen_random_uuid(),'overtime',"
                "'US-CA', date '2026-03-16','ot_engine','probe',"
                "jsonb_build_object('resolved', jsonb_build_object('overtime', jsonb_build_object('rules',"
                "  jsonb_build_array(jsonb_build_object('rule_id',$2::uuid,'rule_version',1))))),"
                "'{}'::jsonb,'{}'::jsonb,'{\"hours\":{\"ot_1_5\":4}}'::jsonb,'automation')",
                SANDBOX, vrule)
        after = await conn.fetchval(
            "select count(*) from hr.calculation_snapshot where organization_id=$1 "
            "and resolution @> jsonb_build_object('resolved', jsonb_build_object('overtime', "
            "jsonb_build_object('rules', jsonb_build_array(jsonb_build_object('rule_id', $2::uuid)))))",
            SANDBOX, vrule)
        snap2 = next(r for r in json.loads(await conn.fetchval(
            "select hr.run_rule_fixtures(array['SNAP-01'])::text"))["results"] if r["code"] == "SNAP-01")
        await sp.rollback()
        rec("🚨 with 5 MORE ambient snapshots citing the very rule SNAP-01 uses, SNAP-01 STILL PASSES — "
            "the cross-org count would have jumped, the org-scoped count does not",
            after == before + 5 and snap2["passed"] is True,
            f"ambient citing rule: {before} -> {after}; SNAP-01 passed={snap2['passed']}")

        # the probe does not leak: the fixture org stays empty
        rec("🚨 the probe LEAVES NOTHING — its own fixture org holds 0 snapshots (it rolls back)",
            (await conn.fetchval(
                "select count(*) from hr.calculation_snapshot where organization_id=$1", FIXTURE_ORG)) == 0)

        # the evidence guard is real: a delete is refused (why the pollution can't be swept)
        refused = False
        sp2 = conn.transaction(); await sp2.start()
        try:
            await conn.execute("select set_config('hr.privileged_write','on',true)")
            _rid = await conn.fetchval(
                "select id from hr.calculation_snapshot where organization_id=$1 "
                "and calculation_kind='overtime' limit 1", SANDBOX)
            await conn.execute("delete from hr.calculation_snapshot where id=$1", _rid)
        except Exception as e:
            refused = "never deleted" in str(e) or getattr(e, "sqlstate", None) == "42501"
        await sp2.rollback()
        rec("hr.calculation_snapshot is protected evidence — a DELETE is refused (SPEC-JURISDICTION §4.5), "
            "which is WHY the fixture must be hermetic rather than the pollution swept",
            refused)

        rec("the hr_c4_49 hermeticity contract is declared and unbroken",
            (await conn.fetchval(
                "select count(*) from hr.function_contract where home_migration='hr_c4_49' and is_active")) == 1
            and (await conn.fetchval("select count(*)=0 from hr.function_contracts_broken()")))
    except Exception as exc:
        rec("the proof ran to completion", False, f"{type(exc).__name__}: {exc}")
    finally:
        await conn.close()

    bad = [r for r in R if not r[1]]
    print(f"\n{'='*92}\nSNAP-01 HERMETICITY PROOF — {len(R)} assertions, {len(bad)} RED\n{'='*92}")
    for n, ok, d in R:
        print(f"  [{'PASS' if ok else 'FAIL'}] {n}" + (f"   << {d}" if not ok and d else ""))
    sys.exit(1 if bad else 0)

asyncio.run(main())
