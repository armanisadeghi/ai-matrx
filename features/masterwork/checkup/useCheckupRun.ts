"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { paths } from "@/types/python-generated/api-types";
import { useMasterworkRun } from "../durable-run/useMasterworkRun";
import {
  parseCheckupResult,
  parseFinding,
  type CheckupFinding,
  type CheckupResult,
} from "./types";

/**
 * The Final Checkup's run: the SAME durable spine every other Masterwork
 * pipeline uses (`platform.masterwork_run`, operation `checkup`), with one
 * difference — a checkup answers in PIECES. Auditors run in parallel and each
 * finding is streamed the moment it is found, so the Expert starts deciding
 * while the rest are still coming in. A refresh rejoins the run and the
 * terminal document restores the whole set.
 */

/**
 * The endpoint aidream is building for this surface. It is not in the
 * generated OpenAPI types until that lands and `pnpm sync-types` runs — the
 * route name is the contract, so it is written ONCE, here. When the types
 * carry it, this line becomes a plain constant.
 */
export const CHECKUP_PATH = "/masterworks/checkup" as unknown as keyof paths;

/** One finding, streamed as it is found. */
const CHECKUP_FINDING_EVENT = "masterwork_checkup_finding";

export interface CheckupRunHandle {
  status: "idle" | "rejoining" | "running" | "done" | "error";
  running: boolean;
  /** The server's own sentence for what it is doing right now. */
  stage: string | null;
  error: string | null;
  runId: string | null;
  /** Everything found so far — live during the run, complete when it ends. */
  findings: CheckupFinding[];
  summary: string | null;
  start: () => Promise<void>;
}

export function useCheckupRun(rulebookId: string): CheckupRunHandle {
  const [findings, setFindings] = useState<CheckupFinding[]>([]);

  /**
   * Merge by id, first-seen order preserved. The stream and the terminal
   * document overlap by design (the document is the truth, the stream is the
   * head start), so a finding must never appear twice.
   */
  const mergeFindings = useCallback((incoming: CheckupFinding[]) => {
    if (incoming.length === 0) return;
    setFindings((prev) => {
      const byId = new Map(prev.map((f) => [f.id, f]));
      let changed = false;
      for (const finding of incoming) {
        const existing = byId.get(finding.id);
        if (existing === undefined) changed = true;
        byId.set(finding.id, finding);
      }
      const next = [...byId.values()];
      return changed || next.length !== prev.length ? next : prev;
    });
  }, []);

  const onDomainEvent = useCallback(
    (name: string, data: Record<string, unknown>) => {
      if (name !== CHECKUP_FINDING_EVENT) return;
      // The payload carries the finding either nested or at the top level;
      // accept both rather than dropping a real finding on a shape guess.
      const parsed =
        parseFinding(data.finding) ?? parseFinding(data);
      if (parsed) mergeFindings([parsed]);
    },
    [mergeFindings],
  );

  const run = useMasterworkRun<CheckupResult>({
    surface: "checkup",
    rulebookId,
    path: CHECKUP_PATH,
    parseResult: parseCheckupResult,
    onDomainEvent,
  });

  // The terminal document wins: it is the complete, server-persisted set, and
  // it is what a rejoin after a refresh comes back with.
  const lastResultRef = useRef<CheckupResult | null>(null);
  useEffect(() => {
    if (!run.result || run.result === lastResultRef.current) return;
    lastResultRef.current = run.result;
    mergeFindings(run.result.findings);
  }, [run.result, mergeFindings]);

  const start = useCallback(async () => {
    setFindings([]);
    lastResultRef.current = null;
    await run.launch({ rulebook_id: rulebookId }, "your Rulebook");
  }, [run, rulebookId]);

  return {
    status: run.status,
    running: run.running,
    stage: run.stage,
    error: run.error,
    runId: run.runId,
    findings,
    summary: run.result?.summary ?? null,
    start,
  };
}
