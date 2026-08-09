"use client";

// CleanupDebugPanel — total visibility into a cleanup run. Stats, the exact
// per-operation change counts (including disabled ones), and the raw XML
// payload that "Copy for AI" produces. No secrets: what the engine saw and did
// is all here.

import { cn } from "@/lib/utils";
import type { CleanupReport } from "@/lib/content-cleanup/types";
import { buildCleanupDebugXml } from "@/lib/content-cleanup/debug";
import {
  MOBILE_TABLE,
  MOBILE_TABLE_CELL,
  MOBILE_TABLE_FROZEN_CELL,
  MOBILE_TABLE_FROZEN_HEAD,
  MOBILE_TABLE_ROW,
} from "@/components/official/mobile-table/mobileTable";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card px-2 py-1.5">
      <div className="text-[0.5625rem] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-xs tabular-nums text-foreground">{value}</div>
    </div>
  );
}

export function CleanupDebugPanel({
  report,
  debugContext,
}: {
  report: CleanupReport;
  debugContext?: { noteId?: string; noteLabel?: string };
}) {
  const { stats } = report;
  const xml = buildCleanupDebugXml(report, {
    ...debugContext,
    timestamp: new Date().toISOString(),
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Before" value={`${stats.charsBefore} ch`} />
        <Stat label="After" value={`${stats.charsAfter} ch`} />
        <Stat
          label="Delta"
          value={`${stats.charsAfter - stats.charsBefore} ch`}
        />
        <Stat label="Protected" value={`${stats.protectedRegions} regions`} />
        <Stat label="Protected ch" value={stats.protectedChars} />
        <Stat label="Total edits" value={stats.totalChanges} />
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <table className={cn("text-xs", MOBILE_TABLE)}>
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[0.625rem] uppercase tracking-wide text-muted-foreground">
              <th className={cn("px-2 py-1 font-medium", MOBILE_TABLE_FROZEN_HEAD)}>Operation</th>
              <th className={cn("px-2 py-1 font-medium", MOBILE_TABLE_CELL)}>State</th>
              <th className={cn("px-2 py-1 text-right font-medium", MOBILE_TABLE_CELL)}>Edits</th>
            </tr>
          </thead>
          <tbody>
            {report.operations.map((op) => (
              <tr key={op.id} className={cn("border-b border-border/50 last:border-0", MOBILE_TABLE_ROW)}>
                <td className={cn("px-2 py-1 text-foreground", MOBILE_TABLE_FROZEN_CELL)}>{op.label}</td>
                <td className={cn("px-2 py-1", MOBILE_TABLE_CELL)}>
                  <span
                    className={cn(
                      "rounded px-1 py-px text-[0.5625rem] font-medium",
                      op.enabled
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {op.enabled ? "on" : "off"}
                  </span>
                </td>
                <td className={cn("px-2 py-1 text-right font-mono tabular-nums text-muted-foreground", MOBILE_TABLE_CELL)}>
                  {op.changes}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="rounded-md border border-border">
        <summary className="cursor-pointer select-none px-2 py-1.5 text-xs font-medium text-foreground">
          Raw debug payload (XML)
        </summary>
        <pre className="max-h-64 overflow-auto border-t border-border bg-muted/30 px-2 py-2 text-[0.625rem] leading-relaxed text-muted-foreground">
          {xml}
        </pre>
      </details>
    </div>
  );
}
