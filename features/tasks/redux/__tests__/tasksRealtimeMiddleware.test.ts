// The /tasks route had NO realtime at all (probed live 2026-09-07: 248 tasks on
// screen, an empty channel registry, a second writer's INSERT invisible for 13s
// and only after a reload). These tests are the guard for the two things that
// make the wiring correct rather than merely present:
//
//  - SCOPE. RLS on `workspace.tasks` delivers far more than this list carries
//    (`pub_read` alone hands every public task in the system to every
//    subscriber). A row that the list would not show must never reach the
//    slice, and one that stops qualifying must leave it.
//  - THE CATCH-UP BUDGET. A row the payload cannot place costs exactly ONE
//    debounced read, and a burst costs one in total — not one per row.

import { upsertTaskWithLevel, removeTaskFromSlice } from "@/features/agent-context/redux/tasksSlice";
import { adjustProjectTaskCount } from "@/features/agent-context/redux/projectsSlice";
import { TASKS_TABLE } from "@/features/tasks/realtime/rowContract";

// The slices reach Supabase at import time; nothing here makes a request.
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/utils/supabase/workspaceDb", () => ({ workspaceDb: () => ({}) }));
jest.mock("@/utils/auth/getUserId", () => ({
  requireUserId: () => "u1",
  getUserId: () => "u1",
}));
jest.mock("@/lib/organizations/personalOrg", () => ({
  ensureOrgId: async (id: string) => id,
}));
jest.mock("@/features/tasks/services/taskService", () => ({
  getProjectTasks: jest.fn(),
  getTopLevelProjectTasks: jest.fn(),
}));

const CATCH_UP = { type: "test/catchUp" } as const;
jest.mock("@/features/agent-context/redux/hierarchyThunks", () => ({
  invalidateAndRefetchFullContext: () => ({ type: "test/catchUp" }),
}));

interface CapturedSpec {
  topic: string;
  postgresChanges: {
    onChange: (delivery: {
      payload: { eventType: string; old?: Record<string, unknown> };
      row: Record<string, unknown> | null;
    }) => void;
  }[];
  onBackfill: () => void;
}

let captured: CapturedSpec | null = null;
let stopCalls = 0;
const observe = jest.fn();

jest.mock("@ai-matrx/realtime", () => ({
  defineChannelNamespace: (spec: { namespace: string }) => ({
    topic: (parts?: Record<string, string>) =>
      `matrx:${spec.namespace}:${parts?.userId ?? ""}`,
  }),
  subscribeToRealtimeManager: (factory: (m: unknown) => CapturedSpec) => {
    captured = factory({});
    return () => {
      stopCalls += 1;
    };
  },
  currentRealtimeManager: () => ({ ledger: { observe } }),
}));

// Imported after the mocks so the module builds its namespace against them.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { tasksRealtimeMiddleware } = require("../tasksRealtimeMiddleware") as
  typeof import("../tasksRealtimeMiddleware");

const USER = "user-1";
const PROJECT = "project-1";

function taskRow(over: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    title: "Remote title",
    description: "Remote description",
    status: "active",
    priority: "high",
    due_date: "2026-09-30",
    project_id: PROJECT,
    parent_task_id: null,
    organization_id: "org-1",
    created_by: USER,
    assignee_id: null,
    deleted_at: null,
    completed_at: null,
    updated_at: "2026-09-08T00:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    settings: {},
    visibility: "private",
    origin: "user",
    source_type: null,
    source_url: null,
    source_label: null,
    start_date: null,
    recurrence_rule: null,
    ...over,
  };
}

function existingTask(over: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    title: "Local title",
    status: "active",
    priority: "high",
    due_date: null,
    assignee_id: null,
    project_id: PROJECT,
    parent_task_id: null,
    organization_id: "org-1",
    created_by: USER,
    updated_at: "2026-09-07T00:00:00.000Z",
    ...over,
  };
}

function harness(options: { tasks?: Record<string, unknown>[] } = {}) {
  const tasks = options.tasks ?? [existingTask()];
  const dispatched: { type: string; payload?: unknown }[] = [];
  const state = {
    userAuth: { id: USER },
    tasks: {
      ids: tasks.map((t) => t.id as string),
      entities: Object.fromEntries(tasks.map((t) => [t.id as string, t])),
    },
    projects: { ids: [PROJECT], entities: {} },
  };
  const storeApi = {
    getState: () => state,
    dispatch: (action: { type: string; payload?: unknown }) => {
      dispatched.push(action);
      return action;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = (tasksRealtimeMiddleware as any)(storeApi)(
    (action: unknown) => action,
  );
  // The subscription owner is a module singleton (one channel per page load,
  // not one per mount — that is the point of a middleware). Tests share the
  // module, so each harness starts from a torn-down channel.
  run({ type: "userAuth/clearUserAuth" });
  captured = null;
  stopCalls = 0;
  dispatched.length = 0;
  run({ type: "hierarchy/fullContextFetchSucceeded" });
  return { dispatched, run, state };
}

function types(dispatched: { type: string }[]) {
  return dispatched.map((a) => a.type);
}

beforeEach(() => {
  captured = null;
  stopCalls = 0;
  observe.mockClear();
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-09-08T12:00:00.000Z"));
});

afterEach(() => {
  jest.useRealTimers();
});

describe("subscription lifecycle", () => {
  it("opens exactly one channel when the full context lands, and does not churn it on a later catch-up read", () => {
    const { run } = harness();
    expect(captured).not.toBeNull();
    expect(captured!.topic).toContain("workspace-tasks-context");

    const first = captured;
    run({ type: "hierarchy/fullContextFetchSucceeded" });
    expect(captured).toBe(first);
    expect(stopCalls).toBe(0);
  });

  it("closes the channel on logout", () => {
    const { run } = harness();
    run({ type: "userAuth/clearUserAuth" });
    expect(stopCalls).toBe(1);
  });
});

describe("scope — RLS delivers more than this list carries", () => {
  it("applies a remote UPDATE to a task the list already holds, with no catch-up read", () => {
    const { dispatched } = harness();
    captured!.postgresChanges[0].onChange({
      payload: { eventType: "UPDATE" },
      row: taskRow({ title: "Renamed by someone else" }),
    });
    jest.runAllTimers();

    const upsert = dispatched.find(
      (a) => a.type === upsertTaskWithLevel.type,
    ) as { payload: { record: { title: string }; level: string } } | undefined;
    expect(upsert?.payload.record.title).toBe("Renamed by someone else");
    // The payload carries the whole row, description included — recording it as
    // thin-list would downgrade an open editor's task.
    expect(upsert?.payload.level).toBe("full-data");
    expect(types(dispatched)).not.toContain(CATCH_UP.type);
  });

  it("drops a foreign public task entirely — no slice write, no catch-up read", () => {
    const { dispatched } = harness();
    captured!.postgresChanges[0].onChange({
      payload: { eventType: "INSERT" },
      row: taskRow({
        id: "someone-elses",
        created_by: "other-user",
        assignee_id: null,
        project_id: "project-i-cannot-see",
        visibility: "public",
      }),
    });
    jest.runAllTimers();
    expect(dispatched).toHaveLength(0);
  });

  it("evicts a held task whose remote UPDATE takes it out of scope (soft delete)", () => {
    const { dispatched } = harness();
    captured!.postgresChanges[0].onChange({
      payload: { eventType: "UPDATE" },
      row: taskRow({ deleted_at: "2026-09-08T11:00:00.000Z" }),
    });
    expect(types(dispatched)).toContain(removeTaskFromSlice.type);
    const counts = dispatched.find(
      (a) => a.type === adjustProjectTaskCount.type,
    ) as { payload: { openDelta: number; totalDelta: number } } | undefined;
    expect(counts?.payload).toMatchObject({ openDelta: -1, totalDelta: -1 });
  });

  it("keeps a task a collaborator just completed (the RPC shows closed tasks for 90 days) and decrements the open count", () => {
    const { dispatched } = harness();
    captured!.postgresChanges[0].onChange({
      payload: { eventType: "UPDATE" },
      row: taskRow({
        status: "completed",
        completed_at: "2026-09-08T11:59:00.000Z",
      }),
    });
    expect(types(dispatched)).toContain(upsertTaskWithLevel.type);
    expect(types(dispatched)).not.toContain(removeTaskFromSlice.type);
    const counts = dispatched.find(
      (a) => a.type === adjustProjectTaskCount.type,
    ) as { payload: { openDelta: number; totalDelta: number } } | undefined;
    expect(counts?.payload).toMatchObject({ openDelta: -1, totalDelta: 0 });
  });

  it("evicts a held task once it has been closed longer than the RPC's 90-day window", () => {
    const { dispatched } = harness();
    captured!.postgresChanges[0].onChange({
      payload: { eventType: "UPDATE" },
      row: taskRow({
        status: "cancelled",
        completed_at: "2026-01-01T00:00:00.000Z",
      }),
    });
    expect(types(dispatched)).toContain(removeTaskFromSlice.type);
  });

  it("removes a task on DELETE, and no-ops for a delete of a task it never held (RLS cannot filter a default-replica-identity DELETE)", () => {
    const { dispatched } = harness();
    captured!.postgresChanges[0].onChange({
      payload: { eventType: "DELETE", old: { id: "never-held" } },
      row: null,
    });
    expect(dispatched).toHaveLength(0);

    captured!.postgresChanges[0].onChange({
      payload: { eventType: "DELETE", old: { id: "task-1" } },
      row: null,
    });
    expect(types(dispatched)).toContain(removeTaskFromSlice.type);
  });
});

describe("catch-up budget", () => {
  it("costs ONE debounced read for a burst of rows the payload cannot place, not one per row", () => {
    const { dispatched } = harness({ tasks: [] });
    for (const id of ["new-1", "new-2", "new-3"]) {
      captured!.postgresChanges[0].onChange({
        payload: { eventType: "INSERT" },
        row: taskRow({ id }),
      });
    }
    expect(types(dispatched)).not.toContain(CATCH_UP.type);
    jest.runAllTimers();
    expect(types(dispatched).filter((t) => t === CATCH_UP.type)).toHaveLength(1);
  });

  it("re-reads once on backfill (reconnect / tab wake / network restore)", () => {
    const { dispatched } = harness();
    captured!.onBackfill();
    jest.runAllTimers();
    expect(types(dispatched).filter((t) => t === CATCH_UP.type)).toHaveLength(1);
  });

  it("collapses a whole flap to one read plus a trailing one — never one read per recovery event", () => {
    // Measured live 2026-09-08: a single offline -> 30s -> online cycle
    // produced four reconnects and FIVE backfill calls, SECONDS apart — far
    // enough apart that a debounce alone coalesced none of them, so the route
    // paid five whole-context reads for one interruption. The floor holds that
    // to the eager read plus the guaranteed trailing one, and the trailing one
    // is why the list still cannot end up stale.
    const { dispatched } = harness();
    captured!.onBackfill();
    jest.advanceTimersByTime(400);
    for (const gap of [1_000, 2_000, 4_000, 6_000]) {
      captured!.onBackfill();
      jest.advanceTimersByTime(gap);
    }
    jest.runAllTimers();
    expect(types(dispatched).filter((t) => t === CATCH_UP.type)).toHaveLength(2);
  });

  it("does NOT swallow a later catch-up — the floor delays a repeat read, it never cancels one", () => {
    const { dispatched } = harness();
    captured!.onBackfill();
    jest.runAllTimers();
    expect(types(dispatched).filter((t) => t === CATCH_UP.type)).toHaveLength(1);

    // A genuine interruption long after the last read pays only the debounce.
    jest.advanceTimersByTime(60_000);
    captured!.onBackfill();
    jest.advanceTimersByTime(400);
    expect(types(dispatched).filter((t) => t === CATCH_UP.type)).toHaveLength(2);
  });

  it("takes a read when a held task is re-parented — the org bucket and both projects' counts move", () => {
    const { dispatched } = harness();
    captured!.postgresChanges[0].onChange({
      payload: { eventType: "UPDATE" },
      row: taskRow({ project_id: null }),
    });
    jest.runAllTimers();
    expect(types(dispatched)).toContain(CATCH_UP.type);
    expect(types(dispatched)).not.toContain(upsertTaskWithLevel.type);
  });
});

describe("echo suppression — the ledger only recognizes writes it was told about", () => {
  it("registers our own write on the ledger when the app upserts a task", () => {
    const { run } = harness();
    const record = existingTask({ title: "Saved by me" });
    run(upsertTaskWithLevel({ record: record as never, level: "full-data" }));

    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({ table: TASKS_TABLE, id: "task-1" }),
    );
    const call = observe.mock.calls.at(-1)?.[0] as { fingerprint: string };
    expect(call.fingerprint).toContain("Saved by me");
  });
});
