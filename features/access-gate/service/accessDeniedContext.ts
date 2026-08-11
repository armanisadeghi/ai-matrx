/**
 * accessDeniedContext — the client half of `public.access_denied_context`.
 *
 * ONE round trip answers everything the denied surface needs: what kind of
 * thing this is, what it's called, who owns it, which organization it lives in,
 * the nearest ancestor the caller CAN open, and the caller's own outstanding
 * request. Direct to Supabase — this is a plain DB read the browser is entitled
 * to make, so it never touches the Python server (CLAUDE.md § data flow).
 *
 * The RPC decides disclosure, not this file. Everything here is parsing.
 */

import { createClient } from "@/utils/supabase/client";
import type {
  AccessDeniedAncestor,
  AccessDeniedContext,
  AccessDeniedOrganization,
  AccessDeniedOwner,
  AccessDisclosure,
  AccessGateStatus,
  AccessRequestStatus,
  AccessRequestSummary,
  RequestedLevel,
} from "@/features/access-gate/types";

function rec(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseOwner(raw: unknown): AccessDeniedOwner | null {
  const row = rec(raw);
  const userId = row ? str(row.user_id) : null;
  if (!userId) return null;
  return {
    userId,
    displayName: str(row?.display_name),
    avatarUrl: str(row?.avatar_url),
    creatorHandle: str(row?.creator_handle),
  };
}

function parseOrg(raw: unknown): AccessDeniedOrganization | null {
  const row = rec(raw);
  const id = row ? str(row.id) : null;
  if (!id) return null;
  return {
    id,
    name: str(row?.name),
    isPersonal: row?.is_personal === true,
    viewerIsMember: row?.viewer_is_member === true,
  };
}

function parseAncestor(raw: unknown): AccessDeniedAncestor | null {
  const row = rec(raw);
  const id = row ? str(row.id) : null;
  const token = row ? str(row.token) : null;
  if (!id || !token) return null;
  return {
    token,
    id,
    label: str(row?.label) ?? "item",
    title: str(row?.title),
  };
}

const REQUEST_STATUSES: AccessRequestStatus[] = [
  "pending",
  "granted",
  "declined",
  "withdrawn",
  "reported",
];

function parseRequest(raw: unknown): AccessRequestSummary | null {
  const row = rec(raw);
  const id = row ? str(row.id) : null;
  if (!id) return null;
  const status = str(row?.status);
  return {
    id,
    status: REQUEST_STATUSES.includes(status as AccessRequestStatus)
      ? (status as AccessRequestStatus)
      : "pending",
    level: row?.level === "editor" ? "editor" : "viewer",
    createdAt: str(row?.created_at),
    decisionNote: str(row?.decision_note),
  };
}

function parseLevel(raw: unknown): AccessDeniedContext["level"] {
  return raw === "view" || raw === "edit" || raw === "admin" ? raw : "none";
}

function parseDisclosure(raw: unknown): AccessDisclosure {
  return raw === "full" || raw === "kind_only" || raw === "anonymous"
    ? raw
    : "none";
}

/**
 * Turn the RPC payload into the ONE status a surface branches on.
 *
 * Order matters. "Do I actually have access?" is asked FIRST, because a
 * surface only calls this after a read failed — and if the caller genuinely has
 * access, the failure was transient (a dropped connection, a timeout) and
 * showing them a denial screen would be the same class of lie this feature
 * exists to kill.
 */
function deriveStatus(
  payload: Record<string, unknown>,
  disclosure: AccessDisclosure,
): AccessGateStatus {
  // An unregistered token is a bug in the CALLING surface, not evidence about
  // the user's record. Reporting it as "missing" would tell someone their data
  // is gone because WE misconfigured a registry — the exact lie this feature
  // exists to kill. (Caught by the adversarial pass, 2026-08-11.)
  if (payload.unresolvable === true) return "error";
  if (disclosure === "anonymous") return "anonymous";
  if (parseLevel(payload.level) !== "none") return "ok";
  if (payload.exists === false) return "missing";
  if (payload.deleted === true) return "deleted";
  if (payload.exists === true) return "denied";
  return "error";
}

const UNKNOWN: AccessDeniedContext = {
  status: "error",
  disclosure: "none",
  level: "none",
  isOwner: false,
  entity: { token: "", label: "item", title: null },
  owner: null,
  organization: null,
  ancestor: null,
  request: null,
  canRequest: false,
};

/**
 * Resolve why the caller cannot open `(token, id)`.
 *
 * Never throws: a surface calling this is already in a failure path, and a
 * second failure there must not replace an honest explanation with a stack
 * trace. An unresolvable answer surfaces as `status: "error"`, which the UI
 * renders as a real, retry-able error rather than as a denial.
 */
export async function fetchAccessDeniedContext(
  token: string,
  id: string,
): Promise<AccessDeniedContext> {
  if (!token || !id) return UNKNOWN;

  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("access_denied_context", {
      p_type: token,
      p_id: id,
    });
    if (error) return UNKNOWN;

    const payload = rec(data);
    if (!payload) return UNKNOWN;

    const disclosure = parseDisclosure(payload.disclosure);
    const entity = rec(payload.entity);

    return {
      status: deriveStatus(payload, disclosure),
      disclosure,
      level: parseLevel(payload.level),
      isOwner: payload.is_owner === true,
      entity: {
        token: str(entity?.token) ?? token,
        // Falling back to a generic noun keeps the copy human even for a token
        // the registry doesn't know — never print the token itself.
        label: str(entity?.label) ?? "item",
        title: str(entity?.title),
      },
      owner: parseOwner(payload.owner),
      organization: parseOrg(payload.organization),
      ancestor: parseAncestor(payload.ancestor),
      request: parseRequest(payload.request),
      canRequest: payload.can_request === true,
    };
  } catch {
    return UNKNOWN;
  }
}

/** The level a "Request access" click asks for by default. */
export const DEFAULT_REQUEST_LEVEL: RequestedLevel = "viewer";
