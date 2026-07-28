---
status: active
updated: 2026-07-23
repos: [matrx-frontend]
vision: []
---

# Agent search — consolidate + server-side everywhere

The `/agents/all` gallery is done. The remaining work carries the same doctrine to the
two chat-side pickers that still search locally over a partial set, and collapses the
last duplicate scorer. All work is in matrx-frontend; the DB side is already live.

## Vision — Arman's words (verbatim)

The bug that started this:
> "Find out why this agent works fine if I go to it in the route but doesn't come up in
> any of my search results ... This is a MASSIVE FINDING."

The two standing rules he gave, which govern all remaining work:

> "If ... the Canonical search is broken and it's not properly doing a full search, then
> that's the bug and it needs to be fixed for the CANONICAL one and if they have split and
> we have multiple versions, then we need to fix that immediately and canonicalize it."

> "If ANY data is paginated, then the search needs to trigger a serverside search. (can
> show local as an immediate result but it has to hit the server and 'ADD' data to the
> slice, not replace)"

The two-tier shape he specified:

> "We need to have a two-tiered search with the first covering the basic fields and then
> if the user wants, having something that they engage that then does the deeper search
> that goes into messages. But most of the time, you want to make absolutely certain that
> the initial searches favor the more obvious matches by name, etc."

Distilled invariants (hold these when building):
- One scorer. Splits are defects — find and collapse them.
- Paginated data ⇒ hit the server; merge results **additively**, never replace the slice.
- Tier 1 (obvious fields) always beats tier 2 (prompt content). A name match is never
  buried by a deep match.

## Resources

- Feature doc: [features/agents/FEATURE.md](../../features/agents/FEATURE.md) — Change Log 2026-07-22 entries describe what shipped.
- Canonical scorer: [features/agents/search/score.ts](../../features/agents/search/score.ts) — pure, structural, the ONE agent scorer. Its weights are mirrored in SQL; change one, change both.
- Server search RPC (live): `public.agx_search(p_query, p_deep, p_limit, p_offset)` — returns `AgentListRow` + `match_score` + `match_field`. `p_deep=true` adds prompt-content (tier 2). Migration: [migrations/agx_search_two_tier.sql](../../migrations/agx_search_two_tier.sql).
- Client search primitives (gallery reference implementation):
  - Thunk `searchAgentsServer` + `useServerAgentSearch` hook — debounced, stale-drop, additive merge via `mergeAgentListRows`.
  - Wired in `useAgentConsumer` (so every consumer of the `agent-consumers` slice inherits it). Slice fields: `serverMatchedIds`, `deepSearch`, `isServerSearching`.
  - Selectors respect `serverMatchedIds` so tier-2 hits (which the local scorer can't see) survive the filter: `features/agents/redux/agent-consumers/selectors.ts`.
- DB project: `txzxabzwovsujtloxrus` (Supabase MCP). Verify RPCs live before trusting any claim here.
- Test route: `/agents/all`. Log in via `/login` as `admin@admin.com` / `Password1234#`, or the localhost dev-login URL in CLAUDE.md. Repro: search a term that exists ONLY in a prompt (e.g. `mitochondria`) → 0 tier-1 results → click **Prompts** toggle → results appear.

## Remaining work

**The two chat-side pickers that read `agentCacheSlice` are the genuinely blind path.**
`SsrSidebarAgents` and `PromptPickerMenu` read the `agentCacheSlice` store, populated by
`fetchAgentSlimList` → `get_agents_for_chat` (50 rows + manual cursor). Their search is
local-only over that ≤50-row loaded set (`lib/redux/selectors/agentSelectors.ts`,
`makeSelectFilteredOwned/Shared/BuiltinAgents`, using the canonical `computeAgentSearchScore`).
Beyond the first page, agents are invisible to search — the exact original bug, still live here.
- Files: `features/cx-chat/components/SsrSidebarAgents.tsx`, `features/public-chat/components/PromptPickerMenu.tsx`, thunk `lib/redux/thunks/agentFetchThunks.ts` (`fetchAgentSlimList`), store `agentCacheSlice`.
- `get_agents_for_chat` orders by `d.id` (keyset — a total order, so it does NOT have the drop-rows bug; the fix here is reach, not correctness).
- Two viable paths — this is the one real judgment call, see **Decisions needed**.

**Collapse the third agent scorer.** `AgentPickerSheet` (the main chat picker) is NOT blind —
it reads the `agentDefinition` slice, loaded in full by `initializeChatAgents` → `fetchAgentsListFull`
→ `agx_get_list_full` (unpaginated, confirmed live). But it scores via the generic
`filterAndSortBySearch` (`utils/search-scoring.ts`) with inline agent field-config, NOT the
canonical `computeAgentSearchScore`. So its weights can drift from `score.ts` independently,
and it has no tier-2. Route it through `features/agents/search/score.ts` and add the Prompts
toggle for parity. File: `features/cx-chat/components/agent/AgentPickerSheet.tsx` (search memos at ~278 and ~484).

**Verify tier-1/tier-2 ordering after any change.** The guarantee (tier 2 scores 50, below
every tier-1 field) lives in BOTH `score.ts` and `agx_search`'s SQL `CASE` ladder. If you touch
either, re-check they still agree — a drift makes the merged list visibly reshuffle when the
server responds.

## Done

- Pagination drop-rows bug fixed in 16 paginated RPCs (unstable `ORDER BY` → appended unique `id` tiebreaker) — see `migrations/*_stable_pagination.sql` + FEATURE.md 2026-07-22.
- `agx_search` two-tier server search built + wired into `/agents/all` gallery, verified live in-browser — see `migrations/agx_search_two_tier.sql`, `features/agents/search/`, `features/agents/hooks/useServerAgentSearch.ts`.
- Two of three agent scorers canonicalized onto `features/agents/search/score.ts` (gallery `agent-consumers/selectors.ts` + chat `lib/redux/selectors/agentSelectors.ts`). Third (`AgentPickerSheet` via `filterAndSortBySearch`) remains — above.
- Three unrelated DB defects the audit surfaced are filed as FOUND_DEFECTS.md **D82** (not this work).

## Decisions needed

**Situation.** The two chat-side pickers on `agentCacheSlice` (`get_agents_for_chat`, 50 +
cursor) can only search the first page of agents. Their sibling `AgentPickerSheet` already
solved the same problem a different way: it abandoned the paginated slice and loads the entire
accessible set in one unpaginated call (`agx_get_list_full`), then searches locally. The full
set is small today (~662 agents, ~2.3 MB of prompt text).

**Decide.** Which path for `SsrSidebarAgents` + `PromptPickerMenu`?
- **(A, recommended) Match `AgentPickerSheet`:** point them at the `agentDefinition` slice /
  full-load path and retire their `agentCacheSlice` dependency. Simplest, removes a whole
  duplicate store, and eliminates the blindness outright. Downside: no tier-2 prompt search
  unless added, and it loads everything up front.
- **(B) Wire `agx_search` in** (Arman's literal rule — keep pagination, add serverside search
  that additively merges): more scalable if agent counts grow large, gives tier-2 for free,
  but requires `searchAgentsServer` to also upsert slim rows into `agentCacheSlice` (today it
  merges into `agentDefinition`), i.e. bridging two stores.
