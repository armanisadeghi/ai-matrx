import { renderHook } from "@/test-utils/renderHook";

const executeSqlQuery = jest.fn();

jest.mock("@/actions/admin/database", () => ({
  executeSqlQuery: (...args: unknown[]) => executeSqlQuery(...args),
  getFunctions: jest.fn(),
  getPermissions: jest.fn(),
}));

import { parseWorkbenchPersistedState } from "../database-admin/workbench/hooks/useQueryWorkbench";
import { useDatabaseAdmin } from "./use-database-admin";

describe("useDatabaseAdmin terminal execution", () => {
  it("stays locked until the privileged query reaches its real terminal result", async () => {
    let resolveQuery!: (value: { data: unknown; error: null }) => void;
    executeSqlQuery.mockReturnValue(
      new Promise((resolve) => {
        resolveQuery = resolve;
      }),
    );
    const hook = await renderHook(() => useDatabaseAdmin());

    let execution!: Promise<unknown>;
    await hook.act(() => {
      execution = hook.current.executeQuery("SELECT 1", false);
    });
    expect(hook.current.loading).toBe(true);
    expect(hook.current).not.toHaveProperty("cancelQuery");
    expect(hook.current).not.toHaveProperty("isTimeout");

    await hook.act(async () => {
      resolveQuery({ data: [{ value: 1 }], error: null });
      await execution;
    });
    expect(hook.current.loading).toBe(false);
    expect(hook.current.error).toBeNull();
    await hook.unmount();
  });
});

describe("database workbench persisted boundary", () => {
  it("reconstructs a valid persisted notebook", () => {
    expect(
      parseWorkbenchPersistedState(
        JSON.stringify({
          blocks: [{ id: "block-1", label: "Users", query: "SELECT 1" }],
          variables: [{ id: "var-1", name: "org", value: "abc" }],
          mergeConfig: {
            leftBlockId: null,
            rightBlockId: null,
            leftKey: null,
            rightKey: null,
            mode: "concat",
            timelineKey: "created_at",
          },
        }),
      ),
    ).toEqual({
      blocks: [{ id: "block-1", label: "Users", query: "SELECT 1" }],
      variables: [{ id: "var-1", name: "org", value: "abc" }],
      mergeConfig: {
        leftBlockId: null,
        rightBlockId: null,
        leftKey: null,
        rightKey: null,
        mode: "concat",
        timelineKey: "created_at",
      },
    });
  });

  it.each([
    "not json",
    JSON.stringify({ blocks: "wrong", variables: [], mergeConfig: {} }),
    JSON.stringify({
      blocks: [{ id: "block-1", label: "Users", query: 1 }],
      variables: [],
      mergeConfig: {
        leftBlockId: null,
        rightBlockId: null,
        leftKey: null,
        rightKey: null,
        mode: "concat",
        timelineKey: "created_at",
      },
    }),
    JSON.stringify({
      blocks: [],
      variables: [],
      mergeConfig: {
        leftBlockId: null,
        rightBlockId: null,
        leftKey: null,
        rightKey: null,
        mode: "invented",
        timelineKey: "created_at",
      },
    }),
  ])("rejects invalid persisted state without asserting its shape", (raw) => {
    expect(parseWorkbenchPersistedState(raw)).toBeNull();
  });
});
