/**
 * features/files/components/core/RenameDialog/RenameHost.tsx
 *
 * Single mount point for keyboard-triggered renames (F2 etc). Surfaces mount
 * <RenameHost /> once; any caller fires `requestRename(kind, id)` and the
 * shared dialog opens, no prop threading required.
 */

"use client";

import { useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllFilesMap,
  selectAllFoldersMap,
} from "@/features/files/redux/selectors";
import { RenameDialog, type RenameKind } from "./RenameDialog";

const EVENT_NAME = "cloud-files:open-rename";

interface OpenRenameDetail {
  kind: RenameKind;
  id: string;
}

export function requestRename(kind: RenameKind, id: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<OpenRenameDetail>(EVENT_NAME, { detail: { kind, id } }),
  );
}

export function RenameHost({
  presentation = "dialog",
}: {
  presentation?: "dialog" | "drawer";
}) {
  const filesById = useAppSelector(selectAllFilesMap);
  const foldersById = useAppSelector(selectAllFoldersMap);
  const [target, setTarget] = useState<OpenRenameDetail | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<OpenRenameDetail>).detail;
      if (!detail) return;
      setTarget(detail);
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);

  if (!target) return null;
  const currentName =
    target.kind === "file"
      ? filesById[target.id]?.fileName
      : foldersById[target.id]?.folderName;
  if (!currentName) return null;

  return (
    <RenameDialog
      open
      onOpenChange={(open) => {
        if (!open) setTarget(null);
      }}
      kind={target.kind}
      resourceId={target.id}
      currentName={currentName}
      presentation={presentation}
    />
  );
}
