"use client";

import { useCallback } from "react";
import { UniversalContextMenuV2 } from "../UnifiedAgentContextMenu";
import { resolveMarkdownContext } from "./resolveMarkdownContext";

/**
 * MarkdownContextMenuProvider — ONE context menu for an entire markdown
 * surface (e.g. a whole conversation of assistant messages).
 *
 * Why a single instance: `UniversalContextMenuV2` attaches document-level
 * selection/mouse listeners and ~8 Redux subscriptions per mount. Mounting one
 * per message/block — and `MarkdownStream` renders in hundreds of places —
 * would be a real perf regression. Instead this wraps the whole surface once
 * and resolves the per-target context (message / block / tool / content) from
 * cheap DOM attributes (`data-message-id`, `data-mtx-ctx="block"`, …) at
 * right-click time via `resolveContextOnOpen`. Blocks stay free: just tags.
 *
 * Read-only by design — `isEditable=false`, no editing callbacks. Cut/Paste
 * auto-disable; Copy, Compare, AI Actions, Quick Actions all operate on the
 * selection (or the block/message text when nothing is selected).
 */
export interface MarkdownContextMenuProviderProps {
  conversationId: string;
  /**
   * Registered `ui_surface.name` for this surface. Drives surface-aware
   * shortcut filtering (modern matches vs red legacy ones) and launch-time
   * value mappings. Defaults to the assistant-message surface.
   */
  surfaceName?: string;
  children: React.ReactNode;
}

export function MarkdownContextMenuProvider({
  conversationId,
  surfaceName = "matrx-user/assistant-message",
  children,
}: MarkdownContextMenuProviderProps) {
  const resolve = useCallback(
    (target: HTMLElement | null) =>
      resolveMarkdownContext(target, conversationId),
    [conversationId],
  );

  return (
    <UniversalContextMenuV2
      sourceFeature="assistant-message"
      surfaceName={surfaceName}
      isEditable={false}
      enableFloatingIcon={false}
      // Content blocks are insert-into-an-editor items — meaningless on
      // read-only rendered output, so hide that submenu here.
      placementMode={{ "content-block": "hide" }}
      contextData={{ conversationId }}
      resolveContextOnOpen={resolve}
    >
      {children}
    </UniversalContextMenuV2>
  );
}
