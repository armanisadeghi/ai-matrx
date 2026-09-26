"use client";

// features/context-menu-v3/components/AlchemyMenuContent.tsx
//
// T1 + T1e for the right-click, the floating selection icon, the phone's
// long-press sheet and the action palette — loaded by the shell through
// next/dynamic on first open only (static import is still an eslint error).
//
// It runs the ONE engine hook (`useContextMenuActions` — every handler, the
// single deduped agent fetch) and `buildMenuModel`, hands the result to the
// Alchemy registry as this instance's provider (`alchemy-provider.ts`), and
// renders the PACKAGE layout for the mode: `ContextMenuPanel` (desktop),
// `ActionSheet` (phone), `ActionPalette` (palette). The click target is
// composite, so the rich-document provider contributes the registry rows from
// the same target — the bar, its ⋯ and this menu show one set of actions.

import * as React from "react";
import { createClickTarget } from "@ai-matrx/alchemy/actions";
import { useAlchemyActions } from "@ai-matrx/alchemy/react/host";
import { ContextMenuPanel } from "@ai-matrx/alchemy/react/menu";
import { ActionSheet } from "@ai-matrx/alchemy/react/sheet";
import { ActionPalette } from "@ai-matrx/alchemy/react/palette";
import {
  SOURCE_WRITE_TARGET,
  ensureRichDocumentProvider,
  richDocumentTargetHost,
} from "@/features/rich-document/actions/provider";
import { useContextMenuActions } from "../hooks/useContextMenuActions";
import { buildMenuModel } from "../model/menu-model";
import { contextMenuActionsFromModel, modelRevision } from "../alchemy-provider";
import type { MenuContentProps } from "../types";

export type AlchemyMenuMode = "context" | "sheet" | "palette";

export interface AlchemyMenuContentProps extends Omit<MenuContentProps, "variant"> {
  mode: AlchemyMenuMode;
  /** Viewport point for the desktop menu (pointer, ⋯ button or floating icon). */
  point: { x: number; y: number };
  open: boolean;
  onOpenChange(open: boolean): void;
}

export default function AlchemyMenuContent(props: AlchemyMenuContentProps): React.ReactElement {
  const { mode, point, open, onOpenChange, ...menuProps } = props;
  const m = useContextMenuActions(menuProps);
  const model = buildMenuModel(m, menuProps);
  const { registry } = useAlchemyActions();
  ensureRichDocumentProvider(registry);

  // This menu instance's provider: registered while mounted, reads the latest
  // model through a ref (handlers rebind every render).
  const instanceId = React.useId();
  const actionsRef = React.useRef(contextMenuActionsFromModel(model, instanceId));
  React.useLayoutEffect(() => {
    actionsRef.current = contextMenuActionsFromModel(model, instanceId);
  });
  React.useEffect(
    () =>
      registry.register({
        id: `context-menu:${instanceId}`,
        tier: "T1",
        actions: () => actionsRef.current,
      }),
    [registry, instanceId],
  );

  const hasRichDocument = m.registryActions.length > 0;
  const [target] = React.useState(() =>
    createClickTarget({
      readOnly: hasRichDocument ? Boolean(m.richDocCtx.source.readOnly) : !menuProps.isEditable,
      writable: hasRichDocument && !m.richDocCtx.source.readOnly ? [SOURCE_WRITE_TARGET] : [],
      // The strip's Copy IS the registry's one-tap copy here — one row, not two.
      excludedActionIds: [...(menuProps.excludedRichActions ?? []), ...(hasRichDocument ? ["copy"] : [])],
      organizationId: m.richDocCtx.organizationId,
      auth: {
        authenticated: m.richDocCtx.isAuthenticated,
        admin: m.richDocCtx.isAdmin,
        creator: m.richDocCtx.isCreator,
      },
      selection: menuProps.selectedText
        ? {
            text: menuProps.selectedText,
            type: menuProps.selectionRange?.type ?? "non-editable",
            start: menuProps.selectionRange?.start ?? 0,
            end: menuProps.selectionRange?.end ?? 0,
            handle: menuProps.selectionRange,
          }
        : null,
      payloadKinds: ["markdown"],
      host: {
        contextMenu: { kind: "context-menu", instanceId },
        ...(hasRichDocument
          ? {
              richDocument: richDocumentTargetHost(m.richDocCtx, {
                extra: menuProps.extraRichActions ?? [],
              }),
            }
          : {}),
      },
    }),
  );
  // Re-resolve when what the menu would draw moves (agents finish loading, a
  // toggle flips) — the target object itself stays one per open.
  const revision = modelRevision(model);
  const content = m.actionText.source === "none" ? null : m.actionText.text;
  const engine = { revision, content };

  if (mode === "sheet") {
    return <ActionSheet {...engine} target={target} open={open} onOpenChange={onOpenChange} />;
  }
  if (mode === "palette") {
    return <ActionPalette {...engine} target={target} open={open} onOpenChange={onOpenChange} />;
  }
  return (
    <ContextMenuPanel
      {...engine}
      target={target}
      point={point}
      open={open}
      onOpenChange={onOpenChange}
      arrangement={menuProps.menuLayout}
      density={menuProps.menuDensity}
    />
  );
}
