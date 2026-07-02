// features/organizations/service/invitationsService.ts
//
// THE SOLE CHOKEPOINT for canonical invitations — `iam.invitations`.
//
// This is the canonical "invite someone to a container" primitive, replacing
// the per-feature legacy invitation tables (the old project / org invite
// shapes). The client has NO direct grant on `iam.invitations`; every read/write
// goes through the PUBLIC SECURITY-DEFINER `inv_*` RPCs — and every call to
// those RPCs goes through THIS file. No other file is allowed to call them.
// Like `associationsService`, methods always return a `ScopesRpcResult` and
// NEVER throw.
//
// A "target" is what the invitee will join: target_type ∈ { 'project', ... }
// + target_id. `accept` is ATOMIC in the DB — it creates the membership AND
// marks the invite accepted — so accepting does NOT need a separate membership
// call. PG rows come back snake_case; small `toX` helpers map to camelCase.

"use client";

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import {
  err,
  mapPgErrorPair,
  mapPgError,
  ok,
} from "@/features/scopes/service/rpcResult";
import type { ScopesRpcResult } from "@/features/scopes/types";
import type { DbRpcRow } from "@/types/supabase-rpc";

// ─── Shapes ─────────────────────────────────────────────────────────

export interface Invitation {
  id: string;
  organizationId: string | null;
  targetType: string;
  targetId: string;
  email: string;
  invitedUserId: string | null;
  role: string;
  status: string;
  token: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  createdBy: string | null;
}

/** Accept result — what the invitee just joined. */
export interface AcceptedInvitation {
  targetType: string;
  targetId: string;
  organizationId: string | null;
  role: string;
}

// ─── PG row interfaces (snake_case, straight from the RPCs) ──────────

interface InvListRow {
  id: string;
  organization_id: string | null;
  target_type: string;
  target_id: string;
  email: string;
  invited_user_id: string | null;
  role: string;
  status: string;
  token: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  created_by: string | null;
}

// inv_create returns the FULL iam.invitations row (not the trimmed InvListRow
// shape other RPCs return) — metadata/updated_at/updated_by/version/deleted_at
// included. Declare that shape and guard it so a DB column add/remove breaks
// the build here rather than silently widening the cast below.
interface InvCreateRow extends InvListRow {
  // inv_create's org_id is NOT NULL on iam.invitations (unlike the trimmed
  // InvListRow shape other RPCs use) — narrow it so the guard below matches.
  organization_id: string;
  deleted_at: string | null;
  metadata: unknown;
  updated_at: string;
  updated_by: string | null;
  version: number;
}
type _InvCreateCheck = InvCreateRow extends DbRpcRow<"inv_create"> ? true : false;
declare const _invCreateCheck: _InvCreateCheck;
true satisfies typeof _invCreateCheck;

// inv_get_by_token omits `token`; inv_for_me omits `invited_user_id` +
// `accepted_at`. We widen to a partial of InvListRow and map defensively.
type InvPartialRow = Partial<InvListRow> &
  Pick<
    InvListRow,
    | "id"
    | "organization_id"
    | "target_type"
    | "target_id"
    | "email"
    | "role"
    | "status"
    | "expires_at"
    | "created_at"
    | "created_by"
  >;

interface InvAcceptRow {
  target_type: string;
  target_id: string;
  organization_id: string | null;
  role: string;
}

function toInvitation(row: InvPartialRow): Invitation {
  return {
    id: row.id,
    organizationId: row.organization_id ?? null,
    targetType: row.target_type,
    targetId: row.target_id,
    email: row.email,
    invitedUserId: row.invited_user_id ?? null,
    role: row.role,
    status: row.status,
    token: row.token ?? null,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at ?? null,
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
  };
}

// ─── service ────────────────────────────────────────────────────────

export const invitationsService = {
  // ──────────────────────────────────────────────────────────────────
  //  READ — every invitation for one target.
  // ──────────────────────────────────────────────────────────────────

  /** All invitations for `${targetType}:${targetId}`, org-filtered by RLS. */
  async listForTarget(
    targetType: string,
    targetId: string,
  ): Promise<ScopesRpcResult<{ invitations: Invitation[] }>> {
    try {
      requireUserId();
      const { data, error } = await supabase.rpc("inv_list", {
        p_target_type: targetType,
        p_target_id: targetId,
      });
      if (error) return err(...mapPgErrorPair(error));
      const rows = (Array.isArray(data) ? data : []) as InvListRow[];
      return ok({ invitations: rows.map(toInvitation) });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  READ — one invitation by token (gated to the invited party).
  // ──────────────────────────────────────────────────────────────────

  /**
   * The invitation for `token` — readable by the invited party BEFORE they hold
   * a membership, so the accept page can render it. Returns null when no
   * matching invitation exists / is visible. (Row omits `token` itself.)
   */
  async getByToken(
    token: string,
  ): Promise<ScopesRpcResult<{ invitation: Invitation | null }>> {
    try {
      requireUserId();
      const { data, error } = await supabase.rpc("inv_get_by_token", {
        p_token: token,
      });
      if (error) return err(...mapPgErrorPair(error));
      const rows = (Array.isArray(data) ? data : []) as InvPartialRow[];
      const row = rows[0];
      return ok({ invitation: row ? toInvitation(row) : null });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  READ — invitations addressed to the current user.
  // ──────────────────────────────────────────────────────────────────

  /** Pending, unexpired invitations addressed to the current user. */
  async forMe(): Promise<ScopesRpcResult<{ invitations: Invitation[] }>> {
    try {
      requireUserId();
      const { data, error } = await supabase.rpc("inv_for_me");
      if (error) return err(...mapPgErrorPair(error));
      const rows = (Array.isArray(data) ? data : []) as InvPartialRow[];
      return ok({ invitations: rows.map(toInvitation) });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  WRITE — create (or refresh) an invitation.
  // ──────────────────────────────────────────────────────────────────

  /**
   * Invite `email` to `${targetType}:${targetId}` with `role`. When `orgId` is
   * omitted the RPC resolves org from the target (project). Refreshes an
   * existing pending invite for the same target + email rather than
   * duplicating. Returns the full invitation row (with its `token`).
   */
  async create(args: {
    targetType: string;
    targetId: string;
    email: string;
    role?: string;
    orgId?: string | null;
    invitedUserId?: string | null;
    expiresAt?: string;
  }): Promise<ScopesRpcResult<{ invitation: Invitation }>> {
    try {
      requireUserId();
      const { data, error } = await supabase.rpc("inv_create", {
        p_target_type: args.targetType,
        p_target_id: args.targetId,
        p_email: args.email,
        p_role: args.role ?? "member",
        p_org_id: args.orgId ?? undefined,
        p_invited_user_id: args.invitedUserId ?? undefined,
        ...(args.expiresAt ? { p_expires_at: args.expiresAt } : {}),
      });
      if (error) return err(...mapPgErrorPair(error));
      if (!data) return err("internal", "inv_create returned no invitation");
      // Sanctioned cast — DB-shape-guarded above (_InvCreateCheck).
      return ok({ invitation: toInvitation(data as unknown as InvCreateRow) });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  WRITE — accept an invitation (ATOMIC: creates membership + marks accepted).
  // ──────────────────────────────────────────────────────────────────

  /**
   * Accept the invitation for `token`. ATOMIC in the DB — it creates the
   * membership AND marks the invite accepted in one transaction, so callers do
   * NOT need a separate membership call. Returns what was joined.
   */
  async accept(
    token: string,
  ): Promise<ScopesRpcResult<{ accepted: AcceptedInvitation }>> {
    try {
      requireUserId();
      const { data, error } = await supabase.rpc("inv_accept", {
        p_token: token,
      });
      if (error) return err(...mapPgErrorPair(error));
      const rows = (Array.isArray(data) ? data : []) as InvAcceptRow[];
      const row = rows[0];
      if (!row) {
        return err("not_found", "Invalid or expired invitation");
      }
      return ok({
        accepted: {
          targetType: row.target_type,
          targetId: row.target_id,
          organizationId: row.organization_id ?? null,
          role: row.role,
        },
      });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  WRITE — revoke an invitation.
  // ──────────────────────────────────────────────────────────────────

  /** Revoke (cancel) the invitation `invitationId`. */
  async revoke(invitationId: string): Promise<ScopesRpcResult<null>> {
    try {
      requireUserId();
      const { error } = await supabase.rpc("inv_revoke", {
        p_invitation_id: invitationId,
      });
      if (error) return err(...mapPgErrorPair(error));
      return ok(null);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  WRITE — resend (refresh expiry + token).
  // ──────────────────────────────────────────────────────────────────

  /**
   * Refresh the invitation `invitationId` (new expiry) and return its fresh
   * `token` so the email layer can rebuild the accept link.
   */
  async resend(
    invitationId: string,
    expiresAt?: string,
  ): Promise<ScopesRpcResult<{ token: string }>> {
    try {
      requireUserId();
      const { data, error } = await supabase.rpc("inv_resend", {
        p_invitation_id: invitationId,
        ...(expiresAt ? { p_expires_at: expiresAt } : {}),
      });
      if (error) return err(...mapPgErrorPair(error));
      if (!data || typeof data !== "string") {
        return err("internal", "inv_resend returned no token");
      }
      return ok({ token: data });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },
};
