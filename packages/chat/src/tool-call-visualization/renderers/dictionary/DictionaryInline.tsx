"use client";

import { useMemo } from "react";
import { BookText, Maximize2 } from "lucide-react";
import type { ToolRendererProps } from "../../types";
import { parseDictionary } from "./parseDictionary";
import { DictEntryList } from "./DictEntryList";
import { EntityCard, type EntityAction } from "../_shared-entity/EntityCard";

/**
 * Inline renderer for the `dictionary` tool — a polished entity card listing the
 * terminology/pronunciation entries (the result payload). "Expand" opens the
 * overlay with the full set. No window/route (the dictionary has no per-scope
 * user route yet).
 */
const MAX_INLINE = 8;

export function DictionaryInline({ entry, onOpenOverlay , expanded, onToggleExpanded }: ToolRendererProps) {
  const { entries, level } = useMemo(() => parseDictionary(entry), [entry]);
  if (!entries.length) return null;

  const shown = entries.slice(0, MAX_INLINE);
  const hasMore = entries.length > shown.length;

  const actions: EntityAction[] = [];
  if (onOpenOverlay)
    actions.push({
      label: hasMore ? `View all ${entries.length} terms` : "Expand",
      icon: Maximize2,
      onSelect: () => onOpenOverlay(),
    });

  const subtitle = `${entries.length} ${entries.length === 1 ? "term" : "terms"}${
    level ? ` · ${level.replace(/_/g, " ")} dictionary` : ""
  }`;

  return (
    <EntityCard
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
      icon={BookText}
      accent="amber"
      title="Dictionary"
      subtitle={subtitle}
      actions={actions}
    >
      <DictEntryList entries={shown} />
    </EntityCard>
  );
}
