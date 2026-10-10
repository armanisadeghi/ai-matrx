/**
 * features/files/components/core/FilePreview/PreviewHostToolbar.tsx
 *
 * A host that already draws a row of controls (the tabs, the kind's actions)
 * can hand it to a previewer that draws its own toolbar (the PDF viewer's
 * zoom / page row) so the two share ONE row instead of stacking. The host
 * provides the nodes; `HostPdfViewer` passes them to `PdfPreview`'s
 * `toolbarStart` / `toolbarEnd`. No provider = the previewer draws only its own.
 */

"use client";

import { createContext, useContext } from "react";

export interface PreviewHostToolbar {
  start?: React.ReactNode;
  end?: React.ReactNode;
}

export const PreviewHostToolbarContext =
  createContext<PreviewHostToolbar | null>(null);

export function usePreviewHostToolbar(): PreviewHostToolbar | null {
  return useContext(PreviewHostToolbarContext);
}
