// A `?task=<id>` deep link to a task the viewer cannot see (trashed, no
// access, never existed) is a legitimate miss. The single-task read used
// `.single()`, so PostgREST answered 406 PGRST116 and the Supabase capture
// proxy filed a red-tier error on every such link (3x on 2026-10-01). The
// read must ask for "zero or one" and report the miss as data, never as a
// rejected thunk (the Redux capture middleware files those too).

type Result = { data: unknown; error: unknown };

const ZERO_ROWS_SINGLE: Result = {
  data: null,
  error: {
    code: "PGRST116",
    message: "Cannot coerce the result to a single JSON object",
    details: "The result contains 0 rows",
    hint: null,
  },
};
const ZERO_ROWS_MAYBE: Result = { data: null, error: null };

const terminalCalls: string[] = [];

function builder() {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "is", "eq"]) chain[m] = () => chain;
  chain.single = () => {
    terminalCalls.push("single");
    return Promise.resolve(ZERO_ROWS_SINGLE);
  };
  chain.maybeSingle = () => {
    terminalCalls.push("maybeSingle");
    return Promise.resolve(ZERO_ROWS_MAYBE);
  };
  return chain;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: () => ({ from: () => builder() }) },
}));
jest.mock("@/features/organizations/service/membershipsService", () => ({
  membershipsService: { forUser: jest.fn() },
}));

import { configureStore } from "@reduxjs/toolkit";
import tasksReducer, { fetchTask, selectTaskById } from "./tasksSlice";
import projectsReducer, {
  fetchProject,
  selectProjectById,
} from "./projectsSlice";
import organizationsReducer, {
  fetchOrg,
  hydrateOrgsFromContext,
  selectOrgById,
} from "./organizationsSlice";

const MISSING_ID = "00000000-0000-0000-0000-000000000000";

function makeStore() {
  return configureStore({ reducer: { tasks: tasksReducer } });
}

describe("fetchTask — a task the viewer cannot see", () => {
  beforeEach(() => {
    terminalCalls.length = 0;
  });

  it("never asks PostgREST for exactly one row", async () => {
    await makeStore().dispatch(fetchTask(MISSING_ID));
    expect(terminalCalls).not.toContain("single");
    expect(terminalCalls).toContain("maybeSingle");
  });

  it("settles as a miss, not a rejection", async () => {
    const store = makeStore();
    const action = await store.dispatch(fetchTask(MISSING_ID));
    expect(action.type).toBe("tasks/fetchOne/fulfilled");
    expect(action.payload).toEqual({ status: "missing", id: MISSING_ID });
    expect(store.getState().tasks.error).toBeNull();
    expect(selectTaskById(store.getState(), MISSING_ID)).toBeUndefined();
  });

  it("drops a cached thin row the server no longer returns", async () => {
    const store = makeStore();
    store.dispatch({
      type: "tasks/fetchByProject/fulfilled",
      payload: {
        tasks: [
          {
            id: MISSING_ID,
            title: "Gone",
            project_id: null,
            parent_task_id: null,
            status: "not_started",
            priority: null,
            due_date: null,
            assignee_id: null,
          },
        ],
      },
    });
    expect(selectTaskById(store.getState(), MISSING_ID)).toBeDefined();
    await store.dispatch(fetchTask(MISSING_ID));
    expect(selectTaskById(store.getState(), MISSING_ID)).toBeUndefined();
  });
});

// The same class one level up: a project or organization id from a URL, a
// task's project_id or a cached selection can name a row the viewer cannot
// see. Same contract as fetchTask.
describe("fetchProject / fetchOrg — a row the viewer cannot see", () => {
  beforeEach(() => {
    terminalCalls.length = 0;
  });

  function store() {
    return configureStore({
      reducer: { projects: projectsReducer, organizations: organizationsReducer },
    });
  }

  it("fetchProject never asks for exactly one row and settles as a miss", async () => {
    const s = store();
    const action = await s.dispatch(fetchProject(MISSING_ID));
    expect(terminalCalls).not.toContain("single");
    expect(action.type).toBe("projects/fetchOne/fulfilled");
    expect(action.payload).toEqual({ status: "missing", id: MISSING_ID });
    expect(s.getState().projects.error).toBeNull();
  });

  it("fetchProject drops a cached thin row the server no longer returns", async () => {
    const s = store();
    s.dispatch({
      type: "projects/fetchByOrg/fulfilled",
      payload: {
        projects: [
          {
            id: MISSING_ID,
            name: "Gone",
            slug: "gone",
            description: null,
            organization_id: "org",
            settings: {},
            open_task_count: 0,
            total_task_count: 0,
            scope_tags: [],
          },
        ],
      },
    });
    expect(selectProjectById(s.getState(), MISSING_ID)).toBeDefined();
    await s.dispatch(fetchProject(MISSING_ID));
    expect(selectProjectById(s.getState(), MISSING_ID)).toBeUndefined();
  });

  it("fetchOrg never asks for exactly one row and settles as a miss", async () => {
    const s = store();
    const action = await s.dispatch(fetchOrg(MISSING_ID));
    expect(terminalCalls).not.toContain("single");
    expect(action.type).toBe("organizations/fetchOne/fulfilled");
    expect(action.payload).toEqual({ status: "missing", id: MISSING_ID });
    expect(s.getState().organizations.error).toBeNull();
  });

  it("fetchOrg drops a cached thin row the server no longer returns", async () => {
    const s = store();
    s.dispatch(
      hydrateOrgsFromContext([
        {
          id: MISSING_ID,
          name: "Gone",
          slug: "gone",
          role: "member",
          scope_types: [],
          scopes: [],
          projects: [],
          tasks: [],
        },
      ]),
    );
    expect(selectOrgById(s.getState(), MISSING_ID)).toBeDefined();
    await s.dispatch(fetchOrg(MISSING_ID));
    expect(selectOrgById(s.getState(), MISSING_ID)).toBeUndefined();
  });
});
