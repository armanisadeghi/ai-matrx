import { renderHook } from "@/test-utils/renderHook";
import { useSandboxInstances } from "@/hooks/sandbox/use-sandbox";
import { useState } from "react";

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => "organization-1",
}));

jest.mock("@/hooks/sandbox/use-compute-targets", () => ({
  notifyComputeTargetsChanged: jest.fn(),
}));

jest.mock("@/lib/knobs/featureKnobs", () => ({
  knobInt: jest.fn(async () => 50),
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

  it("hides rows from the previous project before the next project fetch settles", async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL) =>
      listResponse(["project-one"], 1, false),
    );
    installFetch(fetchMock);

    const hook = await renderHook(() => {
      const [projectId, setProjectId] = useState("project-one");
      return { ...useSandboxInstances(projectId), setProjectId };
    });
    await hook.act(async () => {
      await hook.current.fetchInstances();
    });
    expect(hook.current.instances.map((instance) => instance.id)).toEqual([
      "project-one",
    ]);

    await hook.act(() => {
      hook.current.setProjectId("project-two");
    });

    expect(hook.current.instances).toEqual([]);
    expect(hook.current.total).toBe(0);
    expect(hook.current.error).toBeNull();
    expect(hook.current.loading).toBe(true);
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

describe("useSandboxInstances lifecycle outcomes", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    installFetch(originalFetch);
    jest.restoreAllMocks();
  });

  it("keeps an unknown batch delete out of the definitive failures", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/unknown")) {
        return {
          ok: false,
          json: async () => ({ status: "outcome_unknown", error: "check persisted state" }),
        };
      }
      return { ok: false, json: async () => ({ error: "locked" }) };
    });
    installFetch(fetchMock);

    const hook = await renderHook(() => useSandboxInstances());
    let result: Awaited<ReturnType<typeof hook.current.deleteInstances>> | null = null;
    await hook.act(async () => {
      result = await hook.current.deleteInstances(["unknown", "refused"]);
    });

    expect(result).toEqual({
      deletedIds: [],
      failed: ["refused"],
      unknownIds: ["unknown"],
    });
    await hook.unmount();
  });

  it("reconciles an outcome-unknown stop rather than reporting it as a definitive failure", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return {
          ok: false,
          json: async () => ({ status: "outcome_unknown", error: "check persisted state" }),
        };
      }
      return listResponse(["reconciled"], 1, false);
    });
    installFetch(fetchMock);

    const hook = await renderHook(() => useSandboxInstances());
    let result: Awaited<ReturnType<typeof hook.current.stopInstance>> | null = null;
    await hook.act(async () => {
      result = await hook.current.stopInstance("reconciled");
    });

    expect(result).toBe("outcome_unknown");
    expect(hook.current.error).toBe("check persisted state");
    expect(fetchMock).toHaveBeenCalledWith("/api/sandbox/reconciled", expect.objectContaining({ method: "PUT" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/sandbox?limit=50&offset=0", expect.any(Object));
    await hook.unmount();
  });

  it("reconciles an outcome-unknown stop against the current project after a project switch", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return {
          ok: false,
          json: async () => ({ status: "outcome_unknown", error: "check persisted state" }),
        };
      }
      return listResponse(["reconciled"], 1, false);
    });
    installFetch(fetchMock);

    const hook = await renderHook(() => {
      const [projectId, setProjectId] = useState("project-one");
      return { ...useSandboxInstances(projectId), setProjectId };
    });
    await hook.act(async () => {
      hook.current.setProjectId("project-two");
    });
    await hook.act(async () => {
      await hook.current.stopInstance("reconciled");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sandbox?project_id=project-two&limit=50&offset=0",
      expect.any(Object),
    );
    await hook.unmount();
  });

  it("uses the dedicated POST extend route and accepts only its matching finite expiry", async () => {
    const expiry = "2026-10-01T00:00:00.000Z";
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => ({
      ok: true, status: 200, json: async () => ({ instance: { id: "extend-id", expires_at: expiry } }),
    }));
    installFetch(fetchMock);
    const hook = await renderHook(() => useSandboxInstances());
    let result;
    await hook.act(async () => { result = await hook.current.extendInstance("extend-id", 7200); });
    expect(fetchMock).toHaveBeenCalledWith("/api/sandbox/extend-id/extend", expect.objectContaining({ method: "POST", body: JSON.stringify({ ttl_seconds: 7200 }) }));
    expect(result).toEqual(expect.objectContaining({ id: "extend-id", expires_at: expiry }));
    await hook.unmount();
  });

  it("keeps a 405 old-method response and malformed success from claiming extension", async () => {
    const fetchMock = jest.fn(async () => ({ ok: false, status: 405, json: async () => ({ error: "Use POST /extend" }) }));
    installFetch(fetchMock);
    const hook = await renderHook(() => useSandboxInstances());
    await hook.act(async () => { await hook.current.extendInstance("extend-id"); });
    expect(hook.current.error).toBe("Use POST /extend");
    await hook.unmount();
  });
});
