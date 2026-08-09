import type { Metadata } from "next";
import { ContextMenuNav } from "./_components/ContextMenuNav";
import { getNavPages } from "./_registry";

export const metadata: Metadata = {
  title: "Context Menu — Testing Suite",
  description: "Unified diagnostic + scenario suite for the v3 context menu.",
};

/**
 * Shell for every page under `/ssr/context-menu/*`.
 *
 * Owns:
 *   - The page chrome (full-height column, header nav).
 *   - The nav strip (driven by `_registry.ts`).
 *
 * Each child page is responsible for filling the remaining space and
 * managing its own internal scrolling. Pages should not render their own
 * page-level title bar — the nav strip already identifies which page is
 * active.
 */
export default function ContextMenuLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-textured">
      <ContextMenuNav pages={getNavPages()} />
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
