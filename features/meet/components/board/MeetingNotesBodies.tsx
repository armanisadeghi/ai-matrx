"use client";

/**
 * The "Meeting notes" parts on a board (item type `meeting_part`,
 * features/board/items/meeting-items.tsx): transcript, notes, decisions,
 * action items and summary of ONE meeting.
 *
 * Two sources, one rule — nothing is computed here:
 *   - this tab is IN that meeting's room → the package's live AI seam
 *     (`useMeetAi`): durable notes, decisions and action items delivered by the
 *     room, the reconciled transcript (captions replaced by durable rows, D16),
 *     and the wrap-up summary once one exists;
 *   - anywhere else (the person's own board, after the meeting) → the
 *     meeting's durable record (`useMeetingRecord`, the bundle the Record tab
 *     reads), with action items through the Record tab's own
 *     `ActionItemsSection` (they become tasks there and here alike).
 *
 * An empty part says what will appear in it rather than looking broken. The
 * note-taker's controls and the question box stay in the package's Meeting
 * assistant panel (the control bar).
 */

import { useEffect, useRef } from "react";
import {
  displayNameFor,
  meetingWhen,
  readableTranscript,
  useMeetAi,
  useMeetingId,
  useMeetingRecord,
  useMeetSnapshot,
  type MeetingNote,
  type MeetingRecordBundle,
} from "@ai-matrx/meet/react";
import { Skeleton } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import type { MeetingPart } from "@/features/board/items/meeting-items.logic";
import { ActionItemsSection } from "@/features/meet/components/record/ActionItemsSection";
import { useMeetingById, type LoadedMeeting } from "@/features/meet/hooks/useMeetingById";
import { useMeetingActions } from "@/features/meet/hooks/useMeetingActions";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
const EMPTY: Record<Exclude<MeetingPart, "transcript" | "summary">, string> = {
  notes: "Notes appear here as the meeting goes on.",
  decisions: "Nothing has been decided yet.",
  actions: "No action items yet.",
};

/** Is this tab in THAT meeting's room right now? */
export function useIsInMeetingRoom(meetingId: string): boolean {
  const liveId = useMeetingId();
  const snapshot = useMeetSnapshot();
  const phase = snapshot?.phase;
  return liveId === meetingId && phase === "in_call";
}

/** One part of one meeting: live in its room, its durable record elsewhere. */
export function MeetingPartBody({ meetingId, part }: { meetingId: string; part: MeetingPart }) {
  const inRoom = useIsInMeetingRoom(meetingId);
  return inRoom ? <MeetingSectionBody section={part} /> : <MeetingRecordPartBody meetingId={meetingId} part={part} />;
}

// ── live: the room's AI seam ─────────────────────────────────────────────────

export function MeetingSectionBody({ section }: { section: MeetingPart }) {
  const ai = useMeetAi();
  return (
    <div data-board-scroll className="h-full overflow-y-auto p-4 text-sm leading-relaxed text-foreground">
      <p className="mb-3 text-xs text-muted-foreground">{ai.noteTakerLabel}</p>
      {section === "transcript" && <LiveTranscript />}
      {section === "notes" && <NoteList notes={ai.notes} empty={EMPTY.notes} />}
      {section === "decisions" && <NoteList notes={ai.decisions} empty={EMPTY.decisions} />}
      {section === "actions" && <NoteList notes={ai.actionItems} empty={EMPTY.actions} withOwner />}
      {section === "summary" &&
        (ai.summary !== null ? (
          <p className="whitespace-pre-wrap">{ai.summary.text}</p>
        ) : (
          <p className="text-muted-foreground">The summary is written when the meeting ends.</p>
        ))}
    </div>
  );
}

function NoteList({
  notes,
  empty,
  withOwner = false,
}: {
  notes: readonly MeetingNote[];
  empty: string;
  withOwner?: boolean;
}) {
  if (notes.length === 0) return <p className="text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-2">
      {notes.map((note) => (
        <li key={note.id} className="rounded-md border border-border bg-card px-3 py-2">
          <p className="whitespace-pre-wrap">{note.text}</p>
          {withOwner && note.assigneeDisplayName !== null && (
            <p className="mt-1 text-xs text-muted-foreground">{`Owner: ${note.assigneeDisplayName}`}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Follows the newest line unless the reader scrolled up. */
function useFollowNewest(lastLine: string | null) {
  const endRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const end = endRef.current;
    const scroller = end?.closest<HTMLElement>("[data-board-scroll]");
    if (!end || !scroller) return;
    const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
    if (nearBottom) scroller.scrollTop = scroller.scrollHeight;
  }, [lastLine]);
  return endRef;
}

function LiveTranscript() {
  const { transcript } = useMeetAi();
  const endRef = useFollowNewest(transcript.at(-1)?.id ?? null);
  if (transcript.length === 0) {
    return <p className="text-muted-foreground">Lines appear here once the note-taker is transcribing.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {transcript.map((line) => (
        <li
          key={line.id}
          className={line.final && line.source === "record" ? undefined : "italic text-muted-foreground"}
        >
          <strong className="mr-1.5 font-semibold">{line.speaker}</strong>
          {line.text}
        </li>
      ))}
      <li ref={endRef} aria-hidden="true" />
    </ul>
  );
}

// ── elsewhere: the meeting's durable record ──────────────────────────────────

function PartSkeleton() {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Opening the meeting record">
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function MeetingRecordPartBody({ meetingId, part }: { meetingId: string; part: MeetingPart }) {
  const read = useMeetingById(meetingId);
  if (read.status === "loading") return <PartSkeleton />;
  if (read.status === "failed") {
    return (
      <div className="h-full overflow-y-auto">
        <AccessGate
          token="meet_meeting"
          id={meetingId}
          error={read.error}
          onRetry={read.reload}
          fallbackHref="/meetings"
          fallbackLabel="All meetings"
        />
      </div>
    );
  }
  return <RecordPart loaded={read.loaded} part={part} />;
}

function RecordPart({ loaded, part }: { loaded: LoadedMeeting; part: MeetingPart }) {
  const { meeting } = loaded;
  const record = useMeetingRecord(meeting);
  const { userId } = useMeetingActions();
  if (record.failure !== null) {
    return (
      <div role="alert" className="space-y-2 p-4 text-sm">
        <p className="font-medium">This meeting record could not be opened.</p>
        <p className="text-muted-foreground">{`${record.failure.message} ${record.failure.remedy}`}</p>
        <Button variant="outline" onClick={record.reload}>
          Try again
        </Button>
      <ErrorAlchemyMenu /></div>
    );
  }
  if (record.loading || record.record === null) return <PartSkeleton />;
  const bundle = record.record;
  const notHeld = meeting.startedAt === null;

  if (part === "actions") {
    const mine = loaded.invitees.find((i) => i.userId === userId) ?? null;
    const canManage = meeting.hostUserId === userId || mine?.role === "cohost";
    return (
      <div data-board-scroll className="h-full overflow-y-auto p-4 text-sm">
        <ActionItemsSection
          meeting={meeting}
          bundle={bundle}
          when={meetingWhen(meeting)}
          canManage={canManage}
          userId={userId}
          focusNoteId={null}
        />
      </div>
    );
  }

  return (
    <div data-board-scroll className="h-full overflow-y-auto p-4 text-sm leading-relaxed text-foreground">
      {part === "transcript" && <RecordTranscript bundle={bundle} notHeld={notHeld} />}
      {part === "notes" && <NoteList notes={bundle.liveNotes} empty={notHeld ? EMPTY.notes : "No notes were taken."} />}
      {part === "decisions" && (
        <NoteList notes={bundle.decisions} empty={notHeld ? EMPTY.decisions : "Nothing was decided."} />
      )}
      {part === "summary" &&
        (bundle.summary !== null ? (
          <p className="whitespace-pre-wrap">{bundle.summary.text}</p>
        ) : (
          <p className="text-muted-foreground">
            {meeting.endedAt === null ? "The summary is written when the meeting ends." : "No summary was written."}
          </p>
        ))}
    </div>
  );
}

function RecordTranscript({
  bundle,
  notHeld,
}: {
  bundle: MeetingRecordBundle;
  notHeld: boolean;
}) {
  const lines = readableTranscript(bundle.transcript);
  const endRef = useFollowNewest(lines.at(-1)?.id ?? null);
  if (lines.length === 0) {
    return (
      <p className="text-muted-foreground">
        {notHeld ? "Lines appear here once the note-taker is transcribing." : "Nothing was transcribed."}
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {lines.map((line) => (
        <li key={line.id}>
          <strong className="mr-1.5 font-semibold">{displayNameFor(bundle.names, line.identity, line.speaker)}</strong>
          {line.text}
        </li>
      ))}
      <li ref={endRef} aria-hidden="true" />
    </ul>
  );
}
