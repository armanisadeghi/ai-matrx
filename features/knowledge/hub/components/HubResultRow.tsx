"use client";

/**
 * One result, in the three shapes the hub draws it: a dense ROW (list and
 * search sections), a CARD (board and gallery). Selection checkbox, kind icon,
 * title, the passage or snippet, then kind · origin · where it is filed · when.
 */

import { Checkbox } from "@ai-matrx/design-system";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import { cn } from "@/utils/cn";
import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";
import {
  hitKey,
  kindIcon,
  kindLabel,
  originLabel,
} from "@/features/knowledge/hub/hubPresentation";

export interface ResultHandlers {
  selected: Set<string>;
  focusedKey: string | null;
  peekKey: string | null;
  onToggleSelect: (hit: KnowledgeHit) => void;
  onFocus: (hit: KnowledgeHit) => void;
  onOpen: (hit: KnowledgeHit) => void;
  onOpenFull: (hit: KnowledgeHit) => void;
}

function filedWords(hit: KnowledgeHit): string | null {
  const names = (hit.filed_under ?? []).map((f) => f.name).filter(Boolean) as string[];
  if (!names.length) return null;
  return names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
}

export function ResultMeta({ hit }: { hit: KnowledgeHit }) {
  const filed = filedWords(hit);
  const when = hit.updated_at ?? hit.created_at;
  const parts = [
    kindLabel(hit),
    hit.origin ? originLabel(hit.origin) : null,
    hit.entity === "segment" && hit.segment?.locator ? hit.segment.locator : null,
    filed ? `in ${filed}` : null,
    when ? formatRelativeTime(when) : null,
  ].filter(Boolean);
  return <span className="truncate">{parts.join(" · ")}</span>;
}

function clickHandlers(hit: KnowledgeHit, h: ResultHandlers) {
  return {
    // Shift-click selects the row; it must not also paint a text selection.
    onMouseDown: (e: React.MouseEvent) => {
      if (e.shiftKey) e.preventDefault();
    },
    onClick: (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey) {
        h.onOpenFull(hit);
        return;
      }
      if (e.shiftKey) {
        h.onToggleSelect(hit);
        return;
      }
      h.onFocus(hit);
      h.onOpen(hit);
    },
  };
}

export function ResultRow({
  hit,
  handlers,
  style,
}: {
  hit: KnowledgeHit;
  handlers: ResultHandlers;
  style?: React.CSSProperties;
}) {
  const key = hitKey(hit);
  const Icon = kindIcon(hit);
  const isSelected = handlers.selected.has(key);
  const isFocused = handlers.focusedKey === key;
  const isPeek = handlers.peekKey === key;
  return (
    <div
      role="option"
      aria-selected={isFocused}
      data-hit-key={key}
      style={style}
      className={cn(
        "group flex min-w-0 cursor-default items-start gap-2.5 rounded-md px-2 py-2 text-sm",
        isFocused ? "bg-accent" : "hover:bg-accent/60",
        isPeek && "ring-1 ring-inset ring-primary/40",
      )}
      {...clickHandlers(hit, handlers)}
    >
      <div
        className={cn(
          "pt-0.5",
          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => handlers.onToggleSelect(hit)}
          aria-label={`Select ${hit.title}`}
        />
      </div>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-foreground">{hit.title}</div>
        {hit.snippet ? (
          <div className="line-clamp-1 text-xs text-muted-foreground">{hit.snippet}</div>
        ) : null}
        <div className="flex min-w-0 text-[11px] text-muted-foreground/90">
          <ResultMeta hit={hit} />
        </div>
      </div>
    </div>
  );
}

export function ResultCard({
  hit,
  handlers,
  tall = false,
}: {
  hit: KnowledgeHit;
  handlers: ResultHandlers;
  tall?: boolean;
}) {
  const key = hitKey(hit);
  const Icon = kindIcon(hit);
  const isSelected = handlers.selected.has(key);
  const isFocused = handlers.focusedKey === key;
  return (
    <div
      role="option"
      aria-selected={isFocused}
      data-hit-key={key}
      className={cn(
        "group relative flex min-w-0 cursor-default flex-col gap-1.5 rounded-lg border border-border bg-card p-3 text-sm shadow-sm",
        isFocused ? "ring-2 ring-ring" : "hover:border-foreground/20",
        tall && "min-h-36",
      )}
      {...clickHandlers(hit, handlers)}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-[11px] text-muted-foreground">{kindLabel(hit)}</span>
        <div
          className={cn("ml-auto", isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => handlers.onToggleSelect(hit)}
            aria-label={`Select ${hit.title}`}
          />
        </div>
      </div>
      <div className="line-clamp-2 font-medium text-foreground">{hit.title}</div>
      {hit.snippet ? (
        <div className={cn("text-xs text-muted-foreground", tall ? "line-clamp-4" : "line-clamp-2")}>
          {hit.snippet}
        </div>
      ) : null}
      <div className="mt-auto flex min-w-0 text-[11px] text-muted-foreground/90">
        <ResultMeta hit={hit} />
      </div>
    </div>
  );
}
