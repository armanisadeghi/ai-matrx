"use client";

// HowItWorks — the kit drawn as the thing it is: one of your tables FANS OUT to every
// agent that reads it. One block per table: the table on the left, a branch per agent
// on the right, and inside each branch the agent's variables with the column (or the
// whole row / whole table) each one reads. When one table feeds several agents, the
// fan IS the lesson — edit one row, every agent follows.

import { ArrowDown, Table2, Workflow } from "lucide-react";
import { cn } from "@/utils/cn";
import { count } from "../format";
import type { KitAgent, KitBinding, KitManifest } from "../types";
import { AGENT_ICON } from "@/components/icons/domain-icons";

/** `{{model_selection_guidance}}`, breakable only at its underscores — never mid-word. */
function VariableName({ name }: { name: string }) {
  const parts = name.split("_");
  return (
    <code className="font-mono text-[12px] text-foreground">
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

/** What one variable reads, in the fewest words: a column, the whole row, or every row. */
function reads(b: KitBinding, labelOf: (key: string) => string): string {
  if (b.semantic_type === "value" && b.field_key) return labelOf(b.field_key);
  if (b.semantic_type === "reference") return "the whole row";
  if (b.semantic_type === "collection") return b.limit ? `every row (up to ${b.limit})` : "every row";
  return "the table";
}

interface Branch {
  agent: KitAgent;
  bindings: KitBinding[];
  variables: string[];
  workflows: string[];
}

export function HowItWorks({ manifest }: { manifest: KitManifest }) {
  const tableKeys = Array.from(
    new Set(manifest.agents.flatMap((a) => a.bindings.map((b) => b.binding.table_key))),
  );
  if (tableKeys.length === 0) return null;

  return (
    <div className="space-y-3">
      {tableKeys.map((tableKey) => {
        const table = manifest.tables.find((t) => t.key === tableKey);
        const labelOf = (k: string) => table?.fields.find((f) => f.key === k)?.label ?? k;
        const branches: Branch[] = manifest.agents
          .map((agent) => {
            const mine = agent.bindings.filter((b) => b.binding.table_key === tableKey);
            return {
              agent,
              bindings: mine.map((b) => b.binding),
              variables: mine.map((b) => b.variable),
              workflows: manifest.workflows
                .filter((w) => JSON.stringify(w.definition ?? {}).includes(`{{agent:${agent.key}}}`))
                .map((w) => w.name),
            };
          })
          .filter((b) => b.variables.length > 0);
        const fan = branches.length > 1;
        const collection = branches.some((b) => b.bindings.some((x) => x.semantic_type === "collection"));
        const template = branches.flatMap((b) => b.bindings).find((x) => x.transform?.template)?.transform?.template;

        return (
          <div key={tableKey} className="rounded-xl border border-dashed border-border bg-muted/20 p-3 sm:p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-stretch md:gap-0">
              {/* The table */}
              <div className="flex md:w-[34%] md:shrink-0 md:items-center">
                <div className="w-full rounded-lg border border-border bg-card p-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-chart-2/10 text-chart-2">
                      <Table2 className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Your table</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-foreground">{table?.name ?? tableKey}</p>
                  {table && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {count(table.records.length, "row")} · {count(table.fields.length, "column")}
                    </p>
                  )}
                  {template && collection && (
                    <code
                      className="mt-2 block truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-foreground/80"
                      title={template}
                    >
                      {template}
                    </code>
                  )}
                  {fan && (
                    <p className="mt-2 rounded-md bg-primary/8 px-2 py-1 text-[11px] font-medium text-primary">
                      Feeds {count(branches.length, "agent")} — edit it once, every one follows
                    </p>
                  )}
                </div>
              </div>

              {/* The fan: a trunk from the table, one branch per agent */}
              <div className="flex justify-center md:hidden" aria-hidden>
                <ArrowDown className="h-4 w-4 text-border" />
              </div>
              <div className="relative md:flex-1 md:pl-10">
                {/* trunk (wide screens): table → the branch spine */}
                <span aria-hidden className="absolute left-0 top-1/2 hidden h-px w-5 -translate-y-1/2 border-t-2 border-dashed border-border md:block" />
                <ul className="space-y-2">
                  {branches.map((b, i) => (
                    <li key={b.agent.key} className="relative">
                      {/* spine segment (wide screens): joins this branch to its neighbours */}
                      {branches.length > 1 && (
                        <span
                          aria-hidden
                          className={cn(
                            "absolute -left-5 hidden w-px border-l-2 border-dashed border-border md:block",
                            i === 0 ? "top-1/2" : "-top-2",
                            i === branches.length - 1 ? "bottom-1/2" : "-bottom-0",
                          )}
                        />
                      )}
                      {/* branch (wide screens): spine → agent card */}
                      <span aria-hidden className="absolute -left-5 top-1/2 hidden h-px w-5 -translate-y-1/2 border-t-2 border-dashed border-border md:block" />
                      <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <AGENT_ICON className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0 truncate text-sm font-medium text-foreground">{b.agent.name}</span>
                        </div>
                        <ul className="mt-2 space-y-1">
                          {b.bindings.map((x, i) => (
                            <li key={b.variables[i]} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs">
                              <VariableName name={b.variables[i]!} />
                              <span className="text-muted-foreground">reads</span>
                              <span className="font-medium text-foreground/90">{reads(x, labelOf)}</span>
                            </li>
                          ))}
                        </ul>
                        {b.workflows.length > 0 && (
                          <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Workflow className="h-3 w-3 text-chart-3" />
                            Run by {b.workflows.join(", ")}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
