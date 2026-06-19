"use client";

import {
  HomeTapButton,
  PlusTapButton,
  PencilTapButton,
  TrashTapButton,
  LoadingTapButton,
  type TapButtonProps,
} from "@/components/icons/tap-buttons";
import { TapTargetButtonGroup } from "@/components/icons/TapTargetButton";

/**
 * The canonical action vocabulary shared across every scope/context page.
 * Keep this list small and universal — Hub (the level's main/list page),
 * Add (new sibling), Edit (the edit route), Delete (remove current).
 */
export type HeaderActionIcon = "hub" | "add" | "edit" | "delete";

export interface HeaderAction {
  key: string;
  icon: HeaderActionIcon;
  /** ariaLabel + tooltip text. */
  label: string;
  /** Link action — renders the tap button as a Next.js Link. */
  href?: string;
  /** Button action — mutually exclusive with href. */
  onClick?: () => void;
  disabled?: boolean;
  /** Swaps the icon for a spinner and disables the control. */
  busy?: boolean;
  /** Red tint for destructive actions (Delete). */
  danger?: boolean;
}

const ICON_MAP: Record<
  HeaderActionIcon,
  (props: TapButtonProps) => React.ReactNode
> = {
  hub: HomeTapButton,
  add: PlusTapButton,
  edit: PencilTapButton,
  delete: TrashTapButton,
};

/**
 * Unified header action set. Render once in the header-right slot. Renders a
 * glass `TapTargetButtonGroup` of icon-only tap targets — no oversized labeled
 * buttons. Drop empty/falsey entries so callers can build the list inline.
 */
export function HeaderActionGroup({
  actions,
  className,
}: {
  actions: (HeaderAction | false | null | undefined)[];
  className?: string;
}) {
  const items = actions.filter(Boolean) as HeaderAction[];
  if (items.length === 0) return null;

  return (
    <TapTargetButtonGroup className={className}>
      {items.map((action) => {
        const Icon = action.busy ? LoadingTapButton : ICON_MAP[action.icon];
        return (
          <Icon
            key={action.key}
            variant="group"
            ariaLabel={action.label}
            tooltip={action.label}
            href={action.busy ? undefined : action.href}
            onClick={action.busy ? undefined : action.onClick}
            disabled={action.disabled || action.busy}
            className={action.danger ? "text-rose-500" : undefined}
          />
        );
      })}
    </TapTargetButtonGroup>
  );
}
