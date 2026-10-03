"use client";

/**
 * Sample-page kit — the controlled, data-driven versions of the round-2
 * specimens (`../../_components/round2.tsx`), for the three real-page samples.
 *
 * round2's tabs, badge, empty state and loading pieces are fixed specimens
 * (hard-coded items, own state, sample copy), so a page with real rows cannot
 * import them. These keep the SAME geometry and classes — the `uc-*` system
 * from `one-control.tsx`, which every sample mounts through `Scale` — and take
 * their content as props. Nothing here is new design: when the system lands in
 * the package, these and the specimens collapse into it.
 *
 * Read-only by construction: nothing in this kit writes anywhere.
 */

import { type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Scale } from "../../_components/one-control";

/* ------------------------------------------------------------------ */
/* Extra CSS the samples need on top of ONE_CONTROL_CSS                 */
/* ------------------------------------------------------------------ */

const KIT_CSS = `
/* A sample page fills the shell body: the Scale wrapper takes the full height. */
.uc.uc.uc:has(> .uk-page) { height: 100%; --matrx-table-region-gap: 0px; }
/* Quiet row actions: muted glyphs that come up to full ink on row hover. */
.uk-row .uk-quiet svg { color: hsl(var(--muted-foreground)); transition: color 160ms ease; }
.uk-row:hover .uk-quiet svg, .uk-row:focus-within .uk-quiet svg { color: hsl(var(--foreground)); }
.uk-row:hover { background: hsl(var(--accent) / 0.5); }
/* Switch: the visible track is 20px (a 28px switch is 50px wide); the hit
   area is the 28px control box, like every other control. */
.uk-switch { box-sizing: border-box; height: var(--matrx-tap-wide-size); margin-inline: calc(var(--matrx-tap-gap) / 2);
  display: inline-flex; align-items: center; flex-shrink: 0; cursor: pointer; background: transparent; }
.uk-switch-track { position: relative; width: 2.125rem; height: 1.25rem; border-radius: 9999px; background: hsl(var(--muted-foreground) / 0.35); transition: background-color 200ms cubic-bezier(0.22, 1, 0.36, 1); }
.uk-switch[aria-checked="true"] .uk-switch-track { background: hsl(var(--primary)); }
.uk-switch-thumb { position: absolute; top: 2px; left: 2px; width: 1rem; height: 1rem; border-radius: 9999px; background: hsl(var(--background)); box-shadow: 0 1px 2px hsl(var(--foreground) / 0.2); transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1); }
.uk-switch[aria-checked="true"] .uk-switch-thumb { transform: translateX(0.875rem); }
.uk-switch:focus-visible { outline: none; }
.uk-switch:focus-visible .uk-switch-track { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }
.uk-switch:disabled { cursor: default; opacity: 0.5; }
.uk-textarea { box-sizing: border-box; margin-inline: calc(var(--matrx-tap-gap) / 2); width: calc(100% - var(--matrx-tap-gap));
  min-height: 4.5rem; padding: 0.375rem var(--uc-pad-field); border: 1px solid hsl(var(--border)); border-radius: 0.5rem;
  background: hsl(var(--card)); color: hsl(var(--foreground)); font-size: var(--uc-label); line-height: 1.25rem; resize: vertical; }
.uk-textarea:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 1px; }
/* Touch: the painted control stays 28px; an invisible hit area grows it to
   44px vertically. Horizontally it stops at the half-gap, so neighbours never
   steal each other's taps. */
@media (pointer: coarse) {
  .uc-btn, .uc-select, .uc-seg-item, .uk-switch, .uk-tab { position: relative; }
  .uc-btn::after, .uc-select::after, .uc-seg-item::after, .uk-switch::after, .uk-tab::after {
    content: ""; position: absolute; inset: -8px calc(var(--matrx-tap-gap) / -2);
  }
  .uk-textarea { font-size: 16px; }
}
`;

/** Every sample page mounts the 28px system through this. */
export function SampleScale({ children }: { children: ReactNode }) {
  return (
    <Scale scale={28} pad="matched">
      <style dangerouslySetInnerHTML={{ __html: KIT_CSS }} />
      {children}
    </Scale>
  );
}

/* ------------------------------------------------------------------ */
/* Header title for the shell's glass header (text only — no controls)  */
/* ------------------------------------------------------------------ */

export function SampleTitle({ icon: Icon, title, meta }: { icon: LucideIcon; title: string; meta?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate text-[0.8125rem] font-semibold">{title}</span>
      {meta ? <span className="shrink-0 text-[0.6875rem] text-muted-foreground">{meta}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs — underline for sections, capsule for filters                    */
/* ------------------------------------------------------------------ */

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number | null;
}

export function UnderlineTabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex items-end gap-3 overflow-x-auto border-b border-border sm:gap-4", className)}>
      {items.map((i) => (
        <button
          key={i.id}
          type="button"
          role="tab"
          aria-selected={value === i.id}
          onClick={() => onChange(i.id)}
          className={cn(
            "uk-tab -mb-px inline-flex h-8 shrink-0 items-center gap-1 border-b-2 text-[0.8125rem] font-medium",
            value === i.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {i.label}
          {i.count != null ? <span className="text-[0.6875rem] text-muted-foreground">{i.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function CapsuleSeg<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="uc-seg" role="group" aria-label={ariaLabel}>
      {items.map((i) => (
        <button
          key={i.id}
          type="button"
          className="uc-seg-item gap-1"
          data-on={value === i.id ? "" : undefined}
          aria-pressed={value === i.id}
          onClick={() => onChange(i.id)}
        >
          {i.label}
          {i.count != null ? <span className="text-[0.6875rem] text-muted-foreground">{i.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Select — a uc-select trigger over a radio menu                        */
/* ------------------------------------------------------------------ */

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  meta?: string;
}

export function UcSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  width,
  align = "start",
  icon: Icon,
}: {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  width?: string;
  align?: "start" | "end";
  icon?: LucideIcon;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="uc-select" style={width ? { width } : undefined} aria-label={ariaLabel}>
          <span className="flex min-w-0 items-center gap-1.5">
            {Icon ? <Icon aria-hidden /> : null}
            <span className="truncate">{current?.label ?? value}</span>
          </span>
          <ChevronDown aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="max-h-80 min-w-[10rem] overflow-y-auto">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value} className="text-[0.8125rem]">
              <span className="flex-1 truncate">{o.label}</span>
              {o.meta ? <span className="ml-3 text-[0.6875rem] text-muted-foreground">{o.meta}</span> : null}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/* Switch                                                               */
/* ------------------------------------------------------------------ */

export function UcSwitch({
  checked,
  onChange,
  ariaLabel,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className="uk-switch"
      onClick={() => onChange(!checked)}
    >
      <span className="uk-switch-track">
        <span className="uk-switch-thumb" />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Badge — outline, small, token status tints                            */
/* ------------------------------------------------------------------ */

export type Tone = "neutral" | "primary" | "success" | "warning" | "destructive" | "info";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-border text-muted-foreground",
  primary: "border-primary/40 bg-primary/10 text-primary",
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/60 bg-warning/15 text-foreground",
  destructive: "border-destructive/40 bg-destructive/10 text-destructive",
  info: "border-info/40 bg-info/10 text-info",
};

export function ToneBadge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[1.125rem] max-w-full shrink-0 items-center truncate rounded-md border px-1.5 text-[0.6875rem] font-medium",
        TONE_CLASS[tone],
        className,
      )}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state — tinted disc + 13px title + one line + 28px button       */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon: Icon,
  title,
  line,
  action,
}: {
  icon: LucideIcon;
  title: string;
  line: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="text-[0.8125rem] font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{line}</div>
      </div>
      {action ? <div className="uc-row mt-1 justify-center">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Loading — region-shaped skeletons                                     */
/* ------------------------------------------------------------------ */

export function RowSkeletons({ count = 8, twoLine = false }: { count?: number; twoLine?: boolean }) {
  return (
    <div className="divide-y divide-border" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex min-h-9 items-center gap-3 px-3 py-1.5">
          <Skeleton className="size-4 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Skeleton className="h-3.5" style={{ width: `${30 + ((i * 17) % 35)}%` }} />
            {twoLine ? <Skeleton className="h-2.5 w-1/4" /> : null}
          </div>
          <Skeleton className="hidden h-[1.125rem] w-16 rounded-md sm:block" />
          <Skeleton className="size-5 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hairline rows — the one surface for grouped content                   */
/* ------------------------------------------------------------------ */

/** A bordered group of hairline rows (one surface level, 8px radius). */
export function RowGroup({ title, children, className, danger }: { title?: string; children: ReactNode; className?: string; danger?: boolean }) {
  return (
    <section className={cn("flex flex-col gap-1.5", className)}>
      {title ? (
        <h2 className={cn("px-3 text-[0.6875rem] font-medium uppercase tracking-wide", danger ? "text-destructive" : "text-muted-foreground")}>
          {title}
        </h2>
      ) : null}
      <div
        className={cn(
          "divide-y overflow-hidden rounded-lg border bg-card",
          danger ? "divide-destructive/20 border-destructive/40" : "divide-border border-border",
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** One row: 13px label, optional 12px line, control on the right. */
export function SettingRow({ label, line, children, htmlFor }: { label: string; line?: string; children?: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex min-h-9 items-center gap-2 py-1 pl-3 pr-[9px]">
      <div className="min-w-0 flex-1">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="block truncate text-[0.8125rem] font-medium leading-5">
            {label}
          </label>
        ) : (
          <div className="truncate text-[0.8125rem] font-medium leading-5">{label}</div>
        )}
        {line ? <div className="truncate text-xs leading-4 text-muted-foreground">{line}</div> : null}
      </div>
      {children ? <div className="uc-row shrink-0" style={{ flexWrap: "nowrap" }}>{children}</div> : null}
    </div>
  );
}

