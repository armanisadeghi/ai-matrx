"use client";

/**
 * THE ONE CONTROL — prototype of a single control system built FROM the
 * tap-target geometry, so a text button, a field, a select and a segmented
 * control are the same object as a tap button, not a lookalike.
 *
 * The rules the prototype encodes (owner, 2026-10-02):
 * - Every control's VISIBLE height is the tap pill (`--matrx-tap-wide-size`).
 * - Every control carries HALF A GAP on each side (the tap box's own spacing),
 *   so a row of mixed controls sits exactly one gap apart with NO container gap
 *   — the same way two tap buttons already do.
 * - One label size, one icon size, one shape, from the same tokens.
 *
 * Only the tap package's own geometry can move tap tokens; its guard paints
 * anything else red. The 28px options therefore preview inside the package's
 * sanctioned density scope (`[data-matrx-table][data-matrx-table-density]`,
 * control size 34px → 28px pill in a 34px box, 6px gap). The real change lands
 * in the package once the owner picks.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { TapTargetButton, TapTargetButtonGroup } from "@ai-matrx/tap-target";
import {
  ArrowDownUpTapButton,
  FilterTapButton,
  MoreHorizontalTapButton,
  SettingsTapButton,
} from "@ai-matrx/tap-target/buttons";
import { ChevronDown, Download, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@ai-matrx/design-system";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Prototype CSS. Plain CSS on purpose: this is the shape the package   */
/* stylesheet will take, every number read from a tap token.            */
/* ------------------------------------------------------------------ */

const ONE_CONTROL_CSS = `
.uc { --uc-label: 0.8125rem; --uc-field-radius: 9999px; }
.uc-row { display: flex; flex-wrap: wrap; align-items: center; row-gap: var(--matrx-tap-gap); }
.uc-btn, .uc-field, .uc-select, .uc-seg {
  box-sizing: border-box; height: var(--matrx-tap-wide-size);
  margin-inline: calc(var(--matrx-tap-gap) / 2); flex-shrink: 0;
  font-size: var(--uc-label); line-height: 1; font-weight: 500;
}
.uc-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.375rem;
  padding-inline: 0.875rem; border-radius: 9999px; white-space: nowrap; cursor: pointer;
  color: hsl(var(--foreground));
  transition: background-color 240ms cubic-bezier(0.22, 1, 0.36, 1);
}
.uc-btn:has(svg) { padding-inline: 0.75rem 0.875rem; }
.uc-btn svg { width: var(--matrx-tap-icon-size); height: var(--matrx-tap-icon-size); flex-shrink: 0; }
.uc-btn:active { transform: scale(0.97); }
.uc-btn-primary { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
.uc-btn-primary:hover { background: hsl(var(--primary) / 0.9); }
.uc-btn-quiet { background: transparent; }
.uc-btn-quiet:hover { background: hsl(var(--accent)); }
.uc-field, .uc-select {
  display: inline-flex; align-items: center; gap: 0.375rem; padding-inline: 0.75rem;
  border: 1px solid hsl(var(--border)); background: hsl(var(--card)); color: hsl(var(--foreground));
  border-radius: var(--uc-field-radius); font-weight: 400; min-width: 0;
}
.uc-field input { all: unset; flex: 1 1 auto; min-width: 0; font-size: inherit; }
.uc-field input::placeholder { color: hsl(var(--muted-foreground)); }
.uc-field:focus-within, .uc-select:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 1px; }
.uc-field svg, .uc-select svg { width: var(--matrx-tap-icon-size); height: var(--matrx-tap-icon-size); color: hsl(var(--muted-foreground)); flex-shrink: 0; }
.uc-select { justify-content: space-between; cursor: pointer; }
.uc-seg { display: inline-flex; align-items: center; padding: 2px; border-radius: 9999px; }
.uc-seg-item {
  box-sizing: border-box; height: calc(var(--matrx-tap-wide-size) - 4px); padding-inline: 0.625rem;
  border-radius: 9999px; display: inline-flex; align-items: center; cursor: pointer;
  color: hsl(var(--muted-foreground)); font-size: var(--uc-label); font-weight: 500;
}
.uc-seg-item[data-on] { background: hsl(var(--primary) / 0.14); box-shadow: inset 0 0 0 1px hsl(var(--primary) / 0.28); color: hsl(var(--foreground)); }
.uc-meta { font-size: 0.6875rem; color: hsl(var(--muted-foreground)); }
.uc-badge { display: inline-flex; align-items: center; height: 1.125rem; padding-inline: 0.375rem; border-radius: 9999px; font-size: 0.6875rem; font-weight: 500; border: 1px solid hsl(var(--border)); color: hsl(var(--muted-foreground)); }
@media (pointer: coarse) { .uc-field input { font-size: 16px; } }
`;

function OneControlStyles() {
  return <style dangerouslySetInnerHTML={{ __html: ONE_CONTROL_CSS }} />;
}

/* ------------------------------------------------------------------ */
/* Scale scope: 32 = today's tap canon (no scope); 28 = the package's   */
/* sanctioned density scope at a 34px control size.                     */
/* ------------------------------------------------------------------ */

export interface ScaleProps {
  scale: 28 | 32;
  icon?: 12 | 14 | 16;
  label?: 12 | 13;
  fieldRadius?: "capsule" | "rounded";
  children: ReactNode;
}

export function Scale({ scale, icon = 16, label = 13, fieldRadius = "capsule", children }: ScaleProps) {
  const vars = {
    "--uc-label": label === 13 ? "0.8125rem" : "0.75rem",
    "--uc-field-radius": fieldRadius === "capsule" ? "9999px" : "0.5rem",
    ...(scale === 28
      ? { "--matrx-table-control-size": "2.125rem", "--matrx-table-action-icon-size": icon === 12 ? "0.75rem" : icon === 14 ? "0.875rem" : "1rem" }
      : {}),
  } as CSSProperties;
  const scoped = scale === 28 ? { "data-matrx-table": "", "data-matrx-table-density": "" } : {};
  return (
    <div className="uc" style={vars} {...scoped}>
      <OneControlStyles />
      {children}
    </div>
  );
}

/* Measures each direct child's VISIBLE height (a tap button's pill or a  */
/* group's capsule, never its invisible box) and the gaps between them.  */
export function MeasuredBare({ children, className = "uc-row" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [read, setRead] = useState("");
  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const measure = () => {
      const kids = Array.from(row.children).filter(
        (c) => c.tagName !== "STYLE" && c.getAttribute("aria-hidden") !== "true" && c.getBoundingClientRect().width > 2 && c.getBoundingClientRect().height > 2,
      );
      const visible = kids.map(
        (c) => (c.querySelector(".matrx-tap-group-capsule, .matrx-tap-pill") as HTMLElement | null) ?? (c as HTMLElement),
      );
      const heights = visible.map((v) => Math.round(v.getBoundingClientRect().height));
      const gaps: number[] = [];
      for (let i = 1; i < visible.length; i++) {
        const a = visible[i - 1]!.getBoundingClientRect();
        const b = visible[i]!.getBoundingClientRect();
        if (Math.abs(a.top - b.top) < 4) gaps.push(Math.round(b.left - a.right));
      }
      const hs = Array.from(new Set(heights));
      const gs = Array.from(new Set(gaps));
      setRead(
        `height ${hs.join(" / ")}px${hs.length > 1 ? " ✗" : ""} · spacing ${gs.join(" / ")}px${gs.length > 1 ? " ✗" : ""}`,
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="flex flex-col gap-1.5">
      <div ref={ref} className={className}>
        {children}
      </div>
      <div className={cn("font-mono text-xs", read.includes("✗") ? "text-destructive" : "text-muted-foreground")}>
        {read || "—"}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The unified toolbar: tap buttons + text button + field + select +    */
/* segmented, NO container gap — every piece spaces itself.             */
/* ------------------------------------------------------------------ */

export function UnifiedToolbar() {
  const [scope, setScope] = useState("all");
  return (
    <MeasuredBare>
      <button type="button" className="uc-btn uc-btn-primary">
        <PlusGlyph /> New
      </button>
      <label className="uc-field" style={{ width: "11rem" }}>
        <Search aria-hidden />
        <input placeholder="Search" aria-label="Search" />
      </label>
      <button type="button" className="uc-select" style={{ width: "7rem" }} aria-label="Status">
        Open <ChevronDown aria-hidden />
      </button>
      <div className="uc-seg matrx-glass-thin-border" role="group" aria-label="Scope">
        {["all", "mine", "shared"].map((v) => (
          <button key={v} type="button" className="uc-seg-item" data-on={scope === v ? "" : undefined} onClick={() => setScope(v)}>
            {v === "all" ? "All" : v === "mine" ? "Mine" : "Shared"}
          </button>
        ))}
      </div>
      <TapTargetButtonGroup>
        <FilterTapButton variant="group" ariaLabel="Filter" />
        <ArrowDownUpTapButton variant="group" ariaLabel="Sort" />
      </TapTargetButtonGroup>
      <TapTargetButton icon={<Download />} label="Export" ariaLabel="Export" />
      <SettingsTapButton variant="transparent" ariaLabel="Settings" />
    </MeasuredBare>
  );
}

export function PlusGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/* Today: the same toolbar from the shipped primitives at their defaults. */
export function OneToday() {
  return (
    <MeasuredBare className="flex flex-wrap items-center gap-2">
        <Button size="sm">
          <PlusGlyph /> New
        </Button>
        <Input placeholder="Search" className="w-44" />
        <Select defaultValue="open">
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="mine">Mine</TabsTrigger>
            <TabsTrigger value="shared">Shared</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center">
          <TapTargetButtonGroup>
            <FilterTapButton variant="group" ariaLabel="Filter" />
            <ArrowDownUpTapButton variant="group" ariaLabel="Sort" />
          </TapTargetButtonGroup>
          <SettingsTapButton variant="transparent" ariaLabel="Settings" />
        </div>
    </MeasuredBare>
  );
}

export const OneAt32 = () => (
  <Scale scale={32}>
    <UnifiedToolbar />
  </Scale>
);
export const OneAt28 = () => (
  <Scale scale={28}>
    <UnifiedToolbar />
  </Scale>
);

/* Sub-choices, all at the 28 system. */
export const FieldCapsule = () => (
  <Scale scale={28} fieldRadius="capsule">
    <UnifiedToolbar />
  </Scale>
);
export const FieldRounded = () => (
  <Scale scale={28} fieldRadius="rounded">
    <UnifiedToolbar />
  </Scale>
);
export const Label13 = () => (
  <Scale scale={28} label={13}>
    <UnifiedToolbar />
  </Scale>
);
export const Label12 = () => (
  <Scale scale={28} label={12}>
    <UnifiedToolbar />
  </Scale>
);
export const Icon16At28 = () => (
  <Scale scale={28} icon={16}>
    <UnifiedToolbar />
  </Scale>
);
export const Icon14At28 = () => (
  <Scale scale={28} icon={14}>
    <UnifiedToolbar />
  </Scale>
);

/* ------------------------------------------------------------------ */
/* Page density: the same small screen, today's defaults vs the dense    */
/* defaults, at a fixed 640px so the difference is space, not viewport.  */
/* ------------------------------------------------------------------ */

const ROWS = [
  { name: "Quarterly client report", meta: "Updated 2h ago · Ana Ruiz", status: "Draft" },
  { name: "Intake form — dental", meta: "Updated yesterday · Ben Ortiz", status: "Live" },
  { name: "Weekly check-in agenda", meta: "Updated 3d ago · Ana Ruiz", status: "Live" },
  { name: "Onboarding checklist", meta: "Updated 1w ago · Dana Reyes", status: "Archived" },
];

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="w-[640px] max-w-full overflow-hidden rounded-md border border-border bg-background">{children}</div>
  );
}

export function DensityToday() {
  return (
    <Frame>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-2xl font-bold">Documents</h3>
          <div className="ml-auto flex items-center gap-2">
            <Input placeholder="Search" className="w-48" />
            <Button>
              <PlusGlyph /> New document
            </Button>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-6">
            {ROWS.map((r) => (
              <div key={r.name} className="flex items-center gap-4 rounded-lg border border-border p-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-medium">{r.name}</div>
                  <div className="text-sm text-muted-foreground">{r.meta}</div>
                </div>
                <Badge variant="outline">{r.status}</Badge>
                <Button variant="ghost" size="icon" aria-label="More">
                  <MoreGlyph />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </Frame>
  );
}

export function DensityDense() {
  return (
    <Frame>
      <Scale scale={28}>
        <div className="flex flex-col">
          <div className="uc-row border-b border-border px-1.5 py-1.5">
            <h3 className="mx-1.5 text-sm font-semibold">Documents</h3>
            <span className="uc-meta">4</span>
            <span className="flex-1" />
            <label className="uc-field" style={{ width: "10rem" }}>
              <Search aria-hidden />
              <input placeholder="Search" aria-label="Search" />
            </label>
            <TapTargetButton icon={<Plus />} label="New" ariaLabel="New document" />
          </div>
          <div className="px-3 pb-1 pt-2.5 text-[0.6875rem] font-medium text-muted-foreground">Recent</div>
          <div className="divide-y divide-border">
            {ROWS.map((r) => (
              <div key={r.name} className="flex min-h-9 items-center gap-2 pl-3 pr-1">
                <div className="min-w-0 flex-1 py-1.5">
                  <div className="truncate text-[0.8125rem] font-medium leading-4">{r.name}</div>
                  <div className="uc-meta truncate leading-4">{r.meta}</div>
                </div>
                <span className="uc-badge">{r.status}</span>
                <MoreHorizontalTapButton variant="transparent" ariaLabel="More" />
              </div>
            ))}
          </div>
        </div>
      </Scale>
    </Frame>
  );
}

function MoreGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}
