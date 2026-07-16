/**
 * features/files/hooks/useSharing.ts
 *
 * Ergonomic bundle for the sharing surface of a resource (file or folder):
 *   - Ensures permissions + share links are loaded.
 *   - Exposes live lists.
 *   - Wraps the grant/revoke/create/deactivate thunks with simple callbacks.
 *
 * Callers typically use ShareLinkDialog / PermissionsDialog from core, but
 * programmatic flows (e.g. "quick-share" shortcut) can use this hook.
 */

"use client";

import { useCallback, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectActiveShareLinksForResource,
  selectPermissionsForResource,
  selectShareLinksForResource,
  EMPTY_CLOUD_FILE_PERMISSIONS,
  EMPTY_CLOUD_SHARE_LINKS,
} from "@/features/files/redux/selectors";
import {
  createShareLink as createShareLinkThunk,
  revokeShareLink as revokeShareLinkThunk,
  grantPermission as grantPermissionThunk,
  loadPermissions,
  loadShareLinks,
  revokePermission as revokePermissionThunk,
} from "@/features/files/redux/thunks";
import type {
  CloudFilePermission,
  CloudShareLink,
  CreateShareLinkArg,
  GrantPermissionArg,
  PermissionLevel,
  ResourceType,
  RevokePermissionArg,
} from "@/features/files/types";

export interface UseSharingOptions {
  /** Default false — pass true to skip the auto-load effect. */
  skipAutoLoad?: boolean;
}

export interface UseSharingResult {
  permissions: CloudFilePermission[];
  shareLinks: CloudShareLink[];
  activeShareLinks: CloudShareLink[];
  refresh: () => Promise<void>;
  grantPermission: (
    args: Omit<GrantPermissionArg, "resourceId" | "resourceType">,
  ) => Promise<void>;
  revokePermission: (
    args: Omit<RevokePermissionArg, "resourceId" | "resourceType">,
  ) => Promise<void>;
  createShareLink: (
    args: Omit<CreateShareLinkArg, "resourceId" | "resourceType">,
  ) => Promise<CloudShareLink>;
  revokeShareLink: (linkId: string) => Promise<void>;
  /**
   * Quick-grant shorthand — grants read permission to a single user id.
   * Resolves when the permission list reflects the change.
   */
  quickGrantRead: (userId: string) => Promise<void>;
}

export function useSharing(
  resourceId: string,
  resourceType: ResourceType,
  options: UseSharingOptions = {},
): UseSharingResult {
  const dispatch = useAppDispatch();

  const permissions = useAppSelector((s) =>
    selectPermissionsForResource(s, resourceId),
  );
  const shareLinks = useAppSelector((s) =>
    selectShareLinksForResource(s, resourceId),
  );
  const activeShareLinks = useAppSelector((s) =>
    selectActiveShareLinksForResource(s, resourceId),
  );

  const refresh = useCallback(async () => {
    await Promise.all([
      dispatch(loadPermissions({ resourceId })).unwrap(),
      dispatch(loadShareLinks({ resourceId, resourceType })).unwrap(),
    ]);
  }, [dispatch, resourceId, resourceType]);

  useEffect(() => {
    if (options.skipAutoLoad) return;
    void refresh();
  }, [options.skipAutoLoad, refresh]);

  const grantPermission = useCallback(
    async (args: Omit<GrantPermissionArg, "resourceId" | "resourceType">) => {
      await dispatch(
        grantPermissionThunk({ ...args, resourceId, resourceType }),
      ).unwrap();
    },
    [dispatch, resourceId, resourceType],
  );

  const revokePermission = useCallback(
    async (args: Omit<RevokePermissionArg, "resourceId" | "resourceType">) => {
      await dispatch(
        revokePermissionThunk({ ...args, resourceId, resourceType }),
      ).unwrap();
    },
    [dispatch, resourceId, resourceType],
  );

  const createShareLink = useCallback(
    async (args: Omit<CreateShareLinkArg, "resourceId" | "resourceType">) => {
      return dispatch(
        createShareLinkThunk({ ...args, resourceId, resourceType }),
      ).unwrap();
    },
    [dispatch, resourceId, resourceType],
  );

  const revokeShareLink = useCallback(
    async (linkId: string) => {
      await dispatch(revokeShareLinkThunk({ linkId })).unwrap();
    },
    [dispatch],
  );

  const quickGrantRead = useCallback(
    async (userId: string) => {
      await grantPermission({
        granteeId: userId,
        granteeType: "user",
        level: "read" as PermissionLevel,
      });
    },
    [grantPermission],
  );

  return {
    permissions: permissions ?? EMPTY_CLOUD_FILE_PERMISSIONS,
    shareLinks: shareLinks ?? EMPTY_CLOUD_SHARE_LINKS,
    activeShareLinks,
    refresh,
    grantPermission,
    revokePermission,
    createShareLink,
    revokeShareLink,
    quickGrantRead,
  };
}
