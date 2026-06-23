# Transcription Cleanup (page route)

**Status:** Active · merged onto the studio data model (2026-06-10)
**Route:** `/transcripts/cleanup[?session=<id>]` → [`app/(core)/transcripts/cleanup/page.tsx`](<../../app/(core)/transcripts/cleanup/page.tsx>)
**Entry component:** [`components/CleanupPad.tsx`](./components/CleanupPad.tsx)
**Surface:** `matrx-user/transcripts-cleanup` ([manifest](../surfaces/manifests/transcripts-cleanup.manifest.ts))

## What this is

The high-volume record → auto-clean → custom-refine tool. Three containers:
**Transcript** (raw), **Clean** (AI-cleaned), and **Custom** (output of ANY
agent the user picks). Born as a duplicate of the floating cleanup window
panel (`components/official-candidate/transcription-cleanup/` — still intact,
do not merge); now persisted on the STUDIO database so sessions interop with
`/transcripts/studio`.

## Data model — studio tables, source-scoped

Sessions are `studio_sessions` rows with `source='cleanup'`; each surface
lists only its own sessions by default ("show all" is a filter away, nothing
breaks cross-surface — see `features/transcript-studio/FEATURE.md`).

| Container / setting | Studio storage |
|---|---|
| Raw transcript | `studio_raw_segments` — one `chunk` row per mic completion; a manual blob edit collapses all rows into ONE `source='manual'` row (debounced) |
| Clean | `studio_cleaned_segments` — full-range pass per run via `applyCleanupRun` (supersedes prior), `studio_runs` audit row (column 2); user edits update in place |
| Custom slots (outputs) | `studio_documents` — one row per slot `docKind` (`cleanup_custom` for the first slot, `cleanup_custom_<id8>` after; + `studio_runs` column 4 audit) |
| Clean agent | `studio_session_settings.cleaning_shortcut_id` (stores an AGENT id) |
| Custom slots (config) | `studio_session_settings.custom_slots` (`CleanupCustomSlot[]`: `{id, agentId, label, source, autoRun, docKind}`); `module_shortcut_id` mirrors slot 1's agent for studio back-compat. Null = legacy single slot migrated on load |
| Context items | `studio_session_settings.context_items` (`SessionContextItem[]`) |

A session materializes LAZILY on first content (`ensureSession`) or via the
sidebar's New button; the first mic completion auto-titles it. Selection is
URL-driven (`?session=`) via `history.replaceState` (no RSC roundtrip —
switching must be instant on a high-volume tool).

## Any-agent resolution (the key mechanic)

Both dropdowns accept ANY agent. `hooks/useAiPostProcess.ts` resolves how the
input text + context reach it, in priority order:
1. **Surface binding** — `agx_agent_surface.value_mappings` for
   (agent, `matrx-user/transcripts-cleanup`), most specific scope wins,
   resolved via `resolveValueMappings` (auto-name-match included).
2. **Name heuristic** — first variable named like `transcribed_text`,
   `transcript`, `content`, `text`, `input`, ….
3. **Single variable** — an agent with exactly one variable gets the text.
4. **`user_input` fallback** — the text becomes the user message.
The active mapping is shown under each dropdown (`input → <target>`).

**Clean default via surface roles** — no hardcoded agent ids. The `clean`
role on `matrx-user/transcripts-cleanup` (manifest `agentRoles` →
`ui_surface_agent_role` + `ui_surface_agent_pref`) seeds the Clean dropdown
through `useSurfaceAgentRoles(CLEANUP_SURFACE_NAME)`, resolved
platform → org → user (provenance caption under the dropdown). "Set as my
default" / "Your default · Reset" beside the dropdown write/clear the
user-tier selection (`setForMe` / `clearForMe`). A session's persisted agent
always wins over the role default; with no agent at all, Clean refuses with
a toast.

**Context items** are first-class: each block in the sidebar is
`{id, key, label, value}` (key slugified from the title — name a block
`Client Brief` to fill an agent's `client_brief` slot). Items whose key
matches an agent slot fill it directly; if none match and the agent declares
slots, the combined text fills the first open slot (legacy system-cleaner
behavior); otherwise items ride as ad-hoc context entries.

## Files

- `agent-context/buildTranscriptsCleanupContextData.ts` — the shared surface contract for `matrx-user/transcripts-cleanup`: a PURE `buildTranscriptsCleanupContextData(args)` mapping live pad state → the manifest's `createTranscriptsCleanupScope` (value names can't drift), `withActivePane()` (overlay `content`/`active_pane`/`active_pane_text` per pane), `TRANSCRIPTS_CLEANUP_CONTEXT_MENU_PROPS` (the props every pane spreads onto `UnifiedAgentContextMenu`), and an optional `createTranscriptsCleanupExtraSections()`. `CleanupPad.buildScope()` reads its refs and calls the pure builder. Mirrors `features/notes/agent-context/`.
- `hooks/useCleanupSession.ts` — session lifecycle + ALL persistence (list/create/load/delete, debounced saves, run audit). The only file that talks to `studioService`. Accepts `{ sessionId?, urlSync? }` for embedding (pin a host-owned session; skip URL read/write entirely).
- `hooks/useAiPostProcess.ts` — any-agent launch + streaming state (one instance per output container).
- `components/CleanupPad.tsx` — page shell: 3 resizable panels (sidebar │ transcript/clean │ custom), `<PageHeader>` portal title, mobile stacked + drawer. Layout cookies `panels:cleanup-h3` / `panels:cleanup-v` (server-read for first-paint sizes). **Embeddable** via OPTIONAL props (`sessionId`, `urlSync`, `variant="embedded"`, `sections`, `showNewSession`) — all defaulting to today's page behavior; embedded renders a chrome-free flex stack (no shell header, no panel cookies). Consumed embedded by the War Room Audio tab.
- `components/CleanupSessionList.tsx` — recents rail (title + time-ago, hover delete with confirm).
- `components/CleanupContextPanel.tsx` — structured context items, notes-backed (explicit save only; `NotePickerPopover` lists **all** notes with folder grouping + search; full note fetched on select).

## What is NOT duplicated (shared platform primitives)

Voice-pad + agent-execution Redux, `MicrophoneIconButton`, `ContentActionBar`,
`AgentListDropdown`, `NotesAPI`, `stripThinkingStreaming`, `useIsMobile`,
`studioService` (consumed, never forked).

## Invariants

- What is sent to the AI MUST equal what the user sees in the transcript
  textarea (`baseTextRef` — no stale closures in async flows).
- **All three panes are always editable.** Transcript / Clean / Custom
  textareas never use `readOnly`; manual edits win over live mic preview while
  the transcript field is focused; Clean / Custom pin the visible value on focus
  so agent streaming cannot fight typing.
- Voice-pad state keyed under `overlayId="transcriptionCleanupPage"` —
  a `VoicePadVariant` for the SLICE only; it is NOT an overlay id
  (`VoicePadOverlayVariant` excludes it; overlay helpers must use that).
- Sessions created by this mount skip the DB load (`locallyCreatedRef`) so
  loads never clobber in-flight first writes.
- Persist clean/custom output exactly once per completed conversation
  (`persisted*CidRef`).
- **Embedded mode is isolated.** With `urlSync={false}` the pad reads/writes
  no URL (and `useCleanupSession` skips `useSearchParams()` → no Suspense
  boundary), writes no panel-layout cookies, and — by hiding the sidebar
  (`sections.sidebar:false`) — renders no `ActiveContextButton`, so it can
  never mutate global `appContextSlice`. The voice-pad slice key is namespaced
  per pinned session (`embedded:${sessionId}`) so two pads never collide.
- **Cleanup auto-runs without the sidebar.** The Clean agent resolves from the
  surface `clean` role default (`useSurfaceAgentRoles` → `cleanAgentId`), not
  the sidebar dropdown — so auto-clean on stop works even when the sidebar is
  hidden. `urlSync` MUST be stable for the hook's lifetime (it gates a hook).

## Surfaces + context menu

Every pane (Transcript / Clean / each Custom slot) is BOTH wrapped in
`UnifiedAgentContextMenu` AND rendered as a `ProTextarea` — all three carry
the shared `TRANSCRIPTS_CLEANUP_CONTEXT_MENU_PROPS` (`sourceFeature="transcription-cleanup"`,
`surfaceName="matrx-user/transcripts-cleanup"`, `placementMode` hides the
plain-text `content-block`). Right-click (or the ProTextarea "…" menu) runs
internal + user shortcuts AND the surface's bound agents (My / System / Shared /
org) over the selection; replace/insert-before/insert-after write back through
the pane's change handler (and therefore persist). The panes are always
editable (`isEditable`); there is no read-only/preview region on this surface
(the cleaned + custom outputs are themselves editable textareas), so no
`isEditable={false}` mount exists. Surface value-mappings (`agx_agent_surface`)
drive variable resolution end-to-end. Each pane now also carries an inline
ProTextarea voice mic in addition to the central record pill (dictation into
any pane); the record pill remains the primary recording pipeline.

**Live scope handoff:** every pane passes the SAME `getApplicationScope` to
both its `UnifiedAgentContextMenu` and its `ProTextarea` — a stable callback
that reads the pane textarea's selection AT CLICK TIME and folds it onto the
pane's surface scope via `buildApplicationScopeFromMenuContext`
(`features/context-menu-v2/utils/build-application-scope`). Scope is never
stored in render state (no stale snapshots, no per-keystroke work).

**Scope emitter invariant:** the shared pure builder
`buildTranscriptsCleanupContextData()` (in `agent-context/`) MUST emit every
value declared in the manifest (36 values: container texts, session identity,
recording/mic state, agent + slot wiring, context items, derived counts)
except the selection family (`selection` / `text_before` / `text_after`),
which the menu captures at trigger time. `CleanupPad.buildScope()` gathers the
live values from refs (mirrored every render via `scopeStateRef` — no stale
closures) and calls the builder; `menuContextData(pane, paneText)` =
`withActivePane(...)` overlays `content` / `active_pane` / `active_pane_text`
per pane. Add a manifest value → emit it in `buildTranscriptsCleanupContextData`
in the same change.

**Reference binding:** agent `Cleanup Surface Demo Reporter`
(`42971fe0-a05e-44ad-aa62-cfeab6bad160`, admin-owned) + its global
`agx_agent_surface` binding map deliberately non-matching variable names
(`working_text` ← `raw_transcript_text`, slots ← arrays) — the canonical
proof that explicit mappings (not name-matching) deliver values. Shortcut
`Surface Demo: Session Report` (Transcription / ai-action category).

## Custom slots

Up to `MAX_CUSTOM_SLOTS` (3) custom outputs, one visible at a time (tab
pills + add/remove in the Custom header). A fresh session opens with **two**
slots — slot 1 sourced from the RAW transcript, slot 2 from the CLEANED text —
the two distinct post-processing paths side by side (`initialSlots()`); the DB
backs each independently (own `studio_documents` row per `docKind` +
`custom_slots`). Each slot: its own any-agent
dropdown, Raw|Clean input source, Auto-run toggle, and its own
`studio_documents` row. The streaming runtimes are a FIXED hook pool
(`slotAi0..2`) — raise `MAX_CUSTOM_SLOTS` and add a hook instance together.
Auto-run: raw-source slots fire simultaneously with Clean (mic completion +
manual Clean Up); clean-source slots fire when the cleaned result lands.

## Change Log

- 2026-06-23 — Surface Pro rollout completed for `matrx-user/transcripts-cleanup`.
  Extracted `CleanupPad.buildScope`'s inline scope construction into the new
  shared, PURE `agent-context/buildTranscriptsCleanupContextData.ts`
  (`buildTranscriptsCleanupContextData` + `withActivePane` +
  `TRANSCRIPTS_CLEANUP_CONTEXT_MENU_PROPS` + optional
  `createTranscriptsCleanupExtraSections`), mirroring `features/notes/agent-context/`;
  `buildScope` now reads refs and delegates. All three panes (Transcript /
  Clean / Custom) swapped from raw `<textarea>` to `ProTextarea` with
  `surfaceName` + `getApplicationScope`, so the agent "…" menu (bound agents +
  voice + clean-up) is available inline, identical to the right-click menu.
  Each pane now passes a stable per-pane `getApplicationScope` (live selection
  read at click time via `buildApplicationScopeFromMenuContext`) to BOTH its
  menu and its ProTextarea. No manifest / SurfaceValue change (the 36 values
  were already declared + emitted); behavior preserved (controlled values,
  focus-pause-on-edit, persistence, recording pipeline all unchanged). Note:
  ProTextarea adds a per-pane inline voice mic alongside the central record
  pill (no toggle exists to suppress it; record pill stays the primary path).
- 2026-06-17 — Transcript / Clean / Custom panes are always freely editable:
  removed transcript `readOnly` during recording; live mic preview pauses while
  the transcript field is focused; Clean / Custom pin output on focus so
  streaming tokens cannot overwrite cursor position; locally-created sessions
  clear stale `loaded` snapshots (fixes stuck loading veils). Fixed trailing
  spaces (and all in-progress whitespace) being stripped on every keystroke —
  `composeTranscriptParts` no longer `.trim()`s segment bodies; idle transcript
  display uses `baseText` directly when not composing live/prefix/suffix parts.
- 2026-06-14 — `CleanupPad` made embeddable so the War Room Audio tab reuses the
  REAL pipeline instead of a fake recorder. New OPTIONAL props (`sessionId`,
  `urlSync`, `variant="embedded"`, `sections`, `showNewSession`) + a
  `useCleanupSession({ sessionId, urlSync })` overload, all defaulting to the
  existing page behavior (the `/transcripts/cleanup` page is unchanged). Embedded
  variant: chrome-free flex stack (record band → Transcript → Clean), no shell
  header, no panel cookies, voice-pad key namespaced per session. Load path is
  already source-agnostic (`EMBEDDED_SOURCES` includes `war_room`); auto-clean
  resolves its agent from the surface role default, so it runs with the sidebar
  hidden.
- 2026-06-14 — Custom pane now seeds empty slot agents from the surface
  `custom_slot` role (`useSurfaceAgentRoles` position 0 → slot 1, etc.);
  session-persisted agents still win; explicit slot picks are not overridden.

- 2026-06-13 — UX consistency + smoother stream affordances:
  fresh sessions now open with **two** custom slots (slot 1 = raw source,
  slot 2 = clean source) via `initialSlots()` — the DB already backed
  per-slot docKinds, so no schema change. Section headers unified under one
  `SectionHeading` primitive (tinted icon chip + tight `text-[11px]`
  uppercase label) and a shared `PANE_HEADER` bar (fixed `h-9`, uniform
  padding) across Transcript / Clean / Custom + the sidebar (`SidebarSectionLabel`
  now wraps `SectionHeading`); status pills standardized via `StatusPill`.
  `StreamPulseBorder` rewritten to opacity-only glow (no `transform`) on new
  `stream-breathe` / `stream-done` keyframes (`globals.css`) — eliminates the
  jerky scale-pulse; honors `prefers-reduced-motion`. (Note: the lingering
  tab mic indicator after stopping is expected — `micStream.ts` keeps the OS
  grant warm for a 3-min keepalive so mobile doesn't re-prompt every record.)
- 2026-06-13 — Custom Dictionary wired in: `DictionaryContextCard` (surface `matrx-user/transcripts-cleanup`) added to the sidebar Context area, showing the merged dictionary with source-level badges + inline selection. LLM cleanup context is auto-injected server-side (the surface is flagged `supports_dictionary`); no `useAiPostProcess` change. See `features/dictionary/FEATURE.md`.
- 2026-06-12 — Clean default absorbed into the surfaces role system:
  `CleanupPad` seeds the Clean agent from the `clean` role
  (`useSurfaceAgentRoles(CLEANUP_SURFACE_NAME)`) instead of hardcoded ids;
  `ai-agents.ts` deleted; provenance caption (`default · platform` /
  `default · via org`) + "Set as my default"/Reset affordance added beside
  the dropdown; empty selection now guards Clean with a toast. The
  `userPreferences.transcription.customCleanerAgents` preference (and its
  settings tab) was removed — rosters live in `ui_surface_agent_pref`
  (DB backfill was a no-op: zero rows carried the key). `CleanupPad` now
  consumes `useCleanupSession().loadState` (previously unused): each data pane
  (Transcript / Clean / Custom) renders its own `PaneLoadingVeil` (spinner +
  skeleton shimmer, `absolute inset-0` over the body only) while the active
  session is being fetched — headers/toolbars stay mounted so the page never
  loses structure. A local `appliedSessionId` (set by the load-reset effect once
  the snapshot lands) keeps the veil up through the one-frame gap between
  `loadState → "ready"` and the panes applying the new content, eliminating the
  stale-content flash that made switching feel like it "didn't work". Veil
  formula: `loadState === "loading" || (loaded && loaded.sessionId !==
  appliedSessionId)`; locally-created sessions never populate `loaded`, so they
  never veil. Also moved the Custom pane's `ContentActionBar` (copy/save
  actions) out of the pane header into the Auto-run toggle row, so it reads as
  associated with that slot's output. Added a live processing/done border on the
  Clean and Custom panes (`useStreamPulse` + `StreamPulseBorder`): a breathing
  primary inset ring (`animate-slowPulse`) while a run streams, then a one-shot
  green flash (`animate-done-flash`, new keyframe in `globals.css`) on
  busy → complete, after which all processing affordances are removed.
  Layout-safe (pointer-events-none inset overlay; no size impact).
- 2026-06-10 — Surface registration expanded to the "expose everything"
  standard: manifest 8 → 36 values (active pane, session identity, all
  container texts + `all_custom_outputs`, word/char counts, mic/recording
  state, queued inserts, clean/slot agent wiring + run phases,
  `custom_slots_summary`, `context_items`); `buildScope()` now emits all of
  them via `scopeStateRef`; `menuContextData` gained pane identity. DB rows
  synced (zero drift, verified by live diff). Added demo agent
  `Cleanup Surface Demo Reporter` + global binding + `Surface Demo: Session
  Report` shortcut as the reference mapping example. Live-verified: clean
  pass applies context items (Matrix→Matrx test), session auto-label,
  slot auto-run after Clean.
- 2026-06-10 — Context block note picker: replaced folder-filtered `<select>` (Transcription Contexts only) with shared `NotePickerPopover` — lazy list fetch (names/metadata only on open), collapsible folder tree + search, full note via `NotesAPI.getById` on select.
- 2026-06-10 — Auto-label on first Clean pass: when the transcript is first sent
  for cleaning and the session title is still the default (`New Cleanup` /
  empty / untitled), one parallel `POST /api/content-label` call labels the
  session (same API + guard rails as Scribe/studio — one-shot per session,
  manual rename wins, local heuristic fallback). Removed the old
  first-chunk `deriveTitle` heuristic on mic save. Record pill: the full pill
  (including “Tap to record”) now starts recording, not just the mic icon.
  Secondary **Save only** stop (smaller, beside the pill while recording):
  stops + transcribes + persists raw transcript without Clean, autorun slots,
  or auto-label — always visible, disabled until recording starts (no layout
  shift). Prominent **New session** pill at the top of the listen/record band
  (creates a fresh session; does not delete existing sessions). Side columns
  use matched top bands (`Sessions` / `Custom` with icon chips) aligned to the
  center record band; sidebar subsections (`Cleaning Agent`, `Context`) share
  the same labeled header pattern. **Transcript insert queue:** while recording
  or transcribing, the raw textarea is read-only; **At start** / **At end**
  queue text that previews immediately and merges in `commitTranscript` before
  Clean / persist (never mid-chunk). (tabs, per-slot agent /
  source / autorun / output doc; `custom_slots` jsonb migration
  `studio_session_settings_custom_slots.sql`, applied live; legacy
  `module_shortcut_id` migrated to slot 1 on load) + `UnifiedAgentContextMenu`
  wrapped around all three panes with the registered surface. Type-clean;
  SSR-verified; live click-test on the user's browser (local preview
  hydration unreliable).
- 2026-06-10 (pm) — Refinement pass: page title removed (desktop portals
  nothing; the record pill rises into a tall centered band spanning the
  shell-header zone — mobile keeps the drawer toggle in the header). Sessions
  rail gained a **Mine | All** scope toggle (`useCleanupSession.scope`;
  "All" = every session RLS permits — studio + shared/org/public — with an
  origin badge per row; bogus persisted agent ids from studio sessions fall
  back to the default, loudly). Custom container gained **Auto-run**
  (localStorage pref): source=raw → fires alongside Clean (mic + manual);
  source=clean → fires when the cleaned result lands. Liveliness: icon chips
  on pane headers (AudioLines/Stars/Wand2), tinted header strips, Ready/
  Thinking pills, primary ring + pulse on the record pill, accent bar on the
  active session row. Verified rendered + hydrated + scope toggle live.
- 2026-06-10 — Merged onto the studio DB (sessions list + New, lazy create,
  full persistence of all 3 containers + agents + context). Radios → any-agent
  dropdowns; new full-height right-hand Custom container (own agent dropdown,
  Raw/Clean input source, Run). Context blocks became structured persisted
  items. Registered the `matrx-user/transcripts-cleanup` surface (manifest +
  route map + DB rows). Studio's default session list now excludes cleanup
  sessions. Verified: types clean, SSR renders all sections; full e2e (live
  agent run + reload round-trip) pending joint test — dev-env hydration was
  broken machine-wide during the build session.
- 2026-06-08 — Moved to `/transcripts/cleanup`; shell-header portal title;
  resizable dividers; shadcn RadioGroup; solid borders; central mic.
- 2026-06-08 — Created as a faithful page-route duplicate of the cleanup
  window panel.
