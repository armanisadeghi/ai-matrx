"""HRB-007 CROSS-ORG CAPABILITY PROOF — the tenant boundary in hr.capability, proven live.

Run:  cd /Users/armanisadeghi/code/aidream && .venv/bin/python \
        /Users/armanisadeghi/code/matrx-frontend/scripts/hr/hrb007_cross_org_proof.py

🚨 WHY THIS EXISTS. `hr.population_contains` used to return TRUE unconditionally for
`scope_kind='org'`, on the stated assumption that "every caller has already scoped by
organization_id" — and `hr.capability` arm 2, its most important caller, had not. An `hr_owner`
whose ONLY role was in org A therefore held working_record.write, comp.read, medical.read AND
ssn.reveal over org B's employments, and `hr_confidential_get` handed over org B's pay. Found by
the L3 punch builder, reproduced, and closed in migration
`hr_c3_13_cross_org_capability_boundary` by enforcing the boundary INSIDE both functions.

This is the permanent regression test for that boundary. It builds a complete employment in a
SECOND tenant inside ONE transaction that is ALWAYS ROLLED BACK, aims every capability an org-A
owner holds at it, and asserts every one is refused — plus the control, that org-A standing still
works inside org A. A green run means the boundary is enforced; a red run means it is not.

Connection comes from the five SUPABASE_MATRIX_* variables in aidream/.env.
🚨 statement_cache_size=0 is required: the host is pgbouncer in transaction pooling mode.
"""
import asyncio, pathlib, sys
import asyncpg

cfg = {}
for line in pathlib.Path("/Users/armanisadeghi/code/aidream/.env").read_text().splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        cfg[k.strip()] = v.strip().strip('"').strip("'")

DSN = dict(host=cfg["SUPABASE_MATRIX_HOST"], port=int(cfg.get("SUPABASE_MATRIX_PORT") or 5432),
           user=cfg["SUPABASE_MATRIX_USER"], password=cfg["SUPABASE_MATRIX_PASSWORD"],
           database=cfg.get("SUPABASE_MATRIX_DATABASE_NAME") or "postgres", statement_cache_size=0)

PROBE = r"""do $probe$
-- SPEC-ACCESS §9 fixture preamble. Everything here is created inside ONE transaction that is
-- ALWAYS rolled back by the terminating RAISE, so the database is left byte-identical.
-- Real org, real auth.users rows, real `authenticated` role, real JWT claims.
--
--   ORG      Titanium f9cb3e35 (a real customer org with real members)
--   U_SELF   projectmanager@   392afd39  plain member; the SUBJECT of the fixture employment
--   U_OTHER  seo@              c5e92166  plain member, no HR standing, not the subject
--   U_HR     arman@titanium…   34ed4fc3  org ADMIN (so it doubles as the T-8b org-admin identity)
--   U_STAFF  info@aimatrx.com  6555aa73  platform admin AND super admin, NOT a member of the org
--            (the register's recorded trap: an admin who is also an org member reaches rows
--             through the customer-side org lane and proves nothing about the wall)
declare
  v_org    uuid := 'f9cb3e35-2a65-4f2a-8525-088d6551071c';
  u_self   uuid := '392afd39-d59c-4418-866b-451e9d93fead';
  u_other  uuid := 'c5e92166-e148-4e73-926e-83af0c453665';
  u_hr     uuid := '34ed4fc3-c527-4819-99bf-15c26603b261';
  u_staff  uuid := '6555aa73-c647-4ecf-8a96-b60e315b6b18';
  v_party  uuid; v_party2 uuid; v_party3 uuid; v_party4 uuid; v_prof uuid;
  -- a PURPOSE-BUILT non-admin HR identity, created and rolled back with everything else.
  -- The fixture's u_hr is a real ORG ADMIN, so it reaches the working record through the kernel's
  -- org-admin arm (§9 T-8b) and can never prove anything about an HR ROLE. u_hradmin is a plain
  -- member with no org standing at all, so every capability it shows came from the role.
  u_hradmin uuid := gen_random_uuid();
  v_hademp uuid; v_hadempl uuid; v_loc uuid; v_dept uuid; v_jt uuid; v_jur uuid;
  -- the subject
  v_emp    uuid; v_empl uuid; v_pa uuid; v_priv uuid; v_comp uuid;
  -- the HR admin's own person
  v_hremp  uuid; v_hrempl uuid; v_hrpa uuid;
  -- a manager and their report
  v_mgremp uuid; v_mgrempl uuid; v_mgrpa uuid;
  r text := ''; n int; b boolean; v jsonb; e text; i int;
begin
  perform set_config('hr.privileged_write','on',true);
  select id into v_party  from crm.party where organization_id = v_org order by id offset 0 limit 1;
  select id into v_party2 from crm.party where organization_id = v_org order by id offset 1 limit 1;
  select id into v_party3 from crm.party where organization_id = v_org order by id offset 2 limit 1;
  select id into v_party4 from crm.party where organization_id = v_org order by id offset 3 limit 1;
  if v_party4 is null then raise exception 'fixture needs 4 crm.party rows in the org'; end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  values (u_hradmin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'c3-probe-hradmin+' || substr(u_hradmin::text,1,8) || '@example.invalid', '',
          now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
  -- iam.organization_member is a VIEW over iam.memberships; membership is written to the base table
  insert into iam.memberships (container_type, container_id, organization_id, user_id, role, status)
  values ('organization', v_org, v_org, u_hradmin, 'member', 'active');
  select id into v_jur from hr.jurisdiction where level = 'federal' limit 1;
  if v_jur is null then select id into v_jur from hr.jurisdiction limit 1; end if;

  insert into hr.employer_profile (organization_id, legal_name, ein)
    values (v_org,'C3 Probe Co','00-0000000') returning id into v_prof;
  insert into hr.location (organization_id, name, tz, jurisdiction_id)
    values (v_org,'C3 Probe Site','America/Los_Angeles', v_jur) returning id into v_loc;
  insert into hr.department (organization_id, name) values (v_org,'C3 Probe Dept') returning id into v_dept;
  insert into hr.job_title (organization_id, title, code, eeo1_job_category)
    values (v_org,'C3 Probe Title','C3PT','professionals') returning id into v_jt;

  -- ---- the subject: a plain employee with a platform login
  insert into hr.employee (organization_id, party_id, employee_number, legal_first_name,
                           legal_last_name, display_name, login_user_id)
    values (v_org, v_party,'C3S-'||substr(gen_random_uuid()::text,1,8),'Sub','Ject','Sub Ject', u_self)
    returning id into v_emp;
  insert into hr.employment (organization_id, employee_id, employer_profile_id, hire_date, status, created_by)
    values (v_org, v_emp, v_prof, current_date - 400,'active', u_self) returning id into v_empl;

  -- ---- the manager
  insert into hr.employee (organization_id, party_id, employee_number, legal_first_name,
                           legal_last_name, display_name, login_user_id)
    values (v_org, v_party2,'C3M-'||substr(gen_random_uuid()::text,1,8),'Man','Ager','Man Ager', u_other)
    returning id into v_mgremp;
  insert into hr.employment (organization_id, employee_id, employer_profile_id, hire_date, status, created_by)
    values (v_org, v_mgremp, v_prof, current_date - 500,'active', u_other) returning id into v_mgrempl;
  insert into hr.position_assignment (organization_id, employment_id, job_title_id, department_id,
      location_id, is_primary, worker_class, flsa_status, flsa_exemption_basis, pay_basis, schedule_class, effective_from)
    values (v_org, v_mgrempl, v_jt, v_dept, v_loc, true,'employee','exempt','executive','salary','full_time', current_date - 500)
    returning id into v_mgrpa;

  insert into hr.position_assignment (organization_id, employment_id, job_title_id, department_id,
      location_id, manager_employment_id, is_primary, worker_class, flsa_status, pay_basis,
      schedule_class, effective_from)
    values (v_org, v_empl, v_jt, v_dept, v_loc, v_mgrempl, true,'employee','nonexempt','hourly','full_time', current_date - 400)
    returning id into v_pa;

  -- ---- the HR admin's own person (so "the HR admin's own record" is testable)
  insert into hr.employee (organization_id, party_id, employee_number, legal_first_name,
                           legal_last_name, display_name, login_user_id)
    values (v_org, v_party3,'C3H-'||substr(gen_random_uuid()::text,1,8),'Aitch','Arr','Aitch Arr', u_hr)
    returning id into v_hremp;
  insert into hr.employment (organization_id, employee_id, employer_profile_id, hire_date, status, created_by)
    values (v_org, v_hremp, v_prof, current_date - 600,'active', u_hr) returning id into v_hrempl;
  insert into hr.position_assignment (organization_id, employment_id, job_title_id, department_id,
      location_id, is_primary, worker_class, flsa_status, flsa_exemption_basis, pay_basis, schedule_class, effective_from)
    values (v_org, v_hrempl, v_jt, v_dept, v_loc, true,'employee','exempt','administrative','salary','full_time', current_date - 600)
    returning id into v_hrpa;

  -- ---- the confidential rows, owned by their SUBJECT (SPEC-ACCESS §3)
  insert into hr.employee_private (organization_id, employee_id, ssn_last4, home_address, created_by)
    values (v_org, v_emp,'6789','{"line1":"1 Probe Way","region":"CA"}'::jsonb, u_self)
    returning id into v_priv;
  insert into hr.compensation (organization_id, employment_id, component_kind, pay_basis, amount,
                               per_unit, effective_from, created_by)
    values (v_org, v_empl,'base','hourly', 42.50,'hour', current_date - 400, u_self)
    returning id into v_comp;

  -- ---- the non-admin HR administrator's own person
  insert into hr.employee (organization_id, party_id, employee_number, legal_first_name,
                           legal_last_name, display_name, login_user_id)
    values (v_org, v_party4,'C3A-'||substr(gen_random_uuid()::text,1,8),'Hay','Dee','Hay Dee', u_hradmin)
    returning id into v_hademp;
  insert into hr.employment (organization_id, employee_id, employer_profile_id, hire_date, status, created_by)
    values (v_org, v_hademp, v_prof, current_date - 700,'active', u_hradmin) returning id into v_hadempl;
  insert into hr.position_assignment (organization_id, employment_id, job_title_id, department_id,
      location_id, is_primary, worker_class, flsa_status, flsa_exemption_basis, pay_basis,
      schedule_class, effective_from)
    values (v_org, v_hadempl, v_jt, v_dept, v_loc, true,'employee','exempt','administrative','salary','full_time', current_date - 700)
    returning id into v_hrpa;

  declare
    v_orgB uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';   -- AI Matrx: a DIFFERENT tenant
    v_ptyB uuid; v_profB uuid; v_empB uuid; v_emplB uuid; v_jtB uuid; v_deptB uuid; v_locB uuid;
    v_jurB uuid; v_compB uuid; c text;
  begin
  -- org-A standing ONLY: the fixture's non-admin HR identity becomes hr_owner of Titanium
  insert into hr.role_assignment (organization_id, employment_id, role_key, scope_kind, effective_from)
  values (v_org, v_hadempl, 'hr_owner', 'org', current_date - 10);

  -- a complete employment in ORG B, with which the org-A owner has no relationship whatsoever
  select id into v_jurB from hr.jurisdiction where level='federal' limit 1;
  insert into crm.party (organization_id, party_kind, display_name)
    values (v_orgB,'person','Cross-org probe') returning id into v_ptyB;
  insert into hr.employer_profile (organization_id, legal_name, ein)
    values (v_orgB,'Org B Co','11-1111111') returning id into v_profB;
  insert into hr.location (organization_id, name, tz, jurisdiction_id)
    values (v_orgB,'B site','America/New_York', v_jurB) returning id into v_locB;
  insert into hr.department (organization_id, name) values (v_orgB,'B dept') returning id into v_deptB;
  insert into hr.job_title (organization_id, title, code, eeo1_job_category)
    values (v_orgB,'B title','BT1','professionals') returning id into v_jtB;
  insert into hr.employee (organization_id, party_id, employee_number, legal_first_name,
                           legal_last_name, display_name)
    values (v_orgB, v_ptyB,'B-1','Bee','Person','Bee Person') returning id into v_empB;
  insert into hr.employment (organization_id, employee_id, employer_profile_id, hire_date, status)
    values (v_orgB, v_empB, v_profB, current_date-200,'active') returning id into v_emplB;
  insert into hr.position_assignment (organization_id, employment_id, job_title_id, department_id,
      location_id, is_primary, worker_class, flsa_status, pay_basis, schedule_class, effective_from)
    values (v_orgB, v_emplB, v_jtB, v_deptB, v_locB, true,'employee','nonexempt','hourly','full_time', current_date-200);
  insert into hr.compensation (organization_id, employment_id, component_kind, pay_basis, amount,
                               per_unit, effective_from)
    values (v_orgB, v_emplB,'base','hourly', 99.00,'hour', current_date-200) returning id into v_compB;

  -- 🚨 THE LEAK: every capability an org-A owner holds, aimed at an ORG-B employment
  foreach c in array ARRAY['working_record.read','working_record.write','comp.read','comp.write',
                           'medical.read','ssn.reveal','identity.read','incident.read','role.assign'] loop
    r := r || format('X %s over ORG B = %s (want f); ', c, hr.capability(u_hradmin, c, v_emplB));
  end loop;

  -- population_contains itself, the root
  r := r || format('X population_contains(org) across tenants = %s (want f); ',
                   hr.population_contains('org', null, v_emplB, current_date, v_hadempl));

  -- and the door that trusts it
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', json_build_object('sub', u_hradmin,'role','authenticated')::text);
  v := public.hr_confidential_get('hr_compensation', v_compB, 'payroll');
  r := r || format('X door reads ORG B pay granted=%s (want f); ', v->>'granted');
  execute 'set local role none';

  -- the control: org-A standing must still work in org A
  r := r || format('OK org-A owner over org A comp.read = %s (want t); ',
                   hr.capability(u_hradmin,'comp.read', v_empl));
  r := r || format('OK population_contains(org) within org A = %s (want t); ',
                   hr.population_contains('org', null, v_empl, current_date, v_hadempl));
  end;

  raise exception E'PROBE REPORT >>> %', r;
end
$probe$;"""


async def main():
    conn = await asyncpg.connect(**DSN)
    try:
        await conn.execute(PROBE)
        print("!! the probe did not raise its report — it must end with the report RAISE")
        sys.exit(1)
    except asyncpg.exceptions.PostgresError as ex:
        if getattr(ex, "sqlstate", None) != "P0001" or "PROBE REPORT" not in str(ex):
            print(f"!! {type(ex).__name__}: {ex}")
            sys.exit(1)
        lines = [p.strip() for p in str(ex).replace("PROBE REPORT >>> ", "").split("; ") if p.strip()]
        bad = 0
        for ln in lines:
            want_f = "(want f)" in ln
            got_t = "= t " in ln or ln.endswith("= t") or "granted=true" in ln
            got_f = "= f " in ln or ln.endswith("= f") or "granted=false" in ln
            ok = (want_f and got_f) or ((not want_f) and got_t)
            bad += 0 if ok else 1
            print(f"  [{'PASS' if ok else 'FAIL'}] {ln}")
        print()
        if bad:
            print(f"CROSS-ORG BOUNDARY: {bad} FAILING assertion(s) — the tenant boundary is NOT enforced")
            sys.exit(1)
        print(f"CROSS-ORG BOUNDARY: all {len(lines)} assertions pass; database left byte-identical (rolled back)")
    finally:
        await conn.close()


asyncio.run(main())
