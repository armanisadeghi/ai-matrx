"use client";

/**
 * THE inside-view kit — one look for every attach-menu drill-in (Arman,
 * 2026-10-03: the insides match the main menu's big sizing; Back sits beside
 * the search box and there is no title row, which saves a whole row).
 *
 *   <ResourcePickerSubViewHeader onBack search={<PickerSearchField …/>} />
 *   <PickerViewBody> <PickerSectionLabel/> <PickerRow …/> … </PickerViewBody>
 *
 * A view without a search field passes its main field (a URL box) as
 * `search`; only a view with no field at all falls back to `title`.
 * Sizes: rows 36px (44px on touch), text-sm labels, text-xs secondary lines.
 */

import { createContext, forwardRef, useContext, useEffect, type ComponentType, type CSSProperties, type KeyboardEventHandler, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Link2, Loader2, Search, X } from "lucide-react";
import { cn } from "@ai-matrx/design-system";

/**
 * Inside a phone sheet the sheet's own iOS nav bar owns Back (and the title),
 * so a view's header hands its Back to the sheet and draws only its field.
 */
export const PickerBackOverrideContext = createContext<
  ((onBack: (() => void) | null) => void) | null
>(null);

interface ResourcePickerSubViewHeaderProps {
  onBack: () => void;
  /** The view's field (search box, URL box) — sits beside Back. */
  search?: ReactNode;
  /** Shown only when there is no `search` field. */
  title?: string;
  /** Optional leading icon (tinted per module), title mode only. */
  icon?: ReactNode;
  /** Right-aligned controls (view toggles, bulk actions). */
  actions?: ReactNode;
  disabled?: boolean;
}

export function ResourcePickerSubViewHeader({
  onBack,
  search,
  title,
  icon,
  actions,
  disabled,
}: ResourcePickerSubViewHeaderProps) {
  const registerBack = useContext(PickerBackOverrideContext);
  useEffect(() => {
    if (!registerBack) return;
    registerBack(disabled ? () => {} : onBack);
    return () => registerBack(null);
  }, [registerBack, onBack, disabled]);
  if (registerBack) {
    if (!search && !actions) return null;
    return (
      <div className="flex shrink-0 items-center gap-1.5 pb-2">
        {search ? <div className="min-w-0 flex-1">{search}</div> : <div className="flex-1" />}
        {actions}
      </div>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-1.5 border-b border-border p-1.5">
      <button
        type="button"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50 pointer-coarse:h-11 pointer-coarse:w-11"
        onClick={onBack}
        disabled={disabled}
        aria-label="Back"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      {search ? (
        <div className="min-w-0 flex-1">{search}</div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {icon}
          <span className="truncate text-sm font-medium text-foreground">{title}</span>
        </div>
      )}
      {actions}
    </div>
  );
}

/** The search box that sits beside Back. */
export const PickerSearchField = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    loading?: boolean;
    onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
    type?: "text" | "url" | "search";
    disabled?: boolean;
  }
>(function PickerSearchField(
  { value, onChange, placeholder, loading, onKeyDown, type = "text", disabled },
  ref,
) {
  return (
    <div className="relative">
      {loading ? (
        <Loader2 className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        (() => {
          // A link box reads as a link, a search box as a search.
          const Lead = type === "url" ? Link2 : Search;
          return (
            <Lead className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          );
        })()
      )}
      <input
        ref={ref}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        className="h-9 w-full disabled:opacity-60 rounded-lg border border-border bg-muted/40 pl-8 pr-8 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/40 focus:bg-background pointer-coarse:h-11"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear"
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
});

/**
 * A compact dropdown for a view's filter row (file type, sort). Native
 * select for the platform's own picker on phones; our chevron sits inside
 * the box with room to breathe (the native arrow hugged the right edge).
 */
export function PickerSelect<V extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: V;
  onChange: (value: V) => void;
  options: readonly { value: V; label: string }[];
  /** Accessible name. */
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as V)}
        className="h-9 w-full min-w-0 appearance-none truncate rounded-lg border border-border bg-background pl-2.5 pr-8 text-sm text-foreground outline-none focus:border-primary/40 pointer-coarse:h-11"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

/** The scroll area under the header — owns the view's only scroll. */
export function PickerViewBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5", className)}>
      {children}
    </div>
  );
}

/** The outer column every inside view returns (fills its host). */
export function PickerView({ children, className }: { children: ReactNode; className?: string }) {
  // h-full in a definite-height host; the cap holds in a content-sized one.
  return (
    <div className={cn("flex h-full max-h-[min(600px,80dvh)] min-h-0 flex-col", className)}>{children}</div>
  );
}

export function PickerSectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-2 pb-1 pt-2">
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
        {children}
      </span>
      {action}
    </div>
  );
}

/** Empty / no-match line inside a body. */
export function PickerEmpty({ children }: { children: ReactNode }) {
  return <div className="px-3 py-10 text-center text-sm text-muted-foreground">{children}</div>;
}

/**
 * One list row: optional leading icon chip (or any leading node), a one-line
 * label, an optional one-line secondary, optional trailing (count, check,
 * action) and chevron.
 */
export function PickerRow({
  icon: Icon,
  iconClassName,
  leading,
  label,
  secondary,
  trailing,
  chevron,
  selected,
  pressed,
  busy,
  disabled,
  title,
  onClick,
}: {
  icon?: ComponentType<{ className?: string; style?: CSSProperties }>;
  iconClassName?: string;
  leading?: ReactNode;
  label: ReactNode;
  secondary?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  selected?: boolean;
  /** A toggle row (add / remove): announced as pressed / not pressed. */
  pressed?: boolean;
  busy?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={pressed}
      className={cn(
        "group flex w-full min-w-0 items-center gap-2.5 rounded-lg px-1.5 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60",
        secondary ? "min-h-11 py-1.5 pointer-coarse:min-h-14" : "h-9 pointer-coarse:h-11",
        selected && "bg-primary/5",
      )}
    >
      {leading ??
        (Icon ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
            <Icon className={cn("h-4 w-4", iconClassName ?? "text-muted-foreground")} />
          </span>
        ) : null)}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-foreground">{label}</span>
        {secondary ? <span className="truncate text-xs text-muted-foreground">{secondary}</span> : null}
      </span>
      {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : null}
      {trailing}
      {chevron ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground" />
      ) : null}
    </button>
  );
}

/** Shared max height for run-control subviews inside the attach menu shell. */
export const RESOURCE_PICKER_RUN_CONTROL_HEIGHT_CLASS =
  "max-h-[min(480px,68dvh)]";
