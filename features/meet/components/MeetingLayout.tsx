"use client";

// features/meet/components/MeetingLayout.tsx
//
// THE LAYOUT CHOICE INSIDE A MEETING — the package's room, or the Board.
//
// Everything that is not "in the room" stays the package's, always: pre-join,
// the lobby, a failed join, leaving, and the post-meeting record all render
// through `<MeetingRoom>` exactly as before. Only while the local participant is
// CONNECTED (or reconnecting) does the viewer's choice apply, and the Board is
// composed from the package's own exported pieces — `ConsentNotice`,
// `AttendanceNotice`, `RecordingIndicator`, `ParticipantTile`, `Captions`,
// `ControlBar` — never a re-implementation of any of them.
//
// The room engine lives in the provider's store, not in `<MeetingRoom>`, so
// swapping which component draws the connected room never leaves or rejoins.
//
// The choice is per viewer, kept in this browser (a convenience, not shared
// state); blocked storage just means the default — the package's room.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  MeetAppPanels,
  MeetRoot,
  MeetingSkinRoot,
  useMeetSnapshot,
  type MeetingRecord,
  type RoomName,
} from "@ai-matrx/meet/react";
import { MeetingBoard } from "@/features/meet/components/board/MeetingBoard";
import { MEET_APP_PANELS } from "@/features/meet/app-panels/registry";
import {
  LayoutSwitch,
  type MeetingLayoutChoice,
} from "@/features/meet/components/board/LayoutSwitch";

const LAYOUT_KEY = "matrx.meet.layout";

function useMeetingLayoutPreference(): [MeetingLayoutChoice, (next: MeetingLayoutChoice) => void] {
  // Server-render the stable Room default. Reading storage during render makes
  // a saved Board preference disagree with the server markup during hydration.
  const [layout, setLayout] = useState<MeetingLayoutChoice>("room");
  useEffect(() => {
    try {
      if (window.localStorage.getItem(LAYOUT_KEY) === "board") setLayout("board");
    } catch {
      // Storage blocked (private window): retain the server-safe default.
    }
  }, []);
  const update = (next: MeetingLayoutChoice) => {
    setLayout(next);
    try {
      window.localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // Storage blocked (private window): the choice lasts for this visit.
    }
  };
  return [layout, update];
}

/**
 * How far above the bottom the Room | Board switch must float on a phone: the
 * package's control bar wraps to two centred rows there and its LAST button is
 * Leave, so "the free right end" does not exist — pinned to bottom-right the
 * switch sat on top of Leave (verified at 390px, 2026-09-27). Measured, because
 * the bar is one row for a guest and two for a host.
 */
export function phoneSwitchOffset(controlBarHeight: number | null): number | null {
  return controlBarHeight === null ? null : Math.ceil(controlBarHeight) + 8;
}

function useControlBarHeight(active: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return undefined;
    const root = ref.current;
    const bar = root?.querySelector<HTMLElement>(".mx-meet__controls") ?? null;
    if (bar === null || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => setHeight(bar.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [active]);
  return [ref, height] as const;
}

export function MeetingLayout({
  roomName,
  meetingId,
  slug,
  meeting,
  headerControls,
  preJoinControls,
  endedControls,
  onLeave,
}: {
  roomName: RoomName;
  meetingId: string;
  slug: string;
  meeting: MeetingRecord;
  headerControls?: ReactNode;
  /**
   * Drawn in the top-right corner before the room is joined (pre-join, the
   * waiting room). The package has no header there, so the room's
   * `headerControls` slot does not reach it. Not drawn over an ended
   * meeting's record.
   */
  preJoinControls?: ReactNode;
  /** Drawn in the top-right corner over an ENDED meeting's record. */
  endedControls?: ReactNode;
  /**
   * Called once when the person LEAVES the room (connected → left), from
   * either layout's Leave. A host that embeds the room (a meeting tile on the
   * Board) goes back to the meeting's home; the durable link passes none and
   * stays on the package's screen.
   */
  onLeave?: () => void;
}) {
  const snapshot = useMeetSnapshot();
  const [layout, setLayout] = useMeetingLayoutPreference();
  // `?observe=1` joins as a SILENT OBSERVER (Meet MD-16); the server decides who may.
  const observe = useSearchParams()?.get("observe") === "1";
  const phase = snapshot?.phase ?? "resolving";
  const inRoom = phase === "in_call";
  const ended = (snapshot?.meeting ?? meeting).endedAt !== null;

  // Left means "was in the room, now is not": a fresh pre-join that starts
  // at `left` (the store remembers a previous call) is not a leave.
  const wasInRoom = useRef(false);
  useEffect(() => {
    if (inRoom) {
      wasInRoom.current = true;
      return;
    }
    if (phase === "left" && wasInRoom.current) {
      wasInRoom.current = false;
      onLeave?.();
    }
  }, [inRoom, phase, onLeave]);

  const [roomRef, barHeight] = useControlBarHeight(inRoom && layout !== "board");
  const phoneOffset = phoneSwitchOffset(barHeight);

  if (inRoom && layout === "board") {
    // The Board is drawn here, not by `<MeetingRoom>`, so it carries the
    // package's one observation root itself (S0).
    return (
      <MeetAppPanels panels={MEET_APP_PANELS}>
        <MeetRoot meeting={meeting}>
          <MeetingBoard
            meeting={snapshot?.meeting ?? meeting}
            onLayout={setLayout}
            headerControls={headerControls}
          />
        </MeetRoot>
      </MeetAppPanels>
    );
  }

  return (
    <div ref={roomRef} className="relative h-full w-full">
      <MeetAppPanels panels={MEET_APP_PANELS}>
        <MeetingSkinRoot
          roomName={roomName}
          meetingId={meetingId}
          slug={slug}
          meeting={meeting}
          headerControls={headerControls}
          observe={observe}
        />
      </MeetAppPanels>
      {!inRoom && !ended && preJoinControls !== undefined ? (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2 pt-[env(safe-area-inset-top)]">
          {preJoinControls}
        </div>
      ) : null}
      {ended && endedControls !== undefined ? (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2 pt-[env(safe-area-inset-top)]">
          {endedControls}
        </div>
      ) : null}
      {inRoom && (
        <LayoutSwitch
          value="room"
          onChange={setLayout}
          // Desktop: the free left end of the one-row control bar. Phone: just
          // ABOVE the (wrapped) bar, right-aligned — never over Leave.
          className="absolute bottom-[var(--meet-switch-bottom,1rem)] right-3 z-10 md:bottom-4 md:left-4 md:right-auto"
          style={
            phoneOffset === null
              ? undefined
              : ({ "--meet-switch-bottom": `${phoneOffset}px` } as CSSProperties)
          }
        />
      )}
    </div>
  );
}
