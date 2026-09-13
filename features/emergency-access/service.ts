// features/emergency-access/service.ts
//
// EVERY EMERGENCY-DOOR READ AND WRITE THE APP MAKES. One typed function per
// shipped `iam` RPC (verified live against `pg_proc` on project
// `brsgrqvjdzwihsvnfqkf`, 2026-09-12).
//
// This is the DIRECT lane — React → Supabase (CLAUDE.md § Data flow). No Next.js
// API route, no Python hop. The `iam` schema is exposed to PostgREST and these
// are `SECURITY DEFINER` doors reached through `supabase.schema("iam").rpc(...)`.
//
// 🚨 THE CLIENT IS A PARAMETER, NOT AN IMPORT. Both routes that consume this
// render on the server, and a module-level browser singleton would be
// constructed during a server render just by importing this file. Callers pass
// what they already hold: `supabase` from `@/utils/supabase/client` in a
// Client Component, `await createClient()` from `@/utils/supabase/server` in a
// Server Component.
//
// 🚨 NOTHING HERE THROWS AND NOTHING HERE SWALLOWS. `supabase.rpc` resolves with
// `{data, error}` but REJECTS on a network failure, an abort, or a response it
// cannot parse — a rejection that escapes a caller's `await` leaves a spinner
// stuck and a surface mid-write with nothing rendered. Every failure comes back
// as `{ok:false}` with a sentence.
//
// 🚨 NOTHING HERE INVENTS COPY FOR A REFUSAL. The doors write their own human
// sentence for every outcome; these wrappers carry it through untouched.
//
// 🚨 NOTHING HERE CASTS A PAYLOAD INTO A HAND-WRITTEN TYPE. Every door returns
// `jsonb`, which `supabase gen types` renders opaque, so a cast would be taken
// on faith and a field the door never sends would arrive `undefined` and paint a
// blank — at runtime, once, for whoever opened the page (the lesson written up
// at the top of `features/hr/service.ts`). The transport returns what the
// payload provably is and each wrapper MAPS it field by field.

import type { Database } from "@/types/database.types";
import type {
  NextBrowserClient,
  NextServerClient,
} from "@ai-matrx/data/next";

import type {
  AccessLogEntry,
  EmergencyAccessResult,
  EmergencyDoorDecision,
  EmergencyDoorEligibility,
  EmergencyDoorOutcome,
  EmergencyDoorPurpose,
  EmergencyDoorRequest,
} from "./types";

/** A Supabase client from either side of the render boundary. */
export type EmergencyAccessClient =
  | NextBrowserClient<Database>
  | NextServerClient<Database>;

/** PostgREST's code for "your role may not do that" — a refusal, not a crash. */
const PG_INSUFFICIENT_PRIVILEGE = "42501";

function failed(
  message: string,
  code?: string | null,
  technical?: string | null,
): EmergencyAccessResult<never> {
  return {
    ok: false,
    message,
    code: code ?? null,
    technical: technical?.trim() || null,
  };
}

// ── Payload readers — assert nothing, prove everything ──────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function strArray(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === "string");
}

// ── The transport ───────────────────────────────────────────────────────────

/**
 * Call ONE `iam` door and hand back the raw payload.
 *
 * The cast on `.schema("iam")` is deliberate and contained to this function:
 * these seven functions are live in the database but are not yet in
 * `types/database.types.ts` (the generated file predates the DD-137a
 * migration), so `rpc`'s generated name union does not know them. The cast buys
 * exactly the right to name the function; it buys NOTHING about the answer,
 * which stays `unknown` until a wrapper maps it.
 */
async function callDoor(
  client: EmergencyAccessClient,
  fn: string,
  args: Record<string, unknown>,
  whatFailed: string,
): Promise<EmergencyAccessResult<unknown>> {
  const iam = client.schema("iam") as unknown as {
    rpc: (
      name: string,
      params: Record<string, unknown>,
    ) => PromiseLike<{
      data: unknown;
      error: { code?: string; message?: string } | null;
    }>;
  };

  let data: unknown = null;
  let error: { code?: string; message?: string } | null = null;
  try {
    ({ data, error } = await iam.rpc(fn, args));
  } catch (thrown) {
    return failed(
      `${whatFailed} did not reach the server.`,
      null,
      thrown instanceof Error ? thrown.message : String(thrown),
    );
  }

  if (error) {
    if (error.code === PG_INSUFFICIENT_PRIVILEGE) {
      // The door refused the caller's standing before it ran. It is a real
      // answer, and the database's own sentence is the best one available.
      return failed(
        error.message?.trim() ||
          `${whatFailed} is not something this account may do.`,
        error.code,
        error.message ?? null,
      );
    }
    // Findable by whoever must fix it; the person only sees the sentence.
    console.error(
      `[emergency-access] iam.${fn} failed (${error.code ?? "no code"}):`,
      error.message,
    );
    return failed(
      `${whatFailed} could not be completed.`,
      error.code ?? null,
      error.message ?? null,
    );
  }

  return { ok: true, data };
}

// ── 1. The controlled reason list ───────────────────────────────────────────

/**
 * `iam.emergency_door_purposes()` — the registered reasons a door may be opened
 * for. The picker is populated from THIS and nothing else: a reason is a slug
 * chosen from a controlled list, never a sentence somebody typed, because the
 * audit has to be searchable years later.
 */
export async function listEmergencyDoorPurposes(
  client: EmergencyAccessClient,
): Promise<EmergencyAccessResult<EmergencyDoorPurpose[]>> {
  const result = await callDoor(
    client,
    "emergency_door_purposes",
    {},
    "The list of reasons",
  );
  if (!result.ok) return result;

  const purposes: EmergencyDoorPurpose[] = [];
  for (const raw of asArray(result.data)) {
    const row = asRecord(raw);
    const slug = str(row?.slug);
    if (!slug) continue;
    purposes.push({ slug, name: str(row?.name) ?? slug });
  }
  return { ok: true, data: purposes };
}

// ── 1b. May this person open this door at all? ──────────────────────────────

/**
 * `iam.emergency_door_eligibility(...)` — asked by the access-refusal screen
 * BEFORE it offers anything.
 *
 * 🚨 THIS EXISTS SO THE AFFORDANCE CAN BE ABSENT RATHER THAN DEAD. A "Request
 * emergency access" button shown to somebody the door will always refuse — a
 * plain member, the record's own owner, a record whose class has no door — is
 * exactly the dead control law 4 forbids. The browser cannot work any of that
 * out for itself: the record is the one thing it was just refused.
 *
 * A failure answers `eligible: false`, so a surface that cannot reach the
 * database shows nothing rather than a button that cannot work.
 */
export async function checkEmergencyDoorEligibility(
  client: EmergencyAccessClient,
  args: { token: string; id: string },
): Promise<EmergencyAccessResult<EmergencyDoorEligibility>> {
  const result = await callDoor(
    client,
    "emergency_door_eligibility",
    { p_token: args.token, p_id: args.id },
    "The emergency access check",
  );
  if (!result.ok) return result;

  const row = asRecord(result.data);
  if (!row) {
    return failed("The emergency door gave an answer we could not read.");
  }
  return {
    ok: true,
    data: {
      eligible: bool(row.eligible),
      reason: str(row.reason) ?? "unknown",
      dataClass: str(row.data_class),
      pendingRequestId: str(row.pending_request_id),
      needsSecondPerson: bool(row.needs_second_person),
    },
  };
}

// ── 2. Opening the door ─────────────────────────────────────────────────────

/**
 * `iam.emergency_door_open(...)` — the request itself.
 *
 * Three shapes come back and all three are ANSWERS, never errors: the door
 * opened (`confidential` — one admin, now); the door needs the organization
 * owner (`private` — `reason: "awaiting_approval"`, which means it worked); or
 * the door refused. Each carries its own `message`.
 */
export async function openEmergencyDoor(
  client: EmergencyAccessClient,
  args: {
    token: string;
    id: string;
    purpose: string;
    justification: string;
  },
): Promise<EmergencyAccessResult<EmergencyDoorOutcome>> {
  const result = await callDoor(
    client,
    "emergency_door_open",
    {
      p_token: args.token,
      p_id: args.id,
      p_purpose: args.purpose,
      p_justification: args.justification,
    },
    "The emergency access request",
  );
  if (!result.ok) return result;

  const row = asRecord(result.data);
  if (!row) {
    return failed("The emergency door gave an answer we could not read.");
  }

  const message = str(row.message);
  if (!message) {
    // The door's sentence IS the surface's copy, so its absence is a defect in
    // the door, not something to paper over with an invented phrase.
    console.error(
      "[emergency-access] iam.emergency_door_open returned no message:",
      row,
    );
    return failed("The emergency door answered without saying what happened.");
  }

  if (bool(row.granted)) {
    return {
      ok: true,
      data: {
        granted: true,
        permissionId: str(row.permission_id),
        expiresAt: str(row.expires_at),
        message,
      },
    };
  }

  return {
    ok: true,
    data: {
      granted: false,
      reason: str(row.reason) ?? "refused",
      requestId: str(row.request_id),
      auditId: str(row.audit_id),
      message,
    },
  };
}

// ── 3. The approver's queue ─────────────────────────────────────────────────

/**
 * `iam.emergency_door_pending()` — every `private`-class request waiting on an
 * owner, in the organizations where the caller IS an owner. An empty array is
 * the honest answer both for "nothing is waiting" and for "you own no
 * organization"; the surface distinguishes them from its own org standing.
 */
export async function listPendingEmergencyDoorRequests(
  client: EmergencyAccessClient,
): Promise<EmergencyAccessResult<EmergencyDoorRequest[]>> {
  const result = await callDoor(
    client,
    "emergency_door_pending",
    {},
    "The pending emergency access requests",
  );
  if (!result.ok) return result;

  const requests: EmergencyDoorRequest[] = [];
  for (const raw of asArray(result.data)) {
    const row = asRecord(raw);
    const id = str(row?.id);
    if (!id || !row) continue;
    requests.push({
      id,
      targetToken: str(row.target_token) ?? "",
      targetId: str(row.target_id),
      subjectUserId: str(row.subject_user_id),
      dataClass: str(row.data_class),
      purpose: str(row.purpose),
      justification: str(row.justification),
      requestedBy: str(row.requested_by),
      requestedByLabel: str(row.requested_by_label),
      subjectLabel: str(row.subject_label),
      organizationLabel: str(row.organization_label),
      requestExpiresAt: str(row.request_expires_at),
      createdAt: str(row.created_at),
      organizationId: str(row.organization_id),
    });
  }
  return { ok: true, data: requests };
}

function mapDecision(
  payload: unknown,
  whatFailed: string,
): EmergencyAccessResult<EmergencyDoorDecision> {
  const row = asRecord(payload);
  const message = str(row?.message);
  if (!row || !message) {
    console.error(`[emergency-access] ${whatFailed} returned no message:`, payload);
    return failed(`${whatFailed} answered without saying what happened.`);
  }
  return {
    ok: true,
    data: {
      granted: bool(row.granted),
      message,
      expiresAt: str(row.expires_at),
      reason: str(row.reason),
    },
  };
}

// ── 4. Approve ──────────────────────────────────────────────────────────────

/**
 * `iam.emergency_door_approve(...)` — the owner's half of the two-person rule.
 * Approving MINTS a read-only, time-boxed key over a person's private data and
 * tells that person immediately. The surface names that before the click.
 */
export async function approveEmergencyDoorRequest(
  client: EmergencyAccessClient,
  args: { requestId: string; note: string },
): Promise<EmergencyAccessResult<EmergencyDoorDecision>> {
  const result = await callDoor(
    client,
    "emergency_door_approve",
    { p_request_id: args.requestId, p_note: args.note },
    "The approval",
  );
  if (!result.ok) return result;
  return mapDecision(result.data, "The approval");
}

// ── 5. Deny ─────────────────────────────────────────────────────────────────

/**
 * `iam.emergency_door_deny(...)` — the refusal. It is recorded exactly as an
 * approval is, and the person whose data it was is told it was asked for and
 * refused. Nothing about saying no is silent.
 */
export async function denyEmergencyDoorRequest(
  client: EmergencyAccessClient,
  args: { requestId: string; note: string },
): Promise<EmergencyAccessResult<EmergencyDoorDecision>> {
  const result = await callDoor(
    client,
    "emergency_door_deny",
    { p_request_id: args.requestId, p_note: args.note },
    "The refusal",
  );
  if (!result.ok) return result;
  return mapDecision(result.data, "The refusal");
}

// ── The audit ───────────────────────────────────────────────────────────────

function mapAccessLogRows(payload: unknown): AccessLogEntry[] {
  const entries: AccessLogEntry[] = [];
  for (const raw of asArray(payload)) {
    const row = asRecord(raw);
    const id = str(row?.id);
    if (!id || !row) continue;
    entries.push({
      id,
      occurredAt: str(row.occurred_at),
      action: str(row.action),
      targetToken: str(row.target_token),
      targetIds: strArray(row.target_ids),
      dataClass: str(row.data_class),
      purpose: str(row.purpose),
      justification: str(row.justification),
      granted: bool(row.granted),
      denialReason: str(row.denial_reason),
      actorUserId: str(row.actor_user_id),
      actorLabel: str(row.actor_label),
      granteeUserId: str(row.grantee_user_id),
      granteeLabel: str(row.grantee_label),
      grantExpiresAt: str(row.grant_expires_at),
      organizationId: str(row.organization_id),
      basis: str(row.basis),
      isEmergencyDoor: bool(row.is_emergency_door),
      subjectUserId: str(row.subject_user_id),
      subjectLabel: str(row.subject_label),
      organizationLabel: str(row.organization_label),
    });
  }
  return entries;
}

// ── 6. The subject's own log ────────────────────────────────────────────────

/**
 * `iam.my_access_log(...)` — "every time anyone opened my data", newest first.
 *
 * The door keys on `auth.uid()` INSIDE the function, so it can only ever return
 * the caller's own rows: there is no parameter to get wrong and no way for one
 * person to read another's page.
 */
export async function fetchMyAccessLog(
  client: EmergencyAccessClient,
  args: { limit: number; offset: number },
): Promise<EmergencyAccessResult<AccessLogEntry[]>> {
  const result = await callDoor(
    client,
    "my_access_log",
    { p_limit: args.limit, p_offset: args.offset },
    "Your access history",
  );
  if (!result.ok) return result;
  return { ok: true, data: mapAccessLogRows(result.data) };
}

// ── 7. An organization's log ────────────────────────────────────────────────

/**
 * `iam.org_access_log(...)` — the same rows for one organization's owners and
 * admins, plus the subject each row is about.
 */
export async function fetchOrgAccessLog(
  client: EmergencyAccessClient,
  args: { organizationId: string; limit: number },
): Promise<EmergencyAccessResult<AccessLogEntry[]>> {
  const result = await callDoor(
    client,
    "org_access_log",
    { p_organization_id: args.organizationId, p_limit: args.limit },
    "This organization's access history",
  );
  if (!result.ok) return result;
  return { ok: true, data: mapAccessLogRows(result.data) };
}
