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
   the defect.
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
| Tests | `__tests__/engine.test.ts` | 11 tests locking the laws above |

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

`completed_at` records the **first moment** the checklist was fully true, so a
consumer can say "set up on 3 March" and an assist can stop nagging. It is a
milestone, never read back as the status — the verdict is always derived live.

## Migration map — the hand-rolled versions this replaces

| Flow | Where it is hand-rolled today | How it maps |
|---|---|---|
| **Search Console / site setup** | **MIGRATED 2026-08-14.** Was two dead-end gate blocks at the top of `features/marketing/search-console/intake/SiteIntakeWizard.tsx` | `marketing.site_setup` (`features/marketing/search-console/setup/siteSetupChecklist.tsx`): brand / address / connection = **verified**; history import = **auto** (Google deletes history past ~16 months, so waiting for a click loses days permanently); "is this the right property" = **confirmed** (only the owner knows) |
| **Sending identity (outreach)** | **EXTRACTED 2026-08-14.** A parallel session landed `/crm/sending-identities` mid-build; it had hand-rolled three hard-coded "Gate" cards (domain → authentication → warm-up) in gate order | `outreach.sending_identity` (`features/crm/sending-identities/sendingIdentityChecklist.tsx`): publish the TXT record = **confirmed** (we generate the exact values with Copy buttons; we cannot log into their registrar); domain ownership = **auto** (`autoRun: false` — a network lookup the user triggers); SPF / DKIM / DMARC = **verified, one step EACH** (a single "authentication" step that fails tells the user nothing they can act on, and the server's tri-state `null` maps to `unknown`, so a resolver timeout never reads as a broken domain); warm-up = **auto with `autoRun: false` on purpose** — it begins sending real mail from the customer's real domain, which is exactly what that escape hatch is for. Their `DnsRecordCard` and warm-up bar are HOSTED inside their steps via `extra`, not replaced; `IssueList` is filtered to runtime refusals only (pacing, quiet hours, org disabled) because it was otherwise restating every setup gate a second time. **Live-verified 2026-08-14** against a temporary seeded draft identity (`connection_id` is nullable, so a row renders without an OAuth mailbox); probe deleted afterwards. Still unverified: everything downstream of a real mailbox — the domain check actually resolving, warm-up actually starting |
| **CMS / content-plan site launch** | `features/marketing/content-plan/setup/readiness.ts` — already has `met/partial/unmet/unknown` with reasons, and already refuses to call an unreadable CMS "unmet". **Its item model is the closest thing to this primitive that existed.** | Every `ChecklistItem` becomes a **verified** step: `required`/`actual`/`detail` collapse into `CheckResult.detail`, `state: "unknown"` is already exactly rule 3, and each item gains the `fix` it currently lacks (the brand gate's fix is "open Marketing → Sites"). What it gains: persistence, re-verification on return, and the foundation items becoming **auto** where we can generate the missing component ourselves. **Not migrated in this pass** — its coverage-counting half (families, `plannedCount` vs `targetCount`) is a genuine meter, not a checklist, and splitting the two is its own change |
| **Payment / creator payouts (Stripe Connect)** | `features/entitlements/stripe/connect.ts` + `features/education/creators/components/CreatorPayoutsPanel.tsx` | Stripe hands us `charges_enabled`, `payouts_enabled`, `details_submitted` and a `requirements.currently_due` list — that is a **verified** step per requirement, each with `fix.href` = the Stripe onboarding link we already mint. Creating the connected account is **auto** (`ensureConnectAccount` is already idempotent). Nothing here is `confirmed` — Stripe is the authority on all of it |
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
6. **Blocked steps offered a fix button** under "Waiting on: X" — telling the
   user to do two contradictory things at once. Fixed in the primitive
   (`GuidedChecklist`) and locked by an engine test, so no consumer can hit it.

## Change log

- 2026-08-14 — Created. Primitive + `platform.guided_checklist_run` + the
  `marketing.site_setup` consumer on two surfaces. Live-verified on
  blancacleaningdfw.com (2/5 — failing step carries its reason and one-click fix,
  dependents correctly blocked) and titaniummarketing.com (5/5 after confirming;
  `completed_at` stamped; confirmation survives reload with an Undo). Two defects
  found by that verification and fixed: writes raised before the run row loaded
  were silently dropped, and identical results were re-stamped on every visit.
