# Agent Samples ("test cases") — sample inputs per agent

**What this is:** every agent can hold a small set of stored sample inputs —
`agent.exemplar` rows keyed by `agent_id` (entity token `agent_exemplar`) —
so anyone can run the agent with realistic data in one click, and so contract
changes have concrete evidence of what breaks. User-visible copy says **"test
case"** or **"sample"**, never "exemplar" (that is the contract name only —
same rule as `features/mandates/admin/FEATURE.md`).

## The four laws of this feature

1. **THE COMPLETE-INPUT INVARIANT.** A sample's `variables` + `user_input` +
   `metadata.input_content` are the exact values entered in the UI or sent programmatically — NEVER the merged
   conversation snapshot. `chat.conversation.variables` merges scope/context
   (vsc) values in, so borrowing filters that dict down to the capture
   version's DECLARED variable names and lifts the human text out of the
   first `chat.message` row. `metadata.input_content` keeps that row's complete
   canonical `MessagePart[]` (images, files, and attached records included), so
   preview, reuse, and server-side tests replay the same turn without flattening.
2. **Staleness is DERIVED, never stamped** (TRUE CURRENT law). A sample
   carries the `input_contract_hash`/`output_contract_hash` it was captured or
   approved under; freshness = compare to `agent.definition` head hashes at
   read time (`sampleFreshness`). The head hashes are maintained by DB trigger
   `_stamp_contract`; version-to-version changes are stamped on
   `agent.definition_version.contract_change` (+ `contract_break_declared` for
   manual declarations via `public.agx_declare_contract_break` — surfaced in
   `features/agents/components/diff/VersionHistoryTimeline.tsx`).
3. **Approval is the gate, and the cap is a knob.** `status` lifecycle:
   `candidate` (borrowed, captured, bench-saved) → `approved` (via ONE RPC
   `public.agx_exemplar_approve`, which enforces the knob
   `agent_exemplars.max_approved_per_agent` and re-stamps head contract —
   approval IS the human confirmation the sample fits the current contract) →
   `archived`. Approved samples are the CURATED set (the aidream batch endpoint
   runs them by default); the manager deliberately offers **Use** on any listed
   sample — trialing a candidate before approving it is the point of the list.

4. **A CASE IS READ ONE INPUT AT A TIME.** A run is a SET of named inputs —
   each variable, each attachment, and separately the human's own text — and
   the viewer never merges them into one block of prose. `components/samples/
   TestCaseInputs.tsx` is THE ONE viewer for a case's inputs (the saved sample
   AND the candidate-run preview): one row per named input, carrying the
   input's label (the author's, from `AgentContractHead.variableDeclarations`),
   its size, and a one-line preview; a value too long for a line opens into a
   height-capped scrolled pane with a copy control, and a short value renders
   whole on its row with no disclosure to click. Cases themselves are collapsed
   with the first open. This exists because live rows carry variables of
   **267,025 characters** (`page_summaries` on the research agents): rendered
   as the chat bubble's flat `label: value` strip, ONE case filled ~30 screens
   of a 620px window and hid every other case. Do not reintroduce
   `AgentUserMessageContent` here — it is correct for a transcript bubble,
   where the bubble's own collapse bounds it, and wrong for a list of cases.
   What a wired record id may be shown as is still decided ONCE by
   `buildVariableDisplayLines`; this viewer adds presentation only.

## Surfaces

🚨 **Samples never add page chrome (Arman, 2026-08-26).** The original
full-width chip strip on top of the builder/runner was ripped out the day it
shipped — the entry point is ONE floating icon, and it exists ONLY in the
agent builder. Do not re-add chips, bars, or strips to any run surface.

**Mandate Test exception (Arman, 2026-09-09):** its Run once form offers Agent samples through the same manager. Agent-native variables are translated through the saved Provision Mapping; same-mandate cases already contain provision inputs. Ambiguous maps, other-mandate inputs and unsupported attachments are refused before changing the form.

- **Builder launcher** — `components/samples/AgentSamplesLauncher.tsx`: a
  single floating FlaskConical icon directly above the Smart Agent input in
  `AgentBuilderRightPanel.tsx`, opening the non-blocking Test cases
  `WindowPanel` (`features/window-panels/windows/agents/AgentTestCasesWindow.tsx`
  via `features/overlays/openers/agentTestCasesWindow.tsx`; catalogue singleton
  `agentTestCasesWindow`, registry slug `agent-test-cases-window`, ephemeral,
  fullscreen on mobile). "Use"
  prefills the live instance through the SAME slices typing uses
  (`setUserVariableValues` + `setUserInputText`; the sample's `user_input` is
  human-typed text, so this is not a USER-INPUT-LAW violation). Context values
  are untouched. The runner has NO sample affordance.
- **Manager** — `components/samples/AgentSamplesManager.tsx` (opened from the
  launcher's window; also the admin page at
  `/administration/agents/system-agents/agents/[id]/samples`): approved +
  candidate lists as COLLAPSED cards — the title line carries the freshness
  and status badges plus a one-line census ("4 variables · 2 attachments ·
  user input") so a closed card still says what is in it, and the first case
  in the list opens on arrival. Approve/demote/delete stay on the closed row.
  Opening a card renders `TestCaseInputs` (law 4). Also **Borrow from real
  runs** — recent `chat.conversation` rows for the agent (RLS-scoped) as the
  same collapsed cards, opening into the same `TestCaseInputs` plus the run's
  final answer; click-through to the run (no-dead-ends), one-click save as
  `source='borrowed'` candidate with `source_conversation_id` provenance.
  `fetchRunFinalResponse` reads the answer's TEXT parts through
  `parseMessageContent` — it used to `JSON.stringify` the content array and
  print `[{"id":"","text":"","type":"thinking",…}]` where the answer belongs.
- **Load sample data from a Library** —
  `components/samples/LoadFromLibraryDialog.tsx`, opened from the Candidates
  header. Pick one of your media Libraries, pick the catalogued items that
  already have a transcript, and the MEDIA CATALOG writes the test cases: the
  dialog POSTs the server-declared per-item action `use_as_agent_test_cases`
  through `createJob` (`features/source-library/api.ts`) with
  `params.agent_id`, and NEVER writes an `agent.exemplar` row itself. It is the
  exact reverse of the Library-side door (`AgentParamPicker` in the Library's
  action confirm) — one action, one server path, two entrances. The job is
  asynchronous, so the confirmation says only what happened ("N items were
  sent"), watches `fetchAgentSamples` a bounded six times at 4 s, and says
  plainly when nothing has landed instead of claiming success. A Library whose
  items have no transcript gets a sentence naming the remedy (transcribe them
  in the Library) and no start button — `libraryReadiness` in that file is the
  pure decision, guarded by
  `components/samples/__tests__/library-origin.test.tsx`. Every failure prints
  the server's own `MediaApiError.message` (+ `remedy`).
- **Mandate bench** — `features/mandates/admin/` reads the same table filtered
  by `mandate_id`; its saves stamp `agent_id` too.

## Where a sample came from (`source`)

`source` is `captured` (auto-capture), `borrowed` (from a real run),
`bench` (mandate test bench) or — since 2026-09-17 — **`library`**: written by
the media catalog's `use_as_agent_test_cases` action, whose provenance lands
under `metadata.media_catalog` as
`{key, action, library_id, library_name, adapter, job_id, items: [{source_row_id,
external_id, title, url, published_at, transcript_id, segment_count}],
bindings}`. `sampleLibraryOrigin` (in `service.ts`) is the ONE reader of that
block and `components/samples/SampleOriginLine.tsx` the one renderer: the
Library's name links to `/libraries/<id>`, and a sample made from exactly one
item links that item's `url`. A row whose `source` is `library` ALWAYS renders
an origin — a missing or malformed block says "From a Library" rather than
nothing, because a blank line is the silent failure this guards.

## Server side (aidream)

- `POST /agent-testing/agents/{agent_id}/tests` (super-admin) runs approved
  samples through `run_one_agent`; results persist under
  `metadata.agent_test_results` (separate key from the mandate bench's
  `test_bench_results`). Core: `aidream/services/agent_testing/service.py`.
- **Auto-capture**: successful plain `run_one_agent` head runs self-capture as
  `source='captured'` candidates until the knob
  `agent_exemplars.auto_capture_target` is met
  (`aidream/services/agent_testing/capture.py`; the mandate path's own
  auto-capture reads the same knob). Conversational runs are NOT auto-captured
  — conversations are already the borrow corpus.

## Operational notes (verified 2026-09-08)

- Both halves are DEPLOYED and running: auto-capture writes prod rows daily;
  the borrow flow has real usage. Live scale 2026-09-08: 789 samples across
  134 agents (7 approved / 782 candidates / 6 borrowed).
- `scripts/backfill-agent-exemplar-input-content.ts` (dry-run by default)
  backfills `metadata.input_content` onto pre-2026-08-29 borrowed rows —
  **no record exists that `--apply` was ever run**; verify before assuming
  old borrowed rows replay attachments.
- `service.ts` exports `renameAgentSample` with ZERO call sites — no rename
  affordance exists in any surface. Wire it or delete it; don't leave it dead.
- The cross-repo work order (alias-view drop, batch-run UI, capture gaps)
  lives at `../../../../common-docs/systems/agents/agent-samples/HANDOFF.md`.

## Change Log

- 2026-09-19 — Test cases are readable again. Cases collapse (first one open)
  with a census on the closed row; inside, each variable, attachment group and
  the human's own text is its own row with a label, a size and a preview,
  opening into a bounded scrolled pane. `AgentContractHead` now carries the
  agent's `variableDeclarations`, so rows read "Page Summaries" with the
  author's help text instead of `page_summaries`. The candidate-run list got
  the same treatment, and its final answer renders as text rather than the raw
  message-content JSON. Law 4 added above; see `FOUND_DEFECTS.md` D339 for the
  129k-character "user input" this made visible.

- 2026-09-17 — The reverse door: test cases can now be loaded FROM a media
  Library without leaving the agent build page, through the same
  `use_as_agent_test_cases` job the Library side runs; `source = 'library'`
  samples render the Library they came from and the item behind them.

- 2026-09-09 — Mandate Run once reuses AgentSamplesManager and the agent sample store; form fill preserves input provenance and reports unused values.

- 2026-08-29 — Test cases now capture, render, and replay the complete first
  user-message content (`metadata.input_content`) instead of losing every
  attachment and showing only flattened text/variables. The manager reuses the
  canonical user-message body; variables remain a separate launch-input strip.
- 2026-08-27 — Moved the builder's lone test-case icon from the test panel's
  top-right corner to the band directly above Smart Agent. Replaced its
  blocking right Sheet with the ephemeral `agentTestCasesWindow` and reduced
  empty-state and section copy to compact labels.
- 2026-08-26 — Chip strip removed same day on Arman's ruling ("worst place
  possible"): entry point is now the single floating `AgentSamplesLauncher`
  icon, builder-only; the runner carries no sample affordance.
- 2026-08-26 — Feature created: `agent.mandate_exemplar` generalized to
  `agent.exemplar` (agent-keyed), contract fingerprints + `contract_change`
  stamping on `agent.definition_version`, borrow-from-runs + approval flow,
  admin samples page, aidream batch-test endpoint + agent-level auto-capture.
