"""hr_l1_61 — falsification of the two residuals hr_l1_59 left open, over real HTTPS PostgREST.

Run:  cd /Users/armanisadeghi/code/aidream && uv run --with asyncpg --with httpx \
        python /Users/armanisadeghi/code/matrx-frontend/scripts/hr/hr_l1_61_scoped_population_and_queue_falsification.py
      (add `--baseline` to record the PRE-fix behaviour; the expectations then invert for the
       three rows the migration is there to change, and the run is expected to FAIL on them.)

RESIDUAL 1 — the scope-restricted grant. hr_l1_59 bound the tenant but not the POPULATION: with a
NULL subject `hr.capability` skips `population_contains` outright, so a DEPARTMENT-scoped hr_admin
reached every prehire and every terminated ex-employee in the org, including people who were never
theirs. 🚨 THE A/B THAT MAKES IT UNAMBIGUOUS: the same admin, the same org, the same department
scope, three subjects in a department that is NOT his — an ACTIVE one (already correctly refused,
because a real subject was always passed for them), a PREHIRE and a TERMINATED one (both reached).
The only variable is whether the subject holds a position today.

🚨 AND THE FIX MUST NOT BE BLUNT: refusing every scope-restricted admin every prehire would also
be wrong. The intended department is on the record, so a department admin DOES reach the prehire
who is joining THEIR department. Both directions are asserted below.

RESIDUAL 2 — hr.wf_inbox's org-less `workflow.view_queue`. Verified as an AFFORDANCE gate (it
decides whether the queue scope is offered); the ITEMS carry their own org predicate. The residual
was that the items bound to where the caller is EMPLOYED rather than where the grant lives. Nobody
live has the two-employer shape that would exploit it, so what is falsifiable here is that the
extra conjunct removes NOTHING from a legitimate queue — asserted item-for-item, by id.

🚨 THIS SCRIPT STAGES ONE FIXTURE AND ALWAYS REMOVES IT: a department-scoped `hr_admin` role for
tomo in the Write Target Sandbox, inserted and hard-deleted in the same run (`finally`). It sets no
password anywhere — tokens come from admin `generate_link` + `verify`.
"""
import asyncio, os, sys, uuid
import asyncpg, httpx

ENV = "/Users/armanisadeghi/code/aidream/.env"
BASELINE = "--baseline" in sys.argv

WTS = "2643e470-b275-47f3-95f3-ae275ad3ca47"          # Write Target Sandbox
DEPT_FIELD_SERVICES = "d1c21852-5302-430a-8b76-60f97ca99250"   # G2F3 Field Services
TOMO_EMPLOYMENT = "11dfa190-8762-4bca-b131-ee13ed397f72"       # Tomo Iversen-G32, WTS, active

PERSONAS = {
    "tomo":  "g2t13.tomas@example.test",           # staged: hr_admin scoped to Field Services
    "priya": "admin+g2v.priya@admin.com",          # hr_admin, scope_kind 'org' — must not break
    "admin": "admin@admin.com",                    # hr_owner in 7 orgs — queue no-regression
}

# (label, employee_id, employment_id, in_field_services)
SUBJECTS = [
    ("PREHIRE in Field Services (Zzz Linkprobe)",
     "a1c0e2ad-af1a-4e21-b235-dbce7e7d9a0a", "35c46f75-3b5d-424d-b302-6ba47b7d3b44", True),
    ("PREHIRE in Operations (Mari36 Okonkwo)",
     "b96d96ba-5e17-46ba-ae35-7b1afc444208", "4f0b65e8-3e6d-4f54-81d3-7fbfb279af8b", False),
    ("TERMINATED, last held Field Services (Zzzterm Withcomp)",
     "5db5f793-d07a-457f-8b2d-ee0535656e34", "0b4eec20-97a0-45fd-9078-8dfc899fec1f", True),
    ("TERMINATED, last held Operations (G2offb Offboardme)",
     "f92cc1e8-5536-46bb-8233-2910a011f4ba", "858edf3c-834c-49dd-8f66-2dfe3a600329", False),
    ("ACTIVE in Field Services (L5A5 Hana Petrov)",
     "51911606-103d-42f0-8189-da394942f9f1", "463755b8-9ee3-4841-907c-4637e85ffae5", True),
    ("ACTIVE in Operations (Nadia Okafor)",
     "2ec4cbc9-6140-465d-8920-0c74a3937a82", "c26d586a-a18a-4ea8-a249-a6d3f0f0132b", False),
]
FOREIGN_PREHIRE = ("FOREIGN-ORG prehire (G2T-Owen Fitzgerald, Probe Two)",
                   "32204298-1cf6-4d99-af67-91eeb9baeebc", "3a522021-6abf-4fca-b405-644d99dbdf5b")

# 🚨 Zzz Linkprobe carries priya's own login, so SHE reaches it on the `self` lane — a lane that
# never touches hr.capability and therefore cannot move here. Asserting `hr_admin` for her would be
# asserting the wrong thing about the right row.
SELF_OF = {"priya": {"a1c0e2ad-af1a-4e21-b235-dbce7e7d9a0a"}}

R = []


def rec(case, expect, got, detail=""):
    ok = (expect == got)
    R.append((case, expect, got, ok, str(detail)[:200]))
    print(f"  [{'PASS' if ok else 'FAIL'}] {case}: expected {expect}, got {got}  {str(detail)[:130]}")


def load_env(path):
    out = {}
    for line in open(path):
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
        return r.json()["access_token"]

    async def rpc(fn, body, tok):
        r = await http.post(f"{base}/rest/v1/rpc/{fn}",
                            headers={"apikey": anon, "Authorization": f"Bearer {tok}",
                                     "Content-Type": "application/json",
                                     "Content-Profile": "public", "Accept-Profile": "public"},
                            json=body)
        return {"__http": r.status_code, "body": r.text[:200]} if r.status_code >= 400 else r.json()

    staged = None
    try:
        # ---- stage the department-scoped grant (removed in `finally`, always) ----------------
        # 🚨 The arm that SPEC-ACCESS law 2 requires is scoped to the statement that raises it, so
        # the insert has to sit in the same block as hr.arm_write() — two asyncpg statements lose it.
        staged = str(uuid.uuid4())
        await conn.execute(
            f"""do $fixture$
                begin
                  perform hr.arm_write();
                  insert into hr.role_assignment (id, organization_id, employment_id, role_key,
                         scope_kind, scope_id, is_active, effective_from, reason)
                  values ('{staged}'::uuid, '{WTS}'::uuid, '{TOMO_EMPLOYMENT}'::uuid, 'hr_admin',
                          'department', '{DEPT_FIELD_SERVICES}'::uuid, true, current_date,
                          'hr_l1_61 falsification fixture - removed by the same script run');
                end $fixture$;""")
        print(f"staged department-scoped hr_admin for tomo: role_assignment {staged}")

        tok = {name: await mint(email) for name, email in PERSONAS.items()}
        print("minted tokens for:", ", ".join(tok))

        async def viewer(persona, employee_id, employment_id):
            p = await rpc("hr_employee_profile", {"p_employee_id": employee_id}, tok[persona])
            v = (p.get("viewer") if p.get("granted") else False) if isinstance(p, dict) else False
            h = await rpc("hr_employment_history", {"p_employee_id": employee_id}, tok[persona])
            c = await rpc("hr_pending_changes", {"p_employment_id": employment_id}, tok[persona])
            return v, bool(h.get("granted")), bool(c.get("granted")), p

        print("\n=== R1 · a DEPARTMENT-scoped hr_admin (tomo, scoped to G2F3 Field Services) ===")
        print("    In his department -> hr_admin. Outside it -> the peer directory tier only.")
        for label, emp_id, empl_id, mine in SUBJECTS:
            v, gh, gc, p = await viewer("tomo", emp_id, empl_id)
            no_position_today = ("PREHIRE" in label or "TERMINATED" in label)
            if BASELINE and not mine and no_position_today:
                exp_v, exp_h = "hr_admin", True   # 🚨 the leak this migration closes
            else:
                exp_v, exp_h = ("hr_admin", True) if mine else ("peer", False)
            rec(f"R1 · tomo(dept=Field Services) -> {label} · profile", exp_v, v,
                f"tabs={len(p.get('tabs') or [])} legal_name={(p.get('header') or {}).get('legal_name')!r}")
            rec(f"R1 · tomo(dept=Field Services) -> {label} · history", exp_h, gh)
            rec(f"R1 · tomo(dept=Field Services) -> {label} · pending", exp_h, gc)

        print("\n=== R1 · 🚨 MUST NOT BREAK: an ORG-scoped admin still reaches all of them ===")
        for label, emp_id, empl_id, _mine in SUBJECTS:
            v, gh, gc, _ = await viewer("priya", emp_id, empl_id)
            exp = "self" if emp_id in SELF_OF["priya"] else "hr_admin"
            rec(f"R1 · priya(scope=org) -> {label} · profile", exp, v)
            rec(f"R1 · priya(scope=org) -> {label} · history", True, gh)
            rec(f"R1 · priya(scope=org) -> {label} · pending", True, gc)

        print("\n=== R1 · hr_l1_59 must still hold: the tenant guard, with a scoped grant ===")
        label, emp_id, empl_id = FOREIGN_PREHIRE
        for who in ("tomo", "priya"):
            v, gh, gc, _ = await viewer(who, emp_id, empl_id)
            rec(f"R1 · {who} -> {label} · profile", False, v)
            rec(f"R1 · {who} -> {label} · history", False, gh)
            rec(f"R1 · {who} -> {label} · pending", False, gc)

        print("\n=== R2 · the HR queue scope: every returned item sits in an org where the")
        print("       caller actually HOLDS workflow.view_queue (the coordinator's probe) ===")
        for who in ("admin", "priya", "tomo"):
            q = await rpc("hr_wf_inbox", {"p_scope": "queue", "p_employment_id": None,
                                          "p_filters": {}}, tok[who])
            granted = bool(q.get("granted")) if isinstance(q, dict) else False
            # `scope_rows` is the QUEUE's own list; `needs_my_decision` is the caller's personal
            # queue and is bounded by resolved_user_ids, not by the capability under test.
            rows = (q.get("scope_rows") or []) if granted else []
            ids = sorted({r.get("instance_id") for r in rows if r.get("instance_id")})
            uid = await conn.fetchval("select id from auth.users where email = $1", PERSONAS[who])
            foreign = await conn.fetchval(
                """select count(*) from hr.workflow_instance i
                    where i.id = any($1::uuid[])
                      and not exists (
                        select 1 from hr.role_assignment ra
                          join hr.employment em on em.id = ra.employment_id
                          join hr.employee e on e.id = em.employee_id
                          join lateral (select ar.capabilities from hr.access_role ar
                                         where ar.role_key = ra.role_key and ar.deleted_at is null
                                           and ar.is_active
                                           and ar.organization_id in (ra.organization_id,
                                                 '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
                                         order by (ar.organization_id = ra.organization_id) desc
                                         limit 1) r on true
                         where e.login_user_id = $2 and ra.is_active and ra.revoked_at is null
                           and ra.organization_id = i.organization_id
                           and 'workflow.view_queue' = any(r.capabilities))""",
                ids, uid)
            rec(f"R2 · {who} · queue items in an org where they do NOT hold view_queue", 0, foreign,
                f"granted={granted} items={len(ids)}")
            print(f"       {who}: granted={granted} instances={len(ids)} :: {ids}")

    finally:
        if staged:
            await conn.execute(
                f"""do $unfixture$
                    begin
                      perform hr.arm_write();
                      delete from hr.role_assignment where id = '{staged}'::uuid;
                    end $unfixture$;""")
            left = await conn.fetchval(
                "select count(*) from hr.role_assignment where id = $1::uuid", staged)
            print(f"\nfixture removed (rows remaining for {staged}: {left})")
        await conn.close()
        await http.aclose()

    fails = [r for r in R if not r[3]]
    print(f"\n================ {len(R) - len(fails)}/{len(R)} PASS "
          f"({'BASELINE' if BASELINE else 'POST-FIX'}) ================")
    for c, e, g, ok, d in fails:
        print(f"  FAIL {c}: expected {e}, got {g} — {d}")
    return 1 if fails else 0


sys.exit(asyncio.run(main()))
