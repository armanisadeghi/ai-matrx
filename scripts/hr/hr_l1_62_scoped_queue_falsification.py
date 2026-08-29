"""hr_l1_62 — a scope-restricted grant gets a scope-restricted QUEUE. Real HTTPS PostgREST.

Run:  cd /Users/armanisadeghi/code/aidream && uv run --with asyncpg --with httpx \
        python /Users/armanisadeghi/code/matrx-frontend/scripts/hr/hr_l1_62_scoped_queue_falsification.py
      (`--baseline` records the PRE-fix behaviour; directions (b) and (c) are expected to FAIL there.)

hr_l1_61 bound the queue's items to the organization the grant lives in. It left the POPULATION
unasked, so a DEPARTMENT-scoped hr_admin read workflow items about every person in the employer.
hr_l1_62 passes the item's own subject to the SAME capability predicate the subject doors use.

🚨 THE ORACLE IS INDEPENDENT ON PURPOSE. Expected membership is computed here from the department
on the subject's position assignment — resolved the way the ruling describes (as of today, else the
intended future assignment, else the last one held) — and NOT by calling hr.capability. Asserting a
door against the predicate the door itself calls proves only that the function is deterministic.

FIXTURES, both staged and hard-deleted in the same run (`finally`):
  1. a department-scoped hr_admin role for tomo — run twice, once scoped to Operations and once to
     G2F3 Field Services, so the inclusion and exclusion directions are each other's mirror;
  2. one workflow instance + active step about an EX-EMPLOYEE (G2offb Offboardme, last held
     Operations). Nothing else on the system has an active item about someone who has left, and
     direction (c) is not proven by an argument that such an item would resolve.
No password is set or typed anywhere; tokens come from admin generate_link + verify.
"""
import asyncio, sys, uuid
import asyncpg, httpx

ENV = "/Users/armanisadeghi/code/aidream/.env"
BASELINE = "--baseline" in sys.argv

WTS = "2643e470-b275-47f3-95f3-ae275ad3ca47"
DEPT_OPERATIONS = "6715f29c-c677-4546-9c9a-5e2b591ab16e"
DEPT_FIELD_SERVICES = "d1c21852-5302-430a-8b76-60f97ca99250"
TOMO_EMPLOYMENT = "11dfa190-8762-4bca-b131-ee13ed397f72"

# the ex-employee the staged item is about: G2offb Offboardme, terminated, last held Operations
EX_EMPLOYEE_ID = "f92cc1e8-5536-46bb-8233-2910a011f4ba"
EX_EMPLOYMENT = "858edf3c-834c-49dd-8f66-2dfe3a600329"
TEMPLATE_INSTANCE = "0fc4b622-c5c4-47eb-b76d-7e6d8b3bbed0"

PERSONAS = {"tomo": "g2t13.tomas@example.test",
            "priya": "admin+g2v.priya@admin.com",
            "admin": "admin@admin.com"}

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


# The independent oracle: the department an item's subject belongs to, resolved as of today, else
# the intended (earliest future) assignment, else the last one held. No hr.capability anywhere.
ORACLE = """
select i.id::text as instance_id,
       i.subject_employment_id,
       (select pa.department_id
          from hr.position_assignment pa
         where pa.employment_id = i.subject_employment_id
           and pa.deleted_at is null and pa.is_primary
         order by (pa.effective_range @> current_date) desc,
                  (pa.effective_from > current_date) desc,
                  case when pa.effective_from > current_date then pa.effective_from end asc
                    nulls last,
                  pa.effective_from desc
         limit 1)::text as subject_department,
       bool_or(s.resolved_user_ids && array[$1::uuid]) as caller_is_approver
  from hr.workflow_instance i
  join hr.workflow_step s on s.workflow_instance_id = i.id and s.state = 'active'
 where i.organization_id = $2::uuid
 group by i.id, i.subject_employment_id
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

    async def queue(tokn):
        r = await http.post(f"{base}/rest/v1/rpc/hr_wf_inbox",
                            headers={"apikey": anon, "Authorization": f"Bearer {tokn}",
                                     "Content-Type": "application/json",
                                     "Content-Profile": "public", "Accept-Profile": "public"},
                            json={"p_scope": "queue", "p_employment_id": None, "p_filters": {}})
        if r.status_code >= 400:
            return None, f"HTTP {r.status_code} {r.text[:160]}"
        j = r.json()
        if not j.get("granted"):
            return None, f"refused: {j.get('reason')}"
        return sorted({x["instance_id"] for x in (j.get("scope_rows") or [])}), ""

    role_id = None
    inst_id = None
    try:
        # ---- fixture 2: an active item about an EX-EMPLOYEE -----------------------------------
        inst_id, step_id = str(uuid.uuid4()), str(uuid.uuid4())
        await conn.execute(f"""
            do $fx$
            declare t record;
            begin
              perform hr.arm_write();
              select i.flow_key, i.workflow_definition_id, i.definition_version, i.target_token,
                     i.priority, i.sensitivity_tier, s.step_definition_id, s.step_key, s.step_order
                into t
                from hr.workflow_instance i
                join hr.workflow_step s on s.workflow_instance_id = i.id
               where i.id = '{TEMPLATE_INSTANCE}'::uuid limit 1;
              insert into hr.workflow_instance
                (id, flow_key, workflow_definition_id, definition_version, target_token, target_id,
                 organization_id, state, priority, sensitivity_tier, subject_employment_id,
                 requester_employment_id)
              values ('{inst_id}'::uuid, t.flow_key, t.workflow_definition_id, t.definition_version,
                      t.target_token, '{EX_EMPLOYEE_ID}'::uuid, '{WTS}'::uuid, 'active', t.priority,
                      t.sensitivity_tier, '{EX_EMPLOYMENT}'::uuid, '{EX_EMPLOYMENT}'::uuid);
              insert into hr.workflow_step
                (id, workflow_instance_id, step_definition_id, step_key, step_order, state,
                 organization_id, approvals_needed, approvals_received)
              values ('{step_id}'::uuid, '{inst_id}'::uuid, t.step_definition_id, t.step_key,
                      t.step_order, 'active', '{WTS}'::uuid, 1, 0);
            end $fx$;""")
        print(f"staged an active item about an EX-EMPLOYEE: instance {inst_id}")

        tok = {n: await mint(e) for n, e in PERSONAS.items()}
        items = await conn.fetch(ORACLE, uuid.UUID(int=0), uuid.UUID(WTS))
        print(f"WTS active instances: {len(items)}")

        async def expected_for(uid, scope_dept):
            rows = await conn.fetch(ORACLE, uid, uuid.UUID(WTS))
            out = []
            for r in rows:
                if r["caller_is_approver"]:
                    continue                      # those live in needs_my_decision, not the queue
                if scope_dept is None:            # an org-scoped grant sees the whole employer
                    out.append(r["instance_id"])
                elif r["subject_employment_id"] is None:
                    out.append(r["instance_id"])  # no population to evaluate → affordance rung
                elif r["subject_department"] == scope_dept:
                    out.append(r["instance_id"])
            return sorted(out)

        # ---- (a) MUST NOT BREAK: an org-scoped grant's queue is unchanged ---------------------
        print("\n=== (a) 🚨 MUST NOT BREAK — an ORG-scoped admin's queue, item for item ===")
        for who in ("admin", "priya"):
            got, err = await queue(tok[who])
            uid = await conn.fetchval("select id from auth.users where email=$1", PERSONAS[who])
            exp_wts = await expected_for(uid, None)
            # admin also holds queues in other employers; assert every WTS item is present and that
            # nothing outside the oracle's WTS set leaked in from WTS.
            got_wts = [i for i in (got or []) if i in {r["instance_id"] for r in items}]
            rec(f"(a) {who} · the WTS half of the queue, item for item",
                exp_wts, got_wts, f"total items returned={len(got or [])} {err}")

        # ---- (b)/(c) a DEPARTMENT-scoped grant, run as its own mirror ------------------------
        for dept_name, dept_id in (("Operations", DEPT_OPERATIONS),
                                   ("G2F3 Field Services", DEPT_FIELD_SERVICES)):
            role_id = str(uuid.uuid4())
            await conn.execute(f"""
                do $fx$
                begin
                  perform hr.arm_write();
                  insert into hr.role_assignment (id, organization_id, employment_id, role_key,
                         scope_kind, scope_id, is_active, effective_from, reason)
                  values ('{role_id}'::uuid, '{WTS}'::uuid, '{TOMO_EMPLOYMENT}'::uuid, 'hr_admin',
                          'department', '{dept_id}'::uuid, true, current_date,
                          'hr_l1_62 falsification fixture - removed by the same script run');
                end $fx$;""")
            tok["tomo"] = await mint(PERSONAS["tomo"])
            uid = await conn.fetchval("select id from auth.users where email=$1", PERSONAS["tomo"])
            got, err = await queue(tok["tomo"])
            exp = await expected_for(uid, dept_id)
            everything = await expected_for(uid, None)
            print(f"\n=== (b)/(c) tomo, hr_admin scoped to {dept_name} ===")
            if BASELINE:
                rec(f"(b/c) tomo(dept={dept_name}) · queue items", everything, got or [],
                    "PRE-fix: the whole employer's queue, which is the disclosure")
            else:
                rec(f"(b/c) tomo(dept={dept_name}) · queue items", exp, got or [],
                    f"withheld (other departments): "
                    f"{sorted(set(everything) - set(exp))} {err}")
            await conn.execute(f"""
                do $fx$ begin perform hr.arm_write();
                  delete from hr.role_assignment where id = '{role_id}'::uuid; end $fx$;""")
            role_id = None

        # ---- (c) explicitly: the prehire's and the ex-employee's items are the RESOLVED ones --
        print("\n=== (c) the two subjects hr_l1_61's v_pop_at makes resolvable ===")
        prehire_item = "0fc4b622-c5c4-47eb-b76d-7e6d8b3bbed0"   # Mari36 Okonkwo, prehire, Operations
        role_id = str(uuid.uuid4())
        await conn.execute(f"""
            do $fx$ begin perform hr.arm_write();
              insert into hr.role_assignment (id, organization_id, employment_id, role_key,
                     scope_kind, scope_id, is_active, effective_from, reason)
              values ('{role_id}'::uuid, '{WTS}'::uuid, '{TOMO_EMPLOYMENT}'::uuid, 'hr_admin',
                      'department', '{DEPT_OPERATIONS}'::uuid, true, current_date,
                      'hr_l1_62 falsification fixture - removed by the same script run');
            end $fx$;""")
        tok["tomo"] = await mint(PERSONAS["tomo"])
        got, err = await queue(tok["tomo"])
        rec("(c) an Operations-scoped admin SEES the PREHIRE's item (intended dept resolves)",
            True, prehire_item in (got or []), f"item {prehire_item}")
        rec("(c) an Operations-scoped admin SEES the EX-EMPLOYEE's item (last-held dept resolves)",
            True, inst_id in (got or []), f"item {inst_id}")

    finally:
        async def unstage(sql):
            try:
                await conn.execute(sql)
            except Exception as e:  # noqa: BLE001
                print(f"🚨 FIXTURE CLEANUP FAILED: {e}")
        if role_id:
            await unstage(f"do $fx$ begin perform hr.arm_write();"
                          f" delete from hr.role_assignment where id = '{role_id}'::uuid; end $fx$;")
        if inst_id:
            await unstage(f"do $fx$ begin perform hr.arm_write();"
                          f" delete from hr.workflow_step where workflow_instance_id = '{inst_id}'::uuid;"
                          f" delete from hr.workflow_instance where id = '{inst_id}'::uuid; end $fx$;")
        left_r = await conn.fetchval(
            "select count(*) from hr.role_assignment where reason like '%hr_l1_62 falsification%'")
        left_i = await conn.fetchval(
            "select count(*) from hr.workflow_instance where id = $1::uuid", inst_id) if inst_id else 0
        print(f"\nfixtures removed — stray roles: {left_r}, stray instances: {left_i}")
        await conn.close()
        await http.aclose()

    fails = [r for r in R if not r[3]]
    print(f"\n================ {len(R) - len(fails)}/{len(R)} PASS "
          f"({'BASELINE' if BASELINE else 'POST-FIX'}) ================")
    return 1 if fails else 0


sys.exit(asyncio.run(main()))
