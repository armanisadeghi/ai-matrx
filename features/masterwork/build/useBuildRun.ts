"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import type { LiveRunProgressState } from "@/features/agents/components/live-run/LiveRunProgress";
import type { paths } from "@/types/python-generated/api-types";
import { useMasterworkRun } from "../durable-run/useMasterworkRun";

/**
 * The Build's run — the SAME durable spine every other Masterwork pipeline
 * uses (`platform.masterwork_run`, operation `build`), plus the one thing the
 * old dialog got wrong: what the run LOOKS like while it happens.
 *
 * ## Why this pipeline renders through `LiveRunProgress`, not `MarkdownStream`
 *
 * THE FLOATING LAW (`features/window-panels/FEATURE.md`) names two canonical
 * renderers and which one a run gets is decided by the run, not by taste:
 * token output → `LiveRunDisplay` / `MarkdownStream`; **non-token pipelines →
 * `LiveRunProgress`, stable rows updating in place, event narration banned.**
 *
 * `POST /masterworks/build` emits NO tokens. Every emit in
 * `aidream/services/masterworks/build.py` is a typed data event — three
 * `MasterworkBuildProgressData` steps (`rulebook_loaded`, `agent_created`,
 * `workflow_validated`) and the terminal `MasterworkBuildCompleteData`. There
 * is no model text to stream, so adopting the stream would hand
 * `MarkdownStream` an empty request and the Expert a blank box. This hook
 * therefore translates those typed steps into the canonical
 * `LiveRunProgressState` and the window renders the canonical component. It
 * parses no text, buckets no chunks, and routes no kinds.
 *
 * The old dialog appended every `message` as a fresh `<p>` inside a 192px
 * scroller — the exact "event narration" the law bans, in the exact cramped
 * frame Arman called out on 2026-08-18.
 */

export const BUILD_PATH = "/masterworks/build" satisfies keyof paths;

const PROGRESS_EVENT = "masterwork_build_progress";

export type MasterworkKind = "edit" | "generate";

export interface BuiltMasterwork {
  workflowId: string;
  name: string;
  masterworkKind: MasterworkKind;
  agentCount: number;
}

/**
 * The Build's terminal event, narrowed. A Masterwork with no workflow id is
 * not one the Expert can open, so it is rejected rather than shown as success.
 */
function parseBuilt(raw: unknown): BuiltMasterwork | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const workflowId = typeof data.workflow_id === "string" ? data.workflow_id : "";
  if (!workflowId) return null;
  return {
    workflowId,
    name: typeof data.name === "string" ? data.name : "Your Masterwork",
    masterworkKind: data.masterwork_kind === "generate" ? "generate" : "edit",
    agentCount: Array.isArray(data.agent_ids) ? data.agent_ids.length : 0,
  };
}

/** The three real milestones the server announces, in the order it announces them. */
const MILESTONES = [
  {
    id: "rules",
    step: "rulebook_loaded",
    label: "Reading the rules you approved",
  },
  {
    id: "parts",
    step: "workflow_validated",
    label: "Building the parts that do the work, and checking they fit",
  },
  {
    id: "saved",
    step: "__complete__",
    label: "Saving it to your library",
  },
] as const;

export interface BuildRunHandle {
  status: "idle" | "rejoining" | "running" | "done" | "error";
  running: boolean;
  rejoining: boolean;
  error: string | null;
  result: BuiltMasterwork | null;
  /** The canonical non-token progress shape — rendered by `LiveRunProgress`. */
  progress: LiveRunProgressState | null;
  launch: (input: Record<string, unknown>, label: string) => void;
  reset: () => void;
}

export function useBuildRun(
  rulebookId: string,
  masterworkName: string,
): BuildRunHandle {
  /** Which milestone steps the server has announced, and what it said. */
  const [reached, setReached] = useState<Record<string, string>>({});
  /** The parts as they come up, by name — a detail line, never a new row. */
  const [parts, setParts] = useState<string[]>([]);

  const onDomainEvent = useCallback(
    (name: string, data: Record<string, unknown>) => {
      if (name !== PROGRESS_EVENT) return;
      const step = typeof data.step === "string" ? data.step : "";
      const message = typeof data.message === "string" ? data.message : "";
      if (step === "agent_created") {
        const agentName =
          typeof data.agent_name === "string" && data.agent_name.trim()
            ? data.agent_name
            : null;
        if (agentName) {
          setParts((prev) => (prev.includes(agentName) ? prev : [...prev, agentName]));
        }
        return;
      }
      if (!step) return;
      setReached((prev) => (prev[step] === message ? prev : { ...prev, [step]: message }));
    },
    [],
  );

  const run = useMasterworkRun<BuiltMasterwork>({
    surface: "build",
    rulebookId,
    path: BUILD_PATH,
    parseResult: parseBuilt,
    onDomainEvent,
  });

  const launchedRef = useRef(false);

  const progress = useMemo<LiveRunProgressState | null>(() => {
    if (run.status === "idle") return null;
    const done = run.result !== null;
    const failed = run.status === "error";
    let firstUnfinished = true;
    const items = MILESTONES.map((milestone) => {
      const isComplete =
        done || (milestone.step !== "__complete__" && milestone.step in reached);
      let status: LiveRunProgressState["items"][number]["status"] = "waiting";
      if (isComplete) {
        status = "completed";
      } else if (firstUnfinished) {
        firstUnfinished = false;
        status = failed ? "failed" : "running";
      }
      const detail =
        milestone.id === "parts" && parts.length > 0
          ? parts.join(" · ")
          : (reached[milestone.step] ?? undefined);
      return {
        id: milestone.id,
        label: milestone.label,
        status,
        ...(detail ? { detail } : {}),
      };
    });
    return {
      title: masterworkName,
      description: run.rejoinedTarget
        ? "This Build kept running while you were away — picking it back up."
        : "This keeps running on our servers. Close this, reload, go somewhere else — it comes back to where it got to.",
      items,
    };
  }, [run.status, run.result, run.rejoinedTarget, reached, parts, masterworkName]);

  const launch = useCallback(
    (input: Record<string, unknown>, label: string) => {
      setReached({});
      setParts([]);
      launchedRef.current = true;
      void run.launch(input, label);
    },
    [run],
  );

  const reset = useCallback(() => {
    setReached({});
    setParts([]);
    launchedRef.current = false;
    run.reset();
  }, [run]);

  return {
    status: run.status,
    running: run.running,
    rejoining: run.status === "rejoining",
    error: run.error,
    result: run.result,
    progress,
    launch,
    reset,
  };
}
