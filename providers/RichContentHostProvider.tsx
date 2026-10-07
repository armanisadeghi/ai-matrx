"use client";
/**
 * Hands @ai-matrx/rich-content the app's host LOADER. The host (providers/richContentHost.ts: the
 * app bindings, the domain blocks, the rich-document registrations — ~630 kB gzip) is NOT in any
 * page's first-load JS: it is one dynamic chunk that starts loading at once, and the engine's entry
 * points (RichContent, MarkdownCore, RichDocument, BasicMarkdownContent, MarkdownStream) suspend on
 * it, showing their source as plain text meanwhile. A CLIENT module on purpose: app/Providers.tsx is
 * a Server Component. NEVER import "./richContentHost" statically — only through the loader below
 * (guarded by providers/__tests__/lazy-host.guard.test.ts).
 */
import type { ReactNode } from "react";
import { configureRichContentHostLoader } from "@ai-matrx/rich-content/host";

configureRichContentHostLoader(() => import("./richContentHost"));

export function RichContentHostProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
