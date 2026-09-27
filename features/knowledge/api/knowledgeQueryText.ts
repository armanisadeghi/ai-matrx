/**
 * features/knowledge/api/knowledgeQueryText.ts — words ⇄ the one query.
 *
 * The search box (hub and ⌘K) turns operators into visible, removable CHIPS
 * over one `KnowledgeQuery` (Linear: an @-mention or a prefix becomes a filter;
 * study P3). Whatever is not an operator stays `text`. Pure — no React, no
 * network — so the hub, the command bar and tests share it.
 *
 * Operators:
 *   type:note | type:chat | type:source …   → types (aliases below; any other
 *                                              registry token passes through)
 *   type:pdf | type:web | type:transcript   → source_kinds
 *   kind:web_page | kind:transcript …       → source_kinds
 *   from:extension | from:agent …           → origin
 *   in:inbox | in:kept | in:archived        → state
 *   by:me | by:anyone                       → captured_by
 *   sort:recent | sort:title | sort:relevance
 *   @Ava  @"Client Ava"                     → entities (people, places, orgs)
 *   #grant-2026  #"two words"               → within a tag (resolved by name)
 *   today · yesterday · this week · last week · last 7 days · last 30 days ·
 *   last month · this year                  → date (relative)
 */

import type {
  EntityRef,
  KnowledgeDateFilter,
  KnowledgeQuery,
  KnowledgeSort,
  TriageState,
} from "./knowledgeSearch";

export type QueryChip =
  | { kind: "type"; value: string }
  | { kind: "source_kind"; value: string }
  | { kind: "origin"; value: string }
  | { kind: "within"; ref: EntityRef }
  | { kind: "entity"; value: string }
  | { kind: "captured_by"; value: "me" | "anyone" }
  | { kind: "state"; value: TriageState }
  | { kind: "date"; value: KnowledgeDateFilter }
  | { kind: "sort"; value: KnowledgeSort };

/** `type:` words a person types → registry tokens (or a Source kind). */
const TYPE_ALIASES: Record<string, QueryChip> = {
  source: { kind: "type", value: "processed_document" },
  sources: { kind: "type", value: "processed_document" },
  doc: { kind: "type", value: "processed_document" },
  docs: { kind: "type", value: "processed_document" },
  pdf: { kind: "source_kind", value: "cld_file" },
  chat: { kind: "type", value: "conversation" },
  chats: { kind: "type", value: "conversation" },
  conversation: { kind: "type", value: "conversation" },
  note: { kind: "type", value: "note" },
  notes: { kind: "type", value: "note" },
  task: { kind: "type", value: "task" },
  tasks: { kind: "type", value: "task" },
  project: { kind: "type", value: "project" },
  projects: { kind: "type", value: "project" },
  file: { kind: "type", value: "file" },
  files: { kind: "type", value: "file" },
  agent: { kind: "type", value: "agent" },
  agents: { kind: "type", value: "agent" },
  workflow: { kind: "type", value: "workflow" },
  workflows: { kind: "type", value: "workflow" },
  scope: { kind: "type", value: "scope" },
  scopes: { kind: "type", value: "scope" },
  web: { kind: "source_kind", value: "web_page" },
  page: { kind: "source_kind", value: "web_page" },
  transcript: { kind: "source_kind", value: "transcript" },
  transcripts: { kind: "source_kind", value: "transcript" },
};

const DATE_PHRASES: Array<[RegExp, string]> = [
  [/\blast\s+7\s+days\b/i, "last_7_days"],
  [/\blast\s+30\s+days\b/i, "last_30_days"],
  [/\blast\s+week\b/i, "last_week"],
  [/\bthis\s+week\b/i, "this_week"],
  [/\blast\s+month\b/i, "last_month"],
  [/\bthis\s+month\b/i, "this_month"],
  [/\bthis\s+year\b/i, "this_year"],
  [/\byesterday\b/i, "yesterday"],
  [/\btoday\b/i, "today"],
];

export const RELATIVE_DATE_LABEL: Record<string, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This week",
  last_week: "Last week",
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  this_month: "This month",
  last_month: "Last month",
  this_year: "This year",
};

const STATES: readonly TriageState[] = ["inbox", "kept", "archived"];
const SORTS: readonly KnowledgeSort[] = ["relevance", "recent", "title"];

/** Split into tokens, keeping `@"two words"` / `#"two words"` together. */
function tokenize(raw: string): string[] {
  const out: string[] = [];
  const re = /([@#]"[^"]*"|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) out.push(m[1]);
  return out;
}

function unquote(s: string): string {
  return s.startsWith('"') && s.endsWith('"') && s.length >= 2
    ? s.slice(1, -1)
    : s;
}

/** Words → `{ text, chips }`. Never throws; an unknown operator stays text. */
export function parseQueryText(raw: string): {
  text: string;
  chips: QueryChip[];
} {
  const chips: QueryChip[] = [];
  let rest = raw;
  for (const [re, relative] of DATE_PHRASES) {
    if (re.test(rest)) {
      chips.push({ kind: "date", value: { field: "updated", relative } });
      rest = rest.replace(re, " ");
      break;
    }
  }
  const words: string[] = [];
  for (const tok of tokenize(rest)) {
    if (tok.length > 1 && tok.startsWith("@")) {
      const v = unquote(tok.slice(1)).trim();
      if (v) chips.push({ kind: "entity", value: v });
      continue;
    }
    if (tok.length > 1 && tok.startsWith("#")) {
      const v = unquote(tok.slice(1)).trim();
      if (v) chips.push({ kind: "within", ref: { type: "tag", name: v } });
      continue;
    }
    const colon = tok.indexOf(":");
    if (colon > 0 && colon < tok.length - 1) {
      const op = tok.slice(0, colon).toLowerCase();
      const val = tok.slice(colon + 1);
      const lower = val.toLowerCase();
      if (op === "type") {
        chips.push(TYPE_ALIASES[lower] ?? { kind: "type", value: lower });
        continue;
      }
      if (op === "kind") {
        chips.push({ kind: "source_kind", value: lower });
        continue;
      }
      if (op === "from") {
        chips.push({ kind: "origin", value: lower });
        continue;
      }
      if (op === "in" && (STATES as readonly string[]).includes(lower)) {
        chips.push({ kind: "state", value: lower as TriageState });
        continue;
      }
      if (op === "by" && (lower === "me" || lower === "anyone")) {
        chips.push({ kind: "captured_by", value: lower });
        continue;
      }
      if (op === "sort" && (SORTS as readonly string[]).includes(lower)) {
        chips.push({ kind: "sort", value: lower as KnowledgeSort });
        continue;
      }
    }
    words.push(tok);
  }
  return { text: words.join(" ").trim(), chips };
}

function addUnique<T>(
  list: T[] | undefined,
  v: T,
  eq: (a: T, b: T) => boolean = (a, b) => a === b,
): T[] {
  const base = list ?? [];
  return base.some((x) => eq(x, v)) ? base : [...base, v];
}

export function sameRef(a: EntityRef, b: EntityRef): boolean {
  return (
    a.type === b.type &&
    (a.id ?? "") === (b.id ?? "") &&
    (a.name ?? "") === (b.name ?? "")
  );
}

/** Merge chips into a query (dedupes; a date or sort chip replaces the old one). */
export function applyChips(
  query: KnowledgeQuery,
  chips: QueryChip[],
): KnowledgeQuery {
  let q: KnowledgeQuery = { ...query };
  for (const c of chips) {
    switch (c.kind) {
      case "type":
        q = { ...q, types: addUnique(q.types, c.value) };
        break;
      case "source_kind":
        q = { ...q, source_kinds: addUnique(q.source_kinds, c.value) };
        break;
      case "origin":
        q = { ...q, origin: addUnique(q.origin, c.value) };
        break;
      case "within":
        q = { ...q, within: addUnique(q.within, c.ref, sameRef) };
        break;
      case "entity":
        q = { ...q, entities: addUnique(q.entities, c.value) };
        break;
      case "captured_by":
        q = { ...q, captured_by: c.value };
        break;
      case "state":
        q = { ...q, state: addUnique(q.state, c.value) };
        break;
      case "date":
        q = { ...q, date: c.value };
        break;
      case "sort":
        q = { ...q, sort: c.value };
        break;
    }
  }
  return q;
}

/** The query's filters as chips — what the box shows under the text. */
export function chipsFromQuery(q: KnowledgeQuery): QueryChip[] {
  const out: QueryChip[] = [];
  for (const v of q.types ?? []) out.push({ kind: "type", value: v });
  for (const v of q.source_kinds ?? [])
    out.push({ kind: "source_kind", value: v });
  for (const v of q.origin ?? []) out.push({ kind: "origin", value: v });
  for (const r of q.within ?? []) out.push({ kind: "within", ref: r });
  for (const v of q.entities ?? []) out.push({ kind: "entity", value: v });
  if (q.captured_by === "me" || q.captured_by === "anyone")
    out.push({ kind: "captured_by", value: q.captured_by });
  for (const v of q.state ?? []) out.push({ kind: "state", value: v });
  if (q.date) out.push({ kind: "date", value: q.date });
  if (q.sort && q.sort !== "relevance")
    out.push({ kind: "sort", value: q.sort });
  return out;
}

function without<T>(
  list: T[] | undefined,
  pred: (v: T) => boolean,
): T[] | undefined {
  const next = (list ?? []).filter((v) => !pred(v));
  return next.length ? next : undefined;
}

/** Remove one chip's filter from the query. */
export function removeChip(q: KnowledgeQuery, c: QueryChip): KnowledgeQuery {
  switch (c.kind) {
    case "type":
      return { ...q, types: without(q.types, (v) => v === c.value) };
    case "source_kind":
      return {
        ...q,
        source_kinds: without(q.source_kinds, (v) => v === c.value),
      };
    case "origin":
      return { ...q, origin: without(q.origin, (v) => v === c.value) };
    case "within":
      return { ...q, within: without(q.within, (r) => sameRef(r, c.ref)) };
    case "entity":
      return { ...q, entities: without(q.entities, (v) => v === c.value) };
    case "captured_by":
      return { ...q, captured_by: undefined };
    case "state":
      return { ...q, state: without(q.state, (v) => v === c.value) };
    case "date":
      return { ...q, date: undefined };
    case "sort":
      return { ...q, sort: undefined };
  }
}

export function chipKey(c: QueryChip): string {
  switch (c.kind) {
    case "within":
      return `within:${c.ref.type}:${c.ref.id ?? ""}:${c.ref.name ?? ""}`;
    case "date":
      return `date:${c.value.field}:${c.value.relative ?? ""}:${c.value.from ?? ""}:${c.value.to ?? ""}`;
    default:
      return `${c.kind}:${c.value}`;
  }
}
