"use client";

/**
 * useEnsureCloudFile — guarantees a single cloud file is present in the
 * files Redux store, fetching it once via the REST contract if it isn't.
 *
 * The files-route action surfaces (FileContextMenu, FileRightClickMenu,
 * FileInfoDialog, useFileActions) all read the file from
 * `selectFileById` — they degrade (hide PDF/info/rename items) when the
 * row is absent. Any surface OUTSIDE the `/files` tree (PDF studio
 * toolbar, chat chips, pickers) that wants the full menu should call this
 * so those menus light up without forcing the whole files tree to load.
 *
 * No-op when the file is already in the store, the id is empty, or the id
 * is synthetic/virtual (those don't go through `/files/{id}`).
 */

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectFileById } from "@/features/files/redux/selectors";
import { upsertFiles } from "@/features/files/redux/slice";
import { apiFileRecordToCloudFile } from "@/features/files/redux/converters";
import { isSyntheticId } from "@/features/files/virtual-sources/path";
import * as Files from "@/features/files/api/files";

export function useEnsureCloudFile(fileId: string | null | undefined): void {
  const dispatch = useAppDispatch();
  const existing = useAppSelector((s) =>
    fileId ? selectFileById(s, fileId) : undefined,
  );

  useEffect(() => {
    if (!fileId || existing || isSyntheticId(fileId)) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await Files.getFile(fileId);
        if (cancelled) return;
        dispatch(upsertFiles([apiFileRecordToCloudFile(data)]));
      } catch {
        // File may be inaccessible (deleted / not owned). The consuming
        // menus degrade gracefully when the row stays absent.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId, existing, dispatch]);
}
