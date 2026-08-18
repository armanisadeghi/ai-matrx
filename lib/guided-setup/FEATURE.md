# Guided Setup — the persistent, resumable guided checklist

**Status:** Live 2026-08-14. **Home:** `lib/guided-setup/`. **Table:**
`platform.guided_checklist_run` (live, canonical-certified). **First consumers:**
`marketing.site_setup` on `/marketing/brands/[brandId]/sites/[siteId]/integrations`
and as the gate on `…/intake`.

> **Arman's ruling, 2026-08-14:** *"anything we can do on their behalf we'll do on
> their behalf, and anything we can't, we'll teach them how to do it… if there are
> things they have to do themselves, we create a checklist for them that has
> persistence… if there are things we can programmatically check, we check it for
> them."*

That ruling is the whole spec, and it produces exactly **three kinds of step and
no others**:

| Kind | Who acts | What we show |
|---|---|---|
| **`auto`** | **We do.** The user does nothing. | "We do this for you", and it working. Runs unasked (unless `autoRun: false`). |
| **`verified`** | The user does it in someone else's UI. | A **live** pass/fail with the reason **and the one-click fix**. Never a checkbox — never make a human self-report something we can verify. |
| **`confirmed`** | The user, on something genuinely un-checkable. | Exact copy-paste values (each with a Copy button) + a plain-language how-to + a tick box. |

**Our user is a brilliant, absolutely non-technical expert.** DNS records, DMARC
policy, Search Console properties are exactly what they will never do unaided, and
a red "SPF not found" with no next step ends their day. Every user-facing string in
a definition is written for them: zero jargon, zero developer concepts. This module
supplies no domain words of its own.

## Why it exists

Because the same thing was being hand-rolled, worse, everywhere — see *Migration
map* below. The version this replaced (the top of `SiteIntakeWizard`) was two
dead-end blocks, each with one button: no memory of where you were, no view of what
else was missing, and nothing that ever re-checked.

## The laws

1. **THE TRUE-CURRENT-STATUS LAW.** Nothing machine-checkable is ever stamped.
   Every `auto` and `verified` step is re-checked on mount and again when the tab
   regains focus after a quiet minute — because **a step that passed can regress**
   (a DNS record gets deleted, a token is revoked). A step that passed in March and
   broke in April reads broken today, and says *"This was set up before and isn't
   any more."* rather than silently reopening.
2. **Persist only what cannot be derived.** `state` holds human confirmations
   (with who and when), a record of auto steps we performed, and a *paint-fast*
   last-known cache. The cache is **never the answer** — any step still showing it
   is flagged `stale` with "last checked N ago" and is overwritten the moment the
   live check lands.
3. **`unknown` is not `fail`.** "We could not check" gets its own neutral state.
   Rendering it red tells the user they did something wrong when in fact we did
   not look — and it must never trigger an auto action (see 5).
4. **Every failure ships its fix.** A `CheckResult` with `status: "fail"` and no
   `fix` is the dead end this exists to delete. `fix.href` sends them somewhere;
   `fix.run` does it for them.
5. **Never act on a guess.** An `auto` step runs only off a **live `fail`** —
   never off a stale result, never off `unknown`, never while blocked. Doing a
   side effect because we could not check is how a "helpful" system does something
   the user never asked for.
6. **A checklist is DECLARED, never hand-built.** Register a `ChecklistDefinition`
   and mount `<GuidedChecklist>`. A surface that assembles its own step list is
   the defect. `steps` may be a **pure factory over the context** when the step
   LIST itself comes from the outside world (`billing.creator_payouts`: Stripe's
   requirement codes are an open list, and a fixed array can only name the ones
   somebody thought of — anything else would have no row at all). The factory is
   still part of the declaration, and its ids must be STABLE for a given world
   state, because step ids are persistence keys. Read steps through
   `checklistSteps(definition, ctx)`, never `definition.steps`.
7. **A completed checklist does not vanish.** It stays reachable so the user can
   re-check, see what is set up, and change the answer only they can give.
   `hideWhenComplete` exists for gate surfaces **only** when another surface keeps
   it reachable.

## Parts

| Part | Path | What it owns |
|---|---|---|
| Types | `types.ts` | `ChecklistDefinition`, the three step kinds, `CheckResult`, `CheckFix`, `CopyValue`, the resolved view |
| Pure engine | `engine.ts` | The **only** place meaning is decided: status per step, dependency blocking, regression detection, progress, which step is current, which auto steps may run |
| Registry | `registry.ts` | `registerChecklist` / `getChecklist` / `listChecklists`; screams on a duplicate key or step id (both are persistence keys) |
| Persistence | `service.ts` | Direct Supabase on `platform.guided_checklist_run`; version-guarded writes that **re-apply on conflict** so a teammate's tick is never clobbered |
| Hook | `useGuidedChecklist.ts` | The I/O: load-or-create, run every check, re-verify on return, hold writes until the row lands, serialize saves, run auto steps |
| UI | `components/GuidedChecklist.tsx` | The one surface. Progress bar, per-step rows, copy rows, how-to, fix buttons, regression banner |
| Tests | `__tests__/engine.test.ts` | 16 tests locking the laws above |

## Writing a checklist

```ts
export const myChecklist = registerChecklist<MyCtx>({
  key: "feature.thing_setup",          // namespaced; it is the persistence key
  title: "Get your thing ready",
  steps: [
    { kind: "verified", id: "connected", title: "Connected to X",
      check: async (ctx) => ctx.bound
        ? { status: "pass" }
        : { status: "fail", reason: "X isn't connected yet.",
            fix: { label: "Connect X", href: "/settings/x" } } },
    { kind: "auto", id: "import", title: "Your history is in",
      dependsOn: ["connected"],
      check: async (ctx) => …, run: async (ctx) => … },
    { kind: "confirmed", id: "right_one", title: "This is the right one",
      dependsOn: ["connected"],
      values: (ctx) => [{ label: "Connected", value: ctx.ref }],
      howTo: () => ["Compare the two lines above.", "…"] },
  ],
});
```

Mount it:

```tsx
<GuidedChecklist
  definition={myChecklist}
  context={ctx}                                    // memoize it
  scope={{ organizationId: org.id, targetKey: thing.id }}
/>
```

**Step ids and the checklist key are persistence keys.** Renaming one abandons the
saved run. `targetKey` names the instance (a site id, a domain, a mailbox); omit it
for a checklist that is a singleton per org.

## Persistence

One row per `(organization_id, checklist_key, target_key)` where `deleted_at is
null`. Org-scoped on purpose: a teammate who confirms a DNS record has confirmed it
for the whole org. `visibility` defaults to `internal` (org work, not a personal
artifact); the entity RLS variant is generated by `iam.apply_rls`.

**INSERT is owner-keyed, never active-org-keyed.** `_stamp_actor` fills
`created_by = auth.uid()` and `std_insert` checks that owner only. It must not
require `iam.has_org_access(organization_id)`: the run follows its target's org,
and a legitimate target owner may not be a member of that org. Reads and later
writes keep the standard owner/`iam.has_access` policies, so teammates can use an
`internal` run while unrelated users cannot see it.

`completed_at` records the **first moment** the checklist was fully true, so a
consumer can say "set up on 3 March" and an assist can stop nagging. It is a
milestone, never read back as the status — the verdict is always derived live.

## Migration map — the hand-rolled versions this replaces

| Flow | Where it is hand-rolled today | How it maps |
|---|---|---|
| **Search Console / site setup** | **MIGRATED 2026-08-14.** Was two dead-end gate blocks at the top of `features/marketing/search-console/intake/SiteIntakeWizard.tsx` | `marketing.site_setup` (`features/marketing/search-console/setup/siteSetupChecklist.tsx`): brand / address / connection = **verified**; history import = **auto** (Google deletes history past ~16 months, so waiting for a click loses days permanently); "is this the right property" = **confirmed** (only the owner knows) |
| **Sending identity (outreach)** | **EXTRACTED 2026-08-14.** A parallel session landed `/crm/sending-identities` mid-build; it had hand-rolled three hard-coded "Gate" cards (domain → authentication → warm-up) in gate order | `outreach.sending_identity` (`features/crm/sending-identities/sendingIdentityChecklist.tsx`): publish the TXT record = **confirmed** (we generate the exact values with Copy buttons; we cannot log into their registrar); domain ownership = **auto** (`autoRun: false` — a network lookup the user triggers); SPF / DKIM / DMARC = **verified, one step EACH** (a single "authentication" step that fails tells the user nothing they can act on, and the server's tri-state `null` maps to `unknown`, so a resolver timeout never reads as a broken domain); warm-up = **auto with `autoRun: false` on purpose** — it begins sending real mail from the customer's real domain, which is exactly what that escape hatch is for. Their `DnsRecordCard` and warm-up bar are HOSTED inside their steps via `extra`, not replaced; `IssueList` is filtered to runtime refusals only (pacing, quiet hours, org disabled) because it was otherwise restating every setup gate a second time. **Live-verified 2026-08-14** against a temporary seeded draft identity (`connection_id` is nullable, so a row renders without an OAuth mailbox); probe deleted afterwards. Still unverified: everything downstream of a real mailbox — the domain check actually resolving, warm-up actually starting |
| **CMS / content-plan site launch** | **MIGRATED 2026-08-15.** Was `features/marketing/content-plan/setup/readiness.ts` rendering its own `met/partial/unmet/unknown` rows in `SetupWorkOrderColumn` | `marketing.content_plan_setup` (`features/marketing/content-plan/setup/contentPlanSetupChecklist.tsx`), mounted on `?view=setup` scoped to the site. **THE SPLIT is the point:** `readiness.ts` survives untouched as the pure MEASUREMENT layer, its coverage half (`families` plannedCount vs targetCount, `corePages`, `nodesWithout*`) stays a METER beside the checklist — "17 of 30 service pages planned" is a number that climbs over weeks, and a tick box for it is a step that is never done and always nagging. Steps: brand = **verified** (fix → Marketing → Sites); a website to build into = **auto, `autoRun: false`** (creating a real website record unasked, for someone who meant to point at one they already have, is exactly what that escape hatch is for — `bridge.ts#createAndLinkCmsSite` is ONE implementation shared with the "Make it real" rung that also offers linking an existing site); look and feel = **auto, `autoRun: false`** (aidream's starter kit writes styles + header + footer in one guarded call, `force: false` so an existing design can never be overwritten by a checklist button); menu and pictures = **verified**. **What groups a step is the ACTION that finishes it, not the requirement it measures** — a `steps` factory could have emitted one row per foundation requirement, and deliberately does not: a step whose own button cannot finish it is a dead end. Each step names every piece it covers by state in its `detail`. **Live-verified 2026-08-15**, both paths: on datadestruction.com (already linked) the design step really did build the colours, header and footer — three pieces flipping to "ready" — the coming-soon fix opened, and the progress count excluded the optional step; on blancacleaningdfw.com (no CMS counterpart) every foundation step read `unknown`/blocked with a plain reason, and "Set it up for me" created and linked the website, unblocking its dependents on the re-check. Three findings from those renders, all fixed: the MENU cannot live in the design step (the starter kit seeds navigation from show-in-nav pages, so on a site with no pages it leaves the menu empty forever behind a button that would then refuse "the site is not empty" — a dead end wearing a fix's clothes); PICTURES had to become `optional` because the asset library has no UI a site owner can reach (Coming Soon `cms.site-images`); and **the measurement layer's `detail` strings reached the screen verbatim** — "theme_config is empty", "declared as =services.count", with a double full stop — which is the jargon rule broken by pass-through rather than by authorship |
| **Payment / creator payouts (Stripe Connect)** | **MIGRATED 2026-08-14.** Was a four-state block in `CreatorPayoutsPanel` whose failure case said "Finish your Stripe onboarding" whether you were missing a bank account, a passport photo, or had been declined outright | `billing.creator_payouts` (`features/education/creators/payoutsChecklist.tsx`): the connected account = **auto** (`ensureConnectAccount` is idempotent; `autoRun: false` because the panel renders for every creator who opens their dashboard and an account is a real KYC-able entity created at a third party in their name); **one verified step per entry in `requirements.currently_due`**, titled with what Stripe actually asked for; `charges_enabled` and `payouts_enabled` = **verified**, with Stripe's `disabled_reason` as the sentence when off. **Nothing is `confirmed`** — Stripe is the authority on every line, so nothing here is self-reported. Three things this needed: the server read now returns `requirements` + `disabled_reason` off the live account (`refreshConnectAccount` → `ConnectAccountStatus`, surfaced by `/api/stripe/connect/status`; the mirror row cannot hold them — they change with no webhook); `POST /api/stripe/connect/account` creates the account with **no** hosted link, because an auto step must not burn a single-use onboarding link per page visit; and Stripe's developer strings are translated by `lib/stripe/connect-requirements.ts`, whose fallback guarantees a code we have never seen still produces a usable sentence. Fixes are `fix.run`, not `fix.href` — an account link is single-use and expires in minutes, so it is minted at the click. **Requirement steps BLOCK the two verdict steps**, or a creator missing their ID sees three rows each offering the same "Open my Stripe details". `eventually_due` is returned by the server but deliberately not rendered as steps: it is not actionable, and Stripe moves an item into `currently_due` the moment it becomes so. **Verification limit: Connect is not enabled on the platform Stripe account** (test keys are configured; `accounts.create` answers 409 "sign up for Connect"), so the empty/not-connected path and the 409 path are live-verified and **the requirement steps have never been exercised against a real account** |
| **Org onboarding** | Scattered: `features/scope-system/components/ScopeOnboarding.tsx`, `utils/onboarding.ts`, empty states | Members invited / first scope created / industry chosen = **verified**; the personal-org and default-scope creation we already do at signup = **auto**; "who else should be in here" = **confirmed** |

## Known limits

- **Checks run every mount for every step, including blocked ones.** That is
  deliberate — we want the truth of the whole list, and blocking is a display
  decision, not a reason to be ignorant. A definition whose check is expensive
  should cache inside its own data layer (react-query), not here.
- **No server-side runner.** Nothing re-checks while the user is away, so a
  regression is discovered on their next visit rather than pushed to them. When a
  consumer needs proactive alerting, the right seam is an assist producer
  (`features/assists/`) reading the same definitions — not a second checker.
- **`listChecklists()` only sees definitions whose module has been imported.**
  It is honest for an admin map on a page that imports them, not a static census.

## What live rendering caught that review did not

Kept because every one of them looked fine in the diff, and four of the six
would have hit the user directly. If you extend this primitive, render it before
you believe it.

1. **Writes raised before the run row loaded were silently dropped** — the first
   round of checks reliably wins the race, so the last-known cache was never
   written and the row sat at version 1 with an empty map.
2. **Identical results were re-stamped on every visit** — a write per step per
   page view, and it destroyed the meaning of the timestamp.
3. **A hand-built copy of the DNS record disagreed with the canonical
   `DnsRecordCard`** — `host` and `name` swapped, i.e. a non-technical expert
   pastes the FQDN into the Host field and the check never passes. THE CANONICAL
   COMPONENT LAW is the fix: the shape has a component, so nothing else renders it.
4. **The same record rendered twice** (hand-built values + the card), with
   different labels. Two descriptions of one thing read as two things.
5. **An `auto` step printed its action twice** — once as its own run button and
   once as the check result's `fix`.
6. **A measurement layer's `detail` is not user copy.** Passing the source
   system's evidence string straight into `CheckResult.detail` put
   "theme_config is empty" and "declared as =services.count" on screen. A
   consumer writes every user-facing string itself; forwarding one is how
   jargon gets in without anybody authoring it.
7. **A step's own action could not finish it.** The content-plan `design` step
   bundled the menu with styles/header/footer because one starter-kit call
   writes all four — except it seeds the menu FROM the site's pages, which do
   not exist yet, so the step sat red offering a button that would refuse on
   the second press. **Group a step by the action that FINISHES it**, not by
   the API call that touches it.
8. **Blocked steps offered a fix button** under "Waiting on: X" — telling the
   user to do two contradictory things at once. Fixed in the primitive
   (`GuidedChecklist`) and locked by an engine test, so no consumer can hit it.
9. **An auto step claimed it was working while it was only CHECKING.** Both
   read as `busy` and the UI printed `runningLabel` for either, so the payouts
   checklist's very first paint said "Setting up your payouts account…" before
   anything had been set up — and the same bug had been live on the history
   import step ("Bringing in your history…") since day one. `ResolvedStep.running`
   now means *this step's `run` is in flight* and nothing else; locked by a test.
10. **A failed auto action left no trace on screen.** The hook re-checks the
   moment a run settles, which immediately overwrote the failure with the
   still-true "you don't have a payouts account yet" — so pressing the button
   with Stripe Connect disabled looked like pressing a dead button. A consumer
   whose `run` can fail for a reason its own check cannot see must say so
   itself (`CreatorPayoutsPanel` toasts and rethrows).

## Change log

- 2026-08-17 — `outreach.production_bring_up` split by AUDIENCE into itself
  (customer steps only) + `outreach.platform_bring_up` (operator steps, super-
  admin-only mount). New law learned: **a checklist has ONE audience** — steps
  that only a platform operator can act on (deployment env config, our OAuth
  app's review) never share a definition with steps a customer performs,
  because the customer reads the operator rows as their own homework. The
  split moved the reply-pipe confirmation to a new persistence key (re-tick
  once, accepted cost).

- 2026-08-15 — Fifth consumer: `outreach.production_bring_up` on
  `/crm/sending-identities` (org-level, singleton per org — no `targetKey`),
  the five outreach production gates as one guided flow beside the per-mailbox
  `outreach.sending_identity`. New patterns it proved: a step's fix may open a
  DIALOG through a promise that resolves on close, so the settle-time re-check
  reads the truth (the sending-rules acceptance flipped live in-browser); and a
  step whose fact nobody on the surface can act on (`gmail.readonly`, queued
  behind Google's review) is `optional` with the honest reason, not a required
  step that nags forever. Server-side facts arrive as booleans from one
  readiness endpoint; any fetch failure maps to `unknown`, never `fail`.

- 2026-08-15 — Fixed first-run persistence: owner-keyed live INSERT policy,
  create-vs-load error reporting, and create/re-read regression coverage.

- 2026-08-14 — Fourth consumer: `billing.creator_payouts` on the creator
  dashboard (see the migration map row). The primitive gained a **step factory**
  (`steps` may be a pure function of the context) so an open-ended third-party
  requirement list gets one row each rather than one "finish onboarding" row for
  everything, and `ResolvedStep.running` so "we are doing it" stops reading the
  same as "we are looking". Defects 8 and 9 above both came out of rendering it.

- 2026-08-15 — Third consumer: `marketing.content_plan_setup` on the content-plan
  Setup view, and with it the rule that a checklist and a coverage meter are
  different surfaces (see the migration map row). One new law learned from the
  live render: group a step by the action that FINISHES it.

- 2026-08-14 — Created. Primitive + `platform.guided_checklist_run` + the
  `marketing.site_setup` consumer on two surfaces. Live-verified on
  blancacleaningdfw.com (2/5 — failing step carries its reason and one-click fix,
  dependents correctly blocked) and titaniummarketing.com (5/5 after confirming;
  `completed_at` stamped; confirmation survives reload with an Undo). Two defects
  found by that verification and fixed: writes raised before the run row loaded
  were silently dropped, and identical results were re-stamped on every visit.
