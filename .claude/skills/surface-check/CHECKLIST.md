# THE UI SURFACE CHECKLIST — one list, every law, per surface

This is the centralized checklist the `surface-check` skill drives. A surface
**passes** only when every section below is ✅ (or explicitly N/A with a one-line
reason). Each section names the **owning skill / doc** (invoke it — this file
never restates a rule body), the **check command** when one exists, and the
**evidence** the agent records. Sections are ordered so that earlier fixes
don't get undone by later ones (identity → data → agents → menu → inputs →
chrome → mobile/theme → states → doors → standards → metadata → data flow →
access → AI laws → docs/log).

Legend: **MUST** = the surface fails without it. **DECIDE** = the agent makes
the call by the stated rule and logs it; never asks. **ARMAN** = the only
class that goes to him (product semantics) — logged as a chip/review row, the
rest of the check continues.

`CHECKLIST_VERSION = 1` (bump when a section is added/removed; the ledger
stores which version a surface passed).

---

## S1 · Identity & registration — `surface-authoring`

- MUST: a manifest exists and is in `RAW_MANIFESTS` (`features/surfaces/manifests/registry.ts`); `surfaceName` is `<client>/<local>` and byte-equal to `ui_surface.name`.
- MUST: `label` is the canonical human name (THE NAMING LAW — unique per client; the context menu's surface submenu and the header Agents panel both render it, so a wrong label is user-visible).
- MUST: `readiness` is honest (`verified` only after S2–S6 pass); `readinessNote` present when not verified.
- MUST: route surfaces have `urlPattern` + a mapping in `features/surfaces/utils/route-to-surface.ts` (more-specific prefixes ABOVE their parent); overlay surfaces have `overlayId` from `features/window-panels/registry/overlay-ids.ts`.
- MUST: the DB mirror is synced (`ui.ui_surface` + value/role/write-target/client-tool rows) — run the sync (admin button on `/administration/ui/surfaces` or `pnpm tsx scripts/emit-surface-sync-sql.ts` → Supabase MCC) and confirm the row live.
- MUST: `intro` describes the surface and the user, never the model's role (hardcoded-prompt law).
- Check: `pnpm check:surface-drift` · `pnpm check:surface-routes` · `pnpm check:surface-overlays`.
- Evidence: manifest path, `ui_surface.name`, readiness.

## S2 · Surface values — `surface-authoring` (COMPLETENESS LAW) + `context-menu-v3` (value guard)

- MUST: every piece of page data an agent could reasonably want is a declared `SurfaceValue` (name, label, description, valueType, `alwaysAvailable`, `typicalCharCount`, group). "Reasonable" = anything a human could point at on the page and say "use this".
- MUST: `alwaysAvailable: true` is TRUE — the scope builder emits it on every open. The dev guard screams `VALUE MAPPING GAP on …` otherwise; a scream = fail.
- MUST: the scope builder is the typed `create<LocalSlug>Scope` (a UI cannot lie) and is read at trigger time (`getApplicationScope` / `SurfaceRuntimeProvider.getScope`), never stale React state.
- MUST: groups are curated (`general` / `baseline` / `inherited:*` are reserved); labels human.
- DECIDE: a value that exists but is rarely useful → declare it `alwaysAvailable: false`; never drop it.
- Verify: right-click → `<surface label>` ▸ **Surface Context Admin** (Context Values inspector) — no red "Always" rows; open the menu once with the console visible — zero screams.
- Evidence: value count, any reds fixed.

## S3 · Write targets (write-backs) — `surface-write-targets`

- MUST: every field an agent could sensibly edit on this surface is a declared `writeTarget` with a handler registered (`getWriteHandlers` / `useSurfaceWriteHandlers`); declared-but-unwired fails LOUDLY at apply time — that is a fail here too.
- MUST: `mode` is `draft` wherever the user saves (preferred), `applyPolicy` `ask` for agent-drivable targets; each target's `description` is the model-facing contract.
- MUST: the live verification protocol in the skill (ask dialog → Apply lands → "Keep as is" declines → undeclared refused → invalid value throws verbatim → Error Inspector clean).
- Evidence: target names, live-run proof (screenshot or Error Inspector clean line).

## S4 · Family: inheritance & own identity — `surface-authoring` § THE FAMILY DOCTRINE

- MUST: run **`pnpm check:surface-impact <surface>`** first. It prints this surface's parent, every descendant, and every consumer (bindings, shortcuts, write twins, DOM attributes) per value, with a per-value verdict. Nothing else in the repo can see those consumers — TypeScript never sees a value NAME.
- MUST: `inheritsFrom` only when the parent's vocabulary is TRUE here (a sibling that can't emit the parent's values must NOT inherit).
- MUST: no `SHADOWED_VALUE` findings for this surface — a child never re-declares what the parent conveys. Same meaning → delete the child's copy; different meaning → give it its own name.
- MUST: the child still declares its OWN `label`, `readiness`, `intro`, curated `groups`, and its own scope builder, where inherited `alwaysAvailable` keys are REQUIRED params and `...base` is spread FIRST.
- DECIDE: two siblings declaring the same concept = the missing-parent smell → push it up (introduce the parent if needed) and delete both copies. If a family would be > 3 deep or you only want to avoid retyping, do NOT inherit.
- MUST: before renaming/removing ANY value, re-run the screamer with `--strict`; zero new breakage, and every consumer it lists is migrated in the SAME change.
- Check: `pnpm check:surface-impact <surface>` · `pnpm check:surface-impact --strict` · registry throws at init on unknown parent / cycle / depth > 3.
- Evidence: parent (or "root, deliberately"), descendant count, screamer output before → after.

## S5 · Agent-purpose boundary (the self-context loop) — `features/agents/components/chat/FEATURE.md` §self-referential loop

- MUST: if the surface's core purpose IS an agent/chat/run/build/battle (the agent is what the UI is *for*), every launch of that primary conversation passes `runtime: { surfaceName: null }` (explicit opt-out). `undefined` is NOT an opt-out — the thunk auto-adopts the deepest provider and the agent reads its own transcript as "page context". Regression test: `launch-conversation-surface-boundary.test.ts`.
- MUST: the `SurfaceRuntimeProvider` STAYS mounted on such pages — the context menu, header Agents panel, write targets and any *other* agent opened in a window panel on that page legitimately act on the page. Only the page's own primary conversation opts out.
- MUST: launch paths that bypass `launchAgentExecution` (own context assembly, e.g. War Room) are inspected by hand: the agent must never receive its own transcript/definition/run evidence as surface context.
- DECIDE: is this an agent-purpose surface? Yes if removing the agent leaves no product. Chat, Agent Run, Agent Builder test pane, Quick Chat, Agent Battle, widget test harnesses = yes. Notes with an agent side-panel = no.
- Evidence: the opt-out line(s) `file:line`, or "not an agent-purpose surface".

## S6 · Context menu — `context-menu-v3` (+ `features/context-menu-v3/FEATURE.md`)

- MUST: every region a user reads or edits is wrapped in `EditableContextMenu` / `NonEditableContextMenu` with `sourceFeature` + `surfaceName` + `getApplicationScope`; no bespoke right-click menu survives (consolidation backlog in FEATURE.md).
- MUST: `contentSource` for a real entity (→ Copy-as / Export / Convert), `entity` when attachable/shareable (→ Attach To / Share).
- MUST: surface-specific actions arrive via `extraSections` bound to REAL handlers, with a `label` + `icon` (they fold under that label in tiered/command); never toast stubs.
- MUST: the acceptance test — right-click with no selection → Export → Download as Markdown saves the whole content; select text → saves the selection. Copy always works.
- MUST: the menu's last entry shows THIS surface's label (`<label>` ▸ location / Surface Context / Agents on this page / Bind…); a wrong or "This page" label means S1 is wrong.
- MUST: THE LOSSLESS LAW — nothing the core menu offers is hidden/renamed by the surface (`placementMode` only for genuinely meaningless placements, e.g. content blocks on read-only output).
- Evidence: regions wrapped, console clean on open, download proof.

## S7 · Text inputs — `components/official/ProTextarea.tsx` docstring + `surface-pro-rollout` step 5

- MUST: every textarea that holds user text is `ProTextarea` (Tier 2 default); bare shadcn `Textarea` only for raw admin/debug cases — and then say why in a comment. Voice (`enableVoice`) stays on unless the field is a code/JSON editor.
- MUST: `surfaceName` + `getApplicationScope` passed so the "…" agent menu lists the same agents as the context menu.
- DECIDE `enableTextStats` by THE LENGTH RULE: ON when the text's length will *matter* — it becomes agent context in volume (long-form authoring, transcripts, pasted content, prompt/instruction bodies, anything a `typicalCharCount` ≥ ~1,000 value is built from). OFF for short fields, chat composers, titles, and any field inside chrome that already renders metrics (never stacked footers — notes incident). Log the decision per field.
- MUST: inputs ≥16px on mobile (`ios-mobile-first`), `ProInput` for single-line fields that feed agents.
- Check: no script yet (gap — see "proposed ratchets" in the skill). `rg -n "<textarea|<Textarea" <feature dir>` and justify every hit.
- Evidence: field list with Pro/raw + stats decision.

## S8 · Header clearance & body — `core-route-headers` (+ `features/shell/components/header/variants/USAGE.md`)

- MUST (`(core)` routes): route chrome via `<PageHeader>` (center zone only); body `h-full overflow-hidden`; banned: `h-[calc(100dvh…)]`, `h-[calc(100vh…)]`, `h-page`, `h-screen`, `min-h-screen`.
- MUST: content that must not slide under the glass header (card grids with buttons, sticky toolbars, banners) gets `pt-[var(--shell-header-h)]`; freely scrolling content gets NO top padding; never a hardcoded `pt-8/10/12`. Verify visually: nothing at the top of the page sits under the header's shadow on desktop AND mobile.
- MUST: no faux in-body header (`border-b` + `bg-card` title bars), no double menus, no avatar collision.
- MUST: desktop actions collapse into bottom sheets/drawers on mobile — never `hidden lg:flex` with no counterpart.
- Check: `pnpm check:page-headers` · `pnpm check:scroll-chain:strict` · `rg "calc\(100dvh|calc\(100vh|h-screen|h-page" <route + feature dirs>` (the script only scans `app/(core)` — grep the feature half yourself).
- Not for `/administration/*`, `(transitional)`, `(legacy)` (they sit below the header by design).
- Evidence: screenshots at 1280×800 and 375×812, top edge visible.

## S9 · Mobile — `ios-mobile-first`

- MUST: `dvh` never `vh`/`h-screen`; `pb-safe` on fixed bottoms; 16px inputs; 44pt tap targets (TapButtons — `efficient-tap-button-migration`); Drawer not Dialog; no tabs-as-mobile-nav; no nested scroll; popups have `max-height` + `overflow-y-auto`.
- MUST: long-press opens the context-menu bottom sheet on the surface's content; the sheet shows the same items as desktop incl. the surface entry.
- MUST: `useIsMobile()` gates, not CSS-only hiding of functionality.
- Check: the skill's Component Audit Checklist; verify at 375×812 (Android emulation — iOS-only behaviors need a device).
- Evidence: mobile screenshots, long-press proof.

## S10 · Theme integrity — `light-dark-integrity` (P4)

- MUST: semantic tokens only; no `bg-white`/`text-black`/raw palette; both themes screenshotted (`document.documentElement.classList.toggle('dark')`).
- Check: `node .claude/skills/light-dark-integrity/scripts/detect-light-dark.mjs <path> --strict`.
- Evidence: dark + light screenshots.

## S11 · Loading / empty / error states — `real-loading-states` (P8) + CLAUDE.md "Errors"

- MUST: every loading state says WHAT is loading (or is a surface-shaped skeleton); no bare "Loading…"; empty states are real (`EntityListPage` empties); every async op has structured error handling that surfaces — recovery layers scream.
- MUST: a surface that streams AI never shows a spinner while AI works (S17).
- Evidence: the three states captured.

## S12 · No dead ends — `no-dead-ends`

- MUST: every identity the UI names opens (open / new tab / peek / window) via `EntityRef` / the opener registry; every count/id is a door; every detected problem ships its one-click fix.
- Check: `pnpm check:dead-ends` · `pnpm check:unwired` (scoreboards `/administration/reporting/dead-ends`, `/unwired`).
- Evidence: dead ends found → fixed (registry, not callsite).

## S13 · UI standards — CLAUDE.md "UI / UX standards" + `ui-sharp`/`ui-dense` + `compact-nav-menus` + `no-emojis-in-ui` + `copy-everywhere` (P5)

- MUST: Lucide only, no emojis, no Sparkles-for-AI (→ `BrainCircuit`); semantic tokens; no wrapper-on-wrapper chrome; browser dialogs banned (`confirm()`/`toast` from `@/lib/toast`); `router.back()` for back; `useTransition` for nav with loading on the active element.
- MUST: sidebars/list panels follow `compact-nav-menus` sizes; lists use `EntityListPage` + `useListViewPrefs`; tables = `MatrxDataTable` with sort+filter on every column and the canonical Copy / Copy-for-AI.
- DECIDE: the surface's density posture (`ui-sharp` default; `ui-dense` for all-day power surfaces) — name the real product benchmarked.
- Check: `pnpm check:ui-primitives` · `pnpm check:copy-everywhere` · the emoji `rg` in `no-emojis-in-ui`.
- Evidence: violations fixed, posture named.

## S14 · Route metadata & favicon — `route-metadata-favicons`

- MUST: specific-word-first tab title, favicon registered in `constants/favicon-route-data.ts`, OG where public.
- Check: `pnpm check:route-metadata:strict`.

## S15 · Data flow & correctness — CLAUDE.md "Data flow" + `supabase-realtime` + `type-safety`

- MUST: reads/writes go React → Supabase directly (no Next API middle tier, no Python as DB gateway); one canonical path per operation; complete lists via `readAllRows`; guarded read-modify-write via `guardedUpdate`; any `.channel(` follows `supabase-realtime`; no `any`/casts (`type-safety`); paginated ORDER BY ends in a unique column.
- Check: `pnpm check:unbounded-reads` · `pnpm check:backend-boundaries` · `pnpm type-check` · `pnpm check:hatches <path>` (must not rise).

## S16 · Access & sharing — `features/access-gate/FEATURE.md` + `protected-resources` + SHARE_LEVELS

- MUST: `requireAccess(..., { forbid: true })` / `<AccessGate>`; never hand-written not-found/no-permission copy; never `notFound()` on an empty single-record read; sharing via the canonical share modal (`entity` on the menu); visibility vocabulary canonical.
- Check: `pnpm check:access-guards` · `pnpm check:access-errors` · `pnpm check:visibility-vocab`.

## S17 · AI laws — `features/content-ir/FEATURE.md` + `features/window-panels/FEATURE.md` + `features/assists/FEATURE.md` + mandates

- MUST: never hand-render a stream (`MarkdownStream` → kind registry; lint `matrx/no-bespoke-stream-renderer`); one component per `__kind`; AI work streams into `LiveRunWindow` — no top-of-page live block, no spinner; runs survive refresh.
- MUST: no system prompt / persona / raw agent UUID in code (`useMandate` / `launchMandate`; `pnpm check:hardcoded-prompts`, `pnpm check:hardcoded-agents`); nothing structured via `user_input`.
- MUST: friction points get an `<AssistStrip surfaceName>` before any manual affordance is invented.
- Evidence: commands green for the surface's files.

## S18 · Docs, review, ledger — `context-docs` + `agent-review-queue` + this skill

- MUST: the feature's `FEATURE.md` + Change Log updated in the same commit; admin map (`/[feature]/admin`) lists every new route/panel; anything Arman must see registered via `agent-review-queue`; tangential finds → `spawn_task` chips; unrelated defects → `FOUND_DEFECTS.md`; patrol sightings logged.
- MUST: the check is LOGGED on the surface row (`ui.ui_surface.last_checked_at / last_checked_by / last_check`) with per-section results, `CHECKLIST_VERSION`, commit sha — see the skill's "Log it" step.
- MUST: commit as you go, push, tree clean; `pnpm type-check` clean for your files.

---

### Cross-cutting DON'Ts (the recurring-mistake list, one line each)

No second implementation of anything we own · no barrel files · no `eslint-disable` · no new top-level feature · no legacy/fallback code left behind · no `'use cache'` · no manual `useMemo`/`useCallback` · no env-var toggles · no unapproved schedules · no hand DDL (`platform.create_entity_table` + `iam.apply_rls`) · no project-ref DB addressing · no questions to Arman that a rule already answers.
