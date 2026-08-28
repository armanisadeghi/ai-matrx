"""HRB-008 — the converted workflow doors, walked over REAL HTTPS PostgREST.

Run:  cd /Users/armanisadeghi/code/aidream && uv run --with asyncpg --with httpx \
        python /Users/armanisadeghi/code/matrx-frontend/scripts/hr/hrb008_postgrest_door_walk.py

hr_c4_35 converted 11 `public.hr_wf_*` doors from SECURITY INVOKER to SECURITY DEFINER. In-database
probes prove the conversion is semantically neutral; this proves the doors are actually REACHABLE
and correctly GATED the way the browser reaches them — a real Supabase-issued token for a
NON-ADMIN employee, over HTTPS, with `Content-Profile: public`.

🚨 Why a non-admin: an admin token passes every capability check, so it cannot tell a working gate
from an absent one. 🚨 Why a POSITIVE identity assertion and not just refusals: a DEFINER door whose
`auth.uid()` silently returned null would refuse EVERYONE, and a wall of refusals reads exactly like
a working gate. `hr_wf_inbox` returning THIS caller's own employment_ids is the half that can only
be true if the identity survived into the definer body.

This script MUTATES NOTHING. It sets the synthetic test account's password (the house pattern from
hrb017_leave_proof.py) and otherwise only reads or provokes named refusals.
"""
import asyncio, json, os, sys
import httpx
from dotenv import load_dotenv
import asyncpg

load_dotenv("/Users/armanisadeghi/code/aidream/.env")
WALKER_EMAIL = "g2t13.tomas@example.test"
WALKER_UID   = "daeb6d44-a7dd-4085-aba2-5025fb711b79"
WALKER_EMP   = "11dfa190-8762-4bca-b131-ee13ed397f72"
PROOF_PW     = "Hrb008DoorWalk2026!"

R = []
def rec(name, ok, detail=""):
    R.append((name, bool(ok), str(detail)[:280]))

async def main():
    base    = os.environ["SUPABASE_MATRIX_URL"].rstrip("/")
    anon    = os.environ["SUPABASE_MATRIX_PUBLISHABLE_KEY"]
    service = os.environ["SUPABASE_MATRIX_SECRET_KEY"]
    conn = await asyncpg.connect(
        host=os.environ["SUPABASE_MATRIX_HOST"], port=int(os.environ["SUPABASE_MATRIX_PORT"]),
        database=os.environ["SUPABASE_MATRIX_DATABASE_NAME"], user=os.environ["SUPABASE_MATRIX_USER"],
        password=os.environ["SUPABASE_MATRIX_PASSWORD"], statement_cache_size=0)
    http = httpx.AsyncClient(timeout=60)

    # fixtures: a step this walker is NOT the approver of, and an instance he did NOT request
    other_step = await conn.fetchval(
        "select st.id from hr.workflow_step st where st.state='active' "
        "and not ($1::uuid = any(st.resolved_approver_ids)) limit 1", WALKER_EMP)
    other_inst = await conn.fetchval(
        "select id from hr.workflow_instance where requester_employment_id is distinct from $1 "
        "and state not in ('closed','cancelled') limit 1", WALKER_EMP)
    tgt = await conn.fetchrow(
        "select target_token, target_id from hr.workflow_instance where closed_at is not null limit 1")

    async def rpc(fn, body, token, profile=True):
        h = {"apikey": anon, "Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        if profile:
            h["Content-Profile"] = "public"; h["Accept-Profile"] = "public"
        r = await http.post(f"{base}/rest/v1/rpc/{fn}", headers=h, json=body)
        if r.status_code >= 400:
            return {"__http": r.status_code, "body": r.text[:300]}
        return r.json()

    print("=== 1. a REAL Supabase token for a NON-ADMIN employee ===")
    r = await http.put(f"{base}/auth/v1/admin/users/{WALKER_UID}",
                       headers={"apikey": service, "Authorization": f"Bearer {service}"},
                       json={"password": PROOF_PW})
    rec("the synthetic test account's password is set", r.status_code < 300, f"{r.status_code} {r.text[:150]}")
    r = await http.post(f"{base}/auth/v1/token?grant_type=password",
                        headers={"apikey": anon, "Content-Type": "application/json"},
                        json={"email": WALKER_EMAIL, "password": PROOF_PW})
    rec("a non-admin employee signs in and gets a real access token", r.status_code < 300,
        f"{r.status_code} {r.text[:150]}")
    if r.status_code >= 300:
        print("cannot continue without a token"); return await finish(conn, http)
    tok = r.json()["access_token"]
    roles = await conn.fetchval(
        "select string_agg(ra.role_key::text,',') from hr.role_assignment ra "
        "where ra.employment_id=$1 and ra.is_active", WALKER_EMP)
    rec("🚨 and the walker holds NO hr_admin/hr_owner role — an admin token cannot mask a gap here",
        roles is None or ("hr_admin" not in roles and "hr_owner" not in roles), f"roles={roles}")

    print("\n=== 2. the POSITIVE half: identity survives into a SECURITY DEFINER body ===")
    inbox = await rpc("hr_wf_inbox", {"p_scope": "mine"}, tok)
    rec("public.hr_wf_inbox is reachable over HTTPS and returns an envelope",
        isinstance(inbox, dict) and inbox.get("granted") is True, str(inbox)[:250])
    rec("🚨 and it returns THIS caller's own employment_ids — auth.uid() resolved inside the definer body",
        isinstance(inbox, dict) and WALKER_EMP in [str(x) for x in (inbox.get("employment_ids") or [])],
        f"employment_ids={(inbox or {}).get('employment_ids')}")
    rec("the non-admin's queue scope is honest — can_view_queue is false for somebody with no queue capability",
        isinstance(inbox, dict) and inbox.get("can_view_queue") is False,
        f"can_view_queue={(inbox or {}).get('can_view_queue')}")

    print("\n=== 3. the NEGATIVE half: two different gates, each naming its own reason ===")
    dec = await rpc("hr_wf_decide", {"p_step_id": str(other_step), "p_decision": "approved",
                                     "p_reason": "door walk"}, tok)
    rec("public.hr_wf_decide refuses a caller who is not the approver — WF_NOT_APPROVER, over HTTPS",
        isinstance(dec, dict) and dec.get("granted") is False and dec.get("reason") == "WF_NOT_APPROVER",
        str(dec)[:250])
    wd = await rpc("hr_wf_withdraw", {"p_instance_id": str(other_inst), "p_reason": "door walk"}, tok)
    rec("🚨 public.hr_wf_withdraw refuses with a DIFFERENT reason — not_the_requester — so the identity "
        "is being COMPARED, not merely absent",
        isinstance(wd, dict) and wd.get("granted") is False and wd.get("reason") == "not_the_requester",
        str(wd)[:250])

    print("\n=== 4. the 404 control: a missing profile header must not look like a broken door ===")
    noprof = await rpc("hr_wf_inbox", {"p_scope": "mine"}, tok, profile=False)
    rec("without Content-Profile the call is PGRST202, not a silent failure — a 404 can only mean something real",
        isinstance(noprof, dict) and noprof.get("__http") == 404 and "PGRST202" in str(noprof.get("body")),
        str(noprof)[:200])

    print("\n=== 5. the door left INVOKER on purpose is untouched and still works ===")
    ft = await rpc("hr_wf_for_target", {"p_target_token": tgt["target_token"],
                                        "p_target_id": str(tgt["target_id"])}, tok)
    rec("public.hr_wf_for_target (still SECURITY INVOKER, stopped by name — D283) still answers",
        isinstance(ft, dict) and ft.get("granted") is True, str(ft)[:200])
    still_invoker = await conn.fetchval(
        "select not p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
        "where n.nspname='public' and p.proname='hr_wf_for_target'")
    rec("and it is verifiably STILL INVOKER — the stop is real, not narrated", still_invoker)

    await finish(conn, http)

async def finish(conn, http):
    await conn.close(); await http.aclose()
    bad = [r for r in R if not r[1]]
    print(f"\n{'='*88}\nPOSTGREST DOOR WALK — {len(R)} assertions, {len(bad)} RED\n{'='*88}")
    for n, ok, d in R:
        print(f"  [{'PASS' if ok else 'FAIL'}] {n}" + (f"   << {d}" if not ok and d else ""))
    sys.exit(1 if bad else 0)

asyncio.run(main())
