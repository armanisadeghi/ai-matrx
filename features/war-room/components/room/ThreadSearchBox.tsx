"use client";

// features/war-room/components/room/ThreadSearchBox.tsx
//
// Feature ba9f72e4 — the room's thread filter. A compact search field in
// mission control that drives the ephemeral `threadQuery` (roomViewContext);
// the rail + gallery filter in place by NAME → DESCRIPTION → CONTENTS. SPEED &
// FOCUS: it never navigates and never disturbs the staged thread — it only
// narrows what's listed.
//
// Collapsed to an icon button until used (the header is crowded); expands to an
// input on click, auto-focused, with a clear affordance. Escape clears + folds.

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRoomView } from "./roomViewContext";

export function ThreadSearchBox() {
  const { threadQuery, setThreadQuery } = useRoomView();
  // Stay expanded whenever there's an active query (so a filtered room reads as
  // "you're searching"), else collapse to the icon.
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const expanded = open || threadQuery.length > 0;

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Search threads"
        aria-label="Search threads"
        className="grid place-items-center size-7 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Search className="size-4" />
      </button>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-border bg-card/60 pl-2 pr-1 h-7",
        "focus-within:border-primary/50",
      )}
    >
      <Search className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        type="text"
        value={threadQuery}
        onChange={(e) => setThreadQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setThreadQuery("");
            setOpen(false);
          }
        }}
        onBlur={() => {
          // Fold back only if nothing is being filtered.
          if (!threadQuery) setOpen(false);
        }}
        placeholder="Search threads…"
        aria-label="Search threads"
        // 16px to avoid iOS zoom (mobile rule), shrunk visually by the input box.
        style={{ fontSize: "16px" }}
        className="w-36 @5xl:w-48 min-w-0 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none"
      />
      {threadQuery ? (
        <button
          type="button"
          onClick={() => {
            setThreadQuery("");
            inputRef.current?.focus();
          }}
          title="Clear search"
          aria-label="Clear search"
          className="grid place-items-center size-5 shrink-0 rounded text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
