"use client";

import { TapTargetButton, TapTargetButtonTransparent } from "@ai-matrx/tap-target";
import type { TableToolbarActionProps } from "@ai-matrx/design-system/data-table/host";

type TableToolbarActionWithActiveProps = TableToolbarActionProps & { active?: boolean };

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
  return (
    active ? (
      <TapTargetButton
        ariaLabel={ariaLabel}
        tooltip={tooltip ?? ariaLabel}
        disabled={disabled}
        aria-busy={busy || undefined}
        aria-current="page"
        onClick={onClick}
        icon={children}
      />
    ) : (
      <TapTargetButtonTransparent
        ariaLabel={ariaLabel}
        tooltip={tooltip ?? ariaLabel}
        disabled={disabled}
        aria-busy={busy || undefined}
        onClick={onClick}
        icon={children}
      />
    )
  );
}
