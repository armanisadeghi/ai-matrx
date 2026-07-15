# Convergence C — Creators, Classes & Monetization (design + contracts)

> **North star for the fleet.** Arman's direction (2026-07-14): draw the line between amateurs and
> professionals; let the platform become a **revenue source for creators** and a home for **private
> groups**. Classes/groups come in **open, closed, and paid** flavors. The single most important growth
> lever: **creator landing pages** — teachers and successful YouTubers build a public page featuring
> their YouTube videos + free Matrx tools (flashcards, guides, podcasts, lessons); **the creators bring
> the business.** Must stay **school-safe** (compliance) so we're never banned on school devices.
> Status doc: [`STATUS.md`](./STATUS.md). Builds on the per-class hub ([`W2-class-hub.md`](./W2-class-hub.md)).

## The model (scopes-native, reuse-first — extend, don't fork)

- **A class/group = a scope** (already built: class = scope, content↔class = `platform.associations`,
  metadata + dates in `scope.settings`). Extend with:
  - `access_mode: 'open' | 'closed' | 'paid'` (in `scope.settings`).
    - **open** — publicly listed + anyone can join (a free public study group / a creator's free class).
    - **closed** — invite or request→approve; not publicly listed.
    - **paid** — join is gated by an entitlement/purchase (see Monetization).
  - **Owner = teacher/creator**; **roster = `iam.memberships`** on the class's scope (owner role +
    member role). Reuse the canonical membership + `iam.permissions` sharing — do NOT invent a roster table.
  - A **join/enroll RPC** (`edu_class_join` / `_request` / `_approve` / `_leave`) — the contract every
    surface uses. Open→immediate; closed→request/approve; paid→gated on entitlement.
- **Creator profile** = a public identity (handle, display name, bio, avatar, links). Reuse the existing
  user/org profile primitives; add only a public `creator_handle` + public-profile flag if missing.
- **Creator landing page** = a public, SEO-first page at **`/c/[handle]`** (indexable) featuring the
  creator's: embedded YouTube videos, free flashcard sets, guides (`learn_doc`), podcasts/audio, and
  classes with enroll CTAs. Reuse the `/learn` publishing engine + the `/p/e` public viewer + the class
  model. Content on the page = the creator's public resources (associations) they choose to feature.

## Monetization

- **Paid access** = the class join is gated by an entitlement grant that a purchase confers. Build the
  ACCESS GATE now (a paid class checks a `class_access` entitlement; free/preview content stays open).
- **Creator payouts** (real money to creators, revenue share) = **Stripe Connect marketplace** — a real
  money-movement + tax/legal build. **DECISION PENDING (Arman).** Build the gate + the "this class is
  $X / enroll" UI now against a purchase stub; wire real Connect payouts after Arman confirms the model.

## Compliance (school-safe — non-negotiable for the school market)

- **Guardian consent** (built) — plus **D52 fix**: `guardian_grant`/`request` must not leak email
  existence via error branching, and needs a rate limit on consent requests.
- **Age gate** — capture/represent an age band (under-13 → COPPA path: parental consent required before
  any data collection; 13-17 → school/guardian context).
- **Data rights** — a student can **export** and **delete** their own study data (FERPA/COPPA data
  ownership). Reuse the existing export (`/education/data`) + add account-scoped delete.
- **Review-readiness checklist** — a doc enumerating what each store/school review (Apple/Google
  education, ChromeOS, district IT) requires + our posture, so we're never surprise-banned.
- **DUA / policy text + the actual legal review** = Arman/legal, not code.

## Decisions — RESOLVED (Arman, 2026-07-15)

1. **Creator payouts — Stripe Connect Express.** Marketplace payouts to creators; build checkout →
   application_fee split → transfer to the creator's Connect account → payout. Test mode first; Arman
   enables Connect + provides keys/webhook secret.
2. **Subdomain — `learn.aimatrx.com`** (free, instant on Vercel; a dedicated education-only origin for
   school/store reviews). Code uses a configurable public education origin for canonicals/OG/sitemap;
   Arman adds the domain in Vercel + points DNS.
3. **COPPA — enforce server-side + verifiable parental consent** ("biggest of all"). Build server-side
   gate at the aidream generation boundary + a verifiable-consent flow on the guardian system; produce a
   precise Arman runbook for the legal/consent-method/store steps only he can do.

## Fleet contracts (so nobody waits)

- **`edu_class_join` family** — published by the class-model build; consumed by the landing page enroll
  CTA + the class hub. `{class, access_mode}` → immediate / pending / needs-purchase.
- **Creator public content** — the landing page reads the creator's public resources via the existing
  associations + publishing reads; no new content store.
- **Entitlement gate for paid** — reuse `features/entitlements` + a `class_access` capability/grant.

## Change log
- **2026-07-14** — Created from Arman's creator-monetization + school-safe direction.
