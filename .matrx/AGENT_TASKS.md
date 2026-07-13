# Agent Tasks

Active worklist managed by agents. **See `AGENT_INSTRUCTIONS.md` for rules** — especially around task format, condensation, and when to ask the user.

> Quick scan order for arriving agents:
> 1. **Needs Clarification** below (questions waiting on the user)
> 2. **Blocked** (waiting on external)
> 3. **Active** (`ready` and `in-progress`)
> 4. **Completed** (recent context, condensed)

---

## Needs Clarification

_(none)_

## Blocked

_(none)_

## Active

### TASK-001: Integrate Agent Handoff + Conversation Value Store (backend shipped)
- **Status:** ready
- **Created:** 2026-07-07
- **Source:** Backend shipped two agent patterns (2026-07-02); FE integration is a cross-repo handoff from aidream.

**Goal**
The chat UI correctly renders the two new backend agent patterns: (1) Agent Handoff — a front agent hands a turn to a specialist whose answer persists as the conversation's own reply; (2) Conversation Value Store — pass-by-reference results between agent calls. No raw handoff plumbing bubbles appear; the streaming answer bubble survives refetch; value-store cards/fences render.

**Why**
matrx-frontend reads `chat.message` from Supabase directly, so the server cannot filter plumbing rows for us. Without the §1 read filter, users see raw tool_use/tool_result plumbing bubbles from every handoff turn.

**Subtasks**
- [ ] **(load-bearing)** Add `is_visible_to_user` filter to EVERY conversation message-list read: `.or('is_visible_to_user.is.null,is_visible_to_user.eq.true')` (column is nullable; NULL = visible).
- [ ] Rebind the live streaming bubble to the durable row id announced on the handoff's `record_reserved` event (`table:"message"`, `metadata.handoff:true`) — the answer streams under a loop-start placeholder id but persists at a later position.
- [ ] On a `completion` event `operation:"sub_agent", status:"failed"` (never suppressed), truncate the live bubble back to pre-handoff text; the caller's retry streams after.
- [ ] Render `value_store.stored` (`ValueStoredEvent`) as a compact "result ready" card; render the `descriptor.fence` (a ```matrx block) via the existing envelope chip renderer, never as prose/code.
- [ ] Handle `value_store.groomed` (`ContextGroomedEvent`) — user-facing view unchanged (keep reading full `cx_tool_call.output`); optional subtle "context compacted" indicator.
- [ ] Render inline `context_groom` ```matrx fences in assistant prose via the existing fence chip renderer (kind/type are in the 65-shape manifest).
- [ ] Run `pnpm sync-types` so `ValueStoredEvent` / `ContextGroomedEvent` land in `stream-events.ts`.

**Notes**
- Full contract (events, columns, rendering hooks): `aidream/docs/cx_chat/FE_HANDOFF_AGENT_PATTERNS.md` (in the aidream repo at `/Users/armanisadeghi/code/aidream/docs/cx_chat/FE_HANDOFF_AGENT_PATTERNS.md`). Server contracts of record: `aidream/services/agent_handoff/FEATURE.md` + `aidream/services/conversation_values/FEATURE.md`.
- **DECIDED by Arman 2026-07-12 — `is_visible_to_user` IS ENFORCED AT RLS.** "RLS should not allow the user to see messages that are not visible to it. Simple. If we want an admin to see it, then we use admin privileges." So: the DB is the boundary, not the FE filter. Add a `chat.message` SELECT policy that excludes `is_visible_to_user = false` for ordinary users (NULL = visible), with a `public.is_super_admin()` bypass so admin/debug surfaces still see plumbing rows. The FE read filter stays as defense-in-depth (loud recovery doctrine), but it is no longer the only thing standing between users and plumbing bubbles. Cross-repo: DB (canonical RLS via `iam.apply_rls`) + aidream (its readers must keep seeing all rows under service_role) + FE. **Do NOT hand-write the policy** — use the canonical RLS generator (see `project_canonical_rls_generator`).

### TASK-002: Definer-grant recurrence guard — as a Data Integrity check (UI first, CLI free)
- **Status:** ready
- **Priority:** P1
- **Created:** 2026-07-12 (approved by Arman; promoted from FOUND_DEFECTS D31(d))
- **Analysis:** Analyzed 2026-07-12 — the vulnerability pattern is verified (D31 sweeps, 2026-07-07/11); the check itself is new work.

**Goal**
Kill the class behind D31: a `SECURITY DEFINER` function that is EXECUTE-granted to `anon`, takes a caller-supplied identity param (`p_user_id` / `p_actor` / `p_org_id` / email), and has no `auth.uid()` / `service_role` check in its body. This is what leaked decrypted MCP OAuth tokens to unauthenticated callers.

**Build it as a Data Integrity check, not a standalone script.** Add an entry to `lib/integrity/checks.ts` (`kind: "sql"`) — that gets BOTH the admin UI at `/administration/data-integrity` AND the `pnpm check:data-integrity` CLI for free from the shared registry/runner (`lib/integrity/runner.ts`, `app/api/admin/integrity/route.ts`, `app/(admin)/administration/data-integrity/page.tsx`). Do NOT create a new console-only `check:definer-grants` script and do NOT create a new admin page.

**Scope of the SQL**
- Scan **every PostgREST-exposed schema**, not just `public` — read the `authenticator` role's `pgrst.db_schemas` setting (D31 found `rag` + 30 others exposed; the original audit only covered `public`).
- Findings = definer fns with an anon/PUBLIC EXECUTE grant + an identity-shaped param + no auth guard in `prosrc`.
- **Known-good exceptions must be declared, not silently skipped** (loud recovery): the guest-flow fns legitimately serve no-JWT paths — `check_upload_quota`, `get_usage_status`, `get_user_limits`, `check_rate_limit`, `accept_organization_invitation`. Model the allowlist as data in the check with a reason per entry, so a new unexplained anon grant is always a finding.

**Then (Arman's standing ask): consolidate the console-only checks into that same UI.**
The `check:*` family is CLI/CI-only today — `check:migrations`, `check:schema`, `check:dead-relations`, `check:doctrine`, `check:tsconfig`, `check:surface-drift`, `check:hatches`, `check:ui-primitives`, `check:api-contracts`, `check:shapes`, `check:admin-catalog`, `check:entity-types`, `check:realtime-tools`, `gate:tools`. Only `check:data-integrity` has a UI twin. Extend `lib/integrity` with a repo/script check kind so these render in the same admin surface with the same severity/category grouping and re-run button. Arman should never have to open a terminal to see platform health. (`scripts/run-release-gates.sh` is today's only aggregator — it is the list to absorb.)

**Notes**
- Registry is the extension point; `pnpm check:admin-catalog` enforces admin-route registration (`features/admin/constants/admin-categories.ts`).
- Closes the open item D31(d). D31's other residuals (authenticated-cross-user self-guards, guest-flow fingerprint validation) stay in FOUND_DEFECTS.

---

### TASK-003: Stop silently dropping canonical capability fields — and audit for every other field doing the same
- **Status:** ready
- **Priority:** P1
- **Created:** 2026-07-12 (approved by Arman; promoted from FOUND_DEFECTS D34.2)
- **Analysis:** Analyzed 2026-07-12 — verified in code + live DB.

**Goal**
Live DB rows carry canonical capability fields that the FE type layer throws away on read. Fix the known two, then **sweep for every other field doing the same thing** (Arman's explicit instruction: "fix all of them that are doing that").

**Known hits** (`features/ai-models/capabilities/types.ts`)
- `interaction: "extraction"` exists on 5 live rows (fastino/GLiNER2), but `INTERACTION_MODES` is `["turn","realtime"]` → `isInteractionMode()` rejects it and `parseCapabilities` coerces those models to `"turn"`, so `features/agents/runtime/runtime-resolver.ts` treats extraction models as ordinary chat models. Live counts: `turn:198, extraction:5, realtime:2`.
- `capabilities.multilingual` is populated on 47 rows but absent from `ModelCapabilities` → discarded on read.

**Do**
1. Add `"extraction"` to `INTERACTION_MODES` and `multilingual` to `ModelCapabilities`; make every `switch` on `interaction` exhaustive (no silent default branch).
2. **Sweep:** diff the DISTINCT keys/values actually present in live `ai.model_definition.capabilities` (and `ai.offering`) against what the FE parser accepts. Every key the DB populates but the FE narrows away or drops is the same bug — fix each. Report the full list found.
3. This is a parse-layer silent-drop class: the parser must **scream** (`console.warn` / `captureError`) on an unknown capability value rather than coercing it to a default. A silent coercion is what hid this.

### TASK-004: Mobile flashcards can't render rich card variants (cloze / matching)
- **Status:** ready
- **Priority:** P2
- **Created:** 2026-07-12 (promoted from FOUND_DEFECTS D45 — a clear bug, no approval needed)
- **Analysis:** code analysis pending (claim filed by the F1 build session 2026-07-10).

**Goal**
Rich card variants render correctly on the DESKTOP study deck (`StudyDeck` computes cloze faces via `studyFaces` and branches to `MatchingCardPlayer`), but the MOBILE fallback shows a cloze card's raw `{{c1::…}}` markup and has no matching interaction — it degrades to a plain flip of the prompt.

**Do**
- Teach the mobile bridge/renderer the same faces: `FlashcardMobileView` ← `toFlashcardMobileCardsFromStudy`. The shared source of faces is `features/flashcards/utils/cardVariants.ts` — consume it, do not fork a second face-computing path.
- Build a mobile matching player (or make `MatchingCardPlayer` responsive rather than desktop-only).
- The inline `CanvasFlashcardsView` shares the same gap — fix it in the same change.

---

## Completed

_(none yet)_
