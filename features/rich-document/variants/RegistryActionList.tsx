"use client";

// features/rich-document/variants/RegistryActionList.tsx
//
// The ONE action registry as a compact inline list — for a host that already
// owns its popover (ProTextarea's "…" menu). Same MENU_STRUCTURE tree as the
// dropdown, the drawer, the chat ⋯ menu and the right-click menu: promoted rows
// first, then each family as an expandable row. A text field and a rendered
// document therefore offer the same actions from the same registry.

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActionSurfaceProvider } from "../runtime/useActionSurfaceProvider";
import { buildMenuTree } from "./shared/menuStructure";
import { resolveActionDisplay, runAction } from "./shared/runAction";
import { menuActions } from "./RegistryActionMenu";
import type {
  ContentSource,
  RichDocumentAction,
  RichDocumentActionContext,
  RichDocumentActionsProp,
} from "../types";

export interface RegistryActionListProps {
  content: string;
  source: ContentSource;
  actions?: RichDocumentActionsProp;
  /** Called after a row runs (the host closes its popover). */
  onClose: () => void;
  className?: string;
}

const ROW =
  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50";

export function RegistryActionList(
  props: RegistryActionListProps,
): React.ReactElement | null {
  const { content, source, actions, onClose, className } = props;
  const { ctx, getCtx, resolvedActions } = useActionSurfaceProvider({
    content,
    source,
    actions,
    actionsVariant: "none",
  });
  const [openGroup, setOpenGroup] = React.useState<string | null>(null);
  const getListCtx = (): RichDocumentActionContext => ({
    ...getCtx(),
    onClose,
  });

  // A text field's own AI powers lead the list (they are its reason for the
  // menu); everything else follows the shared tree.
  const listed = menuActions(resolvedActions);
  const promoted = listed.filter((a) => a.category === "ai");
  const tree = buildMenuTree(listed.filter((a) => a.category !== "ai"));
  if (
    promoted.length === 0 &&
    tree.topLevel.length === 0 &&
    tree.submenus.length === 0 &&
    tree.extras.length === 0
  ) {
    return null;
  }

  const row = (action: RichDocumentAction, nested = false) => {
    const display = resolveActionDisplay(action, ctx);
    const Icon = display.Icon;
    return (
      <button
        key={action.id}
        type="button"
        disabled={display.isDisabled}
        title={display.disabledReason}
        onClick={() => {
          runAction(action, getListCtx);
          // A text field's own AI powers open their view INSIDE the host's
          // popover — keep it open for those; everything else closes it.
          if (action.category !== "ai") onClose();
        }}
        className={cn(ROW, nested && "pl-7")}
      >
        <Icon className={cn("h-4 w-4 shrink-0", display.iconColor)} />
        <span className="truncate">{display.label}</span>
      </button>
    );
  };

  return (
    <div className={cn("flex flex-col", className)}>
      {promoted.map((a) => row(a))}
      {tree.topLevel.map((a) => row(a))}
      {tree.submenus.map((submenu) => {
        const Icon = submenu.icon ?? submenu.actions[0].icon;
        const isOpen = openGroup === submenu.label;
        return (
          <React.Fragment key={submenu.label}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenGroup(isOpen ? null : submenu.label)}
              className={ROW}
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{submenu.label}</span>
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground transition-transform",
                  isOpen && "rotate-90",
                )}
              />
            </button>
            {isOpen ? submenu.actions.map((a) => row(a, true)) : null}
          </React.Fragment>
        );
      })}
      {tree.extras.map((a) => row(a))}
    </div>
  );
}

export default RegistryActionList;
