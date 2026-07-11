"use client";

// /demos/scopes/context-lab/sharp — ui-sharp bakeoff entry
//
// Reference feel: the VS Code quick pick (constrained hosts) + Finder's
// column view (roomy hosts). The bet: the old picker died because it drew
// the WHOLE tree at once; every variation here draws a keyboard-fast slice
// of it instead, and the full Org → Scope Type → Scope → Context Item chain
// (+ Projects/Tasks at the bottom) stays one gesture away.
//
// Everything is REAL data (your orgs / scopes / fields / projects / tasks).
// Only final saves are faked (console + toast), per the lab convention.

import React, { useMemo, useState } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CardLoading } from "@/components/matrx/LoadingComponents";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import {
  usePickerData,
  useSharpSelection,
  type PickerData,
} from "./engine";
import { QuickPick } from "./QuickPick";
import { CompactTree } from "./CompactTree";
import {
  BreadcrumbDemo,
  ChipRailDemo,
  CommandChipDemo,
  PaletteInputDemo,
  SelectionFooter,
  SlotLinkDemo,
  StatusDotRowsDemo,
  TapTargetDemo,
} from "./triggers";

/* ── gallery card chrome ───────────────────────────────────────────────── */

function DemoCard({
  code,
  title,
  blurb,
  modes,
  children,
  className,
}: {
  code: string;
  title: string;
  blurb: string;
  modes: string[];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      <div className="border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">
            {code}
          </span>
          <span className="text-sm font-semibold">{title}</span>
          <span className="ml-auto flex gap-1">
            {modes.map((m) => (
              <span
                key={m}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {m}
              </span>
            ))}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{blurb}</p>
      </div>
      <div className="flex flex-1 items-start p-4">{children}</div>
    </div>
  );
}

/* ── wired use case: filter mode against REAL project↔scope links ─────── */

function FilterDemo({ data }: { data: PickerData }) {
  const sel = useSharpSelection();

  // ProjectNode.scope_ids on the Redux tree is the real assignment data —
  // filtering here exercises the actual ctx_scope_assignments links.
  const allProjects = useMemo(
    () => data.orgs.flatMap((o) => o.projects.map((p) => ({ p, org: o }))),
    [data.orgs],
  );
  const filtered = useMemo(() => {
    const scopeIds = sel.selection.scopeIds;
    const orgIds = sel.selection.orgIds;
    if (scopeIds.length === 0 && orgIds.length === 0) return allProjects;
    return allProjects.filter(
      ({ p, org }) =>
        p.scope_ids.some((id) => scopeIds.includes(id)) ||
        orgIds.includes(org.id),
    );
  }, [allProjects, sel.selection.scopeIds, sel.selection.orgIds]);

  return (
    <div className="flex w-full flex-wrap items-start gap-4">
      <div className="w-[300px] shrink-0 overflow-hidden rounded-md border border-border">
        <QuickPick
          data={data}
          sel={sel}
          height={220}
          allowCreate={false}
          placeholder="Filter by context…"
          footer={
            <SelectionFooter sel={sel} hint="Filter emits live — no save" />
          }
        />
      </div>
      <div className="min-w-[240px] flex-1">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Your projects — filtered live via real scope links
        </div>
        <div className="h-[264px] overflow-y-auto rounded-md border border-border scrollbar-thin">
          {filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
              No project is linked to the selected context yet.
            </div>
          ) : (
            filtered.map(({ p, org }) => (
              <div
                key={p.id}
                className="flex h-7 items-center gap-2 border-b border-border/50 px-2.5 last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {p.name}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground/70">
                  {org.name}
                </span>
                {p.scope_ids.map((id) => {
                  const fs = data.flatScopes.find((x) => x.scope.id === id);
                  if (!fs) return null;
                  const c = resolveColor(fs.type);
                  return (
                    <span
                      key={id}
                      className={cn(
                        "shrink-0 rounded border px-1 py-px text-[10px]",
                        c.fg,
                        c.border,
                      )}
                    >
                      {fs.scope.name}
                    </span>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ── standalone frames (pinned open, proving the size claims) ──────────── */

function StandaloneQuickPick({ data }: { data: PickerData }) {
  const sel = useSharpSelection();
  return (
    <div className="w-[270px] overflow-hidden rounded-md border border-border">
      <QuickPick
        data={data}
        sel={sel}
        height={260}
        footer={<SelectionFooter sel={sel} />}
      />
    </div>
  );
}

function StandaloneTree({ data }: { data: PickerData }) {
  const sel = useSharpSelection();
  return (
    <div className="w-[340px] overflow-hidden rounded-md border border-border">
      <CompactTree
        data={data}
        sel={sel}
        height={276}
        footer={<SelectionFooter sel={sel} />}
      />
    </div>
  );
}

/* ── page ──────────────────────────────────────────────────────────────── */

export default function SharpContextLabPage() {
  const data = usePickerData();
  const [nonce, setNonce] = useState(0); // remount demos after retry

  return (
    <div className="min-h-dvh bg-textured">
      <div className="mx-auto max-w-[1200px] space-y-8 p-5 lg:p-8">
        <header className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">
            Context Lab · ui-sharp · real data · saves to console
          </div>
          <h1 className="text-2xl font-bold">
            The quick-pick context picker
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Modeled on the VS Code quick pick and Finder&apos;s column view.
            Seven triggers, five picker bodies — every one reaches Org → Scope
            Type → Scope → Context Item, keeps Projects and Tasks at the
            bottom, supports multi and single select, and fits the space its
            host actually has.
          </p>
        </header>

        {data.loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <CardLoading />
            <CardLoading />
          </div>
        ) : data.error && data.orgs.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            <span className="flex-1 text-destructive">{data.error}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                data.retry();
                setNonce((n) => n + 1);
              }}
            >
              <RotateCw className="mr-1.5 h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        ) : data.orgs.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            No organizations found for your account — create one to use the
            pickers.
          </div>
        ) : (
          <div key={nonce} className="space-y-8">
            {/* triggers */}
            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Triggers — seven hosts, one system
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <DemoCard
                  code="T1"
                  title="Command chip"
                  blurb="Status-bar style chip for headers/toolbars. Opens the Quick Pick; toggles apply LIVE (active-context semantics, write logged for Surface A)."
                  modes={["active", "multi"]}
                >
                  <CommandChipDemo data={data} />
                </DemoCard>
                <DemoCard
                  code="T2"
                  title="Palette input"
                  blurb="A search box that IS the picker — click and you are already typing. For the agent composer: pick buckets, hit Use."
                  modes={["buckets", "multi"]}
                >
                  <PaletteInputDemo data={data} />
                </DemoCard>
                <DemoCard
                  code="T3"
                  title="Tap-target pair"
                  blurb="TapTargetButtonGroup (set + clear) for icon rails — zero padding around the tap components, count lives in the pill. Opens the Compact Tree."
                  modes={["buckets", "multi"]}
                >
                  <TapTargetDemo data={data} />
                </DemoCard>
                <DemoCard
                  code="T4"
                  title="Breadcrumb path"
                  blurb="Shows the deepest pick as a real path (Org › Type › Scope, +n). Opens the Miller columns for roomy hosts."
                  modes={["buckets", "multi"]}
                >
                  <BreadcrumbDemo data={data} />
                </DemoCard>
                <DemoCard
                  code="T5"
                  title="Chip rail"
                  blurb="The trigger IS the summary: removable per-scope chips in a fixed-height rail, dashed + to open the Org Rail. No layout shift, ever."
                  modes={["buckets", "multi"]}
                >
                  <ChipRailDemo data={data} />
                </DemoCard>
                <DemoCard
                  code="T6"
                  title="Row status dot"
                  blurb="A 20px cell for dense lists (your real tasks below): amber dash = untagged, green count = tagged. Opens a per-row Quick Pick with Save (assignment mode)."
                  modes={["assignment", "multi"]}
                >
                  <StatusDotRowsDemo data={data} />
                </DemoCard>
                <DemoCard
                  code="T7"
                  title="Slot link"
                  blurb="One quiet button on an entity card. Opens Jump Assign: single-select, two keystrokes, all the way down to a context field."
                  modes={["single", "item-level"]}
                >
                  <SlotLinkDemo data={data} />
                </DemoCard>
                <DemoCard
                  code="UC"
                  title="Filter a list"
                  blurb="Filter mode: zero save side-effects, emits live. The project list on the right filters through your REAL project↔scope links."
                  modes={["filter", "multi"]}
                  className="md:col-span-2"
                >
                  <FilterDemo data={data} />
                </DemoCard>
              </div>
            </section>

            {/* insides pinned open */}
            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Insides pinned open — the size claims, proven
              </h2>
              <div className="flex flex-wrap items-start gap-4">
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">
                    I1 · Quick Pick at 270px — the VS Code case. Arrow keys +
                    Enter toggle; → drills into a scope&apos;s fields; a miss
                    creates inline.
                  </div>
                  <StandaloneQuickPick data={data} />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">
                    I2 · Compact Tree at 340px — all three orgs, collapsed to
                    counts. Hover any level for its “+” (create at any level).
                  </div>
                  <StandaloneTree data={data} />
                </div>
                <div className="max-w-[320px] space-y-1.5 text-xs text-muted-foreground">
                  <div className="font-medium">Also in the triggers above:</div>
                  <div>I3 · Miller Columns — open T4 (roomy, four columns, whole depth at once).</div>
                  <div>I4 · Org Rail — open T5 (Slack-style org squares; Projects/Tasks pinned at the rail bottom).</div>
                  <div>I5 · Jump Assign — open T7 (strict single-select, scope → field, closes on pick).</div>
                  <div className="pt-1 text-muted-foreground/70">
                    Every body reaches context items; every body lists
                    Projects and Tasks at the bottom; adds are previewed
                    (console + toast) because a demo must not write your real
                    tree.
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
