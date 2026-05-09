/**
 * features/files/components/surfaces/useFileShortcuts.ts
 *
 * Global keyboard shortcuts for the cloud-files page. Mounts a single
 * `keydown` listener on the window with strict focus-scoping so the
 * handlers don't fire when the user is typing in inputs / dialogs / the
 * preview / context-menus.
 *
 * Shortcuts (matched on activeFileId):
 *   ⌘L / Ctrl+L  → Copy share link
 *   ⌘D / Ctrl+D  → Duplicate (client-side fetch + re-upload)
 *   ⌫ / Delete   → Soft-delete (with confirm)
 *
 * Shortcuts that operate on the multi-selection (regardless of activeFileId):
 *   ⌫ / Delete   → Batch soft-delete the selection
 *
 * The handlers MUST be conservative: this hook lives at PageShell level,
 * so any false positive interrupts user typing in the search box, file
 * preview text, dialogs, etc. We refuse to fire when:
 *   • An input/textarea/contentEditable is focused
 *   • A dialog/alertdialog is open (Radix sets `aria-hidden` on
 *     background; we check `document.querySelector('[role="dialog"]')`)
 *   • The user is mid-IME composition (`event.isComposing`)
 *
 * Browser shortcuts we deliberately preserve:
 *   ⌘D in some browsers = bookmark; we `preventDefault()` only AFTER
 *   confirming we own the file context, so the bookmark is suppressed
 *   only when our handler runs.
 */

"use client";

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  selectActiveFileId,
  selectActiveFolderId,
  selectActiveShareLinksForResource,
  selectAllFilesMap,
  selectAllFoldersMap,
  selectChildrenOfFolder,
  selectSelection,
} from "../../redux/selectors";
import {
  clearSelection,
  setActiveFileId,
  setSelection,
} from "../../redux/slice";
import {
  createShareLink as createShareLinkThunk,
  deleteFile as deleteFileThunk,
  getSignedUrl as getSignedUrlThunk,
  loadShareLinks,
  moveFile as moveFileThunk,
  updateFolder as updateFolderThunk,
  uploadFiles as uploadFilesThunk,
} from "../../redux/thunks";
import { deleteAny, moveAny } from "../../redux/virtual-thunks";
import { requestRename } from "../core/RenameDialog/RenameHost";
import {
  getClipboard,
  setClipboard,
  clearClipboard,
  type ClipboardItem,
} from "@/features/files/utils/clipboard";
import { isSyntheticId } from "@/features/files/virtual-sources/path";
import { pythonShareUrl } from "@/features/file-handler/utils/python-base";

interface PendingDelete {
  kind: "single" | "batch";
  ids: string[];
}

/**
 * Returns a confirm-delete state + a clearer. The PageShell renders an
 * AlertDialog wired to this state so destructive shortcuts don't run
 * silently.
 */
export function useFileShortcuts(): {
  pendingDelete: PendingDelete | null;
  clearPendingDelete: () => void;
  confirmDelete: () => Promise<void>;
} {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const getState = () => store.getState();
  const activeFileId = useAppSelector(selectActiveFileId);
  const activeFolderId = useAppSelector(selectActiveFolderId);
  const selection = useAppSelector(selectSelection);
  const filesById = useAppSelector(selectAllFilesMap);
  const foldersById = useAppSelector(selectAllFoldersMap);
  const activeFolderChildren = useAppSelector((state) =>
    selectChildrenOfFolder(state, activeFolderId ?? ""),
  );

  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // IME composition — never intercept.
      if (e.isComposing) return;

      // Input focus — never intercept (typing in search, dialogs, etc).
      const target = (e.target as HTMLElement | null) ?? null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (target.isContentEditable) return;
      }

      // Open dialog / alert — never intercept (Radix mounts as portal at
      // body level; the trigger of our shortcuts shouldn't undermine an
      // open confirm dialog).
      if (
        typeof document !== "undefined" &&
        document.querySelector('[role="dialog"], [role="alertdialog"]')
      ) {
        return;
      }

      const isMac = /Mac|iPhone|iPad/i.test(navigator.platform);
      const cmdKey = isMac ? e.metaKey : e.ctrlKey;
      const onlyCmd = cmdKey && !e.altKey && !e.shiftKey;

      // ⌘L / Ctrl+L — copy public share URL. Targets, in priority order:
      //   1. The single selected resource (file or folder)
      //   2. The active file (preview pane open)
      //   3. The active folder
      // Files use the direct-bytes route; folders use the listing-page
      // route (you can't `<img src>` a folder). Both produce a persistent
      // share token, reused on subsequent calls.
      if (onlyCmd && e.key.toLowerCase() === "l") {
        const sel = selection.selectedIds;
        let target: { id: string; kind: "file" | "folder" } | null = null;
        if (sel.length === 1) {
          const id = sel[0];
          if (filesById[id]) target = { id, kind: "file" };
          else if (foldersById[id]) target = { id, kind: "folder" };
        }
        if (!target && activeFileId && filesById[activeFileId]) {
          target = { id: activeFileId, kind: "file" };
        }
        if (!target && activeFolderId && foldersById[activeFolderId]) {
          target = { id: activeFolderId, kind: "folder" };
        }
        if (!target) return;
        const record =
          target.kind === "file"
            ? filesById[target.id]
            : foldersById[target.id];
        // Virtual sources have no share-token semantics. Skip.
        if (record?.source.kind === "virtual") return;
        e.preventDefault();
        void (async () => {
          try {
            await dispatch(loadShareLinks({ resourceId: target.id }))
              .unwrap()
              .catch(() => undefined);
            const links = selectActiveShareLinksForResource(
              getState(),
              target.id,
            );
            let token = links.find(
              (l) => l.permissionLevel === "read",
            )?.shareToken;
            if (!token) {
              const link = await dispatch(
                createShareLinkThunk({
                  resourceId: target.id,
                  resourceType: target.kind,
                  permissionLevel: "read",
                }),
              ).unwrap();
              token = link.shareToken;
            }
            const url =
              target.kind === "file"
                ? pythonShareUrl(token)
                : `${window.location.origin}/share/${token}`;
            if (navigator.clipboard) {
              await navigator.clipboard.writeText(url);
            }
          } catch {
            /* swallow — user can fall back to the action menu */
          }
        })();
        return;
      }

      // ⌘D / Ctrl+D — duplicate the active file (client-side fan-out).
      if (onlyCmd && e.key.toLowerCase() === "d") {
        if (!activeFileId) return;
        const file = filesById[activeFileId];
        if (!file) return;
        // Duplicate fetches the current bytes via signed URL — only works
        // for real cloud-files. Skip for virtual rows.
        if (file.source.kind === "virtual") return;
        e.preventDefault();
        void (async () => {
          try {
            const result = await dispatch(
              getSignedUrlThunk({ fileId: activeFileId, expiresIn: 600 }),
            );
            const url = (result as { payload?: { url?: string } } | undefined)
              ?.payload?.url;
            if (!url) return;
            const blob = await fetch(url).then((r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              return r.blob();
            });
            const base = file.fileName;
            const dot = base.lastIndexOf(".");
            const newName =
              dot > 0
                ? `${base.slice(0, dot)} (copy)${base.slice(dot)}`
                : `${base} (copy)`;
            const dupFile = new File([blob], newName, {
              type: file.mimeType ?? blob.type,
            });
            await dispatch(
              uploadFilesThunk({
                files: [dupFile],
                parentFolderId: file.parentFolderId,
                visibility: file.visibility,
              }),
            ).unwrap();
          } catch {
            /* swallow — user can retry via the menu */
          }
        })();
        return;
      }

      // ⌘X / Ctrl+X — cut. Marks the current selection (or the active
      // file/folder) as the clipboard payload with op = "cut". Paste
      // executes a move into the target folder.
      if (onlyCmd && e.key.toLowerCase() === "x") {
        const items = collectClipboardTargets(
          selection.selectedIds,
          activeFileId,
          activeFolderId,
          filesById,
          foldersById,
        );
        if (!items.length) return;
        e.preventDefault();
        setClipboard({ op: "cut", items, setAt: Date.now() });
        return;
      }

      // ⌘C / Ctrl+C — copy. Marks selection with op = "copy". Paste
      // executes duplicate (file: re-upload; folder: not yet supported).
      if (onlyCmd && e.key.toLowerCase() === "c") {
        // Don't intercept when the user actually has a text selection —
        // they're trying to copy text, not files. The DOM Selection
        // object is non-empty when there's selected text in the page.
        const sel = window.getSelection?.();
        if (sel && sel.toString().length > 0) return;
        const items = collectClipboardTargets(
          selection.selectedIds,
          activeFileId,
          activeFolderId,
          filesById,
          foldersById,
        );
        if (!items.length) return;
        e.preventDefault();
        setClipboard({ op: "copy", items, setAt: Date.now() });
        return;
      }

      // ⌘V / Ctrl+V — paste. Move (cut) or duplicate (copy) into the
      // active folder. No-op if the clipboard is empty.
      if (onlyCmd && e.key.toLowerCase() === "v") {
        const cb = getClipboard();
        if (!cb || cb.items.length === 0) return;
        const targetParent = activeFolderId; // null = root
        e.preventDefault();
        void (async () => {
          if (cb.op === "cut") {
            // MOVE — fan out per-item, source-aware. After the move
            // lands, clear the clipboard so subsequent pastes don't
            // re-move the same rows.
            for (const item of cb.items) {
              try {
                if (item.kind === "file") {
                  if (item.source === "virtual" || isSyntheticId(item.id)) {
                    await dispatch(
                      moveAny({ id: item.id, newParentId: targetParent }),
                    ).unwrap();
                  } else {
                    await dispatch(
                      moveFileThunk({
                        fileId: item.id,
                        newParentFolderId: targetParent,
                      }),
                    ).unwrap();
                  }
                } else {
                  // Folder move. Cycle guard: don't move into self or
                  // descendant.
                  if (
                    targetParent !== null &&
                    descendsFrom(targetParent, item.id, foldersById)
                  ) {
                    continue;
                  }
                  if (item.source === "virtual" || isSyntheticId(item.id)) {
                    await dispatch(
                      moveAny({ id: item.id, newParentId: targetParent }),
                    ).unwrap();
                  } else {
                    await dispatch(
                      updateFolderThunk({
                        folderId: item.id,
                        patch: { parentId: targetParent },
                      }),
                    ).unwrap();
                  }
                }
              } catch {
                /* per-item failure tolerable; slice surfaces the error */
              }
            }
            clearClipboard();
            return;
          }

          // COPY — only files duplicate via existing flow. Folders
          // would require a server-side recursive copy that doesn't
          // exist yet; we skip them silently for now.
          for (const item of cb.items) {
            if (item.kind !== "file") continue;
            if (item.source === "virtual" || isSyntheticId(item.id)) continue;
            const file = filesById[item.id];
            if (!file) continue;
            try {
              const result = await dispatch(
                getSignedUrlThunk({ fileId: item.id, expiresIn: 600 }),
              );
              const url = (result as { payload?: { url?: string } } | undefined)
                ?.payload?.url;
              if (!url) continue;
              const blob = await fetch(url).then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.blob();
              });
              const dot = file.fileName.lastIndexOf(".");
              const newName =
                dot > 0
                  ? `${file.fileName.slice(0, dot)} (copy)${file.fileName.slice(dot)}`
                  : `${file.fileName} (copy)`;
              const dupFile = new File([blob], newName, {
                type: file.mimeType ?? blob.type,
              });
              await dispatch(
                uploadFilesThunk({
                  files: [dupFile],
                  parentFolderId: targetParent,
                  visibility: file.visibility,
                }),
              ).unwrap();
            } catch {
              /* swallow */
            }
          }
          // Don't clear after copy — user might paste again.
        })();
        return;
      }

      // ⌘A / Ctrl+A — select every visible file + folder under the active
      // folder. Skipped on subroutes (Trash, Shared, etc.) where activeFolderId
      // isn't set; the user can still ⌘A inside an explicit list later if we
      // expose more entry points.
      if (onlyCmd && e.key.toLowerCase() === "a") {
        const ids = [
          ...activeFolderChildren.folderIds,
          ...activeFolderChildren.fileIds,
        ];
        if (ids.length === 0) return;
        e.preventDefault();
        dispatch(setSelection({ selectedIds: ids, anchorId: ids[0] ?? null }));
        return;
      }

      // F2 — rename. Targets, in priority order:
      //   1. Single-selection file or folder
      //   2. Active file (preview is open)
      //   3. Active folder
      if (e.key === "F2" && !cmdKey && !e.altKey && !e.shiftKey) {
        const sel = selection.selectedIds;
        if (sel.length === 1) {
          const id = sel[0];
          if (filesById[id]) {
            e.preventDefault();
            requestRename("file", id);
            return;
          }
          if (foldersById[id]) {
            e.preventDefault();
            requestRename("folder", id);
            return;
          }
        }
        if (activeFileId && filesById[activeFileId]) {
          e.preventDefault();
          requestRename("file", activeFileId);
          return;
        }
        if (activeFolderId && foldersById[activeFolderId]) {
          e.preventDefault();
          requestRename("folder", activeFolderId);
          return;
        }
      }

      // Delete / Backspace — soft-delete. Prefer batch over single when a
      // multi-selection exists.
      if (e.key === "Delete" || e.key === "Backspace") {
        const selectedFileIds = selection.selectedIds.filter(
          (id) => filesById[id],
        );
        if (selectedFileIds.length > 1) {
          e.preventDefault();
          setPendingDelete({ kind: "batch", ids: selectedFileIds });
          return;
        }
        if (activeFileId && filesById[activeFileId]) {
          e.preventDefault();
          setPendingDelete({ kind: "single", ids: [activeFileId] });
          return;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeFileId,
    activeFolderId,
    activeFolderChildren,
    dispatch,
    filesById,
    foldersById,
    selection.selectedIds,
  ]);

  const clearPendingDelete = () => setPendingDelete(null);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const ids = [...pendingDelete.ids];
    setPendingDelete(null);
    // Use the source-aware deleteAny so virtual files route through their
    // adapter's `delete()` (the unified /v1 thunk picks the right path
    // based on synthetic-id detection).
    const deleteForId = (id: string) =>
      filesById[id]?.source.kind === "virtual"
        ? dispatch(deleteAny({ id }))
        : dispatch(deleteFileThunk({ fileId: id }));
    if (pendingDelete.kind === "single") {
      try {
        await deleteForId(ids[0]).unwrap();
        // If the deleted file was the previewed one, dismiss the pane.
        if (ids[0] === activeFileId) dispatch(setActiveFileId(null));
      } catch {
        /* nothing to do — slice surfaces error state */
      }
      return;
    }
    // Batch — concurrency 4
    let cursor = 0;
    const runners = Array.from(
      { length: Math.min(4, ids.length) },
      async () => {
        while (cursor < ids.length) {
          const i = cursor++;
          try {
            await deleteForId(ids[i]).unwrap();
          } catch {
            /* per-item failure tolerable */
          }
        }
      },
    );
    await Promise.all(runners);
    dispatch(clearSelection());
  };

  return { pendingDelete, clearPendingDelete, confirmDelete };
}

// ---------------------------------------------------------------------------
// Clipboard helpers
// ---------------------------------------------------------------------------

/**
 * Build the clipboard payload for a cut/copy. Priority:
 *   1. The current multi-selection (files + folders mixed).
 *   2. The active file (preview is open).
 *   3. The active folder.
 *
 * Each item is tagged with its kind + source so paste can dispatch
 * through the right thunk without re-reading state.
 */
function collectClipboardTargets(
  selectedIds: string[],
  activeFileId: string | null,
  activeFolderId: string | null,
  filesById: Record<string, { source: { kind: string } }>,
  foldersById: Record<string, { source: { kind: string } }>,
): ClipboardItem[] {
  const fromIds = (ids: string[]): ClipboardItem[] => {
    const items: ClipboardItem[] = [];
    for (const id of ids) {
      if (filesById[id]) {
        items.push({
          id,
          kind: "file",
          source: filesById[id].source.kind === "virtual" ? "virtual" : "real",
        });
      } else if (foldersById[id]) {
        items.push({
          id,
          kind: "folder",
          source:
            foldersById[id].source.kind === "virtual" ? "virtual" : "real",
        });
      }
    }
    return items;
  };

  if (selectedIds.length > 0) return fromIds(selectedIds);
  if (activeFileId) return fromIds([activeFileId]);
  if (activeFolderId) return fromIds([activeFolderId]);
  return [];
}

/**
 * Walk up the folder ancestry from `folderId` to find whether it
 * descends from `ancestorId`. Used to refuse "paste folder into its
 * own descendant" cycles. Cap depth as a safety net against corrupt
 * tree state.
 */
function descendsFrom(
  folderId: string,
  ancestorId: string,
  foldersById: Record<string, { parentId: string | null } | undefined>,
): boolean {
  let cursor: string | null = folderId;
  const seen = new Set<string>();
  let depth = 0;
  while (cursor && !seen.has(cursor) && depth < 64) {
    if (cursor === ancestorId) return true;
    seen.add(cursor);
    cursor = foldersById[cursor]?.parentId ?? null;
    depth += 1;
  }
  return false;
}
