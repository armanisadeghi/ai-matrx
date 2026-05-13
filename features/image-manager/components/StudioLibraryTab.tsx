"use client";

/**
 * features/image-manager/components/StudioLibraryTab.tsx
 *
 * Read-only embed of the Image Studio "library" — the cloud-files folder
 * `Images/Generated/...` where every Studio save lands. Reuses
 * `<CloudFilesTab>` pre-navigated to that folder so we don't reinvent the
 * navigator and selection UX.
 *
 * The folder id is resolved lazily on mount via `ensureFolderPath` (same
 * thunk the upload tab uses). Until it's resolved we render the root —
 * the user still sees the live cloud tree, they just don't get the
 * pre-scoped view yet.
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Library, Loader2 } from "lucide-react";
import { CloudFolders, fileHandler } from "@/features/files";
import { CloudFilesTab } from "@/components/image/cloud/CloudFilesTab";
import { extractErrorMessage } from "@/utils/errors";

export function StudioLibraryTab() {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResolving(true);
    setResolveError(null);
    fileHandler
      .ensureFolderPath({
        folderPath: CloudFolders.IMAGES_GENERATED,
        visibility: "private",
      })
      .then((id) => {
        if (!cancelled) setFolderId(id);
      })
      .catch((err) => {
        if (!cancelled) setResolveError(extractErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="h-full flex flex-col">
      <header className="border-b border-border px-3 md:px-4 py-2 flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
        <Library className="h-3.5 w-3.5 text-fuchsia-500" />
        <span className="truncate">
          Studio saves under{" "}
          <span className="font-mono text-foreground">
            {CloudFolders.IMAGES_GENERATED}
          </span>
        </span>
        <div className="flex-1" />
        {resolving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : null}
        <Link
          href="/images/library"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 px-2 min-h-[32px] md:h-6 rounded-md text-[11px] font-medium hover:bg-accent hover:text-foreground transition-colors"
          title="Open the full Images library page in a new tab"
        >
          Library
          <ExternalLink className="h-3 w-3 opacity-60" />
        </Link>
      </header>

      {resolveError ? (
        <div className="px-4 py-2 text-xs text-destructive flex-shrink-0">
          Couldn't open the Studio folder ({resolveError}). Showing the root
          of your cloud instead.
        </div>
      ) : null}

      <div className="flex-1 min-h-0">
        {resolving ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-sm">Opening Studio library...</span>
          </div>
        ) : (
          // Re-key on the resolved folderId so the tab's internal state
          // (currentFolderId, query) initializes with the correct folder
          // exactly once.
          <CloudFilesTab
            key={folderId ?? "root"}
            allowFileTypes={["any"]}
            initialFolderId={folderId}
          />
        )}
      </div>
    </div>
  );
}
