"use client";

/**
 * features/personal-staff/staff-door.ts — the client half of the in-app door
 * onto a person's staff.
 *
 * THE SERVER OWNS THE THREAD. `POST {aidream}/personal-staff/open` returns the
 * ONE conversation this person's texts and calls already use (a deterministic
 * uuid5 the SMS worker and the voice ingress compute the same way). This module
 * does not derive, cache or invent that id — it asks, every visit.
 * Source of truth: `../../../aidream/aidream/services/personal_staff/door.py`.
 *
 * 🚨 WHY THIS IS NOT A SERVER-COMPONENT CALL. The door is gated by
 * `require_organization_context`, so it needs `X-Organization-Id`. In this repo
 * the ACTIVE organization is a browser fact and nothing else: `getActiveOrgId`
 * reads Redux `appContext.organization_id`, and no cookie, preference or
 * personal-org fallback may stand in for it server-side (CLAUDE.md § Supabase &
 * database — "A 'default organization' is at most a per-client DISPLAY
 * preference"; `ensureOrgIdServer` REFUSES rather than choosing). A Server
 * Component therefore has no honest organization to send, which is why no
 * Server Component in this repo calls aidream with that header. The page still
 * paints its header and its chat column on the server (see
 * `app/(core)/staff/page.tsx`); only the thread id arrives from here.
 *
 * 🚨 WHY `BackendClient` AND NOT `callApi`. `callApi` injects
 * `organization_id` into every JWT-lane POST body, and `OpenStaffThreadRequest`
 * declares `extra="forbid"` — the body copy would come back 422. `BackendClient`
 * with `sendScopeInBody: false` is the documented answer to exactly that shape
 * (see its `sendScopeInBody` docstring, and `app/api/cms/_lib/validateContent.ts`
 * for the precedent). The organization still rides the header, fail-closed,
 * through the one `requireOrganizationContext` kernel.
 */

import type { components } from "@/types/python-generated/api-types";

import { BackendClient } from "@/lib/api/backend-client";
import { BackendApiError } from "@/lib/api/errors";
import { resolveBaseUrl } from "@/lib/python-client";
import {
  PERSONAL_STAFF_MANDATE_KEY,
  STAFF_DOOR_PATH,
  STAFF_WEB_CHANNEL,
} from "./mandate";

// Re-exported so a client caller has ONE import for the door and its identity.
// The values themselves live in the directive-free `./mandate` — see its
// header for the failure that put them there.
export { PERSONAL_STAFF_MANDATE_KEY, STAFF_DOOR_PATH, STAFF_WEB_CHANNEL };

/**
 * The door's 200 body — ALIASED to the generated contract, not copied from it
 * (check:generated-contracts, 2026-09-22). This was a hand-written mirror whose
 * own comment said "byte-for-byte `StaffThread` in `door.py`", which is exactly
 * the shape that goes on type-checking after door.py renames a field. The
 * generated declaration carries door.py's own field descriptions, including
 * that `agent_name: null` means SHOW NO NAME rather than a hardcoded one, and
 * that `sandbox_note` is present exactly when `sandbox_instance_id` is null.
 * Regenerate with `pnpm sync-types`.
 */
export type StaffThread = components["schemas"]["StaffThread"];

/**
 * The refusals the door itself names, each with a sentence written for a
 * person. The client renders that sentence VERBATIM — inventing our own copy
 * here would put a second, drifting explanation in front of the user.
 */
export const STAFF_DOOR_CODES = [
  "organization_required",
  "no_holder",
  "holder_is_not_an_agent",
] as const;
export type StaffDoorCode = (typeof STAFF_DOOR_CODES)[number];

export function isStaffDoorCode(value: string): value is StaffDoorCode {
  return (STAFF_DOOR_CODES as readonly string[]).includes(value);
}

export interface StaffDoorFailure {
  /** The door's own code when it named one, else the transport's. */
  code: string;
  /** The sentence to show. The server's when it wrote one. */
  message: string;
  status: number | null;
}

export interface OpenStaffThreadArgs {
  accessToken: string;
  organizationId: string;
  /** Test seam. Left out, the active server the admin server-switcher selected
   *  wins, exactly as it does for every other backend call. */
  baseUrl?: string;
  signal?: AbortSignal;
}

/**
 * Open — or re-open — this person's staff conversation. Idempotent: the server
 * derives the id and creates the row through its own canonical gate, so calling
 * this on every visit is the design, not a cost.
 *
 * Throws nothing that is not a `StaffDoorFailure`-shaped fact: failures come
 * back through `staffDoorFailure` so the surface always has a code and a
 * sentence to render.
 */
export async function openStaffThread({
  accessToken,
  organizationId,
  baseUrl,
  signal,
}: OpenStaffThreadArgs): Promise<StaffThread> {
  const client = new BackendClient({
    baseUrl: baseUrl ?? resolveBaseUrl(),
    auth: { type: "token", token: accessToken },
    scope: { organization_id: organizationId },
    // The request model forbids extra fields — the organization rides the
    // header only. See the module header.
    sendScopeInBody: false,
  });
  const response = await client.rawPost(
    STAFF_DOOR_PATH,
    { channel: STAFF_WEB_CHANNEL },
    signal,
  );
  return (await response.json()) as StaffThread;
}

/**
 * Turn whatever the door threw into the one shape the screen renders.
 *
 * `parseHttpError` already unwraps FastAPI's `{"detail": {code, message}}`
 * envelope — `code` lands on `BackendApiError.code` and the server's sentence
 * on `.detail` — so the person reads the server's words, not ours.
 */
export function staffDoorFailure(error: unknown): StaffDoorFailure {
  if (error instanceof BackendApiError) {
    return {
      code: String(error.code),
      message: error.detail || error.userMessage,
      status: error.status,
    };
  }
  if (error instanceof Error) {
    return { code: "unreachable", message: error.message, status: null };
  }
  return {
    code: "unreachable",
    message: "Your staff could not be reached just now.",
    status: null,
  };
}
