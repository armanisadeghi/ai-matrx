"use client";

// The TRIGGER set — six ways the picker announces itself before it opens,
// from a 22px status-bar segment down to a 14px-wide heat strip. Every one
// renders the FULL selection state (counts or names) without opening
// anything, and none of them ever changes size when the selection changes
// (fixed heights, truncation, capped chip counts).
//
// All triggers are forwardRef <button>s so they slot into Radix
// `PopoverTrigger asChild` — except the tap-target one, which reuses the
// TapTargetButton system (its own geometry; NO external padding, ever).

import React, { forwardRef, useMemo } from "react";
import {
  Building2,
  ChevronDown,
  Filter,
  Layers,
  ListFilter,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TapTargetButtonForGroup,
  TapTargetButtonGroup,
} from "@/components/icons/TapTargetButton";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import {
  isEmptySelection,
  resolveSelection,
  selectionCount,
  summarizeSelection,
  type DenseSelection,
} from "./model";
import type { DenseData } from "./shared";

type TriggerProps = {
  selection: DenseSelection;
  data: DenseData;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

function useResolved(selection: DenseSelection, data: DenseData) {
  return useMemo(
    () =>
      resolveSelection(
        selection,
        data.organizations,
        data.projects,
        data.tasks,
        data.itemsByType,
      ),
    [selection, data],
  );
}

/* ── 1 · Status-bar segment (the VS Code one) ─────────────────────────── */
/** A flat 22px bar segment for app-chrome edges: per-level counts + org dots. */
export const StatusBarTrigger = forwardRef<HTMLButtonElement, TriggerProps>(
  function StatusBarTrigger({ selection, data, className, ...rest }, ref) {
    const resolved = useResolved(selection, data);
    const orgsTouched = useMemo(() => {
      const touched = new Set(resolved.orgs.map((o) => o.id));
      for (const s of resolved.scopes)
        for (const o of data.organizations)
          if (o.scope_types.some((t) => t.scopes.some((x) => x.id === s.id)))
            touched.add(o.id);
      return touched;
    }, [resolved, data.organizations]);
    return (
      <button
        ref={ref}
        type="button"
        {...rest}
        className={cn(
          "flex h-[22px] items-center gap-1.5 border border-border bg-muted/50 px-2 font-mono text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground",
          className,
        )}
      >
        <Layers className="h-3 w-3 shrink-0" />
        <span className="max-w-[220px] truncate">
          {summarizeSelection(selection)}
        </span>
        <span className="flex shrink-0 items-center gap-0.5">
          {data.organizations.map((o) => (
            <span
              key={o.id}
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                orgsTouched.has(o.id) ? "bg-primary" : "bg-border",
              )}
            />
          ))}
        </span>
      </button>
    );
  },
);

/* ── 2 · Breadcrumb rail ──────────────────────────────────────────────── */
/** Deepest-path breadcrumb of the FIRST selection + "+N more" overflow. */
export const BreadcrumbTrigger = forwardRef<HTMLButtonElement, TriggerProps>(
  function BreadcrumbTrigger({ selection, data, className, ...rest }, ref) {
    const resolved = useResolved(selection, data);
    const total = selectionCount(selection);
    const crumb = resolved.items[0]
      ? [
          resolved.items[0].typeLabel,
          resolved.items[0].scopeName,
          resolved.items[0].label,
        ]
      : resolved.scopes[0]
        ? [
            resolved.scopes[0].orgName,
            resolved.scopes[0].typeLabel,
            resolved.scopes[0].label,
          ]
        : resolved.types[0]
          ? [resolved.types[0].orgName, resolved.types[0].label]
          : resolved.orgs[0]
            ? [resolved.orgs[0].label]
            : resolved.projects[0]
              ? ["Projects", resolved.projects[0].label]
              : resolved.tasks[0]
                ? ["Tasks", resolved.tasks[0].label]
                : null;
    return (
      <button
        ref={ref}
        type="button"
        {...rest}
        className={cn(
          "flex h-6 max-w-[320px] items-center gap-1 rounded-sm border border-border bg-card px-1.5 text-[11px] hover:bg-muted",
          className,
        )}
      >
        {!crumb ? (
          <span className="text-muted-foreground/60">Set context…</span>
        ) : (
          <span className="flex min-w-0 items-center gap-1">
            {crumb.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && (
                  <span className="shrink-0 text-muted-foreground/40">›</span>
                )}
                <span
                  className={cn(
                    "truncate",
                    i === crumb.length - 1
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {c}
                </span>
              </React.Fragment>
            ))}
          </span>
        )}
        {total > 1 && (
          <span className="shrink-0 rounded-full bg-primary/10 px-1 font-mono text-[9px] text-primary">
            +{total - 1}
          </span>
        )}
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/60" />
      </button>
    );
  },
);

/* ── 3 · Tap-target group (required variation) ────────────────────────── */
/** TapTargetButton system trigger — the group manages ALL of its own
 *  geometry; consumers must add ZERO padding/margin/gap around it. */
export function TapTargetTrigger({
  selection,
  onOpen,
  onSearchOpen,
}: {
  selection: DenseSelection;
  onOpen: () => void;
  onSearchOpen: () => void;
}) {
  const n = selectionCount(selection);
  return (
    <TapTargetButtonGroup>
      <TapTargetButtonForGroup
        icon={<Layers className="matrx-tap-icon" />}
        label={n === 0 ? "Context" : `Context ${n}`}
        onClick={onOpen}
      />
      <TapTargetButtonForGroup
        icon={<Search className="matrx-tap-icon" />}
        ariaLabel="Search context"
        tooltip="Search context"
        onClick={onSearchOpen}
      />
    </TapTargetButtonGroup>
  );
}

/* ── 4 · Heat strip ───────────────────────────────────────────────────── */
/** Ultra-narrow (icon-width) trigger: one 3px bar per org, filled when that
 *  org has any selected bucket. For rails ~28px wide. */
export const HeatStripTrigger = forwardRef<HTMLButtonElement, TriggerProps>(
  function HeatStripTrigger({ selection, data, className, ...rest }, ref) {
    const perOrg = useMemo(
      () =>
        data.organizations.map((o) => {
          const scopeIds = new Set(
            o.scope_types.flatMap((t) => t.scopes.map((s) => s.id)),
          );
          const typeIds = new Set(o.scope_types.map((t) => t.id));
          const hits =
            (selection.orgIds.includes(o.id) ? 1 : 0) +
            selection.scopeIds.filter((id) => scopeIds.has(id)).length +
            selection.scopeTypeIds.filter((id) => typeIds.has(id)).length +
            selection.itemRefs.filter((r) => scopeIds.has(r.split("::")[0]))
              .length;
          return { id: o.id, name: o.name, hits };
        }),
      [data.organizations, selection],
    );
    const n = selectionCount(selection);
    return (
      <button
        ref={ref}
        type="button"
        aria-label={`Context: ${summarizeSelection(selection)}`}
        {...rest}
        className={cn(
          "flex h-9 w-7 flex-col items-center justify-center gap-[3px] rounded-md border border-border bg-card hover:bg-muted",
          className,
        )}
      >
        {perOrg.map((o) => (
          <span
            key={o.id}
            className={cn(
              "h-[3px] w-4 rounded-full",
              o.hits > 0 ? "bg-primary" : "bg-border",
            )}
          />
        ))}
        <span className="font-mono text-[8px] leading-none text-muted-foreground">
          {n}
        </span>
      </button>
    );
  },
);

/* ── 5 · Property row (the Linear one) ────────────────────────────────── */
/** A form-field-shaped trigger: label column + value chips, capped at 3
 *  visible + "+N". Reads as part of a properties panel. */
export const PropertyRowTrigger = forwardRef<HTMLButtonElement, TriggerProps>(
  function PropertyRowTrigger({ selection, data, className, ...rest }, ref) {
    const resolved = useResolved(selection, data);
    const chips: { key: string; label: string; tone?: string }[] = [
      ...resolved.orgs.map((o) => ({
        key: `o:${o.id}`,
        label: o.label,
        tone: "text-foreground font-medium",
      })),
      ...resolved.types.map((t) => ({
        key: `t:${t.id}`,
        label: `All ${t.label}`,
        tone: resolveColor(t.type).fg,
      })),
      ...resolved.scopes.map((s) => ({
        key: `s:${s.id}`,
        label: s.label,
        tone: resolveColor(s.type).fg,
      })),
      ...resolved.items.map((i) => ({
        key: `i:${i.ref}`,
        label: `${i.scopeName}·${i.label}`,
      })),
      ...resolved.projects.map((p) => ({ key: `p:${p.id}`, label: p.label })),
      ...resolved.tasks.map((t) => ({ key: `k:${t.id}`, label: t.label })),
    ];
    const shown = chips.slice(0, 3);
    const extra = chips.length - shown.length;
    return (
      <button
        ref={ref}
        type="button"
        {...rest}
        className={cn(
          "grid h-7 w-full grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-1 rounded-sm px-1.5 text-left hover:bg-muted/60",
          className,
        )}
      >
        <span className="text-[11px] text-muted-foreground">Context</span>
        <span className="flex min-w-0 items-center gap-1 overflow-hidden">
          {chips.length === 0 ? (
            <span className="text-[11px] text-muted-foreground/50">Empty</span>
          ) : (
            <>
              {shown.map((c) => (
                <span
                  key={c.key}
                  className={cn(
                    "max-w-[110px] shrink-0 truncate rounded-sm border border-border bg-card px-1 text-[10px]",
                    c.tone ?? "text-muted-foreground",
                  )}
                >
                  {c.label}
                </span>
              ))}
              {extra > 0 && (
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  +{extra}
                </span>
              )}
            </>
          )}
        </span>
        <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
      </button>
    );
  },
);

/* ── 6 · Filter badge ─────────────────────────────────────────────────── */
/** Toolbar filter trigger: funnel + live count badge; amber when filtering. */
export const FilterBadgeTrigger = forwardRef<HTMLButtonElement, TriggerProps>(
  function FilterBadgeTrigger({ selection, data: _data, className, ...rest }, ref) {
    const n = selectionCount(selection);
    const active = !isEmptySelection(selection);
    return (
      <button
        ref={ref}
        type="button"
        {...rest}
        className={cn(
          "relative flex h-6 items-center gap-1 rounded-sm border px-1.5 text-[11px]",
          active
            ? "border-warning/50 text-warning"
            : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
          className,
        )}
      >
        {active ? (
          <ListFilter className="h-3.5 w-3.5" />
        ) : (
          <Filter className="h-3.5 w-3.5" />
        )}
        Filter
        {active && (
          <span className="rounded-full bg-warning/15 px-1 font-mono text-[9px]">
            {n}
          </span>
        )}
      </button>
    );
  },
);

/* Small helper for the gallery: shows the trigger's org context. */
export function TriggerCaption({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
      <Building2 className="h-3 w-3" />
      {children}
    </div>
  );
}
