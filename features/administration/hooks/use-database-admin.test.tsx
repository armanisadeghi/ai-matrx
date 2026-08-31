import { renderHook } from "@/test-utils/renderHook";

const executeSqlQuery = jest.fn();

jest.mock("@/actions/admin/database", () => ({
  executeSqlQuery: (...args: unknown[]) => executeSqlQuery(...args),
  getFunctions: jest.fn(),
  getPermissions: jest.fn(),
}));

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
