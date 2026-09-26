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
import { createClickTarget, type Action, type ClickTarget } from "@ai-matrx/alchemy/actions";
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
import { buildMenuModel, foldSiteMenuIntoMore } from "../model/menu-model";
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
  const built = buildMenuModel(m, menuProps);
  // A surface that asks for it (a grid's cell / row / column / table): its own sections flat, the
  // site-wide rows under ONE "More…" at the end (merged-grid review 2026-09-26).
  const foldSite = Boolean(menuProps.extraSections?.some((section) => section.foldSiteMenu));
  const model = foldSite ? foldSiteMenuIntoMore(built) : built;
  const { registry } = useAlchemyActions();
  ensureRichDocumentProvider(registry);

  // This menu instance's provider: registered while mounted, reads the latest
  // model through a ref (handlers rebind every render).
  const instanceId = React.useId();
  // Folded: the rich-document provider's rows (Compare, Copy as, Save to Notes, AI, Read aloud,
  // feedback…) join the same "More…" — read against their own target, never at the top level.
  const richTargetRef = React.useRef<ClickTarget | null>(null);
  const topTargetRef = React.useRef<ClickTarget | null>(null);
  const withSiteMore = (actions: Action[]): Action[] =>
    foldSite
      ? foldRichIntoMore(actions, async () => {
          const rt = richTargetRef.current;
          const top = topTargetRef.current;
          if (!rt || !top) return [];
          // The rows the registry's ONE eligibility pass admits for the rich target, less every row
          // already drawn at the top level: the rich-document rows, read and run against rt.
          const [rich, shown] = await Promise.all([registry.resolve(rt), registry.resolve(top)]);
          const onTop = new Set(shown.map((r) => r.action.id));
          return rich
            .filter((r) => r.eligibility.status === "available" && !onTop.has(r.action.id) && !r.action.id.startsWith("cm"))
            .map((r) => ({ action: r.action, target: rt }));
        })
      : actions;
  // A library still loading (the first agent fetch) waits for the NEXT model
  // that changes what the menu draws, instead of vanishing (ALC-15 round 2).
  const waitersRef = React.useRef<((next: typeof model) => void)[]>([]);
  const nextModel = () => new Promise<typeof model>((resolve) => waitersRef.current.push(resolve));
  const actionsRef = React.useRef(withSiteMore(contextMenuActionsFromModel(model, instanceId, { nextModel })));
  const drawnRef = React.useRef("");
  const drawn = modelRevision(model);
  React.useLayoutEffect(() => {
    actionsRef.current = withSiteMore(contextMenuActionsFromModel(model, instanceId, { nextModel }));
    if (drawnRef.current !== drawn) {
      drawnRef.current = drawn;
      const waiters = waitersRef.current;
      waitersRef.current = [];
      for (const wake of waiters) wake(model);
    }
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
  const makeTarget = (withRich: boolean) =>
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
        ...(hasRichDocument && withRich
          ? {
              richDocument: richDocumentTargetHost(m.richDocCtx, {
                extra: menuProps.extraRichActions ?? [],
              }),
            }
          : {}),
      },
    });
  const [target] = React.useState(() => makeTarget(!foldSite));
  topTargetRef.current = target;
  if (foldSite && hasRichDocument && richTargetRef.current === null) richTargetRef.current = makeTarget(true);
  // Re-resolve when what the menu would draw moves (agents finish loading, a
  // toggle flips) — the target object itself stays one per open.
  const revision = drawn;
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

/**
 * THE RICH-DOCUMENT ROWS UNDER THE SAME "More…" (a folded menu). The "More…" action gains the rows
 * `richRows` answers for this open (already through the registry's eligibility pass), each run and
 * expanded against its own target (the top-level target carries no rich host, so those rows are
 * never drawn beside the surface's own).
 */
export function foldRichIntoMore(
  actions: Action[],
  richRows: () => Promise<Array<{ action: Action; target: ClickTarget }>>,
): Action[] {
  return actions.map((action) => {
    if (action.id !== "cm:site-more") return action;
    const ownExpand = action.expand;
    return {
      ...action,
      expand: async (t: ClickTarget, signal: AbortSignal) => {
        const [own, rich] = await Promise.all([ownExpand?.(t, signal) ?? Promise.resolve([] as readonly Action[]), richRows()]);
        const wrapped: Action[] = rich.map(({ action: row, target: rt }) => ({
          ...row,
          id: `cm-more:${row.id}`,
          eligible: () => ({ status: "available" as const }),
          run: (_t: ClickTarget, context: Parameters<Action["run"]>[1]) => row.run(rt, context),
          ...(row.expand ? { expand: (_t: ClickTarget, sig: AbortSignal) => row.expand!(rt, sig) } : {}),
        }));
        return [...own, ...wrapped];
      },
    };
  });
}
