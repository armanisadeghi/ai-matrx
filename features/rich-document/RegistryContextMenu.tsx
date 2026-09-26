"use client";

// features/rich-document/RegistryContextMenu.tsx
//
// The right-click menu for content. Context-menu v3 renders the ONE registry
// tree itself (buildMenuTree — the same tree, same order as the ⋯ menu, with
// the agent-shortcut libraries folded into its AI submenu); this component
// only hands it the source, the host callbacks and the host's extra actions.
// Used by <RichDocument enableContextMenu/> and by any surface that renders
// its own content (the /chat assistant message).

import * as React from "react";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import "./actions/handlers";
import { useActionSurfaceProvider } from "./runtime/useActionSurfaceProvider";
import type {
  ContentSource,
  RichDocumentAction,
  RichDocumentActionContext,
  RichDocumentActionId,
  RichDocumentActionsProp,
} from "./types";

export interface RegistryContextMenuProps {
  content: string;
  source: ContentSource;
  actions?: RichDocumentActionsProp;
  /** Context-menu-only additions / removals. */
  extra?: RichDocumentAction[];
  exclude?: (RichDocumentActionId | string)[];
  /** Yield to the native menu (e.g. while the content streams). */
  suppressed?: boolean;
  sourceFeature?: React.ComponentProps<typeof NonEditableContextMenu>["sourceFeature"];
  surfaceName?: string;
  /**
   * The surface's declared values (e.g. `conversation_id` for the assistant
   * message surface) — merged into the menu scope so bound agents and
   * shortcuts receive them.
   */
  contextData?: Record<string, unknown>;
  /**
   * Which agent-menu placements show (e.g. `{ "content-block": "hide" }` over
   * a rendered answer, where a block could only be copied, never inserted).
   */
  placementMode?: React.ComponentProps<typeof NonEditableContextMenu>["placementMode"];
  children: React.ReactNode;
}

export function RegistryContextMenu(
  props: RegistryContextMenuProps,
): React.ReactElement {
  const { content, source, actions, extra, exclude, suppressed, children } = props;
  const { ctx } = useActionSurfaceProvider({
    content,
    source,
    actions,
    actionsVariant: "none",
  });
  const excludes = [...(actions?.exclude ?? []), ...(exclude ?? [])];
  return (
    <NonEditableContextMenu
      sourceFeature={props.sourceFeature ?? "documents"}
      surfaceName={props.surfaceName}
      suppressed={suppressed}
      contentSource={source}
      contextData={{ ...props.contextData, content: ctx.content }}
      placementMode={props.placementMode}
      excludedRichActions={excludes}
      richDocCtxExtras={{
        callbacks: actions?.callbacks,
        extensions: actions?.extensions,
        metadata: actions?.metadata ?? null,
        isCreator: actions?.isCreator ?? false,
        surfaceKey: actions?.surfaceKey ?? null,
      }}
      extraRichActions={[...(actions?.extra ?? []), ...(extra ?? [])]}
    >
      {children}
    </NonEditableContextMenu>
  );
}

export default RegistryContextMenu;
