"use client";

/**
 * THE ONE CONTROL on the decision board. The settled answer is the package's
 * `@ai-matrx/design-system/controls`, rendered as is; each alternative option
 * is the SAME component with one token moved (`Alt`). The "today" specimens
 * deliberately render the legacy primitives they replace.
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
import { TapTargetButtonGroup, TapTargetButtonOutline } from "@ai-matrx/design-system/tap-target";
import {
  ArrowDownUpTapButton,
  FilterTapButton,
  MoreHorizontalTapButton,
  SettingsTapButton,
} from "@ai-matrx/design-system/tap-target/buttons";
import { ChevronDown, Download, Plus, Search } from "lucide-react";
import { Button as LegacyButton } from "@/components/ui/button";
import { Badge as LegacyBadge } from "@/components/ui/badge";
import {
  Select as LegacySelect,
  SelectContent,
  SelectItem,
  SelectTriggerLegacy as SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input, Button as SurfaceButton } from "@ai-matrx/design-system";
import { Tabs, TabsListLegacy as TabsList, TabsTriggerLegacy as TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Badge, Button, ControlRow, ControlScope, SearchField, SegmentedControl, Select } from "@ai-matrx/design-system/controls";

/* ------------------------------------------------------------------ */
/* Alt: the REAL package controls at an alternative token value. The    */
/* settled answer is the package default (28px, 13px label, 16px glyph, */
/* capsule fields, 10px text inset); every other option on the board is */
/* the same component with one token moved, so a rejected option is     */
/* still an honest render of the system.                                 */
/* ------------------------------------------------------------------ */

export type PadMode = "today" | "matched" | "tight";

export interface AltProps {
  size?: 28 | 30 | 32;
  pad?: PadMode;
  icon?: 12 | 14 | 16;
  label?: 12 | 13;
  fieldRadius?: "capsule" | "rounded";
  children: ReactNode;
}

const TEXT_INSET: Record<PadMode, string> = { today: "0.875rem", matched: "0.625rem", tight: "0.5rem" };

export function Alt({ size = 28, icon = 16, label = 13, fieldRadius = "capsule", pad = "matched", children }: AltProps) {
  const vars = {
    "--matrx-control-size": `${size / 16}rem`,
    "--matrx-control-glyph": `${icon / 16}rem`,
    "--matrx-control-inset-glyph": `${(size - icon) / 2 / 16}rem`,
    "--matrx-control-label": label === 13 ? "0.8125rem" : "0.75rem",
    "--matrx-control-field-radius": fieldRadius === "capsule" ? "9999px" : "0.5rem",
    "--matrx-control-inset-text": TEXT_INSET[pad],
  } as CSSProperties;
  return <ControlScope style={vars}>{children}</ControlScope>;
}

/* Measures each direct child's VISIBLE height (a tap button's pill or a  */
/* group's capsule, never its invisible box) and the gaps between them.  */
export function MeasuredBare({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [read, setRead] = useState("");
  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const measure = () => {
      const all = Array.from(row.children);
      const kids = all.filter(
        (c) => c.getAttribute("aria-hidden") !== "true" && c.getBoundingClientRect().width > 2 && c.getBoundingClientRect().height > 2,
      );
      // A flex spacer between two controls is deliberate distance, not spacing.
      const adjacent = (a: Element, b: Element) => all.indexOf(b) - all.indexOf(a) === 1;
      const visible = kids.map(
        (c) => (c.querySelector(".matrx-tap-group-capsule, .matrx-tap-pill") as HTMLElement | null) ?? (c as HTMLElement),
      );
      const heights = visible.map((v) => Math.round(v.getBoundingClientRect().height));
      const gaps: number[] = [];
      for (let i = 1; i < visible.length; i++) {
        const a = visible[i - 1]!.getBoundingClientRect();
        const b = visible[i]!.getBoundingClientRect();
        if (Math.abs(a.top - b.top) < 4 && adjacent(kids[i - 1]!, kids[i]!)) gaps.push(Math.round(b.left - a.right));
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
      <ControlRow ref={ref} className={className}>
        {children}
      </ControlRow>
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
      <Button variant="primary">
        <Plus aria-hidden /> New
      </Button>
      <SearchField style={{ width: "11rem" }} placeholder="Search" aria-label="Search" />
      <Select aria-label="Status" style={{ width: "7rem" }} value="open" onValueChange={() => {}} options={STATUS_OPTIONS} />
      <SegmentedControl
        aria-label="Scope"
        value={scope}
        onValueChange={setScope}
        data={[
          { value: "all", label: "All" },
          { value: "mine", label: "Mine" },
          { value: "shared", label: "Shared" },
        ]}
      />
      <TapTargetButtonGroup surface="solid">
        <FilterTapButton variant="group" ariaLabel="Filter" />
        <ArrowDownUpTapButton variant="group" ariaLabel="Sort" />
      </TapTargetButtonGroup>
      <TapTargetButtonOutline icon={<Download />} label="Export" ariaLabel="Export" />
      <SettingsTapButton variant="transparent" ariaLabel="Settings" />
    </MeasuredBare>
  );
}

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];

/* Today: the same toolbar from the shipped primitives at their defaults. */
export function OneToday() {
  return (
    <MeasuredBare className="flex flex-wrap items-center gap-2">
        <LegacyButton icon={<Plus aria-hidden />} type="submit" variant="primary"> New
        </LegacyButton>
        <Input placeholder="Search" className="w-44" />
        <LegacySelect defaultValue="open">
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </LegacySelect>
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
  <Alt size={32}>
    <UnifiedToolbar />
  </Alt>
);
export const OneAt30 = () => (
  <Alt size={30}>
    <UnifiedToolbar />
  </Alt>
);
export const OneAt28 = () => (
  <Alt size={28}>
    <UnifiedToolbar />
  </Alt>
);

/* Sub-choices, all at the 28 system. */
export const FieldCapsule = () => (
  <Alt size={28} fieldRadius="capsule">
    <UnifiedToolbar />
  </Alt>
);
export const FieldRounded = () => (
  <Alt size={28} fieldRadius="rounded">
    <UnifiedToolbar />
  </Alt>
);
export const Label13 = () => (
  <Alt size={28} label={13}>
    <UnifiedToolbar />
  </Alt>
);
export const Label12 = () => (
  <Alt size={28} label={12}>
    <UnifiedToolbar />
  </Alt>
);
export const Icon16At28 = () => (
  <Alt size={28} icon={16}>
    <UnifiedToolbar />
  </Alt>
);
export const Icon14At28 = () => (
  <Alt size={28} icon={14}>
    <UnifiedToolbar />
  </Alt>
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
            <LegacyButton icon={<Plus aria-hidden />} type="submit" variant="primary"> New document
            </LegacyButton>
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
                <LegacyBadge variant="outline">{r.status}</LegacyBadge>
                <SurfaceButton variant="ghost" size="icon" aria-label="More">
                  <MoreGlyph />
                </SurfaceButton>
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
      <Alt size={28}>
        <div className="flex flex-col">
          <ControlRow className="border-b border-border px-1.5 py-1.5">
            <h3 className="mx-1.5 text-sm font-semibold">Documents</h3>
            <span className="text-[0.6875rem] text-muted-foreground">4</span>
            <span className="flex-1" />
            <SearchField style={{ width: "10rem" }} placeholder="Search" aria-label="Search" />
            <TapTargetButtonOutline icon={<Plus />} label="New" ariaLabel="New document" />
          </ControlRow>
          <div className="px-3 pb-1 pt-2.5 text-[0.6875rem] font-medium text-muted-foreground">Recent</div>
          <div className="divide-y divide-border">
            {ROWS.map((r) => (
              <div key={r.name} className="flex min-h-9 items-center gap-2 pl-3 pr-1">
                <div className="min-w-0 flex-1 py-1.5">
                  <div className="truncate text-[0.8125rem] font-medium leading-4">{r.name}</div>
                  <div className="truncate text-[0.6875rem] leading-4 text-muted-foreground">{r.meta}</div>
                </div>
                <Badge tone="neutral">{r.status}</Badge>
                <MoreHorizontalTapButton variant="transparent" ariaLabel="More" />
              </div>
            ))}
          </div>
        </div>
      </Alt>
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

/* Inner padding options at 28px — the row without a labelled tap pill, so
   every control's inset is judged against the round tap buttons (6px). */
function PadToolbar() {
  const [scope, setScope] = useState("all");
  return (
    <MeasuredBare>
      <Button variant="primary">
        <Plus aria-hidden /> New
      </Button>
      <Button variant="outline">Export</Button>
      <SearchField style={{ width: "11rem" }} placeholder="Search" aria-label="Search" />
      <Select aria-label="Status" style={{ width: "7rem" }} value="open" onValueChange={() => {}} options={STATUS_OPTIONS} />
      <SegmentedControl
        aria-label="Scope"
        value={scope}
        onValueChange={setScope}
        data={[
          { value: "all", label: "All" },
          { value: "mine", label: "Mine" },
        ]}
      />
      <SettingsTapButton variant="transparent" ariaLabel="Settings" />
      <MoreHorizontalTapButton variant="transparent" ariaLabel="More" />
    </MeasuredBare>
  );
}

export const PadToday = () => (
  <Alt size={28} pad="today">
    <PadToolbar />
  </Alt>
);
export const PadMatched = () => (
  <Alt size={28} pad="matched">
    <PadToolbar />
  </Alt>
);
export const PadTight = () => (
  <Alt size={28} pad="tight">
    <PadToolbar />
  </Alt>
);
