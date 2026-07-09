"use client";

import { registerRenderPreviewer } from "@/features/code/preview/renderPreviewRegistry";
import { HtmlPageRenderPreview } from "./HtmlPageRenderPreview";

/**
 * Side-effect module: registers `HtmlPageRenderPreview` against the
 * `html-page:` library-source prefix. Import once on any surface that hosts
 * `CodeWorkspace` (e.g. `/code`) — re-registration is a no-op.
 */
registerRenderPreviewer("html-page:", HtmlPageRenderPreview);
