/**
 * Assists — the platform-wide "AI assists everywhere" primitive.
 *
 * Cross-repo system-of-record:
 * /Users/armanisadeghi/code/common-docs/systems/assists/FEATURE.md — read it
 * before touching this feature in ANY repo.
 *
 * An assist is a system-noticed, one-click-actionable item: deterministic
 * code, background agents, sweeps, and stream events produce them; the user
 * sees a chip; accepting one dispatches the typed `action` binding through
 * the assist action registry (runtime/assist-action-registry.ts).
 */

import type { Database } from "@/types/database.types";
import type { Json } from "@/types/database.types";

export type AssistRow = Database["platform"]["Tables"]["assists"]["Row"];

export type AssistSourceKind = "deterministic" | "agent" | "sweep" | "stream";
export type AssistStatus =
  | "pending"
  | "accepted"
  | "dismissed"
  | "expired"
  | "superseded";

/**
 * The typed action binding stored in `platform.assists.action`. The registry
 * is the ONE seam that executes these — adding a kind means one handler file
 * plus one register call; nothing else widens.
 */
export type AssistAction =
  | {
      kind: "launch_agent";
      /** Direct agent id — or leave unset and provide `slotKey`. */
      agentId?: string;
      /** Agent-slot key resolved at click time (swappable, no deploy). */
      slotKey?: string;
      /** Title-bar name shown while the agent definition loads. */
      agentName?: string;
      /** Composed intent pre-filled into the composer (pre-fill only). */
      draftText?: string;
    }
  | { kind: "navigate"; href: string }
  | {
      /**
       * Call a server endpoint that performs a durable, named domain write.
       *
       * The other three kinds move the user (`navigate`), pre-fill a
       * conversation (`launch_agent`), or write one value into the page
       * (`surface_write`). None of them can make a server-side change the
       * user actually asked for in one click, so an assist whose whole point
       * IS that change had nowhere to go.
       *
       * Deliberately NOT a generic fetch: `endpoint` is matched against an
       * allow-list at run time, so a malicious or stale ledger row cannot
       * turn a chip into an arbitrary request. Adding an endpoint is a
       * one-line change in the handler, reviewed like any other capability.
       */
      kind: "server_action";
      /** Bare aidream path, e.g. "/seo/endpoint-families/apply". */
      endpoint: string;
      method?: "POST";
      /** Verb-labeled button text (THE INTENTIONAL-ACTION LAW). */
      label?: string;
      /** Exactly what will happen, in the user's words, BEFORE it happens. */
      confirm?: string;
      /** The request body the server expects. */
      body?: Json;
    }
  | {
      kind: "surface_write";
      target: string;
      value: Json;
      surfaceName?: string;
    };

/** The client-facing assist shape (the row, with `action` narrowed). */
export interface Assist {
  id: string;
  userId: string;
  entityType: string | null;
  entityId: string | null;
  surfaceName: string | null;
  sourceKind: AssistSourceKind;
  sourceKey: string;
  title: string;
  body: string | null;
  reasoning: string | null;
  confidence: number | null;
  action: AssistAction;
  status: AssistStatus;
  priority: number;
  dedupeKey: string | null;
  createdAt: string;
  /** Set once the row leaves `pending` — the manager's history column. */
  decidedAt: string | null;
  /** In the future = snoozed: still pending, deliberately out of sight. */
  suppressedUntil: string | null;
  expiresAt: string | null;
  /** The receipt written when the action ran. */
  result: Json | null;
}

/**
 * The manager's free-form query — EVERY status, server-side filter / sort /
 * paginate. Deliberately separate from the chip read (`listMyPendingAssists`),
 * which is the narrow live-pending view THE VIEW LAW requires of a chip.
 *
 * Absorbed from kg-suggestions' `KgSuggestionsQuery`: a triage surface has to
 * reach decided rows, and folding that into the chip read would either flood
 * the dock or hide the history.
 */
export interface AssistsQuery {
  /** Empty = every status. */
  statuses: AssistStatus[];
  sourceKey: string | null;
  sourceKind: AssistSourceKind | null;
  surfaceName: string | null;
  search: string;
  /** Exclusive upper bound on confidence — the low-confidence fold-out. */
  maxConfidence: number | null;
  /** Inclusive lower bound on confidence. */
  minConfidence: number | null;
  /** Include rows currently snoozed (`suppressed_until` in the future). */
  includeSnoozed: boolean;
  sortField: AssistSortField;
  sortAscending: boolean;
  page: number;
  pageSize: number;
}

export type AssistSortField =
  | "created_at"
  | "decided_at"
  | "priority"
  | "confidence"
  | "status"
  | "source_key";

export interface AssistsPage {
  rows: Assist[];
  total: number;
}

/** Per-status counts for the manager's summary strip. */
export type AssistStats = Record<AssistStatus, number>;

/** Producer input for `emitAssist` — deterministic client-side producers. */
export interface EmitAssistInput {
  sourceKey: string;
  sourceKind?: AssistSourceKind;
  title: string;
  body?: string;
  action: AssistAction;
  surfaceName?: string;
  entityType?: string;
  entityId?: string;
  /** Strongly recommended — one live pending chip per noticed thing. */
  dedupeKey: string;
  expiresAt?: string;
  priority?: number;
}

const SOURCE_KINDS: readonly AssistSourceKind[] = [
  "deterministic",
  "agent",
  "sweep",
  "stream",
];
const STATUSES: readonly AssistStatus[] = [
  "pending",
  "accepted",
  "dismissed",
  "expired",
  "superseded",
];

function narrowAction(value: Json): AssistAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, Json | undefined>;
  const kind = obj.kind;
  if (kind === "navigate" && typeof obj.href === "string") {
    return { kind, href: obj.href };
  }
  if (kind === "server_action" && typeof obj.endpoint === "string") {
    return {
      kind,
      endpoint: obj.endpoint,
      method: "POST",
      label: typeof obj.label === "string" ? obj.label : undefined,
      confirm: typeof obj.confirm === "string" ? obj.confirm : undefined,
      body: (obj.body ?? null) as Json,
    };
  }
  if (kind === "launch_agent") {
    return {
      kind,
      agentId: typeof obj.agentId === "string" ? obj.agentId : undefined,
      slotKey: typeof obj.slotKey === "string" ? obj.slotKey : undefined,
      agentName: typeof obj.agentName === "string" ? obj.agentName : undefined,
      draftText: typeof obj.draftText === "string" ? obj.draftText : undefined,
    };
  }
  if (kind === "surface_write" && typeof obj.target === "string") {
    return {
      kind,
      target: obj.target,
      value: obj.value ?? null,
      surfaceName:
        typeof obj.surfaceName === "string" ? obj.surfaceName : undefined,
    };
  }
  return null;
}

/**
 * An EPHEMERAL assist: rendered inline while the condition on screen exists,
 * never persisted (id = ""). Same chip, same runner, no ledger row.
 */
export function makeEphemeralAssist(input: {
  sourceKey: string;
  title: string;
  body?: string;
  action: AssistAction;
  surfaceName?: string;
}): Assist {
  return {
    id: "",
    userId: "",
    entityType: null,
    entityId: null,
    surfaceName: input.surfaceName ?? null,
    sourceKind: "deterministic",
    sourceKey: input.sourceKey,
    title: input.title,
    body: input.body ?? null,
    reasoning: null,
    confidence: null,
    action: input.action,
    status: "pending",
    priority: 0,
    dedupeKey: null,
    createdAt: new Date().toISOString(),
    decidedAt: null,
    suppressedUntil: null,
    expiresAt: null,
    result: null,
  };
}

/**
 * Row → client shape. Returns null (and the caller screams) for a row whose
 * action doesn't narrow — an unaddressable assist must never render a chip
 * that can't do anything.
 */
export function toAssist(row: AssistRow): Assist | null {
  const action = narrowAction(row.action);
  if (!action) return null;
  const sourceKind = SOURCE_KINDS.find((k) => k === row.source_kind);
  const status = STATUSES.find((s) => s === row.status);
  if (!sourceKind || !status) return null;
  return {
    id: row.id,
    userId: row.user_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    surfaceName: row.surface_name,
    sourceKind,
    sourceKey: row.source_key,
    title: row.title,
    body: row.body,
    reasoning: row.reasoning,
    confidence: row.confidence,
    action,
    status,
    priority: row.priority,
    dedupeKey: row.dedupe_key,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    suppressedUntil: row.suppressed_until,
    expiresAt: row.expires_at,
    result: row.result,
  };
}
