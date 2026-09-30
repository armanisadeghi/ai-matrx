// app/(core)/compare/old/layout.tsx
//
// Review-only home of the old Knowledge pages retired into the hub (H6a/H6b),
// restored 2026-09-29 so Arman can compare them with the new pages. Not linked
// from any navigation and never indexed. The live addresses keep redirecting
// to the new pages. Teardown: delete app/(core)/compare/old/* once Arman
// confirms (common-docs projects/knowledge-system/KNOWLEDGE-HUB.md STATE).

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Old pages (comparison)",
  robots: { index: false, follow: false },
};

export default function CompareOldLayout({ children }: { children: React.ReactNode }) {
  return children;
}
