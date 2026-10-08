"use client";

/**
 * Meeting notes on a board — one PART of one meeting (transcript, notes,
 * decisions, action items, summary) as its own tile. These are the tiles a
 * meeting's board opens with (features/meet/components/board/MeetingBoard.tsx),
 * and because they are a registered item type they can be put on ANY board:
 * a person's own board shows a meeting's decisions beside their work.
 *
 * The body is the meeting's own reader (`MeetingPartBody`): the room's live AI
 * seam while this tab is in that meeting, its durable record everywhere else
 * (action items through the Record tab's `ActionItemsSection`). The surface is
 * the meeting's own `matrx-user/meeting` (`MeetingSurfaceHost`, the host the
 * meeting's home mounts), loaded once per meeting per tab. Sources and
 * matching: ./meeting-items.logic.ts.
 */

import { useState, type ReactNode } from "react";
import { ListChecks, NotebookPen, Video } from "lucide-react";
import { useMeeting } from "@ai-matrx/meet/react";
import { Button } from "@/components/ui/button";
import { readOf } from "@ai-matrx/design-system";
import { useMeetingsDirectory } from "@/features/meet/hooks/useMeetingsDirectory";
import { useMeetingById } from "@/features/meet/hooks/useMeetingById";
import { useMeetingLive } from "@/features/meet/hooks/useMeetingLive";
import { meetingSaved } from "@/features/meet/redux/meetingsSlice";
import { useAppDispatch } from "@/lib/redux/hooks";
import { MeetingSurfaceHost, MEETING_SURFACE_NAME } from "@/features/meet/agent-surface/MeetingSurfaceHost";
import { MeetingPartBody, useIsInMeetingRoom } from "@/features/meet/components/board/MeetingNotesBodies";
import type { NodeSource } from "../board/document";
import { entityComments, type BoardItemType, type ItemBodyProps, type PickerProps, type PlacedItem } from "./types";
import { RecordList } from "./feature-items";
import { MEETING_PHASE_LABEL, meetingPhase, orderMeetingsForPicker } from "./feature-items.logic";
import {
  MEETING_PARTS,
  MEETING_PART_ENTITY,
  matchesMeetingPart,
  meetingPartOf,
  meetingPartSource,
  type MeetingPart,
} from "./meeting-items.logic";

function MeetingPartItemBody({ source }: ItemBodyProps) {
  const target = meetingPartOf(source);
  if (!target) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        No meeting part here — remove this tile and add it again.
      </div>
    );
  }
  return <MeetingPartBody meetingId={target.meetingId} part={target.part} />;
}

/** The meeting's own surface, for the meeting this part belongs to. Until the
 * meeting is read (or when this viewer may not read it — a guest) the body
 * renders without it, exactly as it would with no agent around. */
function MeetingPartSurface({ source, children }: { source: NodeSource; children: ReactNode }) {
  const target = meetingPartOf(source);
  const read = useMeetingById(target?.meetingId ?? null);
  const dispatch = useAppDispatch();
  if (read.status !== "ready") return <>{children}</>;
  const { meeting, invitees, occurrences } = read.loaded;
  return (
    <MeetingSurfaceHost
      meeting={meeting}
      invitees={invitees}
      occurrences={occurrences}
      onSaved={(saved) => dispatch(meetingSaved({ meeting: saved }))}
    >
      {children}
    </MeetingSurfaceHost>
  );
}

/** Holds the meeting's live channel while the tile is on the board (asleep included). */
function MeetingPartKeep({ source }: { tileId: string; source: NodeSource }) {
  useMeetingLive(meetingPartOf(source)?.meetingId ?? null);
  return null;
}

function partItems(meeting: { id: string; title: string }, parts: readonly MeetingPart[], withMeetingName: boolean): PlacedItem[] {
  return MEETING_PARTS.filter((p) => parts.includes(p.part)).map(({ part, title }) => ({
    title: withMeetingName ? `${title} · ${meeting.title}` : title,
    source: meetingPartSource(meeting.id, part),
  }));
}

/**
 * Pick a meeting (the one this tab is in comes first, already chosen), then
 * which of its parts — one, or all five.
 */
function MeetingPartPicker({ onPick, onCancel }: PickerProps) {
  const current = useMeeting();
  const inRoom = useIsInMeetingRoom(current?.id ?? "");
  const [chosen, setChosen] = useState<{ id: string; title: string } | null>(
    inRoom && current ? { id: current.id, title: current.title } : null,
  );
  if (!chosen) return <MeetingChooser onChoose={setChosen} onCancel={onCancel} />;
  const named = !(inRoom && current?.id === chosen.id);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm">
        <Video className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium">{chosen.title}</span>
        <Button type="button" variant="quiet" onClick={() => setChosen(null)}>
          Another meeting
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {MEETING_PARTS.map(({ part, title }) => (
          <Button
            key={part}
            type="button"
            variant="outline"
            className="justify-start"
            onClick={() => onPick(partItems(chosen, [part], named))}
          >
            {title}
          </Button>
        ))}
        <Button
          icon={<ListChecks />}
          variant="primary"
          type="button"
          className="justify-start"
          onClick={() =>
            onPick(
              partItems(
                chosen,
                MEETING_PARTS.map((p) => p.part),
                named,
              ),
            )
          }
        >
          All five
        </Button>
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function MeetingChooser({
  onChoose,
  onCancel,
}: {
  onChoose: (meeting: { id: string; title: string }) => void;
  onCancel: () => void;
}) {
  const directory = useMeetingsDirectory();
  const rows = orderMeetingsForPicker(directory.meetings);
  return (
    <RecordList
      rows={rows}
      read={readOf(
        { loading: directory.loading, error: directory.failure },
        { what: "your meetings", onRetry: directory.reload },
      )}
      rowKey={(m) => m.id}
      rowText={(m) => m.title}
      onChoose={(m) => onChoose({ id: m.id, title: m.title })}
      onCancel={onCancel}
      emptyState="No meetings yet"
      renderRow={(m) => (
        <>
          <Video className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{m.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{MEETING_PHASE_LABEL[meetingPhase(m)]}</span>
        </>
      )}
    />
  );
}

export const MEETING_ITEMS: BoardItemType[] = [
  {
    key: MEETING_PART_ENTITY,
    guestSafe: true,
    label: "Meeting notes",
    icon: NotebookPen,
    group: "features",
    accent: "cyan",
    status: { none: "Its meeting's tile carries the meeting's state." },
    defaultSize: { w: 520, h: 390 },
    matches: matchesMeetingPart,
    Body: MeetingPartItemBody,
    Keep: MeetingPartKeep,
    surface: { name: MEETING_SURFACE_NAME, Host: MeetingPartSurface },
    // A part of a meeting (its transcript, its decisions) is discussed on the meeting's own thread.
    comments: entityComments("meet_meeting"),
    bringIn: { label: "Meeting notes", Picker: MeetingPartPicker },
    href: (source) => {
      const target = meetingPartOf(source);
      return target ? `/meetings/${encodeURIComponent(target.meetingId)}` : null;
    },
    kindLabel: "meeting notes",
    // Wake and remount render the shared per-meeting load (meetingsSlice).
    sleeps: true,
  },
];
