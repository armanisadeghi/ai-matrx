import {
  WINDOW_SESSION_SCHEMA_VERSION,
  windowSessionKey,
  type HydratedWindowSession,
  type PersistedWindowSession,
  type WindowManagerState,
  type WindowRect,
  type WindowState,
} from "@/lib/redux/slices/windowManagerSlice";
import {
  getStaticEntryByOverlayId,
  type WindowStaticMetadata,
} from "../registry/windowRegistryMetadata";
import { isOverlayId } from "../registry/overlay-ids";
import { clampRectToViewport, centerRectInViewport } from "../utils/rectClamp";
import { traySlotRect } from "../constants/tray";

export const WINDOW_WORKSPACE_SCHEMA_VERSION = 1 as const;
export const DEFAULT_WINDOW_DATA_BYTES = 32 * 1024;
export const MAX_WINDOW_WORKSPACE_BYTES = 256 * 1024;
export const MAX_PERSISTED_WINDOW_SESSIONS = 64;
const MAX_ID_LENGTH = 160;
const MAX_LABEL_LENGTH = 512;

export interface PersistedWindowWorkspace {
  schemaVersion: typeof WINDOW_WORKSPACE_SCHEMA_VERSION;
  workspaceId: string;
  savedAt: number;
  sessions: PersistedWindowSession[];
}

export interface WindowPersistenceDiagnostic {
  level: "warning" | "error";
  code:
    | "unsupported-data"
    | "window-data-too-large"
    | "workspace-too-large"
    | "invalid-workspace"
    | "invalid-session"
    | "unknown-overlay"
    | "preservation-disabled"
    | "legacy-minimized-rect";
  sessionKey?: string;
  message: string;
}

export interface SerializeWindowWorkspaceResult {
  workspace: PersistedWindowWorkspace;
  diagnostics: WindowPersistenceDiagnostic[];
}

export interface HydrateWindowWorkspaceResult {
  sessions: HydratedWindowSession[];
  diagnostics: WindowPersistenceDiagnostic[];
}

interface JsonSanitizeResult {
  data: Record<string, unknown>;
  droppedUnsupported: boolean;
  bytes: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** UTF-8 byte count without relying on TextEncoder in SSR/test runtimes. */
function utf8Bytes(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes +=
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
          ? 2
          : codePoint <= 0xffff
            ? 3
            : 4;
  }
  return bytes;
}

function isWindowState(value: unknown): value is WindowState {
  return value === "windowed" || value === "maximized" || value === "minimized";
}

function readRect(value: unknown): WindowRect | null {
  if (!isRecord(value)) return null;
  const { x, y, width, height } = value;
  if (
    !isFiniteNumber(x) ||
    !isFiniteNumber(y) ||
    !isFiniteNumber(width) ||
    !isFiniteNumber(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return { x, y, width, height };
}

/**
 * Copy only registry-approved keys into plain JSON. Functions, symbols,
 * undefined values, and circular references are dropped; BigInt becomes text.
 */
export function sanitizeWindowSessionData(
  value: unknown,
  allowedKeys: readonly string[],
): JsonSanitizeResult {
  if (!isRecord(value) || allowedKeys.length === 0) {
    return { data: {}, droppedUnsupported: false, bytes: 2 };
  }
  const ancestors = new WeakSet<object>();
  let droppedUnsupported = false;
  const dropped = Symbol("dropped-window-value");

  const copyJsonValue = (item: unknown): unknown | typeof dropped => {
    if (
      item === undefined ||
      typeof item === "function" ||
      typeof item === "symbol"
    ) {
      droppedUnsupported = true;
      return dropped;
    }
    if (typeof item === "bigint") {
      droppedUnsupported = true;
      return item.toString();
    }
    if (typeof item === "number" && !Number.isFinite(item)) {
      droppedUnsupported = true;
      return null;
    }
    if (item === null || typeof item !== "object") return item;
    if (item instanceof Date) return item.toJSON();
    if (ancestors.has(item)) {
      droppedUnsupported = true;
      return dropped;
    }

    ancestors.add(item);
    let result: unknown;
    if (Array.isArray(item)) {
      result = item.map((child) => {
        const copied = copyJsonValue(child);
        return copied === dropped ? null : copied;
      });
    } else if (
      Object.getPrototypeOf(item) === Object.prototype ||
      Object.getPrototypeOf(item) === null
    ) {
      result = Object.fromEntries(
        Object.entries(item).flatMap(([key, child]) => {
          const copied = copyJsonValue(child);
          return copied === dropped ? [] : [[key, copied]];
        }),
      );
    } else {
      droppedUnsupported = true;
      result = dropped;
    }
    ancestors.delete(item);
    return result;
  };

  try {
    const allowed = new Set(allowedKeys);
    const selected = Object.fromEntries(
      Object.entries(value).filter(([key]) => allowed.has(key)),
    );
    // `selected` is a shallow wrapper around the source. Seed the source as
    // an ancestor so a root self-reference is dropped rather than copied as
    // a misleading partial nested object.
    ancestors.add(value);
    const copied = copyJsonValue(selected);
    ancestors.delete(value);
    const json = JSON.stringify(copied === dropped ? {} : copied);
    const parsed: unknown = JSON.parse(json || "{}");
    return {
      data: isRecord(parsed) ? parsed : {},
      droppedUnsupported,
      bytes: utf8Bytes(json || "{}"),
    };
  } catch {
    return { data: {}, droppedUnsupported: true, bytes: 2 };
  }
}

function sessionFromWindow(
  entry: WindowManagerState["windows"][string],
  savedAt: number,
  diagnostics: WindowPersistenceDiagnostic[],
): PersistedWindowSession | null {
  const persistence = entry.persistence;
  if (!persistence || persistence.closing) return null;

  const registryEntry = getStaticEntryByOverlayId(persistence.overlayId);
  if (!registryEntry?.preservation || registryEntry.ephemeral) return null;

  const sanitized = sanitizeWindowSessionData(
    persistence.data,
    registryEntry.preservation.dataKeys,
  );
  const sessionKey = windowSessionKey(
    persistence.overlayId,
    persistence.instanceId,
  );
  if (
    persistence.instanceId.length > MAX_ID_LENGTH ||
    entry.id.length > MAX_ID_LENGTH ||
    entry.title.length > MAX_LABEL_LENGTH
  ) {
    diagnostics.push({
      level: "error",
      code: "invalid-session",
      sessionKey,
      message: `Skipped ${sessionKey} because its identity or label metadata is oversized.`,
    });
    return null;
  }
  if (sanitized.droppedUnsupported) {
    diagnostics.push({
      level: "warning",
      code: "unsupported-data",
      sessionKey,
      message: `Dropped non-JSON window data for ${sessionKey}.`,
    });
  }

  const maxBytes =
    registryEntry.preservation.maxDataBytes ?? DEFAULT_WINDOW_DATA_BYTES;
  const data = sanitized.bytes <= maxBytes ? sanitized.data : {};
  if (sanitized.bytes > maxBytes) {
    diagnostics.push({
      level: "error",
      code: "window-data-too-large",
      sessionKey,
      message: `Discarded ${sanitized.bytes} bytes of window data for ${sessionKey}; limit is ${maxBytes}.`,
    });
  }

  const windowedRect =
    entry.state === "minimized"
      ? (entry.preMinimizedRect ?? entry.windowed)
      : entry.windowed;

  return {
    schemaVersion: WINDOW_SESSION_SCHEMA_VERSION,
    sessionKey,
    overlayId: persistence.overlayId,
    instanceId: persistence.instanceId,
    windowId: entry.id,
    title: entry.title,
    state: entry.state,
    windowedRect,
    traySlot: entry.state === "minimized" ? entry.traySlot : null,
    zIndex: entry.zIndex,
    sidebarOpen: persistence.sidebarOpen,
    sidebarSize: persistence.sidebarSize,
    data,
    savedAt,
  };
}

export function serializeWindowWorkspace(
  state: WindowManagerState,
  workspaceId: string,
  savedAt = Date.now(),
): SerializeWindowWorkspaceResult {
  const diagnostics: WindowPersistenceDiagnostic[] = [];
  const allSessions = Object.values(state.windows)
    .map((entry) => sessionFromWindow(entry, savedAt, diagnostics))
    .filter((entry): entry is PersistedWindowSession => entry !== null)
    .sort((a, b) => a.zIndex - b.zIndex || a.sessionKey.localeCompare(b.sessionKey));
  const sessions = allSessions.slice(0, MAX_PERSISTED_WINDOW_SESSIONS);
  if (allSessions.length > sessions.length) {
    diagnostics.push({
      level: "error",
      code: "workspace-too-large",
      message: `Window workspace exceeded ${MAX_PERSISTED_WINDOW_SESSIONS} sessions; later z-order entries were not cached.`,
    });
  }

  const workspace: PersistedWindowWorkspace = {
    schemaVersion: WINDOW_WORKSPACE_SCHEMA_VERSION,
    workspaceId,
    savedAt,
    sessions,
  };
  const bytes = utf8Bytes(JSON.stringify(workspace));
  if (bytes > MAX_WINDOW_WORKSPACE_BYTES) {
    sessions.forEach((session) => {
      session.data = {};
    });
    diagnostics.push({
      level: "error",
      code: "workspace-too-large",
      message: `Window workspace reached ${bytes} bytes; semantic data was discarded while geometry was retained.`,
    });
    while (
      sessions.length > 0 &&
      utf8Bytes(JSON.stringify(workspace)) > MAX_WINDOW_WORKSPACE_BYTES
    ) {
      sessions.pop();
    }
  }

  return { workspace, diagnostics };
}

function readSession(
  value: unknown,
  diagnostics: WindowPersistenceDiagnostic[],
): PersistedWindowSession | null {
  if (!isRecord(value)) return null;
  const overlayId = value.overlayId;
  const instanceId = value.instanceId;
  const rect = readRect(value.windowedRect);
  if (
    value.schemaVersion !== WINDOW_SESSION_SCHEMA_VERSION ||
    !isOverlayId(overlayId) ||
    typeof instanceId !== "string" ||
    instanceId.length === 0 ||
    !rect ||
    !isWindowState(value.state)
  ) {
    diagnostics.push({
      level: "error",
      code: "invalid-session",
      message: "Ignored an invalid window preservation record.",
    });
    return null;
  }

  const registryEntry = getStaticEntryByOverlayId(overlayId);
  if (!registryEntry) {
    diagnostics.push({
      level: "error",
      code: "unknown-overlay",
      message: `Ignored unknown overlay ${overlayId}.`,
    });
    return null;
  }
  if (!registryEntry.preservation || registryEntry.ephemeral) {
    diagnostics.push({
      level: "warning",
      code: "preservation-disabled",
      sessionKey: windowSessionKey(overlayId, instanceId),
      message: `Ignored disabled preservation record for ${overlayId}.`,
    });
    return null;
  }
  if (
    (registryEntry.instanceMode !== "multi" &&
      instanceId !== "default") ||
    instanceId.length > MAX_ID_LENGTH ||
    (typeof value.windowId === "string" &&
      value.windowId.length > MAX_ID_LENGTH) ||
    (typeof value.title === "string" && value.title.length > MAX_LABEL_LENGTH)
  ) {
    diagnostics.push({
      level: "error",
      code: "invalid-session",
      sessionKey: windowSessionKey(overlayId, instanceId),
      message: `Ignored invalid instance or oversized metadata for ${overlayId}.`,
    });
    return null;
  }

  const sanitized = sanitizeWindowSessionData(
    value.data,
    registryEntry.preservation.dataKeys,
  );
  const missingRequiredKey = registryEntry.preservation.requiredDataKeys?.find(
    (key) => {
      const requiredValue = sanitized.data[key];
      return (
        requiredValue === undefined ||
        requiredValue === null ||
        requiredValue === ""
      );
    },
  );
  if (missingRequiredKey) {
    diagnostics.push({
      level: "warning",
      code: "invalid-session",
      sessionKey: windowSessionKey(overlayId, instanceId),
      message: `Ignored ${overlayId} because required key ${missingRequiredKey} was empty.`,
    });
    return null;
  }
  const maxBytes =
    registryEntry.preservation.maxDataBytes ?? DEFAULT_WINDOW_DATA_BYTES;
  if (sanitized.bytes > maxBytes) {
    diagnostics.push({
      level: "error",
      code: "window-data-too-large",
      sessionKey: windowSessionKey(overlayId, instanceId),
      message: `Discarded ${sanitized.bytes} bytes of restored window data for ${overlayId}; limit is ${maxBytes}.`,
    });
  }
  return {
    schemaVersion: WINDOW_SESSION_SCHEMA_VERSION,
    sessionKey: windowSessionKey(overlayId, instanceId),
    overlayId,
    instanceId,
    windowId: typeof value.windowId === "string" ? value.windowId : registryEntry.slug,
    title: typeof value.title === "string" ? value.title : registryEntry.label,
    state: value.state,
    windowedRect: rect,
    traySlot:
      Number.isInteger(value.traySlot) && Number(value.traySlot) >= 0
        ? Number(value.traySlot)
        : null,
    zIndex: isFiniteNumber(value.zIndex) ? value.zIndex : 1000,
    sidebarOpen: value.sidebarOpen !== false,
    sidebarSize:
      isFiniteNumber(value.sidebarSize) && value.sidebarSize > 0
        ? value.sidebarSize
        : null,
    data: sanitized.bytes <= maxBytes ? sanitized.data : {},
    savedAt: isFiniteNumber(value.savedAt) ? value.savedAt : 0,
  };
}

function fallbackRect(viewport: { width: number; height: number }): WindowRect {
  return centerRectInViewport(
    {
      x: 0,
      y: 0,
      width: Math.min(720, viewport.width),
      height: Math.min(480, viewport.height),
    },
    viewport,
  );
}

function mergeDefaultData(
  registryEntry: WindowStaticMetadata,
  data: Record<string, unknown>,
): Record<string, unknown> {
  return { ...registryEntry.defaultData, ...data };
}

export function hydrateWindowWorkspace(
  raw: unknown,
  viewport: { width: number; height: number },
  expectedWorkspaceId?: string,
): HydrateWindowWorkspaceResult {
  const diagnostics: WindowPersistenceDiagnostic[] = [];
  if (
    !isRecord(raw) ||
    raw.schemaVersion !== WINDOW_WORKSPACE_SCHEMA_VERSION ||
    !Array.isArray(raw.sessions) ||
    typeof raw.workspaceId !== "string" ||
    (expectedWorkspaceId !== undefined &&
      raw.workspaceId !== expectedWorkspaceId)
  ) {
    if (raw != null) {
      diagnostics.push({
        level: "error",
        code: "invalid-workspace",
        message: "Ignored an invalid or unsupported window workspace cache.",
      });
    }
    return { sessions: [], diagnostics };
  }

  const byKey = new Map<string, PersistedWindowSession>();
  if (raw.sessions.length > MAX_PERSISTED_WINDOW_SESSIONS) {
    diagnostics.push({
      level: "error",
      code: "invalid-workspace",
      message: `Window workspace exceeded ${MAX_PERSISTED_WINDOW_SESSIONS} sessions; extras were ignored.`,
    });
  }
  raw.sessions
    .slice(0, MAX_PERSISTED_WINDOW_SESSIONS)
    .forEach((candidate) => {
      const session = readSession(candidate, diagnostics);
      if (!session) return;
      const existing = byKey.get(session.sessionKey);
      if (
        !existing ||
        existing.savedAt < session.savedAt ||
        (existing.savedAt === session.savedAt &&
          JSON.stringify(existing) < JSON.stringify(session))
      ) {
        byKey.set(session.sessionKey, session);
      }
    });

  const ordered = [...byKey.values()].sort(
    (a, b) => a.zIndex - b.zIndex || a.sessionKey.localeCompare(b.sessionKey),
  );
  const minimized = ordered
    .filter((session) => session.state === "minimized")
    .sort(
      (a, b) =>
        (a.traySlot ?? Number.MAX_SAFE_INTEGER) -
          (b.traySlot ?? Number.MAX_SAFE_INTEGER) ||
        a.sessionKey.localeCompare(b.sessionKey),
    );
  const normalizedSlot = new Map(
    minimized.map((session, index) => [session.sessionKey, index] as const),
  );

  const sessions = ordered.map((session, index): HydratedWindowSession => {
    const registryEntry = getStaticEntryByOverlayId(session.overlayId);
    const fullRect = clampRectToViewport(session.windowedRect, viewport);
    const state = session.state;
    const slot = normalizedSlot.get(session.sessionKey) ?? null;
    const renderRect =
      state === "minimized" && slot !== null
        ? traySlotRect(slot, viewport.width, viewport.height)
        : state === "windowed" || state === "maximized"
          ? fullRect
          : fallbackRect(viewport);
    return {
      ...session,
      state,
      traySlot: slot,
      zIndex: 1000 + index,
      data: registryEntry
        ? mergeDefaultData(registryEntry, session.data)
        : session.data,
      renderRect,
    };
  });

  return { sessions, diagnostics };
}
