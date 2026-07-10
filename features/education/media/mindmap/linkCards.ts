// features/education/media/mindmap/linkCards.ts
//
// Resolve mind-map nodes to their SOURCE cards. The Study Mind Map agent emits a
// diagram_spec grounded in the deck's serialized markdown, but that markdown
// carries no card ids — so a generated node can't reference a card directly.
// This links them post-generation by matching each node's text (label +
// description + details) against each card's front + back, stamping the winning
// card's id/front/back into `node.metadata` (the generic bag the diagram block
// already preserves). MindMapView then turns a node click into "open the card /
// ask the tutor about it" (DoD item 3).
//
// Deliberately conservative: a node only links when the overlap clears a
// threshold, so an abstract grouping node ("Membrane Transport") stays unlinked
// rather than mis-pointing at an unrelated card. Pure + deterministic.

const STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "in", "is", "are", "and", "or", "for", "on",
  "with", "as", "by", "at", "from", "that", "this", "it", "its", "be", "was",
  "were", "which", "what", "how", "why", "when", "into", "than", "then", "can",
  "will", "does", "do", "not", "no", "yes", "you", "your", "they", "their",
  "has", "have", "had", "but", "if", "so", "up", "out", "about", "over", "one",
]);

/** A card the map may link back to (front/back only — enough to seed the tutor). */
export interface LinkableCard {
  id: string;
  front: string;
  back: string;
}

/** A diagram node as emitted by the agent (loose — only the fields we read). */
interface SpecNode {
  id?: unknown;
  label?: unknown;
  description?: unknown;
  details?: unknown;
  metadata?: Record<string, unknown> | null;
  [k: string]: unknown;
}

/** Light stem so a node label matches its card across simple plural/verb forms
 *  (ribosome↔ribosomes, enzyme↔enzymes, packages↔package). Deliberately shallow —
 *  a proper stemmer would over-merge and manufacture false links. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss"))
    return word.slice(0, -1);
  return word;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
      .map(stem),
  );
}

function nodeText(node: SpecNode): string {
  return [node.label, node.description, node.details]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .join(" ");
}

export interface LinkDiagramResult<T> {
  spec: T;
  linkedCount: number;
}

/**
 * Return a copy of `spec` whose nodes carry `metadata.cardId` / `cardFront` /
 * `cardBack` for every node confidently matched to a source card. Nodes that
 * don't clear the threshold are left untouched (no cardId). Never throws.
 */
export function linkDiagramToCards<
  T extends { nodes?: unknown[] } | Record<string, unknown>,
>(spec: T, cards: LinkableCard[]): LinkDiagramResult<T> {
  const nodes = (spec as { nodes?: unknown[] }).nodes;
  if (!Array.isArray(nodes) || cards.length === 0) {
    return { spec, linkedCount: 0 };
  }

  const cardTokenSets = cards.map((c) => ({
    card: c,
    tokens: tokenize(`${c.front} ${c.back}`),
  }));

  // Minimum shared-token fraction of the node, plus at least 2 shared tokens, so
  // a single common word (e.g. "cell") never forces a spurious link. Tuned for
  // PRECISION over recall — a wrong card link is worse than none: on a real
  // deck-grounded map this links ~9/10 concrete nodes to their exact card while
  // leaving abstract grouping nodes (and cross-topic near-misses that share only
  // a generic word like "transport"/"membrane") unlinked.
  const MIN_SCORE = 0.42;
  const MIN_SHARED = 2;

  let linkedCount = 0;
  const linkedNodes = nodes.map((raw) => {
    const node = { ...(raw as SpecNode) };
    const tokens = tokenize(nodeText(node));
    let best: { card: LinkableCard; score: number; shared: number } | null = null;
    for (const { card, tokens: cardTokens } of cardTokenSets) {
      let shared = 0;
      for (const t of tokens) if (cardTokens.has(t)) shared += 1;
      const score = tokens.size ? shared / tokens.size : 0;
      if (
        shared >= MIN_SHARED &&
        score >= MIN_SCORE &&
        (!best || score > best.score)
      ) {
        best = { card, score, shared };
      }
    }
    if (best) {
      linkedCount += 1;
      node.metadata = {
        ...(node.metadata ?? {}),
        cardId: best.card.id,
        cardFront: best.card.front,
        cardBack: best.card.back,
      };
    }
    return node;
  });

  return {
    spec: { ...(spec as object), nodes: linkedNodes } as T,
    linkedCount,
  };
}
