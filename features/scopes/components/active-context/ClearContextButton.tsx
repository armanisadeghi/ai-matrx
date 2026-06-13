"use client";

// features/scopes/components/active-context/ClearContextButton.tsx
//
// Rose Eraser + "Context" label (title: Clear context). Text-only — no fill.
// ActiveContextButton, in ActiveScopePicker, and in ContextAssignmentField
// active-mode footers (pass onClick when clearing local field state too).

import { Eraser } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { clearContext } from "@/lib/redux/slices/appContextSlice";
import { selectHasActiveContext } from "@/features/scopes/redux/selectors/active-context";
import {
  CLEAR_CONTEXT_ICON_CLASS,
  CLEAR_CONTEXT_LABEL_CLASS,
} from "./clear-context-styles";

export interface ClearContextButtonProps {
  /** "xs" for 20px header rows; "sm" for sidebars/toolbars. */
  size?: "xs" | "sm";
  className?: string;
  /** Override default Redux clear (e.g. reset local field state first). */
  onClick?: () => void;
  /** Fires after clear (e.g. close a popover). */
  onCleared?: () => void;
  /** Hide when appContextSlice has nothing set. Default true. */
  hideWhenEmpty?: boolean;
  /** Force visibility regardless of Redux (field-local selection). */
  visible?: boolean;
}

export function ClearContextButton({
  size = "sm",
  className,
  onClick,
  onCleared,
  hideWhenEmpty = true,
  visible,
}: ClearContextButtonProps) {
  const dispatch = useAppDispatch();
  const hasContext = useAppSelector(selectHasActiveContext);
  const show = visible ?? (hideWhenEmpty ? hasContext : true);

  if (!show) return null;

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (onClick) onClick();
    else dispatch(clearContext());
    onCleared?.();
  }

  const sizeCls =
    size === "xs"
      ? "h-4 gap-0.5 px-1 text-[9px]"
      : "h-5 gap-0.5 px-1.5 text-[10px]";

  const iconCls = size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3";

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Clear context"
      className={cn(
        "group inline-flex shrink-0 items-center rounded-md font-medium transition-colors hover:opacity-80",
        sizeCls,
        className,
      )}
    >
      <Eraser className={cn("shrink-0", iconCls, CLEAR_CONTEXT_ICON_CLASS)} />
      <span className={cn("whitespace-nowrap", CLEAR_CONTEXT_LABEL_CLASS)}>
        Context
      </span>
    </button>
  );
}
