// features/rich-document/variants/shared/runAction.ts
//
// Shared helpers for the menu renderers (desktop dropdown, mobile drawer,
// context menu). Keeps the click-to-run and display-state-resolution logic
// in one place so all three surfaces behave identically.

import type { LucideIcon } from "lucide-react";
import { resolveActionLabel } from "../../actions/utils";
import type {
  RichDocumentAction,
  RichDocumentActionContext,
} from "../../types";

/**
 * Fire an action's handler. Builds a fresh context via getCtx() at click
 * time (so handlers see live content), then runs the handler fire-and-forget
 * — handlers own their toasts/dialogs.
 */
export function runAction(
  action: RichDocumentAction,
  getCtx: () => RichDocumentActionContext,
): void {
  const ctx = getCtx();
  void Promise.resolve(action.run(ctx)).catch((err: unknown) => {
    console.error(`[RichDocument] action ${action.id} threw`, err);
  });
}

export interface ActionDisplay {
  label: string;
  Icon: LucideIcon;
  iconColor?: string;
  isDisabled: boolean;
  disabledReason?: string;
}

/** Resolve an action's label / disabled-state against a context snapshot. */
export function resolveActionDisplay(
  action: RichDocumentAction,
  ctx: RichDocumentActionContext,
): ActionDisplay {
  const disabledResult = action.disabled?.(ctx);
  const isDisabled =
    disabledResult === true ||
    (typeof disabledResult === "object" && disabledResult !== null);
  const disabledReason =
    typeof disabledResult === "object" && disabledResult !== null
      ? disabledResult.reason
      : undefined;
  return {
    label: resolveActionLabel(action.label, ctx),
    Icon: action.icon,
    iconColor: action.iconColor,
    isDisabled,
    disabledReason,
  };
}
