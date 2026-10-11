# Education Hub — FEATURE.md

**Status:** live, pre-launch · **Tier:** 1

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/education/STATE.md — read it before touching this feature in ANY repo. It holds the product rules, status and open work; the owner's words are `VISION.md` beside it (if code drifts from the vision, the vision wins; report the drift, never edit the vision). This file is only how the frontend is built. The route contract is [`app/(core)/education/ROUTING.md`](<../../app/(core)/education/ROUTING.md>).

## Shape

`/education` is the guest landing (a signed-in learner is redirected server-side to `/education/overview`, the home). Two layers:

- **Marketing and content (server-only).** Five axes (`subjects`, `levels`, `exam-prep`, `study-aids`, `features`) and the `/learn` engine. Zero client logic; page-body markup lives in exactly one place, `components/sections/SectionRenderer`; a page is data (`AxisEntry` / `EduSection` in `types.ts`), never bespoke JSX. `/learn` is DB-backed (`education.learn_doc`, [`publishing/FEATURE.md`](./publishing/FEATURE.md)); the axes are code registries in `data/` indexed by `data/registry.ts`.
- **Application tools.** `/education/<tool>`; 19 entries in `data/tools.ts` (`EDU_TOOLS`), the single source for the hub's tool grid and the home's navigation (`EDU_TOOL_NAV`). `status: "live"` means a working desktop path that writes to the database, not mobile parity or depth. A not-yet-built tool reserves its route with `EduComingSoon` / `EduToolComingSoon`; the real build replaces it at the same slug. Zero consumers is the normal state.

Feature modules (each with its own FEATURE.md where listed): `assessment`, `classes`, `compliance`, `convert`, `creators`, `engage` (games), `family`, `kits`, `library`, `media`, `memory`, `notes`, `onboard`, `publishing`, `spoken-practice`, `study-guides`, `trust`, `tutor`; plus `home/`, `study/` (below) and the flashcard tool in `features/flashcards/`. Docs for voice: [`docs/VOICE_INTERACTIONS.md`](./docs/VOICE_INTERACTIONS.md).

**Where AI steps are declared.** Every education AI step is a mandate: key constants in each feature's `mandates.ts`; declared server-side in `aidream/aidream/services/education/mandates.py` (module listed in `registry_sync.DECLARING_MODULES`). Never a raw agent id.

## `study/` (the spine's client)

- `service/studyService.ts` is the sole caller of `public.study_record_attempt`; modes record through `offline/recordAttemptOffline.ts` (outbox, replay, pending grades; `OfflineStudySyncMount` is in the layout).
- `planner/` (plan builder, goals, staleness, recovery, `usePlannerAgent`) and `analytics/` (`computeAnalytics`, narrative) feed the planner and `/education/progress`; `dashboard/` computes Study Today; `learning-gain/` serves `/education/progress/learning-gain`.
- Collection reads declare `mine` (`created_by = requireUserId()`, streaks by `user_id`) so admin-wide RLS never turns a learner list into an all-users list. The one exception is `getSession(sessionId)`: it narrows by record id only, so coaches and granted viewers whom RLS admits open the full session.
- Signed out, `/education/progress` is a sign-in gate (`progress/layout.tsx`); `requireUserId` throws `NotAuthenticatedError`, which `fail()` returns as a state, never a console error.

## Rules and traps

- **Why `(core)`, not `(public)`.** `(core)` does not auth-gate, so every `/education/*` page is publicly crawlable and inherits the app shell and the `AuthedWorkspaceCTA`. The layout reads `headers()` (dynamic rendering); high-traffic content opts into cookie-free `unstable_cache` reads with tags (`publishing/queries.ts`, busted by `updateTag`). `'use cache'` is a build error here. Never relocate to `(public)`.
- **The home is ONE ordered list of blocks** (`BLOCKS` in `home/EducationHome.tsx`; each declares `signal(snapshot)` and returns null to render nothing). No per-maturity layout, no `isNewUser`. Whatever the learner has is the hero; exactly one nudge, about their own material (`home/nudges.ts`); never a grid of unused features. One snapshot (`home/snapshot.ts`) feeds every block; one dead read costs its dependent block (compact notice with Retry), never the page and never a false zero.
- **Verify `item_mastery.item_type` before keying on it.** Live values: `fc_card`, `assessment_item`, `spoken_prompt`, `handwritten_work`. A second spelling of one value is a defect fixed at the source, not aliased at read time.
- **View/edit split:** `[id]` and use-modes gate on VIEW, `[id]/edit` on EDIT (`requireAccess` / `useAccess`, never a bespoke check).
- **Agent output renders through `MarkdownStream`** (the kind-aware engine), not `BasicMarkdownContent`, which is for plain strings only. A registered kind renders via its own component, never a hand-rolled viewer.
- **No paywall claims.** A tier badge, Pro chip or upgrade prompt appears only where a gate actually reads a tier. Enforcement lives in the database (`billing.capability`, via `features/entitlements`); read it there, never restate it. `accessTier` on registry entries is data for entitlements only; no renderer or payload surfaces it.
- **Icons must exist at lucide runtime**, not just in types: a missing one 500s every education route through `registry.ts`. Check with `node -e "console.log('X' in require('lucide-react'))"`.
- **`quick-` prefix** marks stock content in a non-permanent slot (`subjects/quick-math` beside dynamic `subjects/[slug]`).
- **Microphone permission refusal is expected input**: show the in-page repair path; never route `NotAllowedError` through `console.error`.
- **Scroll runway:** the layout owns `education-scroll-boundary scroll-page-end-space`; exactly one real scroll owner gets the space (a full-height tool marks its own scroller with `scroll-page-end-space`).
- **Realtime:** the game room (`engage/realtime/useGameChannel.ts`) is a broadcast + presence room on `@ai-matrx/realtime`; echo suppression stays on.
- **Taxonomy is evidence-backed** (subject-first, three-band levels, flat exam-prep axis); re-check the research and the owner before restructuring.
- **Flashcard card images:** [`flashcard-images/FEATURE.md`](../../../common-docs/systems/education/flashcard-images/FEATURE.md) is the contract; read it before adding image support.
