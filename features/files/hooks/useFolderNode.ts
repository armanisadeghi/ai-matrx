/**
 * features/files/hooks/useFolderNode.ts
 *
 * Ergonomic accessor for a single folder record. Mirrors `useFileNode` —
 * returns the domain fields the consumer needs to render a folder header,
 * breadcrumb, or row WITHOUT subscribing to the entire `foldersById` map
 * (the anti-pattern `selectAllFoldersMap` migrations are replacing).
 */

"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectFolderById } from "@/features/files/redux/selectors";
import type { CloudFolderRecord } from "@/features/files/types";

export interface UseFolderNodeResult {
  folder: CloudFolderRecord | undefined;
}

export function useFolderNode(folderId: string | null | undefined): UseFolderNodeResult {
  const folder = useAppSelector((s) =>
    folderId ? selectFolderById(s, folderId) : undefined,
  );
  return { folder };
}
