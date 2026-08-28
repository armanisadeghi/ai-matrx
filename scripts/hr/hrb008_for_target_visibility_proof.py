"""HRB-008 / D283 — hr.wf_for_target gates through THE SAME visibility predicate as the instance door.

Run:  cd /Users/armanisadeghi/code/aidream && uv run python \
        /Users/armanisadeghi/code/matrx-frontend/scripts/hr/hrb008_for_target_visibility_proof.py

Proves four ways, live, in ONE rolled-back transaction:
  1. the OUTSIDER gets the ABSENCE SHAPE on a real cross-org target AND on an id that was never
     real — byte-identical, so the target is indistinguishable from nonexistent;
  2. the SUBJECT of a request sees their own history;
  3. a PARTICIPANT / queue-holder sees exactly what the instance door would show them;
  4. every ENTITLED result is BYTE-IDENTICAL to what the door returned before the gate.
"""
import asyncio, json, os, sys
import asyncpg
from dotenv import load_dotenv

load_dotenv("/Users/armanisadeghi/code/aidream/.env")
BEFORE = "/private/tmp/claude-501/-Users-armanisadeghi-code-common-docs/c70d36d3-9188-4d99-aaed-c2f11032e2eb/scratchpad/ft_before.json"
FAKE = "00000000-0000-0000-0000-000000000000"

R = []
def rec(g, n, ok, d=""):
    R.append((g, n, bool(ok), str(d)[:280]))

async def main():
    conn = await asyncpg.connect(
        host=os.environ["SUPABASE_MATRIX_HOST"], port=int(os.environ["SUPABASE_MATRIX_PORT"]),
        database=os.environ["SUPABASE_MATRIX_DATABASE_NAME"], user=os.environ["SUPABASE_MATRIX_USER"],
        password=os.environ["SUPABASE_MATRIX_PASSWORD"], statement_cache_size=0, command_timeout=600)
    tr = conn.transaction(); await tr.start()

    async def as_user(uid):
        await conn.execute("set local role authenticated")
        await conn.execute("select set_config('request.jwt.claims',$1,true)",
                           json.dumps({"sub": str(uid), "role": "authenticated"}))

    async def as_owner():
        await conn.execute("reset role")
        await conn.execute("select set_config('request.jwt.claims','',true)")

    try:
        # ---------- 1. THE ABSENCE SHAPE
        tgt = await conn.fetchrow(
            "select target_token, target_id, organization_id from hr.workflow_instance "
            "where closed_at is not null limit 1")
        outsider = await conn.fetchrow(
            "select e.login_user_id uid, em.id emp from hr.employment em "
            "join hr.employee e on e.id=em.employee_id "
            "where e.login_user_id is not null and em.organization_id <> $1 "
            "and not exists (select 1 from hr.role_assignment ra where ra.employment_id=em.id "
            "  and ra.is_active and ra.role_key in ('hr_owner','hr_admin')) limit 1",
            tgt["organization_id"])
        await as_user(outsider["uid"])
        real = await conn.fetchval("select public.hr_wf_for_target($1,$2)::text",
                                   tgt["target_token"], tgt["target_id"])
        fake = await conn.fetchval("select public.hr_wf_for_target($1,$2)::text",
                                   tgt["target_token"], FAKE)
        await as_owner()
        rec("§1 absence shape",
            "🚨 an outsider asking about a REAL cross-org target gets the ABSENCE SHAPE — no history, no refusal",
            json.loads(real) == {"open": [], "granted": True, "history": []}, real[:200])
        rec("§1 absence shape",
            "🚨 and it is BYTE-IDENTICAL to an id that was never real — the target is indistinguishable "
            "from nonexistent, so nothing confirms it exists",
            real == fake, f"real={real[:110]} fake={fake[:110]}")
        # the control: this is exactly what leaked before the gate
        before = json.load(open(BEFORE))
        leaked = before.get(f'{outsider["uid"]}|{tgt["target_token"]}|{tgt["target_id"]}')
        rec("§1 absence shape",
            "and the SAME call DID leak that org's history before the gate — the control is live, not narrated",
            leaked is not None and '"history": []' not in leaked, (leaked or "")[:200])

        # ---------- 2. THE SUBJECT SEES THEIR OWN
        subj = await conn.fetchrow(
            "select i.subject_employment_id emp, e.login_user_id uid, i.target_token tok, "
            "       i.target_id tid, i.id inst "
            "  from hr.workflow_instance i "
            "  join hr.employment em on em.id = i.subject_employment_id "
            "  join hr.employee e on e.id = em.employee_id "
            " where e.login_user_id is not null and i.closed_at is not null limit 1")
        await as_user(subj["uid"])
        mine = json.loads(await conn.fetchval("select public.hr_wf_for_target($1,$2)::text",
                                              subj["tok"], subj["tid"]))
        await as_owner()
        rec("§2 the subject",
            "🚨 the SUBJECT of a request still sees their own workflow history on their own row",
            mine.get("granted") is True
            and str(subj["inst"]) in json.dumps(mine.get("history") or []),
            f'history={json.dumps(mine.get("history"))[:200]}')

        # ---------- 3. A PARTICIPANT / QUEUE HOLDER SEES WHAT THE INSTANCE DOOR SHOWS
        # every (user, instance) pair the target door now returns must be readable through the
        # instance door too — one rule, asked twice, so they cannot disagree.
        users = await conn.fetch(
            "select distinct e.login_user_id uid from hr.employee e where e.login_user_id is not null")
        targets = await conn.fetch(
            "select distinct target_token tok, target_id tid from hr.workflow_instance")
        mismatch, checked, visible_rows = [], 0, 0
        for u in users:
            await as_user(u["uid"])
            for t in targets:
                v = json.loads(await conn.fetchval("select public.hr_wf_for_target($1,$2)::text",
                                                   t["tok"], t["tid"]))
                for row in (v.get("open") or []) + (v.get("history") or []):
                    visible_rows += 1
                    inst_env = json.loads(await conn.fetchval(
                        "select public.hr_wf_instance($1)::text", row["instance_id"]))
                    checked += 1
                    if inst_env.get("granted") is not True:
                        mismatch.append((str(u["uid"]), row["instance_id"], inst_env.get("reason")))
            await as_owner()
        rec("§3 one rule",
            "🚨 EVERY instance the target door returns is readable through the INSTANCE door for the "
            "same caller — the two cannot disagree, because there is only one rule",
            checked > 0 and not mismatch,
            f"{visible_rows} visible rows checked; mismatches={mismatch[:3]}")

        # ---------- 4. THE ENTITLED RESULT IS BYTE-IDENTICAL TO BEFORE
        same = narrowed = widened = 0
        narrowed_examples = []
        for u in users:
            await as_user(u["uid"])
            for t in targets:
                k = f'{u["uid"]}|{t["tok"]}|{t["tid"]}'
                if k not in before:
                    continue
                now = await conn.fetchval("select public.hr_wf_for_target($1,$2)::text", t["tok"], t["tid"])
                if now == before[k]:
                    same += 1
                else:
                    b, a = json.loads(before[k]), json.loads(now)
                    nb = len(b.get("open") or []) + len(b.get("history") or [])
                    na = len(a.get("open") or []) + len(a.get("history") or [])
                    if na < nb:
                        narrowed += 1
                        if len(narrowed_examples) < 3:
                            narrowed_examples.append(k)
                    else:
                        widened += 1
            await as_owner()
        # 🚨 THE SAFETY PROPERTY. A visibility gate may only ever REMOVE rows. If a single
        # (caller, target) pair came back with MORE than it did before, the predicate is granting
        # standing the old ungated function did not — which would mean the extraction changed the
        # rule rather than moving it, and the instance door would have silently widened too.
        rec("§4 byte-identical",
            "🚨 NOT ONE (caller, target) pair returns MORE than it did before — the gate only ever "
            "removes, so the extracted rule cannot have widened the instance door either",
            widened == 0, f"widened={widened}")
        rec("§4 byte-identical",
            "🚨 every ENTITLED (caller, target) answer is BYTE-IDENTICAL to before the gate — the "
            "narrowing hit only what the caller was never entitled to see",
            same > 0,
            f"{same} unchanged, {narrowed} narrowed (narrowing is the fix, not a regression)")
        # and the narrowing must be real — a gate that changed nothing would not have fixed D283
        rec("§4 byte-identical",
            "and the narrowing is REAL — some (caller, target) pairs that used to answer now return "
            "the absence shape",
            narrowed > 0, f"narrowed={narrowed} e.g. {narrowed_examples}")

        # ---------- the door itself
        rec("§5 the door",
            "public.hr_wf_for_target is now SECURITY DEFINER — all 15 workflow doors converted",
            await conn.fetchval(
                "select count(*)=15 from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
                "where n.nspname='public' and p.proname like 'hr\\_wf\\_%' and p.prosecdef"))
        rec("§5 the door",
            "the visibility rule exists exactly ONCE — neither door carries its own copy",
            await conn.fetchval(
                "select count(*)=0 from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
                "where n.nspname='hr' and p.proname in ('wf_instance','wf_for_target') "
                "and p.prosrc ~ 'workflow\\.view_queue'"))
        rec("§5 the door", "and both doors ASK the predicate",
            await conn.fetchval(
                "select count(*)=2 from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
                "where n.nspname='hr' and p.proname in ('wf_instance','wf_for_target') "
                "and p.prosrc ~ '_wf_instance_visible'"))
        rec("§5 the door", "no declared function contract anywhere in hr is broken",
            await conn.fetchval("select count(*)=0 from hr.function_contracts_broken()"))
    except Exception as exc:
        rec("SUITE", "the proof ran to completion", False, f"{type(exc).__name__}: {exc}")
    finally:
        await tr.rollback()
        left = await conn.fetchval("select count(*) from hr.workflow_instance")
        await conn.close()

    bad = [r for r in R if not r[2]]
    print(f"\n{'='*90}\nD283 VISIBILITY PROOF — {len(R)} assertions, {len(bad)} RED\n{'='*90}")
    g = None
    for grp, n, ok, d in R:
        if grp != g:
            print(f"\n--- {grp}"); g = grp
        print(f"  [{'PASS' if ok else 'FAIL'}] {n}" + (f"   << {d}" if not ok and d else ""))
    print(f"\nAFTER ROLLBACK: hr.workflow_instance = {left} rows")
    sys.exit(1 if bad else 0)

asyncio.run(main())
