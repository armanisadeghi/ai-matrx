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

import { useState } from "react";
import {
  MeetingRoom,
  useMeetSnapshot,
  type MeetingRecord,
  type RoomName,
} from "@ai-matrx/meet/react";
import { MeetingBoard } from "@/features/meet/components/board/MeetingBoard";
import {
  LayoutSwitch,
  type MeetingLayoutChoice,
} from "@/features/meet/components/board/LayoutSwitch";

const LAYOUT_KEY = "matrx.meet.layout";

function useMeetingLayoutPreference(): [MeetingLayoutChoice, (next: MeetingLayoutChoice) => void] {
  const [layout, setLayout] = useState<MeetingLayoutChoice>(() => {
    try {
      return window.localStorage.getItem(LAYOUT_KEY) === "board" ? "board" : "room";
    } catch {
      return "room";
    }
  });
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

export function MeetingLayout({
  roomName,
  meetingId,
  slug,
  meeting,
}: {
  roomName: RoomName;
  meetingId: string;
  slug: string;
  meeting: MeetingRecord;
}) {
  const snapshot = useMeetSnapshot();
  const [layout, setLayout] = useMeetingLayoutPreference();
  const phase = snapshot?.phase ?? "idle";
  const inRoom = phase === "connected" || phase === "reconnecting";

  if (inRoom && layout === "board") {
    return (
      <MeetingBoard
        meeting={snapshot?.meeting ?? meeting}
        onLayout={setLayout}
      />
    );
  }

  return (
    <div className="relative h-full w-full">
      <MeetingRoom roomName={roomName} meetingId={meetingId} slug={slug} meeting={meeting} />
      {inRoom && (
        <LayoutSwitch
          value="room"
          onChange={setLayout}
          // In the free end of the control bar: right on phones (the bar wraps to
          // two centred rows), left on desktop.
          className="absolute bottom-4 right-3 z-10 md:left-4 md:right-auto"
        />
      )}
    </div>
  );
}
