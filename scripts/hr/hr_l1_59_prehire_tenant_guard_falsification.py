"""hr_l1_59 — the six-way falsification of the PREHIRE CROSS-TENANT LEAK, over real HTTPS PostgREST.

Run:  cd /Users/armanisadeghi/code/aidream && uv run --with httpx \
        python /Users/armanisadeghi/code/matrx-frontend/scripts/hr/hr_l1_59_prehire_tenant_guard_falsification.py

THE LEAK (P0, live on production before hr_l1_59): `hr._l1_viewer` resolves the subject's
employment with `hr.employment_as_of(...)`, which is NULL for anyone whose employment has not
STARTED yet (a future-dated prehire) or has already ENDED (a terminated ex-employee) — and then
asked `hr.capability(p_user,'identity.read', NULL, p_at)` WITHOUT the org it already held in
`v_org`. Inside `hr.capability` the tenant predicates are gated on that argument, so with both
NULL they go vacuously TRUE and the question degrades to "does this user hold identity.read
ANYWHERE?". Any HR admin of any org therefore read any other org's prehires.

🚨 THIS SCRIPT MUTATES NOTHING AND SETS NO PASSWORD. Tokens are minted with the Supabase admin
`generate_link` (magiclink) + `/auth/v1/verify` pair — the same primitive `mint_dev_session` uses.
The password-setting house pattern is deliberately NOT used here: one of the personas is
`admin@admin.com`, and resetting that password would lock Arman out of every Matrx UI.

🚨 THE COLLATERAL HALF IS THE POINT. Over-tightening would break the org's OWN admin reading their
OWN new hire before day one — a real product path. Cases 3a/3b exist to catch exactly that, and a
run where they refuse is a FAILED run, not a safer one.
"""
import asyncio, json, os, sys
import httpx

ENV = "/Users/armanisadeghi/code/aidream/.env"


def load_env(path):
    out = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


# ---- personas (auth.users.id) --------------------------------------------------------------
PRIYA = ("priya",  "20149d3f-6572-4263-b43c-7e52f0e42058", "admin+g2v.priya@admin.com")
ADMIN = ("admin",  "87a6e699-3622-4869-8843-d0867456c0dd", "admin@admin.com")
DANA  = ("dana",   "f83af954-1fd1-46d5-bfc1-54cb27d98666", "dana.ruiz@example.test")
TOMO  = ("tomo",   "daeb6d44-a7dd-4085-aba2-5025fb711b79", "g2t13.tomas@example.test")

# ---- subjects: (label, employee_id, employment_id, org) -------------------------------------
WTS  = "2643e470-b275-47f3-95f3-ae275ad3ca47"   # Write Target Sandbox   (priya is hr_admin here)
G2P1 = "304cd2ed-a65e-4c52-8375-324e605d16bd"   # ZZZ G2 Activation Probe
G2P2 = "319fad99-427c-4aaf-8e0b-17af53dd0424"   # ZZZ G2 Activation Probe Two

FOREIGN_PREHIRE_A = ("foreign prehire (G2T-Owen Fitzgerald, Probe Two)",
                     "32204298-1cf6-4d99-af67-91eeb9baeebc", "3a522021-6abf-4fca-b405-644d99dbdf5b", G2P2)
FOREIGN_PREHIRE_B = ("foreign prehire (Zzz Trapprobe, Probe One)",
                     "6957b91a-793e-4d6c-956b-540563d50077", "54f71f97-6b08-4887-86bd-7d608938a440", G2P1)
OWN_PREHIRE       = ("OWN-org prehire (Mari36 Okonkwo, Sandbox)",
                     "b96d96ba-5e17-46ba-ae35-7b1afc444208", "4f0b65e8-3e6d-4f54-81d3-7fbfb279af8b", WTS)
OWN_ACTIVE        = ("OWN-org active (L5A5 Hana Petrov, Sandbox)",
                     "51911606-103d-42f0-8189-da394942f9f1", "463755b8-9ee3-4841-907c-4637e85ffae5", WTS)
FOREIGN_ACTIVE    = ("foreign active (Armani Sadeghi, Probe Two)",
                     "ad82a0ad-9daa-4230-ad20-ad591b36b631", "ab84f6a2-b99b-4abe-900f-7d0dacc2297d", G2P2)
OWN_TERMINATED    = ("OWN-org TERMINATED (Zzzterm Withcomp, Sandbox)",
                     "5db5f793-d07a-457f-8b2d-ee0535656e34", "0b4eec20-97a0-45fd-9078-8dfc899fec1f", WTS)

R = []


def rec(case, expect, got, detail=""):
    ok = (expect == got)
    R.append((case, expect, got, ok, str(detail)[:200]))
    print(f"  [{'PASS' if ok else 'FAIL'}] {case}: expected {expect}, got {got}  {str(detail)[:140]}")


async def main():
    env = load_env(ENV)
    base = env["SUPABASE_MATRIX_URL"].rstrip("/")
    anon = env["SUPABASE_MATRIX_PUBLISHABLE_KEY"]
    service = env["SUPABASE_MATRIX_SECRET_KEY"]
    if "matrxserver.com" not in base and "brsgrqvjdzwihsvnfqkf" not in base:
        print(f"REFUSING: SUPABASE_MATRIX_URL is not the live platform DB ({base})")
        return 2
    http = httpx.AsyncClient(timeout=90)

    async def mint(email):
        """A real Supabase-issued user token, with NO password anywhere in the flow."""
        r = await http.post(
            f"{base}/auth/v1/admin/generate_link",
            headers={"apikey": service, "Authorization": f"Bearer {service}",
                     "Content-Type": "application/json"},
            json={"type": "magiclink", "email": email})
        r.raise_for_status()
        hashed = r.json()["hashed_token"]
        r = await http.post(
            f"{base}/auth/v1/verify",
            headers={"apikey": anon, "Content-Type": "application/json"},
            json={"type": "magiclink", "token_hash": hashed})
        r.raise_for_status()
        return r.json()["access_token"]

    async def rpc(fn, body, token):
        h = {"apikey": anon, "Authorization": f"Bearer {token}",
             "Content-Type": "application/json",
             "Content-Profile": "public", "Accept-Profile": "public"}
        r = await http.post(f"{base}/rest/v1/rpc/{fn}", headers=h, json=body)
        if r.status_code >= 400:
            return {"__http": r.status_code, "body": r.text[:200]}
        return r.json()

    tokens = {}
    print("=== minting real Supabase tokens (magiclink; no password is set or typed) ===")
    for name, uid, email in (PRIYA, ADMIN, DANA, TOMO):
        try:
            tokens[name] = await mint(email)
            print(f"  minted {name} <{email}>")
        except Exception as e:  # noqa: BLE001
            print(f"  COULD NOT MINT {name}: {e}")
            return 2

    async def three_doors(persona, subject, expect_profile, expect_history, expect_pending, tag):
        """The three doors the verifier reproduced the leak through, all off hr._l1_viewer."""
        label, emp_id, empl_id, _org = subject
        tok = tokens[persona]
        p = await rpc("hr_employee_profile", {"p_employee_id": emp_id}, tok)
        g = bool(p.get("granted")) if isinstance(p, dict) else False
        rec(f"{tag} · {persona} -> {label} · hr_employee_profile", expect_profile, g,
            f"viewer={p.get('viewer')} comp={p.get('comp_visibility')} tabs={len(p.get('tabs') or [])} "
            f"legal_name={(p.get('header') or {}).get('legal_name')!r} "
            f"private_state={(p.get('personal') or {}).get('private_state')!r}")
        h = await rpc("hr_employment_history", {"p_employee_id": emp_id}, tok)
        gh = bool(h.get("granted")) if isinstance(h, dict) else False
        rec(f"{tag} · {persona} -> {label} · hr_employment_history", expect_history, gh,
            f"spells={len(h.get('spells') or [])} assignments={len(h.get('assignments') or [])}")
        c = await rpc("hr_pending_changes", {"p_employment_id": empl_id}, tok)
        gc = bool(c.get("granted")) if isinstance(c, dict) else False
        rec(f"{tag} · {persona} -> {label} · hr_pending_changes", expect_pending, gc,
            f"positions={len(c.get('positions') or [])} comp={len(c.get('compensation') or [])}")

    print("\n=== 1. THE LEAK: priya (hr_admin in Write Target Sandbox ONLY) -> a FOREIGN prehire ===")
    await three_doors("priya", FOREIGN_PREHIRE_A, False, False, False, "case 1")

    print("\n=== 2. the same leak in the OTHER affected org ===")
    await three_doors("priya", FOREIGN_PREHIRE_B, False, False, False, "case 2")

    print("\n=== 3. 🚨 MUST NOT BREAK: an org's OWN admin -> their OWN org's prehire ===")
    await three_doors("admin", FOREIGN_PREHIRE_A, True, True, True, "case 3a (admin IS hr_owner of Probe Two)")
    await three_doors("priya", OWN_PREHIRE, True, True, True, "case 3b (priya IS hr_admin of Sandbox)")

    print("\n=== 4. priya -> an ACTIVE employee of her OWN org (unchanged) ===")
    await three_doors("priya", OWN_ACTIVE, True, True, True, "case 4")

    print("\n=== 5. priya -> an ACTIVE employee of a FOREIGN org (was already correct) ===")
    await three_doors("priya", FOREIGN_ACTIVE, False, False, False, "case 5")

    print("\n=== 6. no-capability personas -> everything (unchanged) ===")
    for who in ("dana", "tomo"):
        for subj in (FOREIGN_PREHIRE_A, OWN_PREHIRE, OWN_ACTIVE):
            await three_doors(who, subj, False, False, False, "case 6")

    print("\n=== 7. the OTHER half of the same NULL-employment branch: a TERMINATED ex-employee ===")
    print("    (all three terminated fixtures live in priya's own org, so this proves the")
    print("     must-not-break side of the terminated branch; the cross-tenant side shares")
    print("     the identical code path as case 1.)")
    await three_doors("priya", OWN_TERMINATED, True, True, True, "case 7 (own-org terminated)")
    await three_doors("dana", OWN_TERMINATED, False, False, False, "case 7 (no-caps -> terminated)")

    await http.aclose()
    fails = [r for r in R if not r[3]]
    print(f"\n================ {len(R) - len(fails)}/{len(R)} PASS ================")
    for c, e, g, ok, d in fails:
        print(f"  FAIL {c}: expected {e}, got {g} — {d}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
