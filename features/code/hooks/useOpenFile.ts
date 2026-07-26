"use client";

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useCodeWorkspace } from "../CodeWorkspaceProvider";
import { openTab } from "../redux/tabsSlice";
import { languageFromFilename } from "../styles/file-icon";
import { getFilePreviewProfile } from "@/features/files";

/**
 * Returns a callback that opens a file from the active filesystem adapter
 * into a new (or existing) editor tab.
 *
 * Branches on the file's preview profile:
 *
 *   - `code` / `text` / `markdown` / `data` / `spreadsheet` → the
 *     text-read path. Bytes are pulled via `readFile()` and dropped into
 *     a Monaco-backed tab. Files like `.bashrc`, `Dockerfile`,
 *     `Makefile`, `authorized_keys`, etc. all flow through here thanks
 *     to the registry's named-file aliases and the dotfile heuristic
 *     fallback.
 *   - `image` / `video` / `audio` / `pdf` → opens a `binary-preview` tab.
 *     The bytes are NOT fetched here; the `BinaryFileViewer` does that
 *     lazily on mount and creates a `blob:` URL it owns. This avoids the
 *     `read failed (400): File is binary, use encoding=base64` error from
 *     the orchestrator and keeps base64 blobs out of Redux.
 *   - `generic` (archives / 3D meshes / sqlite / office docs / unknown) →
 *     also opens as a `binary-preview` tab. The viewer sniffs the bytes
 *     on mount and offers a "View as text" button when the file looks
 *     printable, so even unrecognized text files have a one-click escape
 *     hatch into Monaco.
 */
export function useOpenFile() {
  const dispatch = useAppDispatch();
  const { filesystem } = useCodeWorkspace();

  return useCallback(
    async (path: string) => {
      const name = path.split("/").pop() ?? path;
      const id = `${filesystem.id}:${path}`;
      const profile = getFilePreviewProfile(name, null, null);
      const kind = profile.previewKind;

      // SVG is intentionally NOT in this list even though its category is
      // IMAGE: it's text-shaped XML, so we open it directly in Monaco with
      // the `xml` language for live editing rather than as a static
      // `<img>` preview.
      const isBinary =
        kind === "image" ||
        kind === "video" ||
        kind === "audio" ||
        kind === "pdf" ||
        // `generic` covers archives, 3D meshes, sqlite, office docs, etc.
        // The binary viewer's runtime byte-sniff handles the "we labelled
        // this generic but the bytes are actually text" case.
        kind === "generic";

      if (isBinary) {
        dispatch(
          openTab({
            id,
            path,
            name,
            language: "plaintext",
            content: "",
            pristineContent: "",
            kind: "binary-preview",
            mime: profile.mime,
          }),
        );
        return;
      }

      const content = await filesystem.readFile(path);
      dispatch(
        openTab({
          id,
          path,
          name,
          language: languageFromFilename(name),
          content,
          pristineContent: content,
          kind: "editor",
        }),
      );
    },
    [dispatch, filesystem],
  );
}
