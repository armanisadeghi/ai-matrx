"use client";

import { useMemo } from "react";
import { BookText } from "lucide-react";
import type { ToolRendererProps } from "../../types";
import { parseDictionary } from "./parseDictionary";
import { DictEntryList } from "./DictEntryList";

/**
 * Overlay renderer for the `dictionary` tool — the full set of terminology
 * entries.
 */
export function DictionaryOverlay({ entry }: ToolRendererProps) {
  const { entries, level } = useMemo(() => parseDictionary(entry), [entry]);

  if (!entries.length) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        No dictionary entries to display
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-muted/30 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
        <BookText className="h-4 w-4 text-primary" />
        <span>
          {entries.length} {entries.length === 1 ? "term" : "terms"}
        </span>
        {level ? (
          <span className="text-xs capitalize text-muted-foreground">
            · {level.replace(/_/g, " ")} dictionary
          </span>
        ) : null}
      </div>
      <DictEntryList entries={entries} />
    </div>
  );
}
