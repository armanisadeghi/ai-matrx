"use client";

/**
 * Right-click menu designs, with real right-clicks (Arman, 2026-10-02).
 *
 * Round 2 (V1–V3) follows his A–E structure and is BUILT FROM the verb contract
 * (features/context-menu-v3/designs/verbs.ts + round2.ts): icon strip(s) of the
 * menu's own verbs bound to the table's handlers, filter, 4 table rows, "More
 * table options", Intelligence, then the platform utility row. Round 1 (Today,
 * Designs 1–3) sits under "Earlier". Counts are walked from each menu, never
 * typed in: "reachable" is today's 27 generic row ids found anywhere in the
 * design; ✓ means every today id (submenu contents included) is still there.
 * Every desktop menu draws at the round-2 sizes (designs/sizing.ts, SIZING.md).
 * Rows run nothing: every choice toasts "Would run: <label>".
 * The static grid of every design: ./all (/demos/context-menu-designs/all).
 */

import * as React from "react";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { DESIGN3_TOP_ROW_CAP, DESIGN_TABS, type DesignKey } from "@/features/context-menu-v3/designs/catalog";
import type { DesignMetrics } from "@/features/context-menu-v3/designs/model";
import { DesignInstance } from "@/features/context-menu-v3/designs/DesignInstance";
import { MetricsLine, metricsFor, round2MetricsFor } from "@/features/context-menu-v3/designs/Metrics";
import { ROUND2_TABS, type Round2Key, type Round2Metrics } from "@/features/context-menu-v3/designs/round2";
import { Round2Instance } from "@/features/context-menu-v3/designs/Round2Instance";
import { PACKAGE_SHEET_CSS } from "@/features/context-menu-v3/designs/sizing";

type Tab = Round2Key | "compare2" | DesignKey | "compare";

const NEW_TABS: { key: Tab; label: string }[] = [...ROUND2_TABS, { key: "compare2", label: "Compare" }];
const EARLIER_TABS: { key: Tab; label: string }[] = [...DESIGN_TABS, { key: "compare", label: "Compare" }];

const isRound2 = (t: Tab): t is Round2Key => t === "v1" || t === "v2" || t === "v3";

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange(v: boolean): void; disabled?: boolean }) {
  return (
    <label className={`flex h-8 items-center gap-1.5 whitespace-nowrap text-sm ${disabled ? "opacity-40" : "cursor-pointer"}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-primary" />
      {label}
    </label>
  );
}

function TabGroup({ label, tabs, tab, setTab }: { label: string; tabs: { key: Tab; label: string }[]; tab: Tab; setTab(t: Tab): void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div role="tablist" aria-label={label} className="flex max-w-full overflow-x-auto rounded-md border border-border p-0.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`h-7 whitespace-nowrap rounded px-2.5 text-sm ${tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ContextMenuDesignsPage() {
  const [tab, setTab] = React.useState<Tab>("v3");
  const [textSelected, setTextSelected] = React.useState(false);
  const [viewer, setViewer] = React.useState(false);
  const [phone, setPhone] = React.useState(false);
  const [kindLabel, setKindLabel] = React.useState(false);

  const metrics = React.useMemo(() => {
    const out = {} as Record<DesignKey, DesignMetrics>;
    for (const { key } of DESIGN_TABS) out[key] = metricsFor(key, textSelected, viewer);
    return out;
  }, [textSelected, viewer]);
  const metrics2 = React.useMemo(() => {
    const out = {} as Record<Round2Key, Round2Metrics>;
    for (const { key } of ROUND2_TABS) out[key] = round2MetricsFor(key, textSelected, viewer);
    return out;
  }, [textSelected, viewer]);

  const round2Shown = tab === "compare2" || isRound2(tab);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-textured">
      <style>{PACKAGE_SHEET_CSS}</style>
      <div className="flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-card/50 px-4 py-1.5">
        <TabGroup label="Round 2" tabs={NEW_TABS} tab={tab} setTab={setTab} />
        <TabGroup label="Earlier" tabs={EARLIER_TABS} tab={tab} setTab={setTab} />
        <Link href="/demos/context-menu-designs/all" className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-primary hover:bg-accent">
          <LayoutGrid className="h-4 w-4" />
          All, rendered
        </Link>
        <div className="flex flex-wrap items-center gap-x-3">
          <Toggle label="Text selected" checked={textSelected} onChange={setTextSelected} />
          <Toggle label="Viewer rights" checked={viewer} onChange={setViewer} />
          <Toggle label="Phone" checked={phone} onChange={setPhone} />
          <Toggle label="Kind label" checked={kindLabel} onChange={setKindLabel} disabled={!round2Shown} />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3">
        {tab === "compare2" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ROUND2_TABS.map(({ key, label }, i) => (
              <section key={key} className="min-w-0 space-y-1.5">
                <h2 className="text-sm font-semibold">{label}</h2>
                <MetricsLine m={metrics2[key]} />
                <Round2Instance variant={key} textSelected={textSelected} viewer={viewer} phone={phone} kindLabel={kindLabel} primary={i === 0} />
              </section>
            ))}
          </div>
        ) : tab === "compare" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {DESIGN_TABS.map(({ key, label }, i) => (
              <section key={key} className="min-w-0 space-y-1.5">
                <h2 className="text-sm font-semibold">{label}</h2>
                <MetricsLine m={metrics[key]} />
                {key === "d3" ? <p className="text-xs text-muted-foreground">Cap: {DESIGN3_TOP_ROW_CAP} top rows</p> : null}
                <DesignInstance design={key} textSelected={textSelected} viewer={viewer} phone={phone} primary={i === 0} />
              </section>
            ))}
          </div>
        ) : isRound2(tab) ? (
          <div className="mx-auto max-w-2xl space-y-2">
            <MetricsLine m={metrics2[tab]} />
            <Round2Instance key={tab} variant={tab} textSelected={textSelected} viewer={viewer} phone={phone} kindLabel={kindLabel} primary />
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-2">
            <MetricsLine m={metrics[tab]} />
            <DesignInstance key={tab} design={tab} textSelected={textSelected} viewer={viewer} phone={phone} primary />
          </div>
        )}
      </div>
    </div>
  );
}
