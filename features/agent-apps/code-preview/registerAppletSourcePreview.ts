"use client";

import { registerRenderPreviewer } from "@/features/code/preview/renderPreviewRegistry";
import { AppletSourcePreview } from "./AppletSourcePreview";

/** Side-effect module: the `aga-app:` (Applet file) tabs preview through the Applet host. */
registerRenderPreviewer("aga-app:", AppletSourcePreview);
