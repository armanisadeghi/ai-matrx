// features/dictionary/utils/format.ts
//
// Deterministic renderers that turn a ResolvedDictionary into the three shapes
// the consuming surfaces need. Determinism (stable sort, stable joins) matters:
// the context block becomes part of the LLM prompt-cache prefix, so identical
// data MUST produce byte-identical output across turns.

import {
  DICT_DEFAULT_INLINE_CHARS,
  DICT_STT_PROMPT_CHAR_CAP,
  type DictConsumption,
  type DictEntryDraft,
  type DictPronunciation,
  type ResolvedDictEntry,
  type ResolvedDictionary,
} from "@/features/dictionary/types";

const byTerm = (a: ResolvedDictEntry, b: ResolvedDictEntry) =>
  a.term.toLowerCase().localeCompare(b.term.toLowerCase());

/**
 * Map per-task drafts into the resolved-entry shape so the renderers below can
 * treat persistent + per-task uniformly. Tagged `source_level: "custom"` so a
 * surface can badge them as "this task". Blank terms are dropped.
 */
function customDraftsToResolved(drafts: DictEntryDraft[]): ResolvedDictEntry[] {
  return drafts
    .filter((d) => (d.term ?? "").trim().length > 0)
    .map((d, i) => ({
      id: d.id ?? `custom:${i}`,
      term: d.term.trim(),
      sounds_like: (d.sounds_like ?? []).filter((s) => s.trim().length > 0),
      pronunciation: d.pronunciation ?? null,
      ipa: d.ipa ?? null,
      definition: d.definition ?? null,
      category: d.category ?? null,
      source_level: "custom",
      source_name: "This task",
    }));
}

/**
 * Whisper `prompt` biasing string. Groq keeps the FINAL ~224 tokens, so the
 * most useful spellings go LAST and we cap total length conservatively. We feed
 * canonical terms (and their aliases as additional surface forms) so the model
 * is primed to emit the correct spelling.
 */
export function buildSttPrompt(resolved: ResolvedDictionary): string {
  const terms: string[] = [];
  for (const e of [...resolved.entries].sort(byTerm)) {
    terms.push(e.term);
  }
  if (terms.length === 0) return "";
  // De-dupe case-insensitively, preserve order.
  const seen = new Set<string>();
  const unique = terms.filter((t) => {
    const k = t.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  let prompt = `Key terms: ${unique.join(", ")}.`;
  if (prompt.length > DICT_STT_PROMPT_CHAR_CAP) {
    // Keep the TAIL — Whisper weights the final tokens most.
    prompt = prompt.slice(prompt.length - DICT_STT_PROMPT_CHAR_CAP);
  }
  return prompt;
}

/**
 * TTS substitution pairs. Each entry contributes its canonical term and every
 * sounds_like alias, all mapped to the spoken form (pronunciation respelling,
 * falling back to the term itself when only an alias→term fix is wanted).
 * Sorted longest-first so multi-word terms substitute before their substrings.
 */
export function buildTtsAliases(resolved: ResolvedDictionary): DictPronunciation[] {
  const pairs: DictPronunciation[] = [];
  for (const e of resolved.entries) {
    const spoken = e.pronunciation?.trim();
    if (spoken) {
      // canonical term → spoken form
      pairs.push({ from: e.term, to: spoken });
      // aliases (mishearings) → spoken form
      for (const alias of e.sounds_like) {
        if (alias.trim()) pairs.push({ from: alias, to: spoken });
      }
    } else if (e.sounds_like.length > 0) {
      // no respelling, but normalise mishearings to the canonical spelling
      for (const alias of e.sounds_like) {
        if (alias.trim()) pairs.push({ from: alias, to: e.term });
      }
    }
  }
  // De-dupe by `from` (case-insensitive), keep first; longest-first.
  const seen = new Set<string>();
  return pairs
    .filter((p) => {
      const k = p.from.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => b.from.length - a.from.length || a.from.localeCompare(b.from));
}

/**
 * Markdown block for LLM context injection (cleanup agents, etc.). Sorted by
 * term for cache stability. One line per entry, compact.
 */
export function buildContextBlock(resolved: ResolvedDictionary): string {
  if (resolved.entries.length === 0) return "";
  const lines = [...resolved.entries].sort(byTerm).map((e) => {
    const parts: string[] = [`- **${e.term}**`];
    if (e.pronunciation) parts.push(`pronounced "${e.pronunciation}"`);
    if (e.ipa) parts.push(`/${e.ipa}/`);
    if (e.sounds_like.length > 0) parts.push(`often misheard as: ${e.sounds_like.join(", ")}`);
    if (e.definition) parts.push(`— ${e.definition}`);
    return parts.join(" · ");
  });
  return `Custom dictionary (preferred spellings & pronunciations):\n${lines.join("\n")}`;
}

/**
 * Merge the server-resolved persistent dictionary with per-task custom entries.
 * Custom entries go FIRST and win on term collision (case-insensitive) — a
 * task-specific respelling overrides the saved one. Returns a ResolvedDictionary
 * the renderers can treat uniformly.
 */
function mergeWithCustom(
  resolved: ResolvedDictionary,
  customEntries: DictEntryDraft[],
): ResolvedDictionary {
  const custom = customDraftsToResolved(customEntries);
  if (custom.length === 0) return resolved;
  const seen = new Set<string>();
  const entries: ResolvedDictEntry[] = [];
  for (const e of [...custom, ...resolved.entries]) {
    const k = e.term.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    entries.push(e);
  }
  return { ...resolved, entries };
}

/**
 * The full consumption bundle for a resolved dictionary, with optional per-task
 * custom entries folded into every output. The custom set is also surfaced
 * verbatim so a TTS request can send it as `dictionary.custom_entries`.
 */
export function buildConsumption(
  resolved: ResolvedDictionary,
  customEntries: DictEntryDraft[] = [],
): DictConsumption {
  const merged = mergeWithCustom(resolved, customEntries);
  return {
    // `resolved` stays persistent-only so a payload can keep `entries`
    // (persistent) and `custom_entries` (per-task) separate. The per-task set is
    // folded only into the DERIVED outputs below.
    resolved,
    sttPrompt: buildSttPrompt(merged),
    ttsAliases: buildTtsAliases(merged),
    contextBlock: buildContextBlock(merged),
    customEntries,
  };
}

/** Effective inline ceiling: null setting → the 200-char default. */
export function effectiveInlineChars(resolved: ResolvedDictionary): number {
  return resolved.effective_max_inline_chars ?? DICT_DEFAULT_INLINE_CHARS;
}
