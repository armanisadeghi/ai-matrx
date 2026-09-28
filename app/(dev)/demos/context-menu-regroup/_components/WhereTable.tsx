"use client";

import { cn } from "@/lib/utils";
import type { RegroupAudit, AuditRow } from "@/features/context-menu-v3/regroup/grouping";

function proposedCell(row: AuditRow) {
  if (!row.proposedPlace) {
    return <span className="font-semibold text-destructive">No new home</span>;
  }
  const home = row.proposed;
  if (home?.kind === "merged") {
    return (
      <span className="text-amber-700 dark:text-amber-400">
        Merged with “{home.intoLabel}” in {home.groupLabel} ▸ (same name)
      </span>
    );
  }
  if (home?.kind === "page-first") return <span className="font-medium">Top level · first (this page’s own)</span>;
  if (home?.kind === "top" && home.note) {
    return (
      <span>
        {row.proposedPlace} <span className="text-muted-foreground">— {home.note}</span>
      </span>
    );
  }
  return <span>{row.proposedPlace}</span>;
}

export function WhereTable({ title, audit }: { title: string; audit: RegroupAudit | null }) {
  if (!audit) {
    return (
      <section className="rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
        <h3 className="mb-1 font-semibold text-foreground">{title}</h3>
        Reading this menu from the registry… (right-click it above if this does not fill in).
      </section>
    );
  }
  const lost = audit.lost;
  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-3 py-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">
          {audit.rows.length} items · {audit.currentRows} rows on open today → {audit.proposedRows} proposed
        </p>
      </header>
      {lost.length > 0 ? (
        <div className="border-b border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <b>{lost.length} item{lost.length === 1 ? "" : "s"} would be lost:</b> {lost.map((r) => r.label).join(", ")}
        </div>
      ) : (
        <div className="border-b border-border bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-400">
          Every item has a new home — nothing is lost.
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Item</th>
              <th className="px-3 py-1.5 font-medium">Today</th>
              <th className="px-3 py-1.5 font-medium">Proposed</th>
            </tr>
          </thead>
          <tbody>
            {audit.rows.map((row) => (
              <tr
                key={row.id}
                className={cn("border-t border-border", !row.proposedPlace && "bg-destructive/10")}
              >
                <td className="px-3 py-1.5">
                  <span className="font-medium">{row.label}</span>
                  {row.isSubmenu ? <span className="text-muted-foreground"> ▸</span> : null}
                  <span className="ml-2 font-mono text-[11px] text-muted-foreground">{row.id}</span>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{row.current}</td>
                <td className="px-3 py-1.5">{proposedCell(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
