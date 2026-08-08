// features/agents/search/score.ts
//
// THE canonical agent relevance scorer. One implementation, every surface.
//
// This existed twice with drifted weights — the gallery copy in
// `features/agents/redux/agent-consumers/selectors.ts` and a chat-side copy in
// the (deleted 2026-08) legacy agentCache selectors. The chat copy scored an id
// match at 50 with no exact-id bonus, so searching a chat-side picker by UUID
// was effectively dead. Everything now delegates here.
//
// Pure: no Redux, no store types, no imports. Anything that can describe an
// agent structurally can be scored.
//
// Adding a field? Add it here and it lights up on every surface at once.
// Never fork this function.
//
// ── SQL PARITY (load-bearing) ───────────────────────────────────────────────
// `public.agx_search_score` in migrations/agx_search_score.sql is the SQL
// mirror of this function. Server-side paging FORCES a second implementation —
// relevance has to be computed before LIMIT, which the browser cannot do — but
// the two must stay in lockstep.
//
// CHANGE ONE, CHANGE THE OTHER IN THE SAME COMMIT, and keep the weights below
// identical to the SQL constants. Guarded by score.parity.test.ts against the
// shared fixture in __fixtures__/search-score-parity.json.
//
// This is not hypothetical: /agents/all shipped with a flat SQL `ILIKE OR` and
// no ranking at all, so a description match tied with a name match and
// searching "image" buried every image agent under unrelated ones.

/**
 * The structural shape a record needs to be searchable. Every field except
 * `id` is optional so both the full gallery record and the slim chat record
 * satisfy it without adapters.
 */
export interface AgentSearchable {
  id: string;
  name?: string | null;
  description?: string | null;
  category?: string | null;
  tags?: string[] | null;
  modelId?: string | null;
  agentType?: string | null;
  outputFormat?: string | null;
  sharedByEmail?: string | null;
}

/**
 * Relevance score for an agent against a query. Higher = more relevant.
 * Returns 0 when nothing matches (0 is the "no match" contract — see
 * `agentMatchesSearch`).
 *
 * Scores only fields carried by the list-level fetches. Message content and
 * variable definitions are deliberately excluded: they are not loaded by the
 * list RPCs, so matching them here would be a false promise. Server-side
 * search owns deep content matching.
 */
export function computeAgentSearchScore(
  agent: AgentSearchable,
  query: string,
): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  let score = 0;

  const name = (agent.name ?? "").toLowerCase();
  const desc = (agent.description ?? "").toLowerCase();

  if (name === q) score += 10000;
  else if (name.startsWith(q)) score += 5000;
  // Word-boundary beats a mid-word substring: "image" ranks
  // "Basic Image Generator" above "Reimagine Helper".
  else if (matchesWholeWord(name, q)) score += 3000;
  else if (name.includes(q)) score += 2000;

  if (desc === q) score += 1000;
  else if (desc.includes(q)) score += 500;

  if (agent.category?.toLowerCase().includes(q)) score += 300;
  if (agent.tags?.some((t) => t.toLowerCase().includes(q))) score += 300;
  if (agent.modelId?.toLowerCase().includes(q)) score += 100;
  if (agent.agentType?.toLowerCase().includes(q)) score += 100;
  if (agent.outputFormat?.toLowerCase().includes(q)) score += 100;

  // Id search — an exact UUID always wins outright so you can paste an id from
  // a URL or a log line and land on that agent, on any surface.
  const id = agent.id.toLowerCase();
  if (id === q) score += 100000;
  else if (id.includes(q)) score += 5000;

  // Helps find agents shared by a specific person.
  if (agent.sharedByEmail?.toLowerCase().includes(q)) score += 200;

  // Multi-term fallback: "image gen" matches nothing as a phrase. Score per
  // TERM, and only when EVERY term lands somewhere — so multi-word searches
  // work without degrading into a loose OR that matches half the list.
  if (score === 0 && q.includes(" ")) {
    const terms = q.split(/\s+/).filter(Boolean);
    let hits = 0;
    let termScore = 0;
    for (const term of terms) {
      const inName = name.includes(term);
      const matched =
        inName ||
        desc.includes(term) ||
        (agent.category?.toLowerCase().includes(term) ?? false) ||
        (agent.tags?.some((t) => t.toLowerCase().includes(term)) ?? false);
      if (matched) {
        hits += 1;
        termScore += inName ? 400 : 100;
      }
    }
    // All-or-nothing: a partial term match is not a match.
    if (hits === terms.length) score += termScore;
  }

  return score;
}

/** True when `q` appears in `haystack` on word boundaries. */
function matchesWholeWord(haystack: string, q: string): boolean {
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(haystack);
}

/** True when the agent matches the query at all. */
export function agentMatchesSearch(
  agent: AgentSearchable,
  query: string,
): boolean {
  return computeAgentSearchScore(agent, query) > 0;
}
