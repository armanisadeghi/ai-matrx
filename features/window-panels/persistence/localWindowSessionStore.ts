import { readSlice, writeSlice } from "@/lib/sync/persistence/idb";
import { localStorageAdapter } from "@/lib/sync/persistence/local-storage";
import type { IdentityKey } from "@/lib/sync/types";
import {
  WINDOW_WORKSPACE_SCHEMA_VERSION,
  type PersistedWindowWorkspace,
} from "./windowSessionSerialization";

const WORKSPACE_SESSION_KEY = "matrx:window-workspace-id";
const SLICE_PREFIX = "window-workspace";
const writeQueues = new Map<string, Promise<void>>();

export interface LocalWindowWorkspaceRead {
  workspace: PersistedWindowWorkspace | null;
  source: "indexed-db" | "local-storage" | "miss";
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
      | PerformanceNavigationTiming
      | undefined;
    // sessionStorage may be cloned into a newly opened/duplicated tab. Reuse
    // only for an actual refresh/history restore; a fresh navigation gets a
    // new workspace and cannot race the source tab.
    if (
      existing &&
      (navigation?.type === "reload" || navigation?.type === "back_forward")
    ) {
      return existing;
    }
    const created = randomWorkspaceId();
    window.sessionStorage.setItem(WORKSPACE_SESSION_KEY, created);
    return created;
  } catch (error) {
    console.warn(
      "[window-preservation] sessionStorage unavailable; using the tab fallback workspace.",
      error,
    );
    return "tab-fallback";
  }
}

function sliceName(workspaceId: string): string {
  return `${SLICE_PREFIX}:${workspaceId}`;
}

function localStorageKey(identity: IdentityKey, workspaceId: string): string {
  return `matrx:${SLICE_PREFIX}:${identity.key}:${workspaceId}`;
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

  const idbRecord = await readSlice(
    identity.key,
    sliceName(workspaceId),
    WINDOW_WORKSPACE_SCHEMA_VERSION,
  );
  const idbWorkspace = readWorkspace(idbRecord?.body);

  if (!localWorkspace && !idbWorkspace) {
    return { workspace: null, source: "miss" };
  }
  if (
    idbWorkspace &&
    (!localWorkspace || idbWorkspace.savedAt > localWorkspace.savedAt)
  ) {
    return { workspace: idbWorkspace, source: "indexed-db" };
  }
  return { workspace: localWorkspace, source: "local-storage" };
}

/**
 * Synchronous write-through first makes pagehide/reload safe; IndexedDB is
 * the larger warm cache and is updated in the background.
 */
export function saveLocalWindowWorkspace(
  identity: IdentityKey,
  workspace: PersistedWindowWorkspace,
): Promise<void> {
  localStorageAdapter.write(
    localStorageKey(identity, workspace.workspaceId),
    {
      version: WINDOW_WORKSPACE_SCHEMA_VERSION,
      identityKey: identity.key,
      body: workspace,
    },
  );
  const queueKey = `${identity.key}:${workspace.workspaceId}`;
  const previous = writeQueues.get(queueKey) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() =>
      writeSlice(
        identity.key,
        sliceName(workspace.workspaceId),
        WINDOW_WORKSPACE_SCHEMA_VERSION,
        workspace,
      ),
    );
  writeQueues.set(queueKey, next);
  void next.finally(() => {
    if (writeQueues.get(queueKey) === next) writeQueues.delete(queueKey);
  });
  return next;
}

/** Remove only the synchronous mirror; an empty workspace write supersedes IDB. */
export function clearLocalWindowWorkspace(
  identity: IdentityKey,
  workspaceId: string,
): Promise<void> {
  localStorageAdapter.remove(localStorageKey(identity, workspaceId));
  const empty: PersistedWindowWorkspace = {
    schemaVersion: WINDOW_WORKSPACE_SCHEMA_VERSION,
    workspaceId,
    savedAt: Date.now(),
    sessions: [],
  };
  return saveLocalWindowWorkspace(identity, empty);
}

export function __resetWindowSessionStoreForTests(): void {
  writeQueues.clear();
}
