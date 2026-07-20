import { deleteSlice, readSlice, writeSlice } from "@/lib/sync/persistence/idb";
import { localStorageAdapter } from "@/lib/sync/persistence/local-storage";
import type { IdentityKey } from "@/lib/sync/types";
import {
  WINDOW_WORKSPACE_SCHEMA_VERSION,
  type PersistedWindowWorkspace,
} from "./windowSessionSerialization";

const WORKSPACE_SESSION_KEY = "matrx:window-workspace-id";
const SLICE_PREFIX = "window-workspace";
const LEASE_PREFIX = "matrx:window-workspace-lease";
const INDEX_PREFIX = "matrx:window-workspace-index";
const LEASE_MS = 24 * 60 * 60 * 1000;
const IDB_READ_BUDGET_MS = 750;
const MAX_WORKSPACES_PER_IDENTITY = 5;
const INDEX_REFRESH_MS = 60 * 1000;
const writeQueues = new Map<string, Promise<void>>();
const runtimeId = randomWorkspaceId();
const fallbackWorkspaceId = `fallback-${runtimeId}`;
let leasedWorkspaceId: string | null = null;

export interface LocalWindowWorkspaceRead {
  workspace: PersistedWindowWorkspace | null;
  source: "indexed-db" | "local-storage" | "miss" | "timeout";
  /** Resolves the authoritative IDB fallback after a hydration-budget timeout. */
  pendingWorkspace?: Promise<PersistedWindowWorkspace | null>;
}

function randomWorkspaceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * One stable workspace per browser tab. sessionStorage survives refresh but
 * is copied/isolateable by the browser for new tabs, preventing tabs from
 * continuously overwriting one another's window layout.
 */
export function getWindowWorkspaceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.sessionStorage.getItem(WORKSPACE_SESSION_KEY);
    const navigation = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    const existingLease = existing
      ? localStorageAdapter.read(`${LEASE_PREFIX}:${existing}`)
      : null;
    const leaseBody = existingLease?.body as
      { runtimeId?: unknown; expiresAt?: unknown } | undefined;
    const claimedByAnotherLiveDocument = Boolean(
      existing &&
      navigation?.type !== "reload" &&
      leaseBody?.runtimeId !== runtimeId &&
      typeof leaseBody?.expiresAt === "number" &&
      leaseBody.expiresAt > Date.now(),
    );
    const workspaceId =
      existing && !claimedByAnotherLiveDocument
        ? existing
        : randomWorkspaceId();
    window.sessionStorage.setItem(WORKSPACE_SESSION_KEY, workspaceId);
    claimWorkspaceLease(workspaceId);
    return workspaceId;
  } catch (error) {
    console.warn(
      "[window-preservation] sessionStorage unavailable; using a document-local fallback. Refresh preservation is unavailable for this tab.",
      error,
    );
    claimWorkspaceLease(fallbackWorkspaceId);
    return fallbackWorkspaceId;
  }
}

function claimWorkspaceLease(workspaceId: string): void {
  if (leasedWorkspaceId && leasedWorkspaceId !== workspaceId) {
    const previousKey = `${LEASE_PREFIX}:${leasedWorkspaceId}`;
    const previousLease = localStorageAdapter.read(previousKey);
    const previousBody = previousLease?.body as
      { runtimeId?: unknown } | undefined;
    if (previousBody?.runtimeId === runtimeId) {
      localStorageAdapter.remove(previousKey);
    }
  }
  leasedWorkspaceId = workspaceId;
  localStorageAdapter.write(`${LEASE_PREFIX}:${workspaceId}`, {
    version: 1,
    identityKey: "tab-lease",
    body: { runtimeId, expiresAt: Date.now() + LEASE_MS },
  });
}

/** Event-driven lease heartbeat; no polling or background write loop. */
export function renewWindowWorkspaceLease(workspaceId: string): void {
  claimWorkspaceLease(workspaceId);
}

/** Release only the lease owned by this document/runtime. */
export function releaseWindowWorkspaceLease(workspaceId: string): void {
  const key = `${LEASE_PREFIX}:${workspaceId}`;
  const lease = localStorageAdapter.read(key);
  const body = lease?.body as { runtimeId?: unknown } | undefined;
  if (body?.runtimeId === runtimeId) localStorageAdapter.remove(key);
  if (leasedWorkspaceId === workspaceId) leasedWorkspaceId = null;
}

function sliceName(workspaceId: string): string {
  return `${SLICE_PREFIX}:${workspaceId}`;
}

function localStorageKey(identity: IdentityKey, workspaceId: string): string {
  return `matrx:${SLICE_PREFIX}:${identity.key}:${workspaceId}`;
}

interface WorkspaceIndexEntry {
  workspaceId: string;
  lastUsedAt: number;
}

function workspaceIndexEntryKey(
  identity: IdentityKey,
  workspaceId: string,
): string {
  return `${INDEX_PREFIX}:${identity.key}:${workspaceId}`;
}

function hasActiveWorkspaceLease(workspaceId: string, now: number): boolean {
  const lease = localStorageAdapter.read(`${LEASE_PREFIX}:${workspaceId}`);
  const body = lease?.body as { expiresAt?: unknown } | undefined;
  return typeof body?.expiresAt === "number" && body.expiresAt > now;
}

function listWorkspaceIndexEntries(
  identity: IdentityKey,
): WorkspaceIndexEntry[] {
  if (typeof window === "undefined") return [];
  const prefix = `${INDEX_PREFIX}:${identity.key}:`;
  const entries = new Map<string, WorkspaceIndexEntry>();
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const record = localStorageAdapter.read(key);
      const body = record?.body as Partial<WorkspaceIndexEntry> | undefined;
      if (
        typeof body?.workspaceId === "string" &&
        typeof body.lastUsedAt === "number"
      ) {
        entries.set(body.workspaceId, {
          workspaceId: body.workspaceId,
          lastUsedAt: body.lastUsedAt,
        });
      }
    }
  } catch (error) {
    console.warn(
      "[window-preservation] Could not enumerate workspace index records; cleanup will retry on a later save.",
      error,
    );
  }

  // One-shot compatibility with the original shared-array index. Converting
  // to one key per workspace removes cross-tab read/modify/write races.
  const legacyKey = `${INDEX_PREFIX}:${identity.key}`;
  const legacy = localStorageAdapter.read(legacyKey);
  if (Array.isArray(legacy?.body)) {
    (legacy.body as WorkspaceIndexEntry[]).forEach((row) => {
      if (
        row &&
        typeof row.workspaceId === "string" &&
        typeof row.lastUsedAt === "number" &&
        !entries.has(row.workspaceId)
      ) {
        entries.set(row.workspaceId, row);
        localStorageAdapter.write(
          workspaceIndexEntryKey(identity, row.workspaceId),
          { version: 1, identityKey: identity.key, body: row },
        );
      }
    });
    localStorageAdapter.remove(legacyKey);
  }
  return [...entries.values()];
}

function enqueueWorkspaceOperation(
  identityKey: string,
  workspaceId: string,
  operation: () => Promise<void>,
): Promise<void> {
  const queueKey = `${identityKey}:${workspaceId}`;
  const previous = writeQueues.get(queueKey) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => {
      if (typeof navigator !== "undefined" && navigator.locks) {
        return navigator.locks.request(
          `matrx-window-workspace:${queueKey}`,
          operation,
        );
      }
      return operation();
    });
  writeQueues.set(queueKey, next);
  void next.finally(() => {
    if (writeQueues.get(queueKey) === next) writeQueues.delete(queueKey);
  });
  return next;
}

function indexWorkspace(identity: IdentityKey, workspaceId: string): void {
  const now = Date.now();
  const key = workspaceIndexEntryKey(identity, workspaceId);
  const existing = localStorageAdapter.read(key);
  const existingBody = existing?.body as
    Partial<WorkspaceIndexEntry> | undefined;
  const rows = listWorkspaceIndexEntries(identity);
  const current = rows.find((row) => row.workspaceId === workspaceId);
  if (
    current &&
    rows.length <= MAX_WORKSPACES_PER_IDENTITY &&
    now - current.lastUsedAt < INDEX_REFRESH_MS
  ) {
    return;
  }
  const nextRows = rows.filter((row) => row.workspaceId !== workspaceId);
  const currentEntry = {
    workspaceId,
    lastUsedAt:
      typeof existingBody?.lastUsedAt === "number" &&
      now - existingBody.lastUsedAt < INDEX_REFRESH_MS
        ? existingBody.lastUsedAt
        : now,
  };
  nextRows.push(currentEntry);
  localStorageAdapter.write(key, {
    version: 1,
    identityKey: identity.key,
    body: currentEntry,
  });
  nextRows.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  nextRows.slice(MAX_WORKSPACES_PER_IDENTITY).forEach((stale) => {
    if (hasActiveWorkspaceLease(stale.workspaceId, now)) return;
    void enqueueWorkspaceOperation(
      identity.key,
      stale.workspaceId,
      async () => {
        // Recheck inside the cross-tab workspace lock. A background tab may
        // have become active after the index scan but before cleanup ran.
        if (hasActiveWorkspaceLease(stale.workspaceId, Date.now())) return;
        localStorageAdapter.remove(
          localStorageKey(identity, stale.workspaceId),
        );
        localStorageAdapter.remove(`${LEASE_PREFIX}:${stale.workspaceId}`);
        localStorageAdapter.remove(
          workspaceIndexEntryKey(identity, stale.workspaceId),
        );
        await deleteSlice(
          identity.key,
          sliceName(stale.workspaceId),
          WINDOW_WORKSPACE_SCHEMA_VERSION,
        );
      },
    );
  });
}

function readWorkspace(value: unknown): PersistedWindowWorkspace | null {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { schemaVersion?: unknown }).schemaVersion !==
      WINDOW_WORKSPACE_SCHEMA_VERSION ||
    typeof (value as { workspaceId?: unknown }).workspaceId !== "string" ||
    typeof (value as { savedAt?: unknown }).savedAt !== "number" ||
    !Array.isArray((value as { sessions?: unknown }).sessions)
  ) {
    return null;
  }
  return value as PersistedWindowWorkspace;
}

/** Read both local tiers and pick the newest valid record. Never rejects. */
export async function loadLocalWindowWorkspace(
  identity: IdentityKey,
  workspaceId: string,
): Promise<LocalWindowWorkspaceRead> {
  const localRecord = localStorageAdapter.read(
    localStorageKey(identity, workspaceId),
  );
  const localWorkspace =
    localRecord?.version === WINDOW_WORKSPACE_SCHEMA_VERSION &&
    localRecord.identityKey === identity.key
      ? readWorkspace(localRecord.body)
      : null;

  // The synchronous mirror is the authoritative fast path. Every save writes
  // it before IDB, so waiting on IDB here adds latency without increasing
  // freshness.
  if (localWorkspace) {
    return { workspace: localWorkspace, source: "local-storage" };
  }

  let budgetTimer: ReturnType<typeof setTimeout> | undefined;
  const timeout = Symbol("idb-window-read-timeout");
  const idbRead = readSlice(
    identity.key,
    sliceName(workspaceId),
    WINDOW_WORKSPACE_SCHEMA_VERSION,
  ).catch((error: unknown) => {
    console.warn(
      "[window-preservation] IndexedDB read failed; using the synchronous mirror.",
      error,
    );
    return null;
  });
  const idbRecord = await Promise.race([
    idbRead,
    new Promise<typeof timeout>((resolve) => {
      budgetTimer = setTimeout(() => resolve(timeout), IDB_READ_BUDGET_MS);
    }),
  ]);
  if (budgetTimer) clearTimeout(budgetTimer);
  if (idbRecord === timeout) {
    console.warn(
      "[window-preservation] IndexedDB did not answer within the hydration budget; preserving the unknown cache without overwriting it.",
    );
    return {
      workspace: null,
      source: "timeout",
      pendingWorkspace: idbRead.then((record) => readWorkspace(record?.body)),
    };
  }
  const idbWorkspace = readWorkspace(idbRecord?.body);

  if (!localWorkspace && !idbWorkspace) {
    return { workspace: null, source: "miss" };
  }
  if (idbWorkspace) {
    return { workspace: idbWorkspace, source: "indexed-db" };
  }
  return { workspace: null, source: "miss" };
}

/**
 * Synchronous write-through first makes pagehide/reload safe; IndexedDB is
 * the larger warm cache and is updated in the background.
 */
export function saveLocalWindowWorkspace(
  identity: IdentityKey,
  workspace: PersistedWindowWorkspace,
): Promise<void> {
  claimWorkspaceLease(workspace.workspaceId);
  indexWorkspace(identity, workspace.workspaceId);
  const mirrorKey = localStorageKey(identity, workspace.workspaceId);
  const mirrorWritten = localStorageAdapter.write(mirrorKey, {
    version: WINDOW_WORKSPACE_SCHEMA_VERSION,
    identityKey: identity.key,
    body: workspace,
  });
  if (!mirrorWritten) {
    // Never leave a previously-valid mirror looking authoritative when the
    // newer write only reached IDB (quota/disabled-storage partial failure).
    localStorageAdapter.remove(mirrorKey);
  }
  return enqueueWorkspaceOperation(identity.key, workspace.workspaceId, () =>
    writeSlice(
      identity.key,
      sliceName(workspace.workspaceId),
      WINDOW_WORKSPACE_SCHEMA_VERSION,
      workspace,
    ),
  );
}

export function __resetWindowSessionStoreForTests(): void {
  writeQueues.clear();
  leasedWorkspaceId = null;
}
