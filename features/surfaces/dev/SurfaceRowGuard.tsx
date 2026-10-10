"use client";

import { useEffect } from "react";
import { installSurfaceRowGuard } from "./surface-row-guard";

/** Dev-only, render-free. Screams in the console when a mounted surface has no ui.ui_surface row. */
export function SurfaceRowGuard(): null {
  useEffect(() => installSurfaceRowGuard(), []);
  return null;
}
