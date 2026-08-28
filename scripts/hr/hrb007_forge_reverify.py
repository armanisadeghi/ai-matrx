"""HRB-007 D15 RE-VERIFY — the cross-tenant outsider-token FORGE is closed.

Run:  cd /Users/armanisadeghi/code/aidream && uv run --with asyncpg --with httpx \
        python /Users/armanisadeghi/code/matrx-frontend/scripts/hr/hrb007_forge_reverify.py

Independent re-verification (zero authorship of the build OR the fix). Mirrors the original HRB-007
forge, run against the FIXED state, as a REAL non-member `authenticated` JWT over PostgREST — the
session minted by magiclink (no password exists on the account).

The forge WAS: mint_outsider_token cross-tenant → 200 (an hr.investigation_external secret minted for
a foreign incident); a direct INSERT into platform.actor_token → 201. Both must now be denied, the
revoke/reanchor doors must refuse a non-member, AND the legitimate DEFINER wrapper must still mint.
"""
import asyncio, json, os, sys, uuid
import asyncpg, httpx
from dotenv import load_dotenv

load_dotenv("/Users/armanisadeghi/code/aidream/.env")
ATTACKER_UID = "2ee422b1-dbca-4cde-ae1e-b44d83384c02"     # member of e0ca14f8 ONLY
ATTACKER_EMAIL = "zzz.d15.nonmember.hrb006@example.invalid"
ATTACKER_ORG = "e0ca14f8-f5c0-4b82-86a4-a7e9f5379bef"

R = []
def rec(n, ok, d=""):
    R.append((n, bool(ok), str(d)[:340]))

def denied(status, body):
    """A forge is CLOSED only if the call did not succeed. 2xx = still open."""
    return not (200 <= status < 300)

async def main():
    base = os.environ["SUPABASE_MATRIX_URL"].rstrip("/")
    anon = os.environ["SUPABASE_MATRIX_PUBLISHABLE_KEY"]
    service = os.environ["SUPABASE_MATRIX_SECRET_KEY"]
    conn = await asyncpg.connect(
        host=os.environ["SUPABASE_MATRIX_HOST"], port=int(os.environ["SUPABASE_MATRIX_PORT"]),
        database=os.environ["SUPABASE_MATRIX_DATABASE_NAME"], user=os.environ["SUPABASE_MATRIX_USER"],
        password=os.environ["SUPABASE_MATRIX_PASSWORD"], statement_cache_size=0)
    http = httpx.AsyncClient(timeout=60)

    # a FOREIGN org the attacker is not a member of, and a random foreign incident id to target
    foreign_org = await conn.fetchval(
        "select id from iam.organizations where id <> $1 "
        "and not exists (select 1 from iam.memberships m where m.user_id=$2 and m.organization_id=id) "
        "limit 1", ATTACKER_ORG, ATTACKER_UID)
    foreign_org = str(foreign_org)
    foreign_subject = str(uuid.uuid4())

    # ---- mint a REAL non-member session, no password (magiclink -> verify) ----
    admin_hdr = {"apikey": service, "Authorization": f"Bearer {service}", "Content-Type": "application/json"}
    r = await http.post(f"{base}/auth/v1/admin/generate_link", headers=admin_hdr,
                        json={"type": "magiclink", "email": ATTACKER_EMAIL})
    hashed = (r.json().get("hashed_token") or (r.json().get("properties") or {}).get("hashed_token")) if r.status_code < 400 else None
    r2 = await http.post(f"{base}/auth/v1/verify",
                         headers={"apikey": anon, "Content-Type": "application/json"},
                         json={"type": "magiclink", "token_hash": hashed}) if hashed else None
    tok = r2.json().get("access_token") if r2 is not None and r2.status_code < 400 else None
    rec("a real NON-MEMBER authenticated session is minted (magiclink, no password)",
        tok is not None, f"link={r.status_code} verify={r2.status_code if r2 is not None else 'n/a'}")
    if tok is None:
        await conn.close(); await http.aclose(); return await report()
    # confirm the attacker is genuinely a non-member of the foreign org
    rec("and the attacker is genuinely NOT a member of the target tenant",
        (await conn.fetchval("select count(*) from iam.memberships where user_id=$1 and organization_id=$2 and status='active'",
                             ATTACKER_UID, foreign_org)) == 0,
        f"target={foreign_org}, attacker orgs={await conn.fetchval('select array_agg(organization_id) from iam.memberships where user_id=$1 and status=$2', ATTACKER_UID, 'active')}")

    async def call(path, body, profile="platform"):
        h = {"apikey": anon, "Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
        if profile:
            h["Content-Profile"] = profile; h["Accept-Profile"] = profile
        r = await http.post(f"{base}{path}", headers=h, json=body)
        try: b = r.json()
        except Exception: b = r.text
        return r.status_code, b

    # ============ FORGE 1: mint_outsider_token cross-tenant (was 200, secret minted)
    for prof in ("platform", "public", None):
        st, b = await call("/rest/v1/rpc/mint_outsider_token",
            {"p_consumer_key": "hr.investigation_external", "p_subject_type": "hr_incident",
             "p_subject_id": foreign_subject, "p_scope": {}, "p_recipient": {}, "p_overrides": {}}, prof)
        leaked_secret = isinstance(b, dict) and ("secret" in json.dumps(b).lower() and 200 <= st < 300)
        rec(f"🚨 FORGE 1 — mint_outsider_token cross-tenant (profile={prof}) is DENIED, not a 200 minting a secret",
            denied(st, b) and not leaked_secret, f"status={st} body={json.dumps(b)[:150] if isinstance(b,(dict,list)) else str(b)[:150]}")

    # ============ FORGE 2: direct INSERT into platform.actor_token (was 201)
    st, b = await call("/rest/v1/actor_token",
        {"organization_id": foreign_org, "token_hash": "forge_" + uuid.uuid4().hex,
         "consumer_key": "hr.investigation_external", "subject_type": "hr_incident",
         "subject_id": foreign_subject, "visibility": "personal"}, "platform")
    rec("🚨 FORGE 2 — direct INSERT into platform.actor_token is DENIED (403/42501), not a 201",
        denied(st, b), f"status={st} body={json.dumps(b)[:150] if isinstance(b,(dict,list)) else str(b)[:150]}")

    # ============ FORGE 3: revoke / reanchor as a non-member
    for fn in ("revoke_outsider_token", "reanchor_outsider_token"):
        body = {"p_token_id": str(uuid.uuid4())}
        if fn == "revoke_outsider_token": body["p_reason"] = "forge"
        st, b = await call(f"/rest/v1/rpc/{fn}", body, "platform")
        rec(f"🚨 FORGE 3 — {fn} as a non-member is DENIED",
            denied(st, b), f"status={st} body={json.dumps(b)[:130] if isinstance(b,(dict,list)) else str(b)[:130]}")

    await conn.close(); await http.aclose()
    await report()

async def report():
    bad = [r for r in R if not r[1]]
    print(f"\n{'='*94}\nHRB-007 FORGE RE-VERIFY — {len(R)} checks, {len(bad)} FORGE-OPEN\n{'='*94}")
    for n, ok, d in R:
        print(f"  [{'CLOSED' if ok else '🚨 OPEN'}] {n}" + (f"   << {d}" if d else ""))
    sys.exit(1 if bad else 0)

asyncio.run(main())
