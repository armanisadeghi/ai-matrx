/**
 * features/files/files-host.ts — THE HOST WIRING for the files engine
 * (`@ai-matrx/media/files/engine`). All behavior lives in the package; this
 * module only hands it this app's supabase client, server client, store,
 * share links, organization chooser and toasts.
 *
 * Imported for its side effect by `lib/redux/store.ts` (before the store is
 * created) and by every `features/files` shim whose engine module reaches the
 * host, so any route that loads one is wired. A host configured first (jest's
 * lazy test host, a private chat store) is kept. Every member is read at CALL time — the
 * module namespaces and getters below keep a test's `jest.mock` of
 * `@/lib/python-client`, `@/utils/supabase/client` or `@/lib/toast` in force.
 */

import {
  configureFilesHost,
  isFilesHostConfigured,
} from "@ai-matrx/media/files/engine/host/configure";
import * as pythonClient from "@/lib/python-client";
import * as supabaseClient from "@/utils/supabase/client";
import * as shareLinks from "@/utils/permissions/shareLinks";
import * as toastModule from "@/lib/toast";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import {
  selectOrganizationId,
  selectProjectId,
  selectTaskId,
} from "@/lib/redux/slices/appContextSlice";
import type { ResourceType } from "@/utils/permissions/registry";
import type { PermissionLevel } from "@/utils/permissions/types";

// org-filter: write-target the files engine files uploads in the organization the person works in
type AppContextState = Parameters<typeof selectOrganizationId>[0];

if (!isFilesHostConfigured()) configureFilesHost({
  get db() {
    return supabaseClient.supabase;
  },
  server: pythonClient,
  store: () => getStoreSingleton(),
  scope: (state) => {
    const s = state as
      | (Partial<AppContextState> & { userAuth?: { id?: string | null } })
      | null
      | undefined;
    // org-filter: write-target the files engine files uploads in the organization the person works in
    const ctx = s?.appContext ? (s as AppContextState) : null;
    return {
      userId: s?.userAuth?.id ?? null,
      // org-filter: write-target the files engine files uploads in the organization the person works in
      organizationId: ctx ? selectOrganizationId(ctx) : null,
      projectId: ctx ? selectProjectId(ctx) : null,
      taskId: ctx ? selectTaskId(ctx) : null,
    };
  },
  ensureOrganizationContext: async (options) => {
    const { ensureOrganizationContext } = await import(
      "@/lib/organization/organization-gate"
    );
    return ensureOrganizationContext(options);
  },
  shareLinks: {
    shareLinkUrl: (token) => shareLinks.shareLinkUrl(token),
    createShareLink: (options) =>
      shareLinks.createShareLink({
        ...options,
        resourceType: options.resourceType as ResourceType,
        permissionLevel: options.permissionLevel as PermissionLevel | undefined,
      }),
    listShareLinks: (resourceType, resourceId) =>
      shareLinks.listShareLinks(resourceType as ResourceType, resourceId),
    revokeShareLink: (linkId) => shareLinks.revokeShareLink(linkId),
  },
  notify: {
    success: (message, options) => toastModule.toast.success(message, options),
    error: (message, options) => toastModule.toast.error(message, options),
  },
});
