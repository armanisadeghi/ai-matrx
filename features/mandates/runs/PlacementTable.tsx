"use client";

// features/mandates/runs/PlacementTable.tsx
//
// THE ONE PLACEMENT TABLE — both sides of the Runs tab render this: one row per
// provision (its exact value, every place it landed for this holder, and the
// agent-variable verdict), then one row per agent variable no provision fed.
// Problems (blocking, required_unmapped, dropped, type_mismatch, lossy, and the
// preview's own problem list) are red with the server's message, verbatim.
// Nothing here decides where a value went — the server's trace is painted.

import type { ReactNode } from "react";
import {
  ConfigurationTable,
  ConfigurationTableRow,
  StatusToken,
} from "@/components/official/ConfigurationFields";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
import type { JsonValue } from "@/types/json";
import {
  verdictIsProblem,
  type PlacementLanding,
  type PlacementProblem,
  type PlacementVariable,
  type MandatePlacement,
  type RunProvisionValue,
} from "./service";

const COLUMNS = [
  { key: "name", label: "Provision" },
  { key: "value", label: "Value" },
  { key: "landed", label: "Landed" },
  { key: "verdict", label: "Agent variable" },
];

const CHANNEL_WORDS: Record<PlacementLanding["channel"], string> = {
  variable: "Variable",
  context: "Context",
  pinned_context: "Pinned",
  media: "Media",
  unconsumed: "Unconsumed",
};

const VERDICT_WORDS: Record<string, string> = {
  ok: "Filled",
  renamed: "Renamed",
  default_used: "Default used",
  intentionally_blank: "Left blank",
  spilled_to_user_input: "Sent as message",
  dropped: "Dropped",
  missing_from_code: "Not in agent",
  required_unmapped: "Required, unmapped",
  type_mismatch: "Type mismatch",
};

export function valueText(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

/** The exact value, in its own height-capped scroll box, with copy. */
export function ValueBox({ name, value, truncated }: { name: string; value: JsonValue | undefined; truncated?: boolean }) {
  const text = valueText(value);
  if (value === undefined) return <span className="text-muted-foreground">Not recorded</span>;
  if (text === "") return <span className="text-muted-foreground">Empty</span>;
  const long = text.length > 80 || text.includes("\n");
  return (
    <div className="flex min-w-0 items-start gap-1">
      <pre
        className={
          long
            ? "max-h-40 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-muted/40 px-2 py-1 font-sans text-[12px]"
            : "min-w-0 flex-1 whitespace-pre-wrap break-words font-sans text-[12px]"
        }
      >
        {text}
      </pre>
      <CopyButtons size="sm" label={name} human={() => text} hide={["ai"]} />
      {truncated ? <StatusToken status="caution" label="Cut" /> : null}
    </div>
  );
}

function verdictCell(v: PlacementVariable | undefined, problem: PlacementProblem | undefined): ReactNode {
  if (!v && !problem) return <span className="text-muted-foreground">—</span>;
  const red = (v && verdictIsProblem(v)) || problem?.severity === "error";
  const label = v ? (VERDICT_WORDS[v.verdict] ?? humanizeIdentifier(v.verdict)) : "Problem";
  const message = problem?.message ?? (red || v?.caution ? v?.message : null);
  return (
    <div className="min-w-0 space-y-0.5">
      <StatusToken status={red ? "error" : v?.caution || problem ? "caution" : "ok"} label={label} />
      {message ? (
        <div className={red ? "text-[12px] text-destructive" : "text-[12px] text-muted-foreground"}>{message}</div>
      ) : null}
    </div>
  );
}

function landedCell(landed: PlacementLanding[]): ReactNode {
  if (landed.length === 0) return <span className="text-muted-foreground">Nowhere</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {landed.map((l, i) => (
        <span key={`${l.channel}:${l.target ?? ""}:${i}`} className={l.channel === "unconsumed" ? "text-amber-700 dark:text-amber-400" : undefined}>
          {CHANNEL_WORDS[l.channel]}
          {l.target ? <span className="font-mono text-[12px]"> {l.target}</span> : null}
          {l.joined ? <span className="text-muted-foreground"> (joined)</span> : null}
        </span>
      ))}
    </div>
  );
}

export interface PlacementTableProps {
  placement: MandatePlacement;
  /** Values resolved from `value_ref` (the stored run) — by provision name. */
  values?: readonly RunProvisionValue[];
  /** The placement preview's own problem list. */
  problems?: readonly PlacementProblem[];
  label: string;
}

export function PlacementTable({ placement, values = [], problems = [], label }: PlacementTableProps) {
  const valueOf = new Map(values.map((v) => [v.name, v]));
  const verdictOf = new Map(placement.variables.map((v) => [v.variable, v]));
  const fed = new Set<string>();
  const usedProblems = new Set<PlacementProblem>();

  const rows = placement.provisions.map((p) => {
    const variableTargets = p.landed.filter((l) => l.channel === "variable" && l.target).map((l) => l.target as string);
    variableTargets.forEach((t) => fed.add(t));
    const verdict = variableTargets.map((t) => verdictOf.get(t)).find((v) => v !== undefined);
    const problem = problems.find((x) => x.provision === p.name || (x.variable && variableTargets.includes(x.variable)));
    if (problem) usedProblems.add(problem);
    const resolved = valueOf.get(p.name);
    const value = p.value !== undefined ? p.value : resolved?.value;
    return (
      <ConfigurationTableRow
        key={`p:${p.name}`}
        columns={COLUMNS}
        cells={{
          name: (
            <span className="font-medium">
              {humanizeIdentifier(p.name) || p.name}
              {p.supplied ? null : <span className="block text-[12px] text-muted-foreground">Not supplied</span>}
            </span>
          ),
          value: <ValueBox name={p.name} value={value} truncated={p.truncated || resolved?.truncated} />,
          landed: landedCell(p.landed),
          verdict: verdictCell(verdict, problem),
        }}
      />
    );
  });

  const orphanVariables = placement.variables.filter((v) => !fed.has(v.variable));
  const orphanRows = orphanVariables.map((v) => {
    const problem = problems.find((x) => x.variable === v.variable && !x.provision);
    if (problem) usedProblems.add(problem);
    return (
      <ConfigurationTableRow
        key={`v:${v.variable}`}
        columns={COLUMNS}
        cells={{
          name: <span className="text-muted-foreground">No provision</span>,
          value: <span className="text-muted-foreground">—</span>,
          landed: <span className="font-mono text-[12px]">{v.variable}</span>,
          verdict: verdictCell(v, problem),
        }}
      />
    );
  });

  const loose = problems.filter((p) => !usedProblems.has(p));

  return (
    <div className="space-y-2">
      <ConfigurationTable label={label} columns={COLUMNS}>
        {rows}
        {orphanRows}
      </ConfigurationTable>
      {loose.length ? (
        <ul className="space-y-0.5">
          {loose.map((p, i) => (
            <li key={i} className={p.severity === "error" ? "text-[12px] text-destructive" : "text-[12px] text-amber-700 dark:text-amber-400"}>
              {p.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
