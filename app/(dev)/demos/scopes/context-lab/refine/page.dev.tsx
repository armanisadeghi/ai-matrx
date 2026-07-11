"use client";

// /demos/scopes/context-lab/refine — ui-refine bakeoff entry.
//
// Same mental model as the shipping ContextAssignmentField (checkbox rows,
// org → type → scope, projects/tasks last), executed at a fraction of the
// size — and finally able to reach the fourth level (context items / fields).
// Reference feel: VS Code's quick pick for the constrained cases, macOS
// Finder columns for the roomy ones.
//
// REAL data (your orgs / scopes / projects / tasks / fields, live). Per the
// lab convention the terminal save and inline creates are logged + toasted —
// a durable write from a demo route would be illegal. Nothing touches
// appContextSlice.

import React, { useMemo, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CardLoading } from "@/components/matrx/LoadingComponents";
import { cn } from "@/lib/utils";
import type {
  AssignableProject,
  AssignableTask,
} from "@/features/scopes/components/context-assignment/data";
import type { OrgNode } from "@/features/scopes/types";
import {
  fakeSave,
  selCount,
  useDraftStore,
  useLabelResolver,
  usePickController,
  useRefineData,
  useTypeItems,
  mergeDrafts,
  type DraftStore,
  type ItemsState,
  type PickController,
  type PickKind,
} from "./model";
import { QuickPick } from "./QuickPick";
import { MillerColumns } from "./MillerColumns";
import { CompactTree } from "./CompactTree";
import { TypeRail } from "./TypeRail";
import { TokenInput } from "./TokenInput";
import {
  ChipSummaryTrigger,
  CommandTrigger,
  FieldTrigger,
  MicroCountTrigger,
  PathTrigger,
  TapTrigger,
} from "./triggers";

/* ── shared demo plumbing ────────────────────────────────────────────────── */

interface DemoCtx {
  orgs: OrgNode[];
  projects: AssignableProject[];
  tasks: AssignableTask[];
  items: ItemsState;
  drafts: DraftStore;
  label: (kind: PickKind, id: string) => string;
}

function SelectionFooter({
  ctrl,
  label,
  surface,
  mode,
  saveLabel = "Save",
}: {
  ctrl: PickController;
  label: (kind: PickKind, id: string) => string;
  surface: string;
  mode: "assignment" | "active" | "filter" | "single";
  saveLabel?: string;
}) {
  const live = mode === "active" || mode === "filter";
  return (
    <div className="flex h-9 items-center gap-2 px-2">
      <span className="text-[11px] text-muted-foreground">
        {ctrl.count === 0
          ? "Nothing selected"
          : `${ctrl.count} selected`}
      </span>
      {live && (
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          applies live
        </span>
      )}
      <span className="ml-auto" />
      {ctrl.count > 0 && (
        <button
          type="button"
          onClick={ctrl.clear}
          className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Clear
        </button>
      )}
      {!live && (
        <Button
          size="sm"
          className="h-6 px-2.5 text-[11px]"
          disabled={ctrl.count === 0}
          onClick={() => fakeSave(surface, mode, ctrl.sel, label)}
        >
          {saveLabel}
        </Button>
      )}
    </div>
  );
}

function DemoCard({
  no,
  title,
  useCase,
  blurb,
  children,
  className,
}: {
  no: string;
  title: string;
  useCase: string;
  blurb: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col gap-0 overflow-hidden p-0", className)}>
      <div className="border-b border-border bg-muted/40 px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] font-bold text-primary">
            {no}
          </span>
          <span className="text-[13px] font-semibold">{title}</span>
          <span className="ml-auto shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {useCase}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {blurb}
        </p>
      </div>
      <div className="p-3">{children}</div>
    </Card>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: "multi" | "single";
  onChange: (m: "multi" | "single") => void;
}) {
  return (
    <div className="mb-2 inline-flex h-6 items-center rounded-md border border-border p-0.5">
      {(["multi", "single"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={cn(
            "h-5 rounded px-2 text-[11px]",
            mode === m
              ? "bg-accent font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {m === "multi" ? "Multi-select" : "Single-select"}
        </button>
      ))}
    </div>
  );
}

/* ── trigger demos (each owns its controller + popover) ──────────────────── */

function TriggerDemo({
  ctx,
  variant,
}: {
  ctx: DemoCtx;
  variant: "chip" | "tap" | "path" | "micro" | "field" | "command";
}) {
  const [open, setOpen] = useState(false);
  const single = variant === "path";
  const ctrl = usePickController({
    single,
    onPick: single ? () => setOpen(false) : undefined,
  });
  const common = { sel: ctrl.sel, label: ctx.label, orgs: ctx.orgs, open };

  const trigger =
    variant === "chip" ? (
      <ChipSummaryTrigger {...common} />
    ) : variant === "tap" ? (
      <TapTrigger {...common} />
    ) : variant === "path" ? (
      <PathTrigger {...common} />
    ) : variant === "micro" ? (
      <MicroCountTrigger {...common} />
    ) : variant === "field" ? (
      <FieldTrigger {...common} />
    ) : (
      <CommandTrigger {...common} />
    );

  const inside =
    variant === "chip" ? (
      <CompactTree
        {...ctx}
        ctrl={ctrl}
        height={280}
        footer={
          <SelectionFooter
            ctrl={ctrl}
            label={ctx.label}
            surface="trigger:chip"
            mode="assignment"
          />
        }
      />
    ) : variant === "tap" ? (
      <QuickPick
        {...ctx}
        ctrl={ctrl}
        height={260}
        autoFocus
        footer={
          <SelectionFooter
            ctrl={ctrl}
            label={ctx.label}
            surface="trigger:tap"
            mode="active"
          />
        }
      />
    ) : variant === "path" ? (
      <TypeRail
        {...ctx}
        ctrl={ctrl}
        height={260}
        footer={
          <SelectionFooter
            ctrl={ctrl}
            label={ctx.label}
            surface="trigger:path"
            mode="single"
          />
        }
      />
    ) : variant === "micro" ? (
      <QuickPick
        {...ctx}
        ctrl={ctrl}
        height={220}
        autoFocus
        footer={
          <SelectionFooter
            ctrl={ctrl}
            label={ctx.label}
            surface="trigger:micro"
            mode="assignment"
          />
        }
      />
    ) : variant === "field" ? (
      <MillerColumns
        {...ctx}
        ctrl={ctrl}
        footer={
          <SelectionFooter
            ctrl={ctrl}
            label={ctx.label}
            surface="trigger:field"
            mode="assignment"
          />
        }
      />
    ) : (
      <QuickPick
        {...ctx}
        ctrl={ctrl}
        height={280}
        autoFocus
        footer={
          <SelectionFooter
            ctrl={ctrl}
            label={ctx.label}
            surface="trigger:command"
            mode="filter"
          />
        }
      />
    );

  const width =
    variant === "field" ? 660 : variant === "path" ? 440 : variant === "micro" ? 320 : 360;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="p-0" style={{ width }}>
        {inside}
      </PopoverContent>
    </Popover>
  );
}

/** Micro triggers demoed in their natural habitat: dense list rows. */
function MicroRowDemo({ ctx }: { ctx: DemoCtx }) {
  const rows = ctx.projects.slice(0, 3);
  if (rows.length === 0)
    return (
      <div className="text-[12px] text-muted-foreground">
        No projects to demo row-level tagging with.
      </div>
    );
  return (
    <div className="divide-y divide-border rounded-md border border-border">
      {rows.map((p) => (
        <div key={p.id} className="flex h-8 items-center gap-2 px-2">
          <span className="min-w-0 flex-1 truncate text-[13px]">{p.name}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            project
          </span>
          <TriggerDemo ctx={ctx} variant="micro" />
        </div>
      ))}
    </div>
  );
}

/* ── inside demos (embedded at target widths) ────────────────────────────── */

function InsideFrame({
  ctx,
  kind,
  mode,
  surface,
  height,
}: {
  ctx: DemoCtx;
  kind: "quickpick" | "tree" | "rail" | "columns";
  mode: "multi" | "single";
  surface: string;
  height?: number;
}) {
  const ctrl = usePickController({ single: mode === "single" });
  const footer = (
    <SelectionFooter
      ctrl={ctrl}
      label={ctx.label}
      surface={surface}
      mode={mode === "single" ? "single" : "assignment"}
    />
  );
  const frame = "overflow-hidden rounded-md border border-border bg-background";
  if (kind === "quickpick")
    return (
      <div className={frame}>
        <QuickPick {...ctx} ctrl={ctrl} height={height ?? 280} footer={footer} />
      </div>
    );
  if (kind === "tree")
    return (
      <div className={frame}>
        <CompactTree {...ctx} ctrl={ctrl} height={height ?? 300} footer={footer} />
      </div>
    );
  if (kind === "rail")
    return (
      <div className={frame}>
        <TypeRail {...ctx} ctrl={ctrl} height={height ?? 280} footer={footer} />
      </div>
    );
  return (
    <div className={frame}>
      <MillerColumns {...ctx} ctrl={ctrl} footer={footer} />
    </div>
  );
}

function TogglableInside({
  ctx,
  kind,
  surface,
  height,
}: {
  ctx: DemoCtx;
  kind: "quickpick" | "tree" | "rail" | "columns";
  surface: string;
  height?: number;
}) {
  const [mode, setMode] = useState<"multi" | "single">("multi");
  return (
    <div>
      <ModeToggle mode={mode} onChange={setMode} />
      {/* remount on mode switch: a stale multi selection has no meaning in single */}
      <InsideFrame
        key={mode}
        ctx={ctx}
        kind={kind}
        mode={mode}
        surface={surface}
        height={height}
      />
    </div>
  );
}

function TokenDemo({ ctx }: { ctx: DemoCtx }) {
  const ctrl = usePickController();
  return (
    <div className="space-y-2">
      <TokenInput {...ctx} ctrl={ctrl} label={ctx.label} />
      <div className="flex h-5 items-center text-[11px] text-muted-foreground">
        {ctrl.count === 0
          ? "Filtering nothing — type a scope, org, project or task name."
          : `A list host would now filter by ${ctrl.count} context node${ctrl.count === 1 ? "" : "s"} (live, no save).`}
      </div>
    </div>
  );
}

/* ── page ────────────────────────────────────────────────────────────────── */

export default function RefineContextLabPage() {
  const data = useRefineData();
  const items = useTypeItems();
  const drafts = useDraftStore();

  const orgs = useMemo(
    () => mergeDrafts(data.orgs, drafts),
    [data.orgs, drafts],
  );
  const label = useLabelResolver(
    orgs,
    data.projects,
    data.tasks,
    items.itemsByType,
  );

  const ctx: DemoCtx = {
    orgs,
    projects: data.projects,
    tasks: data.tasks,
    items,
    drafts,
    label,
  };

  return (
    <div className="min-h-dvh bg-textured">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 lg:p-8">
        <div className="space-y-1.5 pr-14">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">
            Context Lab · ui-refine · real data · saves to console
          </div>
          <h1 className="text-2xl font-bold">
            The context picker, at a quarter of the size
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Same mental model as the shipping field — checkbox rows, org →
            scope type → scope, projects and tasks always last — rebuilt so
            three real orgs cost one line instead of half a page, and the
            fourth level (a scope&apos;s fields) is finally reachable.
            Reference feel: VS Code&apos;s quick pick for tight spaces, Finder
            columns for roomy ones. Every node here is your live data.
          </p>
        </div>

        {data.treeStatus === "loading" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <CardLoading />
            <CardLoading />
            <CardLoading />
          </div>
        ) : data.treeStatus === "error" ? (
          <Card className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                Couldn&apos;t load your scope tree
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {data.treeError ?? "Unknown error"}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={data.retryTree}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Retry
            </Button>
          </Card>
        ) : orgs.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">
            No organizations on your account — create one to explore the
            picker.
          </Card>
        ) : (
          <>
            {data.engagementStatus === "error" && (
              <Card className="flex items-center gap-3 border-warning/50 p-3">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                  Projects and tasks failed to load — scope selection still
                  works; the bottom sections are empty until retry succeeds.
                </span>
                <Button size="sm" variant="outline" onClick={data.retryEngagement}>
                  Retry
                </Button>
              </Card>
            )}

            {/* ── TRIGGERS ── */}
            <h2 className="pt-2 text-base font-bold">
              Triggers — six hosts, six footprints
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <DemoCard
                no="T1"
                title="Chip summary"
                useCase="Assignment · multi"
                blurb="Toolbar workhorse. Fixed 240px — chips truncate, overflow collapses to +N. Opens the compact tree."
              >
                <TriggerDemo ctx={ctx} variant="chip" />
              </DemoCard>
              <DemoCard
                no="T2"
                title="Tap target"
                useCase="Active context · multi"
                blurb="Icon-rail host on the tap-button primitive — the 44px target IS the spacing (nothing added around it). Count badge rides the icon. Opens the quick pick."
              >
                <TriggerDemo ctx={ctx} variant="tap" />
              </DemoCard>
              <DemoCard
                no="T3"
                title="Breadcrumb path"
                useCase="Working context · single"
                blurb="Header host for single-select: shows Org › Type › Scope of the one active pick; picking in the rail closes it."
              >
                <TriggerDemo ctx={ctx} variant="path" />
              </DemoCard>
              <DemoCard
                no="T4"
                title="Micro count"
                useCase="List rows · assignment"
                blurb="20px-tall cell trigger for tables: count when tagged, warning dash when contextless. Shown on your real projects."
              >
                <MicroRowDemo ctx={ctx} />
              </DemoCard>
              <DemoCard
                no="T5"
                title="Form field"
                useCase="Settings forms · multi"
                blurb="Looks like an input; selection lives inside as chips. Opens the Finder columns for full-depth browsing."
              >
                <TriggerDemo ctx={ctx} variant="field" />
              </DemoCard>
              <DemoCard
                no="T6"
                title="Command search"
                useCase="Filter · live"
                blurb="Search-first entry — lands straight in the quick pick with the query box focused. The VS Code vibe."
              >
                <TriggerDemo ctx={ctx} variant="command" />
              </DemoCard>
            </div>

            {/* ── INSIDES ── */}
            <h2 className="pt-2 text-base font-bold">
              Insides — five bodies, one selection model
            </h2>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <DemoCard
                no="I1"
                title="Quick pick"
                useCase="Constrained hosts"
                blurb="One flat searchable list, 26px rows, dim breadcrumbs instead of nested sections. Arrows navigate, Enter selects, ArrowRight opens a scope's fields, no-match offers inline create. Orgs on top; projects and tasks pinned last."
              >
                <div className="max-w-[360px]">
                  <TogglableInside ctx={ctx} kind="quickpick" surface="inside:quickpick" />
                </div>
              </DemoCard>
              <DemoCard
                no="I2"
                title="Compact tree"
                useCase="Popovers · default"
                blurb="The shipping field's model at half the cost: orgs become one tab row (the 3-org half-page is gone), types and scopes are 26px rows, and each scope expands one level further to its fields. Add-at-any-level on every layer."
              >
                <div className="max-w-[380px]">
                  <TogglableInside ctx={ctx} kind="tree" surface="inside:tree" />
                </div>
              </DemoCard>
              <DemoCard
                no="I3"
                title="Type rail"
                useCase="Mid-size hosts"
                blurb="Two panes: every dimension across every org in a slim left rail (projects/tasks pinned at its bottom), rows on the right with a fields drill-in. Depth goes sideways, not down."
              >
                <div className="max-w-[480px]">
                  <TogglableInside ctx={ctx} kind="rail" surface="inside:rail" />
                </div>
              </DemoCard>
              <DemoCard
                no="I4"
                title="Finder columns"
                useCase="Dialogs · windows"
                blurb="Org | Type | Scope | Fields, all visible at once — expanding fills the next column instead of growing the page. + New in every column; projects and tasks in the bottom strip."
              >
                <div className="max-w-[760px]">
                  <TogglableInside ctx={ctx} kind="columns" surface="inside:columns" />
                </div>
              </DemoCard>
              <DemoCard
                no="I5"
                title="Token input"
                useCase="Filter bars · one row"
                blurb="The whole picker in a single input row: type, Enter, chip. Backspace removes. A scope chip's +field affordance reaches its fields. Projects and tasks always rank after scopes."
                className="xl:col-span-2"
              >
                <div className="max-w-[620px]">
                  <TokenDemo ctx={ctx} />
                </div>
              </DemoCard>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
