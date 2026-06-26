/**
 * features/files/handler/intelligence/access.ts
 *
 * The "can this user access this file?" decision. The handler consults
 * this BEFORE deciding whether a backend failure is "expired URL, refresh"
 * or "no access, reject".
 *
 * Order of checks:
 *   1. owner_id === current user → owned (full caps)
 *   2. visibility === "public" OR public CDN URL → public (read-only)
 *   3. canonical `public.permissions` grant matches user → shared
 *      (level-derived caps). Grants are loaded into Redux via `loadPermissions`
 *      and passed in here; the authoritative server-side check is
 *      `iam.has_access('file', fileId, level)` / `public.has_permission(...)`.
 *   4. file.organizationId is in user's active orgs → check org-level grant
 *   5. share_token is non-revoked → public (read-only by token)
 *   6. external URL → external (read-only, no caps over the file itself)
 *   7. None of the above → unauthorized
 */

import type { RootState } from "@/lib/redux/store";
import type { CloudFile, CloudFilePermission } from "@/features/files/types";
import type { FileCapabilities, FileOrigin } from "../types";

export interface AccessDecision {
  origin: FileOrigin;
  capabilities: FileCapabilities;
}

const READ_ONLY: FileCapabilities = {
  canRead: true,
  canEdit: false,
  canShare: false,
  canDelete: false,
  requiresAuth: false,
  transportSafeForFetch: true,
};

const NO_ACCESS: FileCapabilities = {
  canRead: false,
  canEdit: false,
  canShare: false,
  canDelete: false,
  requiresAuth: true,
  transportSafeForFetch: true,
};

function fromLevel(level: "read" | "write" | "admin"): FileCapabilities {
  return {
    canRead: true,
    canEdit: level === "write" || level === "admin",
    canShare: level === "admin",
    canDelete: level === "admin",
    requiresAuth: true,
    transportSafeForFetch: true,
  };
}

/**
 * Decide origin + capabilities for an OWNED-OR-SHARED cld_files row, given
 * the current user from Redux. Public files and external URLs are decided
 * by the input adapter — not here — because they don't need the user.
 */
export function decideForOwnedFile(
  file: CloudFile,
  state: RootState,
  permissions?: CloudFilePermission[],
): AccessDecision {
  const userId = state.userAuth.id;

  if (userId && file.ownerId === userId) {
    return {
      origin: "owned",
      capabilities: {
        canRead: true,
        canEdit: true,
        canShare: true,
        canDelete: true,
        requiresAuth: true,
        transportSafeForFetch: true,
      },
    };
  }

  if (file.visibility === "public") {
    return { origin: "public", capabilities: READ_ONLY };
  }

  if (userId && permissions?.length) {
    const grant = permissions.find(
      (p) => p.granteeType === "user" && p.granteeId === userId,
    );
    if (grant) {
      const expired =
        grant.expiresAt && Date.parse(grant.expiresAt) < Date.now();
      if (!expired) {
        return {
          origin: "shared",
          capabilities: fromLevel(grant.permissionLevel),
        };
      }
    }
  }

  return { origin: "owned", capabilities: NO_ACCESS };
}

export const PUBLIC_CAPS = READ_ONLY;
export const EXTERNAL_CAPS: FileCapabilities = {
  canRead: true,
  canEdit: false,
  canShare: false,
  canDelete: false,
  requiresAuth: false,
  transportSafeForFetch: false,
};
export const EPHEMERAL_CAPS: FileCapabilities = {
  canRead: true,
  canEdit: true,
  canShare: false,
  canDelete: true,
  requiresAuth: false,
  transportSafeForFetch: true,
};
