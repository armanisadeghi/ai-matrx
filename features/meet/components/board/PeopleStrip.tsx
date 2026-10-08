"use client";

/**
 * PeopleStrip — the people in the meeting, as a compact floating strip over
 * the Board (screen space, never on the plane: faces must not shrink when the
 * board zooms out).
 *
 * Every face is the package's own `<ParticipantTile>` — media, mute state,
 * hand, AI badge, role badge, pin and host mute all come with it. The order is
 * the package's stage arithmetic (`orderParticipants`: active speakers first,
 * then raised hands, cameras on, join time), so the strip never shuffles for a
 * reason the room would not. A screen share gets a wider tile. Anyone who does
 * not fit is COUNTED, never silently dropped (README rule 10).
 *
 * Drag the grip to move it anywhere over the board; collapse it to a pill.
 */

import { useRef, useState } from "react";
import { ChevronDown, ChevronUp, GripHorizontal, Users } from "lucide-react";
import {
  orderParticipants,
  useMeetSnapshot,
  useRoom,
} from "@ai-matrx/meet/react";
import { ParticipantTile } from "@ai-matrx/meet/skins/meet";
import { cn } from "@/lib/utils";

/** How many faces the strip shows before it counts the rest. */
const MAX_FACES = 4;
const FACE_WIDTH = 176;
const SHARE_WIDTH = 360;

export function PeopleStrip() {
  const room = useRoom();
  const snapshot = useMeetSnapshot();
  const [collapsed, setCollapsed] = useState(false);
  // null = the default corner; a drag switches to an explicit position.
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const ordered = orderParticipants(room.participants, snapshot?.activeSpeakers ?? []);
  const shown = ordered.slice(0, MAX_FACES);
  const overflow = ordered.length - shown.length;

  const startDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const box = boxRef.current;
    const parent = box?.offsetParent as HTMLElement | null;
    if (!box || !parent) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const start = { px: e.clientX, py: e.clientY, x: box.offsetLeft, y: box.offsetTop };
    const move = (ev: PointerEvent) => {
      const maxX = Math.max(0, parent.clientWidth - box.offsetWidth);
      const maxY = Math.max(0, parent.clientHeight - box.offsetHeight);
      setPosition({
        x: Math.min(maxX, Math.max(0, start.x + ev.clientX - start.px)),
        y: Math.min(maxY, Math.max(0, start.y + ev.clientY - start.py)),
      });
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  return (
    <div
      ref={boxRef}
      data-board-chrome
      data-meet-people-strip
      className={cn(
        "pointer-events-auto absolute z-20 flex max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-card/95 shadow-lg backdrop-blur",
        // Below the board's toolbar on the left — the top-right corner holds
        // the board's layers / zoom controls and the parked shelf.
        position === null && "left-4 top-16",
      )}
      style={position === null ? undefined : { left: position.x, top: position.y }}
      aria-label="People in this meeting"
    >
      <div className="flex items-center gap-1 border-b border-border px-1.5 py-1">
        <button
          type="button"
          onPointerDown={startDrag}
          title="Drag to move"
          aria-label="Move the people strip"
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-accent active:cursor-grabbing"
        >
          <GripHorizontal className="h-3.5 w-3.5" />
        </button>
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1 truncate text-xs font-medium text-foreground">
          {`${ordered.length} in the meeting`}
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Show people" : "Hide people"}
          aria-label={collapsed ? "Show people" : "Hide people"}
          aria-expanded={!collapsed}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>
      {!collapsed && (
        <div className="flex items-start gap-1.5 overflow-x-auto p-1.5">
          {shown.map((participant) => (
            <div
              key={participant.identity}
              className="shrink-0"
              style={{ width: participant.screenSharing ? SHARE_WIDTH : FACE_WIDTH }}
            >
              <ParticipantTile participant={participant} />
            </div>
          ))}
          {overflow > 0 && (
            <p className="self-center whitespace-nowrap px-2 text-xs text-muted-foreground">
              {`+${overflow} more ${overflow === 1 ? "person" : "people"}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
