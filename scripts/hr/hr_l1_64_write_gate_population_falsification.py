"""hr_l1_63 — the WRITE gate asks the population it just refused the READ for. Real HTTPS PostgREST.

Run:  cd /Users/armanisadeghi/code/aidream && uv run --with asyncpg --with httpx \
        python /Users/armanisadeghi/code/matrx-frontend/scripts/hr/hr_l1_63_write_gate_population_falsification.py
      (`--baseline` records the PRE-fix behaviour; directions (1) and (3) FAIL there, which is
       the defect. Direction (2) — the must-not-break — passes in BOTH runs or the fix is wrong.)

hr_l1_61 resolved the subject's nearest employment spell in `hr._l1_viewer` ONLY. Every write door
kept `(hr.employment_as_of(…, current_date)).id`, which is NULL for a prehire and for an
ex-employee, and `hr.capability` skips `population_contains` outright on a NULL subject. Same
admin, same second, same subject: READ refused, WRITE allowed. hr_l1_62 scoped the queue LIST but
not the per-instance door, so items the queue withheld stayed fully readable by uuid.

🚨 SAFE WRITE PROBES. Every write is `hr_employee_update` with an impossible p_expected_version
(-424242). The gate is evaluated BEFORE the version check (prosrc lines 13 vs 16), so:
      reason == 'forbidden'         → GATE REFUSED
      reason == 'version_conflict'  → GATE PASSED (and nothing was written)
The payload is `{}` besides. Employee version/updated_at are snapshotted before and asserted
byte-equal after, so "nothing was written" is measured, not assumed.

🚨 THE ORACLE IS INDEPENDENT ON PURPOSE. Expected membership is computed here from the department
on the subject's position assignment — as of today, else the intended future one, else the last
held — and NEVER by calling hr.capability. Asserting a door against the predicate the door itself
calls proves only that the function is deterministic.

FIXTURE: one department-scoped hr_admin row for tomo, staged and hard-deleted in the same run
(`finally`), with the WHOLE hr.role_assignment table checksummed before and after. No password is
set or typed anywhere; tokens come from admin generate_link + verify.
"""
import asyncio, hashlib, json, sys, uuid
import asyncpg, httpx

ENV = "/Users/armanisadeghi/code/aidream/.env"
BASELINE = "--baseline" in sys.argv

WTS = "2643e470-b275-47f3-95f3-ae275ad3ca47"
DEPT_OPERATIONS = "6715f29c-c677-4546-9c9a-5e2b591ab16e"
DEPT_FIELD_SERVICES = "d1c21852-5302-430a-8b76-60f97ca99250"
TOMO_EMPLOYMENT = "11dfa190-8762-4bca-b131-ee13ed397f72"

# the three subjects of the re-verifier's table — all three sit in Operations
SUBJECTS = [
    ("Nadia Okafor (active)",       "2ec4cbc9-6140-465d-8920-0c74a3937a82"),
    ("Mari36 Okonkwo (prehire)",    "b96d96ba-5e17-46ba-ae35-7b1afc444208"),
    ("G2offb Offboardme (ex-empl)", "f92cc1e8-5536-46bb-8233-2910a011f4ba"),
]

PERSONAS = {"tomo": "g2t13.tomas@example.test",       # no live grant of his own
            "priya": "admin+g2v.priya@admin.com",     # hr_admin, ORG-scoped, WTS
            "admin": "admin@admin.com"}               # hr_owner, ORG-scoped, WTS

FIXTURE_REASON = "hr_l1_63 falsification fixture - removed by the same script run"
R = []


def rec(case, expect, got, detail=""):
    ok = (expect == got)
    R.append((case, expect, got, ok, str(detail)[:240]))
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


# The independent oracle. The department an employee belongs to, resolved the way the ruling
# describes: as of today, else the intended (earliest future) assignment, else the last one held.
# hr.capability is nowhere in here.
DEPT_OF_EMPLOYEE = """
select (select pa.department_id
          from hr.position_assignment pa
          join hr.employment em on em.id = pa.employment_id
         where em.employee_id = $1::uuid and em.deleted_at is null
           and pa.deleted_at is null and pa.is_primary
         order by (pa.effective_from <= current_date
                   and (pa.effective_to is null or pa.effective_to >= current_date)) desc,
                  (pa.effective_from > current_date) desc,
                  case when pa.effective_from > current_date then pa.effective_from end asc
                    nulls last,
                  pa.effective_from desc
         limit 1)::text
"""

# Every WTS instance with the four IDENTITY standings resolved for one user, plus its subject's
# department. Again: no hr.capability.
INSTANCE_STANDING = """
select i.id::text                                        as instance_id,
       i.subject_employment_id::text                     as subject_employment,
       (select pa.department_id
          from hr.position_assignment pa
         where pa.employment_id = i.subject_employment_id
           and pa.deleted_at is null and pa.is_primary
         order by (pa.effective_from <= current_date
                   and (pa.effective_to is null or pa.effective_to >= current_date)) desc,
                  (pa.effective_from > current_date) desc,
                  case when pa.effective_from > current_date then pa.effective_from end asc
                    nulls last,
                  pa.effective_from desc
         limit 1)::text                                  as subject_department,
       (i.requester_employment_id = any($1::uuid[])
        or i.subject_employment_id = any($1::uuid[])
        or exists (select 1 from hr.workflow_step s
                    where s.workflow_instance_id = i.id and $2::uuid = any(s.resolved_user_ids))
        or exists (select 1 from hr.workflow_decision d
                    where d.workflow_instance_id = i.id and d.actor_user_id = $2::uuid))
                                                         as identity_standing
  from hr.workflow_instance i
 where i.organization_id = $3::uuid
 order by i.id
"""

ROLE_CHECKSUM = """
select coalesce(md5(string_agg(t, '|' order by t)), 'EMPTY') from (
  select ra.id::text || ra.organization_id::text || ra.employment_id::text || ra.role_key
         || coalesce(ra.scope_kind,'') || coalesce(ra.scope_id::text,'')
         || ra.is_active::text || coalesce(ra.revoked_at::text,'')
         || ra.effective_from::text || coalesce(ra.effective_to::text,'') as t
    from hr.role_assignment ra) s
"""

EMP_SNAPSHOT = """
select md5(string_agg(e.id::text || e.version::text || e.updated_at::text
                      || coalesce(e.preferred_first_name,'') || e.legal_last_name,
                      '|' order by e.id::text))
  from hr.employee e where e.id = any($1::uuid[])
"""


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
        return r.json()["access_token"]

    async def rpc(tokn, fn, payload):
        r = await http.post(f"{base}/rest/v1/rpc/{fn}",
                            headers={"apikey": anon, "Authorization": f"Bearer {tokn}",
                                     "Content-Type": "application/json",
                                     "Content-Profile": "public", "Accept-Profile": "public"},
                            json=payload)
        if r.status_code >= 400:
            return {"__http": r.status_code, "__body": r.text[:200]}
        return r.json()

    async def write_probe(tokn, employee_id):
        """GATE REFUSED | GATE PASSED | the raw answer if it is neither."""
        j = await rpc(tokn, "hr_employee_update",
                      {"p_employee_id": employee_id, "p_patch": {},
                       "p_expected_version": -424242})
        reason = (j or {}).get("reason")
        if reason == "forbidden":
            return "GATE REFUSED"
        if reason == "version_conflict":
            return "GATE PASSED"
        return f"OTHER:{json.dumps(j)[:120]}"

    async def instance_read(tokn, instance_id):
        j = await rpc(tokn, "hr_wf_instance", {"p_instance_id": instance_id})
        return bool((j or {}).get("granted"))

    role_id = None
    roles_before = await conn.fetchval(ROLE_CHECKSUM)
    emp_ids = [uuid.UUID(s[1]) for s in SUBJECTS]
    emp_before = await conn.fetchval(EMP_SNAPSHOT, emp_ids)
    print(f"role_assignment checksum before: {roles_before}")
    print(f"employee snapshot before:        {emp_before}\n")

    async def stage(dept_id):
        nonlocal role_id
        role_id = str(uuid.uuid4())
        await conn.execute(f"""
            do $fx$ begin perform hr.arm_write();
              insert into hr.role_assignment (id, organization_id, employment_id, role_key,
                     scope_kind, scope_id, is_active, effective_from, reason)
              values ('{role_id}'::uuid, '{WTS}'::uuid, '{TOMO_EMPLOYMENT}'::uuid, 'hr_admin',
                      'department', '{dept_id}'::uuid, true, current_date, '{FIXTURE_REASON}');
            end $fx$;""")

    async def unstage():
        nonlocal role_id
        if role_id:
            await conn.execute(f"do $fx$ begin perform hr.arm_write();"
                               f" delete from hr.role_assignment where id='{role_id}'::uuid;"
                               f" end $fx$;")
            role_id = None

    try:
        tok = {n: await mint(e) for n, e in PERSONAS.items()}
        tomo_uid = await conn.fetchval("select id from auth.users where email=$1", PERSONAS["tomo"])
        tomo_emps = await conn.fetch(
            "select id from hr.employment where employee_id = (select employee_id from hr.employment"
            " where id = $1::uuid)", uuid.UUID(TOMO_EMPLOYMENT))
        tomo_emp_ids = [r["id"] for r in tomo_emps]

        depts = {}
        for label, eid in SUBJECTS:
            depts[eid] = await conn.fetchval(DEPT_OF_EMPLOYEE, uuid.UUID(eid))
        print("independent oracle — subject departments:")
        for label, eid in SUBJECTS:
            print(f"    {label:30} dept={depts[eid]}")

        # ================================================================ (1) OUTSIDE the department
        print("\n=== (1) a DEPARTMENT-scoped admin writing OUTSIDE their department ===")
        print("    tomo, hr_admin scoped to G2F3 Field Services; all three subjects are Operations")
        await stage(DEPT_FIELD_SERVICES)
        tok["tomo"] = await mint(PERSONAS["tomo"])
        for label, eid in SUBJECTS:
            got = await write_probe(tok["tomo"], eid)
            inside = (depts[eid] == DEPT_FIELD_SERVICES)          # the oracle, not hr.capability
            exp = "GATE PASSED" if inside else "GATE REFUSED"
            if BASELINE and not inside and "active" not in label:
                # PRE-fix: only the ACTIVE subject resolved, so only that one was refused
                exp = "GATE PASSED"
            rec(f"(1) tomo(dept=Field Services) → {label}", exp, got,
                "oracle: subject is OUTSIDE the grant's department"
                + (" · PRE-FIX EXPECTATION (this is the defect)" if BASELINE and exp == "GATE PASSED"
                   else ""))
        await unstage()

        # ============================================ (2) 🚨 THE MUST-NOT-BREAK — passes in BOTH runs
        print("\n=== (2) 🚨 MUST NOT BREAK — ORG-scoped admins, and INSIDE the department ===")
        for who in ("admin", "priya"):
            for label, eid in SUBJECTS:
                got = await write_probe(tok[who], eid)
                rec(f"(2) {who} (ORG-scoped) → {label}", "GATE PASSED", got,
                    "all 8 live grants are org-scoped; if this breaks, everyone breaks")

        await stage(DEPT_OPERATIONS)
        tok["tomo"] = await mint(PERSONAS["tomo"])
        for label, eid in SUBJECTS:
            got = await write_probe(tok["tomo"], eid)
            inside = (depts[eid] == DEPT_OPERATIONS)
            rec(f"(2) tomo(dept=Operations) → {label}",
                "GATE PASSED" if inside else "GATE REFUSED", got,
                "the nearest-spell fallback must KEEP resolving a prehire and an ex-employee")
        await unstage()

        # ================================================== (3) the per-instance workflow door (1B)
        print("\n=== (3) the PER-INSTANCE workflow door under a department-scoped grant ===")
        await stage(DEPT_FIELD_SERVICES)
        tok["tomo"] = await mint(PERSONAS["tomo"])
        rows = await conn.fetch(INSTANCE_STANDING, tomo_emp_ids, tomo_uid, uuid.UUID(WTS))

        leaked, kept = [], []
        for r in rows:
            got = await instance_read(tok["tomo"], r["instance_id"])
            if r["identity_standing"]:
                exp = True                      # filed it / subject of it / routed / decided
            elif r["subject_employment"] is None:
                exp = True                      # no population to evaluate → affordance rung
            else:
                exp = (r["subject_department"] == DEPT_FIELD_SERVICES)
            if BASELINE and not exp:
                exp = True                      # PRE-fix: the org rung opened every instance
                leaked.append(r["instance_id"])
            elif exp and not r["identity_standing"]:
                kept.append(r["instance_id"])
            if got != exp:
                rec(f"(3) tomo(dept=Field Services) reads instance {r['instance_id'][:8]}"
                    f"{' [own standing]' if r['identity_standing'] else ''}", exp, got,
                    f"subject_dept={r['subject_department']}")
        # one aggregate row so a clean run is one line, not forty
        outside = [r for r in rows
                   if not r["identity_standing"] and r["subject_employment"] is not None
                   and r["subject_department"] != DEPT_FIELD_SERVICES]
        standing = [r for r in rows if r["identity_standing"]]
        got_outside = sorted({r["instance_id"] for r in outside
                              if await instance_read(tok["tomo"], r["instance_id"])})
        got_standing = sorted({r["instance_id"] for r in standing
                               if await instance_read(tok["tomo"], r["instance_id"])})
        rec("(3) instances OUTSIDE the department that stay readable by uuid",
            sorted(r["instance_id"] for r in outside) if BASELINE else [],
            got_outside, f"{len(outside)} instances about subjects outside Field Services")
        rec("(3) instances where tomo has his OWN standing (filed/subject/routed/decided)",
            sorted(r["instance_id"] for r in standing), got_standing,
            "legitimate standing must survive — this is the stranding direction")
        await unstage()

        print("\n=== (3) 🚨 MUST NOT BREAK — an ORG-scoped admin's instance reads ===")
        for who in ("admin", "priya"):
            uid = await conn.fetchval("select id from auth.users where email=$1", PERSONAS[who])
            emps = await conn.fetch(
                "select em.id from hr.employment em join hr.employee e on e.id = em.employee_id"
                " where e.login_user_id = $1::uuid", uid)
            all_ids = sorted(r["instance_id"] for r in rows)
            seen = sorted({i for i in all_ids if await instance_read(tok[who], i)})
            rec(f"(3) {who} (ORG-scoped) sees every WTS instance by uuid", all_ids, seen,
                f"{len(all_ids)} instances; org scope contains the whole employer")

    finally:
        try:
            await unstage()
        except Exception as e:  # noqa: BLE001
            print(f"🚨 FIXTURE CLEANUP FAILED: {e}")
        roles_after = await conn.fetchval(ROLE_CHECKSUM)
        emp_after = await conn.fetchval(EMP_SNAPSHOT, emp_ids)
        stray = await conn.fetchval(
            "select count(*) from hr.role_assignment where reason = $1", FIXTURE_REASON)
        print(f"\nrole_assignment checksum after:  {roles_after}")
        print(f"employee snapshot after:         {emp_after}")
        rec("restoration · hr.role_assignment is byte-equal to before the run",
            roles_before, roles_after, f"stray fixture rows: {stray}")
        rec("restoration · stray fixture rows", 0, stray)
        rec("nothing was written · the three subjects' employee rows are byte-equal",
            emp_before, emp_after, "every probe used p_expected_version = -424242")
        await conn.close()
        await http.aclose()

    fails = [r for r in R if not r[3]]
    print(f"\n================ {len(R) - len(fails)}/{len(R)} PASS "
          f"({'BASELINE' if BASELINE else 'POST-FIX'}) ================")
    for c, e, g, ok, d in R:
        if not ok:
            print(f"  FAIL {c}: expected {e}, got {g}")
    return 1 if fails else 0


sys.exit(asyncio.run(main()))
