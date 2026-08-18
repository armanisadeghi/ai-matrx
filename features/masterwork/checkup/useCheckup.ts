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
  type CheckupProposedRule,
} from "./types";

/**
 * The Final Checkup's one state hook.
 *
 * Everything the Expert does here is a DECISION, not a write. Decisions
 * accumulate (and survive a refresh), then land in ONE compare-and-swap when
 * they press Apply — which is what makes every verb reversible in place, and
 * what makes an AI pass reviewable rather than a fait accompli.
 *
 * ## What this hook stopped owning (2026-08-18)
 *
 * The filter tabs, the focused-finding cursor and the keyboard flow are gone.
 * They existed to drive a single-finding split view; the findings now render
 * as themselves, live, through the canonical pipeline
 * (`masterwork_checkup_finding` → its ONE kind component), each carrying its
 * own Approve / Improve / Reject / Edit. Keeping a parallel focus model beside
 * that would be a second source of truth for "which finding are we on" — and
 * the panel was asked to get simpler, not to grow a second navigation scheme.
 */

/** Confidence at or above this is what an AI pass is willing to take. */
export const AI_APPROVE_THRESHOLD = 0.8;

const DISPOSITION_STORE_PREFIX = "matrx.masterwork-checkup.decisions.";

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

export interface UseCheckupResult {
  rulebook: Rulebook | null;
  loading: boolean;
  loadError: string | null;
  run: ReturnType<typeof useCheckupRun>;

  /** Every finding this run has produced, in the order it arrived. */
  findings: CheckupFinding[];
  findingById: (id: string) => CheckupFinding | undefined;

  dispositions: DispositionMap;
  decide: (findingId: string, disposition: CheckupDisposition) => void;
  clearDecision: (findingId: string) => void;
  /** Approve / set aside one finding, keeping any wording the Expert chose. */
  setDecision: (findingId: string, decision: "approve" | "dismiss") => void;
  /** Replace the proposal for one finding (Improve's rewrite, or Edit's form). */
  setProposal: (findingId: string, proposal: CheckupProposedRule) => void;
  /** Pick one of the checkup's own alternative wordings (-1 = its own pick). */
  chooseAlternative: (findingId: string, alternativeIndex: number) => void;

  totalFindings: number;
  decidedCount: number;
  approvedCount: number;

  /** The rule a `modify` / `remove` finding is about, as it stands today. */
  ruleFor: (finding: CheckupFinding) => RulebookRule | undefined;

  aiEligibleCount: number;
  approveWithAi: () => void;

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

  const findings = run.findings;

  const findingById = useCallback(
    (id: string) => findings.find((f) => f.id === id),
    [findings],
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

  const setDecision = useCallback(
    (findingId: string, decision: "approve" | "dismiss") => {
      setDispositions((prev) => ({
        ...prev,
        [findingId]: { ...(prev[findingId] ?? {}), decision, byAi: false },
      }));
    },
    [],
  );

  // Improve and Edit both land here: the Expert now has a proposal they own,
  // so the finding is approved with THAT wording. A rewrite the Expert asked
  // for and then had to approve twice is a second gate nobody wanted.
  const setProposal = useCallback(
    (findingId: string, proposal: CheckupProposedRule) => {
      setDispositions((prev) => ({
        ...prev,
        [findingId]: {
          ...(prev[findingId] ?? {}),
          decision: prev[findingId]?.decision ?? "approve",
          edited: proposal,
          byAi: false,
        },
      }));
    },
    [],
  );

  const chooseAlternative = useCallback(
    (findingId: string, alternativeIndex: number) => {
      setDispositions((prev) => ({
        ...prev,
        [findingId]: {
          ...(prev[findingId] ?? {}),
          decision: prev[findingId]?.decision ?? "approve",
          alternativeIndex,
          byAi: false,
        },
      }));
    },
    [],
  );

  const ruleFor = useCallback(
    (finding: CheckupFinding): RulebookRule | undefined => {
      if (!finding.target_rule_id || !rulebook) return undefined;
      return rulebook.rules.find((r) => r.id === finding.target_rule_id);
    },
    [rulebook],
  );

  // An AI pass only ever reaches findings we are genuinely confident about AND
  // that the Expert has not already ruled on. It never overrides a human
  // decision, and it never touches a finding that offers alternative wordings
  // — a choice between wordings is only the Expert's to make.
  const aiEligible = useMemo(
    () =>
      findings.filter(
        (f) =>
          !dispositions[f.id] &&
          confidenceBand(f.confidence) === "sure" &&
          (f.alternatives?.length ?? 0) === 0 &&
          !previouslyDismissed.has(findingFingerprint(f)),
      ),
    [findings, dispositions, previouslyDismissed],
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
    toast.success(
      `Approved ${aiEligible.length} ${aiEligible.length === 1 ? "suggestion" : "suggestions"}`,
      {
        description:
          "They're ticked in the list — change any of them before you apply. Nothing is saved yet.",
      },
    );
  }, [aiEligible]);

  const apply = useCallback(async () => {
    if (!rulebook) return;
    const decided = Object.keys(dispositions).length;
    if (decided === 0) return;
    setApplying(true);
    try {
      const outcome = await applyCheckup({
        rulebook,
        findings,
        dispositions,
        runId: run.runId,
      });
      setRulebook(outcome.rulebook);
      setReceipt(outcome.applied);
      setUndoRules(outcome.previousRules);
      setDispositions({});
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
  }, [rulebook, dispositions, findings, run.runId, rulebookId]);

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
    findings,
    findingById,
    dispositions,
    decide,
    clearDecision,
    setDecision,
    setProposal,
    chooseAlternative,
    totalFindings: findings.length,
    decidedCount,
    approvedCount,
    ruleFor,
    aiEligibleCount: aiEligible.length,
    approveWithAi,
    applying,
    apply,
    receipt,
    undoAvailable: undoRules !== null,
    undoApply,
    previouslyDismissed,
  };
}
