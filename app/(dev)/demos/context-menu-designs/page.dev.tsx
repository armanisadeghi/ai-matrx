"use client";

/**
 * Right-click menu — three competing designs, side by side, with real
 * right-clicks (Arman, 2026-10-02). Today's menu for a /data-v2 table row, and
 * Designs 1–3 for the same object, over one shared catalog of rows
 * (features/context-menu-v3/designs/catalog.ts). The counts under the tabs are
 * walked from each design's real MenuModel (`buildMenuModel`), never typed in:
 * "reachable" is today's 27 generic row ids found anywhere in the design's
 * tree; ✓ means every today id (submenu contents included) is still there.
 *
 * Desktop menus are the package's ContextMenuPanel wherever it can express
 * the design; the strip-after-rows designs use the demo-local twin
 * (DesignMenuPanel). Phone is the package's ActionSheet. Rows run nothing:
 * every choice toasts "Would run: <label>".
 */

import * as React from "react";
import { CLINIC_TABLES, DESIGN3_TOP_ROW_CAP, DESIGN_TABS, buildDesign, type DesignKey } from "@/features/context-menu-v3/designs/catalog";
import { fullModel, measure, type DesignMetrics } from "@/features/context-menu-v3/designs/model";
import { DesignInstance, firstWord, wouldRun } from "@/features/context-menu-v3/designs/DesignInstance";

type Tab = DesignKey | "compare";

const TABS: { key: Tab; label: string }[] = [...DESIGN_TABS, { key: "compare", label: "Compare" }];

function metricsFor(design: DesignKey, textSelected: boolean, viewer: boolean): DesignMetrics {
  const name = CLINIC_TABLES[0]?.name ?? "";
  const spec = buildDesign(design, { selection: textSelected ? firstWord(name) : null, viewer, name });
  return measure(fullModel(spec, wouldRun).model);
}

function MetricsLine({ m }: { m: DesignMetrics }) {
  return (
    <p className="text-xs tabular-nums text-muted-foreground" title={m.missing.length ? `Missing: ${m.missing.join(", ")}` : undefined}>
      Top-level rows: <span className="font-semibold text-foreground">{m.topRows}</span>
      {" · "}Clicks to Archive: <span className="font-semibold text-foreground">{m.clicksToArchive ?? "—"}</span>
      {" · "}Rows lossless:{" "}
      <span className={`font-semibold ${m.lossless ? "text-success" : "text-destructive"}`}>{m.lossless ? "✓" : "✗"}</span> ({m.reachable} of{" "}
      {m.total} today rows reachable)
    </p>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <label className="flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-primary" />
      {label}
    </label>
  );
}

function CapNote() {
  return <p className="text-xs text-muted-foreground">Cap: {DESIGN3_TOP_ROW_CAP} top rows · a 6th fails the build check</p>;
}

export default function ContextMenuDesignsPage() {
  const [tab, setTab] = React.useState<Tab>("d1");
  const [textSelected, setTextSelected] = React.useState(false);
  const [viewer, setViewer] = React.useState(false);
  const [phone, setPhone] = React.useState(false);

  const metrics = React.useMemo(() => {
    const out = {} as Record<DesignKey, DesignMetrics>;
    for (const { key } of DESIGN_TABS) out[key] = metricsFor(key, textSelected, viewer);
    return out;
  }, [textSelected, viewer]);

  const shown: DesignKey[] = tab === "compare" ? DESIGN_TABS.map((t) => t.key) : [tab];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-textured">
      <div className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-card/50 px-4 py-1.5">
        <div role="tablist" aria-label="Design" className="flex max-w-full overflow-x-auto rounded-md border border-border p-0.5">
          {TABS.map((t) => (
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
        <div className="flex flex-wrap items-center gap-x-3">
          <Toggle label="Text selected" checked={textSelected} onChange={setTextSelected} />
          <Toggle label="Viewer rights" checked={viewer} onChange={setViewer} />
          <Toggle label="Phone" checked={phone} onChange={setPhone} />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3">
        {tab === "compare" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {shown.map((key, i) => (
              <section key={key} className="min-w-0 space-y-1.5">
                <h2 className="text-sm font-semibold">{DESIGN_TABS.find((t) => t.key === key)?.label}</h2>
                <MetricsLine m={metrics[key]} />
                {key === "d3" ? <CapNote /> : null}
                <DesignInstance design={key} textSelected={textSelected} viewer={viewer} phone={phone} primary={i === 0} />
              </section>
            ))}
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-2">
            <MetricsLine m={metrics[tab]} />
            {tab === "d3" ? <CapNote /> : null}
            <DesignInstance key={tab} design={tab} textSelected={textSelected} viewer={viewer} phone={phone} primary />
          </div>
        )}
      </div>
    </div>
  );
}
