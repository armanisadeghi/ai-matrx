// app/(core)/spaces/layout.tsx — Spaces: Notion-style pages (features/spaces/FEATURE.md).
//
// Sits under the shell header; the Spaces sidebar and page fill the rest of the main column.

import "@blocknote/shadcn/style.css";
import "@/features/spaces/spaces.css";

import { SpacesWorkspace } from "@/features/spaces/workspace/SpacesWorkspace";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/spaces", {
  title: "Spaces",
  description: "Pages, notes and wikis built from blocks.",
  letter: "S",
});

export default function SpacesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="spaces-root relative z-0 h-full overflow-hidden" data-matrx-viewport-surface="" style={{ paddingTop: "var(--shell-header-h)" }}>
      <SpacesWorkspace>{children}</SpacesWorkspace>
    </div>
  );
}
