"""T-L1-5 clause C — is the REAL offboarding dialog on PRODUCTION yet?

Run:  cd /Users/armanisadeghi/code/aidream && uv run --with httpx --with playwright \
        python /Users/armanisadeghi/code/matrx-frontend/scripts/hr/t_l1_5_production_offboarding_check.py

G2 round 42 verified the offboarding dialog on the MERGED build while www.aimatrx.com still served
a "Start offboarding — coming soon" stub. That was train lag, not a code gap. This re-asks the
question against the DEPLOYED site, weeks of releases later.

🚨 IT OPENS THE DIALOG AND STOPS. Production talks to the same live database, so nothing here
submits: no separation is recorded, no fixture is mutated. The oracle is what the dialog SAYS.

🚨 THE SESSION IS MINTED, NEVER TYPED. admin generate_link + verify gives a real Supabase session;
the cookie is written the way @supabase/ssr writes it (custom storage key `sb-matrx-auth`,
`base64-` prefix, chunked at 3180) — the recipe proven in continued_access_render_walk.py.
"""
import asyncio, base64, json, os, sys

import httpx
from dotenv import load_dotenv
from playwright.async_api import async_playwright

load_dotenv("/Users/armanisadeghi/code/aidream/.env")

ORIGIN = "https://www.aimatrx.com"
ORG = "2643e470-b275-47f3-95f3-ae275ad3ca47"
ADMIN = "admin@admin.com"
SHOTS = ("/private/tmp/claude-501/-Users-armanisadeghi-code-common-docs/"
         "c70d36d3-9188-4d99-aaed-c2f11032e2eb/scratchpad/shots")

STUB_MARKERS = ("coming soon", "not switched on yet")
REAL_MARKERS = ("last day worked", "termination date")


def cookies(session, domain):
    payload = json.dumps({
        "access_token": session["access_token"],
        "refresh_token": session["refresh_token"],
        "expires_at": session["expires_at"],
        "expires_in": session["expires_in"],
        "token_type": "bearer",
        "user": session["user"],
    }, separators=(",", ":"))
    # 🚨 URL-SAFE base64, UNPADDED. @supabase/ssr 0.12 decodes this cookie with
    # stringFromBase64URL(), whose alphabet has no "+" or "/" — a STANDARD-base64
    # value throws inside the parser and the session is dropped, which on screen looks
    # exactly like a login redirect. "=" is ignored by the decoder; we strip it anyway.
    value = "base64-" + base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    common = {"domain": domain, "path": "/", "httpOnly": False, "secure": True, "sameSite": "Lax"}
    if len(value) <= 3180:
        return [{"name": "sb-matrx-auth", "value": value, **common}]
    chunks = [value[i:i + 3180] for i in range(0, len(value), 3180)]
    return [{"name": f"sb-matrx-auth.{i}", "value": c, **common} for i, c in enumerate(chunks)]


async def main():
    os.makedirs(SHOTS, exist_ok=True)
    base = os.environ["SUPABASE_MATRIX_URL"].rstrip("/")
    anon = os.environ["SUPABASE_MATRIX_PUBLISHABLE_KEY"]
    service = os.environ["SUPABASE_MATRIX_SECRET_KEY"]

    async with httpx.AsyncClient(timeout=60) as http:
        r = await http.post(f"{base}/auth/v1/admin/generate_link",
                            headers={"apikey": service, "Authorization": f"Bearer {service}",
                                     "Content-Type": "application/json"},
                            json={"type": "magiclink", "email": ADMIN})
        r.raise_for_status()
        r = await http.post(f"{base}/auth/v1/verify",
                            headers={"apikey": anon, "Content-Type": "application/json"},
                            json={"type": "magiclink", "token_hash": r.json()["hashed_token"]})
        r.raise_for_status()
        session = r.json()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 1440, "height": 950})
        await ctx.add_cookies(cookies(session, "www.aimatrx.com"))
        page = await ctx.new_page()

        await page.goto(f"{ORIGIN}/hr/people?org={ORG}", wait_until="networkidle")
        who = await page.evaluate(
            "async () => { const r = await fetch('/api/session-token').then(r=>r.json());"
            " const p = JSON.parse(atob(r.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));"
            " return {email: p.email, sub: p.sub}; }")
        print(f"IDENTITY ON PRODUCTION: {who}")
        if who.get("email") != ADMIN:
            print("REFUSING TO REPORT: the production session is not the admin"); return 2

        await page.screenshot(path=f"{SHOTS}/prod_directory.png", full_page=False)

        # the row kebab — the same menu round 42 walked
        kebabs = page.locator('button[aria-haspopup="menu"]')
        n = await kebabs.count()
        print(f"row menus found: {n}")
        opened = False
        for i in range(n):
            try:
                await kebabs.nth(i).click(timeout=4000)
                await page.wait_for_timeout(500)
                if await page.get_by_text("Start offboarding", exact=False).count():
                    opened = True
                    break
                await page.keyboard.press("Escape")
            except Exception:
                continue
        print(f"a kebab with 'Start offboarding': {opened}")
        await page.screenshot(path=f"{SHOTS}/prod_kebab.png")
        if not opened:
            print("VERDICT: the verb is not on the deployed menu at all")
            await browser.close(); return 1

        await page.get_by_text("Start offboarding", exact=False).first.click()
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f"{SHOTS}/prod_offboard_dialog.png")
        body = (await page.inner_text("body")).lower()
        stub = [m for m in STUB_MARKERS if m in body]
        real = [m for m in REAL_MARKERS if m in body]
        print(f"stub markers present: {stub}")
        print(f"real-dialog markers present: {real}")
        print("VERDICT: " + ("PRODUCTION SERVES THE REAL DIALOG" if real and not stub
                             else "PRODUCTION STILL SERVES THE COMING-SOON STUB" if stub
                             else "INCONCLUSIVE — read the screenshot"))
        await browser.close()
    print(f"screenshots in {SHOTS}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
