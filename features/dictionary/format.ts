// features/dictionary/format.ts
//
// Shared HUMAN summaries + agent-payload projections for the Custom Dictionary
// surfaces (agent-copy rollout). One definition per shape, reused by the entry
// row, the entries list, the owner-tier rows, and the resolved-context card —
// never duplicated at a callsite.
//
// Distinct from `utils/format.ts`, which renders a ResolvedDictionary into the
// deterministic TTS/LLM consumption shapes. That file feeds MODELS; this one
// feeds the CLIPBOARD. Keep them separate — the consumption renderers are
// prompt-cache-prefix sensitive and must not grow UI concerns.

import { humanLines } from "@/features/marketing/lib/copy-payloads";
import { DICT_LEVEL_LABELS } from "@/features/dictionary/constants";
import type {
  DictEntry,
  DictLevel,
  DictOwner,
  ResolvedDictEntry,
  ResolvedDictionary,
} from "@/features/dictionary/types";

/** Route + surface string stamped into every dictionary payload's envelope. */
export function dictLocation(surface: string): string {
  return `AI Matrx — Custom Dictionary — ${surface}`;
}

/** "Personal" / "Organization" / … for a level, with the per-task fallback. */
export function dictLevelLabel(level: DictLevel | "custom"): string {
  return DICT_LEVEL_LABELS[level] ?? level;
}

// ── One entry ───────────────────────────────────────────────────────────────

/**
 * Human-readable summary of a single dictionary entry — exactly the fields the
 * row renders (term, mishearings, pronunciation/IPA, category), plus the
 * definition and the active flag, which the row shows as styling rather than
 * text and which an agent otherwise cannot see.
 */
export function dictEntrySummary(entry: DictEntry | ResolvedDictEntry): string {
  return humanLines([
    ["Term", entry.term],
    ["Pronunciation", entry.pronunciation],
    ["IPA", entry.ipa ? `/${entry.ipa}/` : null],
    ["Sounds like", entry.sounds_like.join(", ")],
    ["Category", entry.category],
    ["Definition", entry.definition],
    [
      "Status",
      "is_active" in entry ? (entry.is_active ? "Active" : "Inactive") : null,
    ],
    [
      "From",
      "source_name" in entry
        ? `${entry.source_name} (${dictLevelLabel(entry.source_level)})`
        : null,
    ],
  ]);
}

/** Agent projection of one entry — the rendered fields, nothing invented. */
export function dictEntryData(entry: DictEntry | ResolvedDictEntry) {
  return {
    id: entry.id,
    term: entry.term,
    sounds_like: entry.sounds_like,
    pronunciation: entry.pronunciation,
    ipa: entry.ipa,
    definition: entry.definition,
    category: entry.category,
    is_active: "is_active" in entry ? entry.is_active : undefined,
    source_level: "source_level" in entry ? entry.source_level : undefined,
    source_name: "source_name" in entry ? entry.source_name : undefined,
  };
}

/** Compact per-entry projection for shortened list variants. */
export function dictEntryKeyFields(entry: DictEntry | ResolvedDictEntry) {
  return {
    term: entry.term,
    pronunciation: entry.pronunciation ?? (entry.ipa ? `/${entry.ipa}/` : null),
    sounds_like: entry.sounds_like,
    category: entry.category,
  };
}

// ── A list of entries ───────────────────────────────────────────────────────

/**
 * Human summary of an entries list. `total` is the unfiltered count so a
 * search-narrowed copy states what it is a slice OF — a list payload that
 * silently reports only the visible rows lies about the dictionary's size.
 */
export function dictEntriesSummary(
  entries: Array<DictEntry | ResolvedDictEntry>,
  ctx: { ownerLabel: string; total?: number; query?: string },
): string {
  const header = humanLines([
    ["Dictionary", ctx.ownerLabel],
    ["Terms shown", entries.length],
    [
      "Terms total",
      ctx.total !== undefined && ctx.total !== entries.length
        ? ctx.total
        : null,
    ],
    ["Search", ctx.query?.trim() || null],
  ]);
  if (entries.length === 0) return `${header}\n\n(no entries)`;
  const body = entries.map((e) => dictEntrySummary(e)).join("\n\n");
  return `${header}\n\n${body}`;
}

/** Rows for CSV export of an entries list (flat, one row per entry). */
export function dictEntriesCsvRows(
  entries: Array<DictEntry | ResolvedDictEntry>,
): Array<Record<string, unknown>> {
  return entries.map((e) => ({
    term: e.term,
    sounds_like: e.sounds_like.join("|"),
    pronunciation: e.pronunciation ?? "",
    ipa: e.ipa ?? "",
    definition: e.definition ?? "",
    category: e.category ?? "",
    is_active: "is_active" in e ? e.is_active : "",
  }));
}

// ── Owner tiers ─────────────────────────────────────────────────────────────

/** Human summary of one owner tier row (the selector's list unit). */
export function dictOwnerSummary(owner: DictOwner): string {
  return humanLines([
    ["Dictionary", owner.name],
    ["Level", dictLevelLabel(owner.level)],
    ["Entries", owner.entry_count],
    [
      "Inline policy",
      owner.max_inline_chars === null
        ? "Inherits default"
        : owner.max_inline_chars === 0
          ? "Never inline"
          : `${owner.max_inline_chars} chars`,
    ],
  ]);
}

export function dictOwnerData(owner: DictOwner) {
  return {
    level: owner.level,
    owner_id: owner.owner_id,
    name: owner.name,
    entry_count: owner.entry_count,
    max_inline_chars: owner.max_inline_chars,
    organization_id: owner.organization_id ?? null,
    scope_type_id: owner.scope_type_id ?? null,
  };
}

// ── Resolved (merged) dictionary ────────────────────────────────────────────

/**
 * Human summary of what a surface's dictionary actually RESOLVED to — the
 * merged set the models will see, grouped by source tier. This is the "what I
 * see" capture for the context card: the user is looking at which dictionaries
 * are in play, not at any single tier's CRUD table.
 */
export function resolvedDictionarySummary(
  resolved: ResolvedDictionary,
  effectiveInlineChars: number,
): string {
  const bySource = new Map<string, ResolvedDictEntry[]>();
  for (const entry of resolved.entries) {
    const key = `${entry.source_name} (${dictLevelLabel(entry.source_level)})`;
    const bucket = bySource.get(key);
    if (bucket) bucket.push(entry);
    else bySource.set(key, [entry]);
  }
  const header = humanLines([
    ["Resolved terms", resolved.entries.length],
    ["Source dictionaries", resolved.source_count],
    ["Inline ceiling", `${effectiveInlineChars} chars`],
  ]);
  if (resolved.entries.length === 0) return `${header}\n\n(no terms resolved)`;
  const groups = [...bySource.entries()]
    .map(
      ([source, list]) =>
        `${source} — ${list.length} term${list.length === 1 ? "" : "s"}\n${list
          .map((e) => `  · ${dictEntrySummary(e).replace(/\n/g, " · ")}`)
          .join("\n")}`,
    )
    .join("\n\n");
  return `${header}\n\n${groups}`;
}
