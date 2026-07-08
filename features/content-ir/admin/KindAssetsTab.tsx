"use client";

/**
 * Assets tab — the kind's shape-doctor row (all 7 asset cells with their
 * detail strings, computed server-side by the SAME pure doctor the CLI runs)
 * plus the live lists behind those cells: attributed render_block skills,
 * content blocks demonstrating the kind, kind_component and kind_surface
 * rows.
 */

import { Check, Minus, TriangleAlert, X } from "lucide-react";
import {
  ASSET_COLUMNS,
  type AssetColumn,
  type AssetStatus,
} from "@/features/content-ir/registry/shape-doctor";
import type { KindDetailData } from "@/features/content-ir/admin/kind-detail-types";

const COLUMN_HEADING: Record<AssetColumn, string> = {
  definition: "Definition",
  example: "Example",
  gate_structural: "Structural gate",
  component: "Component",
  skill: "Skill",
  content_block: "Content block",
  surface: "Surface",
};

function StatusBadge({ status }: { status: AssetStatus }) {
  switch (status) {
    case "ok":
      return (
        <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
          <Check className="h-3 w-3" /> ok
        </span>
      );
    case "warn":
      return (
        <span className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
          <TriangleAlert className="h-3 w-3" /> warn
        </span>
      );
    case "missing":
      return (
        <span className="flex items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-300">
          <X className="h-3 w-3" /> missing
        </span>
      );
    case "n/a":
      return (
        <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          <Minus className="h-3 w-3" /> n/a
        </span>
      );
  }
}

function ListSection({
  title,
  emptyText,
  children,
  count,
}: {
  title: string;
  emptyText: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-card">
      <div className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">
        {title} <span className="text-xs font-normal text-muted-foreground">({count})</span>
      </div>
      {count === 0 ? (
        <p className="px-3 py-2.5 text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="p-2">{children}</div>
      )}
    </section>
  );
}

export default function KindAssetsTab({ detail }: { detail: KindDetailData }) {
  return (
    <div className="mx-auto max-w-4xl space-y-3">
      {/* Doctor row cells */}
      <section className="rounded-md border border-border bg-card">
        <div className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">
          Shape-doctor row (live, recomputed — stored validation_status is
          never trusted)
        </div>
        <div className="divide-y divide-border/60">
          {ASSET_COLUMNS.map((col) => {
            const cell = detail.doctorRow.assets[col];
            return (
              <div key={col} className="flex items-start gap-3 px-3 py-1.5">
                <span className="w-32 shrink-0 text-xs font-medium text-foreground">
                  {COLUMN_HEADING[col]}
                </span>
                <StatusBadge status={cell.status} />
                <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                  {cell.detail ?? "—"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Skills */}
      <ListSection
        title="Render-block skills teaching this kind"
        emptyText="No render_block skill teaches this kind (R9: one per kind per syntax)."
        count={detail.skills.length}
      >
        <ul className="space-y-1">
          {detail.skills.map((s) => (
            <li key={`${s.skillId}-${s.syntax}`} className="flex items-center gap-2">
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                {s.skillId}
              </code>
              <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                {s.syntax}
              </span>
            </li>
          ))}
        </ul>
      </ListSection>

      {/* Content blocks */}
      <ListSection
        title="Content blocks demonstrating this kind"
        emptyText={`No content block references "__kind": "${detail.kind}".`}
        count={detail.contentBlocks.length}
      >
        <ul className="space-y-1">
          {detail.contentBlocks.map((b) => (
            <li key={b.id} className="flex items-center gap-2 text-xs">
              <span className="text-foreground">{b.label}</span>
              <code className="font-mono text-[11px] text-muted-foreground">
                {b.id}
              </code>
            </li>
          ))}
        </ul>
      </ListSection>

      {/* Components */}
      <ListSection
        title="kind_component rows"
        emptyText="No kind_component rows — compiled/legacy render paths (if any) are noted in the doctor cell above."
        count={detail.components.length}
      >
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-1 font-medium">Platform</th>
              <th className="px-2 py-1 font-medium">Role</th>
              <th className="px-2 py-1 font-medium">Component key</th>
              <th className="px-2 py-1 font-medium">Source</th>
              <th className="px-2 py-1 font-medium">Active</th>
              <th className="px-2 py-1 font-medium">Default</th>
            </tr>
          </thead>
          <tbody>
            {detail.components.map((c) => (
              <tr key={c.id} className="border-t border-border/60">
                <td className="px-2 py-1 text-foreground">{c.platform}</td>
                <td className="px-2 py-1 text-foreground">{c.role}</td>
                <td className="px-2 py-1 font-mono text-foreground">{c.componentKey}</td>
                <td className="px-2 py-1 text-muted-foreground">{c.source}</td>
                <td className="px-2 py-1 text-muted-foreground">
                  {c.isActive ? "yes" : "no"}
                </td>
                <td className="px-2 py-1 text-muted-foreground">
                  {c.isDefault ? "yes" : "no"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ListSection>

      {/* Surfaces */}
      <ListSection
        title="kind_surface rows (detection)"
        emptyText="No detection surface registered (legitimate until Stage 5)."
        count={detail.surfaces.length}
      >
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-1 font-medium">Surface type</th>
              <th className="px-2 py-1 font-medium">Token</th>
              <th className="px-2 py-1 font-medium">Parser strategy</th>
              <th className="px-2 py-1 font-medium">Streaming</th>
              <th className="px-2 py-1 font-medium">Active</th>
            </tr>
          </thead>
          <tbody>
            {detail.surfaces.map((s) => (
              <tr key={s.id} className="border-t border-border/60">
                <td className="px-2 py-1 text-foreground">{s.surfaceType}</td>
                <td className="px-2 py-1 font-mono text-foreground">{s.token}</td>
                <td className="px-2 py-1 text-muted-foreground">{s.parserStrategy}</td>
                <td className="px-2 py-1 text-muted-foreground">
                  {s.streaming ? "yes" : "no"}
                </td>
                <td className="px-2 py-1 text-muted-foreground">
                  {s.isActive ? "yes" : "no"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ListSection>
    </div>
  );
}
