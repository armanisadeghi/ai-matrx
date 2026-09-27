"use client";

/**
 * The live "Meeting notes" tiles on the Board. Every line is the package's
 * AI seam (`useMeetAi`): durable notes, decisions and action items delivered
 * by the room, the reconciled transcript (captions replaced by durable rows,
 * D16), and the wrap-up summary once one exists. Nothing is computed here, and
 * an empty section says what will appear in it rather than looking broken.
 *
 * The note-taker's controls and the question box stay in the package's
 * Meeting assistant panel (the control bar), which works in this layout too.
 */

import { useEffect, useRef } from "react";
import { useMeetAi, type MeetingNote } from "@ai-matrx/meet/react";
import type { TileStatusValue } from "@/features/spatial/streams/useSourceStatus";

export type MeetingSection = "transcript" | "notes" | "decisions" | "actions" | "summary";

/** The tile's status dot: live while the note-taker is transcribing. */
export function useMeetingSectionStatus(): TileStatusValue {
  const { noteTaker } = useMeetAi();
  if (noteTaker.state === "transcribing" || noteTaker.state === "joining") {
    return { status: "streaming", progress: null };
  }
  if (noteTaker.state === "ended") return { status: "complete", progress: null };
  return { status: "idle", progress: null };
}

export function MeetingSectionBody({ section }: { section: MeetingSection }) {
  const ai = useMeetAi();
  return (
    <div data-spatial-scroll className="h-full overflow-y-auto p-4 text-sm leading-relaxed text-foreground">
      <p className="mb-3 text-xs text-muted-foreground">{ai.noteTakerLabel}</p>
      {section === "transcript" && <Transcript />}
      {section === "notes" && (
        <NoteList notes={ai.notes} empty="Notes appear here as the meeting goes on." />
      )}
      {section === "decisions" && (
        <NoteList notes={ai.decisions} empty="Nothing has been decided yet." />
      )}
      {section === "actions" && (
        <NoteList notes={ai.actionItems} empty="No action items yet." withOwner />
      )}
      {section === "summary" &&
        (ai.summary !== null ? (
          <p className="whitespace-pre-wrap">{ai.summary.text}</p>
        ) : (
          <p className="text-muted-foreground">
            The wrap-up summary is written when the meeting ends. It also appears on this
            meeting&apos;s record, behind the same link.
          </p>
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

/** The transcript, following the newest line unless the reader scrolled up. */
function Transcript() {
  const { transcript } = useMeetAi();
  const endRef = useRef<HTMLLIElement>(null);
  const lastLine = transcript.at(-1)?.id ?? null;

  useEffect(() => {
    const end = endRef.current;
    const scroller = end?.closest<HTMLElement>("[data-spatial-scroll]");
    if (!end || !scroller) return;
    const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
    if (nearBottom) scroller.scrollTop = scroller.scrollHeight;
  }, [lastLine]);

  if (transcript.length === 0) {
    return (
      <p className="text-muted-foreground">
        What people say appears here, by speaker, once the note-taker is transcribing. Start it
        from the Meeting assistant in the control bar.
      </p>
    );
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
