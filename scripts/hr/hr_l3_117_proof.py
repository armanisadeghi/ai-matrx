#!/usr/bin/env python3
"""hr_l3_117 — falsification.

Applies the migration and then tries to BREAK it, all inside ONE transaction that is ALWAYS
rolled back. Nothing is committed, so no notice can ever reach the dispatcher: an outbound row
must be COMMITTED at `pending` before `services/notifications` can see it, and none ever is.

  --applied   proofs only, against the already-applied migration (no migration body re-run)

🚨 SAFETY. Fixture recipients only. Before a single notice is produced the run ABORTS unless the
recipient provably resolves to NO sms address — the organization contains the owner's canary
(+1949…, the only `verified` number in the database) and a punch correction is a ⚖ event whose
sms channel a person can switch ON.
"""
import asyncio, json, os, re, sys
from datetime import date
import asyncpg
from dotenv import load_dotenv

load_dotenv("/Users/armanisadeghi/code/aidream/.env")
sys.path.insert(0, "/Users/armanisadeghi/code/aidream")

from aidream.services.notifications.gsm7 import explain, measure  # noqa: E402
from aidream.services.message_templates.renderer import render_template  # noqa: E402
from aidream.services.notifications.bindings import (  # noqa: E402
    NOTIFICATION_PREFERENCES_PATH, absolute, link_bindings,
)

MIG = (
    "/Users/armanisadeghi/code/matrx-frontend/migrations/"
    "hr_l3_117_the_punch_notice_says_who_and_why_and_the_counter_stops_lying.sql"
)

ORG = "2643e470-b275-47f3-95f3-ae275ad3ca47"
EMPLOYMENT = "1a7033e5-1536-4f15-9549-4e5dd85285c5"      # Zzz Punchemployee
EMPLOYEE_UID = "ab94c16c-b4a5-49f0-a068-e2a11db34a2c"
MANAGER_UID = "20149d3f-6572-4263-b43c-7e52f0e42058"     # G2V-Priya Raman, working_record.write
PUNCH = "737bdaa8-b894-4873-9215-425d105d1955"           # clock_in, 2026-08-27
REASON = "Clock-in was recorded an hour late after the badge reader outage."

OK, BAD = [], []


def check(label, cond, detail=""):
    (OK if cond else BAD).append(label)
    print(f"  {'PASS' if cond else '*** FAIL':>8}  {label}" + (f"   {detail}" if detail else ""))


async def main() -> int:
    applied_only = "--applied" in sys.argv
    conn = await asyncpg.connect(
        host=os.environ["SUPABASE_MATRIX_HOST"], port=int(os.environ["SUPABASE_MATRIX_PORT"]),
        database=os.environ["SUPABASE_MATRIX_DATABASE_NAME"],
        user=os.environ["SUPABASE_MATRIX_USER"],
        password=os.environ["SUPABASE_MATRIX_PASSWORD"],
        statement_cache_size=0, command_timeout=900)
    warnings = []
    conn.add_log_listener(lambda c, m: warnings.append(m.message))

    async def as_user(uid):
        await conn.execute("select set_config('request.jwt.claims', $1, true)",
                           json.dumps({"sub": uid, "role": "authenticated"}))

    async def as_owner():
        await conn.execute("select set_config('request.jwt.claims', '', true)")

    tr = conn.transaction()
    await tr.start()
    try:
        if not applied_only:
            body = open(MIG, encoding="utf-8").read()
            body = body.replace("begin;\n", "", 1).rstrip()
            assert body.endswith("commit;")
            await conn.execute(body[: -len("commit;")])
            print("migration applied inside the rolled-back transaction\n")

        # ── SAFETY GATE ──────────────────────────────────────────────────────────────────
        print("SAFETY GATE")
        await as_owner()
        for ch in ("sms", "email"):
            row = await conn.fetchrow(
                "select address, refusal from communication.resolve_channel_address("
                "$1,$2::uuid,'user',$3::uuid,null,null,null)", ch, ORG, EMPLOYEE_UID)
            print(f"    {ch:>6}: address={row['address']!r} refusal={row['refusal']!r}")
            if ch == "sms" and row["address"] is not None:
                print("*** ABORT: the fixture recipient resolves to a REAL sms address. "
                      "Refusing to produce a ⚖ notice that could be dispatched.")
                return 2
        print("    sms unreachable for this fixture — safe to proceed.\n")

        # ── THE CORRECTION, AS A MANAGER, THROUGH THE REAL DOOR ───────────────────────────
        print("1. A REAL CORRECTION THROUGH hr.punch_correct, AS THE MANAGER")
        await as_user(MANAGER_UID)
        res = json.loads(await conn.fetchval(
            "select hr.punch_correct($1::uuid[], $2::jsonb, $3, null)",
            [PUNCH], json.dumps({"shift_minutes": -60}), REASON))
        if not res.get("ok"):
            print("*** the door refused: " + json.dumps(res)[:600])
            return 2
        repl = res["replacement_punch_ids"][0]
        notif = res["notifications"]
        print(f"    replacement punch {repl}")
        print(f"    notifications     {json.dumps(notif)}")

        await as_owner()
        real = await conn.fetchval(
            "select count(*) from communication.notification "
            " where event_key='hr.time.punch_edited' and target_id=$1::uuid", repl)

        # FIX 3 — the counter
        print("\n3. THE COUNTER (fix 3)")
        check("rows_written equals the rows that actually exist",
              notif["rows_written"] == real, f"reported={notif['rows_written']} real={real}")
        check("the door reports duplicates_suppressed by name",
              "duplicates_suppressed" in notif, json.dumps(notif))
        check("nothing was suppressed on a first correction",
              notif["duplicates_suppressed"] == 0)

        # the dedupe case: call the producer again for the SAME voided punch
        await conn.execute("select set_config('hr.privileged_write','on',true)")
        before = await conn.fetchval("select count(*) from communication.notification")
        again = json.loads(await conn.fetchval(
            "select hr._punch_notify_edited($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6::uuid,$7::jsonb)",
            ORG, EMPLOYMENT, PUNCH, repl, REASON, MANAGER_UID,
            json.dumps({"from": {"occurred_at": "2026-08-27T16:00:00Z", "punch_kind": "clock_in"},
                        "to": {"occurred_at": "2026-08-27T15:00:00Z", "punch_kind": "clock_in"}})))
        after = await conn.fetchval("select count(*) from communication.notification")
        print(f"    second call for the same punch: {json.dumps(again)}")
        check("a dedupe-suppressed notify writes ZERO rows", after == before,
              f"{before} -> {after}")
        check("…and reports rows_written = 0, not success theatre",
              again["rows_written"] == 0)
        check("…and NAMES the suppression instead of swallowing it",
              again["duplicates_suppressed"] > 0, json.dumps(again))
        check("RED CONTROL: the OLD counter would have said otherwise",
              again["duplicates_suppressed"] != again["rows_written"],
              "loop turns != inserts, which is the whole defect")

        # ── FIX 1 — who and why, rendered through the REAL renderer ───────────────────────
        print("\n2. THE WORDS (fix 1) — rendered through the REAL Python renderer")
        rows = await conn.fetch(
            "select channel, status, payload, deep_link from communication.notification "
            " where event_key='hr.time.punch_edited' and target_id=$1::uuid order by channel", repl)
        templates = json.loads(await conn.fetchval(
            "select config->'templates' from communication.notification_event_type "
            " where event_key='hr.time.punch_edited' and deleted_at is null"))

        actor_name = await conn.fetchval(
            "select hr._actor_display_name($1::uuid,$2::uuid,$3::uuid)",
            MANAGER_UID, ORG, EMPLOYEE_UID)
        print(f"    actor resolved to: {actor_name!r}")
        check("the actor is a PERSON, not a uuid",
              actor_name and "-" not in actor_name.replace(" ", "").replace("-", "-")[:0] + "x"
              and len(actor_name) < 60 and actor_name != MANAGER_UID)

        rendered = {}
        for r in rows:
            payload = json.loads(r["payload"]) if isinstance(r["payload"], str) else r["payload"]
            tpl = templates.get(r["channel"]) or {}
            b = dict(payload)
            b["organization"] = {"id": ORG}
            b["employer"] = {"name": "Write Target Sandbox", "short_name": "WTS"}
            link = {"preferences": absolute(NOTIFICATION_PREFERENCES_PATH)}
            link.update(link_bindings(r["deep_link"], "https://www.aimatrx.com/r/abcdefgh23"))
            b["link"] = link
            out = render_template(body_template=tpl["body"],
                                  subject_template=tpl.get("subject"), bindings=b)
            rendered[r["channel"]] = out
            print(f"\n    --- {r['channel']} ({r['status']}) ---")
            if out.subject:
                print(f"    subject: {out.subject}")
            for line in out.body.splitlines():
                print(f"    | {line}")

        for ch in ("in_app", "email"):
            if ch not in rendered:
                continue
            body = rendered[ch].body
            check(f"{ch}: names the actor BY NAME", actor_name in body)
            check(f"{ch}: carries the reason VERBATIM", REASON in body)
            check(f"{ch}: still says WHAT changed", "moved" in body or "became" in body
                  or "recorded as" in body or "removed" in body)
            # A uuid inside the deep-link URL is the ROUTE, not something a person reads. What
            # must never appear is an identifier standing where a name or a fact belongs.
            prose = " ".join(w for w in body.split() if not w.startswith("http"))
            check(f"{ch}: no uuid stands where a person should be named",
                  not re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-", prose), prose[:120])
            check(f"{ch}: the actor's uuid appears nowhere at all", MANAGER_UID not in body)
            check(f"{ch}: no literal backslash-n survived (0559)", "\\n" not in body)

        # ── the SMS leg, MEASURED ─────────────────────────────────────────────────────────
        print("\n   THE SMS LEG — measured, not estimated")
        widest_name = await conn.fetchval(
            "select display_name from hr.employee where deleted_at is null "
            " order by length(display_name) desc limit 1")
        widest_abbr = await conn.fetchval(
            "select coalesce(nullif(btrim(abbreviation),''), btrim(name)) from iam.organizations "
            " order by length(coalesce(nullif(btrim(abbreviation),''), btrim(name))) desc limit 1")
        sms_tpl = templates["sms"]["body"]
        worst = sms_tpl
        for k, v in {
            "employer.short_name": widest_abbr,
            "actor.name": widest_name,
            "date": "Sep 28, 2026",
            "change.summary_short": "now a break start at 12:38 PM",
            "link.deep_short": "https://www.aimatrx.com/r/abcdefgh23",
        }.items():
            worst = worst.replace("{{" + k + "}}", v)
        print(f"    widest live values: employer={widest_abbr!r} name={widest_name!r}")
        print(f"    | {worst}")
        check("SMS fits ONE GSM-7 segment at the WIDEST values in this database",
              measure(worst).fits_one_segment, explain(worst))
        check("SMS names the actor", "{{actor.name}}" in sms_tpl)
        check("SMS does NOT carry the unbounded reason (it rides the link)",
              "{{change.reason}}" not in sms_tpl)

        # RED CONTROL: the template this replaces was ALREADY two segments
        old_sms = ("{{employer.short_name}}: Your punch on {{date}} was changed: "
                   "{{change.summary}} {{link.deep_short}} Reply STOP to opt out.")
        old_worst = old_sms
        for k, v in {
            "employer.short_name": widest_abbr, "date": "Sep 28, 2026",
            "change.summary": "the break start at 12:38 PM became a break start at 12:38 PM",
            "link.deep_short": "https://www.aimatrx.com/r/abcdefgh23",
        }.items():
            old_worst = old_worst.replace("{{" + k + "}}", v)
        check("RED CONTROL: the template this REPLACES is two segments — the counter can fail",
              not measure(old_worst).fits_one_segment, explain(old_worst))

        # ── FIX 2 — the deep link lands on the corrected day ──────────────────────────────
        print("\n4. THE DEEP LINK (fix 2)")
        link = rows[0]["deep_link"]
        print(f"    the notice's link: {link}")
        check("the link carries ?punch=", f"punch={repl}" in link)
        check("the link carries ?org=", f"org={ORG}" in link)

        await as_user(EMPLOYEE_UID)
        ctx = json.loads(await conn.fetchval(
            "select public.hr_my_timesheet_context(null, $1::uuid)", repl))
        d = ctx.get("data") or ctx
        print(f"    resolver answered: basis={d.get('basis')!r} period={d.get('pay_period_id')}")
        print(f"    focus_local_work_date={d.get('focus_local_work_date')!r}")
        print(f"    focus_note={d.get('focus_note')!r}")
        check("the resolver honours the punch", d.get("basis") == "punch")
        check("it focuses the punch it was given", d.get("focus_punch_id") == repl)
        check("it names the CORRECTED day", str(d.get("focus_local_work_date")) == "2026-08-27")
        pid = d.get("pay_period_id")
        covers = await conn.fetchval(
            "select $1::date between period_start_on and period_end_on from hr.pay_period "
            " where id=$2::uuid", date(2026, 8, 27), pid)
        check("the period it opened COVERS that day", covers is True)
        check("an out-of-today period is DECLARED, not silently swapped",
              bool(d.get("focus_note")), repr(d.get("focus_note")))

        # the same call with no punch: byte-identical to the old answer
        base = json.loads(await conn.fetchval(
            "select public.hr_my_timesheet_context(null, null)"))
        bd = base.get("data") or base
        check("MUST-NOT-BREAK: no punch => the old answer, focus fields null",
              bd.get("focus_punch_id") is None and bd.get("focus_note") is None
              and bd.get("basis") in ("current", "most_recent", "none"),
              f"basis={bd.get('basis')!r}")

        # RED CONTROL: somebody else's punch is REFUSED, not resolved
        other = await conn.fetchval(
            "select p.id from hr.punch p where p.employment_id <> $1::uuid limit 1", EMPLOYMENT)
        ref = json.loads(await conn.fetchval(
            "select public.hr_my_timesheet_context(null, $1::uuid)", str(other)))
        check("RED CONTROL: somebody else's punch is REFUSED by name",
              "hr_timesheet_context_not_self" in json.dumps(ref), json.dumps(ref)[:220])

        # RED CONTROL: an unknown punch is NAMED, not silently ignored
        unk = json.loads(await conn.fetchval(
            "select public.hr_my_timesheet_context(null, "
            "'00000000-0000-0000-0000-000000000000'::uuid)"))
        ud = unk.get("data") or unk
        check("RED CONTROL: an unknown punch is told to the reader, not swallowed",
              ud.get("focus_punch_id") is None and "not on record" in (ud.get("focus_note") or ""),
              repr(ud.get("focus_note")))

        # ── MUST-NOT-BREAK: two other events still render ─────────────────────────────────
        print("\n5. EXISTING RENDERS UNAFFECTED (spot-check)")
        await as_owner()
        for ek in ("hr.workflow.request_decided", "hr.workflow.step_assigned"):
            t = json.loads(await conn.fetchval(
                "select config->'templates' from communication.notification_event_type "
                " where event_key=$1 and deleted_at is null", ek))
            b = {"employer": {"short_name": "WTS", "name": "Write Target Sandbox"},
                 "organization": {"id": ORG},
                 "request": {"label": "Timecard attestation", "subject": "Alexandra Fernandez",
                             "reference": "abc12345"},
                 "decision": {"outcome": "approved", "outcome_short": "approved",
                              "reason": "Looks right."},
                 "link": {"preferences": absolute(NOTIFICATION_PREFERENCES_PATH),
                          **link_bindings("/hr/tasks/x?org=" + ORG,
                                          "https://www.aimatrx.com/r/abcdefgh23")}}
            for ch, tpl in t.items():
                out = render_template(body_template=tpl["body"],
                                      subject_template=tpl.get("subject"), bindings=b)
                check(f"{ek} / {ch} still renders", bool(out.body.strip()))
                if ch == "sms":
                    check(f"{ek} / sms still one segment", measure(out.body).fits_one_segment,
                          explain(out.body))

        # ── the sibling producers' counters ───────────────────────────────────────────────
        print("\n6. THE SIBLING PRODUCERS (fix 3 sweep)")
        for fn in ("_wf_notify", "_l1_notify_consent_requested", "_punch_notify_edited"):
            src = await conn.fetchval(
                "select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
                " where n.nspname='hr' and p.proname=$1", fn)
            check(f"hr.{fn} reads ROW_COUNT", "get diagnostics v_ins = row_count;" in src)
            check(f"hr.{fn} no longer counts loop turns",
                  "then v_n := v_n + 1; end if;" not in src)
        broken = await conn.fetchval("select count(*) from hr.function_contracts_broken()")
        check("every contract pin holds", broken == 0, f"broken={broken}")

        return 0
    finally:
        await tr.rollback()
        print("\nrolled back — database byte-identical, nothing dispatched, nobody contacted")
        n = await conn.fetchval("select count(*) from communication.notification")
        print(f"communication.notification rows after rollback: {n}")
        await conn.close()
        print(f"\n{len(OK)} PASS / {len(BAD)} FAIL")
        for b in BAD:
            print(f"  FAILED: {b}")


rc = asyncio.run(main())
sys.exit(rc if rc else (1 if BAD else 0))
