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

**Context items** are first-class: each block in the sidebar is
`{id, key, label, value}` (key slugified from the title — name a block
`Client Brief` to fill an agent's `client_brief` slot). Items whose key
matches an agent slot fill it directly; if none match and the agent declares
slots, the combined text fills the first open slot (legacy system-cleaner
behavior); otherwise items ride as ad-hoc context entries.

## Files

- `hooks/useCleanupSession.ts` — session lifecycle + ALL persistence (list/create/load/delete, debounced saves, run audit). The only file that talks to `studioService`.
- `hooks/useAiPostProcess.ts` — any-agent launch + streaming state (one instance per output container).
- `components/CleanupPad.tsx` — page shell: 3 resizable panels (sidebar │ transcript/clean │ custom), `<PageHeader>` portal title, mobile stacked + drawer. Layout cookies `panels:cleanup-h3` / `panels:cleanup-v` (server-read for first-paint sizes).
- `components/CleanupSessionList.tsx` — recents rail (title + time-ago, hover delete with confirm).
- `components/CleanupContextPanel.tsx` — structured context items, notes-backed (explicit save only, "Transcription Contexts" folder).
- `ai-agents.ts` — just the default Clean agent id + system-agent display names.

## What is NOT duplicated (shared platform primitives)

Voice-pad + agent-execution Redux, `MicrophoneIconButton`, `ContentActionBar`,
`AgentListDropdown`, `NotesAPI`, `stripThinkingStreaming`, `useIsMobile`,
`studioService` (consumed, never forked).

## Invariants

- What is sent to the AI MUST equal what the user sees in the transcript
  textarea (`baseTextRef` — no stale closures in async flows).
- Voice-pad state keyed under `overlayId="transcriptionCleanupPage"` —
  a `VoicePadVariant` for the SLICE only; it is NOT an overlay id
  (`VoicePadOverlayVariant` excludes it; overlay helpers must use that).
- Sessions created by this mount skip the DB load (`locallyCreatedRef`) so
  loads never clobber in-flight first writes.
- Persist clean/custom output exactly once per completed conversation
  (`persisted*CidRef`).

## Surfaces + context menu

Every pane (Transcript / Clean / each Custom slot) is wrapped in
`UnifiedAgentContextMenu` with `sourceFeature="transcription-cleanup"` and
`surfaceName="matrx-user/transcripts-cleanup"` — right-click or select text
and internal + user shortcuts work over the selection (textarea selection is
captured by the menu), with replace/insert-before/insert-after writing back
through the pane's change handler (and therefore persisting). Surface
value-mappings (`agx_agent_surface`) drive variable resolution end-to-end.
`content-block` placement is hidden (plain-text panes).

## Custom slots

Up to `MAX_CUSTOM_SLOTS` (3) custom outputs, one visible at a time (tab
pills + add/remove in the Custom header). Each slot: its own any-agent
dropdown, Raw|Clean input source, Auto-run toggle, and its own
`studio_documents` row. The streaming runtimes are a FIXED hook pool
(`slotAi0..2`) — raise `MAX_CUSTOM_SLOTS` and add a hook instance together.
Auto-run: raw-source slots fire simultaneously with Clean (mic completion +
manual Clean Up); clean-source slots fire when the cleaned result lands.

## Change Log

- 2026-06-10 — Auto-label on first Clean pass: when the transcript is first sent
  for cleaning and the session title is still the default (`New Cleanup` /
  empty / untitled), one parallel `POST /api/content-label` call labels the
  session (same API + guard rails as Scribe/studio — one-shot per session,
  manual rename wins, local heuristic fallback). Removed the old
  first-chunk `deriveTitle` heuristic on mic save. Record pill: the full pill
  (including “Tap to record”) now starts recording, not just the mic icon. (tabs, per-slot agent /
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
