# Handoff — Access & Scope-Context Campaign

**Owner:** Arman. **State as of 2026-07-16.** Cross-repo (ai-matrx + aidream + live Supabase `txzxabzwovsujtloxrus` + matrx-common-docs). Read this top-to-bottom before touching anything access- or scope-related.

## Rules of engagement (non-negotiable)

1. **Source of truth = Arman's words or the live DB — never in-repo prose.** Most codebase comments/docs are agent-generated and often wrong. His rulings are captured in `common-docs/scope-context-system/FEATURE.md` (scope/context model) and `common-docs/access-architecture/FEATURE.md` (access mechanics, live-verified). Build ONLY on those; if you need a new decision, ask him — jargon-free, framed as what a user sees/does.
2. **The reference implementation is law:** `seed_conversation_attachments` (aidream `aidream/services/conversation_context/context_sources.py`) — durable association edge → per-user ACL (`iam.has_access_for`) → lazy `persist=never` ContextObject → registered resolver with `describe()`/`materialize()`. Any new context source replicates it. Never a parallel mechanism.
3. **Agents are users.** Everything an agent can see/do rides the user's own access. Before building any access affordance, check whether the system already composes it (Arman's chat-privacy correction: the chat row's own privacy already governed scope-tagged chats — nothing needed building).
4. A migration counts only when applied to live Supabase + verified + `_schema_migrations` ledgered + types regenerated (`pnpm db-types`; aidream `db/generate.py`).

## Done (don't redo; verify against these if confused)

- **Access system-of-record** `common-docs/access-architecture/FEATURE.md` — glossary, resolver walkthroughs, RPC catalog, code map, gaps G1–G16 with a resolution log. Waves A–D+F executed 2026-07-15: docs merged (db-rules → common-docs), one share-link system (`platform.share_links`, `/s/[token]`; `files.share_links` graveyarded), ONE resolver body (`iam.has_access_for`; `check_resource_access` dropped, org predicates collapsed to wrappers), registries reconciled (22 registrations + 9 token renames), dead RPCs dropped.
- **Brief 2 (scope → agent context) executed 2026-07-16** — see `common-docs/access-architecture/DECISION_BRIEFS.md` Brief 2 header for the full delta. Key artifacts: aidream `seed_conversation_scope_context` + `scope_context_resolver.py` (+7 tests); FE `conversationScopeGate.ts` + `components/dialogs/scope-mismatch/` (+14 tests, browser-E2E'd); DB migration `scope_context_tagging_is_sharing.sql` (scopes `visibility` column, note/file→scope convey read-only viewer, agent/project scope edges lowered to viewer).

## Open work, ranked

1. ~~Brief 5~~ **✅ DONE 2026-07-16** (aidream `67aa9722d`): notes adapter + rag + scraper + the matrx-ai `note` tool (which had NO per-user check — any agent could touch any note by id) all ride `iam.has_access_for`; live-verified with a real shared note; 54 tests green. Residue: scraper's owner/`is_public` fast-path dies when scraper tables canonicalize; set-shaped list filters stay direct by design. Details: DECISION_BRIEFS.md Brief 5 header.
2. **Brief 1 — Module Settings as the one org-admin knob** (option A recommended; includes the agent/skill `moduleKey()="definition"` collision fix). First action: check `agent.default_visibility` live.
3. **Brief 3 — shared-with-me + mine-first list contract** (A+C recommended; `get_prompts_shared_with_me` already dropped).
4. **Brief 4 — `/p/e` allowlist → registry flag** (S).
5. **Loose ends:** (a) Arman to confirm the agent read-only contract is respected server-side (builder UI is done, his statement); (b) extending tagging=sharing to more types (task/thread/war_room) is a one-row `association_types` flip per type — HIS call, don't assume; (c) aidream must deploy before file share links serve bytes in prod; (d) education `edu_class_*` membership writers + Stripe-purchase grant path are documented facts (access doc §4.2) with no decisions made.

## Verification recipes

- Conveyance: `iam.has_access_for(member,'note',id,'viewer')` true / `'editor'` false / `iam.is_discoverable(...)` false / outsider false.
- Seeder live test: script pattern in this repo's history (commit `6bcea0bd1` in aidream) — `configure_packages()` then seed+`resolve_lazy_sources` for a real tagged conversation.
- FE gate: `pnpm test:unit features/scopes/utils` (14) + browser flow (tag → switch sidebar → dialog → combine/keep → no re-ask).
- Suites: aidream `pytest aidream/services/conversation_context/tests/` (30); ai-matrx `pnpm type-check` green.

## Repo state

All three repos have local commits rebased onto remote main (2026-07-16), clean trees, **unpushed** — Arman pushes. Supabase MCP note: subagents may lack MCP auth early in a session; run load-bearing SQL from the main session.
