"use client";

/**
 * Feature items on a board: Task, War Room, Meeting, Workflow run, Research,
 * Project. Each Body is the feature's canonical component — the real task
 * editor, the room's own watchlist rows, the meeting record, the run stage,
 * the research report, the project's task list — never a board-only copy
 * (see ./types.ts). The pure rules (matching, ordering, pick batching) live in
 * ./feature-items.logic.ts.
 *
 * Every body that reads a record says honestly when it cannot: the canonical
 * `<AccessGate token id/>` resolves denied / in Trash / missing / signed out.
 */

import { createElement, useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, FlaskConical, FolderKanban, ListTodo, Loader2, UsersRound, Video, Workflow } from "lucide-react";
import { Input, Skeleton } from "@ai-matrx/design-system";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import { MeetingRecordView, type MeetingRecord } from "@ai-matrx/meet/react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ReadFailure } from "@/components/read-state/ReadFailure";
import { ReadGate, readOf, type ReadOutcome } from "@/components/read-state/ReadGate";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
// Task
import TaskEditor from "@/features/tasks/components/TaskEditor";
import { useEnsureTaskLoaded } from "@/features/tasks/hooks/useEnsureTaskLoaded";
import { TaskCreatePanel } from "@/features/tasks/widgets/quick-create/TaskCreatePanel";
import { TasksResourcePicker } from "@/features/resource-manager/resource-picker/TasksResourcePicker";
// War Room
import { listSessions } from "@/features/war-room/service";
import { createWarRoomSession, loadWarRoomSession } from "@/features/war-room/redux/thunks";
import {
  selectOrderedGalleryThreadIds,
  selectSessionById,
  selectThreadsStatusForRoom,
} from "@/features/war-room/redux/selectors";
import { RailThread } from "@/features/war-room/components/room/RailThread";
import { roomColorOf, roomIconOf } from "@/features/war-room/components/room/roomIdentity";
import type { WarRoomSession } from "@/features/war-room/types";
// Meeting
import { useMeetingsDirectory } from "@/features/meet/hooks/useMeetingsDirectory";
import { useMeetingActions } from "@/features/meet/hooks/useMeetingActions";
// Workflow run
import { useRunsList } from "@/features/workflow-runtime/discovery/useRunsList";
import { useWorkflowFacts } from "@/features/workflow-runtime/discovery/useWorkflowFacts";
import { RunStatusChip } from "@/features/workflow-runtime/run-status";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import {
  fetchRunDefinitionId,
  fetchWorkflowDefinition,
  getDefaultSurface,
} from "@/features/workflow-runtime/surface/service";
import type { RunSurfaceConfig } from "@/features/workflow-runtime/surface/config";
import type { WorkflowDefinitionLike } from "@/features/workflow-runtime/trigger-points";
import { RunStage } from "@/features/workflow-runtime/components/run/RunStage";
import { MasterworkRulesProvider } from "@/features/masterwork/rules-context/MasterworkRulesContext";
// Research
import { useAllTopics } from "@/features/research/hooks/useResearchState";
import { TopicProvider, useTopicContext } from "@/features/research/context/ResearchContext";
import DocumentViewer from "@/features/research/components/document/DocumentViewer";
// Project
import { ProjectPicker } from "@/features/projects/components/ProjectPicker";
import { ProjectTaskList } from "@/features/projects/components/ProjectTaskList";
import { useProject } from "@/features/projects/hooks";

import type { NodeSource } from "../board/document";
import type { BoardItemType, ItemBodyProps, PickerProps, PlacedItem } from "./types";
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
} from "./feature-items.logic";

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
        Take it off the board from its menu and bring the {what} in again.
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
    <Button asChild size="sm" variant={primary ? "default" : "outline"} className="h-7 gap-1 px-2 text-xs">
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
function RecordList<T>({
  rows,
  read,
  rowKey,
  rowText,
  renderRow,
  onChoose,
  onCancel,
  emptyState,
}: {
  rows: readonly T[];
  read: ReadOutcome;
  rowKey: (row: T) => string;
  rowText: (row: T) => string;
  renderRow: (row: T) => ReactNode;
  onChoose: (row: T) => void;
  onCancel: () => void;
  emptyState: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <ReadGate
        read={read}
        isEmpty={rows.length === 0}
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
            {rows.map((row) => (
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
      <div className="flex justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>
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
      emptyState={
        <>
          You have no War Rooms yet. Use <span className="font-medium text-foreground">Start new → War Room</span> to
          make one here.
        </>
      }
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
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Q4 launch"
        className="text-base"
      />
      <p className="text-xs text-muted-foreground">
        A War Room keeps several threads of work running side by side. You can rename it later.
      </p>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy} className="gap-1.5">
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Create War Room
        </Button>
      </div>
    </form>
  );
}

function WarRoomRecordBody({ id, source, title, onSource }: ItemBodyProps & { id: string }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const session = useAppSelector(selectSessionById(id));
  const status = useAppSelector(selectThreadsStatusForRoom(id));
  const threadIds = useAppSelector(selectOrderedGalleryThreadIds(id));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    void dispatch(loadWarRoomSession(id));
  }, [dispatch, id, attempt]);
  useAdoptTitle(source, title, session?.title, onSource);

  const roomHref = `/war-room/${id}`;
  if (!session && status === "error") {
    return (
      <AccessGate
        token="war_room"
        id={id}
        onRetry={() => setAttempt((n) => n + 1)}
        fallbackHref="/war-room/all"
        fallbackLabel="Your War Rooms"
      />
    );
  }
  if (!session) return <BodySkeleton label="Opening the War Room" />;

  const openThread = (threadId: string) => {
    if (pending) return;
    startTransition(() => router.push(`${roomHref}?thread=${encodeURIComponent(threadId)}`));
  };

  let list: ReactNode;
  if (status === "error") {
    list = (
      <ReadFailure error={true} what="this room's threads" onRetry={() => setAttempt((n) => n + 1)} className="m-2" />
    );
  } else if (status === "loading" && threadIds.length === 0) {
    list = (
      <div className="space-y-2" aria-busy="true" aria-label="Loading threads">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  } else if (threadIds.length === 0) {
    list = (
      <p className="px-1 py-6 text-center text-sm text-muted-foreground">
        No threads in this room yet. Open the room to start one.
      </p>
    );
  } else {
    list = threadIds.map((threadId) => (
      <RailThread
        key={threadId}
        threadId={threadId}
        sessionId={id}
        isStaged={false}
        onStage={() => openThread(threadId)}
      />
    ));
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TileBar
        actions={
          <DoorButton href={roomHref} primary>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <ExternalLink className="size-3.5" />}
            Open room
          </DoorButton>
        }
      >
        <RoomBadge session={session} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{session.title}</p>
          <p className="text-[11px] text-muted-foreground">
            {threadIds.length === 1 ? "1 thread" : `${threadIds.length} threads`}
          </p>
        </div>
      </TileBar>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2.5">{list}</div>
    </div>
  );
}

function WarRoomBody(props: ItemBodyProps) {
  const id = entityIdOf(props.source);
  return id ? <WarRoomRecordBody key={id} id={id} {...props} /> : <WarRoomDraftBody {...props} />;
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
      emptyState={
        <>
          No meetings yet.{" "}
          <Link href="/meetings" className="text-primary underline-offset-2 hover:underline">
            Schedule one in Meetings
          </Link>
          .
        </>
      }
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

function MeetingBody({ source, title, onSource }: ItemBodyProps) {
  const id = entityIdOf(source);
  const { repository } = useMeetingActions();
  const [meeting, setMeeting] = useState<MeetingRecord | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!id || repository === null) return undefined;
    let live = true;
    repository
      .meeting(id as MeetingRecord["id"])
      .then((m) => {
        if (live) setMeeting(m);
      })
      .catch((err: unknown) => {
        if (live) setFailure(err ?? new Error("The meeting could not be read."));
      });
    return () => {
      live = false;
    };
  }, [id, repository, attempt]);
  useAdoptTitle(source, title, meeting?.title, onSource);

  if (!id) return <NoRecordBody what="meeting" href="/meetings" label="Your meetings" />;
  if (failure && !meeting) {
    return (
      <AccessGate
        token="meet_meeting"
        id={id}
        error={failure}
        onRetry={() => {
          setFailure(null);
          setAttempt((n) => n + 1);
        }}
        fallbackHref="/meetings"
        fallbackLabel="Your meetings"
      />
    );
  }
  if (!meeting) return <BodySkeleton label="Opening the meeting" />;

  const phase = meetingPhase(meeting);
  const canJoin = phase !== "cancelled" && phase !== "archived";
  const happened = meeting.startedAt !== null || meeting.endedAt !== null;
  const when = formatWhen(meeting.scheduledFor ?? meeting.startedAt);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TileBar
        actions={
          <>
            {canJoin ? (
              <DoorButton href={`/meet/${encodeURIComponent(id)}`} primary>
                <Video className="size-3.5" />
                Join
              </DoorButton>
            ) : null}
            <DoorButton href={`/meetings/${encodeURIComponent(id)}`}>
              <ExternalLink className="size-3.5" />
              Open
            </DoorButton>
          </>
        }
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{meeting.title}</p>
          <p className="text-[11px] text-muted-foreground">
            {MEETING_PHASE_LABEL[phase]}
            {when ? ` · ${when}` : ""}
          </p>
        </div>
      </TileBar>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {happened ? (
          <MeetingRecordView meeting={meeting} />
        ) : (
          <div className="space-y-3 p-4 text-sm">
            <p className="text-muted-foreground">
              {phase === "cancelled"
                ? "This meeting was cancelled, so it has no notes or summary."
                : "This meeting has not happened yet. Its summary, notes and transcript appear here once it has."}
            </p>
            {meeting.agenda?.trim() ? (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agenda</p>
                <p className="whitespace-pre-wrap text-foreground">{meeting.agenda}</p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Workflow run ────────────────────────────────────────────────────────────

const runHref = (id: string) => `/workflows/runs/${encodeURIComponent(id)}`;

function WorkflowRunPicker({ onPick, onCancel }: PickerProps) {
  const { rows, loading, error, organizationState, refresh } = useRunsList();
  const facts = useWorkflowFacts(rows.map((r) => r.definitionId));
  if (organizationState !== "ready") {
    return (
      <OrganizationContextNotice
        state={organizationState}
        what="Runs"
        description="Runs are listed per organization, and none is selected for this session. Pick one and your runs load here."
      />
    );
  }
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
      emptyState={
        <>
          No runs yet.{" "}
          <Link href="/workflows/all" className="text-primary underline-offset-2 hover:underline">
            Run a workflow
          </Link>{" "}
          and it shows up here.
        </>
      }
      renderRow={(r) => (
        <>
          <Workflow className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{nameOf(r.definitionId) ?? "Unnamed workflow"}</span>
          <RunStatusChip status={r.status} />
          {r.startedAt ? (
            <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
              {formatRelativeTime(r.startedAt)}
            </span>
          ) : null}
        </>
      )}
    />
  );
}

/** Which record of a run could not be read — the access gate asks about that one. */
class RunRecordUnreadable extends Error {
  constructor(
    readonly token: "workflow" | "workflow_run",
    readonly recordId: string,
    readonly readError?: unknown,
  ) {
    super(`The ${token === "workflow" ? "workflow" : "run"} could not be read.`);
    this.name = "RunRecordUnreadable";
  }
}

interface LoadedRun {
  definitionId: string;
  name: string;
  definition: WorkflowDefinitionLike;
  config: RunSurfaceConfig | null;
}

/** The same two reads the run's own page makes: run → workflow → its surface. */
function WorkflowRunBody({ source, title, onSource }: ItemBodyProps) {
  const runId = entityIdOf(source);
  const [loaded, setLoaded] = useState<LoadedRun | null>(null);
  const [failure, setFailure] = useState<RunRecordUnreadable | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!runId) return undefined;
    let live = true;

    const load = async () => {
      const definitionId = await fetchRunDefinitionId(runId).catch((error: unknown) => {
        throw new RunRecordUnreadable("workflow_run", runId, error);
      });
      if (!definitionId) throw new RunRecordUnreadable("workflow_run", runId);
      const [workflow, surface] = await Promise.all([
        fetchWorkflowDefinition(definitionId).catch((error: unknown) => {
          throw new RunRecordUnreadable("workflow", definitionId, error);
        }),
        // No authored surface is not a broken workflow: the stage derives one.
        getDefaultSurface(definitionId, {
          audience: "consumer",
          profile: "full",
        }).catch(() => null),
      ]);
      if (!workflow) throw new RunRecordUnreadable("workflow", definitionId);
      return {
        definitionId: workflow.id,
        name: workflow.name,
        definition: workflow.definition,
        config: surface?.config ?? null,
      };
    };
    load()
      .then((next) => {
        if (live) setLoaded(next);
      })
      .catch((thrown: unknown) => {
        if (!live) return;
        setFailure(
          thrown instanceof RunRecordUnreadable ? thrown : new RunRecordUnreadable("workflow_run", runId, thrown),
        );
      });
    return () => {
      live = false;
    };
  }, [runId, attempt]);
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
    <MasterworkRulesProvider runId={runId}>
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
          <RunStage
            runId={runId}
            definitionId={loaded.definitionId}
            definition={loaded.definition}
            workflowName={loaded.name}
            config={loaded.config}
          />
        </div>
      </div>
    </MasterworkRulesProvider>
  );
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
      emptyState={
        <>
          No research topics yet.{" "}
          <Link href="/research/topics/new" className="text-primary underline-offset-2 hover:underline">
            Start one in Research
          </Link>
          .
        </>
      }
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

function ResearchBody(props: ItemBodyProps) {
  const id = entityIdOf(props.source);
  if (!id) return <NoRecordBody what="research topic" href="/research/topics" label="Your research" />;
  return (
    <TopicProvider key={id} topicId={id}>
      <ResearchReport id={id} {...props} />
    </TopicProvider>
  );
}

// ─── Project ─────────────────────────────────────────────────────────────────

function ProjectPickerPanel({ onPick, onCancel }: PickerProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Choose a project, or make a new one from the list.</p>
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
        <Button type="button" variant="ghost" onClick={onCancel}>
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
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
          {project.description ? (
            <p className="truncate text-[11px] text-muted-foreground">{project.description}</p>
          ) : null}
        </div>
      </TileBar>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <ProjectTaskList projectId={id} organizationId={project.organizationId} />
      </div>
    </div>
  );
}

function ProjectBody(props: ItemBodyProps) {
  const id = entityIdOf(props.source);
  if (!id) return <NoRecordBody what="project" href="/projects" label="Your projects" />;
  return <ProjectRecordBody key={id} id={id} {...props} />;
}

// ─── The catalog entries ─────────────────────────────────────────────────────

const newDraft = (entity: typeof FEATURE_ENTITY.task | typeof FEATURE_ENTITY.warRoom, title: string): PlacedItem => ({
  title,
  source: entitySource(entity, null),
});

export const FEATURE_ITEMS: BoardItemType[] = [
  {
    key: FEATURE_ENTITY.task,
    label: "Task",
    icon: ListTodo,
    group: "work",
    defaultSize: { w: 520, h: 640 },
    matches: matchesEntity(FEATURE_ENTITY.task),
    Body: TaskBody,
    startNew: {
      label: "Task",
      create: () => newDraft(FEATURE_ENTITY.task, "New task"),
    },
    bringIn: { label: "Tasks", Picker: TaskPicker },
    href: hrefFor(FEATURE_ENTITY.task, registryHref("task")),
    kindLabel: "task",
  },
  {
    key: FEATURE_ENTITY.warRoom,
    label: "War Room",
    icon: UsersRound,
    group: "features",
    defaultSize: { w: 560, h: 620 },
    matches: matchesEntity(FEATURE_ENTITY.warRoom),
    Body: WarRoomBody,
    startNew: {
      label: "War Room",
      create: () => newDraft(FEATURE_ENTITY.warRoom, "New War Room"),
    },
    bringIn: { label: "War Room", Picker: WarRoomPicker },
    href: hrefFor(FEATURE_ENTITY.warRoom, registryHref("war_room")),
    kindLabel: "war room",
  },
  {
    key: FEATURE_ENTITY.meeting,
    label: "Meeting",
    icon: Video,
    group: "features",
    defaultSize: { w: 720, h: 680 },
    matches: matchesEntity(FEATURE_ENTITY.meeting),
    Body: MeetingBody,
    bringIn: { label: "Meeting", Picker: MeetingPicker },
    // The meeting's home (before, during, after); "Join" in the tile enters the room.
    href: hrefFor(FEATURE_ENTITY.meeting, (id) => `/meetings/${encodeURIComponent(id)}`),
    kindLabel: "meeting",
  },
  {
    key: FEATURE_ENTITY.workflowRun,
    label: "Workflow run",
    icon: Workflow,
    group: "features",
    defaultSize: { w: 960, h: 760 },
    matches: matchesEntity(FEATURE_ENTITY.workflowRun),
    Body: WorkflowRunBody,
    bringIn: { label: "Workflow run", Picker: WorkflowRunPicker },
    href: hrefFor(FEATURE_ENTITY.workflowRun, runHref),
    kindLabel: "workflow run",
  },
  {
    key: FEATURE_ENTITY.research,
    label: "Research",
    icon: FlaskConical,
    group: "features",
    defaultSize: { w: 820, h: 820 },
    matches: matchesEntity(FEATURE_ENTITY.research),
    Body: ResearchBody,
    bringIn: { label: "Research topic", Picker: ResearchPicker },
    href: hrefFor(FEATURE_ENTITY.research, registryHref("research_topic")),
    kindLabel: "research report",
  },
  {
    key: FEATURE_ENTITY.project,
    label: "Project",
    icon: FolderKanban,
    group: "features",
    defaultSize: { w: 620, h: 680 },
    matches: matchesEntity(FEATURE_ENTITY.project),
    Body: ProjectBody,
    bringIn: { label: "Project", Picker: ProjectPickerPanel },
    href: hrefFor(FEATURE_ENTITY.project, registryHref("project")),
    kindLabel: "project",
  },
];
