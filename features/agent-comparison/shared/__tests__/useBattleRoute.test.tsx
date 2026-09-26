/** @jest-environment jsdom */

import { act, StrictMode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

const replace = jest.fn();
// Next's app router is one stable instance; so is this one.
const router = { replace };
jest.mock("next/navigation", () => ({
  useRouter: () => router,
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppStore: () => ({
    getState: () => ({ agentComparison: { mountedMode: null } }),
  }),
}));
jest.mock("@/components/navigation/AppLink", () => ({
  __esModule: true,
  default: () => null,
}));
const getComparisonSetMode = jest.fn();
jest.mock("../../service/comparisonSetsService", () => ({
  getComparisonSetMode: (...args: unknown[]) => getComparisonSetMode(...args),
}));

import { useBattleRoute, type BattleRouteStatus } from "../useBattleRoute";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let lastStatus: BattleRouteStatus | null = null;
let setActive: (id: string | null) => void = () => {};
let loadCalls = 0;

/**
 * Mirrors a battle page: the mode's loader puts the battle on screen (the
 * store update re-renders the page with the new active id) BEFORE its promise
 * resolves — exactly the order a Redux thunk + unwrap produces.
 */
function Harness({ urlSetId }: { urlSetId: string | null }) {
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  setActive = setActiveSetId;
  lastStatus = useBattleRoute({
    mode: "conversation",
    urlSetId,
    activeSetId,
    load: async (id) => {
      loadCalls += 1;
      await Promise.resolve();
      setActiveSetId(id);
      await Promise.resolve();
    },
  });
  return null;
}

async function flush() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("useBattleRoute", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    replace.mockReset();
    getComparisonSetMode.mockReset();
    getComparisonSetMode.mockResolvedValue({ found: true, mode: "conversation" });
    loadCalls = 0;
    lastStatus = null;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("opens a battle URL once and ends ready, under StrictMode's double effects", async () => {
    await act(async () => {
      root.render(
        <StrictMode>
          <Harness urlSetId="battle-1" />
        </StrictMode>,
      );
    });
    await flush();
    expect(loadCalls).toBe(1);
    expect(lastStatus).toEqual({ kind: "ready" });
    expect(replace).not.toHaveBeenCalled();
  });

  it("ends ready when the page remounts while the load is still running", async () => {
    await act(async () => {
      root.render(<Harness urlSetId="battle-1" />);
    });
    // Remount before the first load settles (a route-segment swap / HMR).
    act(() => root.unmount());
    root = createRoot(host);
    await act(async () => {
      root.render(<Harness urlSetId="battle-1" />);
    });
    await flush();
    expect(lastStatus).toEqual({ kind: "ready" });
  });

  it("names a battle's URL once it gets an id, and returns to the base when cleared", async () => {
    await act(async () => {
      root.render(<Harness urlSetId={null} />);
    });
    await act(async () => setActive("battle-2"));
    expect(replace).toHaveBeenLastCalledWith(
      "/agents/battle/conversation/battle-2",
    );
    await act(async () => {
      root.render(<Harness urlSetId="battle-2" />);
    });
    await act(async () => setActive(null));
    expect(replace).toHaveBeenLastCalledWith("/agents/battle/conversation");
  });

  it("says why when the battle does not exist", async () => {
    getComparisonSetMode.mockResolvedValue({ found: false, mode: null });
    await act(async () => {
      root.render(<Harness urlSetId="missing" />);
    });
    await flush();
    expect(lastStatus?.kind).toBe("error");
    expect(loadCalls).toBe(0);
  });

  it("sends a battle saved in another mode to that mode's URL", async () => {
    getComparisonSetMode.mockResolvedValue({ found: true, mode: "model" });
    await act(async () => {
      root.render(<Harness urlSetId="battle-3" />);
    });
    await flush();
    expect(replace).toHaveBeenCalledWith("/agents/battle/model/battle-3");
    expect(loadCalls).toBe(0);
  });
});
