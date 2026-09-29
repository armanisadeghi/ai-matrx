// features/access-log/service.ts
//
// THE ACCESS LOG READS: "every time anyone opened my data" (`iam.my_access_log`)
// and an organization's copy (`iam.org_access_log`). The rows come from HR's
// break-glass door and from account take-over (public.org_admin_take_over_account).
// The organization-admin emergency door this file used to wrap is retired
// (access ladder T-16, 2026-09-28): Private is the owner alone, and an
// organization admin's only way in is taking over the account.
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

import type { AccessLogEntry, EmergencyAccessResult } from "./types";

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
 * Call ONE `iam` access-log reader and hand back the raw payload.
 *
 * The cast on `.schema("iam")` is contained to this function: it buys exactly
 * the right to name the function; it buys NOTHING about the answer, which stays
 * `unknown` until a wrapper maps it.
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
      `[access-log] iam.${fn} failed (${error.code ?? "no code"}):`,
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
