/**
 * Permission Hooks
 *
 * React hooks for working with permissions in components.
 * These hooks provide reactive state management for permissions.
 */

import { useState, useEffect, useCallback } from "react";
import { extractErrorMessage } from "@/utils/errors";
import {
  Permission,
  PermissionWithDetails,
  ResourceType,
  PermissionLevel,
  CheckPermissionOptions,
  PermissionCheckResult,
} from "./types";
import {
  listPermissions,
  getResourcePermissions,
  checkPermission,
  isResourceOwner,
  shareWithUser,
  shareWithOrg,
  makePublic,
  revokeAccess,
  revokeOrgAccess,
  updatePermissionLevel,
  getSharedWithMe,
  getResourceVisibility,
  type ResourceVisibility,
} from "./service";

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
      setError(extractErrorMessage(err) || "Failed to fetch resource permissions");
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
 * Hook to check if current user is owner of a resource
 * @param resourceType Resource type
 * @param resourceId Resource ID
 * @returns Whether user is owner and loading state
 */
export function useIsOwner(resourceType: ResourceType, resourceId: string) {
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      setLoading(true);
      const owner = await isResourceOwner(resourceType, resourceId);
      setIsOwner(owner);
      setLoading(false);
    };

    if (resourceType && resourceId) {
      check();
    }
  }, [resourceType, resourceId]);

  return {
    isOwner,
    loading,
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
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<ResourceVisibility>({
    isPublic: false,
  });
  const { permissions, refresh: refreshPermissions } = usePermissions(
    resourceType,
    resourceId,
    enabled,
  );

  const refreshVisibility = useCallback(async () => {
    if (!resourceType || !resourceId || !enabled) return;
    const v = await getResourceVisibility(resourceType, resourceId);
    setVisibility(v);
  }, [resourceType, resourceId, enabled]);

  const refresh = useCallback(async () => {
    await Promise.all([refreshPermissions(), refreshVisibility()]);
  }, [refreshPermissions, refreshVisibility]);

  useEffect(() => {
    if (enabled) {
      void refreshVisibility();
    }
  }, [enabled, refreshVisibility]);

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
        });

        if (!result.success) {
          setError(result.error || "Failed to share");
          return result;
        }

        await refresh();
        return result;
      } catch (err) {
        const errorMessage = extractErrorMessage(err) || "Failed to share with user";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [resourceType, resourceId, refresh],
  );

  const handleShareWithOrg = useCallback(
    async (organizationId: string, permissionLevel: PermissionLevel) => {
      setLoading(true);
      setError(null);

      try {
        const result = await shareWithOrg({
          resourceType,
          resourceId,
          organizationId,
          permissionLevel,
        });

        if (!result.success) {
          setError(result.error || "Failed to share");
          return result;
        }

        await refresh();
        return result;
      } catch (err) {
        const errorMessage = extractErrorMessage(err) || "Failed to share with organization";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [resourceType, resourceId, refresh],
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
        const errorMessage = extractErrorMessage(err) || "Failed to make public";
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
        const errorMessage = extractErrorMessage(err) || "Failed to revoke access";
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
        const errorMessage = extractErrorMessage(err) || "Failed to revoke org access";
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
        const errorMessage = extractErrorMessage(err) || "Failed to update permission";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [resourceType, resourceId, refresh],
  );

  return {
    permissions,
    isPublic: visibility.isPublic,
    loading,
    error,
    shareWithUser: handleShareWithUser,
    shareWithOrg: handleShareWithOrg,
    makePublic: handleMakePublic,
    revokeAccess: handleRevokeAccess,
    revokeOrgAccess: handleRevokeOrgAccess,
    updateLevel: handleUpdateLevel,
    refresh,
    refreshVisibility,
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
  const [visibility, setVisibility] = useState<ResourceVisibility>({
    isPublic: false,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!resourceType || !resourceId || !enabled) return;
    setLoading(true);
    try {
      const v = await getResourceVisibility(resourceType, resourceId);
      setVisibility(v);
    } finally {
      setLoading(false);
    }
  }, [resourceType, resourceId, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    isPublic: visibility.isPublic,
    loading,
    refresh,
  };
}
