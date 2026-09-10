/**
 * localWindowSessionStore — the two-tier (localStorage mirror + IndexedDB)
 * window workspace store.
 *
 * SUT: `features/window-panels/persistence/localWindowSessionStore.ts`. It
 * OWNS tier choice, identity isolation, mirror-before-IDB ordering, per-
 * workspace write serialization, document leases, and bounded eviction across
 * both tiers. Nothing it owns is stubbed.
 *
 * The ONE double is the IndexedDB wrapper (`@/lib/sync/persistence/idb`) —
 * external persistence — replaced by a REAL in-memory backend: writes and
 * deletes COMMIT when they resolve (as an IDB transaction does), reads return
 * what was committed. Tests that need a slow or failing IDB close a gate
 * instead of scripting return values, so every assertion reads the state the
 * store actually left behind — never "the mock was called with X".
 *
 * localStorage is jsdom's real implementation; `Date.now` is pinned where
 * eviction order depends on it (a clock is a legitimate double).
 */

import type { IdbSliceRecord } from "@/lib/sync/persistence/idb";
import type { IdentityKey } from "@/lib/sync/types";
import {
  WINDOW_WORKSPACE_SCHEMA_VERSION,
  type PersistedWindowWorkspace,
} from "@/features/window-panels/persistence/windowSessionSerialization";

interface PendingIdbOperation {
  label: string;
  settle: () => void;
}

const mockIdb = {
  records: new Map<string, IdbSliceRecord>(),
  pending: [] as PendingIdbOperation[],
  /** Predicate over "write <slice>" / "delete <slice>" / "read <slice>". */
  gate: null as ((label: string) => boolean) | null,
  failNextRead: null as Error | null,
};

jest.mock("@/lib/sync/persistence/idb", () => {
  const keyOf = (identityKey: string, sliceName: string, version: number) =>
    `${identityKey}|${sliceName}|${version}`;
  function run<T>(label: string, commit: () => T): Promise<T> {
    if (mockIdb.gate?.(label)) {
      return new Promise<T>((resolve) => {
        mockIdb.pending.push({ label, settle: () => resolve(commit()) });
      });
    }
    return Promise.resolve(commit());
  }
  return {
    readSlice: (identityKey: string, sliceName: string, version: number) => {
      if (mockIdb.failNextRead) {
        const error = mockIdb.failNextRead;
        mockIdb.failNextRead = null;
        return Promise.reject(error);
      }
      return run(
        `read ${sliceName}`,
        () => mockIdb.records.get(keyOf(identityKey, sliceName, version)) ?? null,
      );
    },
    writeSlice: (
      identityKey: string,
      sliceName: string,
      version: number,
      body: unknown,
    ) =>
      run(`write ${sliceName}`, () => {
        const record: IdbSliceRecord = {
          key: keyOf(identityKey, sliceName, version),
          identityKey,
          sliceName,
          version,
          body,
          persistedAt: 0,
        };
        mockIdb.records.set(record.key, record);
      }),
    deleteSlice: (identityKey: string, sliceName: string, version: number) =>
      run(`delete ${sliceName}`, () => {
        mockIdb.records.delete(keyOf(identityKey, sliceName, version));
      }),
  };
});

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
const OTHER_IDENTITY: IdentityKey = {
  type: "auth",
  userId: "user-b",
  key: "auth:user-b",
};

function workspace(
  savedAt: number,
  workspaceId = "workspace-1",
): PersistedWindowWorkspace {
  return {
    schemaVersion: WINDOW_WORKSPACE_SCHEMA_VERSION,
    workspaceId,
    savedAt,
    sessions: [],
  };
}

const LEASE_KEY = (workspaceId: string) =>
  `matrx:window-workspace-lease:${workspaceId}`;

/** A lease written by ANOTHER live document (a different runtime). */
function plantForeignLease(workspaceId: string): void {
  window.localStorage.setItem(
    LEASE_KEY(workspaceId),
    JSON.stringify({
      version: 1,
      identityKey: "tab-lease",
      body: { runtimeId: "another-live-tab", expiresAt: Date.now() + 60_000 },
    }),
  );
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Settle every gated IDB operation, NEWEST FIRST — the adversarial order. A
 * store that serializes correctly only ever exposes one operation per
 * workspace at a time, so the order cannot hurt it; a store that lets
 * operations overlap has its older commit land last.
 */
async function drainNewestFirst(): Promise<void> {
  for (let guard = 0; guard < 100; guard += 1) {
    await flush();
    const next = mockIdb.pending.pop();
    if (!next) return;
    next.settle();
  }
  throw new Error("IDB operations never drained");
}

/** What the IndexedDB tier alone holds (the mirror is taken out of the way). */
async function idbTier(identity: IdentityKey, workspaceId: string) {
  const mirrorKey = `matrx:window-workspace:${identity.key}:${workspaceId}`;
  const mirror = window.localStorage.getItem(mirrorKey);
  window.localStorage.removeItem(mirrorKey);
  try {
    return await loadLocalWindowWorkspace(identity, workspaceId);
  } finally {
    if (mirror !== null) window.localStorage.setItem(mirrorKey, mirror);
  }
}

describe("local window workspace store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockIdb.records.clear();
    mockIdb.pending.length = 0;
    mockIdb.gate = null;
    mockIdb.failNextRead = null;
    __resetWindowSessionStoreForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("serves a save from the synchronous mirror before IndexedDB commits", async () => {
    mockIdb.gate = (label) => label.startsWith("write");

    const pending = saveLocalWindowWorkspace(IDENTITY, workspace(10));
    await expect(
      loadLocalWindowWorkspace(IDENTITY, "workspace-1"),
    ).resolves.toMatchObject({ source: "local-storage", workspace: { savedAt: 10 } });

    await drainNewestFirst();
    await pending;
    await expect(idbTier(IDENTITY, "workspace-1")).resolves.toMatchObject({
      source: "indexed-db",
      workspace: { savedAt: 10 },
    });
  });

  it("renew writes this document's lease and release removes it", () => {
    renewWindowWorkspaceLease("workspace-lease");
    expect(window.localStorage.getItem(LEASE_KEY("workspace-lease"))).not.toBeNull();

    releaseWindowWorkspaceLease("workspace-lease");

    expect(window.localStorage.getItem(LEASE_KEY("workspace-lease"))).toBeNull();
  });

  it("release never removes a lease another live document owns", () => {
    plantForeignLease("workspace-shared");

    releaseWindowWorkspaceLease("workspace-shared");

    expect(window.localStorage.getItem(LEASE_KEY("workspace-shared"))).not.toBeNull();
  });

  it("an older write finishing late cannot overwrite a newer save in IndexedDB", async () => {
    mockIdb.gate = (label) => label.startsWith("write");

    const older = saveLocalWindowWorkspace(IDENTITY, workspace(10));
    const newer = saveLocalWindowWorkspace(IDENTITY, workspace(11));
    await drainNewestFirst();
    await Promise.all([older, newer]);

    await expect(idbTier(IDENTITY, "workspace-1")).resolves.toMatchObject({
      source: "indexed-db",
      workspace: { savedAt: 11 },
    });
  });

  it("never serves one identity's workspace to another identity", async () => {
    await saveLocalWindowWorkspace(IDENTITY, workspace(20));

    await expect(
      loadLocalWindowWorkspace(OTHER_IDENTITY, "workspace-1"),
    ).resolves.toEqual({ source: "miss", workspace: null });
  });

  it("refuses a mirror record stamped with a different identity", async () => {
    window.localStorage.setItem(
      `matrx:window-workspace:${OTHER_IDENTITY.key}:workspace-1`,
      JSON.stringify({
        version: WINDOW_WORKSPACE_SCHEMA_VERSION,
        identityKey: IDENTITY.key,
        body: workspace(20),
      }),
    );

    await expect(
      loadLocalWindowWorkspace(OTHER_IDENTITY, "workspace-1"),
    ).resolves.toEqual({ source: "miss", workspace: null });
  });

  it("an IndexedDB read failure with no mirror resolves to a miss, never a rejection", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockIdb.failNextRead = new Error("idb unavailable");

    await expect(
      loadLocalWindowWorkspace(IDENTITY, "workspace-1"),
    ).resolves.toEqual({ source: "miss", workspace: null });
  });

  it("a failed mirror write removes the stale mirror so the newer IndexedDB copy wins", async () => {
    await saveLocalWindowWorkspace(IDENTITY, workspace(10));
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const setItem = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    await saveLocalWindowWorkspace(IDENTITY, workspace(20));
    setItem.mockRestore();

    await expect(
      loadLocalWindowWorkspace(IDENTITY, "workspace-1"),
    ).resolves.toMatchObject({ source: "indexed-db", workspace: { savedAt: 20 } });
  });

  it("uses an IndexedDB answer that arrives inside the hydration budget", async () => {
    jest.useFakeTimers();
    await saveLocalWindowWorkspace(IDENTITY, workspace(35));
    window.localStorage.clear();
    mockIdb.gate = (label) => label.startsWith("read");

    const read = loadLocalWindowWorkspace(IDENTITY, "workspace-1");
    // A cold IndexedDB open commonly takes tens of milliseconds.
    await jest.advanceTimersByTimeAsync(50);
    mockIdb.pending.pop()?.settle();
    await jest.advanceTimersByTimeAsync(0);

    await expect(read).resolves.toMatchObject({
      source: "indexed-db",
      workspace: { savedAt: 35 },
    });
  });

  it("a read past the hydration budget reports timeout and still delivers the late answer", async () => {
    jest.useFakeTimers();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await saveLocalWindowWorkspace(IDENTITY, workspace(40));
    window.localStorage.clear();
    mockIdb.gate = (label) => label.startsWith("read");

    const read = loadLocalWindowWorkspace(IDENTITY, "workspace-1");
    await jest.advanceTimersByTimeAsync(751);
    const timedOut = await read;
    expect(timedOut).toMatchObject({ source: "timeout", workspace: null });

    mockIdb.pending.pop()?.settle();
    await expect(timedOut.pendingWorkspace).resolves.toMatchObject({ savedAt: 40 });
  });

  it("keeps the five most recent workspaces and evicts the oldest from both tiers", async () => {
    let now = 1_000;
    jest.spyOn(Date, "now").mockImplementation(() => (now += 1));
    for (let index = 1; index <= 6; index += 1) {
      await saveLocalWindowWorkspace(IDENTITY, workspace(index, `workspace-${index}`));
    }
    await drainNewestFirst();

    await expect(
      loadLocalWindowWorkspace(IDENTITY, "workspace-1"),
    ).resolves.toEqual({ source: "miss", workspace: null });
    for (let index = 2; index <= 6; index += 1) {
      await expect(
        loadLocalWindowWorkspace(IDENTITY, `workspace-${index}`),
      ).resolves.toMatchObject({ source: "local-storage", workspace: { savedAt: index } });
    }

    // A still-live tab saving its evicted workspace again is re-indexed as
    // the newest; the oldest remaining one goes instead.
    await saveLocalWindowWorkspace(IDENTITY, workspace(7, "workspace-1"));
    await drainNewestFirst();
    await expect(
      loadLocalWindowWorkspace(IDENTITY, "workspace-1"),
    ).resolves.toMatchObject({ workspace: { savedAt: 7 } });
    await expect(idbTier(IDENTITY, "workspace-2")).resolves.toEqual({
      source: "miss",
      workspace: null,
    });
  });

  it("never evicts a workspace whose lease another live tab holds", async () => {
    let now = 5_000;
    jest.spyOn(Date, "now").mockImplementation(() => (now += 1));
    await saveLocalWindowWorkspace(IDENTITY, workspace(1, "workspace-active"));
    plantForeignLease("workspace-active");
    for (let index = 2; index <= 6; index += 1) {
      await saveLocalWindowWorkspace(IDENTITY, workspace(index, `workspace-${index}`));
    }
    await drainNewestFirst();

    await expect(idbTier(IDENTITY, "workspace-active")).resolves.toMatchObject({
      source: "indexed-db",
      workspace: { savedAt: 1 },
    });
    await expect(
      loadLocalWindowWorkspace(IDENTITY, "workspace-active"),
    ).resolves.toMatchObject({ source: "local-storage", workspace: { savedAt: 1 } });
  });

  it("an eviction queued behind an in-flight write deletes AFTER that write commits", async () => {
    let now = 2_000;
    jest.spyOn(Date, "now").mockImplementation(() => (now += 1));
    mockIdb.gate = (label) => label === "write window-workspace:workspace-1";

    const firstWrite = saveLocalWindowWorkspace(IDENTITY, workspace(1, "workspace-1"));
    await flush();
    mockIdb.gate = null;
    for (let index = 2; index <= 6; index += 1) {
      await saveLocalWindowWorkspace(IDENTITY, workspace(index, `workspace-${index}`));
    }
    await drainNewestFirst();
    await firstWrite;
    await flush();

    await expect(idbTier(IDENTITY, "workspace-1")).resolves.toEqual({
      source: "miss",
      workspace: null,
    });
  });

  it("a lease claimed while an eviction waits in the queue cancels that eviction", async () => {
    let now = 3_000;
    jest.spyOn(Date, "now").mockImplementation(() => (now += 1));
    mockIdb.gate = (label) => label === "write window-workspace:workspace-1";

    const firstWrite = saveLocalWindowWorkspace(IDENTITY, workspace(1, "workspace-1"));
    await flush();
    mockIdb.gate = null;
    for (let index = 2; index <= 6; index += 1) {
      await saveLocalWindowWorkspace(IDENTITY, workspace(index, `workspace-${index}`));
    }
    // The background tab wakes up after the index scan chose workspace-1 but
    // before its queued cleanup runs.
    plantForeignLease("workspace-1");
    await drainNewestFirst();
    await firstWrite;
    await flush();

    await expect(idbTier(IDENTITY, "workspace-1")).resolves.toMatchObject({
      source: "indexed-db",
      workspace: { savedAt: 1 },
    });
  });
});
