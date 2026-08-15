"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAppDispatch } from "@/lib/redux/hooks";
import { revealView } from "../redux/codeWorkspaceSlice";
import { useOpenLibraryFile } from "./useOpenLibraryFile";

/**
 * Watches the URL for `?open=<codeFileId>` and opens the referenced library
 * file in Monaco once per change. Intended to be mounted inside the code
 * workspace route so links from chat/HTML preview/other surfaces can navigate
 * directly to a specific saved file.
 *
 * Also flips the side panel to the Library view so the user can see where
 * the file lives after it opens. That uses `revealView`, NOT `setActiveView`:
 * `setActiveView` treats "the view you asked for is already active" as a
 * request to collapse the panel, and `"library"` is the default view — so a
 * fresh `?open=` load was hiding the Library panel it meant to reveal.
 */
export function useOpenCodeFileFromUrl(): void {
  const params = useSearchParams();
  const openLibraryFile = useOpenLibraryFile();
  const dispatch = useAppDispatch();

  const open = params?.get("open") ?? null;

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    openLibraryFile(open)
      .then(() => {
        if (!cancelled) {
          dispatch(revealView("library"));
        }
      })
      .catch((err) => {
        console.error("[useOpenCodeFileFromUrl] failed to open", open, err);
      });
    return () => {
      cancelled = true;
    };
  }, [open, openLibraryFile, dispatch]);
}
