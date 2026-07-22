// features/agents/search/score.ts
//
// THE canonical agent relevance scorer. One implementation, every surface.
//
// This existed twice with drifted weights — `features/agents/redux/agent-consumers/selectors.ts`
// (the gallery) and `lib/redux/selectors/agentSelectors.ts` (the chat-side agentCache).
// The chat copy scored an id match at 50 with no exact-id bonus, so searching a
// chat-side picker by UUID was effectively dead. Both now delegate here.
//
// Pure: no Redux, no store types, no imports. Anything that can describe an
// agent structurally can be scored, which is what lets the gallery record
// (AgentDefinitionRecord) and the slim chat record (AgentRecord) share it.
//
// Adding a field? Add it here and it lights up on every surface at once.
// Never fork this function.

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

  return score;
}

/** True when the agent matches the query at all. */
export function agentMatchesSearch(
  agent: AgentSearchable,
  query: string,
): boolean {
  return computeAgentSearchScore(agent, query) > 0;
}
