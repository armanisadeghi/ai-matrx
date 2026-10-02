"use client";

// features/context-menu-v3/designs/Metrics.tsx
//
// The live counts under every design: walked from the design's own menu, never typed in.
// "Lossless (N of 27)": today's 27 generic rows found anywhere in the design; ✓ when every
// today id, submenu contents included, is still reachable. Demo-only.

import * as React from "react";
import { CLINIC_TABLES, buildDesign, type DesignKey } from "./catalog";
import { firstWord } from "./ClinicTableList";
import { wouldRun } from "./DesignInstance";
import { fullModel, measure, type DesignMetrics } from "./model";
import { buildRound2, measureRound2, type Round2Key, type Round2Metrics } from "./round2";

export function metricsFor(design: DesignKey, textSelected: boolean, viewer: boolean): DesignMetrics {
  const name = CLINIC_TABLES[0]?.name ?? "";
  const spec = buildDesign(design, { selection: textSelected ? firstWord(name) : null, viewer, name });
  return measure(fullModel(spec, wouldRun).model);
}

export function round2MetricsFor(v: Round2Key, textSelected: boolean, viewer: boolean): Round2Metrics {
  const name = CLINIC_TABLES[0]?.name ?? "";
  return measureRound2(buildRound2(v, { name, selection: textSelected ? firstWord(name) : null, viewer, kindLabel: false }));
}

export function MetricsLine({ m }: { m: DesignMetrics | Round2Metrics }) {
  return (
    <p className="text-xs tabular-nums text-muted-foreground" title={m.missing.length ? `Missing: ${m.missing.join(", ")}` : undefined}>
      Rows: <span className="font-semibold text-foreground">{m.topRows}</span>
      {"icons" in m ? (
        <>
          {" · "}Icons: <span className="font-semibold text-foreground">{m.icons}</span>
        </>
      ) : null}
      {" · "}Clicks to Archive: <span className="font-semibold text-foreground">{m.clicksToArchive ?? "—"}</span>
      {" · "}Lossless{" "}
      <span className={`font-semibold ${m.lossless ? "text-success" : "text-destructive"}`}>{m.lossless ? "✓" : "✗"}</span> {m.reachable}/{m.total}
    </p>
  );
}

