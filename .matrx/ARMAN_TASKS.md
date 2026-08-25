# Arman Tasks — Matrx Frontend

_Last updated: 2026-08-25_

> Secrets, accounts, CDN, OS-only steps. Agents **ask you** when blocked here.
> Code work → `.matrx/AGENT_TASKS.md`. Discoveries → `FOUND_DEFECTS.md`.

---

## Active (ranked — quickest wins first)

### 0. Make `@ai-matrx/content-ir-react` publishable on npm (one page, one setting)

**Link:** https://www.npmjs.com/settings/ai-matrx/packages

The shared Content IR RENDER layer is built, tested, tagged, and already
adopted by the aidream dashboard — but it has never been published, because npm
**trusted publishing can publish a package that exists and cannot create a new
name.** The aidream release workflow runs green through every gate and then
fails with `PUT https://registry.npmjs.org/@ai-matrx%2fcontent-ir-react → 404`.
The npm token on this machine is also expired (`npm whoami` → 401), so a manual
first publish is not available to an agent either.

**What to do:** on that page, give `@ai-matrx/content-ir-react` the same
publishing setup `@ai-matrx/content-ir` already has — a GitHub Actions trusted
publisher pointing at `AI-Matrix-Engine/aidream`, workflow
`publish-npm-package.yml`. If npm will not let you configure a publisher for a
name that does not exist yet, the alternative is one manual publish from a
logged-in shell (the packed, gate-verified tarball is reproducible with
`pnpm --dir apps/shared/content-ir-react pack`).

**What to report:** "done", or what the page actually offered you. Either
answer unblocks the next step; a guess does not.

**What it unblocks:** matrx-frontend stops owning the render layer alone — the
repoint is written and waiting at
`docs/handoffs/content-ir-react-repoint.md` — and the Chrome extension, the
desktop app, and customers get one implementation of kind rendering instead of
re-implementing it, which is banned.

### 0c. Decide: does `/transcripts` still need the NESTED view? (seconds — a decision)

The canonical entity-list rewrite (merged 2026-08-15) replaced the sectioned
transcripts hub with one server-paged list. It deliberately **dropped the
nested tree view** — session → its recordings, cleanup → its recordings — which
the old bespoke `TranscriptsHubTable` rendered with a hand-rolled tree gutter.
Everything else came across; this is the one capability that did not.

Bringing it back is not a transcripts fix — `MatrxDataTable` has no hierarchy
concept at all, so it means adding parent/child rows to the canonical table
that ~20 surfaces now share. The extraction's own ruling was that this is the
one place where extending the canonical table is *likely* correct rather than
bending transcripts around it. But building a hierarchy engine into the shared
table on a hunch is exactly the speculative work the doctrine forbids.

**The call:** does anyone actually use nesting to find a recording?
- **Yes** → I file it as a chip to add hierarchy to `MatrxDataTable` (a real
  piece of work, and every table surface inherits it).
- **No** → say so and I delete this entry; the flat list with a Type column
  and a `session` filter already answers "what recordings exist".

### 0a. Run the agent-machine setup on your OTHER Macs (~5 min each, mostly one command)
Done on the 16GB Mac 2026-08-09; **every other machine and account still needs it**, or agents there will crash the box with a second dev server and be unable to drive the desktop app.

Full checklist + rationale: `/Users/armanisadeghi/code/common-docs/systems/infrastructure/agent-machine-setup/FEATURE.md`. Short form:
1. `cd ai-matrx && pnpm setup:agent-harness` — installs the one-dev-server guard into `~/.claude` + `~/.codex` (idempotent; `pnpm check:agent-harness` to verify). In Codex, run `/hooks` once and trust the Matrx guard after reviewing it.
2. System Settings → Privacy & Security → **Accessibility** → enable Claude Code (without it agents cannot click/type in desktop apps).
3. Authorize the **Supabase MCP** via `/mcp` in an interactive session (per-account OAuth; does not travel with the repo).
4. Optional, for desktop UI testing: the `matrx-local/desktop` E2E block in the same doc.

**Agents on other machines: if you read this, run step 1 and tell Arman which of 2-4 are missing.**

### 0b. Decide: should `EntityDoorControls` be VISIBLE by default? (seconds — a decision)

**Evidence, all from one session (2026-08-09):** the No Dead Ends sweep shipped
an invisible door **three times**, in the campaign whose entire subject is doors
that do not open. Each time: markup right, `pnpm type-check` green, ESLint
green, and the user simply cannot see the control. Bugbot caught all three; no
static check can.

Cause: the controls render at `opacity-0` and fade in on hover of an ancestor
`group` class. Miss the class and the door is invisible. I already widened the
primitive to accept a plain Tailwind `group` as well as the named
`group/entity-ref` (`2118fda9`) — the third instance still slipped through,
because that row had **no** group class at all.

**The call:** should a standalone `<EntityDoorControls>` default to visible,
with hover-reveal becoming the opt-in?

- **For:** forgetting then produces a slightly noisier surface instead of a
  dead end. Given the doctrine ("a door the user cannot reach is a defect"),
  failing loud is the right direction.
- **Against:** ~10 dense table/list surfaces currently rely on hover-reveal to
  stay clean. Flipping the default changes how they look.
- **Safe path if you say yes:** `EntityRef` (the majority path, which supplies
  its own group) keeps passing hover-reveal explicitly, so only the standalone
  callers change.

**Why this is yours and not an agent's:** it is a visual density change across
many surfaces, and **no agent on this campaign can load a page** to see the
result (network policy blocks the app). I fixed each instance by hand rather
than gamble the default. Say "visible by default" or "leave it" and an agent
executes.

### 2. Decide: server-side hardening for `is_visible_to_user` (seconds — a decision)
TASK-001 (agent handoff integration) hides plumbing message rows with an FE read filter only. Deliberately not enforced via RLS/view on the backend because that would also hide the rows from admin/debug surfaces. Decide: FE-filter-only (status quo) vs. RLS/view hardening on `chat.message`. Context: `aidream/docs/cx_chat/FE_HANDOFF_AGENT_PATTERNS.md`.

### 3. Decide: D35 `platform.association_types` PK shape (seconds — a decision)
The 2-col PK `(source_type, target_type)` forbids the designed label+generic rule coexistence. Recommended: option (2) — surrogate `id uuid` PK + keep the 3-col unique index (needs aidream ORM regen, cross-repo commit). Alternatives in the D35 entry. Say "option 1/2/3" and an agent executes.

### 4. Content IR enforcement and post-soak cleanup
Wave 1 shipped 2026-07-15 (see `common-docs/systems/content-ir-system/OWNER_BRIEF.md`). The candidate registrations, `table` classification, inactive-root posture, and `media_block` crosswalk coverage are settled and implemented. Two owner-timed rollout choices remain:
- **(d) Enforcement flip timing per family** (Wave 2): after drift-clean real traffic, flip `MATRX_KINDS_ENFORCE_*` + `content_ir.admission_config` in order `action_io` → `tool_io` → `workflow_io` → `agent_io` → render. Say go per family; detector host-literal deletion follows admission-on.
- **(f) Post-soak cleanup**: say when soak is done to drop `content_ir._backup_kind_example_20260715` + `_backup_kind_surface_20260715` and remove their two lines from aidream `db/matrx_orm.yaml` (~504-505).

### 6. COPPA verifiable parental consent — legal + Stripe webhook + vendor pick
The **code is built and live-verified** (card auth-and-void via Stripe test). To turn it on for real families, complete the runbook: `/Users/armanisadeghi/code/common-docs/systems/education/COPPA_CONSENT_RUNBOOK.md`. Quick wins: (1) set `STRIPE_WEBHOOK_SECRET` in prod + register the `/api/stripe/webhook` endpoint (the card method needs it); (2) legal: which method(s) to require + auth-and-void vs charge+refund; (3) pick the gov-ID/KBA vendor (Stripe Identity / PRIVO / Persona). Then agents wire the vendor + signed-form upload.

### 7. SMS integration — Twilio console setup (manual, ~15 min)
The SMS code is in place; the remaining steps are dashboard/console work only you can do (Messaging Service creation, phone-number config, env vars, webhooks). Full runbook: `.matrx/arman-sms-setup.md` (moved from the repo root 2026-07-22).

### 8. Patrol candidate — "the id is not what its NAME says it is" (wrong-record doors)

**Nominating this as a Pattern Patrol** per the CLAUDE.md standing duty. It is a
CLASS, not three mistakes, and it produces the one thing the doctrine ranks
worse than a missing door: **a door that opens the wrong record, which looks
like it worked.**

Three occurrences inside the no-dead-ends campaign alone, all 2026-08-09:
1. `agent.shortcut.scopeId` — named like a `context.scopes` row; actually an
   org/project/task id (`applyScopeToRowFields`). Caught by Bugbot.
2. A surface key sliced into `<prefix>:<uuid>` and guarded only by `isUuidValue`
   — but a shortcut id is also a uuid, so the "agent" door opened a shortcut.
   Caught by an adversarial agent.
3. `ScopeRef.scopeId` in the context-menu lab — same trap as (1), in a file
   whose sibling module carries a docblock **describing this exact trap**. I
   wrote it anyway. Caught by an adversarial agent.

Why a patrol and not a rule: the type system cannot see it (every id is
`string`), lint cannot see it, and a reviewer sees a plausible pairing. The only
reliable detection is a targeted pass that, for each of the **172** `token=`
door usages, traces where the id came from — the selector, the API field, the
slice — rather than trusting the variable name. Scale of the naming hazard:
**1180** `scopeId` occurrences across `features/`, `components/`, `app/`.

Two mitigations already exist and should be the patrol's fix template:
`entityTokenForAgentScope` (`features/agent-shortcuts/constants.ts`) and
`entityFromSurfaceKey` (`features/agents/utils/surface-key.ts`) — declared
vocabularies mapping an ambiguous field to the token it ACTUALLY identifies.
Each hit resolves to either "route it through a vocabulary" or "this id has no
navigable record; render it token-less".

A branch-wide sweep of `token="scope"` (8 sites) was run when (3) was found: all
the others are genuine `context.scopes` rows.

**Your call:** add to `common-docs/systems/improvement/pattern-patrols/PATROL_REGISTRY.md`?

## Pending Arman review

### Restart the main Supabase database to release a signal-immune backend (P0)

**Date / source:** 2026-08-25 · `supabase-postgrest` 57014 class on
`/marketing/search-console` · exact system-error representative
`5e784a1c-c05d-4b55-9175-c4838b1e0140` (4 class occurrences).

**Impact:** `seo.gsc_ingestion_health` still times out for the large production
site because `idx_seo_sperf_gsc_health_coverage` remains invalid. The committed
online index repair (`7c33e08751`, split safely by `35282decdf`) cannot finish.

**Verified root cause:** the live concurrent index builder is stuck in
`waiting for old snapshots`. Its last locker is a `postgres`/Supavisor backend
running an `_ip.row_versions` read in one transaction since
2026-08-24 23:13:18Z. Both `pg_cancel_backend` and PostgreSQL 17's timed
`pg_terminate_backend(pid, 5000)` were attempted; the timed termination returned
false and the backend remained active. A temporary one-statement `pg_cron`
drop job also hit lock timeout and was unscheduled, so no patrol job remains.

**Decision / action required:** choose one external-authority recovery:

1. **Recommended:** restart the main Supabase database from the project
   dashboard during the earliest acceptable brief interruption; this releases
   the unkillable backend deterministically.
2. Open an urgent Supabase support case asking them to terminate the backend at
   the host level, avoiding a full database restart but extending the outage of
   Search Console health reads.
3. Defer intervention; the class remains open and every large-site health read
   can continue timing out. This is safe for stored data but not recommended.

**Exactly what Arman must do:** open the main Supabase project, restart its
database (option 1), and reply `restarted` with the completion time. Do not
change timeouts or run SQL.

**What the agent will do afterward:** verify the stale backend is gone, run the
already-committed `DROP INDEX CONCURRENTLY` / `CREATE INDEX CONCURRENTLY`
recovery as two separate one-statement jobs, remove those jobs, prove the index
valid and the live RPC fast for the affected site, confirm zero post-proof
recurrence, and return the exact IDs eligible for resolution.

## Future

_(none)_

## Done

- Supabase MCP OAuth confirmed by a live project-list call; stale authorization ask removed (2026-08-25).
- Manual aidream deployment ask removed; the dedicated deploy agent owns the approved cadence (2026-08-25).
- Content IR candidates, `table`, inactive-root posture, and `media_block` crosswalk coverage reconciled; only enforcement timing and post-soak cleanup remain owner-timed (2026-08-25).
- Stale three-defect promotion ask removed: pending review is empty, D45-mobile is fixed, and the definer-grant guard shipped (2026-08-25).
- Gemini TTS B4 regression resolved and live-verified; see `FOUND_DEFECTS.md` D40.
