"use client";

/**
 * "Sort the drafts by what this Rulebook is for" — W59 + W61, 2026-09-12.
 *
 * A distiller reads the page in front of it, never the Rulebook's PURPOSE. So
 * an 18,000-word clinical training workbook landed 336 drafts about PPE, hand
 * hygiene, CPR technique and snakebite on a Rulebook whose intake says "given
 * the first facts of an acutely ill person, decide the next question or test",
 * and a back-pain guideline landed 83 about disclaimers and GRADE wording. The
 * Expert then asked the Scout, in one sentence, to retire them as classes —
 * and the turn died at the model's output ceiling with zero tool calls, twice,
 * because retiring was one rule per call. The product offered her Approve-all
 * or 336 clicks.
 *
 * This is the third door, and it is two plain-English sentences: what belongs
 * here, and what to set aside. The first is PREFILLED from her own intake
 * answer, because she already said it once and should not have to say it again.
 *
 * Everything else is the platform's existing machinery: `ProTextarea` (rule 12
 * — every textarea in this module), the durable-run spine (`useTriageRun`), and
 * `ConfirmDialog`-grade honesty about what the click costs.
 */

import { useEffect, useRef, useState } from "react";
import { ListFilter, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ProTextarea } from "@/components/official/ProTextarea";
import { toast } from "@/lib/toast";
import { useRunOutcome } from "../durable-run/useRunOutcome";
import { useTriageRun } from "./useTriageRun";
import { triageSummary } from "./types";

export interface TriageDraftsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rulebookId: string;
  /** How many drafts are waiting — the number the Expert is deciding about. */
  draftCount: number;
  /**
   * What the Expert said this Rulebook is FOR, from her intake. Prefills the
   * "Keep rules about…" field: she already answered this question once.
   */
  intakeGoal?: string;
  /** Reload the Rulebook once rules actually changed. */
  onApplied?: () => void;
}

export function TriageDraftsDialog({
  open,
  onOpenChange,
  rulebookId,
  draftCount,
  intakeGoal,
  onApplied,
}: TriageDraftsDialogProps) {
  const [keep, setKeep] = useState("");
  const [setAside, setSetAside] = useState("");
  const [previewFirst, setPreviewFirst] = useState(true);
  const run = useTriageRun(rulebookId);

  // Prefill from her own words, once, when the dialog opens — never on top of
  // something she has already typed.
  useEffect(() => {
    if (!open) return;
    setKeep((current) => current || (intakeGoal ?? ""));
  }, [open, intakeGoal]);

  const result = run.result;
  // Hand a real (non-preview) sort back to the page ONCE — see `useRunOutcome`.
  // This fired on every render of the page instead, and refreshing the page was
  // itself a render, so it never stopped (Bugbot, 163c3466).
  useRunOutcome(run, onApplied, {
    when: (done) => !done.dryRun && (done.retired > 0 || done.rewritten > 0),
  });

  // A sort survives a refresh on the durable spine, so the dialog reopens onto
  // the run in flight rather than leaving the Expert with no sign of it — the
  // same rejoin the sibling ingest dialogs do.
  const reopenedRef = useRef(false);
  useEffect(() => {
    if (reopenedRef.current || open || !run.running) return;
    reopenedRef.current = true;
    onOpenChange(true);
  }, [open, run.running, onOpenChange]);

  /** Closing clears the finished run, so reopening starts from the form rather
   * than from the last answer. Never while it is still going: Escape and an
   * overlay click would otherwise hide a run that is still changing her
   * drafts. */
  const requestOpenChange = (next: boolean) => {
    if (run.running) return;
    if (!next) run.reset();
    onOpenChange(next);
  };

  const start = async () => {
    if (!keep.trim()) {
      toast.error("Say what this Rulebook is for — one sentence is enough.");
      return;
    }
    await run.start({
      keep: keep.trim(),
      setAside: setAside.trim(),
      dryRun: previewFirst,
    });
  };

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListFilter className="h-4 w-4" />
            Sort the drafts by what this Rulebook is for
          </DialogTitle>
          <DialogDescription>
            You have {draftCount} draft{draftCount === 1 ? "" : "s"} waiting.
            Tell us in your own words what belongs here and what does not, and
            we will read every one of them against that. Nothing you have
            already approved is touched.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="triage-keep">Keep rules about…</Label>
            <ProTextarea
              id="triage-keep"
              value={keep}
              onChange={(event) => setKeep(event.target.value)}
              placeholder="Deciding the next question or test for someone who has just arrived and is acutely ill."
              rows={3}
              disabled={run.running}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="triage-set-aside">Set aside rules about…</Label>
            <ProTextarea
              id="triage-set-aside"
              value={setAside}
              onChange={(event) => setSetAside(event.target.value)}
              placeholder="Infection control, CPR technique, equipment checklists, first aid for snakebite."
              rows={3}
              disabled={run.running}
            />
            <p className="text-xs text-muted-foreground">
              Optional. Leave it empty and anything that does not serve the
              purpose above is set aside.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div className="pr-3">
              <Label htmlFor="triage-preview" className="text-sm">
                Show me the plan first
              </Label>
              <p className="text-xs text-muted-foreground">
                {previewFirst
                  ? "Nothing changes — you see every draft and what we would do with it."
                  : `This will set aside drafts and rewrite others straight away. Nothing is deleted for good: a draft you set aside can be brought back, and nothing you approved is touched.`}
              </p>
            </div>
            <Switch
              id="triage-preview"
              checked={previewFirst}
              onCheckedChange={setPreviewFirst}
              disabled={run.running}
            />
          </div>

          {run.stage ? (
            <p className="text-sm text-muted-foreground">{run.stage}</p>
          ) : null}
          {run.error ? (
            <p className="text-sm text-destructive">{run.error}</p>
          ) : null}
          {result ? (
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="text-sm font-medium">{triageSummary(result)}</p>
              {result.dryRun ? (
                <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                  {result.decisions
                    .filter((decision) => decision.verdict !== "keep")
                    .map((decision) => (
                      <li key={decision.ruleId}>
                        <span className="font-medium text-foreground">
                          {decision.verdict === "retire"
                            ? "Set aside"
                            : "Rewrite"}
                        </span>
                        {" — "}
                        {decision.name || decision.ruleId}
                        {decision.reason ? `: ${decision.reason}` : ""}
                      </li>
                    ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => requestOpenChange(false)}
            disabled={run.running}
          >
            Close
          </Button>
          <Button onClick={() => void start()} disabled={run.running}>
            {run.running ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sorting…
              </>
            ) : previewFirst ? (
              "Show me the plan"
            ) : (
              `Sort ${draftCount} draft${draftCount === 1 ? "" : "s"}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
