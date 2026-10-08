"use client";

// features/esign/signature-creator/fonts.ts — the twelve handwriting faces, self-hosted.
//
// Imported ONLY by the lazily loaded creator body, so none of this reaches the signing page's first
// bundle (CONTRACT §14.2). The app loads no fonts through `next/font` anywhere (the Google-font
// replacer is known to fail Turbopack builds — see question-desk/layout.tsx), so the faces come from
// the npm `@fontsource/*` packages: plain @font-face CSS + woff2 files, served from our own origin.
// Latin subset only; a name the face cannot draw falls back to serif italic in `fontStack`.

import "@fontsource/caveat/latin-400.css";
import "@fontsource/dancing-script/latin-400.css";
import "@fontsource/great-vibes/latin-400.css";
import "@fontsource/allura/latin-400.css";
import "@fontsource/alex-brush/latin-400.css";
import "@fontsource/sacramento/latin-400.css";
import "@fontsource/parisienne/latin-400.css";
import "@fontsource/pinyon-script/latin-400.css";
import "@fontsource/homemade-apple/latin-400.css";
import "@fontsource/mrs-saint-delafield/latin-400.css";
import "@fontsource/herr-von-muellerhoff/latin-400.css";
import "@fontsource/la-belle-aurore/latin-400.css";

import type { SignatureStyle } from "./styles";

export function fontStack(style: SignatureStyle): string {
  return `"${style.family}", Georgia, "Times New Roman", serif`;
}

/**
 * Awaits one style's face for `text` (A-R10). Resolves false — never throws — when the face did
 * not arrive in time; callers then draw with the serif fallback, never a blank.
 */
export async function ensureStyleFont(style: SignatureStyle, text: string): Promise<boolean> {
  if (typeof document === "undefined" || !document.fonts) return false;
  try {
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("font timeout")), 5000));
    await Promise.race([document.fonts.load(`64px "${style.family}"`, text || "A"), timeout]);
    return document.fonts.check(`64px "${style.family}"`, text || "A");
  } catch {
    return false;
  }
}
