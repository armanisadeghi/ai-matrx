"use client";

/**
 * One result, in the shapes the hub draws it: a dense ROW (list and search
 * sections), a CARD (board and gallery). Kind tile (the selection checkbox on
 * hover), title and date, then kind · facts · origin · where it is filed, and
 * the passage or snippet.
 */

import { useState } from "react";
import { Checkbox } from "@ai-matrx/design-system";
import type { LucideIcon } from "lucide-react";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import { cn } from "@/utils/cn";
import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";
import {
  cleanSnippet,
  hitIcon,
  hitKey,
  plainText,
  kindLabel,
  originLabel,
} from "@/features/knowledge/hub/hubPresentation";
import { TagChips } from "@/features/knowledge/hub/tags/TagChips";
import { hitTags } from "@/features/knowledge/hub/tags/tagActions";

export interface RowContent {
  snippet?: string | null;
  thumbnailUrl?: string | null;
  /** The row's own glyph when its record says more than its kind does (a meeting, a podcast). */
  icon?: LucideIcon | null;
  /** A name to show when the record's own title is a placeholder ("unlabeled"). */
  title?: string | null;
  /** The channel it came from — said instead of the origin ("Veritasium", not "YouTube · Veritasium"). */
  channel?: string | null;
}

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
  /** What is inside the row's record: its opening words and a poster frame (Granola / Otter rows). */
  rowContent?: (hit: KnowledgeHit) => RowContent | undefined;
  /** The words being searched for: marked where they appear in a title or passage. */
  highlight?: string;
  /** The row being renamed inline, and what Enter / Esc do. */
  renamingKey?: string | null;
  onRenameCommit?: (hit: KnowledgeHit, title: string) => void;
  onRenameCancel?: () => void;
}

/**
 * Text with the searched-for words marked (every word of the query, case
 * ignored). No query, or no match: the text as it is.
 */
export function Highlight({ text, query }: { text: string; query?: string }) {
  const words = (query ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, ""))
    .filter((w) => w.length > 1);
  if (!words.length || !text) return <>{text}</>;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = text.split(re);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-warning/25 px-0.5 text-foreground">
            {p}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  );
}

/** A long passage starts a little before the first searched-for word, so the match is on screen. */
export function aroundMatch(text: string, query?: string): string {
  const words = (query ?? "").toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length || text.length < 80) return text;
  const lower = text.toLowerCase();
  const at = Math.min(...words.map((w) => lower.indexOf(w)).filter((i) => i >= 0));
  if (!Number.isFinite(at) || at < 50) return text;
  const start = text.lastIndexOf(" ", at - 30);
  return `…${text.slice(start > 0 ? start + 1 : at - 30)}`;
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
  const shown = handlers.rowContent?.(hit)?.title;
  return (
    <div className={className}>
      <Highlight text={shown || plainText(hit.title)} query={handlers.highlight} />
    </div>
  );
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
function metaParts(hit: KnowledgeHit, opts: { hideKind?: boolean; hideOrigin?: boolean; facts?: string[] }): string[] {
  const filed = filedWords(hit);
  return [
    opts.hideKind ? null : kindLabel(hit),
    hit.origin && !opts.hideOrigin ? originLabel(hit.origin) : null,
    ...(opts.facts ?? []),
    hit.entity === "segment" && hit.segment?.locator ? hit.segment.locator : null,
    filed ? `in ${filed}` : null,
  ].filter((p): p is string => Boolean(p));
}

export function hitWhen(hit: KnowledgeHit): string | null {
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

/** The list row's kind tile: a video's poster frame when it has one, else the kind icon. */
function KindTile({ hit, content }: { hit: KnowledgeHit; content?: RowContent }) {
  const base = hitIcon(hit);
  const Icon = content?.icon ?? base.Icon;
  const tint = content?.icon ? undefined : base.className;
  const thumbnailUrl = content?.thumbnailUrl;
  const [broken, setBroken] = useState(false);
  if (thumbnailUrl && !broken)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote YouTube CDN poster, no loader configured for i.ytimg.com
      <img
        src={thumbnailUrl}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className="h-9 w-9 rounded-md bg-muted object-cover"
      />
    );
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
      <Icon className={cn("h-4 w-4", tint)} />
    </div>
  );
}

/**
 * One list row (Linear's list chrome, Granola / Otter's recording row): a kind
 * tile (a video's poster frame) that becomes the selection checkbox on hover —
 * tap it on a phone to select — the title with its date on the right, the
 * record's opening words, then one quiet line of facts. On a narrow pane
 * (`compact`) the title may take two lines and the date joins the facts. The
 * menu column is always reserved, so dates line up whether a row has a menu or
 * not; the menu shows on hover / focus with a pointer, always on touch.
 */
export function ResultRow({
  hit,
  handlers,
  style,
  hideKind = false,
  whenLabel,
  compact = false,
  titleLines = 1,
}: {
  hit: KnowledgeHit;
  handlers: ResultHandlers;
  style?: React.CSSProperties;
  /** Every row in this list is the same kind — the kind word is noise. */
  hideKind?: boolean;
  /** The date as its section wants it ("3:42 PM", "Sep 12"); relative when absent. */
  whenLabel?: string | null;
  /** A narrow pane: the date joins the fact line and tags stay in the peek. */
  compact?: boolean;
  /** Lines the title may take (the list measured it: 2 on a narrow pane when it will not fit one). */
  titleLines?: 1 | 2;
}) {
  const key = hitKey(hit);
  const isSelected = handlers.selected.has(key);
  const isFocused = handlers.focusedKey === key;
  const isPeek = handlers.peekKey === key;
  const when = hitWhen(hit);
  const date = whenLabel !== undefined ? whenLabel : when ? formatRelativeTime(when) : null;
  const content = handlers.rowContent?.(hit);
  const snippet = aroundMatch(cleanSnippet(hit.snippet || content?.snippet), handlers.highlight) || null;
  const parts = [
    ...(compact && date ? [date] : []),
    ...metaParts(hit, { hideKind, hideOrigin: Boolean(content?.channel), facts: handlers.rowFacts?.(hit) }),
  ];
  const menu = handlers.rowMenu?.(hit);
  // A tag that repeats a fact already on the line (#Veritasium beside "Veritasium") is noise.
  const said = new Set(parts.map((p) => p.toLowerCase()));
  const tags = compact ? [] : hitTags(hit).filter((t) => !said.has(t.replace(/^#/, "").toLowerCase()));
  return (
    <div
      role="option"
      aria-selected={isFocused}
      data-hit-key={key}
      style={style}
      className={cn(
        "group flex min-w-0 cursor-default items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors",
        isFocused ? "bg-accent" : isSelected ? "bg-primary/5" : "hover:bg-muted/70",
        isPeek && "ring-1 ring-inset ring-primary/40",
      )}
      {...clickHandlers(hit, handlers)}
    >
      <div className="relative h-9 w-9 shrink-0 self-start" onClick={(e) => e.stopPropagation()}>
        <div className={cn("transition-opacity", isSelected ? "opacity-0" : "group-hover:opacity-0")} aria-hidden>
          <KindTile hit={hit} content={content} />
        </div>
        <label
          className={cn(
            "absolute inset-0 flex cursor-pointer items-center justify-center rounded-md transition-opacity",
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
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex min-w-0 items-baseline gap-3">
          <HitTitle
            hit={hit}
            handlers={handlers}
            className={cn("min-w-0 flex-1 font-medium leading-5 text-foreground", titleLines === 2 ? "line-clamp-2 break-words" : "truncate")}
          />
          {!compact && (date || menu) ? (
            // Linear: the date holds the right edge; the row menu takes its place on hover or
            // keyboard focus, so every row's right edge lines up with the count above.
            <div className="relative flex shrink-0 items-center justify-end self-center">
              {date ? (
                <time
                  dateTime={when ?? undefined}
                  className={cn(
                    "text-xs tabular-nums text-muted-foreground",
                    menu && "group-hover:invisible group-focus-within:invisible group-has-[[data-state=open]]:invisible",
                  )}
                >
                  {date}
                </time>
              ) : null}
              {menu ? (
                <div className="absolute inset-y-0 right-0 flex items-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 has-[[data-state=open]]:opacity-100">
                  {menu}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {snippet ? (
          <p className={cn("text-[13px] leading-5 text-muted-foreground", compact ? "line-clamp-2" : "truncate")}>
            <Highlight text={snippet} query={handlers.highlight} />
          </p>
        ) : null}
        {parts.length || tags.length ? (
          <div className="flex min-w-0 items-center gap-2 text-xs leading-4 text-muted-foreground/80">
            <span className="min-w-0 truncate">{parts.join(" · ")}</span>
            <TagChips tags={tags} onFilter={handlers.onFilterTag} className="shrink-0 flex-nowrap" />
          </div>
        ) : null}
      </div>
      {compact && menu ? <div className="flex w-7 shrink-0 justify-end">{menu}</div> : null}
    </div>
  );
}

/**
 * How tall a list row is, from what it will show — the window math needs it
 * before render, so a row can never be taller than the height it was given:
 * the title is clamped to exactly the lines counted here.
 */
export function resultRowHeight(hit: KnowledgeHit, handlers: ResultHandlers, titleLines: 1 | 2, compact = false): number {
  const hasSnippet = Boolean(hit.snippet || handlers.rowContent?.(hit)?.snippet);
  // py-2 (16) + title (20 a line) + snippet (22; two lines on a narrow pane) + facts (18) + spacing (4)
  return 16 + 20 * titleLines + (hasSnippet ? (compact ? 42 : 22) : 0) + 18 + 4;
}

/** A narrow pane gives the title two lines when it will not fit one (≈7.4px per character at 14px). */
export function titleLinesFor(title: string, paneWidth: number, compact: boolean): 1 | 2 {
  if (!compact) return 1;
  // row padding 20 · tile 36 · gaps 24 · menu column 28
  const perLine = Math.max(12, Math.floor((paneWidth - 108) / 7.4));
  return title.length > perLine ? 2 : 1;
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
  const base = hitIcon(hit);
  const content = handlers.rowContent?.(hit);
  const Icon = content?.icon ?? base.Icon;
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
        <Icon className={cn("h-4 w-4 shrink-0 text-muted-foreground", !content?.icon && base.className)} />
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
      {cleanSnippet(hit.snippet || content?.snippet) ? (
        <div className={cn("text-xs text-muted-foreground", tall ? "line-clamp-4" : "line-clamp-2")}>
          {cleanSnippet(hit.snippet || content?.snippet)}
        </div>
      ) : null}
      <TagChips tags={hitTags(hit)} onFilter={handlers.onFilterTag} />
      <div className="mt-auto flex min-w-0 text-xs text-muted-foreground">
        <ResultMeta hit={hit} facts={handlers.rowFacts?.(hit)} />
      </div>
    </div>
  );
}
