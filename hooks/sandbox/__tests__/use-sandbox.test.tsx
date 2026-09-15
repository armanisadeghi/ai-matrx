import { renderHook } from "@/test-utils/renderHook";
import { useSandboxInstances } from "@/hooks/sandbox/use-sandbox";
import { useState } from "react";

jest.mock("@/lib/sandbox/useSandboxLifecycleSubmission", () => ({ useSandboxLifecycleSubmission: () => ({ submit: jest.fn(async () => ({ admitted: true, receipt: {}, outcome: null })) }) }));
jest.mock("@/lib/sandbox/useSandboxLifecycleTerminalInvalidation", () => ({ useSandboxLifecycleTerminalInvalidation: () => {} }));

let identity: {
  authReady: boolean;
  userId: string | null;
  organizationId: string | null;
} = {
  authReady: true,
  userId: "user-1",
  organizationId: "organization-1",
};

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: { name: string }) => {
    if (selector.name === "selectAuthReady") return identity.authReady;
    if (selector.name === "selectUserId") return identity.userId;
    return identity.organizationId;
  },
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
type ExtensionResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

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
    identity = {
      authReady: true,
      userId: "user-1",
      organizationId: "organization-1",
    };
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

  it("does not issue a legacy batch delete when no canonical target is loaded", async () => {
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
      queuedIds: [],
      deletedIds: [],
      failed: ["unknown", "refused"],
      unknownIds: [],
    });
    await hook.unmount();
  });

  it("never issues a legacy stop request for an unknown target", async () => {
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

    expect(result).toBeNull();
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "PUT")).toBe(false);
    await hook.unmount();
  });

  it("does not use a legacy stop route after a project switch", async () => {
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

    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "PUT")).toBe(false);
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

  it.each([
    ["a 5xx response", () => ({ ok: false, status: 503, json: async () => ({ error: "upstream" }) })],
    ["a network failure", () => Promise.reject(new TypeError("offline"))],
    ["a success with another sandbox's valid expiry", () => ({ ok: true, status: 200, json: async () => ({ instance: { id: "wrong-id", expires_at: "2026-10-01T00:00:00.000Z" } }) })],
  ])("reports %s as an unknown extension outcome", async (_label, response) => {
    const fetchMock = jest.fn(async () => response());
    installFetch(fetchMock);
    const hook = await renderHook(() => useSandboxInstances());

    await hook.act(async () => { await hook.current.extendInstance("extend-id"); });

    expect(hook.current.error).toBe("Could not confirm extension; refresh before retrying");
    await hook.unmount();
  });

  it("does not duplicate an in-flight extension for the same target", async () => {
    let resolveResponse: (response: ExtensionResponse) => void = () => {
      throw new Error("Extension resolver was not initialized.");
    };
    const pending = new Promise<ExtensionResponse>((resolve) => { resolveResponse = resolve; });
    const fetchMock = jest.fn(() => pending);
    installFetch(fetchMock);
    const hook = await renderHook(() => useSandboxInstances());
    let first: Promise<unknown> = Promise.resolve();

    await hook.act(() => { first = hook.current.extendInstance("extend-id"); });
    await hook.act(async () => { await hook.current.extendInstance("extend-id"); });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveResponse({ ok: true, status: 200, json: async () => ({ instance: { id: "extend-id", expires_at: "2026-10-01T00:00:00.000Z" } }) });
    await hook.act(async () => { await first; });
    await hook.unmount();
  });

  it("allows a different sandbox extension while another target is pending", async () => {
    let resolveFirst: (response: ExtensionResponse) => void = () => {
      throw new Error("First extension resolver was not initialized.");
    };
    const first = new Promise<ExtensionResponse>((resolve) => { resolveFirst = resolve; });
    const fetchMock = jest.fn((input: RequestInfo | URL) =>
      String(input).includes("sandbox-a")
        ? first
        : Promise.resolve({ ok: true, status: 200, json: async () => ({ instance: { id: "sandbox-b", expires_at: "2026-10-01T00:00:00.000Z" } }) }),
    );
    installFetch(fetchMock);
    const hook = await renderHook(() => useSandboxInstances());
    let firstExtension: Promise<unknown> = Promise.resolve();

    await hook.act(() => { firstExtension = hook.current.extendInstance("sandbox-a"); });
    let secondResult: Awaited<ReturnType<typeof hook.current.extendInstance>>;
    await hook.act(async () => { secondResult = await hook.current.extendInstance("sandbox-b"); });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(secondResult).toEqual(expect.objectContaining({ id: "sandbox-b" }));
    resolveFirst({ ok: true, status: 200, json: async () => ({ instance: { id: "sandbox-a", expires_at: "2026-10-01T00:00:00.000Z" } }) });
    await hook.act(async () => { await firstExtension; });
    await hook.unmount();
  });

  it("does not publish an extension result after the active organization changes", async () => {
    let resolveResponse: (response: ExtensionResponse) => void = () => {
      throw new Error("Extension resolver was not initialized.");
    };
    const pending = new Promise<ExtensionResponse>((resolve) => { resolveResponse = resolve; });
    const fetchMock = jest.fn(() => pending);
    installFetch(fetchMock);
    const hook = await renderHook(() => {
      const [, refresh] = useState(0);
      return { ...useSandboxInstances(), refresh: () => refresh((value) => value + 1) };
    });
    let extension: Promise<unknown> = Promise.resolve();

    await hook.act(() => { extension = hook.current.extendInstance("extend-id"); });
    identity = { ...identity, organizationId: "organization-2" };
    await hook.act(() => { hook.current.refresh(); });
    resolveResponse({ ok: true, status: 200, json: async () => ({ instance: { id: "extend-id", expires_at: "2026-10-01T00:00:00.000Z" } }) });
    await hook.act(async () => { await extension; });

    expect(hook.current.instances).toEqual([]);
    expect(hook.current.error).toBeNull();
    await hook.unmount();
  });

  it("does not publish an extension result after the same user logs out and back in", async () => {
    let resolveResponse: (response: ExtensionResponse) => void = () => {
      throw new Error("Extension resolver was not initialized.");
    };
    const pending = new Promise<ExtensionResponse>((resolve) => { resolveResponse = resolve; });
    installFetch(jest.fn(() => pending));
    const hook = await renderHook(() => {
      const [, refresh] = useState(0);
      return { ...useSandboxInstances(), refresh: () => refresh((value) => value + 1) };
    });
    let extension: Promise<unknown> = Promise.resolve();

    await hook.act(() => { extension = hook.current.extendInstance("extend-id"); });
    identity = { ...identity, authReady: false, userId: null };
    await hook.act(() => { hook.current.refresh(); });
    identity = { ...identity, authReady: true, userId: "user-1" };
    await hook.act(() => { hook.current.refresh(); });
    resolveResponse({ ok: true, status: 200, json: async () => ({ instance: { id: "extend-id", expires_at: "2026-10-01T00:00:00.000Z" } }) });
    await hook.act(async () => { await extension; });

    expect(hook.current.instances).toEqual([]);
    expect(hook.current.error).toBeNull();
    await hook.unmount();
  });
});
