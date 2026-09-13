"use client";

import { TapTargetButtonTransparent } from "@ai-matrx/tap-target";
import type { TableToolbarActionProps } from "@ai-matrx/design-system/data-table/host";

/** The application implementation of the shared table toolbar action port. */
export function TableToolbarAction({
  ariaLabel,
  tooltip,
  disabled = false,
  busy = false,
  onClick,
  children,
}: TableToolbarActionProps) {
  return (
    <TapTargetButtonTransparent
      ariaLabel={ariaLabel}
      tooltip={tooltip ?? ariaLabel}
      disabled={disabled}
      aria-busy={busy || undefined}
      onClick={onClick}
      icon={children}
    />
  );
}
