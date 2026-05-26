/**
 * app/(a)/files/layout.tsx
 *
 * Server Component shell for /files. Metadata only — the cloud-files realtime
 * subscription is now mounted globally in `app/Providers.tsx` via
 * `<CloudFilesRealtimeProvider />` (Phase 0 of the consolidation rebuild),
 * so every authed page receives file updates without per-route mounts.
 *
 * Obeys app/(a) rules:
 *   - SSR-first.
 *   - No `'use cache'` — user session is cookie-scoped.
 *   - Metadata via createRouteMetadata (shared template).
 */

import type { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/files", {
  title: "Files",
  description:
    "Upload, browse, preview, and share files in a fast, real-time synced file system.",
  additionalMetadata: {
    keywords: [
      "files",
      "cloud files",
      "file manager",
      "upload",
      "share links",
      "preview",
    ],
  },
});

export default function CloudFilesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
