"use client";

import type { ParsedDictEntry } from "./parseDictionary";
import { PartPeekPopover } from "../_shared-entity/PartPeekPopover";

/**
 * Shared read-only list of dictionary entries — term · pronunciation ·
 * definition · category · sounds-like. Hovering a row opens a delicate peek
 * with the FULL (untruncated) detail — a "known internal part" placeholder.
 */
function hasDetail(e: ParsedDictEntry): boolean {
  return Boolean(e.definition || e.soundsLike.length || e.ipa || e.pronunciation);
}

function DictPeekBody({ e }: { e: ParsedDictEntry }) {
  return (
    <div className="space-y-1.5">
      {e.pronunciation || e.ipa ? (
        <div className="font-mono text-muted-foreground">
          {e.pronunciation ? `/${e.pronunciation}/` : ""}
          {e.ipa ? `  ${e.ipa}` : ""}
        </div>
      ) : null}
      {e.definition ? <div className="text-foreground">{e.definition}</div> : null}
      {e.soundsLike.length ? (
        <div className="text-muted-foreground">
          <span className="font-medium text-foreground">Sounds like:</span>{" "}
          {e.soundsLike.join(", ")}
        </div>
      ) : null}
      {e.category ? (
        <div className="text-muted-foreground">
          <span className="font-medium text-foreground">Category:</span>{" "}
          {e.category}
        </div>
      ) : null}
    </div>
  );
}

export function DictEntryList({ entries }: { entries: ParsedDictEntry[] }) {
  return (
    <div className="divide-y divide-border">
      {entries.map((e, i) => {
        const row = (
          <div className="px-3 py-2 transition-colors hover:bg-muted/40">
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
        );
        return hasDetail(e) ? (
          <PartPeekPopover key={i} header={e.term} body={<DictPeekBody e={e} />}>
            {row}
          </PartPeekPopover>
        ) : (
          <div key={i}>{row}</div>
        );
      })}
    </div>
  );
}
