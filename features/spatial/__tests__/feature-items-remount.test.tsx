/**
 * War Room and Workflow run tiles survive hide, show, remount, remove + undo
 * and a second tile of the same record — THE REMOUNT LAW (Arman, 2026-10-02).
 *
 * SUT: the War Room and Workflow run board item types (`items/feature-items.tsx`
 * `Body` + `Keep`), mounted the way `home/UserBoard.tsx` mounts a tile: `Keep`
 * beside the tile, `Body` inside `<Activity>`, under the real Redux store and
 * the real thunks (`hydrateWarRoomSession`, the room view session,
 * `loadRunSurface`, `useWorkflowRun`, `useFloatingWorkflowRun`).
 * Replaced: only the network edges they call (the war-room service, the run's
 * Supabase reads, the Python run reads) and the room's/run's inner canvases.
 *
 * The breaks this catches (each RED on the code before 2026-10-02):
 *   - War Room: every mount records "opened" on the server (touchSessionOpened);
 *     waking or remounting re-reads the room and swaps the stage for the
 *     "Loading threads" skeleton; a second tile of the same room does the same
 *     to the first.
 *   - Workflow run: hiding the tile opens the floating run window (the
 *     handoff ran in an unmount cleanup); waking re-adopts the run (a second
 *     GET /runs/{id}); a remount re-reads the run's workflow behind the
 *     "Opening the run" skeleton.
 */

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, back: () => undefined, prefetch: () => Promise.resolve() }),
  usePathname: () => "/board",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// ── War Room network edges ──────────────────────────────────────────────────
const ROOM_ID = "3f9a2c41-7b6e-4d18-a0c5-9e2b7d4f1a63";
const ROOM = {
  id: ROOM_ID,
  title: "Harborview Q4 lease renewals",
  organization_id: "7d4e9b21-6c3a-4f8e-b5d2-0a9c1e3f7b64",
  icon: null,
  color: null,
  metadata: {},
  last_opened_at: null,
};
const warRoomCalls = { getSession: 0, listThreadsForRoom: 0, touchSessionOpened: 0 };
jest.mock("@/features/war-room/service", () => ({
  getSession: jest.fn(async () => {
    warRoomCalls.getSession += 1;
    return ROOM;
  }),
  listThreadsForRoom: jest.fn(async () => {
    warRoomCalls.listThreadsForRoom += 1;
    return [];
  }),
  touchSessionOpened: jest.fn(async () => {
    warRoomCalls.touchSessionOpened += 1;
  }),
  listSessions: jest.fn(async () => [ROOM]),
}));
jest.mock("@/features/war-room/service/associations", () => ({
  listAssignmentsForContainer: jest.fn(async () => []),
}));
// The room's inner canvases are not the SUT: the stage marks itself so a
// remount of it (a skeleton swap) is countable.
const stageMounts = { count: 0 };
jest.mock("@/features/war-room/components/room/StageView", () => {
  const { useEffect } = jest.requireActual("react");
  return {
    StageView: () => {
      useEffect(() => {
        stageMounts.count += 1;
      }, []);
      return <div data-testid="room-stage">stage</div>;
    },
  };
});
jest.mock("@/features/war-room/components/room/WarRoomSurfaceHost", () => ({
  WarRoomSurfaceHost: ({ children }: { children: unknown }) => children,
}));

// ── Workflow run network edges ──────────────────────────────────────────────
const RUN_ID = "b81d4e07-2c9f-4a35-8e61-0f7a3c9d2b54";
const DEFINITION_ID = "c4e7a913-5d2b-4f80-9a16-3b8e0d7f4c21";
const runCalls = { runDefinition: 0, workflow: 0, runRow: 0 };
jest.mock("@/features/workflow-runtime/surface/service", () => ({
  fetchRunDefinitionId: jest.fn(async () => {
    runCalls.runDefinition += 1;
    return DEFINITION_ID;
  }),
  fetchWorkflowDefinition: jest.fn(async () => {
    runCalls.workflow += 1;
    return {
      id: DEFINITION_ID,
      name: "Tenant screening packet",
      organizationId: "7d4e9b21-6c3a-4f8e-b5d2-0a9c1e3f7b64",
      definition: { nodes: [], edges: [] },
    };
  }),
  getDefaultSurface: jest.fn(async () => null),
}));
jest.mock("@/lib/python-client", () => ({
  getJson: jest.fn(async (path: string) => {
    if (/\/runs\/[^/]+$/.test(path)) {
      runCalls.runRow += 1;
      return { data: { id: RUN_ID, status: "running", definition_id: DEFINITION_ID } };
    }
    return { data: [] };
  }),
}));
jest.mock("@/features/workflow-runtime/transport/run-event-source", () => ({
  startRunEventSource: () => ({ stop: () => undefined }),
}));
const floatOpens: string[] = [];
jest.mock("@/features/overlays/openers/workflowRunWindow", () => ({
  openWorkflowRunWindowAction: (args: { runId: string }) => {
    floatOpens.push(args.runId);
    return { type: "test/openWorkflowRunWindow", payload: args };
  },
  closeWorkflowRunWindowAction: (runId: string) => ({ type: "test/closeWorkflowRunWindow", payload: runId }),
}));
// The run's inner stage parts are not the SUT; RunStage itself (and its
// floating-law hook) is real.
jest.mock("@/features/workflow-runtime/agent-surface/WorkflowRunSurfaceHost", () => ({
  WorkflowRunSurfaceHost: ({ children }: { children: unknown }) => children,
}));
jest.mock("@/features/masterwork/rules-context/MasterworkRulesContext", () => ({
  MasterworkRulesProvider: ({ children }: { children: unknown }) => children,
}));
jest.mock("@/features/workflow-runtime/components/run/RunStage", () => {
  const actual = jest.requireActual("@/features/workflow-runtime/floating/useFloatingWorkflowRun");
  const { useWorkflowRun } = jest.requireActual("@/features/workflow-runtime/hooks/useWorkflowRun");
  return {
    // RunStage's two lifecycle duties, verbatim: adopt the run (RunSurfaceView
    // → useWorkflowRun) and obey the floating law with the props it is given.
    RunStage: (props: { runId: string; workflowName: string; floatOnLeave?: boolean }) => {
      useWorkflowRun(props.runId);
      actual.useFloatingWorkflowRun({
        runId: props.runId,
        workflowName: props.workflowName,
        floatOnLeave: props.floatOnLeave,
      });
      return <div data-testid="run-stage">{props.workflowName}</div>;
    },
  };
});

import { Activity, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { makeStore, type AppStore } from "@/lib/redux/store";
import { FEATURE_ITEMS } from "../items/feature-items";
import type { BoardItemType } from "../items/types";
import type { NodeSource } from "../board/document";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const typeOf = (key: string): BoardItemType => {
  const t = FEATURE_ITEMS.find((x) => x.key === key);
  if (!t) throw new Error(`no board item type ${key}`);
  return t;
};

/** One tile exactly as `UserBoard` mounts it: Keep beside, Body inside Activity. */
function Tile({ type, tileId, source, hidden }: { type: BoardItemType; tileId: string; source: NodeSource; hidden: boolean }) {
  const { Keep, Body } = type;
  return (
    <>
      {Keep && <Keep tileId={tileId} source={source} />}
      <Activity mode={hidden ? "hidden" : "visible"}>
        <div data-tile={tileId}>
          <Body tileId={tileId} source={source} title={type.label} tier="read" interacting={false} onSource={() => undefined} />
        </div>
      </Activity>
    </>
  );
}

interface TileSpec {
  id: string;
  hidden: boolean;
}

function mountBoard(store: AppStore, type: BoardItemType, source: NodeSource) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  let tiles: TileSpec[] = [];
  const render = (next: TileSpec[]) => {
    tiles = next;
    const tree: ReactNode = (
      <Provider store={store}>
        {tiles.map((t) => (
          <Tile key={t.id} type={type} tileId={t.id} source={source} hidden={t.hidden} />
        ))}
      </Provider>
    );
    // Synchronous act: effects and their synchronous dispatches flush, the
    // mocked reads do not resolve yet — exactly the frame a person sees.
    act(() => root.render(tree));
  };
  return {
    container,
    render,
    tile: (id: string) => container.querySelector(`[data-tile="${id}"]`),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
}

const roomSource: NodeSource = { kind: "entity", entity: "war-room", id: ROOM_ID } as NodeSource;
const runSource: NodeSource = { kind: "entity", entity: "workflow-run", id: RUN_ID } as NodeSource;

describe("War Room tile — one room session, no skeleton on remount", () => {
  it("records 'opened' once and never re-reads or flashes a skeleton across hide, show, remove + undo and a second tile", async () => {
    const store = makeStore();
    const board = mountBoard(store, typeOf("war-room"), roomSource);

    board.render([{ id: "tile-a", hidden: false }]);
    await settle();
    expect(board.tile("tile-a")?.querySelector('[data-testid="room-stage"]')).not.toBeNull();
    expect(warRoomCalls.touchSessionOpened).toBe(1);
    const readsAfterOpen = warRoomCalls.listThreadsForRoom;
    const stageMountsAfterOpen = stageMounts.count;

    // Hide, then show (the tile sleeps and wakes).
    board.render([{ id: "tile-a", hidden: true }]);
    board.render([{ id: "tile-a", hidden: false }]);
    expect(board.tile("tile-a")?.querySelector('[aria-label="Loading threads"]')).toBeNull();
    await settle();

    // Remove, then undo (a full unmount and a fresh mount of the same tile).
    board.render([]);
    board.render([{ id: "tile-a", hidden: false }]);
    expect(board.tile("tile-a")?.textContent).not.toContain("Opening the War Room");
    expect(board.tile("tile-a")?.querySelector('[aria-label="Loading threads"]')).toBeNull();
    await settle();

    // A second tile of the same room: the first keeps its stage mounted.
    const stageBeforeSecond = stageMounts.count;
    board.render([
      { id: "tile-a", hidden: false },
      { id: "tile-b", hidden: false },
    ]);
    expect(board.tile("tile-a")?.querySelector('[aria-label="Loading threads"]')).toBeNull();
    expect(board.tile("tile-b")?.querySelector('[data-testid="room-stage"]')).not.toBeNull();
    await settle();
    // Only the new tile's stage mounted — the first tile's was never swapped out.
    expect(stageMounts.count).toBe(stageBeforeSecond + 1);

    expect(warRoomCalls.touchSessionOpened).toBe(1);
    expect(warRoomCalls.listThreadsForRoom).toBe(readsAfterOpen);
    expect(stageMountsAfterOpen).toBe(1);
    board.unmount();
  });
});

describe("Workflow run tile — one adoption, no floating window, no skeleton on remount", () => {
  it("never opens the floating window and never re-adopts or re-reads across hide, show, remove + undo and a second tile", async () => {
    const store = makeStore();
    const board = mountBoard(store, typeOf("workflow-run"), runSource);

    board.render([{ id: "run-a", hidden: false }]);
    await settle();
    expect(board.tile("run-a")?.querySelector('[data-testid="run-stage"]')).not.toBeNull();
    expect(runCalls.runRow).toBe(1);
    expect(runCalls.runDefinition).toBe(1);

    // Hide, then show.
    board.render([{ id: "run-a", hidden: true }]);
    expect(floatOpens).toEqual([]);
    board.render([{ id: "run-a", hidden: false }]);
    await settle();

    // Remove, then undo.
    board.render([]);
    board.render([{ id: "run-a", hidden: false }]);
    expect(board.tile("run-a")?.textContent).not.toContain("Opening the run");
    expect(board.tile("run-a")?.querySelector('[data-testid="run-stage"]')).not.toBeNull();
    await settle();

    // A second tile of the same run.
    board.render([
      { id: "run-a", hidden: false },
      { id: "run-b", hidden: false },
    ]);
    expect(board.tile("run-b")?.querySelector('[data-testid="run-stage"]')).not.toBeNull();
    await settle();

    expect(floatOpens).toEqual([]);
    expect(runCalls.runRow).toBe(1);
    expect(runCalls.runDefinition).toBe(1);
    expect(runCalls.workflow).toBe(1);
    board.unmount();
  });
});
