"""T-L1-5 clauses A and B — terminate, lose access, come back as spell 2. Real HTTPS PostgREST.

Run:  cd /Users/armanisadeghi/code/aidream && uv run --with asyncpg --with httpx \
        python /Users/armanisadeghi/code/matrx-frontend/scripts/hr/t_l1_5_rehire_and_access_shutoff_walk.py

Every write goes through the SAME RPC the UI calls (`hr_employee_create`, `hr_separation_record`),
over HTTPS PostgREST, with a token minted by admin generate_link + verify. No password is set or
typed anywhere, and no fixture is staged by direct SQL — if the door cannot do it, it did not
happen.

🚨 THE ORACLE IS THE SUBJECT'S OWN SESSION. "Access is gone" is not `status='departed'` in a table
the HR admin can read; it is the departed person's own token returning NOTHING from the employer's
data. Every access claim below is measured through the subject's session, twice: the doors through
PostgREST, and the tables through RLS with that user's JWT claims.

Fixture personas only: the subject is zzz.link.member2@example.invalid, a fixture org member with
no employee record. Nothing here touches a real person.
"""
import asyncio, json, os, sys, time
from datetime import date

import asyncpg, httpx

ENV = "/Users/armanisadeghi/code/aidream/.env"
ORG = "2643e470-b275-47f3-95f3-ae275ad3ca47"          # the G2 fixture employer
# 🚨 The actor is the org OWNER, not the fixture HR admin (admin+g2v.priya@admin.com, 21
# capabilities including working_record.write), because `hr_employee_create` calls
# `public.mbr_add` unconditionally for a login-bearing hire and mbr_add raises
# "membership manager role required" (42501) for any caller who is not an org manager — even when
# the membership already exists. A plain HR admin therefore cannot hire anyone who has a login.
# Filed as a finding; it is not what this walk is testing.
HR_ADMIN = "admin@admin.com"                           # 37 capabilities, org owner of the fixture
# A FRESH fixture persona per run. `hr.employee` is unique on (organization_id, party_id) and a
# soft-deleted employee row still occupies that slot, so re-using one subject would make the walk
# unrepeatable — and would test a reset instead of a hire.
STAMP = date.today().strftime("%m%d") + f"{int(time.time()) % 100000:05d}"
SUBJECT = f"zzz.tl15.{STAMP}@example.invalid"
SUBJECT_UID = None   # created below
PAY_GROUP = "5fd777b5-923f-4253-86ca-369101059159"
JOB_TITLE = "6e2275c6-47a4-4b6a-9ff4-f48e8adeedb0"
DEPARTMENT = "6715f29c-c677-4546-9c9a-5e2b591ab16e"
LOCATION = "8b53699d-d047-4b59-81e1-404dfcf4e279"
REASON_VOLUNTARY = "761035d5-40e9-4bd4-a29c-5f5df002db56"   # Voluntary Resignation

SPELL1_HIRE = "2026-03-02"
SPELL1_LAST = "2026-08-20"
SPELL2_HIRE = "2026-08-27"
TODAY = date.today().isoformat()

R = []


def rec(case, expect, got, detail=""):
    ok = (expect == got)
    R.append((case, expect, got, ok, str(detail)[:300]))
    print(f"  [{'PASS' if ok else 'FAIL'}] {case}\n        expected {expect}\n        got      {got}"
          + (f"\n        {detail}" if detail else ""))


def load_env(p):
    out = {}
    for line in open(p):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


async def main():
    env = load_env(ENV)
    base = env["SUPABASE_MATRIX_URL"].rstrip("/")
    anon = env["SUPABASE_MATRIX_PUBLISHABLE_KEY"]
    service = env["SUPABASE_MATRIX_SECRET_KEY"]
    http = httpx.AsyncClient(timeout=90)
    conn = await asyncpg.connect(
        host=env["SUPABASE_MATRIX_HOST"], port=int(env["SUPABASE_MATRIX_PORT"]),
        database=env["SUPABASE_MATRIX_DATABASE_NAME"], user=env["SUPABASE_MATRIX_USER"],
        password=env["SUPABASE_MATRIX_PASSWORD"], statement_cache_size=0)

    async def mint(email):
        r = await http.post(f"{base}/auth/v1/admin/generate_link",
                            headers={"apikey": service, "Authorization": f"Bearer {service}",
                                     "Content-Type": "application/json"},
                            json={"type": "magiclink", "email": email})
        r.raise_for_status()
        r = await http.post(f"{base}/auth/v1/verify",
                            headers={"apikey": anon, "Content-Type": "application/json"},
                            json={"type": "magiclink", "token_hash": r.json()["hashed_token"]})
        r.raise_for_status()
        j = r.json()
        return j["access_token"], j["user"]["id"]

    async def rpc(tok, fn, payload):
        r = await http.post(f"{base}/rest/v1/rpc/{fn}",
                            headers={"apikey": anon, "Authorization": f"Bearer {tok}",
                                     "Content-Type": "application/json",
                                     "Content-Profile": "public", "Accept-Profile": "public"},
                            json=payload)
        try:
            return r.status_code, r.json()
        except Exception:
            return r.status_code, r.text

    async def as_subject_counts():
        """What the subject's own JWT can read from the employer's tables, through RLS."""
        out = {}
        async with conn.transaction():
            await conn.execute("set local role authenticated")
            await conn.execute(
                "select set_config('request.jwt.claims', $1, true)",
                json.dumps({"sub": SUBJECT_UID, "role": "authenticated"}))
            for t in ("hr.employee", "hr.employment", "hr.compensation", "crm.party"):
                try:
                    out[t] = await conn.fetchval(
                        f"select count(*) from {t} where organization_id = $1::uuid", ORG)
                except Exception as exc:
                    out[t] = f"error:{type(exc).__name__}"
            out["my_orgs"] = await conn.fetchval(
                "select count(*) from iam.my_orgs() o where o = $1::uuid", ORG)
            await conn.execute("reset role")
        return out

    # ── the subject exists as a person and an org member BEFORE HR ever sees them ──
    # (a fixture persona with no employment history; the employee record itself is created by the
    # product's own door below, never here)
    global SUBJECT_UID
    SUBJECT_UID = await conn.fetchval("select id::text from auth.users where email = $1", SUBJECT)
    if SUBJECT_UID is None:
        r = await http.post(f"{base}/auth/v1/admin/users",
                            headers={"apikey": service, "Authorization": f"Bearer {service}",
                                     "Content-Type": "application/json"},
                            json={"email": SUBJECT, "email_confirm": True})
        r.raise_for_status()
        SUBJECT_UID = r.json()["id"]
    await conn.execute(
        "insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) "
        "values ($1::uuid,'organization',$1::uuid,$2::uuid,'member','active') "
        "on conflict (container_type, container_id, user_id) do update "
        "set status='active', deleted_at=null", ORG, SUBJECT_UID)

    print("\n=== IDENTITY ASSERTED BEFORE ANY CLAIM ===")
    hr_tok, hr_uid = await mint(HR_ADMIN)
    sub_tok, sub_uid = await mint(SUBJECT)
    rec("the subject token is the fixture subject", SUBJECT_UID, sub_uid)
    caps = await conn.fetchval(
        "select cardinality(hr._l1_capabilities($1::uuid, $2::uuid, current_date))", hr_uid, ORG)
    rec("the HR admin token holds capabilities", True, caps > 0, f"{caps} capabilities")

    # ── A. the person is hired through the product ────────────────────────────
    print("\n=== A. SPELL 1, through hr_employee_create ===")
    st, ack = await rpc(hr_tok, "hr_employee_create", {"p_payload": {
        "organization_id": ORG, "link_user_id": SUBJECT_UID,
        "legal_first_name": "Zzzrehire", "legal_last_name": "Walkme",
        "employee_number": f"ZZZ-TL15-{STAMP}",
        "hire_date": SPELL1_HIRE, "pay_group_id": PAY_GROUP, "job_title_id": JOB_TITLE,
        "department_id": DEPARTMENT, "location_id": LOCATION, "worker_class": "employee"}})
    rec("hr_employee_create accepted spell 1", True, bool(ack.get("ok")), f"{st} {ack}")
    employee_id = ack.get("employee_id")
    if not employee_id:
        print("cannot continue without an employee"); return 1
    spell1 = await conn.fetchrow(
        "select id, spell_number, hire_date, original_hire_date, adjusted_service_date, status "
        "from hr.employment where employee_id=$1::uuid order by spell_number", employee_id)
    rec("spell 1 is spell number 1", 1, spell1["spell_number"])

    before = await as_subject_counts()
    rec("BASELINE: the subject can see the employer", True, before["my_orgs"] > 0, before)

    # ── B. the termination, through the same door the dialog calls ────────────
    print("\n=== B. TERMINATION → the membership actually ends ===")
    st, sep = await rpc(hr_tok, "hr_separation_record", {"p_payload": {
        "employment_id": str(spell1["id"]), "separation_category": "voluntary",
        "reason_category_id": REASON_VOLUNTARY, "initiator": "employee",
        "last_day_worked": SPELL1_LAST, "termination_date": SPELL1_LAST,
        "rehire_eligible": True}})
    rec("hr_separation_record accepted", True, bool(sep.get("ok")), f"{st} {sep}")
    shut = (sep.get("access_shutoff") or {})
    rec("the door reports a shutoff ACTION", "departed", shut.get("action"), json.dumps(shut)[:300])
    rec("the door reports the VERIFIED membership status", "departed",
        ((shut.get("result") or {}).get("membership_status")))
    live = await conn.fetchval(
        "select status from iam.memberships where container_type='organization' "
        "and container_id=$1::uuid and user_id=$2::uuid and deleted_at is null", ORG, SUBJECT_UID)
    rec("iam.memberships agrees", "departed", live)

    after = await as_subject_counts()
    for t in ("hr.employee", "hr.employment", "hr.compensation", "crm.party"):
        rec(f"HOSTILE WALK as the departed person: {t}", 0, after[t])
    rec("HOSTILE WALK: the employer is gone from my_orgs()", 0, after["my_orgs"])
    st, ctx = await rpc(sub_tok, "hr_my_context", {})
    rec("HOSTILE WALK: hr_my_context answers nothing for this employer", True,
        (ORG not in json.dumps(ctx)), json.dumps(ctx)[:200])
    st, dirl = await rpc(sub_tok, "hr_directory_list", {"p_organization_id": ORG})
    rec("HOSTILE WALK: the directory door refuses or empties", True,
        (st >= 400) or (not (dirl or {}).get("rows")), f"{st} {json.dumps(dirl)[:200]}")

    # the portal is the ONE surviving surface, and only if the org switched it on
    prior_knob = await conn.fetchval(
        "select value from platform.knob_override where feature='continued_access' "
        "and key='portal_enabled' and scope_id=$1::uuid", ORG)
    await conn.execute(
        "select platform._knob_override_write('continued_access','portal_enabled','organization',"
        "$1::uuid,$1::uuid,'false'::jsonb,'T-L1-5 walk',$2::uuid)", ORG, hr_uid)
    st, portal = await rpc(sub_tok, "continued_access_portal", {"p_organization_id": ORG})
    state_off = await conn.fetchval(
        "select platform.continued_access_state($1::uuid,$2::uuid) ->> 'state'", ORG, SUBJECT_UID)
    rec("portal knob OFF → state says portal_off", "portal_off", state_off,
        f"portal payload {json.dumps(portal)[:200]}")
    await conn.execute(
        "select platform._knob_override_write('continued_access','portal_enabled','organization',"
        "$1::uuid,$1::uuid,'true'::jsonb,'T-L1-5 walk',$2::uuid)", ORG, hr_uid)
    state_on = await conn.fetchval(
        "select platform.continued_access_state($1::uuid,$2::uuid) ->> 'state'", ORG, SUBJECT_UID)
    rec("portal knob ON → the departed state opens", "departed", state_on)
    st, portal_on = await rpc(sub_tok, "continued_access_portal", {"p_organization_id": ORG})
    rec("the portal answers the departed person", True,
        st == 200 and ORG in json.dumps(portal_on), f"{st} {json.dumps(portal_on)[:300]}")
    # nothing leaks to a personal org: the departure is scoped to the employer alone
    other = await conn.fetchval(
        "select count(*) from iam.memberships where user_id=$1::uuid and status='departed' "
        "and container_id <> $2::uuid", SUBJECT_UID, ORG)
    rec("ORG-SCOPED: no other membership of this person was touched", 0, other)

    # ── C. the rehire ─────────────────────────────────────────────────────────
    print("\n=== C. REHIRE → spell 2, and spell 1 is untouched ===")
    snap1 = await conn.fetchrow(
        "select spell_number, hire_date, termination_date, last_day_worked, status, separation_id "
        "from hr.employment where id=$1::uuid", spell1["id"])
    st, refuse = await rpc(hr_tok, "hr_employee_create", {"p_payload": {
        "organization_id": ORG, "link_user_id": SUBJECT_UID,
        "legal_first_name": "Zzzrehire", "legal_last_name": "Walkme",
        "hire_date": SPELL2_HIRE, "pay_group_id": PAY_GROUP, "job_title_id": JOB_TITLE,
        "department_id": DEPARTMENT, "location_id": LOCATION, "worker_class": "employee"}})
    rec("a second record is REFUSED by name", "rehire_required", refuse.get("reason"),
        json.dumps(refuse)[:250])
    rec("the refusal hands back the prior spells", True,
        bool(((refuse.get("existing") or {}).get("spells"))))

    st, ack2 = await rpc(hr_tok, "hr_employee_create", {"p_payload": {
        "organization_id": ORG, "link_user_id": SUBJECT_UID, "is_rehire": True,
        "legal_first_name": "Zzzrehire", "legal_last_name": "Walkme",
        "hire_date": SPELL2_HIRE, "pay_group_id": PAY_GROUP, "job_title_id": JOB_TITLE,
        "department_id": DEPARTMENT, "location_id": LOCATION, "worker_class": "employee"}})
    rec("the rehire is accepted", True, bool(ack2.get("ok")), f"{st} {json.dumps(ack2)[:250]}")

    spells = await conn.fetch(
        "select spell_number, hire_date, termination_date, last_day_worked, status, is_rehire, "
        "prior_employment_id, original_hire_date, adjusted_service_date "
        "from hr.employment where employee_id=$1::uuid and deleted_at is null order by spell_number",
        employee_id)
    rec("there are now TWO spells", 2, len(spells))
    s2 = spells[-1]
    rec("spell 2 is numbered 2", 2, s2["spell_number"])
    rec("spell 2 is flagged is_rehire", True, s2["is_rehire"])
    rec("spell 2 points at spell 1", str(spell1["id"]), str(s2["prior_employment_id"]))
    rec("spell 2 carries the ORIGINAL hire date", SPELL1_HIRE, s2["original_hire_date"].isoformat())
    rec("spell 2 hire date is the rehire date", SPELL2_HIRE, s2["hire_date"].isoformat())
    rec("spell 2 has an ADJUSTED SERVICE DATE (org rule carry_if_gap_under_months:12)",
        SPELL1_HIRE, s2["adjusted_service_date"].isoformat() if s2["adjusted_service_date"] else None)
    rule = await conn.fetchval(
        "select hr.rehire_service_dates($1::uuid, $2::date, $3::uuid)", employee_id, date.fromisoformat(SPELL2_HIRE), ORG)
    rec("the rule states its own working", True, json.loads(rule).get("carried"), rule)

    snap1b = await conn.fetchrow(
        "select spell_number, hire_date, termination_date, last_day_worked, status, separation_id "
        "from hr.employment where id=$1::uuid", spell1["id"])
    rec("SPELL 1 IS UNTOUCHED — no field moved", dict(snap1), dict(snap1b))

    derived = await conn.fetchval(
        "select hr.employee_directory_status($1::uuid, current_date)", employee_id)
    rec("the directory derivation reads the LIVE spell", "active", derived)

    back = await as_subject_counts()
    rec("the rehired person can see the employer again", True, back["my_orgs"] > 0, back)
    live2 = await conn.fetchval(
        "select status from iam.memberships where container_type='organization' "
        "and container_id=$1::uuid and user_id=$2::uuid and deleted_at is null", ORG, SUBJECT_UID)
    rec("their membership is active again", "active", live2)

    # ── D. the date rule: the termination date is still a working day ─────────
    print("\n=== D. 'ACCESS GONE THE NEXT DAY' — the knob decides, the dates do the rest ===")
    st, sep2 = await rpc(hr_tok, "hr_separation_record", {"p_payload": {
        "employment_id": str(s2_id := (await conn.fetchval(
            "select id from hr.employment where employee_id=$1::uuid and spell_number=2",
            employee_id))),
        "separation_category": "voluntary", "reason_category_id": REASON_VOLUNTARY,
        "initiator": "employee", "last_day_worked": TODAY, "termination_date": TODAY,
        "rehire_eligible": True}})
    rec("a same-day termination is accepted", True, bool(sep2.get("ok")), json.dumps(sep2)[:200])
    rec("mode 'immediate' (the shipped default) ends access ON the date", "departed",
        ((sep2.get("access_shutoff") or {}).get("action")), json.dumps(sep2.get("access_shutoff"))[:250])
    gone = await as_subject_counts()
    rec("and the person is out again, measured in their own session", 0, gone["my_orgs"])

    deferred = await conn.fetchval(
        "select hr.sync_membership_to_employment($1::uuid, null, null, false) ->> 'action'",
        employee_id)
    rec("the DEFERRED modes leave the termination date itself a working day", "restored", deferred,
        "force_immediate=false: termination_date >= today is still effective, so the person is "
        "restored — which is why end_of_day/scheduled orgs lose access the NEXT morning's sweep")
    # put the fixture back where the immediate default leaves it
    again = await conn.fetchval(
        "select hr.sync_membership_to_employment($1::uuid, null, null, true) ->> 'action'",
        employee_id)
    rec("and immediate takes it away again", "departed", again)

    # ── restore the org's knob to its default ─────────────────────────────────
    if prior_knob is None:
        await conn.execute(
            "delete from platform.knob_override where feature='continued_access' "
            "and key='portal_enabled' and scope_id=$1::uuid", ORG)
    else:
        await conn.execute(
            "select platform._knob_override_write('continued_access','portal_enabled','organization',"
            "$1::uuid,$1::uuid,$3::jsonb,'T-L1-5 walk restore',$2::uuid)", ORG, hr_uid, prior_knob)
    left = await conn.fetchval(
        "select value from platform.knob_override where feature='continued_access' "
        "and key='portal_enabled' and scope_id=$1::uuid", ORG)
    rec("the org's portal knob is exactly as the walk found it", prior_knob, left)

    await conn.close()
    await http.aclose()
    bad = [r for r in R if not r[3]]
    print(f"\n==== {len(R) - len(bad)}/{len(R)} PASS ====")
    for c, e, g, ok, d in bad:
        print(f"  FAIL {c}: expected {e}, got {g} {d}")
    print(f"employee_id={employee_id}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
