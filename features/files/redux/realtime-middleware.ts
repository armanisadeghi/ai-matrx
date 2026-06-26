/**
 * features/files/redux/realtime-middleware.ts
 *
 * Bridges Supabase Realtime into Redux.
 *
 * LIFECYCLE
 * ---------
 *   - Dispatch `cloudFilesRealtime/attach` (from
 *     CloudFilesRealtimeProvider on mount with a valid user id). Middleware
 *     opens a channel and subscribes to cld_* table changes.
 *   - Dispatch `cloudFilesRealtime/detach` on logout/unmount. Middleware tears
 *     the channel down.
 *   - On reconnect after error, middleware re-runs the tree RPC via
 *     `reconcileTree` to close any event gap.
 *
 * DEDUP
 * -----
 *   Every REST write registers its `requestId` in
 *   [request-ledger.ts](./request-ledger.ts). Incoming realtime payloads are
 *   checked with `isOwnEcho`. Matches are skipped — the optimistic update
 *   already reflects the change. Non-matches are dispatched normally, so
 *   changes originating from other devices / the server / share-link
 *   visitors always reach our state.
 */

"use client";

import type { Middleware } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { CloudFilesState } from "@/features/files/types";

// Minimal local state type — avoids importing RootState from store.ts which
// imports this middleware, creating a type-level cycle.
type StateWithCloudFiles = { cloudFiles: CloudFilesState };
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";

import {
  dbRowToCloudFile,
  dbRowToCloudFilePermission,
  dbRowToCloudFileVersion,
  dbRowToCloudFolder,
  dbRowToCloudShareLink,
} from "./converters";
import { isOwnEcho, ledgerSize } from "./request-ledger";
import { reconcileTree } from "./thunks";
import { isSystemPath } from "@/features/files/utils/folder-conventions";
import { invalidate as invalidateBlobCache } from "@/features/files/hooks/blob-cache";
import {
  attachChildToFolder,
  clearSelection,
  detachChildFromFolder,
  removeFile,
  removeFolder,
  removeShareLink,
  setRealtimeStatus,
  touchRealtime,
  upsertFile,
  upsertFolder,
  upsertPermissionsForResource,
  upsertShareLinksForResource,
  upsertVersionsForFile,
} from "./slice";
import type {
  CloudFileRow,
  CloudFolderRow,
  CloudFilePermissionRow,
  CloudFileVersionRow,
  CloudShareLinkRow,
} from "@/features/files/types";

// ---------------------------------------------------------------------------
// Action creators — not reducers, just signals consumed by this middleware.
// ---------------------------------------------------------------------------

export const ATTACH_ACTION = "cloudFilesRealtime/attach" as const;
export const DETACH_ACTION = "cloudFilesRealtime/detach" as const;

export function attachCloudFilesRealtime(userId: string) {
  return { type: ATTACH_ACTION, payload: { userId } } as const;
}

export function detachCloudFilesRealtime() {
  return { type: DETACH_ACTION } as const;
}

type AttachAction = ReturnType<typeof attachCloudFilesRealtime>;
type DetachAction = ReturnType<typeof detachCloudFilesRealtime>;
type RealtimeAction = AttachAction | DetachAction;

function isAttachAction(a: unknown): a is AttachAction {
  return (
    typeof a === "object" &&
    a !== null &&
    (a as { type?: unknown }).type === ATTACH_ACTION
  );
}

function isDetachAction(a: unknown): a is DetachAction {
  return (
    typeof a === "object" &&
    a !== null &&
    (a as { type?: unknown }).type === DETACH_ACTION
  );
}

// ---------------------------------------------------------------------------
// Payload helpers
// ---------------------------------------------------------------------------

/**
 * Extract `request_id` from a realtime payload. The Python backend
 * reliably stamps `metadata.request_id` on every cloud_sync write
 * (commit `d647c143`, 2026-05-17).
 */
function extractRequestId(
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
): string | null {
  const row = (payload.new ?? payload.old) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  const meta = row.metadata as Record<string, unknown> | undefined;
  if (meta && typeof meta.request_id === "string") {
    return meta.request_id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// We intentionally leave this middleware loosely typed. Using the store's
// RootState / AppDispatch directly creates a type-level cycle because those
// types are derived from configureStore's middleware list — which includes
// this middleware. Local casts inside the body give us the strong typing
// where it actually matters.
// P1-10: debounce reconcile-on-(re)subscribe. A flapping connection fires
// SUBSCRIBED repeatedly; without this each one re-runs the full-tree RPC and can
// clobber in-flight optimistic edits. We skip a reconcile if one ran within the
// cooldown OR if any mutation is currently in flight (the ledger is non-empty).
const RECONCILE_COOLDOWN_MS = 10_000;
let lastReconcileAt = 0;

export const cloudFilesRealtimeMiddleware: Middleware = (store) => {
  let channel: RealtimeChannel | null = null;
  let subscribedUserId: string | null = null;

  // Local typed dispatcher — the Middleware type is deliberately loose (see
  // note above), so we cast once here to keep the call sites concise.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatch = store.dispatch as (action: any) => any;

  async function teardown(): Promise<void> {
    if (channel) {
      try {
        await supabase.removeChannel(channel);
      } catch {
        /* noop */
      }
      channel = null;
    }
    subscribedUserId = null;
    dispatch(setRealtimeStatus({ status: "detached", userId: null }));
  }

  async function setup(userId: string): Promise<void> {
    if (subscribedUserId === userId && channel) return;
    await teardown();

    subscribedUserId = userId;
    dispatch(setRealtimeStatus({ status: "connecting", userId }));

    channel = supabase
      .channel(`cloud-files:${userId}`)
      // Files — NO owner filter. We rely on Realtime RLS authorization (same
      // pattern as cld_file_versions / cld_share_links below) so the user
      // receives changes to every file they can SELECT: their own AND files
      // shared WITH them. A column filter on owner_id would silently drop
      // shared-with-me updates (the row's owner_id is someone else's id).
      // handleFilePayload upserts/dedups by id and honors the request ledger,
      // so receiving a shared file's change is safe and idempotent.
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cld_files",
        },
        (payload) => handleFilePayload(payload),
      )
      // Folders — NO owner filter, same RLS-bounded rationale as files.
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cld_folders",
        },
        (payload) => handleFolderPayload(payload),
      )
      // Versions — no owner filter (FK to cld_files; RLS enforces).
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cld_file_versions",
        },
        (payload) => handleVersionPayload(payload),
      )
      // Permissions — canonical grant store `public.permissions`. Filtered to
      // grants made TO this user; the handler additionally guards
      // `resource_type === 'file'` since this table holds grants for every
      // resource type. (org-grant rows have no granted_to_user_id, so they
      // won't arrive on this channel — the share panel reload picks them up.)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "permissions",
          filter: `granted_to_user_id=eq.${userId}`,
        },
        (payload) => handlePermissionPayload(payload),
      )
      // Share links — no filter; RLS enforces.
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cld_share_links",
        },
        (payload) => handleShareLinkPayload(payload),
      )
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          dispatch(
            setRealtimeStatus({
              status: "subscribed",
              userId: subscribedUserId,
            }),
          );
          // On (re)subscribe, reconcile — but debounced (P1-10): skip if we
          // reconciled recently or a mutation is in flight, so a flapping
          // connection can't storm the RPC or revert optimistic edits.
          const now = Date.now();
          if (now - lastReconcileAt >= RECONCILE_COOLDOWN_MS && ledgerSize() === 0) {
            lastReconcileAt = now;
            void dispatch(reconcileTree({ userId }));
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          dispatch(
            setRealtimeStatus({
              status: "errored",
              userId: subscribedUserId,
              error: error?.message ?? status,
            }),
          );
        } else if (status === "CLOSED") {
          dispatch(
            setRealtimeStatus({
              status: "closed",
              userId: subscribedUserId,
            }),
          );
        }
      });
  }

  // -------------------------------------------------------------------------
  // Payload handlers
  // -------------------------------------------------------------------------

  function handleFilePayload(
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ): void {
    dispatch(touchRealtime());
    const requestId = extractRequestId(payload);
    const rowId =
      (payload.new as { id?: string } | undefined)?.id ??
      (payload.old as { id?: string } | undefined)?.id ??
      null;
    if (
      isOwnEcho({
        requestId,
        resourceId: rowId,
        resourceType: "file",
      })
    ) {
      return;
    }

    if (payload.eventType === "DELETE") {
      if (rowId) {
        dispatch(removeFile({ id: rowId }));
        dispatch(clearSelection());
      }
      return;
    }

    const newRow = payload.new as unknown as CloudFileRow;
    if (!newRow?.id) return;
    // Drop backend-owned variant rows. The backfill cascade was cleaned
    // up server-side on 2026-05-16 (migrations 012/013) and all live
    // variant rows now carry `parent_file_id` + `derivation_kind`, but
    // realtime payloads still arrive for new variant writes — we filter
    // at the boundary so they never appear in the user tree.
    // See `isSystemPath` + from_python/UPDATES.md §9 (2026-05-16 entry).
    if (isSystemPath(newRow.file_path)) return;
    const file = dbRowToCloudFile(newRow);
    const oldParent =
      (payload.old as { parent_folder_id?: string | null } | undefined)
        ?.parent_folder_id ?? null;

    dispatch(upsertFile(file));

    if (file.deletedAt) {
      dispatch(removeFile({ id: file.id }));
      return;
    }

    if (payload.eventType === "INSERT") {
      dispatch(
        attachChildToFolder({
          parentFolderId: file.parentFolderId,
          kind: "file",
          id: file.id,
        }),
      );
    } else if (payload.eventType === "UPDATE") {
      if (oldParent !== file.parentFolderId) {
        dispatch(
          detachChildFromFolder({
            parentFolderId: oldParent,
            kind: "file",
            id: file.id,
          }),
        );
        dispatch(
          attachChildToFolder({
            parentFolderId: file.parentFolderId,
            kind: "file",
            id: file.id,
          }),
        );
      }
    }
  }

  function handleFolderPayload(
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ): void {
    dispatch(touchRealtime());
    const requestId = extractRequestId(payload);
    const rowId =
      (payload.new as { id?: string } | undefined)?.id ??
      (payload.old as { id?: string } | undefined)?.id ??
      null;
    if (
      isOwnEcho({
        requestId,
        resourceId: rowId,
        resourceType: "folder",
      })
    ) {
      return;
    }

    if (payload.eventType === "DELETE") {
      if (rowId) dispatch(removeFolder({ id: rowId }));
      return;
    }

    const newRow = payload.new as unknown as CloudFolderRow;
    if (!newRow?.id) return;
    // Same system-path guard as the file handler — the backfill also
    // creates per-source-file folders under `system-files/variants/<id>/`.
    if (isSystemPath(newRow.folder_path)) return;
    const folder = dbRowToCloudFolder(newRow);
    const oldParent =
      (payload.old as { parent_id?: string | null } | undefined)?.parent_id ??
      null;

    dispatch(upsertFolder(folder));

    if (folder.deletedAt) {
      dispatch(removeFolder({ id: folder.id }));
      return;
    }

    if (payload.eventType === "INSERT") {
      dispatch(
        attachChildToFolder({
          parentFolderId: folder.parentId,
          kind: "folder",
          id: folder.id,
        }),
      );
    } else if (
      payload.eventType === "UPDATE" &&
      oldParent !== folder.parentId
    ) {
      dispatch(
        detachChildFromFolder({
          parentFolderId: oldParent,
          kind: "folder",
          id: folder.id,
        }),
      );
      dispatch(
        attachChildToFolder({
          parentFolderId: folder.parentId,
          kind: "folder",
          id: folder.id,
        }),
      );
    }
  }

  function handleVersionPayload(
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ): void {
    dispatch(touchRealtime());
    const newRow = payload.new as unknown as CloudFileVersionRow | undefined;
    const oldRow = payload.old as unknown as CloudFileVersionRow | undefined;
    const fileId = newRow?.file_id ?? oldRow?.file_id;
    if (!fileId) return;

    // For a single event we'd merge into the existing array. Simpler: refetch
    // the list for this file. Cheap query, and keeps order / counts correct.
    const state = store.getState() as StateWithCloudFiles;
    const existing = state.cloudFiles.versionsByFileId[fileId] ?? [];

    if (payload.eventType === "DELETE") {
      const deletedId = oldRow?.id;
      if (!deletedId) return;
      dispatch(
        upsertVersionsForFile({
          fileId,
          versions: existing.filter((v) => v.id !== deletedId),
        }),
      );
      return;
    }

    if (!newRow?.id) return;
    const converted = dbRowToCloudFileVersion(newRow);
    const next = [
      converted,
      ...existing.filter((v) => v.id !== converted.id),
    ].sort((a, b) => b.versionNumber - a.versionNumber);
    dispatch(upsertVersionsForFile({ fileId, versions: next }));

    // Cross-device invalidation: if another session uploaded a new
    // version of this file, the bytes in our local blob cache are now
    // stale. Drop the cached entry so the next preview open re-fetches
    // the latest version. (We can't tell from the row alone whether
    // this version is the new "current" — but it's safer to drop on
    // any version-row insert than to keep showing old bytes.)
    void invalidateBlobCache(fileId);
  }

  function handlePermissionPayload(
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ): void {
    dispatch(touchRealtime());
    const newRow = payload.new as unknown as CloudFilePermissionRow | undefined;
    const oldRow = payload.old as unknown as CloudFilePermissionRow | undefined;
    // `public.permissions` holds grants for every resource type; only react to
    // file grants. (DELETE payloads may only carry the replica-identity cols —
    // if resource_type is absent we fall through on resourceId presence.)
    const resourceType = newRow?.resource_type ?? oldRow?.resource_type;
    if (resourceType && resourceType !== "file") return;
    const resourceId = newRow?.resource_id ?? oldRow?.resource_id;
    if (!resourceId) return;

    const state = store.getState() as StateWithCloudFiles;
    const existing = state.cloudFiles.permissionsByResourceId[resourceId] ?? [];

    if (payload.eventType === "DELETE") {
      const deletedId = oldRow?.id;
      if (!deletedId) return;
      dispatch(
        upsertPermissionsForResource({
          resourceId,
          permissions: existing.filter((p) => p.id !== deletedId),
        }),
      );
      return;
    }

    if (!newRow?.id) return;
    const converted = dbRowToCloudFilePermission(newRow);
    const next = [converted, ...existing.filter((p) => p.id !== converted.id)];
    dispatch(upsertPermissionsForResource({ resourceId, permissions: next }));
  }

  function handleShareLinkPayload(
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ): void {
    dispatch(touchRealtime());
    const newRow = payload.new as unknown as CloudShareLinkRow | undefined;
    const oldRow = payload.old as unknown as CloudShareLinkRow | undefined;
    const resourceId = newRow?.resource_id ?? oldRow?.resource_id;
    if (!resourceId) return;

    const state = store.getState() as StateWithCloudFiles;
    const existing = state.cloudFiles.shareLinksByResourceId[resourceId] ?? [];

    if (payload.eventType === "DELETE") {
      const deletedToken = oldRow?.share_token;
      if (deletedToken) {
        dispatch(removeShareLink({ shareToken: deletedToken }));
      }
      return;
    }

    if (!newRow?.id) return;
    const converted = dbRowToCloudShareLink(newRow);
    const next = [converted, ...existing.filter((l) => l.id !== converted.id)];
    dispatch(upsertShareLinksForResource({ resourceId, shareLinks: next }));
  }

  // -------------------------------------------------------------------------
  // Middleware dispatcher
  // -------------------------------------------------------------------------

  return (next) => (action) => {
    if (isAttachAction(action as RealtimeAction)) {
      const userId = (action as AttachAction).payload.userId;
      void setup(userId);
      return next(action);
    }
    if (isDetachAction(action as RealtimeAction)) {
      void teardown();
      return next(action);
    }
    return next(action);
  };
};
