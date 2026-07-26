"use client";

/**
 * features/code/editor/CloudFilePreviewer.tsx
 *
 * Renderer for `kind: "cloud-file-preview"` editor tabs.
 *
 * Why this exists:
 *   - The `BinaryFileViewer` reads bytes from the active code-workspace
 *     `FilesystemAdapter` (mock / sandbox / cloud). Cloud files don't
 *     live on a sandbox FS, so a plain `binary-preview` tab can't open
 *     them — `filesystem.download(path)` would 404.
 *   - The cloud-files team already shipped a polished `<FilePreview>`
 *     pipeline (signed URL, blob cache, lazy chunks for PDF / markdown
 *     / code / data). Reusing it gives us identical UX inside the code
 *     workspace and the standalone `/files` page.
 *
 * The Realtime channel for the user's tree is mounted by
 * `CloudFilesExplorer`. We don't double-mount it here — the previewer
 * just reads from `state.cloudFiles` and trusts hydration to be in
 * place by the time the tab opens. If a tab is restored from session
 * storage before hydration completes, `<FilePreview>` shows its own
 * "File not found." fallback until the file appears in the store.
 */

import { FilePreview } from "@/features/files/components/core/FilePreview/FilePreview";
import type { EditorFile } from "../types";

interface CloudFilePreviewerProps {
  tab: EditorFile;
  className?: string;
}

export function CloudFilePreviewer({
  tab,
  className,
}: CloudFilePreviewerProps) {
  if (!tab.cloudFileId) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4 text-sm text-muted-foreground">
        Missing cloud file id for &quot;{tab.name}&quot;.
      </div>
    );
  }

  return (
    <FilePreview
      fileId={tab.cloudFileId}
      className={className ?? "h-full w-full"}
    />
  );
}
