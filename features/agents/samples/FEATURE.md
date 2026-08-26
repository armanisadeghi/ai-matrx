# Agent Samples ("test cases") — sample inputs per agent

**What this is:** every agent can hold a small set of stored sample inputs —
`agent.exemplar` rows keyed by `agent_id` (entity token `agent_exemplar`) —
so anyone can run the agent with realistic data in one click, and so contract
changes have concrete evidence of what breaks. User-visible copy says **"test
case"** or **"sample"**, never "exemplar" (that is the contract name only —
same rule as `features/admin/mandates/FEATURE.md`).

## The three laws of this feature

1. **THE RAW-VALUES INVARIANT.** A sample's `variables` + `user_input` are the
   exact values entered in the UI or sent programmatically — NEVER the merged
   conversation snapshot. `chat.conversation.variables` merges scope/context
   (vsc) values in, so borrowing filters that dict down to the capture
   version's DECLARED variable names and lifts the human text out of the
   reserved `__agent_user_input__` key (`service.ts extractRawInputs`).
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
   `archived`. Only APPROVED samples surface as one-click "Use" defaults.

## Surfaces

🚨 **Samples never add page chrome (Arman, 2026-08-26).** The original
full-width chip strip on top of the builder/runner was ripped out the day it
shipped — the entry point is ONE floating icon, and it exists ONLY in the
agent builder. Do not re-add chips, bars, or strips to any run surface.

- **Builder launcher** — `components/samples/AgentSamplesLauncher.tsx`: a
  single floating FlaskConical icon (absolute top-right of the builder test
  panel, `AgentBuilderRightPanel.tsx`) opening the Test cases sheet. "Use"
  prefills the live instance through the SAME slices typing uses
  (`setUserVariableValues` + `setUserInputText`; the sample's `user_input` is
  human-typed text, so this is not a USER-INPUT-LAW violation). Context values
  are untouched. The runner has NO sample affordance.
- **Manager** — `components/samples/AgentSamplesManager.tsx` (opened from the
  launcher's sheet; also the admin page at
  `/administration/agents/system-agents/agents/[id]/samples`): approved +
  candidate lists with freshness badges, approve/demote/delete, and
  **Borrow from real runs** — recent `chat.conversation` rows for the agent
  (RLS-scoped) showing raw inputs + expandable final response, click-through
  to the run (no-dead-ends), one-click save as `source='borrowed'` candidate
  with `source_conversation_id` provenance.
- **Mandate bench** — `features/admin/mandates/` reads the same table filtered
  by `mandate_id`; its saves stamp `agent_id` too.

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

## Change Log

- 2026-08-26 — Chip strip removed same day on Arman's ruling ("worst place
  possible"): entry point is now the single floating `AgentSamplesLauncher`
  icon, builder-only; the runner carries no sample affordance.
- 2026-08-26 — Feature created: `agent.mandate_exemplar` generalized to
  `agent.exemplar` (agent-keyed), contract fingerprints + `contract_change`
  stamping on `agent.definition_version`, borrow-from-runs + approval flow,
  admin samples page, aidream batch-test endpoint + agent-level auto-capture.
