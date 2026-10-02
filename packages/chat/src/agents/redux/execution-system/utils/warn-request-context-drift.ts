/**
 * Call-time identity-context drift warning (observability only).
 *
 * Compares the context about to be POSTed against
 * `conversation.metadata.last_request_context` (written by the BE each turn).
 * Logs a loud yellow console warning when they differ.
 *
 * Does NOT block the request and does NOT prompt the user — that confirm UX
 * is tracked as a CRITICAL open defect (aidream FOUND_DEFECTS).
 *
 * If previous is missing on a continuation turn, that itself is a signal:
 * the backend is not recording context (or the conversation was never loaded
 * after the BE started writing `last_request_context`).
 */

export const LAST_REQUEST_CONTEXT_KEY = "last_request_context";

export type RequestContextSnapshot = {
  organization_id: string | null;
  project_id: string | null;
  task_id: string | null;
  source_app: string | null;
  source_feature: string | null;
  agent_id: string | null;
  agent_version_id: string | null;
  scope_ids: string[];
};

const IDENTITY_KEYS: (keyof RequestContextSnapshot)[] = [
  "organization_id",
  "project_id",
  "task_id",
  "source_app",
  "source_feature",
  "agent_id",
  "agent_version_id",
  "scope_ids",
];

function asNullableString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function asScopeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .slice()
    .sort();
}

export function snapshotFromPayload(
  payload: Record<string, unknown>,
  extras?: {
    agent_id?: string | null;
    agent_version_id?: string | null;
  },
): RequestContextSnapshot {
  return {
    organization_id: asNullableString(payload.organization_id),
    project_id: asNullableString(payload.project_id),
    task_id: asNullableString(payload.task_id),
    source_app: asNullableString(payload.source_app),
    source_feature: asNullableString(payload.source_feature),
    agent_id: asNullableString(extras?.agent_id),
    agent_version_id: asNullableString(extras?.agent_version_id),
    scope_ids: asScopeIds(payload.scope_ids),
  };
}

export function readPreviousRequestContext(
  metadata: Record<string, unknown> | undefined | null,
): RequestContextSnapshot | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = metadata[LAST_REQUEST_CONTEXT_KEY];
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  return {
    organization_id: asNullableString(obj.organization_id),
    project_id: asNullableString(obj.project_id),
    task_id: asNullableString(obj.task_id),
    source_app: asNullableString(obj.source_app),
    source_feature: asNullableString(obj.source_feature),
    agent_id: asNullableString(obj.agent_id),
    agent_version_id: asNullableString(obj.agent_version_id),
    scope_ids: asScopeIds(obj.scope_ids),
  };
}

export function diffRequestContext(
  previous: RequestContextSnapshot,
  current: RequestContextSnapshot,
): Partial<
  Record<keyof RequestContextSnapshot, { from: unknown; to: unknown }>
> {
  const changes: Partial<
    Record<keyof RequestContextSnapshot, { from: unknown; to: unknown }>
  > = {};
  for (const key of IDENTITY_KEYS) {
    const from = previous[key];
    const to = current[key];
    const same =
      key === "scope_ids"
        ? JSON.stringify(from) === JSON.stringify(to)
        : from === to;
    if (!same) {
      changes[key] = { from, to };
    }
  }
  return changes;
}

/**
 * Yellow agent-debug warning at call time. Returns the changes map (empty if none).
 */
export function warnRequestContextDrift(args: {
  conversationId: string;
  isContinuation: boolean;
  previous: RequestContextSnapshot | null;
  current: RequestContextSnapshot;
}): Partial<
  Record<keyof RequestContextSnapshot, { from: unknown; to: unknown }>
> {
  const { conversationId, isContinuation, previous, current } = args;

  if (!previous) {
    if (isContinuation) {
      console.warn(
        "%c[Matrx CTX] NO previous request context on continuation — " +
          "backend may not be recording metadata.last_request_context " +
          "(or conversation was loaded before that existed).",
        "color: #b45309; font-weight: bold; background: #fef3c7; padding: 2px 6px;",
        { conversationId, current },
      );
    }
    return {};
  }

  const changes = diffRequestContext(previous, current);
  if (Object.keys(changes).length === 0) return {};

  console.warn(
    "%c[Matrx CTX] REQUEST CONTEXT CHANGED vs last turn — " +
      "user confirm UX not built yet (FOUND_DEFECTS). Sending anyway.",
    "color: #b45309; font-weight: bold; background: #fef3c7; padding: 2px 6px;",
    { conversationId, changes, previous, current },
  );
  return changes;
}
