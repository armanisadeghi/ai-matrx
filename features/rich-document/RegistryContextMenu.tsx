"use client";

// features/rich-document/RegistryContextMenu.tsx
//
// The right-click menu for content, drawn from the ONE action registry — the
// same actions the bar and the ⋯ menu offer. Context-menu v3 renders the
// registry's copy / export / save families itself from `contentSource`; every
// OTHER family (edit, study, ask in chat, AI, share, creator, admin, app…) is
// ferried as the "Document" section so nothing the ⋯ menu offers is missing
// on right-click. Used by <RichDocument enableContextMenu/> and by any surface
// that renders its own content (the /chat assistant message).

import * as React from "react";
import { FileText } from "lucide-react";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import type {
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import { resolveActions } from "./actions/registry";
import "./actions/handlers";
import { useActionSurfaceProvider } from "./runtime/useActionSurfaceProvider";
import { buildMenuTree } from "./variants/shared/menuStructure";
import type {
  ContentSource,
  RichDocumentAction,
  RichDocumentActionContext,
  RichDocumentActionId,
  RichDocumentActionsProp,
} from "./types";

/** Families v3 draws from the registry itself (never ferried twice). */
const V3_OWNED = (a: RichDocumentAction) =>
  a.category === "copy" ||
  a.category === "export" ||
  a.category === "save" ||
  // v3 owns the Listen submenu (Speak · Summarize · Summarize & listen).
  a.category === "listen" ||
  a.id === "save-as-file" ||
  // v3 already owns the three Compare verbs.
  a.id === "compare-with-clipboard" ||
  a.id === "set-compare-base" ||
  a.id === "compare-with-base";

/** The registry's non-v3 families as v3 extra-section items. */
export function registryContextMenuSections(
  ctx: RichDocumentActionContext,
  getCtx: () => RichDocumentActionContext,
  options: {
    exclude?: (RichDocumentActionId | string)[];
    extra?: RichDocumentAction[];
  } = {},
): ContextMenuExtraSection[] {
  const rest = resolveActions(ctx, { exclude: options.exclude }).filter(
    (a) => !V3_OWNED(a),
  );
  const actions = [...rest, ...(options.extra ?? [])];
  const toItem = (action: RichDocumentAction): ContextMenuExtraItem => {
    const label =
      typeof action.label === "function" ? action.label(ctx) : action.label;
    const disabledResult = action.disabled?.(ctx);
    return {
      kind: "item",
      id: action.id,
      label,
      icon: action.icon,
      disabled:
        typeof disabledResult === "object" ? true : Boolean(disabledResult),
      onSelect: () => void action.run(getCtx()),
    };
  };
  const tree = buildMenuTree(actions);
  const items: ContextMenuExtraItem[] = [
    ...tree.topLevel.map(toItem),
    ...tree.submenus.map((submenu) => ({
      kind: "submenu" as const,
      id: `rich-doc-${submenu.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      label: submenu.label,
      icon: submenu.icon,
      children: submenu.actions.map(toItem),
    })),
    ...tree.extras.map(toItem),
  ];
  return items.length > 0
    ? [
        {
          id: "rich-doc-extra",
          label: "Document",
          icon: FileText,
          anchor: "after-compare",
          items,
        },
      ]
    : [];
}

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
  const { ctx, getCtx } = useActionSurfaceProvider({
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
      extraSections={registryContextMenuSections(ctx, getCtx, {
        exclude: excludes,
        extra: [...(actions?.extra ?? []), ...(extra ?? [])],
      })}
    >
      {children}
    </NonEditableContextMenu>
  );
}

export default RegistryContextMenu;
