"use client";

/**
 * The composer's menu rows — one look for every composer menu (+, agent,
 * output, scope, environment).
 *
 * THE TEXT RULE (brief §2, a fact): a row is ONE line. The label ellipsizes;
 * a shortcut, count, badge, toggle, checkbox, icon or chevron never shrinks
 * and never wraps. A described row has a second single line, also ellipsized.
 * Only a helper paragraph outside any row may wrap.
 *
 * A row with `submenu` opens a cascading panel to its side (a nested Popover,
 * so text inputs inside it — search boxes, URL fields — keep their focus;
 * Radix DropdownMenu's typeahead would swallow the keystrokes).
 */

import {
  createContext,
  useContext,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { Check, ChevronRight } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@ai-matrx/design-system";
import { Switch } from "@host/components/ui/switch";
import { cn } from "@ai-matrx/design-system";

type IconType = ComponentType<{ className?: string }>;

export function ComposerMenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="truncate px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

export function ComposerMenuDivider() {
  return <div className="mx-1 my-1 h-px shrink-0 bg-border" role="separator" />;
}

/** A helper paragraph — the ONLY composer-menu text allowed to wrap. */
export function ComposerMenuHelp({ children }: { children: ReactNode }) {
  return <p className="px-2.5 py-1.5 text-xs leading-snug text-muted-foreground">{children}</p>;
}

interface ComposerMenuRowProps {
  icon?: IconType;
  label: ReactNode;
  /** Second single line, ellipsized. */
  description?: ReactNode;
  /** Muted inline value on the right (`Cloud`, `12.4k tokens`, a shortcut). */
  detail?: ReactNode;
  /** Count / badge chip on the right. */
  badge?: ReactNode;
  checked?: boolean;
  chevron?: boolean;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}

export function ComposerMenuRow({
  icon: Icon,
  label,
  description,
  detail,
  badge,
  checked,
  chevron,
  active,
  disabled,
  title,
  onClick,
}: ComposerMenuRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-expanded={chevron ? Boolean(active) : undefined}
      className={cn(
        "flex w-full min-w-0 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-foreground transition-colors",
        description ? "py-1.5" : "h-9",
        "hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
        active && "bg-accent",
      )}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{label}</span>
        {description ? (
          <span className="truncate text-xs text-muted-foreground">{description}</span>
        ) : null}
      </span>
      {badge !== undefined && badge !== null ? (
        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
          {badge}
        </span>
      ) : null}
      {detail ? <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{detail}</span> : null}
      {checked ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
      {chevron ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
    </button>
  );
}

export function ComposerMenuSwitchRow({
  icon: Icon,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  icon?: IconType;
  label: string;
  description?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex w-full min-w-0 shrink-0 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm text-foreground hover:bg-accent",
        description ? "py-1.5" : "h-9",
        disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
      )}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{label}</span>
        {description ? <span className="truncate text-xs text-muted-foreground">{description}</span> : null}
      </span>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={label}
        className="shrink-0"
      />
    </label>
  );
}

/**
 * Closes the WHOLE composer menu (the root popover) from any cascade depth.
 * Radix hands Escape only to the topmost layer, so without this a person
 * pressed Escape once per open level (PB-01…PB-04 real-test friction,
 * 2026-10-01). The root menu provides it; a cascade outside one closes itself.
 */
const TEXT_FIELD_SELECTOR = [
  'input:not([type]):not([disabled])',
  'input[type="text"]:not([disabled])',
  'input[type="search"]:not([disabled])',
  'input[type="url"]:not([disabled])',
  "textarea:not([disabled])",
].join(",");

/** The first text field inside a cascade panel, if it has one. */
export function firstTextField(root: EventTarget | null): HTMLElement | null {
  if (!(root instanceof HTMLElement)) return null;
  return root.querySelector<HTMLElement>(TEXT_FIELD_SELECTOR);
}

/**
 * THE COMPOSER MENUS OPEN INSTANTLY AND NEVER DISMISS ON THEIR OWN FRAME.
 * Measured 2026-10-01 (PB-01…PB-04 "+ opens only every second click"): the
 * shared popper entrance holds its first keyframe — scale 0.95, 8px off — for
 * ~400 ms while the menu's first render settles, so the content's top rows
 * sit 28px below where they are drawn and the pointer lands on Radix's bare
 * popper wrapper instead. The wrapper is OUTSIDE the dismissable layer, so
 * that click closed the menu it was aimed at. Two halves, both required:
 *   1. the composer menus skip the entrance (a menu is a tool, not a reveal —
 *      macOS and Linear menus appear in the frame they are asked for);
 *   2. a pointer-down on a panel's own popper wrapper is never "outside".
 */
export const COMPOSER_MENU_NO_ENTRANCE =
  "data-[state=open]:[animation:none]!";

export function ignoreOwnWrapper(event: {
  target: EventTarget | null;
  currentTarget: EventTarget | null;
  preventDefault: () => void;
}) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const wrapper = target.closest("[data-radix-popper-content-wrapper]");
  if (wrapper && wrapper.contains(event.currentTarget as Node | null)) {
    event.preventDefault();
  }
}

export const ComposerMenuCloseAllContext = createContext<(() => void) | null>(
  null,
);

/**
 * A row that opens a cascading panel beside the menu. The panel is a nested
 * Popover anchored to the row, so Radix treats it as a child layer: clicking
 * inside it never dismisses the parent menu.
 */
export function ComposerSubmenu({
  row,
  children,
  panelClassName,
  open: controlledOpen,
  onOpenChange,
}: {
  row: Omit<ComposerMenuRowProps, "onClick" | "chevron" | "active">;
  children: ReactNode | ((close: () => void) => ReactNode);
  /** Width/height of the cascade panel (e.g. "w-[360px] h-[440px]"). */
  panelClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const close = () => setOpen(false);
  const closeAll = useContext(ComposerMenuCloseAllContext);
  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverAnchor asChild>
        <div>
          <ComposerMenuRow {...row} chevron active={open} onClick={() => setOpen(!open)} />
        </div>
      </PopoverAnchor>
      <PopoverContent
        /* sizing: fixed — a cascade panel sized by its own host (pickers need a definite height for their scroll chains) */
        side="right"
        align="start"
        sideOffset={6}
        onEscapeKeyDown={() => {
          close();
          closeAll?.();
        }}
        onPointerDownOutside={ignoreOwnWrapper}
        onOpenAutoFocus={(event) => {
          // A cascade that holds a text field (a picker's search, a URL box)
          // focuses THAT field on open, in the same tick Radix would focus the
          // first button. Left to Radix, focus landed on "Back" and the
          // picker's own deferred focus arrived ~0.8 s later behind the list's
          // first render, so the first characters a person typed were lost
          // (PB-04 real-test friction, 2026-10-01).
          const field = firstTextField(event.currentTarget);
          if (!field) return;
          event.preventDefault();
          field.focus({ preventScroll: true });
        }}
        className={cn(
          "flex max-h-[var(--radix-popover-content-available-height)] flex-col overflow-hidden p-1",
          COMPOSER_MENU_NO_ENTRANCE,
          panelClassName ?? "w-72",
        )}
      >
        {typeof children === "function" ? children(close) : children}
      </PopoverContent>
    </Popover>
  );
}
