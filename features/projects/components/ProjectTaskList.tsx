"use client";

/**
 * ProjectTaskList — the heart of the Project Workspace.
 *
 * A compact, scannable TABLE of a project's tasks (Task / Priority / Due),
 * grouped Open / Done, with nested subtasks (parent_task_id) as indented rows.
 * EVERY field is editable inline (Linear / Things style): click the title to
 * rename, change priority via an inline picker, set/clear the due date via an
 * inline calendar — on existing rows AND subtasks. The quick-add row lets you
 * set name + priority + due (and, behind Advanced, a description) BEFORE adding.
 * The trailing actions column opens the full task editor at /tasks/[id].
 *
 * All edits go through taskService.updateTask / createTask with optimistic
 * updates, revert-on-failure, and toast.error feedback. The list is a
 * store read by project; the half-typed quick-add row is a draft in the store
 * by project — a remount or a wake loses neither and reads nothing.
 */

// wizard-draft-exempt: the quick-add row is a single inline task field, not a wizard; its half-typed row is kept on purpose
import React from "react";
import { useSearchParams } from "next/navigation";
import {
  Loader2,
  ChevronRight,
  ChevronDown,
  CircleCheck,
  Circle,
  CornerDownRight,
  ArrowUpRight,
} from "lucide-react";
import { Input } from "@ai-matrx/design-system/controls";
import { Button } from "@/components/ui/button";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type {
  MatrxColumnDef,
  MatrxDataTableEntryRow,
  MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table/types";
import { filterAndSortRows } from "@ai-matrx/design-system/data-table/filter-engine";
import { cn } from "@/utils/cn";
import { toast } from "@/lib/toast";
import {
  getProjectTasks,
  createTask,
  updateTaskResult,
  type UpdateTaskInput,
} from "@/features/tasks/services/taskService";
import type { DatabaseTask } from "@/features/tasks/types/database";
import {
  TaskPriorityPicker,
  type TaskPriority,
} from "@/features/tasks/components/TaskPriorityPicker";
import { TaskDueDatePicker } from "@/features/tasks/components/TaskDueDatePicker";
import { useOpenTaskEditorWindow } from "@/features/overlays/openers/taskEditorWindow";
import { TaskCopyForAiButton } from "@/features/tasks/components/TaskCopyForAiButton";
import { isDateOnlyOverdue } from "@ai-matrx/kit/dates";
import { useRefocusInputAfterAsync } from "@/features/tasks/hooks/useRefocusInputAfterAsync";
import { ReadFailure } from "@ai-matrx/design-system";
import {
  dispatchThunk,
  useAppDispatch,
  useAppSelector,
} from "@/lib/redux/hooks";
import { useStoreRead } from "@/lib/redux/store-reads/useStoreRead";
import {
  clearWizardDraft,
  patchWizardDraft,
  selectWizardDraft,
} from "@/lib/redux/slices/wizardDraftSlice";

const EMPTY_TASKS: DatabaseTask[] = [];
const isDone = (t: DatabaseTask) => t.status === "completed";
const isOverdue = (t: DatabaseTask) =>
  !isDone(t) && isDateOnlyOverdue(t.due_date);

export function ProjectTaskList({
  projectId,
  organizationId,
  onCountsChange,
}: {
  projectId: string;
  organizationId: string | null;
  onCountsChange?: (counts: { open: number; done: number }) => void;
}) {
  const openTaskEditor = useOpenTaskEditorWindow();
  // The project's tasks live in Redux by project (`useStoreRead`): read once,
  // rendered from the store on every wake and remount; every inline edit and
  // quick-add writes the store's copy, so nothing a remount shows is stale.
  const tasksRead = useStoreRead<DatabaseTask[]>(
    `projects.tasks:${projectId}`,
    () => getProjectTasks(projectId),
  );
  const tasks = tasksRead.data ?? EMPTY_TASKS;
  const setTasks = (update: (cur: DatabaseTask[]) => DatabaseTask[]) =>
    tasksRead.setData((cur) => update(cur ?? EMPTY_TASKS));
  const loading = !tasksRead.hasData && tasksRead.status === "loading";
  const loadError = tasksRead.error;
  const [searchQuery, setSearchQuery] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  // `?done=1` opens with the Done group already expanded. A COUNT IS A DOOR:
  // "12 done" on the projects list links here, and landing on a page where
  // those twelve are hidden behind a collapsed disclosure means the number
  // didn't actually reach the records it described.
  const searchParams = useSearchParams();
  const doneParam = searchParams.get("done") === "1";
  const [showDone, setShowDone] = React.useState(doneParam);
  // The initializer runs once. Navigating from one project to another keeps
  // this component mounted, so a fresh `?done=1` would be ignored and the
  // count link would land on a collapsed Done group again.
  //
  // Keyed on PROJECT + PARAM together, not the param alone: collapsing Done on
  // project A leaves `?done=1` in the URL, so clicking "12 done" on project B
  // carries an unchanged param and a param-only guard would leave the group
  // shut — the very thing the link exists to open. Within ONE project the
  // manual toggle still stands, because neither half of the key changed.
  const doneSeedKey = `${projectId}|${doneParam}`;
  const lastDoneSeed = React.useRef(doneSeedKey);
  React.useEffect(() => {
    if (lastDoneSeed.current === doneSeedKey) return;
    lastDoneSeed.current = doneSeedKey;
    setShowDone(doneParam);
  }, [doneSeedKey, doneParam]);
  const [addingSubFor, setAddingSubFor] = React.useState<string | null>(null);
  const [subTitle, setSubTitle] = React.useState("");
  const [isAddingSub, setIsAddingSub] = React.useState(false);
  const { inputRef: subInputRef, scheduleRefocus: scheduleSubtaskRefocus } =
    useRefocusInputAfterAsync(isAddingSub);

  const reload = () => void tasksRead.refresh();

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const matchesSearch = (task: DatabaseTask) => {
    if (!normalizedSearch) return true;
    return [task.title, task.description, task.priority, task.due_date].some(
      (value) => value?.toLocaleLowerCase().includes(normalizedSearch),
    );
  };
  const topLevel = tasks.filter((t) => !t.parent_task_id);
  const childrenOf = (id: string) =>
    tasks.filter((t) => t.parent_task_id === id);
  const visibleChildrenOf = (id: string) =>
    childrenOf(id).filter(matchesSearch);
  const matchesTaskTree = (task: DatabaseTask) =>
    matchesSearch(task) || visibleChildrenOf(task.id).length > 0;
  const done = topLevel.filter((t) => isDone(t) && matchesTaskTree(t));

  React.useEffect(() => {
    onCountsChange?.({
      open: tasks.filter((t) => !isDone(t)).length,
      done: tasks.filter((t) => isDone(t)).length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  /**
   * Optimistic field patch shared by every inline editor. Applies `patch`
   * immediately, calls updateTask, and reverts + toasts on failure.
   */
  async function patchField(
    task: DatabaseTask,
    patch: Pick<UpdateTaskInput, "title" | "status" | "due_date" | "priority">,
  ) {
    const prev = { ...task };
    setBusyId(task.id);
    setTasks((cur) =>
      cur.map((x) => (x.id === task.id ? { ...x, ...patch } : x)),
    );
    const res = await updateTaskResult(task.id, patch);
    setBusyId(null);
    if (!res.task) {
      setTasks((cur) => cur.map((x) => (x.id === task.id ? prev : x)));
      toast.error(res.error ?? "Couldn't update the task.");
    }
  }

  async function toggle(t: DatabaseTask) {
    await patchField(t, {
      status: isDone(t) ? "active" : "completed",
    });
  }

  async function renameTask(t: DatabaseTask, title: string) {
    const next = title.trim();
    if (!next || next === t.title) return;
    await patchField(t, { title: next });
  }

  async function setPriority(t: DatabaseTask, priority: TaskPriority) {
    if (priority === (t.priority ?? null)) return;
    await patchField(t, { priority });
  }

  async function setDueDate(t: DatabaseTask, due: string | null) {
    if (due === (t.due_date ?? null)) return;
    await patchField(t, { due_date: due });
  }

  async function addSubtask(parentId: string) {
    const t = subTitle.trim();
    if (!t || isAddingSub) return;
    setIsAddingSub(true);
    setSubTitle("");
    try {
      const res = await createTask({
        title: t,
        parent_task_id: parentId,
        project_id: projectId,
        organization_id: organizationId,
        status: "planned",
      });
      if (res) {
        setTasks((cur) => [...cur, res]);
        setAddingSubFor(parentId);
        scheduleSubtaskRefocus();
      } else {
        setSubTitle(t);
        toast.error("Couldn't add the subtask.");
      }
    } finally {
      setIsAddingSub(false);
    }
  }

  const columns = projectTaskColumns({
    busyId,
    onToggle: toggle,
    onRename: renameTask,
    onPriority: setPriority,
    onDueDate: setDueDate,
    onOpen: (id) => openTaskEditor({ taskId: id }),
    onAddSubtask: (id) => {
      setAddingSubFor(id);
      setSubTitle("");
    },
  });
  // Inline quick-add — set name + priority + due before adding. Appends
  // optimistically (newest-first) so rapid-fire entry never blanks the table
  // or steals focus from the title input.
  const quickAdd = useQuickAddEntry({
    projectId,
    organizationId,
    onAdded: (task) => setTasks((cur) => [task, ...cur]),
  });
  const withChildren = (list: DatabaseTask[]) =>
    list.flatMap((t) => [t, ...childrenOf(t.id)]);
  const openRows = withChildren(topLevel.filter((t) => !isDone(t)));
  const doneRows = withChildren(topLevel.filter(isDone));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError && tasks.length === 0) {
    return (
      <ReadFailure
        error={loadError}
        what="this project's tasks"
        onRetry={reload}
      />
    );
  }

  const subtaskRow = (parentId: string) => (
    <div className="flex items-center gap-2 pl-7">
      <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
      <ProInput
        ref={subInputRef}
        autoFocus
        value={subTitle}
        onChange={(e) => setSubTitle(e.target.value)}
        onSubmit={() => void addSubtask(parentId)}
        submitOnEnter
        submitLabel="Add subtask"
        submitDisabled={!subTitle.trim() || isAddingSub}
        isSubmitting={isAddingSub}
        showCopyButton={false}
        onBlur={() => {
          if (subTitle.trim()) void addSubtask(parentId);
          else setAddingSubFor(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setAddingSubFor(null);
            setSubTitle("");
          }
        }}
        placeholder="Subtask title, Enter for next…"
        disabled={isAddingSub}
        className="h-7 text-[13px] max-w-md"
        wrapperClassName="max-w-md flex-1"
      />
    </div>
  );

  const tableProps = {
    columns,
    getRowId: (t: DatabaseTask) => t.id,
    searchText: (t: DatabaseTask) =>
      [t.description, t.priority, t.due_date].filter(Boolean).join(" "),
    processLocalRows: keepSubtasksUnderParents,
    pageSize: 0,
    viewTabs: false,
    rowVersion: (t: DatabaseTask) => busyId === t.id,
    detail: { enabled: false } as const,
    window: {},
    getRowHref: (t: DatabaseTask) => `/tasks/${t.id}`,
    expandedDetail: {
      expandedId: addingSubFor,
      onExpandedIdChange: (id: string | null) => {
        setAddingSubFor(id);
        if (id) setSubTitle("");
      },
      canExpand: (t: DatabaseTask) => t.id === addingSubFor,
      render: (t: DatabaseTask) => subtaskRow(t.id),
      className: "bg-transparent",
    },
    toolbar: {
      searchValue: searchQuery,
      onSearchChange: setSearchQuery,
      searchPlaceholder: "Search tasks…",
    },
    copy: {
      label: "Task",
      listLabel: "Project tasks",
      location: "Projects — project task list",
      rowKind: "task",
      listKind: "project-tasks",
      humanRow: (t: DatabaseTask) =>
        `${t.parent_task_id ? "  ↳ " : ""}${t.title} — ${t.status}${t.priority ? `, ${t.priority} priority` : ""}${t.due_date ? `, due ${t.due_date}` : ""}`,
    },
  };

  return (
    <div className="space-y-3">
      <MatrxDataTable<DatabaseTask>
        {...tableProps}
        tableId="project-tasks-open"
        data={openRows}
        read={{ status: "ready" }}
        emptyState={{
          title: normalizedSearch
            ? "No matching open tasks."
            : "No open tasks.",
        }}
        entryRow={quickAdd}
      />

      {/* Done section */}
      {done.length > 0 && (
        <div>
          <button
            onClick={() => setShowDone((s) => !s)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-1"
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                showDone && "rotate-90",
              )}
            />
            Done · {done.length}
          </button>
          {(showDone || Boolean(normalizedSearch)) && (
            <MatrxDataTable<DatabaseTask>
              {...tableProps}
              tableId="project-tasks-done"
              data={doneRows}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * THE TREE SURVIVES THE TABLE'S QUERY. The canonical filter and sort run over
 * every task; a subtask then sits under its parent (in the sorted order), and a
 * parent stays in view while any of its subtasks match.
 */
function keepSubtasksUnderParents(
  rows: DatabaseTask[],
  state: MatrxDataTableQueryState,
): DatabaseTask[] {
  const matched = filterAndSortRows(
    rows,
    PROJECT_TASK_QUERY_COLUMNS,
    state.columnFilters,
    state.sort,
    state.search,
    undefined,
    state.layeredFilters,
    state.searchMatchMode,
    (t) => [t.description, t.priority, t.due_date].filter(Boolean).join(" "),
  );
  const byId = new Map(rows.map((t) => [t.id, t]));
  const isTop = (t: DatabaseTask) =>
    !t.parent_task_id || !byId.has(t.parent_task_id);
  const parents: DatabaseTask[] = [];
  const seen = new Set<string>();
  const childrenOf = new Map<string, DatabaseTask[]>();
  for (const t of matched) {
    if (isTop(t)) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        parents.push(t);
      }
      continue;
    }
    const pid = t.parent_task_id as string;
    childrenOf.set(pid, [...(childrenOf.get(pid) ?? []), t]);
  }
  for (const pid of childrenOf.keys()) {
    if (seen.has(pid)) continue;
    const parent = byId.get(pid);
    if (parent) {
      seen.add(pid);
      parents.push(parent);
    }
  }
  return parents.flatMap((p) => [p, ...(childrenOf.get(p.id) ?? [])]);
}

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** The same columns' query fields, for the tree-preserving processor. */
const PROJECT_TASK_QUERY_COLUMNS: MatrxColumnDef<DatabaseTask>[] = [
  { id: "title", header: "Task", accessorKey: "title" },
  {
    id: "priority",
    header: "Priority",
    accessorFn: (t) => t.priority ?? "none",
    sortValue: (t) => PRIORITY_RANK[t.priority ?? ""] ?? 3,
  },
  {
    id: "due",
    header: "Due",
    accessorFn: (t) => t.due_date ?? null,
    sortValue: (t) => t.due_date || "9999-12-31",
  },
];

/* ─── Columns ───────────────────────────────────────────────────────────── */

function projectTaskColumns({
  busyId,
  onToggle,
  onRename,
  onPriority,
  onDueDate,
  onOpen,
  onAddSubtask,
}: {
  busyId: string | null;
  onToggle: (t: DatabaseTask) => void;
  onRename: (t: DatabaseTask, title: string) => void;
  onPriority: (t: DatabaseTask, p: TaskPriority) => void;
  onDueDate: (t: DatabaseTask, due: string | null) => void;
  onOpen: (id: string) => void;
  onAddSubtask: (parentId: string) => void;
}): MatrxColumnDef<DatabaseTask>[] {
  const h = {
    busyId,
    onToggle,
    onRename,
    onPriority,
    onDueDate,
    onOpen,
    onAddSubtask,
  };
  return [
    {
      ...PROJECT_TASK_QUERY_COLUMNS[0],
      filter: "text",
      width: 420,
      cell: (task) => {
        const isSub = Boolean(task.parent_task_id);
        const done = task.status === "completed";
        return (
          <div
            className={cn(
              "group/task flex min-w-0 items-center gap-2 overflow-hidden",
              isSub && "pl-7",
            )}
          >
            {isSub && (
              <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
            )}
            <button
              onClick={() => h.onToggle(task)}
              disabled={h.busyId === task.id}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              title={done ? "Mark incomplete" : "Mark complete"}
            >
              {h.busyId === task.id ? (
                <Loader2
                  className={cn(
                    isSub ? "h-4 w-4" : "h-[18px] w-[18px]",
                    "animate-spin",
                  )}
                />
              ) : done ? (
                <CircleCheck
                  className={cn(
                    isSub ? "h-4 w-4" : "h-[18px] w-[18px]",
                    "text-emerald-500",
                  )}
                />
              ) : (
                <Circle className={isSub ? "h-4 w-4" : "h-[18px] w-[18px]"} />
              )}
            </button>
            <InlineTitle
              value={task.title}
              done={done}
              isSub={isSub}
              onCommit={(next) => h.onRename(task, next)}
              onOpen={isSub ? () => h.onOpen(task.id) : undefined}
              onOpenEditor={() => h.onOpen(task.id)}
            />
            {!isSub && (
              <button
                onClick={() => h.onAddSubtask(task.id)}
                className="hidden shrink-0 h-6 w-6 rounded-md items-center justify-center text-muted-foreground opacity-0 group-hover/matrx-row:opacity-100 hover:bg-accent hover:text-foreground transition-all sm:flex"
                title="Add subtask"
              >
                <CornerDownRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      },
    },
    {
      ...PROJECT_TASK_QUERY_COLUMNS[1],
      filterOptions: [
        { value: "high", label: "High" },
        { value: "medium", label: "Medium" },
        { value: "low", label: "Low" },
        { value: "none", label: "None" },
      ],
      width: 130,
      cell: (task) => (
        <TaskPriorityPicker
          value={task.priority}
          onChange={(p) => h.onPriority(task, p)}
        />
      ),
    },
    {
      ...PROJECT_TASK_QUERY_COLUMNS[2],
      filter: "date",
      width: 120,
      cell: (task) => (
        <TaskDueDatePicker
          value={task.due_date}
          overdue={isOverdue(task)}
          onChange={(due) => h.onDueDate(task, due)}
        />
      ),
    },
    {
      id: "task-actions",
      header: "",
      label: "Open",
      sortable: false,
      filter: false,
      customActions: (task) => (
        <div className="flex items-center justify-end gap-0.5">
          <TaskCopyForAiButton
            taskId={task.id}
            taskTitle={task.title}
            location="Projects — project task list"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover/matrx-row:opacity-100 focus-visible:opacity-100"
          />
          <button
            onClick={() => h.onOpen(task.id)}
            className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground opacity-0 group-hover/matrx-row:opacity-100 hover:bg-accent hover:text-foreground transition-all focus-visible:opacity-100"
            title="Open task"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];
}

/* ─── Inline title (click to edit) ──────────────────────────────────────── */

function InlineTitle({
  value,
  done,
  isSub,
  onCommit,
  onOpen,
  onOpenEditor,
}: {
  value: string;
  done: boolean;
  isSub?: boolean;
  onCommit: (next: string) => void;
  /** Subtasks: single click opens the full editor. */
  onOpen?: () => void;
  /** Parent tasks: double-click opens the full editor. */
  onOpenEditor?: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  // Keep the draft in sync when the underlying value changes and we're not
  // actively editing (e.g. an optimistic update from elsewhere landed).
  React.useEffect(() => {
    if (!editing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(value);
    }
  }, [value, editing]);

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onCommit(draft);
            setEditing(false);
          }
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        onBlur={() => {
          onCommit(draft);
          setEditing(false);
        }}
        className="min-w-0 flex-1"
      />
    );
  }

  return (
    <button
      onClick={() => {
        if (onOpen) {
          onOpen();
          return;
        }
        setDraft(value);
        setEditing(true);
      }}
      onDoubleClick={() => {
        onOpenEditor?.();
      }}
      className={cn(
        "flex-1 min-w-0 text-left truncate rounded px-1 -mx-1 hover:bg-accent/50",
        isSub ? "text-[13px]" : "text-sm",
        done ? "text-muted-foreground line-through" : "text-foreground",
      )}
      title={value}
    >
      {value}
    </button>
  );
}

/* ─── Quick-add row ─────────────────────────────────────────────────────── */

interface QuickAddDraft {
  title: string;
  priority: TaskPriority;
  due: string | null;
  advanced: boolean;
  description: string;
}

function useQuickAddEntry({
  projectId,
  organizationId,
  onAdded,
}: {
  projectId: string;
  organizationId: string | null;
  onAdded: (task: DatabaseTask) => void;
}): MatrxDataTableEntryRow {
  // The half-typed row is a DRAFT in the store, keyed by project — a remount
  // or a wake from sleep puts back exactly what was typed.
  const dispatch = useAppDispatch();
  const draftId = `project-quick-add:${projectId}`;
  const draft = useAppSelector(selectWizardDraft(draftId))?.data as
    QuickAddDraft | undefined;
  const title = draft?.title ?? "";
  const priority = draft?.priority ?? null;
  const due = draft?.due ?? null;
  const advanced = draft?.advanced ?? false;
  const description = draft?.description ?? "";
  const patchDraft = (patch: Partial<QuickAddDraft>) =>
    dispatch(patchWizardDraft({ wizardId: draftId, patch }));
  const setTitle = (next: string | ((cur: string) => string)) =>
    dispatchThunk(dispatch, (d, getState) => {
      const cur =
        (
          selectWizardDraft(draftId)(getState())?.data as
            QuickAddDraft | undefined
        )?.title ?? "";
      d(
        patchWizardDraft({
          wizardId: draftId,
          patch: { title: typeof next === "function" ? next(cur) : next },
        }),
      );
    });
  const setPriority = (next: TaskPriority) => patchDraft({ priority: next });
  const setDue = (next: string | null) => patchDraft({ due: next });
  const setAdvanced = (next: boolean | ((cur: boolean) => boolean)) =>
    patchDraft({
      advanced: typeof next === "function" ? next(advanced) : next,
    });
  const setDescription = (next: string) => patchDraft({ description: next });
  const [inFlight, setInFlight] = React.useState(0);
  const titleRef = React.useRef<HTMLInputElement>(null);
  const priorityRef = React.useRef<HTMLButtonElement>(null);
  const dueRef = React.useRef<HTMLButtonElement>(null);
  const descriptionRef = React.useRef<HTMLTextAreaElement>(null);

  function focusTitle() {
    requestAnimationFrame(() => titleRef.current?.focus());
  }

  function resetAll() {
    dispatch(clearWizardDraft(draftId));
    focusTitle();
  }

  /**
   * Fire-and-continue: create the task, then immediately clear the title and
   * keep the row open + focused so the user can rapid-fire. Priority and due
   * stay sticky across entries; description clears each time.
   */
  async function submitAndContinue() {
    const t = title.trim();
    if (!t) return;
    const desc = description.trim() || null;
    patchDraft({ title: "", description: "" });
    focusTitle();
    setInFlight((n) => n + 1);
    const res = await createTask({
      title: t,
      project_id: projectId,
      organization_id: organizationId,
      status: "planned",
      priority,
      due_date: due,
      description: desc,
    });
    setInFlight((n) => n - 1);
    if (res) {
      onAdded(res);
    } else {
      toast.error("Couldn't add the task.");
      setTitle((cur) => (cur.length === 0 ? t : cur));
    }
    focusTitle();
  }

  return {
    label: "New task",
    cell: (columnId) => {
      if (columnId === "title") {
        return (
          <div className="flex items-center gap-2">
            <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
            <ProInput
              ref={titleRef}
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              showCopyButton={false}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void submitAndContinue();
                  return;
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  priorityRef.current?.focus();
                }
                if (e.key === "Escape") resetAll();
              }}
              placeholder="Task title, Enter for next field…"
              className="h-8 max-w-md"
              wrapperClassName="max-w-md"
            />
          </div>
        );
      }
      if (columnId === "priority") {
        return (
          <TaskPriorityPicker
            value={priority}
            onChange={setPriority}
            triggerRef={priorityRef}
            onTriggerKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submitAndContinue();
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                dueRef.current?.focus();
              }
            }}
          />
        );
      }
      if (columnId === "due") {
        return (
          <TaskDueDatePicker
            value={due}
            overdue={false}
            onChange={setDue}
            triggerRef={dueRef}
            onTriggerKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submitAndContinue();
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                if (advanced) {
                  descriptionRef.current?.focus();
                } else {
                  void submitAndContinue();
                }
              }
            }}
          />
        );
      }
      if (columnId === "task-actions") {
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="primary"
              onClick={() => void submitAndContinue()}
              disabled={!title.trim()}
            >
              {inFlight > 0 ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Add"
              )}
            </Button>
          </div>
        );
      }
      return undefined;
    },
    // Advanced disclosure — description (createTask supports it)
    below: (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {advanced ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Advanced
          <span className="font-normal">description</span>
        </button>
        {advanced && (
          <ProTextarea
            ref={descriptionRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onSubmit={() => void submitAndContinue()}
            submitOnEnter
            submitOnCmdEnter
            submitLabel="Add task"
            submitDisabled={!title.trim()}
            showCopyButton={false}
            autoGrow
            minHeight={72}
            maxHeight={200}
            placeholder="Description, Enter to add task…"
            className="text-sm min-h-[72px] resize-y max-w-2xl"
            wrapperClassName="max-w-2xl w-full"
          />
        )}
        <div className="flex items-center gap-2">
          <Button variant="quiet" onClick={resetAll}>
            Cancel
          </Button>
        </div>
      </div>
    ),
  };
}
