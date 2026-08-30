"""continued-access — the COPPA age-gate walk: suppressed on /portal, unchanged everywhere else.

Run:  cd /Users/armanisadeghi/code/aidream && uv run --with httpx --with asyncpg --with playwright \
        --with python-dotenv python /Users/armanisadeghi/code/matrx-frontend/scripts/hr/continued_access_age_gate_walk.py

Proves the ruling on continued-access HANDOFF §5, as renders:
  (a) /portal, departed fixture member with age_band NULL — the "How old are you?" popup does
      NOT open, and the consent card is immediately visible (no modal covering it).
  (b) /dashboard, the SAME session in a fresh context — the popup still fires, proving the
      suppression is scoped to the portal route group and COPPA behavior is unchanged on the
      general platform.

Same harness as continued_access_render_walk.py: synthetic account, admin-API password set,
real Supabase session installed as the app's own chunked `sb-matrx-auth` cookie. Mutates
nothing but the fixture account's password.
"""
import asyncio, json, os, sys, base64

import asyncpg
import httpx
from dotenv import load_dotenv
from playwright.async_api import async_playwright

load_dotenv("/Users/armanisadeghi/code/aidream/.env")

ORIGIN       = "http://localhost:3001"
ALUMNI_EMAIL = "zzz.departed.alumni@example.test"
ALUMNI_UID   = "0c2f61fa-6d3d-4705-bee9-fb8cd1280c4a"
PROOF_PW     = "ContinuedAccessRenderWalk2026!"
MODAL_TEXT   = "How old are you?"
SHOTS        = "/private/tmp/claude-501/-Users-armanisadeghi-code-common-docs/03c353ed-aedd-4f9e-808c-4d9d7c79ea9a/scratchpad/shots"

R = []
def rec(name, ok, detail=""):
    R.append((name, bool(ok), str(detail)[:400]))
    print(("  PASS  " if ok else "  FAIL  ") + name + ("   " + str(detail)[:200] if detail else ""))


async def main():
    os.makedirs(SHOTS, exist_ok=True)
    base    = os.environ["SUPABASE_MATRIX_URL"].rstrip("/")
    anon    = os.environ["SUPABASE_MATRIX_PUBLISHABLE_KEY"]
    service = os.environ["SUPABASE_MATRIX_SECRET_KEY"]
    http = httpx.AsyncClient(timeout=90)

    # The gate only fires for an UNDECLARED account — assert the fixture still is one, so a
    # "no modal on /portal" result can never be the fixture having a band rather than the fix.
    conn = await asyncpg.connect(
        host=os.environ["SUPABASE_MATRIX_HOST"], port=int(os.environ["SUPABASE_MATRIX_PORT"]),
        database=os.environ["SUPABASE_MATRIX_DATABASE_NAME"], user=os.environ["SUPABASE_MATRIX_USER"],
        password=os.environ["SUPABASE_MATRIX_PASSWORD"], statement_cache_size=0)
    band = await conn.fetchval("select age_band from users.profiles where id=$1::uuid", ALUMNI_UID)
    await conn.close()
    rec("fixture precondition — the departed member is age-UNDECLARED", band is None, f"age_band={band!r}")
    if band is not None:
        sys.exit(1)

    r = await http.put(f"{base}/auth/v1/admin/users/{ALUMNI_UID}",
                       headers={"apikey": service, "Authorization": f"Bearer {service}"},
                       json={"password": PROOF_PW, "email_confirm": True})
    assert r.status_code < 300, r.text[:200]
    r = await http.post(f"{base}/auth/v1/token?grant_type=password",
                        headers={"apikey": anon, "Content-Type": "application/json"},
                        json={"email": ALUMNI_EMAIL, "password": PROOF_PW})
    assert r.status_code < 300, r.text[:200]
    session = r.json()
    rec("a real Supabase session is minted for the departed fixture account",
        bool(session.get("access_token")), f"user={session['user']['email']}")

    def auth_cookies(s):
        payload = json.dumps({
            "access_token": s["access_token"], "refresh_token": s["refresh_token"],
            "expires_at": s["expires_at"], "expires_in": s["expires_in"],
            "token_type": "bearer", "user": s["user"],
        }, separators=(",", ":"))
        # 🚨 URL-SAFE base64, UNPADDED. @supabase/ssr 0.12 decodes this cookie with
        # stringFromBase64URL(), whose alphabet has no "+" or "/" — a STANDARD-base64
        # value throws inside the parser and the session is dropped, which on screen looks
        # exactly like a login redirect. "=" is ignored by the decoder; we strip it anyway.
        value = "base64-" + base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
        common = {"domain": "localhost", "path": "/", "httpOnly": False,
                  "secure": False, "sameSite": "Lax"}
        if len(value) <= 3180:
            return [{"name": "sb-matrx-auth", "value": value, **common}]
        chunks = [value[i:i + 3180] for i in range(0, len(value), 3180)]
        return [{"name": f"sb-matrx-auth.{i}", "value": c, **common} for i, c in enumerate(chunks)]

    async with async_playwright() as pw:
        browser = await pw.chromium.launch()

        async def open_page(path, shot, settle_ms):
            ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
            await ctx.add_cookies(auth_cookies(session))
            page = await ctx.new_page()
            await page.goto(f"{ORIGIN}{path}", wait_until="networkidle")
            # The gate mounts in the DEFERRED singleton tree (post-mount, post-idle) —
            # give it real time to fire before believing its absence.
            await page.wait_for_timeout(settle_ms)
            body = await page.inner_text("body")
            await page.screenshot(path=f"{SHOTS}/{shot}", full_page=True)
            return page, ctx, body

        # ---------- (a) /portal: no age modal, consent card immediately visible ----------
        page, ctx, body = await open_page("/portal", "age_gate_01_portal.png", 12000)
        rec("PORTAL — the portal itself rendered for the departed member",
            "Your portal" in body and "Write Target Sandbox" in body, body[:200])
        rec("PORTAL — the 'How old are you?' popup does NOT open",
            MODAL_TEXT not in body, body[:200])
        rec("PORTAL — the consent aspect is immediately visible (nothing covers it)",
            "Employment and income verification" in body, body[:300])
        await ctx.close()

        # ---------- (b) /dashboard, same person: the gate still fires ----------
        page, ctx, body = await open_page("/dashboard", "age_gate_02_dashboard.png", 3000)
        try:
            await page.wait_for_selector(f"text={MODAL_TEXT}", timeout=25000)
            fired = True
        except Exception:
            fired = False
        await page.screenshot(path=f"{SHOTS}/age_gate_02_dashboard.png", full_page=True)
        rec("GENERAL PLATFORM — the same undeclared account IS asked on /dashboard", fired)
        await ctx.close()

        await browser.close()

    print("\n" + "=" * 78)
    for n, ok, d in R:
        print(("PASS  " if ok else "FAIL  ") + n)
    bad = [n for n, ok, _ in R if not ok]
    print("=" * 78)
    print(f"{len(R)-len(bad)}/{len(R)} passed. Screenshots: {SHOTS}")
    await http.aclose()
    sys.exit(1 if bad else 0)


asyncio.run(main())
