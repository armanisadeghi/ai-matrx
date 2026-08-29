"""continued-access — the RENDER walk: the departed-member portal, on screen, in a real browser.

Run:  cd /Users/armanisadeghi/code/aidream && uv run --with httpx --with asyncpg --with playwright \
        python /Users/armanisadeghi/code/matrx-frontend/scripts/hr/continued_access_render_walk.py

The in-database falsification (STATE.md §8) proved the DOORS. This proves the PRODUCT: that a
person whose org membership has ended can actually open a page and answer a request about their
own income, and that when the employer has not opted in they are told so in a sentence.

🚨 WHY A SYNTHETIC ACCOUNT AND A REAL TOKEN. The house pattern (hrb008_postgrest_door_walk.py):
set the password of a SYNTHETIC test account through the admin API, then exchange it for a real
Supabase-issued session. No real person's credential is ever touched, and nothing is typed into a
login form by hand. The account here — zzz.departed.alumni@example.test — exists only for this
fixture.

🚨 WHAT THIS MUTATES. It flips the employer org's two continued-access knobs (to walk portal-OFF
and portal-ON) and RESTORES them to ON at the end. It answers a consent request that exists for
this fixture. It does not touch any other org.
"""
import asyncio, json, os, sys, base64

import asyncpg
import httpx
from dotenv import load_dotenv
from playwright.async_api import async_playwright

load_dotenv("/Users/armanisadeghi/code/aidream/.env")

ORIGIN   = "http://localhost:3000"
ORG      = "2643e470-b275-47f3-95f3-ae275ad3ca47"          # Write Target Sandbox
ALUMNI_EMAIL = "zzz.departed.alumni@example.test"
ALUMNI_UID   = "0c2f61fa-6d3d-4705-bee9-fb8cd1280c4a"
ADMIN_UID    = "87a6e699-3622-4869-8843-d0867456c0dd"
EMPLOYMENT   = "0b4eec20-97a0-45fd-9078-8dfc899fec1f"       # Zzzterm Withcomp, terminated 2026-08-20
PROOF_PW     = "ContinuedAccessRenderWalk2026!"
SHOTS        = "/private/tmp/claude-501/-Users-armanisadeghi-code-common-docs/c70d36d3-9188-4d99-aaed-c2f11032e2eb/scratchpad/shots"

R = []
def rec(name, ok, detail=""):
    R.append((name, bool(ok), str(detail)[:400]))
    print(("  PASS  " if ok else "  FAIL  ") + name + ("   " + str(detail)[:200] if detail else ""))


async def main():
    os.makedirs(SHOTS, exist_ok=True)
    base    = os.environ["SUPABASE_MATRIX_URL"].rstrip("/")
    anon    = os.environ["SUPABASE_MATRIX_PUBLISHABLE_KEY"]
    service = os.environ["SUPABASE_MATRIX_SECRET_KEY"]
    project_ref = base.split("//")[1].split(".")[0]

    conn = await asyncpg.connect(
        host=os.environ["SUPABASE_MATRIX_HOST"], port=int(os.environ["SUPABASE_MATRIX_PORT"]),
        database=os.environ["SUPABASE_MATRIX_DATABASE_NAME"], user=os.environ["SUPABASE_MATRIX_USER"],
        password=os.environ["SUPABASE_MATRIX_PASSWORD"], statement_cache_size=0)
    http = httpx.AsyncClient(timeout=90)

    async def mint(uid, email):
        r = await http.put(f"{base}/auth/v1/admin/users/{uid}",
                           headers={"apikey": service, "Authorization": f"Bearer {service}"},
                           json={"password": PROOF_PW, "email_confirm": True})
        if r.status_code >= 300:
            raise RuntimeError(f"could not set fixture password: {r.status_code} {r.text[:200]}")
        r = await http.post(f"{base}/auth/v1/token?grant_type=password",
                            headers={"apikey": anon, "Content-Type": "application/json"},
                            json={"email": email, "password": PROOF_PW})
        if r.status_code >= 300:
            raise RuntimeError(f"could not mint session: {r.status_code} {r.text[:200]}")
        return r.json()

    async def set_knob(key, value):
        """Flip an org knob AS THE ORG OWNER, and refuse to continue if the door said no.

        🚨 TWO BUGS LIVED HERE, AND BOTH MADE THE WALK LIE.
        (1) `set_config(..., is_local => true)` is TRANSACTION-scoped, and asyncpg runs every
        `execute` in its own implicit transaction — so the JWT claim was gone by the time the
        door ran, `auth.uid()` was null, and the write was refused. The knob never moved, the
        portal rendered in the "OFF" phase, and the assertions failed for a reason that had
        nothing to do with the product.
        (2) The refusal envelope was never checked, so the failure was silent. A test harness
        that ignores a refusal reports the product broken when it is the test that is broken.
        """
        async with conn.transaction():
            await conn.execute("select set_config('request.jwt.claims', $1, true)",
                               json.dumps({"sub": ADMIN_UID, "role": "authenticated"}))
            await conn.execute("select set_config('role','authenticated', true)")
            res = await conn.fetchval(
                "select platform.knob_override_set('continued_access',$1,'organization',$2::uuid,$2::uuid,$3::jsonb,$4)",
                key, ORG, json.dumps(value), "continued-access render walk")
        body = json.loads(res) if isinstance(res, str) else (res or {})
        if body.get("ok") is False:
            raise RuntimeError(f"knob_override_set refused {key}={value}: {body}")
        # Prove it actually resolves to what we asked for before rendering anything against it.
        got = await conn.fetchval(
            "select platform.knob_resolve('continued_access',$1,$2::uuid,null,null)", key, ORG)
        got = json.loads(got) if isinstance(got, str) else got
        if bool(got) is not bool(value):
            raise RuntimeError(f"knob {key} resolved to {got!r}, expected {value!r}")

    def auth_cookies(session):
        """The cookies @supabase/ssr 0.12 writes, built by hand.

        🚨 THE SESSION IS INSTALLED PROGRAMMATICALLY, NEVER TYPED INTO THE LOGIN FORM.
        `/portal` is in `routeRequiresAuthentication`, so the server redirects to /login before
        any client code runs — a localStorage session (the first attempt) is invisible to it.

        🚨 AND THE COOKIE NAME IS `sb-matrx-auth`, NOT `sb-<project_ref>-auth-token`.
        This app sets a CUSTOM storage key, so the documented default name is wrong here and a
        cookie under it is silently ignored — which reads exactly like a broken page. The name,
        the `base64-` prefix, the `.0`/`.1` chunking at 3180 chars and the padding were all read
        off a real session written by the app itself (via /api/dev-login) rather than assumed.
        """
        payload = json.dumps({
            "access_token": session["access_token"],
            "refresh_token": session["refresh_token"],
            "expires_at": session["expires_at"],
            "expires_in": session["expires_in"],
            "token_type": "bearer",
            "user": session["user"],
        }, separators=(",", ":"))
        value = "base64-" + base64.b64encode(payload.encode()).decode()
        name = "sb-matrx-auth"
        common = {"domain": "localhost", "path": "/", "httpOnly": False,
                  "secure": False, "sameSite": "Lax"}
        if len(value) <= 3180:
            return [{"name": name, "value": value, **common}]
        chunks = [value[i:i + 3180] for i in range(0, len(value), 3180)]
        return [{"name": f"{name}.{i}", "value": c, **common} for i, c in enumerate(chunks)]

    alumni = await mint(ALUMNI_UID, ALUMNI_EMAIL)
    rec("a real Supabase session is minted for the departed fixture account",
        bool(alumni.get("access_token")), f"user={alumni['user']['email']}")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch()

        async def open_portal(session, path, shot):
            ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
            await ctx.add_cookies(auth_cookies(session))
            page = await ctx.new_page()
            errs = []
            page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
            await page.goto(f"{ORIGIN}{path}", wait_until="networkidle")
            await page.wait_for_timeout(2500)
            body = await page.inner_text("body")
            await page.screenshot(path=f"{SHOTS}/{shot}", full_page=True)
            return page, ctx, body, errs

        # ---------- (a) PORTAL OFF: a sentence, not a blank page ----------
        await set_knob("portal_enabled", False)
        page, ctx, body, errs = await open_portal(alumni, "/portal", "01_portal_off.png")
        rec("PORTAL OFF — the org is named on screen", "Write Target Sandbox" in body, body[:160])
        rec("PORTAL OFF — refusal is a SENTENCE, not an empty page",
            "does not offer a portal to people who have left" in body, body[:240])
        rec("PORTAL OFF — no consent card is rendered",
            "verification" not in body.lower() or "Employment and income verification" not in body)
        await ctx.close()

        # ---------- (b) PORTAL ON + aspect ON: the consent flow, on screen ----------
        await set_knob("portal_enabled", True)
        await set_knob("verification_consent_enabled", True)
        page, ctx, body, errs = await open_portal(alumni, "/portal", "02_portal_on.png")
        rec("PORTAL ON — the page renders the portal for a departed member",
            "Your portal" in body and "Write Target Sandbox" in body, body[:200])
        rec("PORTAL ON — access-does-not-expire is stated",
            "does not expire" in body, body[:240])
        rec("PORTAL ON — the enabled aspect renders",
            "Employment and income verification" in body, body[:240])
        rec("PORTAL ON — no page-level console errors", not errs, "; ".join(errs[:2]))

        # the consent ask itself, with the requester named
        rec("the consent ask names WHO is asking",
            "Alumni Mortgage Co" in body or "CA Slice One Lender" in body, body[:400])
        await page.screenshot(path=f"{SHOTS}/03_consent_card.png", full_page=True)

        # ---------- (c) org-scoped route ----------
        await ctx.close()
        page, ctx, body, errs = await open_portal(alumni, f"/portal/{ORG}", "04_portal_by_org.png")
        rec("the per-organization route renders that org only",
            "Write Target Sandbox" in body, body[:200])
        await ctx.close()

        await browser.close()

    # ---------- restore the knobs the walk moved ----------
    await set_knob("portal_enabled", True)
    await set_knob("verification_consent_enabled", True)

    print("\n" + "=" * 78)
    for n, ok, d in R:
        print(("PASS  " if ok else "FAIL  ") + n)
    bad = [n for n, ok, _ in R if not ok]
    print("=" * 78)
    print(f"{len(R)-len(bad)}/{len(R)} passed. Screenshots: {SHOTS}")
    await conn.close(); await http.aclose()
    sys.exit(1 if bad else 0)


asyncio.run(main())
