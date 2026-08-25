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

**Verdicts** per section: `pass` · `fixed` · `na` (+ why) · `deferred-visual`
(code is done and statically checked; the eyes-on step could not run — say
exactly what to look at) · `arman` (+ chip id) · `blocked` (+ what blocks).
A headless agent uses `deferred-visual` and keeps going; it never fakes an
eyes-on verdict and never skips the section silently. The ledger records
`verificationDepth: "static" | "live"` per run so "green" never overstates.

**Overlay surfaces** (a manifest with `overlayId`, not `urlPattern`) are
first-class: S8 and S14 take their overlay branch, everything else applies
unchanged. The route wording is the default, not the assumption.

`CHECKLIST_VERSION = 2` (bump when a section is added/removed; the ledger
stores which version a surface passed).

---

## S1 · Identity & registration — `surface-authoring`

- MUST: a manifest exists and is in `RAW_MANIFESTS` (`features/surfaces/manifests/registry.ts`); `surfaceName` is `<client>/<local>` and byte-equal to `ui_surface.name`.
- MUST: `label` is the canonical human name (THE NAMING LAW — unique per client; the context menu's surface submenu and the header Agents panel both render it, so a wrong label is user-visible).
- MUST: `readiness` is honest (`verified` only after S2–S6 pass); `readinessNote` present when not verified.
- MUST: route surfaces have `urlPattern` + a mapping in `features/surfaces/utils/route-to-surface.ts` (more-specific prefixes ABOVE their parent); overlay surfaces have `overlayId` from `features/window-panels/registry/overlay-ids.ts`.
- DECIDE — **documentary `urlPattern`**: a surface may carry a `urlPattern` that resolves to its PARENT's route (it lives inside that page, e.g. a pane or a mode of it). That is legal and the resolver correctly returns the parent; the pattern documents where the surface appears. Verify it matches the real segment names (`[id]` vs `[documentId]` — a wrong segment is still a defect), say "documentary — resolves to `<parent>`" in the evidence, and do NOT add a route mapping that would steal the parent's route.
- MUST: the DB mirror is synced (`ui.ui_surface` + value/role/write-target/client-tool rows). **Sync YOUR surface only** — a bare run emits ~6,700 lines covering every surface in the repo and would apply other agents' in-flight manifest edits:
  ```bash
  npx tsx scripts/emit-surface-sync-sql.ts --surface <client>/<local>
  ```
  Apply the emitted SQL via Supabase MCP, then confirm the row live. (The admin button on `/administration/ui/surfaces` is the canonical path when you have a browser; it syncs the fleet, so prefer the flag when agents run in parallel.)
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
- **No browser? `deferred-visual`, not skipped.** Ship the declaration + handler (a declared-but-unwired target fails loudly, so shipping half is worse than shipping none), verify the handler's logic by reading it, and hand over the exact run to perform: which target, what to type, what Apply should change on screen. Never record `pass` for a target no agent has actually applied.
- Evidence: target names, live-run proof (screenshot or Error Inspector clean line) — or the deferred run description.

## S4 · Family: inheritance & own identity — `surface-authoring` § THE FAMILY DOCTRINE

- MUST: run **`pnpm check:surface-impact <surface>`** first. It prints this surface's parent, every descendant, and every consumer (bindings, shortcuts, write twins, DOM attributes) per value, with a per-value verdict. Nothing else in the repo can see those consumers — TypeScript never sees a value NAME.
- MUST: `inheritsFrom` only when the parent's vocabulary is TRUE here (a sibling that can't emit the parent's values must NOT inherit).
- MUST: no `SHADOWED_VALUE` findings for this surface — a child never re-declares what the parent conveys. Same meaning → delete the child's copy; different meaning → give it its own name.
- **THE AVAILABILITY OVERRIDE (the one sanctioned re-declaration):** the parent always has a value, this child only sometimes does. Re-declare it with the SAME name and type and `alwaysAvailable: false`. That is honest, the screamer does not flag it, and deleting it would turn an under-promise into a promise the child cannot keep (the value-mapping guard then screams at runtime). Widening the other way — child says `true` where the parent says `false` — is forbidden unless the child truly emits it every time.
- MUST: the child still declares its OWN `label`, `readiness`, `intro`, curated `groups`, and its own scope builder, where inherited `alwaysAvailable` keys are REQUIRED params and `...base` is spread FIRST.
- **Carve-out — mount-less / server-emitted surfaces.** The required-param and `...base`-first rules assume a client `SurfaceRuntimeProvider` that can hand the child its parent's scope. When the scope is assembled server-side (or by a job) and there is no parent scope at runtime, forcing ~N required params would make callers fabricate values they do not have. Then: keep the builder's inherited keys OPTIONAL, take an optional `inheritedBase` and spread it FIRST in the body, and write the reason in a comment beside the builder. Honor the rule structurally, not ceremonially.
- DECIDE (yours): whether THIS surface's `inheritsFrom` is right — does the named parent's vocabulary actually hold here? Keep, or drop it with the reason. That is mechanics, not product semantics.
- **ARMAN (never yours): creating a new parent, re-homing a surface, or any change that edits a SIBLING's manifest.** Two siblings declaring the same concept is the missing-parent smell — but extracting a parent touches surfaces you were not scoped to and other agents may be inside them. Report it with the exact values and file a chip; do not perform it.
- MUST: before renaming/removing ANY value, re-run the screamer with `--strict`; zero new breakage, and every consumer it lists is migrated in the SAME change.
- Check: `pnpm check:surface-impact <surface>` · `pnpm check:surface-impact --strict` · registry throws at init on unknown parent / cycle / depth > 3.
- Evidence: parent (or "root, deliberately"), descendant count, screamer output before → after.

## S5 · Agent parity & agent-purpose boundary — `surface-authoring` + `features/agents/components/chat/FEATURE.md` §self-referential loop

- MUST: inventory every button, menu item, assist, or automatic action on this surface that launches a named agent or Mandate. Each recurring surface-specific agent appears in the header roster through a manifest `agentRole` and/or a canonical surface binding. A launch point that invokes an agent missing from "Agents for this page" is a fail.
- MUST: inspect the newest 5–6 runs for each recurring surface agent. Count read-only discovery calls and group them by repeated tool plus returned fact. If the page already holds those facts, declare and emit granular Surface Values, add matching optional agent variables, and map them on the canonical binding. Do not hide structured context in `user_input`; do not add one junk-drawer context variable when stable fields deserve names.
- MUST: binding mappings are exact and current: every destination is a declared agent variable or context-policy name; every `surface_value` target exists in this surface's resolved manifest and is emitted on the route/tab where the action runs. Bind through the UI/service (`upsertAgentSurfaceBinding` / `assoc_add`), never a hand-written edge insert. Run `pnpm check:surface-impact <surface>` before and after changing value vocabulary.
- MUST: embedded child components do not steal the host surface identity. Open every tab/mode containing its own `SurfaceRuntimeProvider`; the global header must still name the product surface whose agents the user expects, unless the child is deliberately a first-class nested surface. Host-mode components must publish the child state their bound agent needs.
- Verify: open "Agents for this page" on the exact action-bearing tab; the invoked agent appears once. Trigger one safe representative run and compare it with the baseline 5–6: already-mapped facts cause zero rediscovery-only calls. Record baseline to after counts and any remaining calls that are required for writes or fresh identifiers.

- MUST: if the surface's core purpose IS an agent/chat/run/build/battle (the agent is what the UI is _for_), every launch of that primary conversation passes `runtime: { surfaceName: null }` (explicit opt-out). `undefined` is NOT an opt-out — the thunk auto-adopts the deepest provider and the agent reads its own transcript as "page context". Regression test: `launch-conversation-surface-boundary.test.ts`.
- MUST: the `SurfaceRuntimeProvider` STAYS mounted on such pages — the context menu, header Agents panel, write targets and any _other_ agent opened in a window panel on that page legitimately act on the page. Only the page's own primary conversation opts out.
- MUST: launch paths that bypass `launchAgentExecution` (own context assembly, e.g. War Room) are inspected by hand: the agent must never receive its own transcript/definition/run evidence as surface context.
- DECIDE: is this an agent-purpose surface? Yes if removing the agent leaves no product. Chat, Agent Run, Agent Builder test pane, Quick Chat, Agent Battle, widget test harnesses = yes. Notes with an agent side-panel = no.
- Evidence: launch inventory; header roster; mappings; 5–6-run discovery baseline to representative after-run count; then the opt-out line(s) `file:line`, or "not an agent-purpose surface".

## S6 · Context menu — `context-menu-v3` (+ `features/context-menu-v3/FEATURE.md`)

- MUST: **ONE menu per pane, delegated per row — never a menu per row.** Wrap the pane once and pass `resolveContextOnOpen(target)` to work out which row/section was right-clicked (read `data-*` attributes off the element); nesting Radix triggers opens two menus and exists nowhere in this repo. Worked reference: `features/user-lists/components/ListDetailClient.tsx` + its `dom-anchors.ts` — right-clicking a row yields `Edit "China"` / `Add item to "Asia"`, empty space yields list-level rows only.
- MUST: the wrapper carries `sourceFeature` + `surfaceName` + `getApplicationScope`; no bespoke right-click menu survives (consolidation backlog in FEATURE.md). ⚠️ `className` on the wrapper styles the menu POPUP, not the trigger — never put layout classes there.
- MUST (overlay/window surfaces): the window mounts its OWN menu. Without one, a right-click inside the window is answered by the page underneath, and the user gets THAT page's surface and agents — silently wrong.
- MUST: `contentSource` for a real entity (→ Copy-as / Export / Convert), `entity` when attachable/shareable (→ Attach To / Share).
- MUST: surface-specific actions arrive via `extraSections` bound to REAL handlers, with a `label` + `icon` (they fold under that label in tiered/command); never toast stubs.
- MUST: the acceptance test — right-click with no selection → Export → Download as Markdown saves the whole content; select text → saves the selection. Copy always works. **Surfaces with no primary text** (a gallery, a chart, a media grid) legitimately have no rich-document content: keep the default `{type:"raw"}`, omit `entity` when nothing is attachable, and record `na — no rich-document content` for this line instead of inventing a document.
- MUST: the menu's last entry shows THIS surface's label (`<label>` ▸ location / Surface Context / Agents on this page / Bind…); a wrong or "This page" label means S1 is wrong.
- MUST: THE LOSSLESS LAW — nothing the core menu offers is hidden/renamed by the surface (`placementMode` only for genuinely meaningless placements, e.g. content blocks on read-only output).
- Evidence: regions wrapped, console clean on open, download proof.

## S7 · Text inputs — `components/official/ProTextarea.tsx` docstring + `surface-authoring` runtime rollout

- MUST: every textarea that holds user text is `ProTextarea` (Tier 2 default); bare shadcn `Textarea` only for raw admin/debug cases — and then say why in a comment. Voice (`enableVoice`) stays on unless the field is a code/JSON editor.
- MUST: `surfaceName` + `getApplicationScope` passed so the "…" agent menu lists the same agents as the context menu.
- DECIDE `enableTextStats` by THE LENGTH RULE: ON when the text's length will _matter_ — it becomes agent context in volume (long-form authoring, transcripts, pasted content, prompt/instruction bodies, anything a `typicalCharCount` ≥ ~1,000 value is built from). OFF for short fields, chat composers, titles, and any field inside chrome that already renders metrics (never stacked footers — notes incident). Log the decision per field.
- MUST: inputs ≥16px on mobile (`ios-mobile-first`), `ProInput` for single-line fields that feed agents.
- DECIDE — **the Pro primitive genuinely does not fit** (e.g. a 24px window-chrome search box vs `ProInput`'s fixed 16px text + mic/menu controls): keep the bare input, write the reason in a comment beside it, and cover what Pro would have given you another way (16px + 44pt on mobile; make the text a declared value and, if an agent should set it, a write target). Record `fixed (documented decision)`. This is a real verdict, not a violation — but a bare input with no comment is.
- Check: no script yet (gap — see "proposed ratchets" in the skill). `grep -rn "<textarea\|<Textarea" <feature dir>` and justify every hit.
- Evidence: field list with Pro/raw + stats decision.

## S8 · Header clearance & body — `core-route-headers` (+ `features/shell/components/header/variants/USAGE.md`)

- MUST (`(core)` routes): route chrome via `<PageHeader>` (center zone only); body `h-full overflow-hidden`; banned: `h-[calc(100dvh…)]`, `h-[calc(100vh…)]`, `h-page`, `h-screen`, `min-h-screen`.
- MUST: content that must not slide under the glass header (card grids with buttons, sticky toolbars, banners) gets `pt-[var(--shell-header-h)]`; freely scrolling content gets NO top padding; never a hardcoded `pt-8/10/12`. Verify visually: nothing at the top of the page sits under the header's shadow on desktop AND mobile.
- MUST: no faux in-body header (`border-b` + `bg-card` title bars), no double menus, no avatar collision.
- MUST: desktop actions collapse into bottom sheets/drawers on mobile — never `hidden lg:flex` with no counterpart.
- Check: `pnpm check:page-headers` · `pnpm check:scroll-chain:strict` · `rg "calc\(100dvh|calc\(100vh|h-screen|h-page" <route + feature dirs>` (the script only scans `app/(core)` — grep the feature half yourself).
- **Overlay / window surfaces — take this branch instead** (there is no route, no `PageHeader`, no glass header to clear, and `check:page-headers` only scans `app/(core)`): verify the window-panel chrome contract — the registry entry's `mobilePresentation` (`fullscreen` / `drawer`) and `mobileSidebarAs`, header/footer chrome inside the panel, tray/minimize/restore, and `urlSync.key` if it has one. Invoke the `window-panels` skill. Record `na — overlay surface` for the route lines, with this branch's result.
- Not for `/administration/*`, `(transitional)`, `(legacy)` (they sit below the header by design).
- Evidence: screenshots at 1280×800 and 375×812, top edge visible.

## S9 · Mobile — `ios-mobile-first`

- MUST: `dvh` never `vh`/`h-screen`; `pb-safe` on fixed bottoms; 16px inputs; 44pt tap targets (TapButtons — `efficient-tap-button-migration`); Drawer not Dialog; no tabs-as-mobile-nav; no nested scroll; popups have `max-height` + `overflow-y-auto`.
- MUST: long-press opens the context-menu bottom sheet on the surface's content; the sheet shows the same items as desktop incl. the surface entry.
- MUST: **functionality** is gated with `useIsMobile()`, never hidden by CSS alone — a `hidden lg:flex` action with no mobile counterpart is a feature that does not exist on a phone. Pure **presentation** (font size, padding, tap-target sizing, wrapping) is correctly done with CSS breakpoints (`max-sm:`) and needs no JS gate.
- MUST: actions revealed only on hover (`group-hover`) are UNREACHABLE on touch — they must be visible (or long-press reachable) at mobile widths.
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
- `na` is legitimate for a count with genuinely nowhere to go (a count of remote third-party items, a derived metric with no list behind it) — say which, in one line. A count over OUR records always opens.
- Check: `pnpm check:dead-ends` · `pnpm check:unwired` (scoreboards `/administration/reporting/dead-ends`, `/unwired`).
- Evidence: dead ends found → fixed (registry, not callsite).

## S13 · UI standards — CLAUDE.md "UI / UX standards" + shared application UI hierarchy + `ui-sharp`/`ui-dense` + `compact-nav-menus` + `no-emojis-in-ui` + `copy-everywhere` (P5)

- MUST: Lucide only, no emojis, no Sparkles-for-AI (→ `BrainCircuit`); semantic tokens; no wrapper-on-wrapper chrome; browser dialogs banned (`confirm()`/`toast` from `@/lib/toast`); `router.back()` for back; `useTransition` for nav with loading on the active element.
- MUST: read `.claude/ui-skills/shared/application-ui-copy-and-hierarchy.md`; app routes have one title authority, no duplicated body hero, no generic introductory prose, and meaningful work above the fold.
- MUST: sidebars/list panels follow `compact-nav-menus` sizes; lists use `EntityListPage` + `useListViewPrefs`; tables = `MatrxDataTable` with sort+filter on every column and the canonical Copy / Copy-for-AI.
- DECIDE: the surface's density posture (`ui-sharp` default; `ui-dense` for all-day power surfaces) — name the real product benchmarked.
- Check: `pnpm check:ui-primitives` · `pnpm check:copy-everywhere` · the emoji `rg` in `no-emojis-in-ui`.
- Evidence: violations fixed, posture named.

## S14 · Route metadata & favicon — `route-metadata-favicons`

- MUST: specific-word-first tab title, favicon registered in `constants/favicon-route-data.ts`, OG where public.
- `na — overlay surface` when there is no route: nothing to title, favicon, or OG.
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
