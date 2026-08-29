"""T-L1-8 clause 5 — the FORMER employee's income letter, rendered, with the pay figure on it.

Run:  cd /Users/armanisadeghi/code/aidream && uv run --with httpx --with asyncpg --with playwright \
        --with pypdf --with python-dotenv \
        python /Users/armanisadeghi/code/matrx-frontend/scripts/hr/continued_access_letter_render.py

This is the half the database could not prove. The consent blocker is gone (the departed member
answered through the portal, `awaiting_consent -> received`); what remains is that the letter
actually GENERATES and asserts the LAST compensation in force, in the PAST tense, for someone who
no longer works there.

The bar, from the register: `compensation_as_of(last_day) = 96000`, the snapshot frozen as of the
LAST DAY WORKED (2026-08-20) and not the run date, and employment stated as ended.

🚨 Admin session via /api/dev-login (the repo's own lane, which signs in as AI_ADMIN_USERNAME from
env). No password is typed anywhere by hand.
"""
import asyncio, json, os, io, sys

import asyncpg
import httpx
from dotenv import load_dotenv
from playwright.async_api import async_playwright
from pypdf import PdfReader

load_dotenv("/Users/armanisadeghi/code/aidream/.env")
load_dotenv("/Users/armanisadeghi/code/matrx-frontend/.env.local", override=False)

ORIGIN  = "http://localhost:3000"
BACKEND = os.environ.get("NEXT_PUBLIC_BACKEND_URL_PROD", "https://server.app.matrxserver.com").rstrip("/")
ORG     = "2643e470-b275-47f3-95f3-ae275ad3ca47"
LETTER  = "ab12c3fd-0f49-44be-b61b-3048d1951817"   # consented by the departed member
EMPLOYMENT = "0b4eec20-97a0-45fd-9078-8dfc899fec1f"
LAST_DAY = "2026-08-20"
SHOTS = "/private/tmp/claude-501/-Users-armanisadeghi-code-common-docs/c70d36d3-9188-4d99-aaed-c2f11032e2eb/scratchpad/shots"

R = []
def rec(name, ok, detail=""):
    R.append((name, bool(ok), str(detail)[:300]))
    print(("  PASS  " if ok else "  FAIL  ") + name + ("   " + str(detail)[:220] if detail else ""))


async def main():
    conn = await asyncpg.connect(
        host=os.environ["SUPABASE_MATRIX_HOST"], port=int(os.environ["SUPABASE_MATRIX_PORT"]),
        database=os.environ["SUPABASE_MATRIX_DATABASE_NAME"], user=os.environ["SUPABASE_MATRIX_USER"],
        password=os.environ["SUPABASE_MATRIX_PASSWORD"], statement_cache_size=0)

    pre = await conn.fetchrow(
        "select state, includes_compensation, employee_consent_at, letter_file_id, snapshot "
        "from hr.verification_letter_request where id=$1", LETTER)
    rec("the request is CONSENTED by the departed member before we start",
        pre["state"] in ("received", "generated", "delivered") and pre["employee_consent_at"] is not None,
        f"state={pre['state']} consent_at={pre['employee_consent_at']}")

    comp = await conn.fetchval(
        "select (hr.compensation_as_of($1::uuid, $2::text::date)).amount", EMPLOYMENT, LAST_DAY)
    rec("the resolver still says 96000 as of the last day worked", float(comp or 0) == 96000.0, f"{comp}")

    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1400, "height": 950},
                                  accept_downloads=True)
        page = await ctx.new_page()
        await page.goto(f"{ORIGIN}/api/dev-login?token={os.environ['DEV_LOGIN_TOKEN']}&next=/hr/people",
                        wait_until="domcontentloaded")
        await page.wait_for_timeout(5000)
        rec("an HR admin session is established through the repo's own dev-login lane",
            "/login" not in page.url, page.url)

        # 🚨 GENERATION LIVES ON THE AIDREAM SERVER, NOT ON NEXT.
        # `/api/hr/verification-letters/{id}/generate` is mounted by
        # aidream/api/routers/hr_employees.py and reached through useBackendApi(), so posting it
        # at the Next origin 404s -- which is exactly what happened on the first run of this
        # script and would have been reported as "generation is broken" by a less careful walk.
        # The router requires X-Organization-Id (the whole router depends on
        # require_organization_context and 422s without it) plus the body's own organization_id.
        # 🚨 THE ADMIN TOKEN COMES FROM THE DOCUMENTED ENV LANE, NOT FROM THE COOKIE.
        # Reassembling the chunked `sb-matrx-auth` cookie is brittle (chunk boundaries and a
        # sibling `-code-verifier` cookie both corrupt it), and it is not the point of this
        # proof. `AI_ADMIN_USERNAME` / `AI_ADMIN_PASSWORD` are the workspace's documented admin
        # credentials, read from env -- exactly what /api/dev-login does on the server. Nothing
        # is typed by hand.
        async with httpx.AsyncClient(timeout=120) as hc:
            tok = await hc.post(
                f"{os.environ['SUPABASE_MATRIX_URL'].rstrip('/')}/auth/v1/token?grant_type=password",
                headers={"apikey": os.environ["SUPABASE_MATRIX_PUBLISHABLE_KEY"]},
                json={"email": os.environ["AI_ADMIN_USERNAME"],
                      "password": os.environ["AI_ADMIN_PASSWORD"]})
            access = tok.json()["access_token"]
            r = await hc.post(
                f"{BACKEND}/api/hr/verification-letters/{LETTER}/generate",
                headers={"Authorization": f"Bearer {access}",
                         "X-Organization-Id": ORG,
                         "Content-Type": "application/json"},
                json={"organization_id": ORG, "includes_compensation": True,
                      "recipient": "Alumni Mortgage Co"})
            gen = {"status": r.status_code, "body": r.text[:600]}
        rec("the generation route accepts the former employee's consented letter",
            gen["status"] < 400, f"{gen['status']} {gen['body'][:200]}")

        row = await conn.fetchrow(
            "select state, letter_file_id, snapshot, generated_at from hr.verification_letter_request where id=$1", LETTER)
        rec("the request reached `generated` and carries a real file",
            row["state"] in ("generated", "delivered") and row["letter_file_id"] is not None,
            f"state={row['state']} file={row['letter_file_id']}")

        snap = row["snapshot"]
        snap = json.loads(snap) if isinstance(snap, str) else (snap or {})
        rec("the snapshot is frozen AS OF THE LAST DAY WORKED, not the run date",
            str(snap.get("as_of", ""))[:10] == LAST_DAY, f"as_of={snap.get('as_of')}")
        rec("the snapshot states the person is a FORMER employee",
            snap.get("is_former") is True or
            (snap.get("employment") or {}).get("status") == "terminated",
            f"is_former={snap.get('is_former')} status={(snap.get('employment') or {}).get('status')}")

        blob = json.dumps(snap)
        rec("the snapshot carries the last compensation in force (96000)",
            "96000" in blob.replace(",", "").replace(".0000", ""), blob[:240])

        # Pull the actual PDF bytes through the app, as the browser would.
        got = await page.evaluate(
            """async (fid) => {
                 const r = await fetch(`https://files.matrxserver.com/files/${fid}/download?inline=1`,
                                       { credentials: 'include' });
                 if (!r.ok) return { status: r.status, b64: null };
                 const buf = new Uint8Array(await r.arrayBuffer());
                 let s = ''; for (const b of buf) s += String.fromCharCode(b);
                 return { status: r.status, b64: btoa(s) };
               }""", str(row["letter_file_id"]))
        rec("the generated PDF downloads", got["status"] == 200 and bool(got["b64"]), f"http={got['status']}")

        if got["b64"]:
            import base64
            raw = base64.b64decode(got["b64"])
            rec("it is a real PDF", raw[:5] == b"%PDF-", raw[:12])
            text = "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(raw)).pages)
            flat = text.replace(",", "").replace("\n", " ")
            rec("🚨 THE PAY FIGURE IS ON THE LETTER (96,000)",
                "96000" in flat or "96,000" in text, text[:400])
            rec("the letter reads in the PAST tense about employment",
                any(w in text.lower() for w in ["was employed", "were employed", "employment ended",
                                                "last day", "former", "until"]), text[:400])
            open(f"{SHOTS}/letter.pdf", "wb").write(raw)
            open(f"{SHOTS}/letter.txt", "w").write(text)

        await page.screenshot(path=f"{SHOTS}/10_letter_generated.png", full_page=True)
        await b.close()

    print("\n" + "=" * 78)
    for n, ok, _ in R:
        print(("PASS  " if ok else "FAIL  ") + n)
    bad = [n for n, ok, _ in R if not ok]
    print("=" * 78)
    print(f"{len(R)-len(bad)}/{len(R)} passed. Artifacts in {SHOTS}")
    await conn.close()
    sys.exit(1 if bad else 0)

asyncio.run(main())
