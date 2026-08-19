"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BrainCircuit,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Eraser,
  Stethoscope,
  Undo2,
} from "lucide-react";

import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";
import MarkdownStream from "@/components/MarkdownStream";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useRetainRequestForViewer } from "@/features/agents/redux/execution-system/active-requests/useRetainRequestForViewer";
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { publishSurfaceUiState } from "@/features/surfaces/runtime/surface-ui-state";
import { MASTERWORK_RULEBOOK_SURFACE_NAME } from "@/features/surfaces/manifests/masterwork-rulebook.manifest";
import {
  CHECKUP_DECISION_UI_STATE_KEY,
  CHECKUP_FINDING_KIND,
} from "@/features/content-ir/kinds/masterwork-checkup-finding";
import type { CheckupDecisionsUiState } from "@/components/mardown-display/blocks/masterwork-checkup/MasterworkCheckupFindingBlock";
import type { CheckupRuleData } from "@/features/content-ir/kinds/masterwork-checkup-finding";
import {
  CheckupSuggestionDialog,
  type CheckupSuggestionMode,
} from "./CheckupSuggestionDialog";
import { useCheckup } from "./useCheckup";
import { useCleanCorpusRun } from "./useCleanCorpusRun";
import { chosenProposal, type CheckupProposedRule } from "./types";

/**
 * THE FINAL CHECKUP — the window an Expert opens when they feel done.
 *
 * ## What Arman found wrong on 2026-08-18, and what each fix is
 *
 * 1. **"It forced me to stare at a blank page … and then magically all the
 *    content appeared."** The server blocked on the whole agent call before
 *    emitting a single finding. It now scans each producer agent's own token
 *    stream and releases every finding the moment it is written and has passed
 *    the evidence gate — and this window renders them through the platform's
 *    ONE pipeline: `<MarkdownStream requestId />` over the stream
 *    `useDurableRun` already adopts, drawing each `masterwork_checkup_finding`
 *    with its registered kind component. **Nothing in this feature parses,
 *    buckets, routes, or renders a stream itself.**
 * 2. **"The order needs to be: You said this → They created this → Here is
 *    what is missing or wrong → Here is the version recommended."** That order
 *    IS the kind's shape and the component's layout.
 * 3. **"It doesn't have an option to edit the suggestion, and it doesn't have
 *    an option to … provide guidance to the agent."** Every finding carries
 *    Approve · Improve · Reject · Edit, from the SAME `RuleDecisionActions`
 *    primitive and the SAME `masterwork.rule_improver` Mandate the rule review
 *    uses. The clicks reach this window through the `checkup_decision` surface
 *    write target — the finding card never holds a callback.
 * 4. **"The footer … just hijacks our footer component and just fucking
 *    destroys it."** The footer is ONE row of primary actions. The AI-pass
 *    notice is a toast; the receipt is in the body, where content belongs.
 * 5. **"I clicked the final checkup button … but it didn't do a final
 *    checkup."** Opening this window RUNS the checkup. The only re-run is a
 *    subtle "Run again" in the header.
 *
 * ## The clean-up pass (2026-08-19)
 *
 * The Checkup asks the server for the CLEANED corpus (`use_cleaned` defaults
 * true), but the endpoint that produces one — `POST /masterworks/clean-corpus`
 * — had no caller anywhere in the product, so that branch could never fire.
 * "Clean up my words" in this header is that caller: a real durable run
 * (operation `clean_corpus`, visible on the Masterwork home as "Tidied your
 * words"), never a hidden paid call inside the checkup, exactly as ruled.
 *
 * The split panes, the filter tabs, the finding sidebar and the keyboard
 * cursor are all deleted. They existed to drive a single-focus split view; the
 * findings now render as themselves, and the panel is smaller for it.
 */

const AI_PASS_LABEL = (count: number) =>
  `Approve the ${count} we're most sure about`;

export interface CheckupWindowProps {
  isOpen: boolean;
  onClose: () => void;
  rulebookId: string;
}

export function CheckupWindow({ isOpen, onClose, rulebookId }: CheckupWindowProps) {
  const checkup = useCheckup(rulebookId);
  const [dialog, setDialog] = useState<{
    findingId: string;
    mode: CheckupSuggestionMode;
  } | null>(null);

  const {
    rulebook,
    loading,
    loadError,
    run,
    findings,
    findingById,
    dispositions,
    setDecision,
    setProposal,
    chooseAlternative,
    decide,
    totalFindings,
    decidedCount,
    approvedCount,
    aiEligibleCount,
    approveWithAi,
    applying,
    apply,
    receipt,
    undoAvailable,
    undoApply,
  } = checkup;

  // THE CLEAN-UP PASS — manual, visible, and its own durable run.
  const cleanCorpus = useCleanCorpusRun(rulebookId);
  const runCleanCorpus = useCallback(async () => {
    try {
      await cleanCorpus.start();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not clean up your words.",
      );
    }
  }, [cleanCorpus]);

  // The row this panel renders from must outlive the panel — reaping it
  // mid-stream is the recurring "my findings just disappeared" defect
  // (features/agents/docs/LIVE_RUN_RETENTION.md).
  useRetainRequestForViewer(run.requestId, "masterwork-checkup");

  // ── Clicking "Final checkup" IS the final checkup ─────────────────────────
  // The window opens already running. The one thing auto-start must never do
  // is spend money on a SECOND run over a live one, so it stands down the
  // instant the durable hook claims a run id (its rejoin pass reads the pointer
  // synchronously on mount, one frame ahead of this effect).
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!isOpen || autoStartedRef.current) return;
    if (loading || !rulebook) return;
    if (run.status !== "idle" || run.runId !== null || totalFindings > 0) return;
    const timer = window.setTimeout(() => {
      if (autoStartedRef.current) return;
      autoStartedRef.current = true;
      void run.start();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, loading, rulebook, run, totalFindings]);

  // ── The two surface seams the finding cards act through ───────────────────
  const decidedMap = useMemo(() => {
    const map: Record<string, "approved" | "rejected"> = {};
    for (const [findingId, disposition] of Object.entries(dispositions)) {
      map[findingId] =
        disposition.decision === "approve" ? "approved" : "rejected";
    }
    return map;
  }, [dispositions]);

  // What the Expert now owns after Improve or Edit. The card shows THIS in
  // step 4, so what they approve is what Apply writes.
  const yourVersionMap = useMemo(() => {
    const map: Record<string, CheckupRuleData> = {};
    for (const finding of findings) {
      const chosen = chosenProposal(finding, dispositions[finding.id]);
      if (!chosen || chosen === finding.proposed) continue;
      map[finding.id] = {
        name: chosen.name,
        statement: chosen.statement,
        rationale: chosen.rationale ?? null,
        detection: chosen.detection ?? null,
        severity: chosen.severity,
        section: chosen.section,
        ruleId: finding.target_rule_id ?? null,
      };
    }
    return map;
  }, [findings, dispositions]);

  useEffect(() => {
    // Publishing this key is what makes the rendered findings interactive.
    // While the window is closed we publish nothing, so the same cards in a
    // chat transcript stay read-only rather than offering a dead button.
    publishSurfaceUiState(
      MASTERWORK_RULEBOOK_SURFACE_NAME,
      CHECKUP_DECISION_UI_STATE_KEY,
      isOpen
        ? ({
            decided: decidedMap,
            yourVersion: yourVersionMap,
          } satisfies CheckupDecisionsUiState)
        : undefined,
    );
  }, [isOpen, decidedMap, yourVersionMap]);

  useEffect(
    () => () =>
      publishSurfaceUiState(
        MASTERWORK_RULEBOOK_SURFACE_NAME,
        CHECKUP_DECISION_UI_STATE_KEY,
        undefined,
      ),
    [],
  );

  useSurfaceWriteHandlers(MASTERWORK_RULEBOOK_SURFACE_NAME, {
    checkup_decision: (value: unknown) => {
      if (!value || typeof value !== "object") {
        throw new Error("checkup_decision expects an object value.");
      }
      const record = value as Record<string, unknown>;
      const findingId = record.finding_id;
      const verb = record.verb;
      if (typeof findingId !== "string" || !findingId) {
        throw new Error("checkup_decision: finding_id must be a string.");
      }
      if (!findingById(findingId)) {
        throw new Error(
          "checkup_decision: that suggestion is not part of this checkup.",
        );
      }
      const alternativeIndex = record.alternative_index;
      if (typeof alternativeIndex === "number") {
        chooseAlternative(findingId, alternativeIndex);
      }
      if (verb === "approve") {
        setDecision(findingId, "approve");
        return;
      }
      if (verb === "reject") {
        setDialog({ findingId, mode: "reject" });
        return;
      }
      if (verb === "improve" || verb === "edit") {
        setDialog({ findingId, mode: verb });
        return;
      }
      throw new Error(`checkup_decision: unknown verb ${String(verb)}.`);
    },
  });

  const dialogFinding = dialog ? (findingById(dialog.findingId) ?? null) : null;
  const dialogProposal: CheckupProposedRule | null = dialogFinding
    ? (chosenProposal(dialogFinding, dispositions[dialogFinding.id]) ?? null)
    : null;

  const closeDialog = useCallback(() => setDialog(null), []);

  const rejectWithNote = useCallback(
    (findingId: string, note: string) => {
      decide(findingId, {
        ...(dispositions[findingId] ?? {}),
        decision: "dismiss",
        byAi: false,
        ...(note ? { note } : {}),
      });
    },
    [decide, dispositions],
  );

  // ── Body ──────────────────────────────────────────────────────────────────
  const body = (() => {
    if (loading) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <LoadingSpinner />
        </div>
      );
    }
    if (loadError) {
      return (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          {loadError}
        </div>
      );
    }
    if (run.status === "error" && totalFindings === 0) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="max-w-md text-sm text-muted-foreground">{run.error}</p>
          <Button variant="outline" onClick={() => void run.start()}>
            <RotateCcw className="h-4 w-4" />
            Try again
          </Button>
        </div>
      );
    }
    if (totalFindings === 0) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          {run.running ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {run.stage ?? "Reading everything you've told us…"}
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Anything we find appears here the moment we find it.
              </p>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-7 w-7 text-primary" />
              <p className="text-sm font-medium text-foreground">
                {run.summary ?? "Nothing to change — your Rulebook holds up."}
              </p>
            </>
          )}
        </div>
      );
    }

    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {receipt ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs">
            <span className="text-foreground">
              {receipt.length === 0
                ? "Nothing changed — everything you looked at was set aside."
                : `Applied ${receipt.length} ${receipt.length === 1 ? "change" : "changes"}.`}
            </span>
            {rulebook ? (
              <Link
                href={`/masterwork/${rulebook.id}`}
                target="_blank"
                className="text-primary underline-offset-2 hover:underline"
              >
                See them in your Rulebook
              </Link>
            ) : null}
            {undoAvailable ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-6"
                disabled={applying}
                onClick={() => void undoApply()}
              >
                <Undo2 className="h-3 w-3" />
                Undo
              </Button>
            ) : null}
          </div>
        ) : null}
        {/* THE ONE PIPELINE, two mounts, ONE component at the end of both.
            LIVE: the adopted stream — every finding the server releases appears
            the moment it lands, routed by `applyIrKindRoute` inside
            MarkdownStream, with nothing parsed here.
            REJOINED: a checkup picked up after a refresh has no stream left to
            adopt, so its findings render through `KindInstanceRender` — the
            same complete-envelope assembler and the same route, which is how
            `/shapes` draws a saved instance. Never a second renderer. */}
        {run.requestId ? (
          <MarkdownStream
            requestId={run.requestId}
            isStreamActive={run.running}
            hideCopyButton
          />
        ) : (
          <div className="space-y-3">
            {findings.map((finding) =>
              finding.content_ir ? (
                <KindInstanceRender
                  key={finding.id}
                  kind={CHECKUP_FINDING_KIND}
                  value={finding.content_ir}
                />
              ) : null,
            )}
          </div>
        )}
      </div>
    );
  })();

  // The clean-up's receipt: what it did, and the one thing to do next.
  useEffect(() => {
    if (!cleanCorpus.result) return;
    const { cleaned, reused, failed } = cleanCorpus.result;
    toast.success(
      cleaned > 0
        ? `Tidied ${cleaned} thing${cleaned === 1 ? "" : "s"} you said${
            reused > 0 ? ` (${reused} already tidy)` : ""
          }.`
        : "Everything you said was already tidy.",
      {
        description:
          failed > 0
            ? `${failed} couldn't be cleaned and were left exactly as you said them. Run the checkup again to use the tidied text.`
            : "Run the checkup again to read it back against the tidied text.",
      },
    );
  }, [cleanCorpus.result]);

  useEffect(() => {
    if (cleanCorpus.error) toast.error(cleanCorpus.error);
  }, [cleanCorpus.error]);

  const stageLine = run.running
    ? (run.stage ?? "Still looking…")
    : cleanCorpus.running
      ? (cleanCorpus.stage ?? "Reading back everything you said…")
      : null;

  // ── Footer: ONE row. Primary actions only. ────────────────────────────────
  const footer = (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2 px-2 py-1.5">
      <span className="text-xs text-muted-foreground">
        {totalFindings === 0
          ? (stageLine ?? "Nothing to decide yet")
          : `${decidedCount} of ${totalFindings} decided`}
      </span>
      {run.running && totalFindings > 0 ? (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        {aiEligibleCount > 0 ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={approveWithAi}
          >
            <BrainCircuit className="h-3.5 w-3.5" />
            {AI_PASS_LABEL(aiEligibleCount)}
          </Button>
        ) : null}
        <Button
          size="sm"
          className="h-7"
          disabled={decidedCount === 0 || applying}
          onClick={() => void apply()}
        >
          {applying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          Apply {approvedCount > 0 ? `${approvedCount} ` : ""}
          {approvedCount === 1 ? "change" : "changes"}
        </Button>
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <>
      <WindowPanel
        id="masterwork-checkup-window"
        overlayId="masterworkCheckupWindow"
        titleNode={
          <span className="flex items-center gap-1.5">
            <Stethoscope className="h-4 w-4" />
            <span className="text-sm font-medium">Final checkup</span>
            {totalFindings > 0 ? (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {totalFindings}
              </Badge>
            ) : null}
          </span>
        }
        actionsRight={
          !run.running ? (
            <span className="flex items-center gap-1">
              {/* The pass that makes the audit good — the Expert's raw
                  dictation, cleaned per contribution and SAVED, so the next
                  checkup reads prose instead of a transcript. */}
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[11px]"
                disabled={cleanCorpus.running}
                title="Tidy up your dictated words first — the checkup reads better text and finds better problems. Your originals are never changed."
                onClick={() => void runCleanCorpus()}
              >
                {cleanCorpus.running ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Eraser className="h-3 w-3" />
                )}
                {cleanCorpus.running ? "Tidying…" : "Clean up my words"}
              </Button>
              {totalFindings > 0 || run.status === "done" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[11px]"
                  onClick={() => void run.start()}
                >
                  <RotateCcw className="h-3 w-3" />
                  Run again
                </Button>
              ) : null}
            </span>
          ) : undefined
        }
        width={760}
        height={720}
        minWidth={360}
        minHeight={420}
        footer={footer}
        footerVariant="rich"
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
        onClose={onClose}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {/* ONE line saying what this is and what it will do. */}
          <p className="shrink-0 border-b border-border px-3 py-2 text-xs text-muted-foreground">
            We read back everything you&apos;ve ever told us against every rule
            you have, and show you anything we got wrong or missed. You decide
            each one; nothing changes until you apply.
          </p>
          {body}
        </div>
      </WindowPanel>
      {rulebook && dialog ? (
        <CheckupSuggestionDialog
          finding={dialogFinding}
          mode={dialog.mode}
          proposal={dialogProposal}
          rulebook={rulebook}
          surfaceName={MASTERWORK_RULEBOOK_SURFACE_NAME}
          onClose={closeDialog}
          onProposal={setProposal}
          onReject={rejectWithNote}
        />
      ) : null}
    </>
  );
}

export default CheckupWindow;
