"use client";

// features/war-room/components/room/ThreadSearchBox.tsx
//
// Per-room thread filter in mission control. Drives ephemeral `threadQuery`
// (roomViewContext); the rail + gallery filter in place by thread title first.
// Collapsed to an icon until used; expands on click.

import { useState } from "react";
import { Search } from "lucide-react";
import { useRoomView } from "./roomViewContext";
import { WarRoomSearchField } from "../shared/WarRoomSearchField";

export function ThreadSearchBox() {
  const { threadQuery, setThreadQuery } = useRoomView();
  const [open, setOpen] = useState(false);

  const expanded = open || threadQuery.length > 0;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Search threads by title"
        aria-label="Search threads by title"
        className="grid place-items-center size-7 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Search className="size-4" />
      </button>
    );
  }

  return (
    <WarRoomSearchField
      value={threadQuery}
      onChange={setThreadQuery}
      placeholder="Search threads by title…"
      ariaLabel="Search threads by title"
      className="h-7 pl-2 pr-1"
      inputClassName="w-36 @5xl:w-48 text-[13px]"
      autoFocus={open}
      onEscape={() => {
        setThreadQuery("");
        setOpen(false);
      }}
      onBlur={() => {
        if (!threadQuery) setOpen(false);
      }}
    />
  );
}
