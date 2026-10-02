"use client";

/**
 * Every right-click design, rendered open, side by side (Arman, 2026-10-02) — no right-click needed.
 * Each card draws the SAME panel component the clickable page opens (R2DesktopPanel for round 2,
 * the DesignMenuPanel twin for round 1), rendered in place via the design-system menu's `container`;
 * the popper wrapper is pinned into the card's flow by the scoped style below. Submenus, tooltips
 * and the filter all work. Round 2 also shows its phone sheet body. Counts walk each menu.
 */

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CLINIC_TABLES, DESIGN_TABS, buildDesign, type DesignKey } from "@/features/context-menu-v3/designs/catalog";
import { firstWord } from "@/features/context-menu-v3/designs/ClinicTableList";
import { DesignMenuPanel } from "@/features/context-menu-v3/designs/DesignMenuPanel";
import { wouldRun } from "@/features/context-menu-v3/designs/DesignInstance";
import { MetricsLine, metricsFor, round2MetricsFor } from "@/features/context-menu-v3/designs/Metrics";
import { designContext, fullModel } from "@/features/context-menu-v3/designs/model";
import { ROUND2_TABS, buildRound2, type Round2Key } from "@/features/context-menu-v3/designs/round2";
import { R2DesktopPanel, R2SheetBody } from "@/features/context-menu-v3/designs/Round2Menu";

const STATIC_CSS = `
[data-static-menu] [data-radix-popper-content-wrapper] { position: static !important; transform: none !important; min-width: 0 !important; z-index: auto !important; }
[data-static-menu] [data-radix-popper-content-wrapper] > [role="menu"] { animation: none !important; }
`;

const NAME = CLINIC_TABLES[0]?.name ?? "";
const WORD = firstWord(NAME);

type State = "none" | "text" | "viewer";
const STATE_LABEL: Record<State, string> = { none: "Nothing selected", text: "Text selected", viewer: "Viewer rights" };

function Card({ title, state, children }: { title: string; state: State; children: React.ReactNode }) {
  return (
    <section className="min-w-0 space-y-1.5">
      <h3 className="text-sm font-semibold">
        {title} <span className="font-normal text-muted-foreground">· {STATE_LABEL[state]}</span>
      </h3>
      {children}
    </section>
  );
}

function Round2Card({ v, state }: { v: Round2Key; state: State }) {
  // The card's menu slot: the panel renders into this element once it exists.
  const [slot, setSlot] = React.useState<HTMLDivElement | null>(null);
  const menu = buildRound2(v, { name: NAME, selection: state === "text" ? WORD : null, viewer: state === "viewer", kindLabel: false });
  return (
    <Card title={ROUND2_TABS.find((t) => t.key === v)?.label ?? v} state={state}>
      <MetricsLine m={round2MetricsFor(v, state === "text", state === "viewer")} />
      <div ref={setSlot} data-static-menu className="min-h-24">
        <R2DesktopPanel menu={menu} open onOpenChange={() => undefined} onRun={wouldRun} container={slot} />
      </div>
    </Card>
  );
}

function Round2PhoneCard({ v, state }: { v: Round2Key; state: State }) {
  const menu = buildRound2(v, { name: NAME, selection: state === "text" ? WORD : null, viewer: state === "viewer", kindLabel: false });
  return (
    <Card title={`${ROUND2_TABS.find((t) => t.key === v)?.label ?? v} phone`} state={state}>
      <div className="w-full max-w-[390px] overflow-hidden rounded-t-2xl border border-border bg-background shadow-sm">
        <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted-foreground/30" />
        <R2SheetBody menu={menu} onRun={wouldRun} />
      </div>
    </Card>
  );
}

function EarlierCard({ design, state }: { design: DesignKey; state: State }) {
  // The card's menu slot: the panel renders into this element once it exists.
  const [slot, setSlot] = React.useState<HTMLDivElement | null>(null);
  const spec = buildDesign(design, { selection: state === "text" ? WORD : null, viewer: false, name: NAME });
  const model = fullModel(spec, wouldRun).model;
  return (
    <Card title={DESIGN_TABS.find((t) => t.key === design)?.label ?? design} state={state}>
      <MetricsLine m={metricsFor(design, state === "text", false)} />
      <div ref={setSlot} data-static-menu className="min-h-24">
        <DesignMenuPanel
          model={model}
          arranged={designContext(model, spec.stripAfter)}
          point={{ x: 0, y: 0 }}
          open
          onOpenChange={() => undefined}
          onRun={wouldRun}
          container={slot}
        />
      </div>
    </Card>
  );
}

const GRID = "grid gap-x-6 gap-y-8 [grid-template-columns:repeat(auto-fill,minmax(min(100%,22.5rem),1fr))]";

export default function AllDesignsRenderedPage() {
  return (
    <div className="h-full overflow-auto bg-textured">
      <style>{STATIC_CSS}</style>
      <div className="mx-auto max-w-[120rem] space-y-8 px-4 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/demos/context-menu-designs" className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-primary hover:bg-accent">
            <ArrowLeft className="h-4 w-4" />
            Right-click demo
          </Link>
          <h1 className="text-base font-semibold">All designs, rendered</h1>
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Round 2 · desktop</h2>
          <div className={GRID}>
            {ROUND2_TABS.flatMap(({ key }) => (["none", "text", "viewer"] as State[]).map((s) => <Round2Card key={`${key}-${s}`} v={key} state={s} />))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Round 2 · phone</h2>
          <div className={GRID}>
            {ROUND2_TABS.flatMap(({ key }) => (["none", "viewer"] as State[]).map((s) => <Round2PhoneCard key={`${key}-${s}`} v={key} state={s} />))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Earlier · desktop</h2>
          <div className={GRID}>
            {DESIGN_TABS.flatMap(({ key }) => (["none", "text"] as State[]).map((s) => <EarlierCard key={`${key}-${s}`} design={key} state={s} />))}
          </div>
        </section>
      </div>
    </div>
  );
}
