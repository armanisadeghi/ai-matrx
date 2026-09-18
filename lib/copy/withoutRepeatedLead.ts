/**
 * THE SCREEN SAYS A THING ONCE.
 *
 * A label written in our code and the sentence under it written by a model (or
 * by a service that deploys on another clock) keep colliding — the label says
 * the words, and then the sentence says them again. Two live examples from the
 * 2026-09-16 Jobs-bar walk:
 *
 *   Encore run page      "No bench proof yet"
 *                        "No bench proof yet. Proof is a five-arm Bench run…"
 *
 *   Vision Interview     "Still missing: Still missing the complete list of all
 *                         intake tags and their destinations…"
 *
 * Neither is fixable by editing one side alone: the second half of each comes
 * from outside this repo. So the RENDERER drops a leading repeat of its own
 * label, and leaves every other sentence exactly as it was written — this never
 * paraphrases, shortens or rewrites what the other side said.
 */
export function withoutRepeatedLead(text: string, lead: string): string {
  const body = text.trimStart();
  const head = lead.trim().replace(/[:.\s]+$/, "");
  if (!head || !body.toLowerCase().startsWith(head.toLowerCase())) return text;
  const rest = body.slice(head.length).replace(/^[.:;,\s—–-]+/, "");
  return rest || text;
}
