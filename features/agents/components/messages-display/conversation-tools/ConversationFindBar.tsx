"use client";

/**
 * ConversationFindBar — find within ONE open conversation (next / previous,
 * "3 of 12"), painted with the CSS Custom Highlight API. The transcript DOM is
 * never mutated; ranges are rebuilt when the transcript changes (streaming,
 * expand/collapse) while the bar is open.
 *
 * Enter = next · Shift+Enter = previous · Esc = close.
 */

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FIND_HIGHLIGHT,
  FIND_HIGHLIGHT_CURRENT,
  clearFindHighlights,
  collectFindRanges,
  findStatusText,
  paintFindHighlights,
  type FindHistoryState,
} from "./find-in-conversation";

const HIGHLIGHT_CSS = `
::highlight(${FIND_HIGHLIGHT}) { background-color: rgb(250 204 21 / 0.45); color: inherit; }
::highlight(${FIND_HIGHLIGHT_CURRENT}) { background-color: rgb(249 115 22 / 0.85); color: #fff; }
`;

export function ConversationFindBar({
  rootRef,
  history,
  onClose,
}: {
  rootRef: React.RefObject<HTMLElement | null>;
  /** Older history is paged in while the bar is open — search covers all of it. */
  history: FindHistoryState;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [ranges, setRanges] = useState<Range[]>([]);
  const [current, setCurrent] = useState(0);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
    return () => clearFindHighlights();
  }, []);

  // Rebuild when the transcript itself changes (a reply streams in, a
  // collapsed section opens) — debounced, never on every token.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !query.trim()) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setVersion((v) => v + 1), 250);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [rootRef, query]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const next = query.trim() ? collectFindRanges(root, query) : [];
    setRanges(next);
    setCurrent((c) => (next.length === 0 ? 0 : Math.min(c, next.length - 1)));
  }, [rootRef, query, version]);

  useEffect(() => {
    if (ranges.length === 0) {
      clearFindHighlights();
      return;
    }
    paintFindHighlights(ranges, current);
    const node = ranges[current]?.startContainer.parentElement;
    node?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [ranges, current]);

  const step = (delta: number) => {
    if (ranges.length === 0) return;
    setCurrent((c) => (c + delta + ranges.length) % ranges.length);
  };

  const status = findStatusText({ query, matches: ranges.length, current, history });

  return (
    <div
      className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 shadow-sm"
      role="search"
      aria-label="Find in this conversation"
      data-find-ignore=""
    >
      <style>{HIGHLIGHT_CSS}</style>
      <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setCurrent(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder="Find in conversation"
        aria-label="Find in conversation"
        className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
      />
      <span
        className={cn(
          "min-w-0 max-w-[55%] truncate text-xs tabular-nums",
          ranges.length === 0 && query.trim() && history.state !== "loading"
            ? "text-destructive"
            : "text-muted-foreground",
        )}
        aria-live="polite"
        title={status}
      >
        {status}
      </span>
      <FindButton label="Previous match (Shift+Enter)" onClick={() => step(-1)} disabled={ranges.length === 0}>
        <ChevronUp className="h-3.5 w-3.5" />
      </FindButton>
      <FindButton label="Next match (Enter)" onClick={() => step(1)} disabled={ranges.length === 0}>
        <ChevronDown className="h-3.5 w-3.5" />
      </FindButton>
      <FindButton label="Close find (Esc)" onClick={onClose}>
        <X className="h-3.5 w-3.5" />
      </FindButton>
    </div>
  );
}

function FindButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}
