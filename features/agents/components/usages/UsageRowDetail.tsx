/**
 * Expanded detail for one usage row — per-finding stored-vs-current diff plus a
 * collapsed view of the stored config bundle.
 */

"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DRIFT_SEVERITY_META } from "./severity";
import type { AgentUsageRow, UsageDriftFinding } from "@/features/agents/redux/usages/usages.types";

const DRIFT_CLASS_LABEL: Record<string, string> = {
  missing_variable: "Variable removed",
  unmet_required_variable: "Required variable not supplied",
  missing_context_slot: "Context slot renamed or removed",
  stale_pin: "Pinned behind the active version",
  source_snapshot_stale: "Behind its source agent",
  agent_unavailable: "Agent archived or disabled",
};

function findingKeys(f: UsageDriftFinding): string[] {
  const keys = (f.detail as { keys?: unknown })?.keys;
  return Array.isArray(keys) ? keys.filter((k): k is string => typeof k === "string") : [];
}

function FindingRow({ finding }: { finding: UsageDriftFinding }) {
  const meta = DRIFT_SEVERITY_META[finding.severity];
  const Icon = meta.icon;
  const keys = findingKeys(finding);
  return (
    <div className={cn("rounded-md border p-2", meta.borderClass, meta.bgClass)}>
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5 shrink-0", meta.textClass)} aria-hidden />
        <span className={cn("text-xs font-medium", meta.textClass)}>
          {DRIFT_CLASS_LABEL[finding.driftClass] ?? finding.driftClass}
        </span>
      </div>
      {keys.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {keys.map((k) => (
            <code
              key={k}
              className="rounded bg-background/70 px-1.5 py-0.5 font-mono text-[11px] text-foreground"
            >
              {k}
            </code>
          ))}
        </div>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">{meta.description}</p>
    </div>
  );
}

export function UsageRowDetail({ row }: { row: AgentUsageRow }) {
  const [showConfig, setShowConfig] = useState(false);
  const effective = (row.config?.effective ?? null) as {
    variables?: string[];
    required_variables?: string[];
    context_slots?: string[];
  } | null;

  return (
    <div className="space-y-2 border-t border-border/60 bg-muted/20 px-3 py-2.5">
      {row.findings.length > 0 ? (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {row.findings.map((f, i) => (
            <FindingRow key={`${f.driftClass}-${i}`} finding={f} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No drift detected for this usage.</p>
      )}

      {effective && (
        <div className="grid gap-2 sm:grid-cols-2 text-[11px]">
          <ContractColumn label="Declared variables" items={effective.variables ?? []} required={effective.required_variables ?? []} />
          <ContractColumn label="Declared context slots" items={effective.context_slots ?? []} />
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowConfig((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        {showConfig ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Stored configuration
      </button>
      {showConfig && (
        <pre className="max-h-48 overflow-auto rounded-md border border-border bg-card p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
          {JSON.stringify(stripEffective(row.config), null, 2)}
        </pre>
      )}
    </div>
  );
}

function ContractColumn({
  label,
  items,
  required = [],
}: {
  label: string;
  items: string[];
  required?: string[];
}) {
  return (
    <div className="rounded-md border border-border bg-card/60 p-2">
      <p className="mb-1 font-medium text-muted-foreground">{label}</p>
      {items.length === 0 ? (
        <span className="text-muted-foreground/60">None</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {items.map((k) => (
            <code
              key={k}
              className={cn(
                "rounded px-1 py-0.5 font-mono text-[10px]",
                required.includes(k)
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-foreground",
              )}
              title={required.includes(k) ? "Required" : undefined}
            >
              {k}
              {required.includes(k) ? " *" : ""}
            </code>
          ))}
        </div>
      )}
    </div>
  );
}

function stripEffective(config: Record<string, unknown> | null): Record<string, unknown> {
  if (!config) return {};
  const { effective: _omit, ...rest } = config;
  return rest;
}
