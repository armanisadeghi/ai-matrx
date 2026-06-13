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
  type DictPronunciation,
  type ResolvedDictEntry,
  type ResolvedDictionary,
} from "@/features/dictionary/types";

const byTerm = (a: ResolvedDictEntry, b: ResolvedDictEntry) =>
  a.term.toLowerCase().localeCompare(b.term.toLowerCase());

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

/** The full consumption bundle for a resolved dictionary. */
export function buildConsumption(resolved: ResolvedDictionary): DictConsumption {
  return {
    resolved,
    sttPrompt: buildSttPrompt(resolved),
    ttsAliases: buildTtsAliases(resolved),
    contextBlock: buildContextBlock(resolved),
  };
}

/** Effective inline ceiling: null setting → the 200-char default. */
export function effectiveInlineChars(resolved: ResolvedDictionary): number {
  return resolved.effective_max_inline_chars ?? DICT_DEFAULT_INLINE_CHARS;
}
