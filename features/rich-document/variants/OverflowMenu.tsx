"use client";

// features/rich-document/variants/OverflowMenu.tsx
//
// The ⋯ overflow dropdown. Shared across the "bar", "mini-bar", "menu",
// and "hover-menu" variants — they differ only in what wraps this and
// where the trigger button is positioned.
//
// Renders all visible actions (default slot = "overflow"; "primary"
// actions also appear here when the parent variant is "menu" / "hover-menu"
// because there's no primary row). Category sections are rendered in the
// order defined by variants/shared/categories.ts.

import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolveActionLabel } from "../actions/utils";
import {
  getCategoryLabel,
  sortCategoriesInDisplayOrder,
} from "./shared/categories";
import type {
  RichDocumentAction,
  RichDocumentActionContext,
  ActionCategory,
} from "../types";

export interface OverflowMenuProps {
  actions: RichDocumentAction[];
  /** Called to get a fresh context at click time. */
  getCtx: () => RichDocumentActionContext;
  /** When true, includes "primary" slot actions too (used by menu/hover variants). */
  includePrimarySlot?: boolean;
  className?: string;
  /** Aria label override for the trigger. */
  triggerAriaLabel?: string;
  /** Trigger button size — defaults to sm. */
  triggerSize?: "default" | "sm" | "icon";
}

/** Group actions by category. Preserves the in-array order within each. */
function groupByCategory(
  actions: RichDocumentAction[],
): Map<ActionCategory, RichDocumentAction[]> {
  const groups = new Map<ActionCategory, RichDocumentAction[]>();
  for (const action of actions) {
    const list = groups.get(action.category) ?? [];
    list.push(action);
    groups.set(action.category, list);
  }
  return groups;
}

export function OverflowMenu(props: OverflowMenuProps): React.ReactElement {
  const {
    actions,
    getCtx,
    includePrimarySlot = false,
    className,
    triggerAriaLabel = "More actions",
    triggerSize = "icon",
  } = props;

  // Filter actions per the consumer's slot intent.
  const menuActions = actions.filter((a) => {
    const slot = a.renderSlot ?? "overflow";
    if (slot === "overflow" || slot === "both") return true;
    if (slot === "primary" && includePrimarySlot) return true;
    return false;
  });

  // Stable context snapshot for rendering labels — handlers always rebuild
  // the context at click time via getCtx().
  const ctxForLabels = getCtx();
  const groups = groupByCategory(menuActions);
  const orderedCategories = sortCategoriesInDisplayOrder([...groups.keys()]);

  // No actions to show? Hide the trigger entirely.
  if (menuActions.length === 0) return <></>;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={triggerSize}
          className={cn("h-8 w-8 p-0", className)}
          aria-label={triggerAriaLabel}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 max-h-[80vh] overflow-y-auto">
        {orderedCategories.map((category, idx) => {
          const items = groups.get(category) ?? [];
          if (items.length === 0) return null;
          return (
            <React.Fragment key={category}>
              {idx > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                {getCategoryLabel(category)}
              </DropdownMenuLabel>
              {items.map((action) => {
                const Icon = action.icon;
                const labelText = resolveActionLabel(action.label, ctxForLabels);
                const disabledResult = action.disabled?.(ctxForLabels);
                const isDisabled =
                  disabledResult === true ||
                  (typeof disabledResult === "object" &&
                    disabledResult !== null);
                return (
                  <DropdownMenuItem
                    key={action.id}
                    disabled={isDisabled}
                    onClick={() => {
                      // Build a fresh context for the actual handler call.
                      const ctx = getCtx();
                      // Fire-and-forget — handlers manage their own
                      // toasts/dialogs.
                      void Promise.resolve(action.run(ctx)).catch(
                        (err: unknown) => {
                           
                          console.error(
                            `[RichDocument] action ${action.id} threw`,
                            err,
                          );
                        },
                      );
                    }}
                  >
                    <Icon
                      className={cn("h-4 w-4 mr-2", action.iconColor)}
                    />
                    <span>{labelText}</span>
                  </DropdownMenuItem>
                );
              })}
            </React.Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default OverflowMenu;
