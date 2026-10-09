"use client";

/**
 * MeetingBoard — the meeting as a BOARD instead of a wall of faces.
 *
 * The board IS the person's own Board (`UserBoard`, the host `/board`
 * renders — features/board, consumed, never forked): every item type in the
 * catalog, the tools, shapes, frames, layers, shelf, undo, drop and paste, the
 * agent tools and the item bridge. A meeting's board is a SAVED BOARD: the
 * viewer's own `projects.boards` row linked to the meeting
 * (`settings.meeting_id`, `getMeetingBoard`), opened with a "Meeting notes"
 * frame whose tiles are the meeting's live parts (item type `meeting_part`,
 * features/board/items/meeting-items.tsx) — which can also go on any other
 * board. It is listed with the person's boards and opens at /board/<id> too.
 * A guest has no account to save a board in: the same document is kept in
 * this browser (`useGuestMeetingBoard`).
 *
 * ZERO WRAPPERS (features/meet/FEATURE.md): everything that is the meeting is
 * the package's exported piece, composed — `ConsentNotice`, `AttendanceNotice`
 * and `RecordingIndicator` render for every participant exactly as the
 * package ships them, the faces are `ParticipantTile` (PeopleStrip), captions
 * are `Captions`, and the bottom is the package's `ControlBar` (its chat,
 * people and Meeting assistant panels included). The root carries the
 * package's `mx-meet` class so those pieces sit in the structure and tokens
 * they were built for. People and captions float in screen space over the
 * board, never on the plane.
 *
 * Code splitting: the board (engine + every item type's body) is the SAME one
 * `ssr: false` edge `/board` uses, rendered only once this board is chosen
 * and its document is ready.
 */

import dynamic from "next/dynamic";
import { type ReactNode } from "react";
import { ExternalLink, Lock } from "lucide-react";
import {
  participantSummary,
  useElapsed,
  useIsHost,
  useMeetSnapshot,
  type MeetingRecord,
} from "@ai-matrx/meet/react";
// The Meet skin's PARTS — the Board composes them, never package internals
// (@ai-matrx/meet S1: the in-call UI is a skin).
import {
  AttendanceNotice,
  Captions,
  ConsentNotice,
  ControlBar,
  HostMenu,
  RecordingIndicator,
} from "@ai-matrx/meet/skins/meet";
import { formatDurationMs } from "@ai-matrx/kit/format";
import { Button } from "@/components/ui/button";
import { ShimmerText } from "@/components/loaders/ShimmerText";
import { ErrorNotice } from "@ai-matrx/design-system";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";
import type { BoardDocument } from "@/features/board/board/document";
import type { Camera } from "@/features/board/engine/camera";
import { useSavedBoard } from "@/features/board/persistence/useSavedBoard";
import { meetingNotesDocument } from "@/features/board/items/meeting-items.logic";
import { BoardOrganizationProvider } from "@/features/board/items/board-organization";
import { LayoutSwitch, type MeetingLayoutChoice } from "./LayoutSwitch";
import { PeopleStrip } from "./PeopleStrip";
import { useGuestMeetingBoard } from "./useGuestMeetingBoard";

const OPENING = "Opening the board…";

const UserBoard = dynamic(() => import("@/features/board/home/UserBoard").then((m) => m.UserBoard), {
  ssr: false,
  loading: () => <BoardMessage>{<ShimmerText text={OPENING} />}</BoardMessage>,
});

interface FrameProps {
  onLayout: (next: MeetingLayoutChoice) => void;
  headerControls?: ReactNode;
}

export function MeetingBoard({
  meeting,
  onLayout,
  headerControls,
}: FrameProps & { meeting: MeetingRecord }) {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  return isAuthenticated ? (
    <SavedMeetingBoard meeting={meeting} onLayout={onLayout} headerControls={headerControls} />
  ) : (
    <GuestMeetingBoard meeting={meeting} onLayout={onLayout} headerControls={headerControls} />
  );
}

/** A signed-in viewer: their saved board for this meeting. */
function SavedMeetingBoard({ meeting, ...frame }: FrameProps & { meeting: MeetingRecord }) {
  const saved = useSavedBoard({
    meeting: { id: meeting.id, title: meeting.title, seed: () => meetingNotesDocument(meeting.id) },
  });
  const ready = saved.state === "ready" ? saved : null;
  const byline = !ready
    ? undefined
    : ready.saveError
      ? `Not saved: ${ready.saveError}`
      : ready.saving
        ? "Saving…"
        : ready.lastSavedAt
          ? "Saved"
          : undefined;
  return (
    <MeetingBoardFrame
      {...frame}
      byline={byline}
      boardHref={ready ? `/board/${ready.board.id}` : null}
    >
      {saved.state === "loading" && (
        <BoardMessage>
          <ShimmerText text={OPENING} />
        </BoardMessage>
      )}
      {saved.state === "failed" && (
        <BoardMessage>
          <ErrorNotice
            className="max-w-md"
            title="This meeting's board could not be opened"
            message={saved.reason}
            operation="Open meeting board"
            calls={["boards"]}
            actions={<Button variant="primary" onClick={saved.retry}>Try again</Button>}
          />
        </BoardMessage>
      )}
      {ready && (
        <>
          {ready.board.problems.length > 0 && (
            <ErrorNotice
              size="compact"
              className="absolute bottom-16 left-4 z-40 max-w-md"
              title="Parts of this board could not be read"
              message={`They were left out: ${ready.board.problems.join("; ")}`}
              operation="Read board"
              details={{ problems: ready.board.problems }}
            />
          )}
          <BoardOrganizationProvider value={ready.board.organizationId}>
            <BoardCanvas
              key={ready.board.id}
              title={meeting.title}
              doc={ready.board.doc}
              viewerCamera={ready.board.viewerCamera}
              onChange={ready.save}
              onCamera={ready.saveCamera}
            />
          </BoardOrganizationProvider>
        </>
      )}
    </MeetingBoardFrame>
  );
}

/** A guest: the same board document, kept in this browser. */
function GuestMeetingBoard({ meeting, ...frame }: FrameProps & { meeting: MeetingRecord }) {
  const board = useGuestMeetingBoard(meeting.id, () => meetingNotesDocument(meeting.id));
  return (
    <MeetingBoardFrame {...frame} byline="Kept in this browser" boardHref={null}>
      <BoardCanvas
        title={meeting.title}
        doc={board.doc}
        viewerCamera={board.viewerCamera}
        onChange={board.save}
        onCamera={board.saveCamera}
        guest
      />
    </MeetingBoardFrame>
  );
}

function BoardCanvas({ guest = false, ...props }: {
  guest?: boolean;
  title: string;
  doc: BoardDocument;
  viewerCamera: Camera | null;
  onChange: (build: () => BoardDocument) => void;
  onCamera: (camera: Camera) => void;
}) {
  return (
    <div className="absolute inset-0">
      {/* A guest has no account: only what works without one can be added. */}
      <UserBoard {...props} guest={guest} />
    </div>
  );
}

/** The meeting around the board: notices, header, people, captions, controls. */
function MeetingBoardFrame({
  onLayout,
  headerControls,
  byline,
  boardHref,
  children,
}: FrameProps & { byline?: string; boardHref: string | null; children: ReactNode }) {
  return (
    <div className="mx-meet">
      <ConsentNotice />
      <AttendanceNotice />
      <BoardHeader onLayout={onLayout} headerControls={headerControls} byline={byline} boardHref={boardHref} />
      <div className="relative min-h-0 flex-1">
        {children}
        {/* Screen space over the board: faces never shrink when it zooms out. */}
        <div className="pointer-events-none absolute inset-0 z-20">
          <div className="absolute inset-x-0 bottom-16 flex justify-center">
            <Captions />
          </div>
          <PeopleStrip />
        </div>
      </div>
      <ControlBar />
    </div>
  );
}

function BoardMessage({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 p-6">{children}</div>;
}

// ── header ───────────────────────────────────────────────────────────────────

/** Its own component so the per-second clock and roster changes re-render
 * only this line, never the board. */
function BoardHeader({
  onLayout,
  headerControls,
  byline,
  boardHref,
}: FrameProps & { byline?: string; boardHref: string | null }) {
  const snapshot = useMeetSnapshot();
  const isHost = useIsHost();
  const elapsed = useElapsed(snapshot?.meeting?.startedAt ?? null);
  return (
    <>
      <header className="mx-meet__header">
        <h1 className="mx-meet__title">{snapshot?.meeting?.title ?? "Meeting"}</h1>
        <span className="mx-meet__meta">
          {`${participantSummary(snapshot?.participants ?? [])}${elapsed > 0 ? ` · ${formatDurationMs(elapsed)}` : ""}`}
        </span>
        <RecordingIndicator />
        {snapshot?.locked === true && (
          <span className="mx-meet__badge">
            <Lock className="h-3 w-3" /> Locked
          </span>
        )}
        {byline ? <span className="mx-meet__meta">{byline}</span> : null}
        {/* The package's own host menu (lock / end), @ai-matrx/meet 0.7.5. */}
        {isHost && <HostMenu />}
        {headerControls}
        {boardHref ? (
          <a
            href={boardHref}
            target="_blank"
            rel="noreferrer"
            title="Open this board on its own page"
            aria-label="Open this board on its own page"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : null}
        <LayoutSwitch value="board" onChange={onLayout} />
      </header>
      {snapshot?.phase === "in_call" && snapshot.connection !== "stable" && (
        <p className="mx-meet__banner" role="status">
          Reconnecting…
        </p>
      )}
    </>
  );
}
