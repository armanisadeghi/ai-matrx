import type { Metadata } from "next";
import FilesLanding from "@/features/auth/components/module-landing/landings/FilesLanding";

export const metadata: Metadata = {
  title: "Files — AI Matrx",
  description:
    "A real-time synced file system with content search, fine-grained sharing, version history, and first-class integration with chat and agents.",
  openGraph: {
    title: "Files that are actually searchable — AI Matrx",
    description:
      "Content search, sharing, versions, AI-native — the file system your agents already understand.",
    type: "website",
  },
};

/**
 * `/files` is the public-facing marketing surface for the Files module.
 * The sidebar nav routes authenticated users straight to `/files/all`
 * (the workspace's catch-all root), so authed visitors land here only
 * via external links; `AuthedWorkspaceCTA` in `ModuleLanding` gives
 * them a one-tap route to the workspace.
 */
export default function FilesPage() {
  return (
    <div className="h-dvh w-full overflow-y-auto bg-textured">
      <div style={{ height: "var(--shell-header-h, 2.75rem)" }} />
      <FilesLanding />
    </div>
  );
}
