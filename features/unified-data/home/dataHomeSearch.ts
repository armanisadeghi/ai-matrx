// features/unified-data/home/dataHomeSearch.ts — LANE DATA-HOME-3A
//
// INSTANT, RANKED SEARCH OVER THE ROWS ALREADY IN HAND (DATA-HOME-3-SPEC §2.2 layer 1). Zero round
// trips: the home's one door answers every row the person may open, so a keystroke ranks what the
// browser holds. Champions: Linear's quick find (answers on the first keystroke), Notion's
// title-only filter, Gmail/Linear's `key:value` tokens.
//
// Ranking, strongest first: the name (an exact name, then a name that starts with the query, then
// whole words, then prefixes), then the organization's name, the owner, the kind word, the parent
// table, the row's facts. Every query word must match somewhere (AND). Case and accent
// insensitive; a word of 5+ letters tolerates one typo ("harbr" finds "Harbor"). `titleOnly`
// searches the name alone. Ties: the person's own first, then the most recently updated.
//
// Tokens (`kind:form`, `org:harbor`, `owner:me`, `is:starred`, `updated:7d`, `in:title`) are parsed
// out of the box's text; the rest stays free text. The service applies them as filters, and the
// shell turns a finished token into a filter chip (lib/entity-list `searchTokens`).

import type { DataHomeRow } from "./dataHomeRows";
import { ACCESS_WORD, dataHomeKindWord } from "./dataHomeRows";

export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function words(text: string): string[] {
  return normalize(text).split(/[^a-z0-9]+/).filter(Boolean);
}

/** True when `a` and `b` are at most one insertion, deletion or substitution apart. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (la > lb) i += 1;
    else if (lb > la) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

/** One word against one field's words: 1 whole word, 0.8 prefix, 0.5 inside, 0.4 one typo, 0 none. */
function wordQuality(needle: string, haystack: readonly string[], joined: string): number {
  let best = 0;
  for (const word of haystack) {
    if (word === needle) return 1;
    if (word.startsWith(needle)) best = Math.max(best, 0.8);
    else if (needle.length >= 5 && (withinOneEdit(needle, word) || withinOneEdit(needle, word.slice(0, needle.length)))) {
      best = Math.max(best, 0.4);
    }
  }
  if (best === 0 && needle.length >= 3 && joined.includes(needle)) best = 0.5;
  return best;
}

interface Indexed {
  name: string;
  nameWords: string[];
  fields: Array<{ weight: number; words: string[]; joined: string }>;
}

const index = new WeakMap<DataHomeRow, Indexed>();

function indexed(row: DataHomeRow, ownerLabel: (row: DataHomeRow) => string | null): Indexed {
  const hit = index.get(row);
  if (hit) return hit;
  const field = (weight: number, text: string | null | undefined) => {
    const w = words(text ?? "");
    return { weight, words: w, joined: w.join(" ") };
  };
  const name = normalize(row.name).trim();
  const built: Indexed = {
    name,
    nameWords: words(row.name),
    fields: [
      field(100, row.name),
      field(40, row.organizationName),
      field(30, ownerLabel(row)),
      field(25, `${dataHomeKindWord(row.kind)} ${row.access ? ACCESS_WORD[row.access] : ""}`),
      field(20, row.parentName),
      field(10, row.details),
    ],
  };
  index.set(row, built);
  return built;
}

/**
 * The row's relevance for `text`, or null when it does not match. Higher is better.
 * `ownerLabel` names the owner the way the Owner column does ("You").
 */
export function scoreRow(
  row: DataHomeRow,
  text: string,
  options: { titleOnly?: boolean; ownerLabel?: (row: DataHomeRow) => string | null } = {},
): number | null {
  const needles = words(text);
  if (needles.length === 0) return 0;
  const ix = indexed(row, options.ownerLabel ?? (() => null));
  const fields = options.titleOnly ? ix.fields.slice(0, 1) : ix.fields;
  let total = 0;
  for (const needle of needles) {
    let best = 0;
    for (const f of fields) best = Math.max(best, f.weight * wordQuality(needle, f.words, f.joined));
    if (best === 0) return null;
    total += best;
  }
  const phrase = normalize(text).trim();
  if (ix.name === phrase) total += 200;
  else if (ix.name.startsWith(phrase)) total += 80;
  return total;
}

// ── tokens ─────────────────────────────────────────────────────────────────────────────────────

export interface DataHomeTokens {
  kind: string[];
  org: string[];
  owner: string[];
  starred: boolean;
  /** A DATE_FILTER_OPTIONS bucket (`1h`, `24h`, `7d`, `30d`, `90d`, `1y`). */
  updated: string | null;
  titleOnly: boolean;
}

export const UPDATED_BUCKET_MS: Record<string, number> = {
  "1h": 3_600_000,
  "24h": 86_400_000,
  "1d": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  "90d": 90 * 86_400_000,
  "1y": 365 * 86_400_000,
};

const TOKEN = /(^|\s)(kind|org|owner|is|updated|in):("[^"]*"|\S+)/gi;

/** Pull the tokens out of the box's text. `text` is what is left to search for. */
export function parseTokens(search: string): { text: string; tokens: DataHomeTokens } {
  const tokens: DataHomeTokens = { kind: [], org: [], owner: [], starred: false, updated: null, titleOnly: false };
  const text = search.replace(TOKEN, (whole, lead: string, key: string, raw: string) => {
    const value = raw.replace(/^"|"$/g, "").trim();
    const k = key.toLowerCase();
    const v = normalize(value);
    if (!v) return whole;
    if (k === "kind") tokens.kind.push(v);
    else if (k === "org") tokens.org.push(v);
    else if (k === "owner") tokens.owner.push(v);
    else if (k === "is" && v === "starred") tokens.starred = true;
    else if (k === "updated" && UPDATED_BUCKET_MS[v]) tokens.updated = v === "1d" ? "24h" : v;
    else if (k === "in" && v === "title") tokens.titleOnly = true;
    else return whole;
    return lead;
  });
  return { text: text.replace(/\s+/g, " ").trim(), tokens };
}

/** Does `row` pass the tokens? `starred` tells whether the person starred it. */
export function matchesTokens(
  row: DataHomeRow,
  tokens: DataHomeTokens,
  starred: boolean,
  ownerLabel: (row: DataHomeRow) => string | null,
  now: number,
): boolean {
  if (tokens.starred && !starred) return false;
  if (tokens.kind.length > 0) {
    const kindWords = [normalize(row.kind), normalize(dataHomeKindWord(row.kind))];
    if (!tokens.kind.some((k) => kindWords.some((w) => w === k || w.startsWith(k)))) return false;
  }
  if (tokens.org.length > 0) {
    const org = normalize(row.organizationName ?? "");
    if (!tokens.org.every((o) => org.includes(o))) return false;
  }
  if (tokens.owner.length > 0) {
    const owner = normalize(ownerLabel(row) ?? "");
    if (!tokens.owner.every((o) => (o === "me" ? row.mine : owner.includes(o)))) return false;
  }
  if (tokens.updated) {
    const at = row.updatedAt ? Date.parse(row.updatedAt) : Number.NaN;
    if (!Number.isFinite(at) || now - at > (UPDATED_BUCKET_MS[tokens.updated] ?? 0)) return false;
  }
  return true;
}
