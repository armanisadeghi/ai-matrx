"use client";

// features/education/kits/outline/useKitOutline.ts
//
// The kit page's hold on its outline (living-kit W1): the live sections, the
// outline run (looked up by subject on mount, so a refresh mid-build REATTACHES
// through `useWorkflowRun` instead of losing the run), whether the outline is
// older than the kit's Sources, and per-section coverage (W3).
//
// Never a top-of-page live block (streaming law 3): progress is one status
// line inside the Outline card, and "Watch" opens the run's floating window.

import { useEffect, useEffectEvent, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { useWorkflowRun } from "@/features/workflow-runtime/hooks/useWorkflowRun";
import {
  selectRunActivity,
  selectRunError,
  selectRunStatus,
} from "@/features/workflow-runtime/redux/workflow-runs.selectors";
import { runIsOver } from "@/features/workflow-runtime/types";
import { readDeckItems, readQuestionItems } from "@/features/education/convert/existingItems";
import { KIT_TOKEN } from "../kitScope";
import { promoteAnchorKit, type StudyKit } from "../kitService";
import { kitCoverage, type KitCoverage } from "./coverage";
import {
  builtByRunOf,
  isOutlineStale,
  kitOutlineInputs,
  lookupKitOutlineRun,
  outlineSectionsFromRows,
  readKitOutlineRows,
  readOutlineBuildSources,
  startKitOutline,
} from "./outlineService";
import type { OutlineSection } from "./types";

export interface KitOutlineState {
  /** null while the first read is in flight. */
  sections: OutlineSection[] | null;
  readError: string | null;
  /** The outline is older than the kit's Sources (a Rebuild would change it). */
  stale: boolean;
  coverage: KitCoverage | null;
  /** The run building the outline right now, if any. */
  activeRunId: string | null;
  /** The run's latest step words, for the one status line. */
  progress: string | null;
  /** Why the last build failed (server words), until the next build. */
  runError: string | null;
  starting: boolean;
  /** Start (or rejoin) a build. A legacy kit is promoted first; `onMoved` gets its new id. */
  build: (onMoved?: (kitId: string) => void) => Promise<void>;
  reload: () => void;
}

function errorWords(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

function runErrorWords(error: Record<string, unknown> | null): string | null {
  if (!error) return null;
  const m = error.user_message ?? error.message ?? error.detail;
  return typeof m === "string" && m ? m : "The outline could not be built.";
}

export function useKitOutline(kit: StudyKit | null): KitOutlineState {
  const dispatch = useAppDispatch();
  const kitId = kit?.sourceType === KIT_TOKEN ? kit.sourceId : null;
  const [sections, setSections] = useState<OutlineSection[] | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [coverage, setCoverage] = useState<KitCoverage | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [revision, setRevision] = useState(0);

  // Adopt the active run (idempotent per run; survives remounts).
  useWorkflowRun(runId);
  const status = useAppSelector(selectRunStatus(runId ?? ""));
  const activity = useAppSelector(selectRunActivity(runId ?? ""));
  const runFailure = useAppSelector(selectRunError(runId ?? ""));
  const over = runId !== null && runIsOver(status);

  const artifactKey = (kit?.artifacts ?? []).map((a) => a.artifactId).join(",");
  const sourceKey = (kit?.sources ?? []).map((s) => `${s.type}:${s.id}`).join(",");

  // Read the outline, its staleness and coverage; look up the subject's run.
  const readAll = useEffectEvent(async (isLive: () => boolean) => {
    if (!kit) return;
    try {
      const rows = kitId ? await readKitOutlineRows(kitId) : [];
      if (!isLive()) return;
      const read = outlineSectionsFromRows(rows);
      setSections(read);
      setReadError(null);
      if (kitId) {
        const found = await lookupKitOutlineRun(dispatch, kitId).catch(() => null);
        if (isLive() && found?.active) setRunId(found.runId);
      }
      if (read.length === 0) {
        setStale(false);
        setCoverage(null);
        return;
      }
      const builtBy = builtByRunOf(rows);
      const [builtFrom, now, cards, questions] = await Promise.all([
        builtBy ? readOutlineBuildSources(builtBy) : Promise.resolve(null),
        kitOutlineInputs(kit.sources),
        readDeckItems(kit.artifacts.filter((a) => a.artifactType === "fc_set").map((a) => a.artifactId)),
        readQuestionItems(kit.artifacts.filter((a) => a.artifactType === "assessment").map((a) => a.artifactId)),
      ]);
      if (!isLive()) return;
      setStale(isOutlineStale(now.sources, builtFrom));
      setCoverage(kitCoverage(read, cards, questions));
    } catch (e) {
      if (isLive()) setReadError(errorWords(e, "The outline could not be read."));
    }
  });
  // `kit` is read through its keys: a new object with the same members re-reads nothing.
  useEffect(() => {
    let live = true;
    void readAll(() => live);
    return () => {
      live = false;
    };
  }, [kitId, artifactKey, sourceKey, revision]);

  // The run finished: read the outline it wrote.
  useEffect(() => {
    if (!over) return;
    if (status === "completed") setRunId(null);
    setRevision((r) => r + 1);
  }, [over, status]);

  const build = async (onMoved?: (kitId: string) => void) => {
    if (!kit || starting) return;
    setStarting(true);
    setStartError(null);
    try {
      let target = kitId;
      let organizationId = kit.organizationId ?? null;
      if (!target) {
        // A single-anchor kit becomes a kit record first (its aids move with it).
        organizationId = await ensureOrgId(null);
        target = await promoteAnchorKit(kit, organizationId);
      }
      organizationId = organizationId ?? (await ensureOrgId(null));
      const inputs = await kitOutlineInputs(kit.sources);
      const started = await startKitOutline(dispatch, {
        kitId: target,
        organizationId,
        sources: inputs.sources,
      });
      setRunId(started.runId);
      if (target !== kitId) onMoved?.(target);
    } catch (e) {
      setStartError(errorWords(e, "The outline could not start."));
    } finally {
      setStarting(false);
    }
  };

  const last = activity.length > 0 ? activity[activity.length - 1] : null;
  const failedRun = over && status !== "completed" ? runErrorWords(runFailure) ?? "The outline could not be built." : null;
  return {
    sections,
    readError,
    stale,
    coverage,
    activeRunId: runId && !over ? runId : null,
    progress: last?.text ?? null,
    runError: startError ?? failedRun,
    starting,
    build,
    reload: () => setRevision((r) => r + 1),
  };
}
