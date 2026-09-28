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

import type { RootState } from "@/lib/redux/store";
import * as React from "react";
import { createClickTarget } from "@ai-matrx/alchemy/actions";
import { useAlchemyActions } from "@ai-matrx/alchemy/react/host";
import { ContextMenuPanel } from "@ai-matrx/alchemy/react/menu";
import { ActionSheet } from "@ai-matrx/alchemy/react/sheet";
import { ActionPalette } from "@ai-matrx/alchemy/react/palette";
import { SOURCE_WRITE_TARGET, richDocumentTargetHost } from "@/features/rich-document/actions/provider";
import { useRichDocumentProvider } from "@/features/rich-document/actions/useRichDocumentProvider";
import { useContextMenuActions } from "../hooks/useContextMenuActions";
import { buildMenuModel } from "../model/menu-model";
import { chatMessageSubject, namedHeader, contextMenuActionsFromModel, menuHeader, modelRevision } from "../alchemy-provider";
import { RegroupBoundary } from "../regroup/RegroupContext";
import type { MenuContentProps } from "../types";

export type AlchemyMenuMode = "context" | "sheet" | "palette";

/**
 * Registry rows that belong to reading or editing text, not to a record: every
 * listen / read-aloud row ("Read aloud selection"), Compare, and Find. A
 * record-actions-only menu (a list row, a folder) leaves them out.
 */
const EDITOR_ONLY_RICH_IDS = new Set([
  "compare-with-clipboard",
  "set-compare-base",
  "compare-with-base",
  "conversation-find",
]);
export function editorOnlyRichActionIds(actions: ReadonlyArray<{ id: string; category?: string }>): string[] {
  return actions.filter((a) => a.category === "listen" || EDITOR_ONLY_RICH_IDS.has(a.id)).map((a) => a.id);
}

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
  // No fold under an invented heading ("More…" was removed, ALC-15 chair ruling 7): a grid's
  // own sections come first by the primary-section law; every other row keeps its own name.
  const model = buildMenuModel(m, menuProps);
  const { registry } = useAlchemyActions();
  useRichDocumentProvider();

  // This menu instance's provider: registered while mounted, reads the latest
  // model through a ref (handlers rebind every render).
  const instanceId = React.useId();
  // A library still loading (the first agent fetch) waits for the NEXT model
  // that changes what the menu draws, instead of vanishing (ALC-15 round 2).
  const waitersRef = React.useRef<((next: typeof model) => void)[]>([]);
  const nextModel = () => new Promise<typeof model>((resolve) => waitersRef.current.push(resolve));
  const actionsRef = React.useRef(contextMenuActionsFromModel(model, instanceId, { nextModel, editable: Boolean(menuProps.isEditable) }));
  const drawnRef = React.useRef("");
  const drawn = modelRevision(model);
  React.useLayoutEffect(() => {
    actionsRef.current = contextMenuActionsFromModel(model, instanceId, { nextModel, editable: Boolean(menuProps.isEditable) });
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

  // A record-actions-only menu over no record source (a folder: its name is the
  // only text) contributes no document rows — no Copy as, Export, Save to or
  // agent handoff of a folder's name (page-pass /notes, 2026-09-28).
  const hasRichDocument =
    m.registryActions.length > 0 &&
    !(menuProps.recordActionsOnly && m.richDocCtx.source.type === "raw");
  // The source can be written back only when its adapter can save, or the
  // menu itself edits the field. A raw source (a table row's words, rendered
  // text) is read-only by definition — marking it writable put "Open in
  // full-screen editor" on every table row (live 2026-09-27).
  const sourceWritable =
    hasRichDocument &&
    !m.richDocCtx.source.readOnly &&
    (Boolean(m.richDocCtx.sourceAdapter.edit) || Boolean(menuProps.isEditable));
  const makeTarget = (withRich: boolean) =>
    createClickTarget({
      readOnly: hasRichDocument ? !sourceWritable : !menuProps.isEditable,
      writable: sourceWritable ? [SOURCE_WRITE_TARGET] : [],
      // The strip's Copy IS the registry's one-tap copy here — one row, not two.
      excludedActionIds: [
        ...m.excludedRichActionIds,
        ...(hasRichDocument ? ["copy"] : []),
        ...(menuProps.recordActionsOnly ? editorOnlyRichActionIds(m.registryActions) : []),
      ],
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
  const [target] = React.useState(() => makeTarget(true));
  // Re-resolve when what the menu would draw moves (agents finish loading, a
  // toggle flips) — the target object itself stays one per open.
  const revision = drawn;
  // In a field the header names the field ("Body"), never its raw text.
  // The message the menu opened on: its role and time, from the transcript store.
  // Either this menu IS the message's, or it is the transcript's and the
  // right-click resolved the message under the pointer — same subject.
  const chatMessage = chatMessageSubject({
    state: m.richDocCtx.getState() as RootState,
    source: m.richDocCtx.source,
    extensions: m.richDocCtx.extensions,
    contextData: menuProps.contextData,
  });
  // A row (or any target) that NAMES itself wins over the generic header —
  // "Quiz: Unit 2 review", never "Content: <agent context>". A selection
  // still shows itself.
  const { content, contentLabel } =
    namedHeader(menuProps.heading, m.actionText) ?? menuHeader(m.actionText, m.fieldLabel, chatMessage);
  const engine = { revision, content, contentLabel };

  // A pass-through everywhere except under a MenuRegroupContext (the regroup
  // demo): there it reports what resolved and may draw a proposed grouping.
  const close = () => onOpenChange(false);
  if (mode === "sheet") {
    return (
      <RegroupBoundary arrangement={menuProps.menuLayout} close={close}>
        <ActionSheet {...engine} target={target} open={open} onOpenChange={onOpenChange} />
      </RegroupBoundary>
    );
  }
  if (mode === "palette") {
    return (
      <RegroupBoundary arrangement={menuProps.menuLayout} close={close}>
        <ActionPalette {...engine} target={target} open={open} onOpenChange={onOpenChange} />
      </RegroupBoundary>
    );
  }
  return (
    <RegroupBoundary arrangement={menuProps.menuLayout} close={close}>
      <ContextMenuPanel
        {...engine}
        target={target}
        point={point}
        open={open}
        onOpenChange={onOpenChange}
        arrangement={menuProps.menuLayout}
        density={menuProps.menuDensity}
        // A control over a container of the thing (a note tab's "…"): its own
        // rows first, the rest under one "<subject> ▸" (alchemy 0.8.28).
        subjectFold={menuProps.subjectFold}
      />
    </RegroupBoundary>
  );
}
