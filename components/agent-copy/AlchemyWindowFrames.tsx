"use client";

/**
 * The WindowPanels for open preparation sessions (PP-01a). Loaded lazily by `AlchemyWindowHost`
 * the first time a window opens, so no window-panel core file enters the boot bundle.
 */

import type { ReactNode } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { alchemyPanelId, type OpenWindow } from "./AlchemyWindowHost";

export default function AlchemyWindowFrames({ windows }: { windows: readonly OpenWindow[] }) {
  return (
    <>
      {windows.map((w) => {
        const size = w.size === undefined || w.size === "full" ? null : w.size;
        return (
          <WindowPanel
            key={w.handle.instanceId}
            id={alchemyPanelId(w.handle.instanceId)}
            title={w.title}
            onClose={() => w.handle.close()}
            width={size ? size.width : "96vw"}
            height={size ? size.height : "92dvh"}
            minWidth={520}
            minHeight={360}
            retainBodyOnMinimize
            bodyClassName="bg-background"
          >
            {w.render(w.handle) as ReactNode}
          </WindowPanel>
        );
      })}
    </>
  );
}
