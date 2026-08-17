"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { toast } from "@/lib/toast";
import { getRulebook } from "../service";
import type { Rulebook, RulebookRule } from "../types";
import { applyCheckup, undoCheckup, type CheckupReceiptEntry } from "./service";
import { useCheckupRun } from "./useCheckupRun";
import {
  confidenceBand,
  findingFingerprint,
  type CheckupDisposition,
  type CheckupFinding,
  type CheckupFindingKind,
  type CheckupProposedRule,
} from "./types";

/**
 * The Final Checkup's one state hook — hoisted at the window root so the
 * header, the split body, and the footer all read the same truth
 * (`window-panels` skill § composition root).
 *
 * Everything the Expert does here is a DECISION, not a write. Decisions
 * accumulate (and survive a refresh), then land in ONE compare-and-swap when
 * they press Apply. That is what makes "Approve with AI" reviewable: it fills
 * in decisions the Expert can see, change, and undo before anything is saved —
 * and undo after.
 */

/** Confidence at or above this is what "Approve with AI" is willing to take. */
export const AI_APPROVE_THRESHOLD = 0.8;

const DISPOSITION_STORE_PREFIX = "matrx.masterwork-checkup.decisions.";

export type CheckupFilter = "open" | "all" | CheckupFindingKind;

type DispositionMap = Record<string, CheckupDisposition>;

function storeKey(rulebookId: string, runId: string): string {
  return `${DISPOSITION_STORE_PREFIX}${rulebookId}:${runId}`;
}

function readStoredDispositions(
  rulebookId: string,
  runId: string,
): DispositionMap | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storeKey(rulebookId, runId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as DispositionMap)
      : null;
  } catch {
    // A corrupt receipt must never stop the Expert from working.
    return null;
  }
}

function writeStoredDispositions(
  rulebookId: string,
  runId: string,
  dispositions: DispositionMap,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storeKey(rulebookId, runId),
      JSON.stringify(dispositions),
    );
  } catch {
    /* private mode / quota — decisions still work, they just don't survive */
  }
}

function clearStoredDispositions(rulebookId: string, runId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storeKey(rulebookId, runId));
  } catch {
    /* nothing to do */
  }
}

export interface CheckupAiPass {
  /** What the AI accepted, so the Expert can read it back. */
  entries: CheckupFinding[];
  threshold: number;
}

export interface UseCheckupResult {
  rulebook: Rulebook | null;
  loading: boolean;
  loadError: string | null;
  run: ReturnType<typeof useCheckupRun>;

  /** Findings after the current filter, in the order they arrived. */
  visible: CheckupFinding[];
  filter: CheckupFilter;
  setFilter: (filter: CheckupFilter) => void;
  counts: Record<CheckupFindingKind, number> & { open: number; all: number };

  focused: CheckupFinding | null;
  focusedIndex: number;
  focusFinding: (id: string) => void;
  moveFocus: (delta: number) => void;

  dispositions: DispositionMap;
  decide: (findingId: string, disposition: CheckupDisposition) => void;
  clearDecision: (findingId: string) => void;
  approveFocused: () => void;
  dismissFocused: () => void;

  decidedCount: number;
  approvedCount: number;

  /** The rule a `modify` / `remove` finding is about, as it stands today. */
  ruleFor: (finding: CheckupFinding) => RulebookRule | undefined;

  aiPass: CheckupAiPass | null;
  aiEligibleCount: number;
  approveWithAi: () => void;
  undoAiPass: () => void;

  applying: boolean;
  apply: () => Promise<void>;
  receipt: CheckupReceiptEntry[] | null;
  undoAvailable: boolean;
  undoApply: () => Promise<void>;

  /** Suggestions the Expert already refused on an earlier checkup. */
  previouslyDismissed: Set<string>;
}

export function useCheckup(rulebookId: string): UseCheckupResult {
  const [rulebook, setRulebook] = useState<Rulebook | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dispositions, setDispositions] = useState<DispositionMap>({});
  const [filter, setFilter] = useState<CheckupFilter>("open");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [aiPass, setAiPass] = useState<CheckupAiPass | null>(null);
  const [applying, setApplying] = useState(false);
  const [receipt, setReceipt] = useState<CheckupReceiptEntry[] | null>(null);
  const [undoRules, setUndoRules] = useState<RulebookRule[] | null>(null);

  const run = useCheckupRun(rulebookId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await getRulebook(rulebookId);
        if (cancelled) return;
        if (!loaded) {
          setLoadError("This Rulebook is no longer available.");
        } else {
          setRulebook(loaded);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Could not load the Rulebook",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rulebookId]);

  // Decisions belong to a RUN. Rejoining one (a refresh mid-checkup) brings
  // back what the Expert had already decided — losing that is the same defect
  // as losing the run itself.
  const hydratedRunRef = useRef<string | null>(null);
  useEffect(() => {
    const runId = run.runId;
    if (!runId || hydratedRunRef.current === runId) return;
    hydratedRunRef.current = runId;
    const stored = readStoredDispositions(rulebookId, runId);
    setDispositions(stored ?? {});
  }, [run.runId, rulebookId]);

  useEffect(() => {
    if (!run.runId) return;
    writeStoredDispositions(rulebookId, run.runId, dispositions);
  }, [dispositions, run.runId, rulebookId]);

  const previouslyDismissed = useMemo(() => {
    const meta = (rulebook?.metadata ?? {}) as Record<string, unknown>;
    const checkup = meta.checkup as { dismissed?: unknown } | undefined;
    const list = Array.isArray(checkup?.dismissed) ? checkup.dismissed : [];
    const set = new Set<string>();
    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as {
        kind?: string;
        target_rule_id?: string;
        proposed_name?: string;
      };
      set.add(
        `${record.kind ?? ""}:${record.target_rule_id ?? ""}:${(record.proposed_name ?? "").trim().toLowerCase()}`,
      );
    }
    return set;
  }, [rulebook?.metadata]);

  const counts = useMemo(() => {
    const result = {
      add: 0,
      modify: 0,
      remove: 0,
      open: 0,
      all: run.findings.length,
    };
    for (const finding of run.findings) {
      result[finding.kind] += 1;
      if (!dispositions[finding.id]) result.open += 1;
    }
    return result;
  }, [run.findings, dispositions]);

  const visible = useMemo(() => {
    if (filter === "all") return run.findings;
    if (filter === "open") {
      return run.findings.filter((f) => !dispositions[f.id]);
    }
    return run.findings.filter((f) => f.kind === filter);
  }, [run.findings, filter, dispositions]);

  // Keep a focus at all times once there is anything to focus. When the
  // focused finding leaves the filtered list (the Expert just decided it),
  // focus lands on the NEXT one — that is what makes the keyboard flow work.
  const focusedIndexInVisible = visible.findIndex((f) => f.id === focusedId);
  const lastVisibleIdsRef = useRef<string[]>([]);
  useEffect(() => {
    const ids = visible.map((f) => f.id);
    const previous = lastVisibleIdsRef.current;
    lastVisibleIdsRef.current = ids;
    if (ids.length === 0) {
      if (focusedId !== null) setFocusedId(null);
      return;
    }
    if (focusedId !== null && ids.includes(focusedId)) return;
    if (focusedId === null) {
      setFocusedId(ids[0]);
      return;
    }
    // The focused one dropped out: take whatever slid into its place.
    const previousIndex = previous.indexOf(focusedId);
    const nextIndex = previousIndex < 0 ? 0 : Math.min(previousIndex, ids.length - 1);
    setFocusedId(ids[nextIndex]);
  }, [visible, focusedId]);

  const focused =
    run.findings.find((f) => f.id === focusedId) ?? null;

  const focusFinding = useCallback((id: string) => setFocusedId(id), []);

  const moveFocus = useCallback(
    (delta: number) => {
      setFocusedId((current) => {
        const ids = lastVisibleIdsRef.current;
        if (ids.length === 0) return current;
        const index = current === null ? -1 : ids.indexOf(current);
        const next = Math.min(
          ids.length - 1,
          Math.max(0, (index < 0 ? 0 : index) + delta),
        );
        return ids[next];
      });
    },
    [],
  );

  const decide = useCallback(
    (findingId: string, disposition: CheckupDisposition) => {
      setDispositions((prev) => ({ ...prev, [findingId]: disposition }));
    },
    [],
  );

  const clearDecision = useCallback((findingId: string) => {
    setDispositions((prev) => {
      if (!prev[findingId]) return prev;
      const next = { ...prev };
      delete next[findingId];
      return next;
    });
  }, []);

  const approveFocused = useCallback(() => {
    if (!focusedId) return;
    setDispositions((prev) => ({
      ...prev,
      [focusedId]: {
        ...(prev[focusedId] ?? {}),
        decision: "approve",
        byAi: false,
      },
    }));
  }, [focusedId]);

  const dismissFocused = useCallback(() => {
    if (!focusedId) return;
    setDispositions((prev) => ({
      ...prev,
      [focusedId]: {
        ...(prev[focusedId] ?? {}),
        decision: "dismiss",
        byAi: false,
      },
    }));
  }, [focusedId]);

  const ruleFor = useCallback(
    (finding: CheckupFinding): RulebookRule | undefined => {
      if (!finding.target_rule_id || !rulebook) return undefined;
      return rulebook.rules.find((r) => r.id === finding.target_rule_id);
    },
    [rulebook],
  );

  // "Approve with AI" only ever reaches findings we are genuinely confident
  // about AND that the Expert has not already ruled on. It never overrides a
  // human decision, and it never touches an alternatives question — a finding
  // that offers options is a choice only the Expert can make.
  const aiEligible = useMemo(
    () =>
      run.findings.filter(
        (f) =>
          !dispositions[f.id] &&
          confidenceBand(f.confidence) === "sure" &&
          (f.alternatives?.length ?? 0) === 0 &&
          !previouslyDismissed.has(findingFingerprint(f)),
      ),
    [run.findings, dispositions, previouslyDismissed],
  );

  const approveWithAi = useCallback(() => {
    if (aiEligible.length === 0) return;
    setDispositions((prev) => {
      const next = { ...prev };
      for (const finding of aiEligible) {
        next[finding.id] = { decision: "approve", byAi: true };
      }
      return next;
    });
    setAiPass({ entries: aiEligible, threshold: AI_APPROVE_THRESHOLD });
    setFilter("all");
    if (aiEligible[0]) setFocusedId(aiEligible[0].id);
  }, [aiEligible]);

  const undoAiPass = useCallback(() => {
    setAiPass((pass) => {
      if (!pass) return null;
      setDispositions((prev) => {
        const next = { ...prev };
        for (const finding of pass.entries) {
          // Only take back what the AI decided — never a call the Expert has
          // since made themselves.
          if (next[finding.id]?.byAi === true) delete next[finding.id];
        }
        return next;
      });
      return null;
    });
  }, []);

  const apply = useCallback(async () => {
    if (!rulebook) return;
    const decided = Object.keys(dispositions).length;
    if (decided === 0) return;
    setApplying(true);
    try {
      const outcome = await applyCheckup({
        rulebook,
        findings: run.findings,
        dispositions,
        runId: run.runId,
      });
      setRulebook(outcome.rulebook);
      setReceipt(outcome.applied);
      setUndoRules(outcome.previousRules);
      setDispositions({});
      setAiPass(null);
      if (run.runId) clearStoredDispositions(rulebookId, run.runId);
      const parts: string[] = [];
      if (outcome.applied.length > 0) {
        parts.push(
          `${outcome.applied.length} ${outcome.applied.length === 1 ? "change" : "changes"} made`,
        );
      }
      if (outcome.dismissed > 0) parts.push(`${outcome.dismissed} set aside`);
      toast.success(parts.join(" · ") || "Checkup closed", {
        description: `Your Rulebook is now version ${outcome.rulebook.version}.`,
      });
      if (outcome.stale.length > 0) {
        // Loud recovery (toast.warning also feeds the error capture store): a
        // suggestion whose rule vanished mid-checkup is a real event the
        // Expert must be told about, never a silent skip.
        toast.warning(
          `${outcome.stale.length} ${outcome.stale.length === 1 ? "suggestion" : "suggestions"} no longer applied`,
          {
            description:
              "The rules they were about changed while the checkup was open, so they were left alone.",
          },
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save your decisions",
      );
      // A conflict means someone else saved first — pull the fresh Rulebook so
      // the next Apply works instead of 409ing forever.
      const fresh = await getRulebook(rulebookId).catch(() => null);
      if (fresh) setRulebook(fresh);
    } finally {
      setApplying(false);
    }
  }, [rulebook, dispositions, run.findings, run.runId, rulebookId]);

  const undoApply = useCallback(async () => {
    if (!rulebook || !undoRules) return;
    setApplying(true);
    try {
      const restored = await undoCheckup({
        rulebook,
        previousRules: undoRules,
      });
      setRulebook(restored);
      setUndoRules(null);
      setReceipt(null);
      toast.success("Undone — your rules are back as they were.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not undo");
      const fresh = await getRulebook(rulebookId).catch(() => null);
      if (fresh) setRulebook(fresh);
    } finally {
      setApplying(false);
    }
  }, [rulebook, undoRules, rulebookId]);

  const decidedCount = Object.keys(dispositions).length;
  const approvedCount = Object.values(dispositions).filter(
    (d) => d.decision === "approve",
  ).length;

  return {
    rulebook,
    loading,
    loadError,
    run,
    visible,
    filter,
    setFilter,
    counts,
    focused,
    focusedIndex: focusedIndexInVisible,
    focusFinding,
    moveFocus,
    dispositions,
    decide,
    clearDecision,
    approveFocused,
    dismissFocused,
    decidedCount,
    approvedCount,
    ruleFor,
    aiPass,
    aiEligibleCount: aiEligible.length,
    approveWithAi,
    undoAiPass,
    applying,
    apply,
    receipt,
    undoAvailable: undoRules !== null,
    undoApply,
    previouslyDismissed,
  };
}

/** The proposal a finding shows by default, for surfaces that only render. */
export function defaultProposal(
  finding: CheckupFinding,
): CheckupProposedRule | undefined {
  return finding.proposed;
}
