"use client";

import type { ParsedDictEntry } from "./parseDictionary";

/**
 * Shared read-only list of dictionary entries — term · pronunciation ·
 * definition · category · sounds-like. Used by the dictionary tool inline and
 * overlay.
 */
export function DictEntryList({ entries }: { entries: ParsedDictEntry[] }) {
  return (
    <div className="divide-y divide-border rounded-lg border border-border bg-card">
      {entries.map((e, i) => (
        <div key={i} className="px-3 py-2">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-foreground">{e.term}</span>
            {e.pronunciation ? (
              <span className="text-xs text-muted-foreground">
                /{e.pronunciation}/
              </span>
            ) : e.ipa ? (
              <span className="text-xs text-muted-foreground">{e.ipa}</span>
            ) : null}
            {e.category ? (
              <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {e.category}
              </span>
            ) : null}
          </div>
          {e.definition ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {e.definition}
            </p>
          ) : null}
          {e.soundsLike.length ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Sounds like: {e.soundsLike.join(", ")}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
