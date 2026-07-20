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
    finishIdb?.();
    await pending;
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
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(writeSliceMock).toHaveBeenCalledTimes(1);

    releases[0]();
    await older;
    await Promise.resolve();
    await Promise.resolve();
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
});
