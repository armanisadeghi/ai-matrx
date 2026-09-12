"use client";

/**
 * THE UNFOLDING AUDITION — the exam, not the essay comparison.
 *
 * The other Audition tab asks "is our output as good as the real published
 * work?". This one asks the harder question: given a case NOBODY here has
 * seen, does the desk reach the right answer, how many questions did it need,
 * what did those questions cost and risk — and did it beat a plain model that
 * was handed every fact at once?
 *
 * Contract: `common-docs/systems/masterwork/unfolding-case-contract.md` §4/§5.
 * Server: `POST /masterworks/audition` with `mode: "unfolding"`; terminal
 * event `masterwork_audition_unfolding_verdict`.
 *
 * Every failure here names a remedy: no desks, no sealed cases, a refused
 * shape or a stopped run each say what to do next rather than leaving an empty
 * table on screen.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileLock2 } from "lucide-react";

import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { paths } from "@/types/python-generated/api-types";

import { useMasterworkRun } from "../../durable-run/useMasterworkRun";
import {
  listSealedCases,
  type SealedCase,
} from "../../unfolding/sealedCases";
import {
  listUnfoldingAuditions,
  parseUnfoldingVerdict,
  type DangerousBranchVerdict,
  type DiagnosisVerdict,
  type UnfoldingArm,
  type UnfoldingRunSummary,
  type UnfoldingVerdict,
} from "../../audition/unfoldingRuns";
import { listMasterworksForRulebook } from "../../service";
import type { Masterwork } from "../../types";

const AUDITION_PATH = "/masterworks/audition" satisfies keyof paths;

/** Two desks is the comparison; a third is a different question. */
const MAX_DESKS = 2;

const DIAGNOSIS_COPY: Record<DiagnosisVerdict, { label: string; cls: string }> =
  {
    match: { label: "Right", cls: "text-primary" },
    partial: { label: "Partly right", cls: "text-foreground" },
    miss: { label: "Wrong", cls: "text-destructive" },
  };

const BRANCH_COPY: Record<
  DangerousBranchVerdict,
  { label: string; cls: string }
> = {
  none: { label: "Never considered", cls: "text-destructive" },
  considered: { label: "Considered", cls: "text-foreground" },
  committed: { label: "Committed to it", cls: "text-destructive" },
};

function scoreTone(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 67) return "text-primary";
  if (score >= 34) return "text-foreground";
  return "text-destructive";
}

function armLabel(arm: UnfoldingArm): string {
  if (arm.arm === "vanilla") return "Vanilla AI (told everything)";
  return arm.masterworkName ?? "Your Masterwork";
}

/** Past unfolding scores — the Expert sees the line move, exam after exam. */
function UnfoldingHistory({ runs }: { runs: UnfoldingRunSummary[] }) {
  if (runs.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <p className="text-xs font-medium text-foreground">Past sealed-case runs</p>
      <ul className="mt-1 space-y-0.5">
        {runs.slice(0, 8).map((run) => (
          <li
            key={run.id}
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <span className="w-20 shrink-0">
              {new Date(run.startedAt).toLocaleDateString()}
            </span>
            <span
              className={cn(
                "w-16 shrink-0 font-medium",
                scoreTone(run.qualityScore),
              )}
            >
              {run.qualityScore !== null ? `${run.qualityScore}/100` : "—"}
            </span>
            <span className="shrink-0">
              {run.caseCount} case{run.caseCount === 1 ? "" : "s"}
            </span>
            {run.deskBeatsVanilla !== null ? (
              <span
                className={
                  run.deskBeatsVanilla ? "text-primary" : "text-destructive"
                }
              >
                {run.deskBeatsVanilla ? "beat vanilla AI" : "lost to vanilla AI"}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The per-case table: arms down, what the judge said across. */
function CaseTable({ verdict }: { verdict: UnfoldingVerdict }) {
  return (
    <div className="space-y-3">
      {verdict.cases.map((entry, index) => (
        <div
          key={entry.caseItemId ?? index}
          className="rounded-md border border-border"
        >
          <p className="border-b border-border px-2 py-1.5 text-xs font-medium text-foreground">
            {entry.label ?? `Case ${index + 1}`}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="px-2 py-1 font-medium">Arm</th>
                  <th className="px-2 py-1 font-medium">Diagnosis</th>
                  <th className="px-2 py-1 font-medium">Dangerous branch</th>
                  <th className="px-2 py-1 font-medium">Steps</th>
                  <th className="px-2 py-1 font-medium">Cost</th>
                  <th className="px-2 py-1 font-medium">Risk</th>
                </tr>
              </thead>
              <tbody>
                {entry.arms.map((arm, armIndex) => {
                  const diagnosis = arm.diagnosis
                    ? DIAGNOSIS_COPY[arm.diagnosis]
                    : null;
                  const branch = arm.dangerousBranch
                    ? BRANCH_COPY[arm.dangerousBranch]
                    : null;
                  return (
                    <tr
                      key={`${arm.arm}-${arm.masterworkId ?? armIndex}`}
                      className="border-t border-border"
                    >
                      <td className="px-2 py-1 text-foreground">
                        {armLabel(arm)}
                      </td>
                      <td className={cn("px-2 py-1", diagnosis?.cls)}>
                        {/* The judge not scoring an arm is a REAL state and is
                            said, never drawn as a blank cell. */}
                        {diagnosis?.label ?? "The judge did not score this"}
                      </td>
                      <td className={cn("px-2 py-1", branch?.cls)}>
                        {branch?.label ?? "Not scored"}
                        {arm.branchNamed ? ` — ${arm.branchNamed}` : ""}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground">
                        {arm.steps ?? "—"}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground">
                        {arm.cost ?? "—"}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground">
                        {arm.risk ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export function UnfoldingAuditionPanel({
  rulebookId,
}: {
  rulebookId: string;
}) {
  /** The Rulebook's built systems — read here rather than threaded through the
   *  dialog, which does not otherwise need them. */
  const [masterworks, setMasterworks] = useState<Masterwork[]>([]);
  const [deskIds, setDeskIds] = useState<string[]>([]);
  const [caseIds, setCaseIds] = useState<string[]>([]);
  const [compareVanilla, setCompareVanilla] = useState(true);
  const [cases, setCases] = useState<SealedCase[] | null>(null);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [history, setHistory] = useState<UnfoldingRunSummary[]>([]);

  const run = useMasterworkRun<UnfoldingVerdict>({
    surface: "audition_unfolding",
    rulebookId,
    path: AUDITION_PATH,
    parseResult: parseUnfoldingVerdict,
  });
  const verdict = run.result;

  useEffect(() => {
    let alive = true;
    void listMasterworksForRulebook(rulebookId)
      .then((rows) => {
        if (alive) setMasterworks(rows);
      })
      .catch(() => {
        // The empty-state below already names the remedy ("build one first"),
        // and a failed read leaves exactly that — never a half-list.
      });
    return () => {
      alive = false;
    };
  }, [rulebookId]);

  useEffect(() => {
    let alive = true;
    void listSealedCases(rulebookId)
      .then((rows) => {
        if (!alive) return;
        setCases(rows);
        setCasesError(null);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setCases([]);
        setCasesError(
          `Could not read this Rulebook's sealed cases: ${
            err instanceof Error ? err.message : String(err)
          }. Reload the page and try again.`,
        );
      });
    return () => {
      alive = false;
    };
  }, [rulebookId]);

  const refreshHistory = useCallback(() => {
    listUnfoldingAuditions(rulebookId)
      .then(setHistory)
      .catch(() => {
        // History is a garnish — the verdict panel never blocks on it.
      });
  }, [rulebookId]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const [handledRunId, setHandledRunId] = useState<string | null>(null);
  useEffect(() => {
    if (run.status !== "done" || !verdict || !run.runId) return;
    if (run.runId === handledRunId) return;
    setHandledRunId(run.runId);
    refreshHistory();
  }, [run.status, run.runId, verdict, handledRunId, refreshHistory]);

  const desks = useMemo(
    () => masterworks.filter((m) => !m.understudy && !m.is_archived),
    [masterworks],
  );

  const toggle = (list: string[], id: string, max: number): string[] => {
    if (list.includes(id)) return list.filter((item) => item !== id);
    if (list.length >= max) {
      toast.error(`Pick at most ${max}.`);
      return list;
    }
    return [...list, id];
  };

  const audition = () => {
    if (deskIds.length === 0) {
      toast.error("Pick at least one Masterwork to sit the exam.");
      return;
    }
    if (caseIds.length === 0) {
      toast.error("Pick at least one sealed case for it to work.");
      return;
    }
    run.reset();
    void run.launch(
      {
        mode: "unfolding",
        rulebook_id: rulebookId,
        masterwork_ids: deskIds,
        case_item_ids: caseIds,
        compare_vanilla: compareVanilla,
      },
      "unfolding audition",
    );
  };

  return (
    <div className="space-y-3">
      <UnfoldingHistory runs={history} />

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-foreground">
          Which Masterworks should sit the exam?{" "}
          <span className="font-normal text-muted-foreground">
            (up to {MAX_DESKS})
          </span>
        </p>
        {desks.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            You have not built a Masterwork from this Rulebook yet, so there is
            nothing to examine.{" "}
            <Link
              href={`/masterwork/${rulebookId}/masterworks`}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Build one first
            </Link>
          </p>
        ) : (
          <div className="space-y-1">
            {desks.map((desk) => (
              <label
                key={desk.id}
                className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
              >
                <Checkbox
                  checked={deskIds.includes(desk.id)}
                  onCheckedChange={() =>
                    setDeskIds((ids) => toggle(ids, desk.id, MAX_DESKS))
                  }
                />
                {desk.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <FileLock2 className="h-3.5 w-3.5 shrink-0 text-primary" />
          Which sealed cases?
        </Label>
        {casesError ? (
          <p className="text-xs text-destructive">{casesError}</p>
        ) : cases === null ? (
          <p className="text-xs text-muted-foreground">
            Reading the cases this Rulebook holds back…
          </p>
        ) : cases.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            This Rulebook holds no sealed cases, so there is no exam to sit.{" "}
            <Link
              href={`/masterwork/${rulebookId}/sources?intake=timeline`}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Add a case and mark it held-out
            </Link>
          </p>
        ) : (
          <div className="space-y-1">
            {cases.map((sealed) => (
              <label
                key={sealed.id}
                className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
              >
                <Checkbox
                  checked={caseIds.includes(sealed.id)}
                  onCheckedChange={() =>
                    setCaseIds((ids) => toggle(ids, sealed.id, cases.length))
                  }
                />
                {sealed.label}
                {sealed.published ? (
                  <span className="text-muted-foreground">
                    · {sealed.published}
                  </span>
                ) : null}
              </label>
            ))}
          </div>
        )}
      </div>

      <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2">
        <Checkbox
          checked={compareVanilla}
          onCheckedChange={(v) => setCompareVanilla(v === true)}
          className="mt-0.5"
        />
        <span className="space-y-1">
          <span className="block text-xs font-medium text-foreground">
            Also run vanilla AI, told everything at once
          </span>
          <span className="block text-xs text-muted-foreground">
            The same model your Masterwork runs on gets every fact of the case
            up front and is asked for the answer. Your desk has to ask for each
            one. This is the comparison that says whether your rules are doing
            the work.
          </span>
        </span>
      </label>

      <Button onClick={audition} disabled={run.running}>
        {run.running ? (run.stage ?? "Working the cases…") : "Run the exam"}
      </Button>
      {run.running && run.stage ? (
        <p className="text-xs text-muted-foreground">{run.stage}</p>
      ) : null}
      {run.error ? (
        <p className="text-sm text-destructive">{run.error}</p>
      ) : null}

      {verdict ? (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            {verdict.deskBeatsVanilla !== null ? (
              <Badge
                variant="outline"
                className={
                  verdict.deskBeatsVanilla
                    ? "border-primary/50 text-primary"
                    : "border-destructive/50 text-destructive"
                }
              >
                {verdict.deskBeatsVanilla
                  ? "Your Masterwork beat the model that was told everything"
                  : "The model told everything did at least as well"}
              </Badge>
            ) : null}
            {verdict.diagnosisScore !== null ? (
              <span
                className={cn(
                  "text-sm font-semibold",
                  scoreTone(verdict.diagnosisScore),
                )}
              >
                Right answers {verdict.diagnosisScore}/100
              </span>
            ) : null}
            {verdict.safetyScore !== null ? (
              <span className={cn("text-sm", scoreTone(verdict.safetyScore))}>
                Safety {verdict.safetyScore}/100
              </span>
            ) : null}
          </div>
          <CaseTable verdict={verdict} />
        </div>
      ) : null}
    </div>
  );
}
