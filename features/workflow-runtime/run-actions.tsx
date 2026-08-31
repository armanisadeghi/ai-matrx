"use client";

/**
 * THE WORKFLOW RUN'S ACTIONS — ONE definition of "what you can do to a run",
 * shared by every surface that shows one.
 *
 * Census (2026-08-30, context-menu rollout): `workflow_run` / `WorkflowRun`
 * renders on RunsList (the runs table), ReadoutView (a run's own readouts,
 * standing in for the run they belong to), WorkflowRunWindow, WorkflowBattlePage,
 * EncoreRunPage and UsageHistoricalContext — six real surfaces before this
 * extraction, each one either menu-less or (if it ever grew one) reinventing
 * "open this run". This module is the fix that stops that recurring: a
 * surface calls `useWorkflowRunMenuSection` with a `getRow` reading its own
 * clicked-row state and gets the same items everywhere.
 *
 * 🚨 NO NEW WRITE PATH LIVES HERE. Every item is a door (`kind: "link"`) onto
 * an existing route — the run permalink or the owning workflow. An action
 * this surface cannot back (no linked workflow) is `disabled` with the reason
 * in its description, never dropped.
 */

import { ExternalLink, Workflow } from "lucide-react";

import type {
  ContextMenuEntityRef,
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import {
  withAvailability,
  type AvailabilityMap,
} from "@/features/context-menu-v3/utils/availability";

/** The one thing every run surface can say about a right-clicked/current row. */
export interface WorkflowRunMenuRow {
  runId: string;
  /** The workflow this run belongs to, when the surface knows it. */
  definitionId?: string | null;
  /** Human name, for the entity's title — falls back to a generic label. */
  workflowName?: string | null;
}

/** THE DOOR LAW: every run this row names opens, at its permalink. */
export function runMenuHref(row: WorkflowRunMenuRow): string {
  return `/workflows/runs/${row.runId}`;
}

/**
 * THE ROW'S OWN ENTITY — hand this to v3 (directly as `entity`, or under
 * `CONTEXT_MENU_ENTITY_KEY` from a delegated table's `resolveContextOnOpen`)
 * so **Attach To / Share** target the run that was actually right-clicked.
 */
export function runEntityRef(
  row: WorkflowRunMenuRow | null,
): ContextMenuEntityRef | null {
  if (!row) return null;
  return {
    type: "workflow_run",
    id: row.runId,
    title: row.workflowName ? `${row.workflowName} run` : "Workflow run",
  };
}

/** The row's own content, as plain lines a human would read. */
export function runMenuContent(row: WorkflowRunMenuRow): string {
  return row.workflowName ?? "Workflow run";
}

export function useWorkflowRunMenuSection(opts: {
  /** The row the menu was opened on, resolved at select time. */
  getRow: () => WorkflowRunMenuRow | null;
  /** Label for the section heading. */
  label?: string;
  /**
   * THE CONSISTENCY STEP — what THIS surface cannot do, and why. Keyed by
   * item id (`run-open`, `run-open-workflow`). Contract:
   * `features/context-menu-v3/utils/availability.ts`.
   */
  unavailable?: AvailabilityMap;
}): ContextMenuExtraSection {
  const { getRow } = opts;

  const items: ContextMenuExtraItem[] = [
    {
      kind: "link",
      id: "run-open",
      label: "Open run",
      icon: ExternalLink,
      href: (() => {
        const row = getRow();
        return row ? runMenuHref(row) : "#";
      })(),
      disabled: !getRow(),
    },
    {
      kind: "link",
      id: "run-open-workflow",
      label: "Open workflow",
      icon: Workflow,
      href: (() => {
        const row = getRow();
        return row?.definitionId ? `/workflows/${row.definitionId}` : "#";
      })(),
      disabled: !getRow()?.definitionId,
      description: getRow() && !getRow()?.definitionId
        ? "This run has no linked workflow"
        : undefined,
    },
  ];

  return withAvailability(
    {
      id: "workflow-run",
      label: opts.label ?? "This run",
      anchor: "after-compare",
      items,
    },
    opts.unavailable,
  );
}
