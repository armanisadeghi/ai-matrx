"use client";

// HowItWorks — the kit drawn as the thing it is: your table → a connection → the
// agent's variable → the workflow that runs it. One lane per binding. Boxes are
// plain styled cards; the connectors are inline SVG so they stay crisp in both
// themes (stroke = currentColor on a muted token).

import { BrainCircuit, Link2, Table2, Workflow } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import type { KitBinding, KitManifest } from "../types";

function Connector() {
  return (
    <div className="flex shrink-0 items-center justify-center text-border xl:w-10" aria-hidden>
      {/* horizontal on wide screens */}
      <svg className="hidden h-4 w-10 xl:block" viewBox="0 0 40 16" fill="none">
        <path d="M0 8 H32" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
        <path d="M30 3 L37 8 L30 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {/* vertical on phones */}
      <svg className="h-7 w-4 xl:hidden" viewBox="0 0 16 28" fill="none">
        <path d="M8 0 V20" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
        <path d="M3 18 L8 25 L13 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Node({
  icon,
  eyebrow,
  title,
  children,
  tone,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  tone: "table" | "link" | "agent" | "workflow";
}) {
  const toneClass = {
    table: "text-chart-2 bg-chart-2/10",
    link: "text-chart-4 bg-chart-4/10",
    agent: "text-primary bg-primary/10",
    workflow: "text-chart-3 bg-chart-3/10",
  }[tone];
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", toneClass)}>{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{eyebrow}</span>
      </div>
      <div className="mt-2 text-sm font-medium leading-snug text-foreground">{title}</div>
      {children && <div className="mt-1 text-xs leading-snug text-muted-foreground">{children}</div>}
    </div>
  );
}

/** `{{model_selection_guidance}}`, breakable only at its underscores — never mid-word. */
function VariableName({ name }: { name: string }) {
  const parts = name.split("_");
  return (
    <code className="font-mono text-[12.5px]">
      {"{{"}
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && (
            <>
              _<wbr />
            </>
          )}
        </span>
      ))}
      {"}}"}
    </code>
  );
}

export function describeBinding(b: KitBinding): string {
  switch (b.semantic_type) {
    case "collection":
      return `Every row becomes one line${b.limit ? ` (up to ${b.limit})` : ""}`;
    case "reference":
      return "One row, written out in full";
    case "value":
      return `One value${b.field_key ? ` — the "${b.field_key}" column` : ""}`;
    default:
      return "Read on every run";
  }
}

export function HowItWorks({ manifest }: { manifest: KitManifest }) {
  const lanes = manifest.agents.flatMap((agent) =>
    agent.bindings.map((b) => {
      const table = manifest.tables.find((t) => t.key === b.binding.table_key);
      const workflows = manifest.workflows.filter((w) =>
        JSON.stringify(w.definition ?? {}).includes(`{{agent:${agent.key}}}`),
      );
      return { agent, b, table, workflows };
    }),
  );
  if (lanes.length === 0) return null;
  return (
    <div className="space-y-3">
      {lanes.map(({ agent, b, table, workflows }) => (
        <div
          key={`${agent.key}:${b.variable}`}
          className="flex flex-col items-stretch rounded-xl border border-dashed border-border bg-muted/20 p-3 xl:flex-row xl:items-center"
        >
          <Node tone="table" icon={<Table2 className="h-3.5 w-3.5" />} eyebrow="Your table" title={table?.name ?? b.binding.table_key}>
            {table ? `${table.records.length} example rows · ${table.fields.length} columns` : null}
          </Node>
          <Connector />
          <Node tone="link" icon={<Link2 className="h-3.5 w-3.5" />} eyebrow="Connection" title={describeBinding(b.binding)}>
            {b.binding.transform?.template ? (
              <code className="mt-0.5 block truncate rounded bg-muted px-1 py-0.5 font-mono text-[10.5px] text-foreground/80" title={b.binding.transform.template}>
                {b.binding.transform.template}
              </code>
            ) : null}
          </Node>
          <Connector />
          <Node
            tone="agent"
            icon={<BrainCircuit className="h-3.5 w-3.5" />}
            eyebrow="Agent variable"
            title={<VariableName name={b.variable} />}
          >
            in {agent.name}
          </Node>
          {workflows.length > 0 && (
            <>
              <Connector />
              <Node tone="workflow" icon={<Workflow className="h-3.5 w-3.5" />} eyebrow="Workflow" title={workflows.map((w) => w.name).join(", ")}>
                runs the agent
              </Node>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
