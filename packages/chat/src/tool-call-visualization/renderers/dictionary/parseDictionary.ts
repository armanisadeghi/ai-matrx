import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { resultAsObject, getArg } from "../_shared";

/**
 * Parse the `dictionary` tool result: `{ entries: [{ term, sounds_like,
 * pronunciation, ipa, definition, category, ... }] }`. The entries are the
 * payload — no fetch needed.
 */
export interface ParsedDictEntry {
  term: string;
  pronunciation: string | null;
  ipa: string | null;
  definition: string | null;
  category: string | null;
  soundsLike: string[];
}

export interface ParsedDictionary {
  entries: ParsedDictEntry[];
  level: string | null;
}

const asStr = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null;

export function parseDictionary(entry: ToolLifecycleEntry): ParsedDictionary {
  const r = resultAsObject(entry) ?? {};
  const raw = Array.isArray(r.entries) ? r.entries : [];
  const entries: ParsedDictEntry[] = raw
    .map((e) => {
      const o = (e ?? {}) as Record<string, unknown>;
      return {
        term: asStr(o.term) ?? "",
        pronunciation: asStr(o.pronunciation),
        ipa: asStr(o.ipa),
        definition: asStr(o.definition),
        category: asStr(o.category),
        soundsLike: Array.isArray(o.sounds_like)
          ? (o.sounds_like.filter((x) => typeof x === "string") as string[])
          : [],
      };
    })
    .filter((e) => e.term);

  return {
    entries,
    level: asStr(r.level) ?? asStr(getArg<string>(entry, "level")),
  };
}
