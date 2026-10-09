// features/spaces/editor/applet-frame.tsx — the Applet block's reserved frame: the height a live Applet will fill,
// drawn before it mounts (first paint in static-body, the editor before the block scrolls into view), so nothing
// moves when the Applet arrives. No Applet code here: this file rides the page's first-paint chunk.

import { APPLET_BLOCK_DEFAULT_HEIGHT } from "@/lib/spaces-blocks/types";

/** The stored height, or the default when the block carries none (or a broken one). */
export function appletBlockHeight(p: Record<string, unknown>): number {
  const h = p.height;
  return typeof h === "number" && Number.isFinite(h) && h > 0 ? h : APPLET_BLOCK_DEFAULT_HEIGHT;
}

export function AppletFrame({ height, children }: { height: number; children?: React.ReactNode }) {
  return (
    <div className="spaces-applet-frame" style={{ height }} data-applet-frame="">
      {children}
    </div>
  );
}
