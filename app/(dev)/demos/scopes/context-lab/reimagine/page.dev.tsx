"use client";

// /demos/scopes/context-lab/reimagine — ui-reimagine bakeoff entry.
//
// Reference feel: VS Code Quick Pick × macOS Finder columns. The current
// ContextAssignmentField is one huge component doing every job; this set is
// the opposite bet — ONE selection engine (engine.ts), many small faces:
// seven triggers and five insides, each shaped for a different host, all on
// REAL data (your actual orgs / scopes / projects / tasks / context items).
// Saves and quick-adds are preview-only by demo law (console + toast) — the
// interaction, data, loading, error and empty paths are all real.

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useSelectionEngine,
  type PickerMode,
  type SelectionEngine,
} from "./engine";
import { QuickPick } from "./QuickPick";
import { DrillDeck } from "./DrillDeck";
import { MillerColumns } from "./MillerColumns";
import { TokenComposer } from "./TokenComposer";
import { ContextMatrix } from "./ContextMatrix";
import {
  CommandBarTrigger,
  DotStack,
  FilterControl,
  LensChip,
  SlotField,
  StatusBarItem,
  TapTargetTrigger,
  type TriggerProps,
} from "./Triggers";

/* ── shared card chrome ──────────────────────────────────────────────────── */

function ModeControls({
  mode,
  setMode,
  single,
  setSingle,
}: {
  mode: PickerMode;
  setMode: (m: PickerMode) => void;
  single: boolean;
  setSingle: (v: boolean) => void;
}) {
  const modes: PickerMode[] = ["assignment", "active", "filter"];
  return (
    <div className="flex items-center gap-3">
      <div className="flex overflow-hidden rounded-md border border-border">
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "px-2 py-0.5 text-[10px] font-medium capitalize",
              m === mode
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {m}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Switch
          checked={single}
          onCheckedChange={setSingle}
          className="scale-75 origin-left"
        />
        single-select
      </label>
    </div>
  );
}

function VariantCard({
  no,
  title,
  blurb,
  wide,
  children,
}: {
  no: string;
  title: string;
  blurb: string;
  wide?: boolean;
  children: (engine: SelectionEngine, mode: PickerMode) => React.ReactNode;
}) {
  const [mode, setMode] = useState<PickerMode>("assignment");
  const [single, setSingle] = useState(false);
  const engine = useSelectionEngine(single);
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-card/60 p-3",
        wide && "col-span-full",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 pb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
              {no}
            </span>
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          </div>
          <p className="max-w-2xl pt-1 text-[11px] leading-relaxed text-muted-foreground">
            {blurb}
          </p>
        </div>
        <ModeControls
          mode={mode}
          setMode={setMode}
          single={single}
          setSingle={setSingle}
        />
      </div>
      {children(engine, mode)}
    </section>
  );
}

/* ── triggers demo (one shared selection, seven faces) ───────────────────── */

function TriggerCard({
  no,
  title,
  blurb,
  engine,
  render,
}: {
  no: string;
  title: string;
  blurb: string;
  engine: SelectionEngine;
  render: (p: TriggerProps) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-3">
      <div className="flex items-center gap-2">
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
          {no}
        </span>
        <span className="text-xs font-semibold text-foreground">{title}</span>
      </div>
      <p className="min-h-8 text-[11px] leading-snug text-muted-foreground">
        {blurb}
      </p>
      <div className="flex min-h-11 items-center">
        <Popover>
          <PopoverTrigger asChild>
            <span className="inline-flex max-w-full">
              {render({ nodes: engine.nodes, onClick: () => {} })}
            </span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <QuickPick
              engine={engine}
              mode="assignment"
              className="h-[420px] w-[min(360px,85vw)] border-0"
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function TriggersSection() {
  // ONE selection, seven faces — pick anything in any popover and every
  // trigger re-renders its own summary of the same state.
  const engine = useSelectionEngine(false);
  return (
    <div>
      <h2 className="pb-1 text-base font-semibold text-foreground">
        Triggers — seven faces of one selection
      </h2>
      <p className="pb-3 text-xs text-muted-foreground">
        All seven share a single selection engine: select in any one popover
        and watch every face update. Each opens the Command Quick-Pick here,
        but any trigger can host any inside.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TriggerCard
          no="T1"
          title="Tap pill"
          blurb="TapTargetButtonGroup — 44px touch targets for headers and mobile toolbars. No padding around it, per the tap-target law."
          engine={engine}
          render={(p) => <TapTargetTrigger {...p} />}
        />
        <TriggerCard
          no="T2"
          title="Lens chip"
          blurb="Colored dots (one per scope-type color) + a count summary. The default 'what am I looking through' chip."
          engine={engine}
          render={(p) => <LensChip {...p} />}
        />
        <TriggerCard
          no="T3"
          title="Status-bar item"
          blurb="20px tall, monospace, breadcrumb of the first pick +N — the VS Code bottom bar, for editor-grade chrome."
          engine={engine}
          render={(p) => <StatusBarItem {...p} />}
        />
        <TriggerCard
          no="T4"
          title="Dot stack"
          blurb="Facepile-sized. For table cells and icon rails where even a chip is too wide."
          engine={engine}
          render={(p) => <DotStack {...p} />}
        />
        <TriggerCard
          no="T5"
          title="Slot field"
          blurb="A form control that IS the selection — dashed empty slot, fills with tokens. For settings pages and upload prompts."
          engine={engine}
          render={(p) => <SlotField {...p} />}
        />
        <TriggerCard
          no="T6"
          title="Command bar"
          blurb="A search-shaped invitation with a keyboard hint — for surfaces where context IS the primary command."
          engine={engine}
          render={(p) => <CommandBarTrigger {...p} />}
        />
        <TriggerCard
          no="T7"
          title="Filter control"
          blurb="A toolbar filter face with an active-count badge — the natural trigger for list filtering."
          engine={engine}
          render={(p) => <FilterControl {...p} />}
        />
      </div>
    </div>
  );
}

/* ── page ────────────────────────────────────────────────────────────────── */

export default function ContextReimaginePage() {
  return (
    <div className="min-h-dvh bg-textured">
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 pb-24">
        <header className="space-y-1">
          <h1 className="text-lg font-bold text-foreground">
            Context picker — reimagine set
          </h1>
          <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Reference feel: <span className="text-foreground">VS Code Quick
            Pick × macOS Finder columns</span>. One selection engine, many
            small faces — every variation walks the full shape (Org → Scope
            Type → Scope → Context Item, Projects &amp; Tasks at the bottom),
            supports multi and single select, all three modes, and
            add-at-any-level. Real data everywhere; saves and quick-adds are
            preview-only (console + toast) because durable writes from a demo
            are illegal.
          </p>
        </header>

        <TriggersSection />

        <div>
          <h2 className="pb-1 text-base font-semibold text-foreground">
            Insides — five picker bodies
          </h2>
          <p className="pb-3 text-xs text-muted-foreground">
            Each card has its own selection. Flip the mode (Assign commits on
            a button; Active and Filter emit live — watch the console) and
            single-select to see the semantics change.
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <VariantCard
              no="I1"
              title="Command Quick-Pick"
              blurb="The VS Code one. Type to search the whole universe flat (paths shown dim); Arrow-Right drills Org → Type → Scope → Items; Backspace walks up; Enter toggles; 'Create …' rides your query at every level. One input tall until opened — for hosts with no room."
            >
              {(engine, mode) => (
                <QuickPick
                  engine={engine}
                  mode={mode}
                  className="h-[420px] w-full max-w-[380px]"
                />
              )}
            </VariantCard>

            <VariantCard
              no="I2"
              title="Drill Deck"
              blurb="One narrow column, one level at a time — check target selects, name drills, Projects and Tasks are folders at the root. Fits a ~260px rail or drawer where the current field cannot physically go."
            >
              {(engine, mode) => (
                <div className="flex justify-start">
                  <DrillDeck
                    engine={engine}
                    mode={mode}
                    className="h-[420px] w-[260px]"
                  />
                </div>
              )}
            </VariantCard>

            <VariantCard
              wide
              no="I3"
              title="Token Composer"
              blurb="The 'To:' field — the selection is the interface. Type to pull from everywhere, Enter takes the match, Backspace pops the last token, and the chevron on a scope token opens its context items inline. Born for the filter-bar job."
            >
              {(engine, mode) => (
                <TokenComposer
                  engine={engine}
                  mode={mode}
                  className="h-[300px] w-full"
                />
              )}
            </VariantCard>

            <VariantCard
              wide
              no="I4"
              title="Miller Columns"
              blurb="The Finder. Four synced columns — Org | Scope Type | Scope | Context Items — with Projects/Tasks as a bottom rail. Constant height no matter how big the tree gets; highlight navigates, check selects, every column can create."
            >
              {(engine, mode) => (
                <MillerColumns
                  engine={engine}
                  mode={mode}
                  className="h-[480px] w-full"
                />
              )}
            </VariantCard>

            <VariantCard
              wide
              no="I5"
              title="Context Matrix"
              blurb="The map. Every org a swimlane, every type a row, every scope a small toggle cell — the entire 3-org universe in one screen. Search dims instead of reflowing; a cell's chevron opens its item strip inline; org and type labels are toggles too."
            >
              {(engine, mode) => (
                <ContextMatrix
                  engine={engine}
                  mode={mode}
                  className="h-[560px] w-full"
                />
              )}
            </VariantCard>
          </div>
        </div>
      </div>
    </div>
  );
}
