import type { IdentityKey } from "@/lib/sync/types";
import type { PersistedWindowWorkspace } from "@/features/window-panels/persistence/windowSessionSerialization";

const readSliceMock = jest.fn();
const writeSliceMock = jest.fn();
const deleteSliceMock = jest.fn();

jest.mock("@/lib/sync/persistence/idb", () => ({
  deleteSlice: (...args: unknown[]) => deleteSliceMock(...args),
  readSlice: (...args: unknown[]) => readSliceMock(...args),
  writeSlice: (...args: unknown[]) => writeSliceMock(...args),
}));

import {
  __resetWindowSessionStoreForTests,
  loadLocalWindowWorkspace,
  releaseWindowWorkspaceLease,
  renewWindowWorkspaceLease,
  saveLocalWindowWorkspace,
} from "@/features/window-panels/persistence/localWindowSessionStore";

const IDENTITY: IdentityKey = {
  type: "auth",
  userId: "user-a",
  key: "auth:user-a",
};

function workspace(
  savedAt: number,
  workspaceId = "workspace-1",
): PersistedWindowWorkspace {
  return {
    schemaVersion: 1,
    workspaceId,
    savedAt,
    sessions: [],
  };
}

describe("local window workspace store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    readSliceMock.mockReset().mockResolvedValue(null);
    writeSliceMock.mockReset().mockResolvedValue(undefined);
    deleteSliceMock.mockReset().mockResolvedValue(undefined);
    __resetWindowSessionStoreForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("writes the synchronous mirror before IndexedDB resolves", async () => {
    let finishIdb: (() => void) | undefined;
    writeSliceMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishIdb = resolve;
        }),
    );

    const pending = saveLocalWindowWorkspace(IDENTITY, workspace(10));
    const loadedBeforeIdb = await loadLocalWindowWorkspace(
      IDENTITY,
      "workspace-1",
    );
    expect(loadedBeforeIdb).toMatchObject({
      source: "local-storage",
      workspace: { savedAt: 10 },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(finishIdb).toBeDefined();
    finishIdb?.();
    await pending;
  });

  it("renews and releases the current document lease without polling", () => {
    renewWindowWorkspaceLease("workspace-lease");
    expect(
      window.localStorage.getItem(
        "matrx:window-workspace-lease:workspace-lease",
      ),
    ).not.toBeNull();

    releaseWindowWorkspaceLease("workspace-lease");

    expect(
      window.localStorage.getItem(
        "matrx:window-workspace-lease:workspace-lease",
      ),
    ).toBeNull();
  });

  it("serializes IDB writes so an older completion cannot resurrect state", async () => {
    const releases: Array<() => void> = [];
    writeSliceMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releases.push(resolve);
        }),
    );

    const older = saveLocalWindowWorkspace(IDENTITY, workspace(10));
    const closing = saveLocalWindowWorkspace(IDENTITY, workspace(11));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(writeSliceMock).toHaveBeenCalledTimes(1);

    releases[0]();
    await older;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(writeSliceMock).toHaveBeenCalledTimes(2);
    expect(writeSliceMock.mock.calls[1][3]).toMatchObject({ savedAt: 11 });
    releases[1]();
    await closing;
  });

  it("chooses the newest valid tier and never crosses identities", async () => {
    await saveLocalWindowWorkspace(IDENTITY, workspace(20));
    readSliceMock.mockResolvedValue({ body: workspace(10) });
    expect(
      await loadLocalWindowWorkspace(IDENTITY, "workspace-1"),
    ).toMatchObject({ source: "local-storage", workspace: { savedAt: 20 } });

    const otherIdentity: IdentityKey = {
      type: "auth",
      userId: "user-b",
      key: "auth:user-b",
    };
    readSliceMock.mockResolvedValue(null);
    expect(
      await loadLocalWindowWorkspace(otherIdentity, "workspace-1"),
    ).toEqual({ source: "miss", workspace: null });
  });

  it("falls back to the synchronous mirror when IndexedDB rejects", async () => {
    await saveLocalWindowWorkspace(IDENTITY, workspace(30));
    readSliceMock.mockRejectedValueOnce(new Error("idb unavailable"));
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      loadLocalWindowWorkspace(IDENTITY, "workspace-1"),
    ).resolves.toMatchObject({
      source: "local-storage",
      workspace: { savedAt: 30 },
    });
  });

  it("removes a stale mirror when a newer write reaches only IndexedDB", async () => {
    const mirrorKey = "matrx:window-workspace:auth:user-a:workspace-1";
    window.localStorage.setItem(
      mirrorKey,
      JSON.stringify({
        version: 1,
        identityKey: IDENTITY.key,
        body: workspace(10),
      }),
    );
    const setItem = Storage.prototype.setItem;
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    Storage.prototype.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    try {
      await saveLocalWindowWorkspace(IDENTITY, workspace(20));
    } finally {
      Storage.prototype.setItem = setItem;
    }

    expect(window.localStorage.getItem(mirrorKey)).toBeNull();
    readSliceMock.mockResolvedValue({ body: workspace(20) });
    await expect(
      loadLocalWindowWorkspace(IDENTITY, "workspace-1"),
    ).resolves.toMatchObject({
      source: "indexed-db",
      workspace: { savedAt: 20 },
    });
  });

  it("keeps a slow IDB fallback distinguishable from an authoritative miss", async () => {
    jest.useFakeTimers();
    let resolveIdb:
      ((value: { body: PersistedWindowWorkspace }) => void) | undefined;
    readSliceMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveIdb = resolve;
      }),
    );
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    const pendingRead = loadLocalWindowWorkspace(IDENTITY, "workspace-1");
    await jest.advanceTimersByTimeAsync(751);
    const timedOut = await pendingRead;
    expect(timedOut).toMatchObject({ source: "timeout", workspace: null });

    resolveIdb?.({ body: workspace(40) });
    await expect(timedOut.pendingWorkspace).resolves.toMatchObject({
      savedAt: 40,
    });
    jest.useRealTimers();
  });

  it("bounds identity workspaces and re-indexes a still-live tab after eviction", async () => {
    let now = 1_000;
    const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => now++);
    for (let index = 1; index <= 6; index += 1) {
      await saveLocalWindowWorkspace(
        IDENTITY,
        workspace(index, `workspace-${index}`),
      );
    }

    expect(deleteSliceMock).toHaveBeenCalledWith(
      IDENTITY.key,
      "window-workspace:workspace-1",
      1,
    );

    await saveLocalWindowWorkspace(IDENTITY, workspace(7, "workspace-1"));
    expect(deleteSliceMock).toHaveBeenCalledWith(
      IDENTITY.key,
      "window-workspace:workspace-2",
      1,
    );
    nowSpy.mockRestore();
  });

  it("uses race-free per-workspace index rows and never reaps an active lease", async () => {
    let now = 5_000;
    jest.spyOn(Date, "now").mockImplementation(() => now++);
    await saveLocalWindowWorkspace(IDENTITY, workspace(1, "workspace-active"));
    window.localStorage.setItem(
      "matrx:window-workspace-lease:workspace-active",
      JSON.stringify({
        version: 1,
        identityKey: "tab-lease",
        body: { runtimeId: "another-live-tab", expiresAt: 50_000 },
      }),
    );

    for (let index = 2; index <= 6; index += 1) {
      await saveLocalWindowWorkspace(
        IDENTITY,
        workspace(index, `workspace-${index}`),
      );
    }

    expect(
      window.localStorage.getItem(
        "matrx:window-workspace-index:auth:user-a:workspace-active",
      ),
    ).not.toBeNull();
    expect(deleteSliceMock).not.toHaveBeenCalledWith(
      IDENTITY.key,
      "window-workspace:workspace-active",
      1,
    );
  });

  it("orders reaper deletion after an in-flight write for that workspace", async () => {
    let releaseFirst: (() => void) | undefined;
    writeSliceMock.mockImplementation((_identity: string, slice: string) =>
      slice === "window-workspace:workspace-1"
        ? new Promise<void>((resolve) => {
            releaseFirst = resolve;
          })
        : Promise.resolve(),
    );
    let now = 2_000;
    jest.spyOn(Date, "now").mockImplementation(() => now++);

    const firstWrite = saveLocalWindowWorkspace(
      IDENTITY,
      workspace(1, "workspace-1"),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let index = 2; index <= 6; index += 1) {
      await saveLocalWindowWorkspace(
        IDENTITY,
        workspace(index, `workspace-${index}`),
      );
    }
    expect(deleteSliceMock).not.toHaveBeenCalledWith(
      IDENTITY.key,
      "window-workspace:workspace-1",
      1,
    );

    releaseFirst?.();
    await firstWrite;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deleteSliceMock).toHaveBeenCalledWith(
      IDENTITY.key,
      "window-workspace:workspace-1",
      1,
    );
  });
});
