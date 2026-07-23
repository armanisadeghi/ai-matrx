# Arman Tasks — Matrx Frontend

_Last updated: 2026-07-22_

> Secrets, accounts, CDN, OS-only steps. Agents **ask you** when blocked here.
> Code work → `.matrx/AGENT_TASKS.md`. Discoveries → `FOUND_DEFECTS.md`.

---

## Active (ranked — quickest wins first)

0. **Deploy aidream to prod** (`bash scripts/release.sh` in aidream) — everything from the 2026-07-15 Content IR sweep (envelope producer, typed agent projections, enforcement machinery OFF, tool/action stamping) is on `main` but inert until deployed. The agent's session couldn't run it (permission classifier). After deploy: agents read the `tool_io` drift logs and bring you the evidence for the tools-first enforcement flip you ratified. Also still pending post-soak: drop `content_ir._backup_kind_example_20260715` + `_backup_kind_surface_20260715` (+ the two `matrx_orm.yaml` exclude lines).
   _Already ratified 2026-07-15 (recorded here for the log): tools-first flips after drift evidence; `table` stays markdown-first with click-to-convert (pattern being documented); every kind gets an example; 7 candidates being registered non-breaking; the 6 gated roots stay inactive (test kinds); integration-first is the priority._

### 1. Approve/reject the 3 defect→task promotions (seconds)
Open `FOUND_DEFECTS.md` → `## Pending Arman review` (prepared 2026-07-12): D34.2 capability fields, D45 mobile flashcard rendering, D31(d) `check:definer-grants` CI guard. Say yes/no per item in chat; the next agent moves approved ones to AGENT_TASKS.

### 2. Decide: server-side hardening for `is_visible_to_user` (seconds — a decision)
TASK-001 (agent handoff integration) hides plumbing message rows with an FE read filter only. Deliberately not enforced via RLS/view on the backend because that would also hide the rows from admin/debug surfaces. Decide: FE-filter-only (status quo) vs. RLS/view hardening on `chat.message`. Context: `aidream/docs/cx_chat/FE_HANDOFF_AGENT_PATTERNS.md`.

### 3. Decide: D35 `platform.association_types` PK shape (seconds — a decision)
The 2-col PK `(source_type, target_type)` forbids the designed label+generic rule coexistence. Recommended: option (2) — surrogate `id uuid` PK + keep the 3-col unique index (needs aidream ORM regen, cross-repo commit). Alternatives in the D35 entry. Say "option 1/2/3" and an agent executes.

### 4. Content IR Wave 1 owner decisions (mostly seconds each)
Wave 1 shipped 2026-07-15 (see `common-docs/content-ir-system/OWNER_BRIEF.md`). Six calls only you can make; answer per letter in chat and an agent executes.
- **(a) Register-or-not the 7 shape candidates** the crosswalk flags as unregistered shapes: `chart`, `map`, `stats`, `diff`, `search_results`, `fetch_results`, `categorization_result` (`scripts/shape/content-vocab-crosswalk.json`). Registering makes each a real kind with schema + example; declining ratifies them as client-only.
- **(b) Reconcile the `table` classification.** Crosswalk says `scalar_generic` (generic markdown-table ingestion); aidream's `NON_ENVELOPE_BLOCK_TYPES` comment advocates a registered kind for deliberate typed-table emission. Both can be true — decide: register a `table` kind for typed emission, or ratify scalar_generic-only.
- **(c) Activation of the 6 documented inactive roots**: `office_document`, `office_presentation`, `office_spreadsheet`, `q_and_a_set`, `schema_showcase`, `study_pack_set`. Each has full guidance kits and an `activation_gate` metadata entry recording readiness + why it is held; say which (if any) to flip active.
- **(d) Enforcement flip timing per family** (Wave 2): after drift-clean real traffic, flip `MATRX_KINDS_ENFORCE_*` + `content_ir.admission_config` in order `action_io` → `tool_io` → `workflow_io` → `agent_io` → render. Say go per family; detector host-literal deletion follows admission-on.
- **(e) Approve the small `media_block` crosswalk row** (W1-C follow-up — the one token missing a row; an agent adds it to the generator inputs and regenerates).
- **(f) Post-soak cleanup**: say when soak is done to drop `content_ir._backup_kind_example_20260715` + `_backup_kind_surface_20260715` and remove their two lines from aidream `db/matrx_orm.yaml` (~504-505).

### 5. Authorize the Supabase MCP for Claude Code (one-time, ~30s)
The Supabase MCP now requires OAuth and non-interactive sessions can't complete it — DB verification steps silently degrade without it. In an interactive Claude Code session in this repo, run `/mcp` and complete the Supabase auth flow.

### 6. COPPA verifiable parental consent — legal + Stripe webhook + vendor pick
The **code is built and live-verified** (card auth-and-void via Stripe test). To turn it on for real families, complete the runbook: `docs/proposals/education-projects/COPPA_VERIFIABLE_CONSENT_RUNBOOK.md`. Quick wins: (1) set `STRIPE_WEBHOOK_SECRET` in prod + register the `/api/stripe/webhook` endpoint (the card method needs it); (2) legal: which method(s) to require + auth-and-void vs charge+refund; (3) pick the gov-ID/KBA vendor (Stripe Identity / PRIVO / Persona). Then agents wire the vendor + signed-form upload.

### 7. SMS integration — Twilio console setup (manual, ~15 min)
The SMS code is in place; the remaining steps are dashboard/console work only you can do (Messaging Service creation, phone-number config, env vars, webhooks). Full runbook: `.matrx/arman-sms-setup.md` (moved from the repo root 2026-07-22).

## Pending Arman review

_(none — current asks are all in Active)_

## Future

_(none)_

## Done

- Gemini TTS B4 regression resolved and live-verified; see `FOUND_DEFECTS.md` D40.
