import { renderHook } from "@/test-utils/renderHook";
import { useSandboxInstances } from "@/hooks/sandbox/use-sandbox";

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => "organization-1",
}));

jest.mock("@/hooks/sandbox/use-compute-targets", () => ({
  notifyComputeTargetsChanged: jest.fn(),
}));

function listResponse(ids: string[], total: number, hasMore: boolean) {
  return {
    ok: true,
    json: async () => ({
      instances: ids.map((id) => ({ id, sandbox_id: `sbx-${id}` })),
      pagination: { total, limit: 50, offset: 0, hasMore },
    }),
  };
}

type TestResponse = ReturnType<typeof listResponse>;

function installFetch(fetchMock: unknown) {
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: fetchMock,
    writable: true,
  });
}

describe("useSandboxInstances list pagination", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    installFetch(originalFetch);
    jest.restoreAllMocks();
  });

  it("starts in loading state until the first list response settles", async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL) =>
      listResponse([], 0, false),
    );
    installFetch(fetchMock);

    const hook = await renderHook(() => useSandboxInstances());
    expect(hook.current.loading).toBe(true);

    await hook.act(async () => {
      await hook.current.fetchInstances();
    });

    expect(hook.current.loading).toBe(false);
    await hook.unmount();
  });

  it("reads every API page before exposing the default list", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      const offset = Number(url.searchParams.get("offset"));
      if (offset === 0) return listResponse(["a", "b"], 3, true);
      if (offset === 50) return listResponse(["b", "c"], 3, false);
      throw new Error(`Unexpected offset ${offset}`);
    });
    installFetch(fetchMock);

    const hook = await renderHook(() => useSandboxInstances());
    await hook.act(async () => {
      await hook.current.fetchInstances();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      "/api/sandbox?limit=50&offset=0",
      "/api/sandbox?limit=50&offset=50",
    ]);
    expect(hook.current.instances.map((instance) => instance.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(hook.current.total).toBe(3);

    await hook.unmount();
  });

  it("keeps explicit limit and offset calls as one requested page", async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL) =>
      listResponse(["page-2"], 101, true),
    );
    installFetch(fetchMock);

    const hook = await renderHook(() => useSandboxInstances());
    await hook.act(async () => {
      await hook.current.fetchInstances({ limit: 25, offset: 50 });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/sandbox?limit=25&offset=50",
    );
    expect(hook.current.instances.map((instance) => instance.id)).toEqual([
      "page-2",
    ]);

    await hook.unmount();
  });

  it("does not replace a newer list with an older request that finishes later", async () => {
    let resolveFirst: (response: TestResponse) => void = () => {
      throw new Error("First request resolver was not initialized.");
    };
    const first = new Promise<TestResponse>((resolve) => {
      resolveFirst = resolve;
    });
    let calls = 0;
    const fetchMock = jest.fn(() => {
      calls += 1;
      return calls === 1
        ? first
        : Promise.resolve(listResponse(["new"], 1, false));
    });
    installFetch(fetchMock);

    const hook = await renderHook(() => useSandboxInstances());
    let firstRequest: Promise<unknown> | null = null;
    await hook.act(async () => {
      firstRequest = hook.current.fetchInstances();
    });
    await hook.act(async () => {
      await hook.current.fetchInstances();
    });
    resolveFirst(listResponse(["old"], 1, false));
    await hook.act(async () => {
      await firstRequest;
    });

    expect(hook.current.instances.map((instance) => instance.id)).toEqual([
      "new",
    ]);
    expect(hook.current.error).toBeNull();

    await hook.unmount();
  });

  it("reports an inconsistent later page instead of presenting a partial list", async () => {
    let calls = 0;
    const fetchMock = jest.fn(async () => {
      calls += 1;
      return calls === 1
        ? listResponse(["a"], 2, true)
        : listResponse([], 2, true);
    });
    installFetch(fetchMock);

    const hook = await renderHook(() => useSandboxInstances());
    await hook.act(async () => {
      await hook.current.fetchInstances();
    });

    expect(hook.current.instances).toEqual([]);
    expect(hook.current.error).toBe(
      "Sandbox list reported another page but returned no rows.",
    );

    await hook.unmount();
  });
});
