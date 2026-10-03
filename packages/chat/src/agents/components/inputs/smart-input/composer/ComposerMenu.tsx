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
  useId,
  useRef,
  useState,
  type ComponentType,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Check, ChevronRight } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@ai-matrx/design-system";
import { Switch } from "@host/components/ui/switch";
import { cn } from "@ai-matrx/design-system";

type IconType = ComponentType<{ className?: string }>;

/**
 * ONE MENU, TWO PRESENTATIONS (Arman, 2026-10-03). The same rows render as
 * desktop hover cascades ("popover") or as the phone sheet ("sheet") — the
 * Claude iOS + sheet: inset-grouped iOS-settings rows where a cascade row
 * PUSHES its panel as a page with Back. No phone copy of any menu exists.
 *
 * Sheet grouping needs no wrappers: a divider or a label is a `sheet-gap`, a
 * row is a `sheet-row`; a row after a gap rounds its top, a row before a gap
 * rounds its bottom, and a row after a row draws the hairline.
 */
export type ComposerMenuPresentation = "popover" | "sheet";
export const ComposerMenuPresentationContext =
  createContext<ComposerMenuPresentation>("popover");

export interface ComposerSheetPage {
  title: string;
  render: () => ReactNode;
}
export const ComposerSheetNavContext = createContext<{
  push: (page: ComposerSheetPage) => void;
  pop: () => void;
} | null>(null);

const SHEET_ROW =
  "sheet-row flex w-full min-w-0 shrink-0 items-center gap-3 bg-card px-3 text-left text-base text-foreground transition-colors active:bg-accent first:rounded-t-xl last:rounded-b-xl [.sheet-gap+&]:rounded-t-xl [&:has(+.sheet-gap)]:rounded-b-xl [.sheet-row+&]:border-t [.sheet-row+&]:border-border/60";

/** iOS-settings icon squircle. */
function SheetIcon({ icon: Icon }: { icon: IconType }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
      <Icon className="h-[18px] w-[18px] text-foreground" />
    </span>
  );
}

export function ComposerMenuLabel({ children }: { children: ReactNode }) {
  const presentation = useContext(ComposerMenuPresentationContext);
  if (presentation === "sheet") {
    return (
      <div className="sheet-gap truncate px-3 pb-1.5 pt-5 text-xs font-medium uppercase tracking-wide text-muted-foreground first:pt-0">
        {children}
      </div>
    );
  }
  return (
    <div className="truncate px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

export function ComposerMenuDivider() {
  const presentation = useContext(ComposerMenuPresentationContext);
  if (presentation === "sheet") return <div className="sheet-gap h-6 shrink-0" role="separator" />;
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
  onPointerEnter,
  onPointerLeave,
}: ComposerMenuRowProps & {
  onPointerEnter?: (event: PointerEvent) => void;
  onPointerLeave?: (event: PointerEvent) => void;
}) {
  const level = useContext(ComposerMenuLevelContext);
  const presentation = useContext(ComposerMenuPresentationContext);
  if (presentation === "sheet") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={cn(SHEET_ROW, description ? "min-h-14 py-2" : "min-h-12", "disabled:opacity-50")}
      >
        {Icon ? <SheetIcon icon={Icon} /> : null}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">{label}</span>
          {description ? <span className="truncate text-sm text-muted-foreground">{description}</span> : null}
        </span>
        {badge !== undefined && badge !== null ? (
          <span className="shrink-0 text-base tabular-nums text-muted-foreground">{badge}</span>
        ) : null}
        {detail ? <span className="shrink-0 whitespace-nowrap text-base text-muted-foreground">{detail}</span> : null}
        {checked ? <Check className="h-5 w-5 shrink-0 text-primary" /> : null}
        {chevron ? <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/60" /> : null}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={
        onPointerEnter ??
        ((event) => {
          // A plain row: hovering it closes whatever cascade is open beside it.
          if (event.pointerType === "mouse") level?.request(null);
        })
      }
      onPointerLeave={onPointerLeave ?? (() => level?.cancel())}
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
  const level = useContext(ComposerMenuLevelContext);
  const presentation = useContext(ComposerMenuPresentationContext);
  if (presentation === "sheet") {
    return (
      <label
        className={cn(
          SHEET_ROW,
          "cursor-pointer",
          description ? "min-h-14 py-2" : "min-h-12",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        {Icon ? <SheetIcon icon={Icon} /> : null}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">{label}</span>
          {description ? <span className="truncate text-sm text-muted-foreground">{description}</span> : null}
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
  return (
    <label
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") level?.request(null);
      }}
      onPointerLeave={() => level?.cancel()}
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
 * HOVER OPENS, HOVER MOVES ON (Arman, 2026-10-03: "open on hover and
 * automatically close"). One level of a menu owns which of its cascades is
 * open: hovering a cascade row opens it after a short intent delay, hovering
 * a sibling row switches (or closes) after the same delay, and entering the
 * open panel cancels a pending switch — so a diagonal move toward the panel
 * never closes it. Click still toggles (touch, keyboard).
 */
const HOVER_INTENT_MS = 120;

interface ComposerMenuLevel {
  openId: string | null;
  setOpenId: (id: string | null) => void;
  request: (id: string | null) => void;
  cancel: () => void;
}

const ComposerMenuLevelContext = createContext<ComposerMenuLevel | null>(null);

/** Wrap one menu level (the root menu, or a cascade panel's own rows). */
export function ComposerMenuLevel({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const request = (id: string | null) => {
    cancel();
    timer.current = setTimeout(() => {
      timer.current = null;
      setOpenId(id);
    }, HOVER_INTENT_MS);
  };
  return (
    <ComposerMenuLevelContext.Provider value={{ openId, setOpenId, request, cancel }}>
      {children}
    </ComposerMenuLevelContext.Provider>
  );
}

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
  const id = useId();
  const level = useContext(ComposerMenuLevelContext);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const levelOpen = level ? level.openId === id : uncontrolledOpen;
  const open = controlledOpen ?? levelOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) {
      if (level) level.setOpenId(next ? id : level.openId === id ? null : level.openId);
      else setUncontrolledOpen(next);
    }
    onOpenChange?.(next);
  };
  const close = () => setOpen(false);
  const closeAll = useContext(ComposerMenuCloseAllContext);
  const presentation = useContext(ComposerMenuPresentationContext);
  const sheetNav = useContext(ComposerSheetNavContext);
  if (presentation === "sheet" && sheetNav) {
    // The phone sheet: the cascade's panel becomes a pushed page.
    return (
      <ComposerMenuRow
        {...row}
        chevron
        onClick={() =>
          sheetNav.push({
            title: typeof row.label === "string" ? row.label : "",
            render: () => (typeof children === "function" ? children(sheetNav.pop) : children),
          })
        }
      />
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverAnchor asChild>
        <div>
          <ComposerMenuRow
            {...row}
            chevron
            active={open}
            onClick={() => {
              level?.cancel();
              setOpen(!open);
            }}
            onPointerEnter={(event) => {
              if (event.pointerType !== "mouse" || row.disabled) return;
              if (level && controlledOpen === undefined) level.request(id);
            }}
            onPointerLeave={() => level?.cancel()}
          />
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
        onPointerEnter={() => level?.cancel()}
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
        <ComposerMenuLevel>
          {typeof children === "function" ? children(close) : children}
        </ComposerMenuLevel>
      </PopoverContent>
    </Popover>
  );
}
