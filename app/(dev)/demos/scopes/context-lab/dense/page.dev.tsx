"use client";

// /demos/scopes/context-lab/dense — the ui-dense bakeoff entry.
//
// Thesis: the current picker is ONE oversized component; the fix is ONE
// selection engine (model.ts) wearing many skins. Six triggers × five
// insides, all driven by the SAME DenseSelection state on this page — toggle
// a scope in the Miller columns and watch every trigger, the ledger, and the
// quick-pick update. All data is real (your orgs / scopes / fields /
// projects / tasks, live); only the final save + inline creates are faked
// (console + toast — the demo convention; real write paths are named in
// every log line).

import React, { useState } from "react";
import { Keyboard, MousePointerClick } from "lucide-react";
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
import { QuickPick } from "./QuickPick";
import { MillerColumns } from "./MillerColumns";
import { TreeLedger } from "./TreeLedger";
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

/* ── gallery chrome ───────────────────────────────────────────────────── */

function Block({
  n,
  title,
  useCases,
  note,
  children,
  wide,
}: {
  n: string;
  title: string;
  useCases: string;
  note: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-background p-2.5",
        wide && "xl:col-span-2",
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[10px] text-primary">{n}</span>
        <h2 className="text-sm font-semibold leading-none">{title}</h2>
        <span className="ml-auto rounded-sm bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
          {useCases}
        </span>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{note}</p>
      {children}
    </section>
  );
}

export default function DenseContextLabPage() {
  const data = useDenseData();

  // ONE shared selection drives triggers + every multi-select inside — the
  // point is that they are skins over one engine, not separate components.
  const [sel, setSel] = useState<DenseSelection>(EMPTY_SELECTION);
  // Independent single-select state (set-active / pick-one use cases).
  const [singleSel, setSingleSel] = useState<DenseSelection>(EMPTY_SELECTION);
  const [tapOpen, setTapOpen] = useState(false);
  const [singleOpen, setSingleOpen] = useState(false);

  const stats = `${data.organizations.length} orgs · ${data.organizations.reduce(
    (n, o) => n + o.scope_types.length,
    0,
  )} types · ${data.organizations.reduce(
    (n, o) => n + o.scope_types.reduce((m, t) => m + t.scopes.length, 0),
    0,
  )} scopes · ${data.projects.length} projects · ${data.tasks.length} tasks`;

  const popBody = (
    <QuickPick data={data} selection={sel} onChange={setSel} height={300} />
  );
  const pop = (trigger: React.ReactElement) => (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,440px)] p-0">
        {popBody}
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="min-h-dvh bg-textured">
      <div className="mx-auto max-w-[1560px] space-y-3 p-3 lg:p-4">
        {/* header — one tight band, no hero */}
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-background px-3 py-2 pr-14">
          <h1 className="text-base font-bold leading-none">
            Context picker · dense set
          </h1>
          <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
            ui-dense
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {data.treeStatus === "loading" && data.organizations.length === 0
              ? "loading your real tree…"
              : stats}
          </span>
          <span className="text-[11px] text-muted-foreground">
            One selection engine, six triggers, five insides — all sharing ONE
            live selection below. Saves are logged, data is real.
          </span>
          <span className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Keyboard className="h-3 w-3" /> arrows · space · enter ·
              left/right
            </span>
            <span className="flex items-center gap-1">
              <MousePointerClick className="h-3 w-3" /> everything toggles
            </span>
          </span>
        </header>

        {/* shared selection strip — the single source of truth for the page */}
        <div className="flex h-8 items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-primary">
            Live selection
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
            {summarizeSelection(sel)}
          </span>
          <button
            type="button"
            disabled={isEmptySelection(sel)}
            onClick={() =>
              fakeApply("Assign entity to buckets (Layer C — setEntityScopes / associations)", sel)
            }
            className="h-6 shrink-0 rounded-sm border border-border bg-card px-2 text-[11px] hover:bg-muted disabled:opacity-40"
          >
            Assign
          </button>
          <button
            type="button"
            disabled={isEmptySelection(sel)}
            onClick={() =>
              fakeApply("Set ACTIVE working context (Layer A — Surface A dispatch)", sel)
            }
            className="h-6 shrink-0 rounded-sm border border-border bg-card px-2 text-[11px] hover:bg-muted disabled:opacity-40"
          >
            Set active
          </button>
          <button
            type="button"
            disabled={isEmptySelection(sel)}
            onClick={() => setSel(EMPTY_SELECTION)}
            className="h-6 shrink-0 rounded-sm px-2 text-[11px] text-destructive hover:bg-destructive/10 disabled:opacity-40"
          >
            Clear
          </button>
        </div>

        {/* ── TRIGGERS ─────────────────────────────────────────────────── */}
        <section className="rounded-lg border border-border bg-background p-2.5">
          <div className="mb-2 flex items-baseline gap-2">
            <h2 className="text-sm font-semibold leading-none">
              Triggers — six form factors, one state
            </h2>
            <span className="text-[11px] text-muted-foreground">
              every one opens the quick-pick; every one shows the full
              selection without opening
            </span>
          </div>
          <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
            <div className="min-w-0 space-y-1">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                T1 · Status-bar segment — app chrome / footer rails
              </div>
              {pop(<StatusBarTrigger selection={sel} data={data} />)}
            </div>
            <div className="min-w-0 space-y-1">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                T2 · Breadcrumb — headers, shows the deepest pick
              </div>
              {pop(<BreadcrumbTrigger selection={sel} data={data} />)}
            </div>
            <div className="min-w-0 space-y-1">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                T3 · Tap-target group — composer / toolbar (zero outer spacing)
              </div>
              <Popover open={tapOpen} onOpenChange={setTapOpen}>
                <PopoverAnchor asChild>
                  {/* NO padding/margin/gap around tap buttons — the 44px
                      targets own all spacing. */}
                  <div className="flex">
                    <TapTargetTrigger
                      selection={sel}
                      onOpen={() => setTapOpen((v) => !v)}
                      onSearchOpen={() => setTapOpen(true)}
                    />
                  </div>
                </PopoverAnchor>
                <PopoverContent
                  align="start"
                  className="w-[min(92vw,440px)] p-0"
                >
                  {popBody}
                </PopoverContent>
              </Popover>
            </div>
            <div className="min-w-0 space-y-1">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                T4 · Heat strip — 28px rails; one bar per org
              </div>
              {pop(<HeatStripTrigger selection={sel} data={data} />)}
            </div>
            <div className="min-w-0 space-y-1">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                T5 · Property row — settings / detail panels (Linear-style)
              </div>
              <div className="max-w-[360px] rounded-sm border border-border bg-card">
                {pop(<PropertyRowTrigger selection={sel} data={data} />)}
              </div>
            </div>
            <div className="min-w-0 space-y-1">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                T6 · Filter badge — list toolbars (filter mode, no saving)
              </div>
              {pop(<FilterBadgeTrigger selection={sel} data={data} />)}
            </div>
          </div>
        </section>

        {/* ── INSIDES ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Block
            n="I1"
            title="Quick pick — the VS Code one"
            useCases="multi · assign · active · filter"
            note="One flat keyboard list of every node across every org. Type to filter all six levels at once; → drills into a scope's fields; no match becomes create-rows (add-at-any-level). 3 orgs that filled half a page fit in 300px."
          >
            <QuickPick
              data={data}
              selection={sel}
              onChange={setSel}
              height={300}
              autoFocus={false}
            />
          </Block>

          <Block
            n="I2"
            title="Single-select strike"
            useCases="single · pick-one"
            note="Same quick-pick, mode='single': Enter picks exactly one node and closes. For 'move to…', 'set THE working scope', or any radio-semantics host. Independent state from the shared selection."
          >
            <div className="flex items-center gap-2">
              <Popover open={singleOpen} onOpenChange={setSingleOpen}>
                <PopoverTrigger asChild>
                  <BreadcrumbTrigger selection={singleSel} data={data} />
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[min(92vw,440px)] p-0">
                  <QuickPick
                    data={data}
                    selection={singleSel}
                    onChange={setSingleSel}
                    mode="single"
                    onCommit={(s) => {
                      setSingleOpen(false);
                      if (!isEmptySelection(s))
                        fakeApply("Single-select pick", s);
                    }}
                    height={280}
                  />
                </PopoverContent>
              </Popover>
              <span className="font-mono text-[10px] text-muted-foreground">
                {selectionCount(singleSel)}/1 picked
              </span>
            </div>
            <div className="mt-1 rounded-sm border border-dashed border-border p-2 text-[11px] text-muted-foreground">
              Open it, type two letters, hit Enter. That is the entire
              interaction — the picker closes itself. Picking a second node
              replaces the first (engine-enforced, not UI-enforced).
            </div>
          </Block>

          <Block
            n="I3"
            title="Tree ledger — the blotter"
            useCases="multi · assign · audit"
            wide
            note="The whole multi-org tree as one 24px-row table: sticky org headers, n/N bulk toggles per type, expandable field rows per scope, inline add at org/type/scope level, projects and tasks as the two closing sections. For medium-to-roomy hosts that today waste half a page."
          >
            <TreeLedger
              data={data}
              selection={sel}
              onChange={setSel}
              height={360}
            />
          </Block>

          <Block
            n="I4"
            title="Miller columns"
            useCases="multi · assign · browse"
            wide
            note="Org | Type | Scope | Field as four Finder columns — navigation (click) and selection (checkbox) are independent, so drilling to a field never disturbs the selection. Inline add at the foot of every column; projects/tasks in the fixed bottom band."
          >
            <MillerColumns
              data={data}
              selection={sel}
              onChange={setSel}
              height={252}
            />
          </Block>

          <Block
            n="I5"
            title="Type-tab matrix"
            useCases="multi · active · medium hosts"
            note="Types as one colored tab row (all orgs), scopes as a toggle-chip grid — 8 scopes on one line instead of 8 rows. Org band on top; per-chip caret opens the field strip; Projects/Tasks pinned as the last tabs."
          >
            <TypeTabMatrix
              data={data}
              selection={sel}
              onChange={setSel}
              height={252}
            />
          </Block>

          <Block
            n="I6"
            title="Selection cockpit"
            useCases="multi · roomy hosts · review"
            note="Quick-pick + a permanent right-hand ledger of everything selected, grouped by level, one-click removal. The 'see my whole selection at a glance' requirement made structural — this is the dialog/window-panel body."
          >
            <SelectionCockpit
              data={data}
              selection={sel}
              onChange={setSel}
              height={308}
            />
          </Block>
        </div>

        {/* use-case map — which skin goes where */}
        <section className="rounded-lg border border-border bg-background p-2.5">
          <h2 className="mb-1.5 text-sm font-semibold leading-none">
            Fit map
          </h2>
          <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 text-[11px] text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
            <div>Chat composer, multi-bucket for the agent → T3/T1 + I1</div>
            <div>Set active working context (Surface A host) → T2 + I1/I5</div>
            <div>Assign a file/note to contexts → T5 + I3/I6</div>
            <div>Filter a list (zero save side-effects) → T6 + I1</div>
            <div>Single-select ("move to", pick one) → T2 + I2</div>
            <div>Sidebar rails under 32px → T4; audits/admin → I3</div>
          </div>
        </section>
      </div>
    </div>
  );
}
