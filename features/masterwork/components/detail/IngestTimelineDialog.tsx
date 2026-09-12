"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Switch } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import LoadingSpinner from "@/components/ui/loading-spinner";
import type { paths } from "@/types/python-generated/api-types";
import { useMasterworkRun } from "../../durable-run/useMasterworkRun";
import type { Rulebook } from "../../types";
import {
  describeIngest,
  parseIngestSummary,
  type IngestSummary,
} from "./IngestSourceDialog";

/**
 * "A case that unfolds in time" — the `timeline` Distillation Approach.
 *
 * ## What it is for
 *
 * A case report, an incident write-up, a deal that took four meetings: a
 * document whose whole point is the ORDER. Pasted into the ordinary source
 * lane, such a document is split by word count — often into a single chunk —
 * and comes back as a list of static facts, every one written with the ending
 * already known. That is exactly what happened on 2026-09-12 to a real
 * clinical case report: eleven rules, all citing "chunk 1", none of them
 * telling you what to DO at the moment you are actually standing in.
 *
 * ## What this lane does instead
 *
 * The case is read into its own moments first — "hour 0", "visit 2", "day 3" —
 * and each moment is distilled knowing ONLY what was known at the time: the
 * facts so far, the one thing that was asked, tested or decided, and what came
 * back. The future, including how it turned out, is kept back. So the rules
 * come out forward-looking: *given what you know now, do X, because Y* — with
 * what it costs and what it risks.
 *
 * The ending is still SAVED on the Rulebook (it is what a later Audition scores
 * against); it is simply not shown to the distiller.
 *
 * Its own durable run surface (`timeline`), so a reload mid-run rejoins this
 * dialog and never the single-source one.
 */

const INGEST_TIMELINE_PATH =
  "/masterworks/ingest-timeline" satisfies keyof paths;

export function IngestTimelineDialog({
  open,
  onOpenChange,
  rulebook,
  onIngested,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rulebook: Rulebook;
  onIngested?: () => void;
}) {
  const [text, setText] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  // Default ON, and it is the whole point of the lane: a distiller that can see
  // how the case ended writes hindsight, not judgment.
  const [hideResolution, setHideResolution] = useState(true);

  const run = useMasterworkRun<IngestSummary>({
    surface: "timeline",
    rulebookId: rulebook.id,
    path: INGEST_TIMELINE_PATH,
    parseResult: parseIngestSummary,
  });
  const running = run.running;
  const summary = run.result ? describeIngest(run.result) : null;
  const rejoining = run.status === "rejoining";

  useEffect(() => {
    if (run.result) onIngested?.();
  }, [run.result, onIngested]);

  useEffect(() => {
    if (run.error) toast.error(run.error);
  }, [run.error]);

  // A run picked back up after a reload has to be VISIBLE — rejoining behind a
  // closed dialog is the same defect as losing the run.
  const reopenedRef = useRef(false);
  useEffect(() => {
    if (reopenedRef.current || open || !run.running) return;
    reopenedRef.current = true;
    onOpenChange(true);
  }, [open, run.running, onOpenChange]);

  const distil = async () => {
    if (text.trim().length < 200) {
      toast.error(
        "Paste the whole case first — enough of it that the order is visible.",
      );
      return;
    }
    await run.launch(
      {
        rulebook_id: rulebook.id,
        text,
        source_note: sourceNote.trim() || undefined,
        hide_resolution: hideResolution,
      },
      sourceNote.trim() || "your case",
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (running) return;
        if (!next) run.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          {/*
            No AgentCredit here yet: the two agents this lane runs
            (`masterwork.timeline_segmenter` / `masterwork.timeline_distiller`)
            are declared server-side but not yet published in
            `@ai-matrx/agents`'s generated key set, and a hand-typed mandate key
            is forbidden (`pnpm check:mandate-keys`). It goes in with the
            package catch-up, not with a literal.
          */}
          <DialogTitle>A case that unfolds in time</DialogTitle>
          <DialogDescription>
            Paste a case, an episode or an incident written in the order it
            happened. It gets read one moment at a time — what you knew then,
            what you asked or decided next, and what came back — so the rules
            come out as “given what you know at this point, do this”, instead of
            a list of facts written with the ending already known.
          </DialogDescription>
        </DialogHeader>

        {summary ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">{summary}</p>
            <Button
              size="sm"
              onClick={() => {
                run.reset();
                onOpenChange(false);
              }}
            >
              Review the drafts
            </Button>
          </div>
        ) : running || run.stages.length > 0 ? (
          <div className="space-y-2">
            <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/40 p-3">
              {run.stages.map((line, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  {line}
                </p>
              ))}
            </div>
            {running ? (
              <div className="flex items-start gap-2">
                <LoadingSpinner size="sm" />
                <p className="text-xs text-muted-foreground">
                  {rejoining
                    ? "Picking this back up — it kept reading while you were away."
                    : "Working through the case one moment at a time."}
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="timeline-text">The case, in order</Label>
              <ProTextarea
                id="timeline-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  "Paste it as it happened — first contact, what you found, what you did about it, what came back, then the next moment. End with what it turned out to be."
                }
                rows={12}
                enableTextStats
              />
            </div>

            <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-card p-3">
              <div className="min-w-0">
                <Label htmlFor="timeline-hide-ending" className="text-sm">
                  Hide the ending while the rules are written
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  On: each moment is read without knowing how the case turned
                  out, so the rules say what to do when you cannot yet be sure.
                  The ending is still saved with the case. Turn this off only
                  when the ending itself is the lesson.
                </p>
              </div>
              <Switch
                id="timeline-hide-ending"
                checked={hideResolution}
                onCheckedChange={setHideResolution}
                aria-label="Hide the ending while the rules are written"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="timeline-note">
                Where is this from? (optional)
              </Label>
              <Input
                id="timeline-note"
                value={sourceNote}
                onChange={(e) => setSourceNote(e.target.value)}
                placeholder="e.g. ED case 3, March 2026"
              />
            </div>
          </div>
        )}

        {!summary ? (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                run.reset();
                onOpenChange(false);
              }}
              disabled={running}
            >
              Cancel
            </Button>
            <Button onClick={() => void distil()} disabled={running}>
              {running ? "Reading the case…" : "Distill rules"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
