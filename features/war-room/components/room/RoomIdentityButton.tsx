"use client";

// features/war-room/components/room/RoomIdentityButton.tsx
//
// Compact room IDENTITY editor for the room header. Edits a room's title,
// description, icon, and color in one popover panel — the setters that
// activate the dormant workspace.war_rooms.{icon,color,description} columns.
// Saves through the optimistic updateRoomIdentity thunk (failures route to
// reportWarRoomError).
//
// Re-housed 2026-08-09 (core-route-headers conformance): the trigger button
// died with the in-body header — the editor is now launched from RoomHeader's
// "⋯" overflow menu inside a CONTROLLED popover, so only the editor is
// exported. Title commits live via the shared EditableTitle in the header
// (this editor's title input is a redundant, explicit entry point and saves
// on blur/Enter); icon + color save on click (instant, optimistic).

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { updateRoomIdentity } from "@/features/war-room/redux/thunks";
import { cn } from "@/lib/utils";
import {
  ROOM_COLORS,
  ROOM_COLOR_TOKENS,
  ROOM_ICON_NAMES,
  ROOM_ICONS,
} from "./roomIdentity";

export function RoomIdentityEditor({
  sessionId,
  title,
  description,
  iconName,
  colorToken,
}: {
  sessionId: string;
  title: string;
  description: string | null;
  iconName: string | null;
  colorToken: string;
}) {
  const dispatch = useAppDispatch();
  const [titleDraft, setTitleDraft] = useState(title);
  const [descDraft, setDescDraft] = useState(description ?? "");

  // Re-sync drafts if the underlying row changes while open (e.g. header rename).
  useEffect(() => setTitleDraft(title), [title]);
  useEffect(() => setDescDraft(description ?? ""), [description]);

  function commitTitle() {
    const next = titleDraft.trim();
    if (next && next !== title) {
      void dispatch(updateRoomIdentity(sessionId, { title: next }));
    } else if (!next) {
      setTitleDraft(title); // never blank
    }
  }

  function commitDescription() {
    const next = descDraft.trim();
    if (next !== (description ?? "")) {
      void dispatch(updateRoomIdentity(sessionId, { description: next }));
    }
  }

  function pickIcon(name: string) {
    if (name === iconName) return;
    void dispatch(updateRoomIdentity(sessionId, { icon: name }));
  }

  function pickColor(token: string) {
    if (token === colorToken) return;
    void dispatch(updateRoomIdentity(sessionId, { color: token }));
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold text-foreground">Room details</p>

      {/* Title */}
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          Title
        </span>
        <input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitTitle();
            }
          }}
          placeholder="Untitled War Room"
          // text-base (16px) avoids iOS input zoom (repo mobile rule).
          className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-base @md:text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        />
      </label>

      {/* Description */}
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          Description
        </span>
        <textarea
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          onBlur={commitDescription}
          rows={2}
          placeholder="What is this room for?"
          className="resize-none rounded-lg border border-border bg-card px-2.5 py-1.5 text-base @md:text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        />
      </label>

      {/* Icon picker */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">
          Icon
        </span>
        <div className="grid grid-cols-8 gap-1">
          {ROOM_ICON_NAMES.map((name) => {
            const Icon = ROOM_ICONS[name];
            const active = name === iconName;
            return (
              <button
                key={name}
                type="button"
                onClick={() => pickIcon(name)}
                aria-pressed={active}
                title={name}
                className={cn(
                  "grid place-items-center aspect-square rounded-md border transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  active
                    ? "border-primary/70 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Color picker */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">
          Color
        </span>
        <div className="flex flex-wrap gap-1.5">
          {ROOM_COLOR_TOKENS.map((token) => {
            const c = ROOM_COLORS[token];
            const active = token === colorToken;
            return (
              <button
                key={token}
                type="button"
                onClick={() => pickColor(token)}
                aria-pressed={active}
                title={c.label}
                aria-label={c.label}
                className={cn(
                  "grid place-items-center size-6 rounded-full transition-all",
                  c.swatch,
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  active
                    ? cn("ring-2 ring-offset-2 ring-offset-popover", c.ring)
                    : "opacity-80 hover:opacity-100",
                )}
              >
                {active ? (
                  <Check className="size-3 text-white drop-shadow" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
