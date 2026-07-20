"use client";

// features/war-room/components/shared/WarRoomRoomThreadPicker.tsx
//
// Pick any thread already in THIS war room — used by QuickAddTask's
// "Existing thread" target so a task can land on any room thread, not only
// the currently staged one.

import { useState } from "react";
import { MessageSquare, Check, ChevronDown, Search } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectThreadById,
  selectThreadIdsForRoom,
} from "@/features/war-room/redux/selectors";
import { threadDisplayTitle } from "@/features/war-room/utils/threadDisplayTitle";
import { cn } from "@/lib/utils";
import type { RootState } from "@/lib/redux/store";

export function WarRoomRoomThreadPicker({
  roomId,
  value,
  onSelect,
  placeholder = "Choose a thread…",
  className,
}: {
  roomId: string;
  value: string | null;
  onSelect: (threadId: string | null, threadTitle: string | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const threadIds = useAppSelector(selectThreadIdsForRoom(roomId));
  const options = useAppSelector((state: RootState) =>
    threadIds.map((id) => {
      const thread = state.warRoom.threadsById[id];
      return { id, title: threadDisplayTitle(thread) };
    }),
  );
  const selectedThread = useAppSelector(selectThreadById(value));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedLabel = selectedThread
    ? threadDisplayTitle(selectedThread)
    : null;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.title.toLowerCase().includes(q))
    : options;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex w-full items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent/40",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            className,
          )}
        >
          <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              selectedLabel ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {selectedLabel ?? placeholder}
          </span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search threads…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            style={{ fontSize: "16px" }}
            aria-label="Search threads in this room"
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {options.length === 0
                ? "No threads in this room yet."
                : "No match."}
            </p>
          ) : (
            filtered.map((o) => {
              const active = o.id === value;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    onSelect(o.id, o.title);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                    active && "bg-accent/60",
                  )}
                >
                  <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {o.title}
                  </span>
                  {active ? (
                    <Check className="size-3.5 shrink-0 text-primary" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
