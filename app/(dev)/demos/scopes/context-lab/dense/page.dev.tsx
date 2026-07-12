"use client";

// /demos/scopes/context-lab/dense — the ui-dense bakeoff entry (rev 2).
//
// Post-feedback revision. The flat-everywhere thesis is dead; the engine
// (model.ts) survives, and every skin now shows hierarchy through STRUCTURE:
//   • ContextTree — a real tree (row click drills, checkbox selects);
//     search is the only place it flattens
//   • Sidebar — the same tree at VS Code-sidebar size (240px) with
//     expand-all / collapse-all, replacing the too-wide blotter
//   • MillerStack — the requested top-to-bottom mobile Miller
//   • Type-tab matrix — org-grouped rail + removable-chip mini-ledger
//   • Cockpit — pick-left(tree) / show-right(ledger), menu fixed
// Projects/tasks are STRICTLY lazy: first expand/click fetches, never mount.
// Real data; saves/creates logged (demo convention, real paths named).

import React, { useState } from "react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  EMPTY_SELECTION,
  isEmptySelection,
  selectionCount,
  summarizeSelection,
  type DenseSelection,
} from "./model";
import { useDenseData, fakeApply } from "./shared";
import { ContextTree } from "./ContextTree";
import { MillerColumns } from "./MillerColumns";
import { MillerStack } from "./MillerStack";
import { TypeTabMatrix } from "./TypeTabMatrix";
import { SelectionCockpit } from "./SelectionCockpit";
import {
  BreadcrumbTrigger,
  FilterBadgeTrigger,
  HeatStripTrigger,
  PropertyRowTrigger,
  StatusBarTrigger,
  TapTargetTrigger,
} from "./triggers";

function Block({
  n,
  title,
  note,
  children,
  className,
}: {
  n: string;
  title: string;
  note: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-md border border-border bg-background p-2",
        className,
      )}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-[10px] text-primary">{n}</span>
        <h2 className="text-[13px] font-semibold leading-none">{title}</h2>
        <span className="min-w-0 flex-1 truncate text-right text-[10px] text-muted-foreground">
          {note}
        </span>
      </div>
      {children}
    </section>
  );
}

export default function DenseContextLabPage() {
  const data = useDenseData();
  const [sel, setSel] = useState<DenseSelection>(EMPTY_SELECTION);
  const [singleSel, setSingleSel] = useState<DenseSelection>(EMPTY_SELECTION);
  const [tapOpen, setTapOpen] = useState(false);
  const [singleOpen, setSingleOpen] = useState(false);

  const treePop = (trigger: React.ReactElement) => (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,300px)] p-0">
        <ContextTree
          data={data}
          selection={sel}
          onChange={setSel}
          height={280}
        />
      </PopoverContent>
    </Popover>
  );

  const stats =
    data.treeStatus === "loading" && data.organizations.length === 0
      ? "loading…"
      : `${data.organizations.length} orgs · ${data.organizations.reduce(
          (n, o) => n + o.scope_types.length,
          0,
        )} types · ${data.organizations.reduce(
          (n, o) => n + o.scope_types.reduce((m, t) => m + t.scopes.length, 0),
          0,
        )} scopes · projects/tasks lazy`;

  return (
    <div className="min-h-dvh bg-textured">
      <div className="mx-auto max-w-[1280px] space-y-2 p-2 lg:p-3">
        {/* header + live selection — one strip each, no hero */}
        <header className="flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2 pr-14">
          <h1 className="text-sm font-bold leading-none">
            Context picker · dense
          </h1>
          <span className="rounded-sm bg-primary/10 px-1 py-0.5 font-mono text-[9px] text-primary">
            rev 2
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
            {stats}
          </span>
        </header>

        <div className="flex h-7 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2">
          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-primary">
            Selection
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[10px]">
            {summarizeSelection(sel)}
          </span>
          <button
            type="button"
            disabled={isEmptySelection(sel)}
            onClick={() =>
              fakeApply(
                "Assign entity to buckets (Layer C — setEntityScopes / associations)",
                sel,
              )
            }
            className="h-5 shrink-0 rounded-sm border border-border bg-card px-1.5 text-[10px] hover:bg-muted disabled:opacity-40"
          >
            Assign
          </button>
          <button
            type="button"
            disabled={isEmptySelection(sel)}
            onClick={() =>
              fakeApply(
                "Set ACTIVE working context (Layer A — Surface A dispatch)",
                sel,
              )
            }
            className="h-5 shrink-0 rounded-sm border border-border bg-card px-1.5 text-[10px] hover:bg-muted disabled:opacity-40"
          >
            Set active
          </button>
          <button
            type="button"
            disabled={isEmptySelection(sel)}
            onClick={() => setSel(EMPTY_SELECTION)}
            className="h-5 shrink-0 rounded-sm px-1.5 text-[10px] text-destructive hover:bg-destructive/10 disabled:opacity-40"
          >
            Clear
          </button>
        </div>

        {/* triggers — one compact strip, all six live on the shared state */}
        <section className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-background px-2 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Triggers
          </span>
          {treePop(<StatusBarTrigger selection={sel} data={data} />)}
          {treePop(<BreadcrumbTrigger selection={sel} data={data} />)}
          <Popover open={tapOpen} onOpenChange={setTapOpen}>
            <PopoverAnchor asChild>
              {/* zero padding/margin/gap around tap buttons — always */}
              <div className="flex">
                <TapTargetTrigger
                  selection={sel}
                  onOpen={() => setTapOpen((v) => !v)}
                  onSearchOpen={() => setTapOpen(true)}
                />
              </div>
            </PopoverAnchor>
            <PopoverContent align="start" className="w-[min(92vw,300px)] p-0">
              <ContextTree
                data={data}
                selection={sel}
                onChange={setSel}
                height={280}
                autoFocus
              />
            </PopoverContent>
          </Popover>
          {treePop(<HeatStripTrigger selection={sel} data={data} />)}
          <div className="w-[240px] rounded-sm border border-border bg-card">
            {treePop(<PropertyRowTrigger selection={sel} data={data} />)}
          </div>
          {treePop(<FilterBadgeTrigger selection={sel} data={data} />)}
        </section>

        {/* row 1 — the tree at its two natural sizes + single-select */}
        <div className="flex flex-wrap items-start gap-2">
          <Block
            n="I1"
            title="Context tree"
            note="popover body · row drills, checkbox selects"
            className="w-[300px]"
          >
            <ContextTree
              data={data}
              selection={sel}
              onChange={setSel}
              height={300}
            />
          </Block>

          <Block
            n="I2"
            title="Sidebar"
            note="240px · expand/collapse-all"
            className="w-[256px]"
          >
            <ContextTree
              data={data}
              selection={sel}
              onChange={setSel}
              height={300}
              showSearch={false}
              header="Context"
            />
          </Block>

          <Block
            n="I3"
            title="Mobile stack"
            note="top-to-bottom Miller · drill + back"
            className="w-[320px]"
          >
            <MillerStack
              data={data}
              selection={sel}
              onChange={setSel}
              height={300}
            />
          </Block>

          <Block
            n="I4"
            title="Single-select"
            note="tree, mode='single' — pick one, closes"
            className="w-[300px]"
          >
            <div className="flex items-center gap-2">
              <Popover open={singleOpen} onOpenChange={setSingleOpen}>
                <PopoverTrigger asChild>
                  <BreadcrumbTrigger selection={singleSel} data={data} />
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-[min(92vw,300px)] p-0"
                >
                  <ContextTree
                    data={data}
                    selection={singleSel}
                    onChange={setSingleSel}
                    mode="single"
                    onCommit={(s) => {
                      setSingleOpen(false);
                      if (!isEmptySelection(s))
                        fakeApply("Single-select pick", s);
                    }}
                    height={260}
                  />
                </PopoverContent>
              </Popover>
              <span className="font-mono text-[10px] text-muted-foreground">
                {selectionCount(singleSel)}/1
              </span>
            </div>
            <p className="text-[10px] leading-snug text-muted-foreground">
              Selecting any node replaces the previous one and closes —
              engine-enforced. Own state, not the shared selection.
            </p>
          </Block>
        </div>

        {/* row 2 — matrix + cockpit */}
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          <Block
            n="I5"
            title="Type-tab matrix"
            note="org-grouped rail · chip grid · removable-chip ledger"
          >
            <TypeTabMatrix
              data={data}
              selection={sel}
              onChange={setSel}
              height={236}
            />
          </Block>

          <Block
            n="I6"
            title="Selection cockpit"
            note="pick left (tree) · show right (ledger)"
          >
            <SelectionCockpit
              data={data}
              selection={sel}
              onChange={setSel}
              height={236}
            />
          </Block>
        </div>

        {/* row 3 — desktop Miller (the keeper), full width where it belongs */}
        <Block
          n="I7"
          title="Miller columns"
          note="click navigates, checkbox selects · projects/tasks load on tab click"
        >
          <MillerColumns
            data={data}
            selection={sel}
            onChange={setSel}
            height={210}
          />
        </Block>

        <div className="flex flex-wrap gap-x-4 gap-y-0.5 rounded-md border border-border bg-background px-2 py-1 text-[10px] text-muted-foreground">
          <span>composer → tap/status trigger + tree popover</span>
          <span>settings panel → property row + tree</span>
          <span>rail → heat strip</span>
          <span>list filter → filter badge (no saves)</span>
          <span>phone → mobile stack</span>
          <span>dialog/panel → cockpit or matrix</span>
        </div>
      </div>
    </div>
  );
}
