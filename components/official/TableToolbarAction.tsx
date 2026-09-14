"use client";

import { cloneElement, isValidElement } from "react";

import {
  TapTargetButton,
  TapTargetButtonTransparent,
} from "@ai-matrx/tap-target";
import type { TableToolbarActionProps } from "@ai-matrx/design-system/data-table/host";

type TableToolbarActionWithActiveProps = TableToolbarActionProps & {
  active?: boolean;
};

/** The application implementation of the shared table toolbar action port. */
export function TableToolbarAction({
  ariaLabel,
  tooltip,
  disabled = false,
  busy = false,
  active = false,
  onClick,
  children,
}: TableToolbarActionWithActiveProps) {
  // Pass the icon itself through the tap target. A wrapper leaves the target's
  // 14px `.matrx-tap-icon` class on the nested SVG, despite the wrapper's
  // descendant utility. Text children are pagination labels and stay text.
  const icon = isValidElement<{ className?: string }>(children) &&
    (typeof children.type !== "string" || children.type === "svg")
    ? cloneElement(children, {
      className: `!h-5 !w-5 ${children.props.className ?? ""}`,
    })
    : children;
  return active ? (
    <TapTargetButton
      ariaLabel={ariaLabel}
      tooltip={tooltip ?? ariaLabel}
      disabled={disabled}
      aria-busy={busy || undefined}
      aria-current="page"
      onClick={onClick}
      icon={icon}
    />
  ) : (
    <TapTargetButtonTransparent
      ariaLabel={ariaLabel}
      tooltip={tooltip ?? ariaLabel}
      disabled={disabled}
      aria-busy={busy || undefined}
      onClick={onClick}
      icon={icon}
    />
  );
}
