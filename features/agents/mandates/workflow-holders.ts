"use client";

// features/agents/mandates/workflow-holders.ts
//
// WORKFLOWS AS HOLDERS. A Mandate names a job; a Workflow can hold it just as
// an Agent can. This module answers the one question the Holder picker asks:
// which Workflows could fulfil THIS Mandate?
//
// Reads go direct to Supabase (CLAUDE.md § Data flow) — `workflow.definition`
// carries the author's declared `output_kind`, which is exactly what the
// server's bind gate compares against the Mandate's.
//
// 🚨 THE PICKER NARROWS; THE SERVER DECIDES. The gate also accepts a workflow
// whose declared output_kind is empty but whose computed DELIVERABLES produce
// the mandate's kind — deliverables are compiled from the graph and exist
// nowhere in a column, so this list cannot know about them. It therefore
// separates matching workflows from the rest instead of hiding the rest, and
// every refusal the gate returns is shown verbatim.

import { supabase } from "@/utils/supabase/client";
import { readAllRows } from "@/lib/supabase/readAllRows";

export interface WorkflowHolderCandidate {
  id: string;
  name: string;
  description: string | null;
  /** The author's declaration. Null = undeclared, not "produces nothing". */
  outputKind: string | null;
  /** True when the declaration equals the Mandate's output kind. */
  declaresMandateKind: boolean;
  updatedAt: string | null;
}

export interface WorkflowHolderCandidates {
  /** Declares exactly what the Mandate answers in — offered first. */
  matching: WorkflowHolderCandidate[];
  /**
   * Everything else the caller can see. A workflow here may still bind: the
   * gate looks at its deliverables too. It may equally be refused, loudly.
   */
  others: WorkflowHolderCandidate[];
}

/**
 * Every live Workflow the caller can see, split by whether it declares the
 * Mandate's output kind. `mandateOutputKind` of null means the Mandate declares
 * nothing, so nothing can "match" — every candidate lands in `others` and the
 * gate is the only judge.
 */
export async function fetchWorkflowHolderCandidates(
  mandateOutputKind: string | null,
): Promise<WorkflowHolderCandidates> {
  // The full visible set, not a page: the picker decides which workflows a
  // Mandate CAN be bound to, and a workflow silently missing past row 1000
  // reads as "no workflow can do this job".
  const rows = await readAllRows<{
    id: string;
    name: string | null;
    description: string | null;
    output_kind: string | null;
    updated_at: string | null;
  }>(
    ({ from, to }) =>
      supabase
        .schema("workflow")
        .from("definition")
        .select("id,name,description,output_kind,updated_at", {
          count: "exact",
        })
        .is("deleted_at", null)
        .eq("is_archived", false)
        .order("id", { ascending: true })
        .range(from, to),
    { label: "workflow.definition (Holder candidates)" },
  );

  const matching: WorkflowHolderCandidate[] = [];
  const others: WorkflowHolderCandidate[] = [];
  const byRecency = [...rows].sort((a, b) =>
    (b.updated_at ?? "").localeCompare(a.updated_at ?? ""),
  );
  for (const row of byRecency) {
    if (!row.id) continue;
    const outputKind = row.output_kind ?? null;
    const candidate: WorkflowHolderCandidate = {
      id: row.id,
      name: row.name ?? row.id,
      description: row.description ?? null,
      outputKind,
      declaresMandateKind:
        mandateOutputKind !== null && outputKind === mandateOutputKind,
      updatedAt: row.updated_at ?? null,
    };
    (candidate.declaresMandateKind ? matching : others).push(candidate);
  }
  return { matching, others };
}
