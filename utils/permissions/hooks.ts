/**
 * Permission Hooks
 *
 * React hooks for working with permissions in components.
 * These hooks provide reactive state management for permissions.
 */

import { useState, useEffect, useCallback } from "react";
import { extractErrorMessage } from "@/utils/errors";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  selectSharingAuthority,
  selectSharingStatus,
  sharingAuthorityRequested,
  sharingAuthorityResolved,
  sharingStatusFailed,
  sharingStatusKey,
  sharingStatusLoaded,
  sharingStatusRequested,
} from "@/lib/redux/slices/sharingStatusSlice";
import {
  Permission,
  PermissionWithDetails,
  ResourceType,
  PermissionLevel,
  CheckPermissionOptions,
  ShareActionResult,
  PermissionCheckResult,
} from "./types";
import {
  listPermissions,
  getResourcePermissions,
  checkPermission,
  resolveResourceOwnership,
  resolveSharingAuthority,
  shareWithUser,
  makePublic,
  revokeAccess,
  revokeOrgAccess,
  updatePermissionLevel,
  getSharedWithMe,
  getResourceVisibility,
  setResourceShownTo,
  setStoreLane,
  type LaneChoice,
  type ResourceVisibility,
  type WhoCanSee,
} from "./service";
import type { ShownTo } from "@/lib/list-scope/shownTo";

// ============================================================================
// Permission Listing Hooks
// ============================================================================

/**
 * Hook to get all permissions for a resource
 * @param resourceType Resource type
 * @param resourceId Resource ID
 * @returns Permissions, loading state, and refresh function
 */
export function usePermissions(
  resourceType: ResourceType,
  resourceId: string,
  enabled: boolean = true,
) {
  const [permissions, setPermissions] = useState<PermissionWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPermissions = useCallback(async () => {
    if (!resourceType || !resourceId || !enabled) return;

    setLoading(true);
    setError(null);

    try {
      const data = await listPermissions(resourceType, resourceId);
      setPermissions(data);
    } catch (err) {
      console.error("Error fetching permissions:", err);
      setError(extractErrorMessage(err) || "Failed to fetch permissions");
    } finally {
      setLoading(false);
    }
  }, [resourceType, resourceId, enabled]);

  useEffect(() => {
    if (enabled) {
      fetchPermissions();
    }
  }, [fetchPermissions, enabled]);

  return {
    permissions,
    loading,
    error,
    refresh: fetchPermissions,
  };
}

/**
 * Hook to get permissions with user/org details
 * @param resourceType Resource type
 * @param resourceId Resource ID
 * @returns Permissions with details, loading state, and refresh function
 */
export function useResourcePermissions(
  resourceType: ResourceType,
  resourceId: string,
) {
  const [permissions, setPermissions] = useState<PermissionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPermissions = useCallback(async () => {
    if (!resourceType || !resourceId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await getResourcePermissions(resourceType, resourceId);
      setPermissions(data);
    } catch (err) {
      console.error("Error fetching resource permissions:", err);
      setError(
        extractErrorMessage(err) || "Failed to fetch resource permissions",
      );
    } finally {
      setLoading(false);
    }
  }, [resourceType, resourceId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  return {
    permissions,
    loading,
    error,
    refresh: fetchPermissions,
  };
}

// ============================================================================
// Permission Check Hooks
// ============================================================================

/**
 * Hook to check if current user has permission for a resource
 * @param options Check options
 * @returns Permission check result and loading state
 */
export function usePermissionCheck(options: CheckPermissionOptions) {
  const [result, setResult] = useState<PermissionCheckResult>({
    hasAccess: false,
    isOwner: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      setLoading(true);
      const checkResult = await checkPermission(options);
      setResult(checkResult);
      setLoading(false);
    };

    if (options.resourceType && options.resourceId) {
      check();
    }
  }, [options.resourceType, options.resourceId, options.requiredLevel]);

  return {
    ...result,
    loading,
  };
}

/**
 * Hook to check if current user can edit a resource
 * @param resourceType Resource type
 * @param resourceId Resource ID
 * @returns Whether user can edit and loading state
 */
export function useCanEdit(resourceType: ResourceType, resourceId: string) {
  const { hasAccess, loading } = usePermissionCheck({
    resourceType,
    resourceId,
    requiredLevel: "editor",
  });

  return {
    canEdit: hasAccess,
    loading,
  };
}

/**
 * Hook to check if current user can delete/admin a resource
 * @param resourceType Resource type
 * @param resourceId Resource ID
 * @returns Whether user has admin access and loading state
 */
export function useCanAdmin(resourceType: ResourceType, resourceId: string) {
  const { hasAccess, loading } = usePermissionCheck({
    resourceType,
    resourceId,
    requiredLevel: "admin",
  });

  return {
    canAdmin: hasAccess,
    loading,
  };
}

/**
 * Hook to check whether the current user MAY DECIDE WHO ELSE SEES a resource.
 *
 * It kept its name because every call site means "may this person manage
 * sharing?" and none of them meant "did this person create the row". Since
 * 2026-09-19 (lane SHARE) it asks the database's own `may_manage_sharing`
 * predicate — the Owner rung OR the `admin` rung of VIS-17's one ladder, the
 * same question the six sharing RPCs enforce — instead of reading `created_by`
 * from the resource table. Before that an `admin` on a thing was shown a
 * read-only dialog and an empty grant list, and any resource whose table
 * carries no client SELECT grant (the whole record store) could not be asked at
 * all.
 *
 * Returns three distinct states — `loading` (still resolving), `error`
 * (could NOT be determined), and `isOwner` — because collapsing them into one
 * boolean is what makes owner-gated UI render as if the user were a stranger
 * to their own record. Never gate a surface on `!isOwner` alone; check
 * `loading` and `error` first.
 *
 * @param resourceType Resource type
 * @param resourceId Resource ID
 */
export function useIsOwner(resourceType: ResourceType, resourceId: string) {
  const store = useAppStore();
  const key = sharingStatusKey(resourceType, resourceId);
  const entry = useAppSelector((state) => selectSharingAuthority(state, key));
  const asked = Boolean(resourceType && resourceId);

  // Asked once per record per tab: a mount (a woken or remounted share
  // control) reads the answer from the store; only a record nobody in this tab
  // has asked about yet reaches the database.
  const known = entry !== undefined;
  useEffect(() => {
    if (known || !asked) return;
    // Another control of the same record may have asked a moment ago.
    if (selectSharingAuthority(store.getState(), key)) return;
    store.dispatch(sharingAuthorityRequested({ key }));
    void resolveSharingAuthority(resourceType, resourceId).then((result) => {
      store.dispatch(sharingAuthorityResolved({ key, isOwner: result.isOwner, error: result.error }));
    });
  }, [known, asked, key]);

  if (!asked) return { isOwner: false, loading: false, error: null };
  return {
    isOwner: entry?.isOwner ?? false,
    loading: entry ? entry.loading : true,
    error: entry?.error ?? null,
  };
}

// ============================================================================
// Sharing Action Hooks
// ============================================================================

/**
 * Hook for sharing operations
 * Provides functions to share, revoke, and update permissions
 * @param resourceType Resource type
 * @param resourceId Resource ID
 * @returns Sharing functions and state
 */
export function useSharing(
  resourceType: ResourceType,
  resourceId: string,
  enabled: boolean = true,
  resourceName?: string,
  /**
   * The organization the object lives in, from the page that opened the dialog (its own
   * resolver). Carried to the share's in-app notification so no action on an object ever asks
   * which workspace it is for (ACCESS-FIX-18).
   */
  organizationId?: string | null,
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<ResourceVisibility>({
    isPublic: false,
  });
  const { permissions, refresh: refreshPermissions } = usePermissions(
    resourceType,
    resourceId,
    enabled,
  );

  const refreshRowState = useCallback(async () => {
    if (!resourceType || !resourceId || !enabled) return;
    try {
      const v = await getResourceVisibility(resourceType, resourceId);
      setRowState(v);
    } catch (err) {
      console.error("Error fetching the record's row controls:", err);
      setError(extractErrorMessage(err));
    }
  }, [resourceType, resourceId, enabled]);

  const refresh = useCallback(async () => {
    await Promise.all([refreshPermissions(), refreshRowState()]);
  }, [refreshPermissions, refreshRowState]);

  useEffect(() => {
    if (enabled) {
      void refreshRowState();
    }
  }, [enabled, refreshRowState]);

  const handleShareWithUser = useCallback(
    async (userId: string, permissionLevel: PermissionLevel) => {
      setLoading(true);
      setError(null);

      try {
        const result = await shareWithUser({
          resourceType,
          resourceId,
          userId,
          permissionLevel,
          resourceName,
          organizationId: organizationId ?? null,
        });

        if (!result.success) {
          setError(result.error || "Failed to share");
          return result;
        }

        await refresh();
        return result;
      } catch (err) {
        const errorMessage =
          extractErrorMessage(err) || "Failed to share with user";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [resourceType, resourceId, resourceName, organizationId, refresh],
  );

  const handleMakePublic = useCallback(
    async (permissionLevel: PermissionLevel = "viewer") => {
      setLoading(true);
      setError(null);

      try {
        const result = await makePublic({
          resourceType,
          resourceId,
          permissionLevel,
        });

        if (!result.success) {
          setError(result.error || "Failed to make public");
          return result;
        }

        await refresh();
        return result;
      } catch (err) {
        const errorMessage =
          extractErrorMessage(err) || "Failed to make public";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [resourceType, resourceId, refresh],
  );

  const handleRevokeAccess = useCallback(
    async (options: {
      userId?: string;
      organizationId?: string;
      isPublic?: boolean;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const result = await revokeAccess({
          resourceType,
          resourceId,
          ...options,
        });
        if (!result.success) {
          setError(result.error || "Failed to revoke access");
          return result;
        }
        await refresh();
        return result;
      } catch (err) {
        const errorMessage =
          extractErrorMessage(err) || "Failed to revoke access";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [resourceType, resourceId, refresh],
  );

  const handleRevokeOrgAccess = useCallback(
    async (organizationId: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await revokeOrgAccess(
          resourceType,
          resourceId,
          organizationId,
        );
        if (!result.success) {
          setError(result.error || "Failed to revoke org access");
          return result;
        }
        await refresh();
        return result;
      } catch (err) {
        const errorMessage =
          extractErrorMessage(err) || "Failed to revoke org access";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [resourceType, resourceId, refresh],
  );

  const handleUpdateLevel = useCallback(
    async (
      options: { userId?: string; organizationId?: string },
      newLevel: PermissionLevel,
    ) => {
      setLoading(true);
      setError(null);
      try {
        const result = await updatePermissionLevel({
          resourceType,
          resourceId,
          ...options,
          newLevel,
        });
        if (!result.success) {
          setError(result.error || "Failed to update permission");
          return result;
        }
        await refresh();
        return result;
      } catch (err) {
        const errorMessage =
          extractErrorMessage(err) || "Failed to update permission";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [resourceType, resourceId, refresh],
  );

  /** "Shown to" — which lists show it; never a lock (access ladder Words table). */
  const handleSetShownTo = useCallback(
    async (next: ShownTo | null) => {
      setLoading(true);
      setError(null);
      try {
        const result = await setResourceShownTo(resourceType, resourceId, next);
        if (!result.success) {
          setError(result.error || 'Could not change "Shown to"');
          return result;
        }
        await refresh();
        return result;
      } catch (err) {
        const errorMessage =
          extractErrorMessage(err) || 'Could not change "Shown to"';
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [resourceType, resourceId, refresh],
  );

  /**
   * WHO CAN SEE THIS (lane SHARE-LANE-CONTROL) — the record store's lane door only. Every other
   * kind: null, and the control is absent; its row controls are "Shown to" and "Published to the
   * web" instead.
   */
  const whoCanSee: WhoCanSee | null = rowState.whoCanSee
    ? {
        ...rowState.whoCanSee,
        organizationId: rowState.whoCanSee.organizationId ?? organizationId ?? null,
      }
    : null;

  const handleSetWhoCanSee = useCallback(
    async (choice: LaneChoice): Promise<ShareActionResult> => {
      if (!whoCanSee) {
        return { success: false, error: "This item has no lane to choose." };
      }
      if (!whoCanSee.organizationId) {
        return {
          success: false,
          error: "This item's organization could not be read, so its lane cannot be changed.",
        };
      }
      setLoading(true);
      setError(null);
      try {
        const result = await setStoreLane(whoCanSee.organizationId, resourceId, choice);
        if (!result.success) {
          setError(result.error || "Failed to change who can see this");
          return result;
        }
        await refresh();
        return result;
      } catch (err) {
        const errorMessage =
          extractErrorMessage(err) || "Failed to change who can see this";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [whoCanSee, resourceId, refresh],
  );

  return {
    permissions,
    /** Published to the web (or the card's own publish). */
    isPublic: rowState.isPublic,
    /**
     * "Shown to" — undefined when the type does not carry it (Private, Confidential, child, or a
     * table without the column); null when the type's default applies.
     */
    shownTo: rowState.shownTo,
    /** A child record (a file attached to a chat): no row control of its own. */
    childRecord: rowState.childRecord === true,
    /** Membership alone reaches it — said under Current Access. The record store's door names it. */
    organizationDefault: rowState.organizationDefault ?? null,
    whoCanSee,
    /** The thing's own organization, read off its row; null when unknown. */
    homeOrganizationId: rowState.homeOrganizationId ?? null,
    setWhoCanSee: handleSetWhoCanSee,
    loading,
    error,
    shareWithUser: handleShareWithUser,
    makePublic: handleMakePublic,
    setShownTo: handleSetShownTo,
    revokeAccess: handleRevokeAccess,
    revokeOrgAccess: handleRevokeOrgAccess,
    updateLevel: handleUpdateLevel,
    refresh,
    refreshRowState,
  };
}

// ============================================================================
// Shared Resources Hook
// ============================================================================

/**
 * Hook to get resources shared with current user
 * @param resourceType Optional filter by resource type
 * @returns Shared permissions and loading state
 */
export function useSharedWithMe(resourceType?: ResourceType) {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchShared = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getSharedWithMe(resourceType);
      setPermissions(data);
    } catch (err) {
      console.error("Error fetching shared resources:", err);
      setError(extractErrorMessage(err) || "Failed to fetch shared resources");
    } finally {
      setLoading(false);
    }
  }, [resourceType]);

  useEffect(() => {
    fetchShared();
  }, [fetchShared]);

  return {
    permissions,
    loading,
    error,
    refresh: fetchShared,
  };
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Hook to get sharing status summary for a resource.
 *
 * Intentionally lightweight — only fetches is_public from the resource row.
 * Safe to call from list-item components like ShareButton (single cheap query).
 *
 * Does NOT call get_resource_permissions (the expensive SECURITY DEFINER RPC).
 * Full permission details are loaded inside useSharing() when the modal opens.
 */
export function useSharingStatus(
  resourceType: ResourceType,
  resourceId: string,
  enabled: boolean = true,
) {
  const store = useAppStore();
  const key = sharingStatusKey(resourceType, resourceId);
  const entry = useAppSelector((state) => selectSharingStatus(state, key));

  // Read the record's visibility (once per record per tab, or on purpose).
  const refresh = async () => {
    if (!resourceType || !resourceId || !enabled) return;
    store.dispatch(sharingStatusRequested({ key }));
    try {
      const v = await getResourceVisibility(resourceType, resourceId);
      store.dispatch(sharingStatusLoaded({ key, visibility: v }));
    } catch (err) {
      console.error("Error fetching sharing status:", err);
      store.dispatch(sharingStatusFailed({ key, error: extractErrorMessage(err) }));
    }
  };

  // A mount reads the record's answer from the store; only a record nobody in
  // this tab has read yet is fetched (a woken / remounted view reads nothing).
  const known = entry !== undefined;
  useEffect(() => {
    if (known || !resourceType || !resourceId || !enabled) return;
    // Another view of the same record may have asked a moment ago.
    if (selectSharingStatus(store.getState(), key)) return;
    void refresh();
    // `refresh` is rebuilt per render; the key and the gate decide.
  }, [known, key, enabled]);

  return {
    isPublic: entry?.visibility?.isPublic ?? false,
    loading: entry ? entry.loading : enabled,
    error: entry?.error ?? null,
    refresh,
  };
}
