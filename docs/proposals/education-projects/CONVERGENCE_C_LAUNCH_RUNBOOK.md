# Convergence-C Launch Runbook — what Arman must do

> The code for creator payouts, the `learn.` subdomain, and COPPA (server-side enforcement + verifiable
> consent) is BUILT. This is the exact, sequenced list of the things only you can do — dashboard config,
> DNS, a couple of legal/product decisions. Companion: [`COPPA_VERIFIABLE_CONSENT_RUNBOOK.md`](./COPPA_VERIFIABLE_CONSENT_RUNBOOK.md).
> Status: [`STATUS.md`](./STATUS.md). Last updated 2026-07-15.

Legend: **[YOU]** = only you can · **[CODE ✅]** = built + verified · **[CODE→]** = small code follow-up once you decide.

---

## 1. Stripe Connect — creator payouts + paid classes

Built [CODE ✅]: Express onboarding, paid-class checkout (destination charge, platform 20% / creator 80%),
**webhook-only** access grants (a client can never self-grant), refund/dispute → revoke. Blocked only on the
Stripe account being Connect-enabled.

1. **[YOU] Enable Connect** — https://dashboard.stripe.com/connect (currently OFF). Complete the platform
   profile it asks for: business name, support email, statement descriptor.
2. **[YOU] Set `STRIPE_WEBHOOK_SECRET`** (currently unset) and register the webhook endpoint
   `POST /api/stripe/webhook`, subscribed to: `checkout.session.completed`, `charge.refunded`,
   `charge.dispute.created`, `account.updated` (plus the existing subscription events). Dev:
   `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
3. No Connect `client_id` needed (Express uses `accounts.create({type:'express'})`, already wired).
4. **[YOU] Verify in TEST mode:** connect a test Express account → set a class paid + priced → buy with a
   test card → confirm the webhook confers the `active` membership and the 20/80 split lands on the
   PaymentIntent (`application_fee_amount` + transfer). Then decide when to go live-mode.

## 2. Subdomain — `learn.aimatrx.com`

Built [CODE ✅]: `NEXT_PUBLIC_EDU_ORIGIN` drives all public education/creator canonicals/OG/sitemap; `proxy.ts`
serves only the education/creator surface on that host (builder/admin routes bounce to the main host). No-op
until you configure it.

1. **[YOU] Vercel → Settings → Domains** — add `learn.aimatrx.com` to the matrx-frontend project.
2. **[YOU] DNS** — add the CNAME at the registrar (Vercel shows the target).
3. **[YOU] Env** — set `NEXT_PUBLIC_EDU_ORIGIN=https://learn.aimatrx.com` and redeploy.
4. **[CODE→] Auth cookie domain** — for a session to span `www.` and `learn.`, the Supabase auth cookie must
   be issued with `domain: ".aimatrx.com"` (host-only today). Tell me to make that change when you're ready
   to flip the subdomain on (small, but it touches the auth cookie — do it deliberately).

## 3. COPPA / school-safe — the big one

Both enforcement layers are BUILT + LIVE: the browser gate (fails closed on all 9 AI entries), the **aidream
server gate** (deployed — refuses education AI for an unverified under-13 at the generation boundary), and
**verifiable parental consent** (a guardian completes a $0.50 auth-and-void card check → the child is
unblocked; service-role-only, a child can't self-verify; revoke re-blocks). Student data export/delete/restore
and D52 are done. What's left is not code:

1. **[YOU — LEGAL] Pick the verifiable-consent method(s) you'll *require*.** COPPA §312.5 lists acceptable
   methods; we built the **card auth-and-void** (self-serve, cleanest) and scaffolded a **signed form**; a
   **gov-ID/KBA vendor** (Stripe Identity / Persona / PRIVO) is stubbed. Decide which to require, whether
   auth-and-void or a refunded charge, consent-retention period, and the age-change re-consent policy.
   Recommendation: card auth-and-void as the default self-serve method + a signed-form fallback; add a vendor
   later only if a partner demands it. Wiring a chosen vendor is a small follow-up [CODE→].
2. **[YOU — LEGAL] Age declaration is self-declared** (standard COPPA "age screening"). This is normal
   practice, BUT it means someone can declare "adult" to skip both gates. **CODE DONE (D57, 2026-07-15):**
   `age_band` now has exactly ONE write path (`edu_set_age_band` RPC — a DB trigger blocks any direct
   `users.profiles` update to that column, live-verified) and every change is audited to
   `education.data_rights_event` with a loud flag on a self-declared `under_13 → adult` transition. What's
   still open is the *policy*, not the mechanism: neutral age screening + audited self-declared changes is
   the industry norm (you already have this now); if you want stronger, that's a verifiable-age step
   (heavier — needs its own vendor/UX, separate from the guardian-verification vendor in item 1). Decide, then
   document the choice in your privacy policy. Detail: `COPPA_VERIFIABLE_CONSENT_RUNBOOK.md` §1's last item.
3. **[YOU — LEGAL] Privacy policy + DPA/DUA + data-safety labels** — the written COPPA/FERPA privacy policy,
   a District Data Use Agreement template, and the Apple/Google data-safety form answers. See
   [`SCHOOL_SAFE_CHECKLIST.md`](./SCHOOL_SAFE_CHECKLIST.md) for the itemized posture (what's code-satisfied vs
   what needs your text). Consider a COPPA Safe Harbor (e.g. kidSAFE, PRIVO) for faster school/store trust.
4. **[CODE→, low urgency] aidream ORM regen** — a migration didn't run `db/generate.py`; a full regen
   reconciles the models (one column was hand-added). Flagged in aidream `FOUND_DEFECTS.md`.
5. **[CODE→] Hard-purge cron** — the 30-day data-deletion window needs a server cron to hard-purge after it
   elapses (soft-delete + restore is built). Tell me to wire it.

## 4. Deploy / push state

- **aidream:** COPPA server enforcement is **on prod** (deployed via the main→Coolify webhook, healthy). A
  versioned `release.sh` is pending on others' unapplied migrations — not blocking the deployed enforcement.
- **matrx-frontend:** all Convergence-C code is committed on local `main`, **not pushed** (a push deploys
  aimatrx.com prod). Push when you've clicked through + are ready — it carries this whole session's work.

## Change log
- **2026-07-15** — Created. Stripe Connect, `learn.` subdomain, and COPPA (server enforcement + verifiable
  consent) built; this is the human-action checklist to take them live.
