// features/spaces/editor/slash-rank.ts — which "/" results show, best match first (Notion's ranking).
//
// BlockNote's filter keeps every item whose title or an alias contains the query, in the order the
// menu lists them, so "/data" put "Table view" (alias "database", listed first) above
// "Database - Inline" and Enter inserted it (round 27, D4). Notion ranks by how well the item's NAME
// matches: the name starting with the query, then a word of it, then anywhere, and only then an alias.
// Groups stay together (one heading each); a group is placed by its best item.

export interface RankedItem {
  title: string;
  aliases?: readonly string[];
  group?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const words = (s: string) => norm(s).split(/[\s\-–—/()]+/).filter(Boolean);

/** 0 best … 4 weakest; null = no match. */
export function slashScore(item: RankedItem, query: string): number | null {
  const q = norm(query);
  if (!q) return 0;
  const title = norm(item.title);
  if (title.startsWith(q)) return 0;
  if (words(item.title).some((w) => w.startsWith(q))) return 1;
  if (title.includes(q)) return 2;
  const aliases = (item.aliases ?? []).map(norm);
  if (aliases.some((a) => a.startsWith(q))) return 3;
  if (aliases.some((a) => a.includes(q))) return 4;
  return null;
}

export function rankSlashItems<T extends RankedItem>(items: readonly T[], query: string): T[] {
  if (!norm(query)) return [...items];
  const scored = items
    .map((item, index) => ({ item, index, score: slashScore(item, query) }))
    .filter((x): x is { item: T; index: number; score: number } => x.score !== null);
  const groupBest = new Map<string, { score: number; index: number }>();
  for (const x of scored) {
    const g = x.item.group ?? "";
    const best = groupBest.get(g);
    if (!best || x.score < best.score || (x.score === best.score && x.index < best.index)) groupBest.set(g, { score: x.score, index: x.index });
  }
  return scored
    .sort((a, b) => {
      const ga = groupBest.get(a.item.group ?? "")!;
      const gb = groupBest.get(b.item.group ?? "")!;
      if (a.item.group !== b.item.group) return ga.score - gb.score || ga.index - gb.index;
      return a.score - b.score || a.index - b.index;
    })
    .map((x) => x.item);
}
