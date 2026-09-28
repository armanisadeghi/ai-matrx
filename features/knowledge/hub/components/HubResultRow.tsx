"use client";

/**
 * One result, in the shapes the hub draws it: a dense ROW (list and search
 * sections), a CARD (board and gallery). Kind tile (the selection checkbox on
 * hover), title and date, then kind · facts · origin · where it is filed, and
 * the passage or snippet.
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
import { TagChips } from "@/features/knowledge/hub/tags/TagChips";
import { hitTags } from "@/features/knowledge/hub/tags/tagActions";

export interface ResultHandlers {
  selected: Set<string>;
  focusedKey: string | null;
  peekKey: string | null;
  onToggleSelect: (hit: KnowledgeHit) => void;
  onFocus: (hit: KnowledgeHit) => void;
  onOpen: (hit: KnowledgeHit) => void;
  onOpenFull: (hit: KnowledgeHit) => void;
  /** Clicking a `#tag` chip filters the hub by that tag. */
  onFilterTag?: (name: string) => void;
  /** A row's own "…" menu (transcript rows carry the Transcripts list's menu, H6d). */
  rowMenu?: (hit: KnowledgeHit) => React.ReactNode;
  /** Kind-specific facts for a row's meta line ("12 min", "2,340 words", "Draft"). */
  rowFacts?: (hit: KnowledgeHit) => string[];
  /** The row being renamed inline, and what Enter / Esc do. */
  renamingKey?: string | null;
  onRenameCommit?: (hit: KnowledgeHit, title: string) => void;
  onRenameCancel?: () => void;
}

/** The title, or — while this row is being renamed — the inline editor (Enter saves, Esc cancels). */
export function HitTitle({ hit, handlers, className }: { hit: KnowledgeHit; handlers: ResultHandlers; className?: string }) {
  if (handlers.renamingKey && handlers.renamingKey === hitKey(hit))
    return (
      <input
        defaultValue={hit.title}
        // Finder / Linear: focused with the whole name selected, so typing replaces it. After the
        // frame, because the row menu that opened the editor hands focus back to its trigger as it closes.
        ref={(el) => {
          if (el && !el.dataset.primed) {
            el.dataset.primed = "1";
            window.setTimeout(() => {
              el.focus();
              el.select();
            }, 0);
          }
        }}
        aria-label={`Rename ${hit.title}`}
        className="w-full rounded border border-ring bg-background px-1 py-0.5 text-sm font-medium text-foreground outline-none"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") handlers.onRenameCommit?.(hit, e.currentTarget.value);
          if (e.key === "Escape") handlers.onRenameCancel?.();
        }}
        onBlur={(e) => {
          if (e.currentTarget.value.trim() !== hit.title.trim()) handlers.onRenameCommit?.(hit, e.currentTarget.value);
          else handlers.onRenameCancel?.();
        }}
      />
    );
  return <div className={className}>{hit.title}</div>;
}

function filedWords(hit: KnowledgeHit): string | null {
  const names = (hit.filed_under ?? []).map((f) => f.name).filter(Boolean) as string[];
  if (!names.length) return null;
  return names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
}

/**
 * The row's facts, in reading order: kind (unless every row in the list is the
 * same kind — then it is noise), the kind-specific facts the page supplies
 * (a transcript's duration and word count), origin, the passage locator, and
 * where it is filed. The date is drawn separately (right edge of a row).
 */
function metaParts(hit: KnowledgeHit, opts: { hideKind?: boolean; facts?: string[] }): string[] {
  const filed = filedWords(hit);
  return [
    opts.hideKind ? null : kindLabel(hit),
    ...(opts.facts ?? []),
    hit.origin ? originLabel(hit.origin) : null,
    hit.entity === "segment" && hit.segment?.locator ? hit.segment.locator : null,
    filed ? `in ${filed}` : null,
  ].filter((p): p is string => Boolean(p));
}

function hitWhen(hit: KnowledgeHit): string | null {
  return hit.updated_at ?? hit.created_at ?? null;
}

export function ResultMeta({ hit, hideKind, facts }: { hit: KnowledgeHit; hideKind?: boolean; facts?: string[] }) {
  const when = hitWhen(hit);
  const parts = [...metaParts(hit, { hideKind, facts }), when ? formatRelativeTime(when) : null].filter(Boolean);
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

/**
 * One list row (Linear's list chrome, Granola's meeting row): a kind tile that
 * becomes the selection checkbox on hover (tap it on a phone to select), the
 * title with its date on the right edge, then one quiet line of facts and the
 * snippet. The row menu shows on hover / focus on a pointer device and always
 * on touch, where there is no hover.
 */
export function ResultRow({
  hit,
  handlers,
  style,
  hideKind = false,
}: {
  hit: KnowledgeHit;
  handlers: ResultHandlers;
  style?: React.CSSProperties;
  /** Every row in this list is the same kind — the kind word is noise. */
  hideKind?: boolean;
}) {
  const key = hitKey(hit);
  const Icon = kindIcon(hit);
  const isSelected = handlers.selected.has(key);
  const isFocused = handlers.focusedKey === key;
  const isPeek = handlers.peekKey === key;
  const when = hitWhen(hit);
  const parts = metaParts(hit, { hideKind, facts: handlers.rowFacts?.(hit) });
  const menu = handlers.rowMenu?.(hit);
  return (
    <div
      role="option"
      aria-selected={isFocused}
      data-hit-key={key}
      style={style}
      className={cn(
        "group flex min-w-0 cursor-default items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
        isFocused ? "bg-accent" : isSelected ? "bg-primary/5" : "hover:bg-muted/70",
        isPeek && "ring-1 ring-inset ring-primary/40",
      )}
      {...clickHandlers(hit, handlers)}
    >
      <div className="relative h-8 w-8 shrink-0" onClick={(e) => e.stopPropagation()}>
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground transition-opacity",
            isSelected ? "opacity-0" : "group-hover:opacity-0",
          )}
          aria-hidden
        >
          <Icon className="h-4 w-4" />
        </div>
        <label
          className={cn(
            "absolute inset-0 flex cursor-pointer items-center justify-center transition-opacity",
            isSelected ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100",
          )}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => handlers.onToggleSelect(hit)}
            aria-label={`Select ${hit.title}`}
          />
        </label>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-3">
          <HitTitle hit={hit} handlers={handlers} className="min-w-0 flex-1 truncate font-medium text-foreground" />
          {when ? (
            <time dateTime={when} className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatRelativeTime(when)}
            </time>
          ) : null}
        </div>
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">
            {parts.join(" · ")}
            {hit.snippet ? (
              <span className="text-muted-foreground/80">
                {parts.length ? " — " : ""}
                {hit.snippet}
              </span>
            ) : null}
          </span>
          <TagChips tags={hitTags(hit)} onFilter={handlers.onFilterTag} className="shrink-0 flex-nowrap" />
        </div>
      </div>
      {menu ? (
        <div className="shrink-0 transition-opacity md:opacity-0 md:focus-within:opacity-100 md:group-hover:opacity-100 md:has-[[data-state=open]]:opacity-100">
          {menu}
        </div>
      ) : null}
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
        <span className="truncate text-xs text-muted-foreground">{kindLabel(hit)}</span>
        <div className="ml-auto">{handlers.rowMenu?.(hit)}</div>
        <div
          className={cn( isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => handlers.onToggleSelect(hit)}
            aria-label={`Select ${hit.title}`}
          />
        </div>
      </div>
      <HitTitle hit={hit} handlers={handlers} className="line-clamp-2 font-medium text-foreground" />
      {hit.snippet ? (
        <div className={cn("text-xs text-muted-foreground", tall ? "line-clamp-4" : "line-clamp-2")}>
          {hit.snippet}
        </div>
      ) : null}
      <TagChips tags={hitTags(hit)} onFilter={handlers.onFilterTag} />
      <div className="mt-auto flex min-w-0 text-xs text-muted-foreground">
        <ResultMeta hit={hit} facts={handlers.rowFacts?.(hit)} />
      </div>
    </div>
  );
}
