"use client";

/**
 * Feature items on a board: Task, War Room, Meeting, Workflow run, Research,
 * Project. Each Body is the feature's canonical component — the real task
 * editor, the room's own Stage, the meeting's home (`MeetingDetail`), the run
 * stage, the research report, the project's workspace — never a board-only
 * copy (see ./types.ts). The pure rules (matching, ordering, pick batching)
 * live in ./feature-items.logic.ts.
 *
 * Every Body mounts its feature's agent surface for the tile's record through
 * the SAME host the feature's page uses (`TaskEditorBody`,
 * `WarRoomSurfaceHost`, `MeetingDetail` → `MeetingSurfaceHost`,
 * `WorkflowRunSurfaceHost`, `ResearchTopicSurfaceHost`,
 * `ProjectRecordWorkspace`), so no item needs a separate `Host`; the board's
 * `SurfaceActivity` keeps every tile but the live one dormant.
 *
 * Every body that reads a record says honestly when it cannot: the canonical
 * `<AccessGate token id/>` resolves denied / in Trash / missing / signed out.
 */

import { createElement, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ExternalLink, FlaskConical, FolderKanban, ListTodo, Loader2, UsersRound, Video, Workflow } from "lucide-react";
import { ArchivedDisclosure, Skeleton } from "@ai-matrx/design-system";
import { Input } from "@ai-matrx/design-system/controls";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ReadFailure } from "@ai-matrx/design-system";
import { ReadGate, readOf, type ReadOutcome } from "@ai-matrx/design-system";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { useAutoFocus } from "@/lib/dom/useAutoFocus";
// Task
import TaskEditor from "@/features/tasks/components/TaskEditor";
import { useEnsureTaskLoaded } from "@/features/tasks/hooks/useEnsureTaskLoaded";
import { TaskCreatePanel } from "@/features/tasks/widgets/quick-create/TaskCreatePanel";
import { TasksResourcePicker } from "@/features/resource-manager/resource-picker/TasksResourcePicker";
// War Room
import { listSessions } from "@/features/war-room/service";
import { createWarRoomSession, hydrateWarRoomSession } from "@/features/war-room/redux/thunks";
import {
  selectOrderedGalleryThreadIds,
  selectSessionById,
  selectThreadsStatusForRoom,
} from "@/features/war-room/redux/selectors";
import { StageView } from "@/features/war-room/components/room/StageView";
import { RoomViewProvider } from "@/features/war-room/components/room/roomViewContext";
import { WarRoomSurfaceHost } from "@/features/war-room/components/room/WarRoomSurfaceHost";
import { roomColorOf, roomIconOf } from "@/features/war-room/components/room/roomIdentity";
import type { WarRoomSession } from "@/features/war-room/types";
import { useWarRoomView } from "@/features/war-room/hooks/useWarRoomView";
// Meeting
import { readMyMeetings, useMeetingsDirectory } from "@/features/meet/hooks/useMeetingsDirectory";
import { createMeetRepository } from "@ai-matrx/meet/react";
import { supabase } from "@/utils/supabase/client";
import { getStore } from "@/lib/redux/store-singleton";
import type { AppDispatch } from "@/lib/redux/store";
import { fetchRuns } from "@/features/workflow-runtime/discovery/fetchRuns";
import { fetchWorkflowFacts } from "@/features/workflow-runtime/discovery/service";
import { findMeetings, findWorkflowRuns } from "./record-finders";
import { MeetingHomeAndRoom } from "@/features/meet/components/MeetingHomeAndRoom";
import { useMeetingLive } from "@/features/meet/hooks/useMeetingLive";
import { useBoardCameraStore } from "../engine/react";
import { MeetingFormDialog } from "@/features/meet/components/manage/MeetingFormDialog";
import { useMeetingActions } from "@/features/meet/hooks/useMeetingActions";
// Workflow run
import { useRunsList } from "@/features/workflow-runtime/discovery/useRunsList";
import { useWorkflowFacts } from "@/features/workflow-runtime/discovery/useWorkflowFacts";
import { RunStatusChip } from "@/features/workflow-runtime/run-status";
import { loadRunSurface, RunRecordUnreadable } from "@/features/workflow-runtime/surface/run-surface.thunk";
import { selectRunSurface } from "@/features/workflow-runtime/redux/workflow-runs.selectors";
import { useWorkflowRun } from "@/features/workflow-runtime/hooks/useWorkflowRun";
import { RunStage } from "@/features/workflow-runtime/components/run/RunStage";
import { RunStartForm } from "@/features/workflow-runtime/components/RunStartForm";
import { WorkflowListDropdown } from "@/features/workflow-runtime/listings/WorkflowListDropdown";
import { WorkflowRunSurfaceHost } from "@/features/workflow-runtime/agent-surface/WorkflowRunSurfaceHost";
import { MasterworkRulesProvider } from "@/features/masterwork/rules-context/MasterworkRulesContext";
// Research
import { useAllTopics } from "@/features/research/hooks/useResearchState";
import { TopicProvider, useTopicContext } from "@/features/research/context/ResearchContext";
import DocumentViewer from "@/features/research/components/document/DocumentViewer";
import { ResearchTopicSurfaceHost } from "@/features/research/components/shell/ResearchTopicSurfaceHost";
import ResearchInitForm from "@/features/research/components/init/ResearchInitForm";
// Project
import { ProjectPicker } from "@/features/projects/components/ProjectPicker";
import { ProjectRecordWorkspace } from "@/features/projects/components/ProjectWorkspace";
import { useProject } from "@/features/projects/hooks";
import { ProjectCreatePanel } from "@/features/projects/components/ProjectCreatePanel";

import type { NodeSource } from "../board/document";
import { entityComments, type BoardItemType, type ItemBodyProps, type PickerProps, type PlacedItem } from "./types";
import {
  FEATURE_ENTITY,
  MEETING_PHASE_LABEL,
  createPickBatcher,
  entityIdOf,
  entitySource,
  hrefFor,
  matchesEntity,
  meetingPhase,
  orderMeetingsForPicker,
  titleToAdopt,
  type FeatureEntityKey,
} from "./feature-items.logic";
import { useMeetingStatus, useTaskStatus, useWorkflowRunStatus } from "./item-status";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

// ─── Shared pieces ───────────────────────────────────────────────────────────

/** The registry's door for a canonical token — one place owns every route. */
const registryHref = (token: string) => (id: string) => tryGetEntityInfo(token)?.hrefFor?.(id) ?? null;

/** Adopt the record's own name as the tile title once it is known or renamed. */
function useAdoptTitle(
  source: NodeSource,
  tileTitle: string,
  recordTitle: string | null | undefined,
  onSource: ItemBodyProps["onSource"],
) {
  const next = titleToAdopt(tileTitle, recordTitle);
  useEffect(() => {
    if (next) onSource(source, next);
  }, [next, source, onSource]);
}

/**
 * A tile whose source names no record. Only types with "Start new" place a
 * draft; any other empty reference is a board that was edited by hand, so it
 * says what is missing and where to find the real thing.
 */
function NoRecordBody({ what, href, label }: { what: string; href: string; label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-sm font-medium text-foreground">This tile does not point at a {what}</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        Remove this tile and bring the {what} in again.
      </p>
      <DoorButton href={href}>{label}</DoorButton>
    </div>
  );
}

function BodySkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label={label}>
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

/** The one-line strip above a body: identity on the left, doors on the right. */
function TileBar({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex min-h-10 shrink-0 items-center gap-2 border-b border-border bg-card/60 px-3 py-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </div>
  );
}

function DoorButton({ href, children, primary }: { href: string; children: ReactNode; primary?: boolean }) {
  return (
    <Button asChild variant={primary ? "primary" : "outline"}>
      <Link href={href}>{children}</Link>
    </Button>
  );
}

/**
 * A searchable list of the person's records for a "Bring in" picker. The rows
 * always come from the feature's canonical read; this is only the chooser, and
 * the read's outcome goes through the canonical `ReadGate` so a failed read is
 * never shown as "nothing here".
 */
export function RecordList<T>({
  rows,
  read,
  rowKey,
  rowText,
  renderRow,
  onChoose,
  onCancel,
  emptyState,
  isArchived,
}: {
  rows: readonly T[];
  read: ReadOutcome;
  rowKey: (row: T) => string;
  rowText: (row: T) => string;
  renderRow: (row: T) => ReactNode;
  onChoose: (row: T) => void;
  onCancel: () => void;
  emptyState: ReactNode;
  /**
   * THE ARCHIVED-ITEMS LAW for pickers: rows this names are hidden until the
   * person opens the "Archived" disclosure (one click). Omit only when the
   * feature's own read already returns live rows alone.
   */
  isArchived?: (row: T) => boolean;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = isArchived ? rows.filter(isArchived).length : 0;
  const shown = isArchived && !showArchived ? rows.filter((r) => !isArchived(r)) : rows;
  return (
    <div className="flex flex-col gap-3">
      <ReadGate
        read={read}
        isEmpty={shown.length === 0 && archivedCount === 0}
        empty={<div className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyState}</div>}
        loading={
          <div className="space-y-2 p-2" aria-busy="true" aria-label={`Loading ${read.what ?? "the list"}`}>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        }
      >
        <Command className="rounded-lg border border-border">
          <CommandInput placeholder="Search…" className="text-base" />
          <CommandList className="max-h-[min(420px,60dvh)]">
            <CommandEmpty>Nothing matches.</CommandEmpty>
            {shown.map((row) => (
              <CommandItem
                key={rowKey(row)}
                value={`${rowText(row)} ${rowKey(row)}`}
                onSelect={() => onChoose(row)}
                className="flex items-center gap-2"
              >
                {renderRow(row)}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </ReadGate>
      {isArchived ? (
        <ArchivedDisclosure count={archivedCount} open={showArchived} onOpenChange={setShowArchived} />
      ) : null}
      <div className="flex justify-end">
        <Button type="button" variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── Task ────────────────────────────────────────────────────────────────────

function TaskPicker({ onPick, onCancel }: PickerProps) {
  // "Add (3)" reports each task separately; place them together.
  const add = createPickBatcher(onPick);
  return (
    <div className="rounded-lg border border-border">
      <TasksResourcePicker
        onBack={onCancel}
        onSelect={(picked) => {
          if (picked.type === "task") {
            add({
              title: picked.data.title?.trim() || "Untitled task",
              source: entitySource(FEATURE_ENTITY.task, picked.data.id),
            });
          } else {
            add({
              title: picked.data.name?.trim() || "Project",
              source: entitySource(FEATURE_ENTITY.project, picked.data.id),
            });
          }
        }}
      />
    </div>
  );
}

/** A new task: the canonical create form, which becomes the task once saved. */
function TaskDraftBody({ onSource }: ItemBodyProps) {
  return (
    <div className="h-full min-h-0 overflow-y-auto p-3">
      <TaskCreatePanel
        enableAi={false}
        saveLabel="Create task"
        onCreated={(taskId, title) => onSource(entitySource(FEATURE_ENTITY.task, taskId), title || undefined)}
      />
    </div>
  );
}

function TaskRecordBody({ id, source, title, onSource }: ItemBodyProps & { id: string }) {
  const { task, loading, missing } = useEnsureTaskLoaded(id);
  useAdoptTitle(source, title, task?.title, onSource);
  if (loading) return <BodySkeleton label="Opening the task" />;
  if (missing || !task) return <AccessGate token="task" id={id} fallbackHref="/tasks" fallbackLabel="Your tasks" />;
  return (
    <div className="h-full min-h-0">
      <TaskEditor taskId={id} embedded />
    </div>
  );
}

function TaskBody(props: ItemBodyProps) {
  const id = entityIdOf(props.source);
  return id ? <TaskRecordBody key={id} id={id} {...props} /> : <TaskDraftBody {...props} />;
}

// ─── War Room ────────────────────────────────────────────────────────────────

function RoomBadge({ session, size = "sm" }: { session: Pick<WarRoomSession, "icon" | "color">; size?: "sm" | "md" }) {
  const color = roomColorOf(session.color);
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-md",
        size === "md" ? "size-7" : "size-6",
        color.tint,
        color.text,
      )}
    >
      {/* The room's chosen icon — a fixed module-level component, looked up by name. */}
      {createElement(roomIconOf(session.icon), { className: "size-3.5" })}
    </span>
  );
}

function WarRoomPicker({ onPick, onCancel }: PickerProps) {
  const [attempt, setAttempt] = useState(0);
  // Each answer is stamped with the attempt it answers, so "loading" is simply
  // "no answer for this attempt yet" — no state set inside the effect.
  const [answer, setAnswer] = useState<{ attempt: number; rooms: WarRoomSession[]; error: unknown }>({
    attempt: -1,
    rooms: [],
    error: null,
  });
  useEffect(() => {
    let live = true;
    listSessions()
      .then((rooms) => {
        if (live) setAnswer({ attempt, rooms, error: null });
      })
      .catch((error: unknown) => {
        if (live) setAnswer((prev) => ({ attempt, rooms: prev.rooms, error: error ?? true }));
      });
    return () => {
      live = false;
    };
  }, [attempt]);
  const rooms = answer.rooms;
  return (
    <RecordList
      rows={rooms}
      read={readOf(
        { loading: answer.attempt !== attempt, error: answer.attempt === attempt ? answer.error : null },
        { what: "your War Rooms", onRetry: () => setAttempt((n) => n + 1) },
      )}
      rowKey={(r) => r.id}
      rowText={(r) => r.title}
      onChoose={(r) =>
        onPick([
          {
            title: r.title,
            source: entitySource(FEATURE_ENTITY.warRoom, r.id),
          },
        ])
      }
      onCancel={onCancel}
      emptyState="No War Rooms yet"
      renderRow={(r) => (
        <>
          <RoomBadge session={r} />
          <span className="min-w-0 flex-1 truncate">{r.title}</span>
          {r.last_opened_at ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              opened {formatRelativeTime(r.last_opened_at)}
            </span>
          ) : null}
        </>
      )}
    />
  );
}

/** A new room: name it and create it here, then it is the live room tile. */
function WarRoomDraftBody({ onSource }: ItemBodyProps) {
  const dispatch = useAppDispatch();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  // An agent may place this tile, and a tile mounts again on wake: never over
  // a field the person is typing in (lib/dom/focus-guard).
  const nameRef = useRef<HTMLInputElement | null>(null);
  useAutoFocus(nameRef);
  const create = async () => {
    if (busy) return;
    setBusy(true);
    // The canonical create: it asks for an organization when none is chosen
    // and raises its own error toast; null means nothing was created.
    const session = await dispatch(createWarRoomSession({ title: name.trim() || undefined }));
    setBusy(false);
    if (session) onSource(entitySource(FEATURE_ENTITY.warRoom, session.id), session.title);
  };
  return (
    <form
      className="flex h-full flex-col justify-center gap-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <label htmlFor="board-new-war-room" className="text-sm font-medium text-foreground">
        Name your War Room
      </label>
      <Input
        id="board-new-war-room"
        ref={nameRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Q4 launch"
      />
      <p className="text-xs text-muted-foreground">
        Several threads of work, side by side.
      </p>
      <div className="flex justify-end">
        <Button icon={busy ? <Loader2 className="animate-spin" /> : null} variant="primary" type="submit" disabled={busy}>
          Create War Room
        </Button>
      </div>
    </form>
  );
}

/**
 * A room on the board: the room's own Stage (its thread watchlist, add / import
 * / quick-task, drag to reorder, parked threads, and each thread's full surface
 * on select) under the room's own agent surface (`WarRoomSurfaceHost`, the
 * same host the room route mounts). The tile holds a VIEW of the room
 * (`useWarRoomView`): the room is read and "opened" once per session and
 * shared with every other view of it, so waking, remounting or a second tile
 * of the same room re-reads nothing and never flashes a skeleton. A view never
 * changes which room is the active one.
 */
function WarRoomRecordBody({ id, source, title, onSource }: ItemBodyProps & { id: string }) {
  const dispatch = useAppDispatch();
  const session = useAppSelector(selectSessionById(id));
  const status = useAppSelector(selectThreadsStatusForRoom(id));
  const threadCount = useAppSelector(selectOrderedGalleryThreadIds(id)).length;
  useWarRoomView(id);
  const retry = () => void dispatch(hydrateWarRoomSession(id));
  useAdoptTitle(source, title, session?.title, onSource);

  const roomHref = `/war-room/${id}`;
  if (!session && status === "error") {
    return (
      <AccessGate
        token="war_room"
        id={id}
        onRetry={retry}
        fallbackHref="/war-room/all"
        fallbackLabel="Your War Rooms"
      />
    );
  }
  if (!session) return <BodySkeleton label="Opening the War Room" />;

  let stage: ReactNode;
  if (status === "error") {
    stage = (
      <ReadFailure error={true} what="this room's threads" onRetry={retry} className="m-2" />
    );
  } else if (status !== "ready") {
    stage = (
      <div className="space-y-2 p-2.5" aria-busy="true" aria-label="Loading threads">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  } else {
    stage = <StageView sessionId={id} />;
  }

  return (
    <RoomViewProvider>
      <WarRoomSurfaceHost sessionId={id}>
        {/* The Stage's thread surface sits under the shell's glass header on the
            room route; a tile has no glass header, so the offset is zero here. */}
        <div className="flex h-full min-h-0 flex-col [--shell-header-h:0px]">
          <TileBar
            actions={
              <DoorButton href={roomHref} primary>
                <ExternalLink className="size-3.5" />
                Open room
              </DoorButton>
            }
          >
            <RoomBadge session={session} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{session.title}</p>
              <p className="text-[11px] text-muted-foreground">
                {threadCount === 1 ? "1 thread" : `${threadCount} threads`}
              </p>
            </div>
          </TileBar>
          <div className="min-h-0 flex-1">{stage}</div>
        </div>
      </WarRoomSurfaceHost>
    </RoomViewProvider>
  );
}

function WarRoomBody(props: ItemBodyProps) {
  const id = entityIdOf(props.source);
  return id ? <WarRoomRecordBody key={id} id={id} {...props} /> : <WarRoomDraftBody {...props} />;
}

/**
 * Mounted for as long as the tile is on the board, outside the part that
 * sleeps: holds the tile's view of the room, so a sleeping body keeps the
 * room's session open and waking re-opens nothing.
 */
function WarRoomKeep({ source }: { tileId: string; source: NodeSource }) {
  useWarRoomView(entityIdOf(source));
  return null;
}

// ─── Meeting ─────────────────────────────────────────────────────────────────

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MeetingPicker({ onPick, onCancel }: PickerProps) {
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
      onChoose={(m) =>
        onPick([
          {
            title: m.title,
            source: entitySource(FEATURE_ENTITY.meeting, m.id),
          },
        ])
      }
      onCancel={onCancel}
      emptyState="No meetings yet"
      renderRow={(m) => {
        const phase = meetingPhase(m);
        return (
          <>
            <Video className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{m.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {MEETING_PHASE_LABEL[phase]}
              {formatWhen(m.scheduledFor ?? m.startedAt) ? ` · ${formatWhen(m.scheduledFor ?? m.startedAt)}` : ""}
            </span>
          </>
        );
      }}
    />
  );
}

/**
 * A new meeting: THE ONE MEETING FORM, and the saved meeting lands on the
 * board. Like the Meetings page, the form waits for an organization to create
 * it in — with none chosen, the canonical gate asks the person for one.
 */
function MeetingCreateDialog({ onPick, onCancel }: PickerProps) {
  const actions = useMeetingActions();
  const ready = actions.ready;
  const asked = useRef(false);
  useEffect(() => {
    if (ready || asked.current) return;
    asked.current = true;
    ensureOrgId(null).catch(() => onCancel());
  }, [ready, onCancel]);
  if (!ready) return null;
  return (
    <MeetingFormDialog
      open
      onOpenChange={(open) => !open && onCancel()}
      mode={{ kind: "create" }}
      onSaved={(m) => onPick([{ title: m.title, source: entitySource(FEATURE_ENTITY.meeting, m.id) }])}
    />
  );
}

/**
 * A meeting on the board: the meeting's own home (`MeetingDetail`, the body of
 * /meetings/[id]) — details, guests, occurrences, settings and the record,
 * with every action — in its embedded chrome, under the meeting's own agent
 * surface (which `MeetingDetail` mounts itself). Join runs the live room IN
 * the tile (`MeetingHomeAndRoom`): the board stays, Leave returns to the
 * home. The saved source stays the meeting reference; a reload opens the home
 * (a call needs the person's own click).
 *
 * While the room is up the tile is held awake, so a call keeps running while
 * the person pans away. The hold lives here, not in a `Keep`: only the body
 * knows the room is open, and a body that holds is never put to sleep.
 */
function MeetingBody({ tileId, source, title, onSource }: ItemBodyProps) {
  const id = entityIdOf(source);
  const [recordTitle, setRecordTitle] = useState<string | null>(null);
  const [inRoom, setInRoom] = useState(false);
  const board = useBoardCameraStore();
  useAdoptTitle(source, title, recordTitle, onSource);
  useEffect(() => (inRoom ? board.holdAwake(tileId) : undefined), [inRoom, board, tileId]);
  if (!id) return <NoRecordBody what="meeting" href="/meetings" label="Your meetings" />;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <MeetingHomeAndRoom
        key={id}
        meetingId={id}
        onMeeting={(m) => setRecordTitle(m.title)}
        onRoomChange={setInRoom}
      />
    </div>
  );
}

/**
 * Holds the meeting's live channel for as long as the tile is on the board, so
 * an edit or an RSVP made elsewhere while the tile sleeps is in the store
 * (and on screen) when it wakes.
 */
function MeetingKeep({ source }: { tileId: string; source: NodeSource }) {
  useMeetingLive(entityIdOf(source));
  return null;
}

// ─── Workflow run ────────────────────────────────────────────────────────────

const runHref = (id: string) => `/workflows/runs/${encodeURIComponent(id)}`;

function WorkflowRunPicker({ onPick, onCancel }: PickerProps) {
  // Runs are listed by access in every organization (useRunsList), so the
  // picker never waits on a selected organization.
  const { rows, loading, error, refresh } = useRunsList();
  const facts = useWorkflowFacts(rows.map((r) => r.definitionId));
  const nameOf = (definitionId: string | null) => (definitionId ? facts.get(definitionId)?.name : undefined) ?? null;
  return (
    <RecordList
      rows={rows}
      read={readOf({ loading, error }, { what: "your workflow runs", onRetry: refresh })}
      rowKey={(r) => r.runId}
      rowText={(r) => `${nameOf(r.definitionId) ?? "Workflow run"} ${r.status}`}
      onChoose={(r) =>
        onPick([
          {
            title: nameOf(r.definitionId) ?? "Workflow run",
            source: entitySource(FEATURE_ENTITY.workflowRun, r.runId),
          },
        ])
      }
      onCancel={onCancel}
      emptyState="No runs yet"
      renderRow={(r) => (
        <>
          <Workflow className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{nameOf(r.definitionId) ?? "Unnamed workflow"}</span>
          <RunStatusChip status={r.status} />
          {r.startedAt ? (
            <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
              {formatRelativeTime(r.startedAt, { absolute: "date" })}
            </span>
          ) : null}
        </>
      )}
    />
  );
}

/** A new run: choose the workflow, fill its served start form, and the run lands on the board. */
function WorkflowRunStartPicker({ onPick, onCancel }: PickerProps) {
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <WorkflowListDropdown activeWorkflowId={workflowId} onSelect={setWorkflowId} />
      {workflowId ? (
        <RunStartForm
          key={workflowId}
          definitionId={workflowId}
          startLabel="Run"
          onStarted={(runId) =>
            onPick([{ title: "Workflow run", source: entitySource(FEATURE_ENTITY.workflowRun, runId) }])
          }
          onCancel={onCancel}
        />
      ) : (
        <div className="flex justify-end">
          <Button type="button" variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The run's own stage under its own agent surface. The workflow + surface are
 * read once per run into the workflowRuns slice (`loadRunSurface`) and the
 * run's stream is held by the tile's `Keep`, so a tile that wakes, remounts or
 * sits beside another tile of the same run reattaches at once: no re-read, no
 * re-adoption, no skeleton, and never the floating window (`floatOnLeave`).
 */
function WorkflowRunBody({ source, title, onSource }: ItemBodyProps) {
  const dispatch = useAppDispatch();
  const runId = entityIdOf(source);
  const loaded = useAppSelector((state) => (runId ? selectRunSurface(runId)(state) : undefined));
  const [failure, setFailure] = useState<RunRecordUnreadable | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!runId || loaded) return undefined;
    let live = true;
    dispatch(loadRunSurface(runId)).catch((thrown: unknown) => {
      if (!live) return;
      setFailure(
        thrown instanceof RunRecordUnreadable ? thrown : new RunRecordUnreadable("workflow_run", runId, thrown),
      );
    });
    return () => {
      live = false;
    };
  }, [dispatch, runId, loaded, attempt]);
  useAdoptTitle(source, title, loaded?.name, onSource);

  if (!runId) return <NoRecordBody what="workflow run" href="/workflows/runs" label="Your runs" />;
  if (failure && !loaded) {
    return (
      <AccessGate
        token={failure.token}
        id={failure.recordId}
        error={failure.readError}
        onRetry={() => {
          setFailure(null);
          setAttempt((n) => n + 1);
        }}
        fallbackHref="/workflows/runs"
        fallbackLabel="Your runs"
      />
    );
  }
  if (!loaded) return <BodySkeleton label="Opening the run" />;
  return (
    <MasterworkRulesProvider masterworkId={loaded.definitionId}>
      <div className="flex h-full min-h-0 flex-col">
        <TileBar
          actions={
            <DoorButton href={runHref(runId)} primary>
              <ExternalLink className="size-3.5" />
              Open run
            </DoorButton>
          }
        >
          <Workflow className="size-4 shrink-0 text-muted-foreground" />
          <p className="truncate text-sm font-medium text-foreground">{loaded.name}</p>
        </TileBar>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* The run's own agent surface — the host the run page mounts. */}
          <WorkflowRunSurfaceHost
            runId={runId}
            workflowId={loaded.definitionId}
            workflowName={loaded.name}
            definition={loaded.definition}
          >
            <RunStage
              runId={runId}
              definitionId={loaded.definitionId}
              definition={loaded.definition}
              workflowName={loaded.name}
              config={loaded.config}
              floatOnLeave={false}
            />
          </WorkflowRunSurfaceHost>
        </div>
      </div>
    </MasterworkRulesProvider>
  );
}

/**
 * Mounted for as long as the tile is on the board, outside the part that
 * sleeps: holds the run's stream adoption (one per run, shared), so a sleeping
 * body keeps the run live in the store and waking reattaches to it.
 */
function WorkflowRunKeep({ source }: { tileId: string; source: NodeSource }) {
  useWorkflowRun(entityIdOf(source));
  return null;
}

// ─── Research ────────────────────────────────────────────────────────────────

function ResearchPicker({ onPick, onCancel }: PickerProps) {
  const topics = useAllTopics();
  return (
    <RecordList
      rows={topics.data ?? []}
      read={readOf(
        { isLoading: topics.isLoading, error: topics.error },
        { what: "your research topics", onRetry: topics.refresh },
      )}
      rowKey={(t) => t.id}
      rowText={(t) => t.name}
      onChoose={(t) =>
        onPick([
          {
            title: t.name,
            source: entitySource(FEATURE_ENTITY.research, t.id),
          },
        ])
      }
      onCancel={onCancel}
      emptyState="No research topics yet"
      renderRow={(t) => (
        <>
          <FlaskConical className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{t.name}</span>
          {t.status ? <span className="shrink-0 text-xs capitalize text-muted-foreground">{t.status}</span> : null}
        </>
      )}
    />
  );
}

function ResearchReport({ id, source, title, onSource }: ItemBodyProps & { id: string }) {
  const { topic, isLoading, error, refresh } = useTopicContext();
  useAdoptTitle(source, title, topic?.name, onSource);
  if (!topic && isLoading) return <BodySkeleton label="Opening the research topic" />;
  if (!topic) {
    return (
      <AccessGate
        token="research_topic"
        id={id}
        error={error ?? undefined}
        onRetry={() => void refresh()}
        fallbackHref="/research/topics"
        fallbackLabel="Your research"
      />
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TileBar
        actions={
          <DoorButton href={`/research/topics/${encodeURIComponent(id)}`} primary>
            <ExternalLink className="size-3.5" />
            Open topic
          </DoorButton>
        }
      >
        <FlaskConical className="size-4 shrink-0 text-muted-foreground" />
        <p className="truncate text-sm font-medium text-foreground">{topic.name}</p>
      </TileBar>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <DocumentViewer />
      </div>
    </div>
  );
}

/** A new topic: the Research start wizard, in place; the created topic becomes the tile. */
function ResearchDraftBody({ onSource }: ItemBodyProps) {
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <ResearchInitForm onCreated={(topicId, name) => onSource(entitySource(FEATURE_ENTITY.research, topicId), name)} />
    </div>
  );
}

function ResearchBody(props: ItemBodyProps) {
  const id = entityIdOf(props.source);
  if (!id) return <ResearchDraftBody {...props} />;
  return (
    <TopicProvider key={id} topicId={id}>
      {/* The topic's own agent surface — the host the topic workspace route mounts. */}
      <ResearchTopicSurfaceHost activeView="document">
        <ResearchReport id={id} {...props} />
      </ResearchTopicSurfaceHost>
    </TopicProvider>
  );
}

// ─── Project ─────────────────────────────────────────────────────────────────

function ProjectPickerPanel({ onPick, onCancel }: PickerProps) {
  return (
    <div className="flex flex-col gap-3">
      <ProjectPicker
        value={null}
        allowClear={false}
        showCreateButton
        onSelect={(projectId, name) => {
          if (projectId)
            onPick([
              {
                title: name?.trim() || "Project",
                source: entitySource(FEATURE_ENTITY.project, projectId),
              },
            ]);
        }}
      />
      <div className="flex justify-end">
        <Button type="button" variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ProjectRecordBody({ id, source, title, onSource }: ItemBodyProps & { id: string }) {
  const { project, loading, error, refresh } = useProject(id);
  useAdoptTitle(source, title, project?.name, onSource);
  if (loading && !project) return <BodySkeleton label="Opening the project" />;
  if (!project) {
    return (
      <AccessGate
        token="project"
        id={id}
        error={error ?? undefined}
        onRetry={() => void refresh()}
        fallbackHref="/projects"
        fallbackLabel="Your projects"
      />
    );
  }
  // The project's own workspace — hero with every inline editor, tasks,
  // resources, scopes, references — and its agent surface, exactly as the
  // project route renders it, without the route's shell chrome.
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TileBar
        actions={
          <DoorButton href={`/projects/${encodeURIComponent(id)}`} primary>
            <ExternalLink className="size-3.5" />
            Open project
          </DoorButton>
        }
      >
        <FolderKanban className="size-4 shrink-0 text-muted-foreground" />
        <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
      </TileBar>
      <div className="min-h-0 flex-1">
        <ProjectRecordWorkspace key={project.id} initialProject={project} chrome="embedded" />
      </div>
    </div>
  );
}

/** A new project: the canonical create form; the saved project becomes the tile. */
function ProjectDraftBody({ onSource }: ItemBodyProps) {
  return (
    <div className="h-full min-h-0 overflow-y-auto p-4">
      <ProjectCreatePanel
        enableAi={false}
        enableJsonImport={false}
        skipRedirect
        onSuccess={(project) => onSource(entitySource(FEATURE_ENTITY.project, project.id), project.name)}
        onClose={() => undefined}
      />
    </div>
  );
}

function ProjectBody(props: ItemBodyProps) {
  const id = entityIdOf(props.source);
  if (!id) return <ProjectDraftBody {...props} />;
  return <ProjectRecordBody key={id} id={id} {...props} />;
}

// ─── The catalog entries ─────────────────────────────────────────────────────

/** An existing feature record by id — the source every picker here builds (`entitySource`). */
const existing = (entity: FeatureEntityKey, fallback: string) => (id: string, title?: string): PlacedItem => ({
  title: title?.trim() || fallback,
  source: entitySource(entity, id),
});

const newDraft = (
  entity: typeof FEATURE_ENTITY.task | typeof FEATURE_ENTITY.warRoom | typeof FEATURE_ENTITY.research | typeof FEATURE_ENTITY.project,
  title: string,
): PlacedItem => ({
  title,
  source: entitySource(entity, null),
});

export const FEATURE_ITEMS: BoardItemType[] = [
  {
    key: FEATURE_ENTITY.task,
    surface: { name: "matrx-user/tasks" },
    comments: entityComments("task"),
    label: "Task",
    icon: ListTodo,
    group: "work",
    section: "work",
    accent: "orange",
    status: { useStatus: useTaskStatus },
    defaultSize: { w: 520, h: 640 },
    matches: matchesEntity(FEATURE_ENTITY.task),
    Body: TaskBody,
    startNew: {
      label: "Task",
      create: () => newDraft(FEATURE_ENTITY.task, "New task"),
    },
    bringIn: { label: "Tasks", Picker: TaskPicker },
    record: { place: existing(FEATURE_ENTITY.task, "Task"), searchToken: "task" },
    href: hrefFor(FEATURE_ENTITY.task, registryHref("task")),
    kindLabel: "task",
    // Checked 2026-10-02: draft and edits kept, one insert on create, an unsaved description still saves.
    sleeps: true,
  },
  {
    key: FEATURE_ENTITY.warRoom,
    surface: { name: "matrx-user/war-room" },
    comments: entityComments("war_room"),
    label: "War Room",
    icon: UsersRound,
    group: "features",
    section: "meetings",
    accent: "rose",
    status: { none: "A room has no single state; each thread shows its own." },
    defaultSize: { w: 560, h: 620 },
    matches: matchesEntity(FEATURE_ENTITY.warRoom),
    Body: WarRoomBody,
    Keep: WarRoomKeep,
    startNew: {
      label: "War Room",
      create: () => newDraft(FEATURE_ENTITY.warRoom, "New War Room"),
    },
    bringIn: { label: "War Room", Picker: WarRoomPicker },
    record: { place: existing(FEATURE_ENTITY.warRoom, "War Room"), searchToken: "war_room" },
    href: hrefFor(FEATURE_ENTITY.warRoom, registryHref("war_room")),
    kindLabel: "war room",
    // Checked 2026-10-02: hide/show, remove+undo and a second tile of the room re-read nothing,
    // never flash a skeleton, and record "opened" once per session.
    sleeps: true,
  },
  {
    key: FEATURE_ENTITY.meeting,
    surface: { name: "matrx-user/meeting" },
    comments: entityComments("meet_meeting"),
    label: "Meeting",
    icon: Video,
    group: "features",
    section: "meetings",
    accent: "cyan",
    status: { useStatus: useMeetingStatus },
    defaultSize: { w: 720, h: 680 },
    matches: matchesEntity(FEATURE_ENTITY.meeting),
    Body: MeetingBody,
    Keep: MeetingKeep,
    startNew: { label: "New meeting", Dialog: MeetingCreateDialog },
    bringIn: { label: "Meeting", Picker: MeetingPicker },
    // Not in the search projection: the meeting picker's own read (hosted or invited, every organization).
    record: {
      place: existing(FEATURE_ENTITY.meeting, "Meeting"),
      find: (query, limit) =>
        findMeetings(FEATURE_ENTITY.meeting, query, limit, async () => {
          const { data } = await supabase.auth.getUser();
          if (!data.user) throw new Error("You are not signed in.");
          return readMyMeetings(createMeetRepository({ client: supabase }), data.user.id);
        }),
    },
    // The meeting's home (before, during, after); "Join" in the tile enters the room.
    href: hrefFor(FEATURE_ENTITY.meeting, (id) => `/meetings/${encodeURIComponent(id)}`),
    kindLabel: "meeting",
    // Wake and remount render the shared per-meeting load (meetingsSlice) and
    // re-read nothing of the meeting; MeetingKeep holds its live channel.
    sleeps: true,
  },
  {
    key: FEATURE_ENTITY.workflowRun,
    surface: { name: "matrx-user/workflow-run" },
    comments: entityComments("workflow_run"),
    label: "Workflow run",
    icon: Workflow,
    group: "features",
    section: "research",
    accent: "violet",
    status: { useStatus: useWorkflowRunStatus },
    defaultSize: { w: 960, h: 760 },
    matches: matchesEntity(FEATURE_ENTITY.workflowRun),
    Body: WorkflowRunBody,
    Keep: WorkflowRunKeep,
    startNew: { label: "Run a workflow", Picker: WorkflowRunStartPicker },
    bringIn: { label: "Workflow run", Picker: WorkflowRunPicker },
    // Not in the search projection: the run picker's own list (`GET /runs`, every organization), named by workflow.
    record: {
      place: existing(FEATURE_ENTITY.workflowRun, "Workflow run"),
      find: (query, limit) => {
        const store = getStore();
        if (!store) return Promise.reject(new Error("The app is still starting."));
        return findWorkflowRuns(FEATURE_ENTITY.workflowRun, query, limit, () => fetchRuns(store.dispatch as AppDispatch), fetchWorkflowFacts);
      },
    },
    href: hrefFor(FEATURE_ENTITY.workflowRun, runHref),
    kindLabel: "workflow run",
    // Checked 2026-10-02: hide/show and remove+undo reattach the same adoption, never re-read the
    // run's workflow, never flash a skeleton and never open the floating run window.
    sleeps: true,
  },
  {
    key: FEATURE_ENTITY.research,
    surface: { name: "matrx-user/research" },
    comments: entityComments("research_topic"),
    label: "Research",
    icon: FlaskConical,
    group: "features",
    section: "research",
    accent: "violet",
    status: { none: "A topic has no single state; its runs show on its page." },
    defaultSize: { w: 820, h: 820 },
    matches: matchesEntity(FEATURE_ENTITY.research),
    Body: ResearchBody,
    startNew: { label: "New research topic", create: () => newDraft(FEATURE_ENTITY.research, "New research topic") },
    bringIn: { label: "Research topic", Picker: ResearchPicker },
    record: { place: existing(FEATURE_ENTITY.research, "Research topic"), searchToken: "research_topic" },
    href: hrefFor(FEATURE_ENTITY.research, registryHref("research_topic")),
    kindLabel: "research report",
    // Checked 2026-10-02: report and scroll kept; nothing re-run or written.
    sleeps: true,
  },
  {
    key: FEATURE_ENTITY.project,
    surface: { name: "matrx-user/projects" },
    comments: entityComments("project"),
    label: "Project",
    icon: FolderKanban,
    group: "features",
    section: "work",
    accent: "lime",
    status: { none: "A project has no single state; its tasks carry theirs." },
    defaultSize: { w: 620, h: 680 },
    matches: matchesEntity(FEATURE_ENTITY.project),
    Body: ProjectBody,
    startNew: { label: "New project", create: () => newDraft(FEATURE_ENTITY.project, "New project") },
    bringIn: { label: "Project", Picker: ProjectPickerPanel },
    record: { place: existing(FEATURE_ENTITY.project, "Project"), searchToken: "project" },
    href: hrefFor(FEATURE_ENTITY.project, registryHref("project")),
    kindLabel: "project",
    // Checked 2026-10-02: create form and task list kept (no re-read), scroll kept, renames still save.
    sleeps: true,
  },
];
