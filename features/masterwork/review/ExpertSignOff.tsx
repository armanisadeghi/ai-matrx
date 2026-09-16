"use client";

// features/masterwork/review/ExpertSignOff.tsx
//
// THE THUMBS ON A MASTERWORK RESULT — one tap, and the Expert has told us the
// most important thing we can be told.
//
// Arman, 2026-09-15: "If the system is getting a result that the expert says
// 'Yes, that's great' or simply gives a thumbs up, then we have the most
// important indication we need."
//
// ONE control, every surface that shows a Masterwork's output: the Encore run
// page, the Conductor's answers, the Oracle. Never re-declared per surface —
// that is exactly the class `RuleDecisionActions` exists to stop.
//
// 🚨 IT WRITES THROUGH THE EXISTING PATH AND NOTHING ELSE.
// `useOutputFeedback` -> `platform.upsert_output_feedback` ->
// `platform.output_feedback`, stamped with `surface_name =
// masterwork.expert_signature` so a Rulebook can count its signed outputs. No
// new table, no new verdict word, no migration (see ./signature.ts).
//
//   Thumbs up   -> verdict `positive`. SIGNED. It is now a positive example
//                  wherever the hindsight/replay loop reads this table.
//   Thumbs down -> verdict `negative`, and the correction flow opens: the
//                  Expert says what it should have said, that lands as
//                  `corrected_content` on the SAME row (the reference Level-1
//                  replay ranks candidates against), and the correction is
//                  offered straight to a Rulebook as a draft rule through the
//                  existing Oracle-tap dialog. A correction that never becomes
//                  a rule candidate is a signal thrown away.
//
// NOTHING FAILS SILENTLY: a failed write rolls the thumb back (the hook does
// it) and says so; the buttons are never dead and never fake.

import { useState } from "react";
import { Loader2, ThumbsDown, ThumbsUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProTextarea } from "@/components/official/ProTextarea";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useOutputFeedback } from "@/lib/output-feedback/useOutputFeedback";
import { useOpenAddToRulebookDialog } from "@/features/overlays/openers/addToRulebookDialog";

import { EXPERT_SIGNATURE_SURFACE } from "./signature";

export interface ExpertSignOffProps {
  /** Canonical entity token of the output — `workflow_run` or `message`. */
  subjectType: string;
  subjectId: string;
  /** The agent request that produced it — the replay handle. */
  requestId?: string | null;
  /** The output as produced. Frozen on the first write, never overwritten. */
  originalContent?: string | null;
  /** Provenance carried into the rule candidate, when the output is a turn. */
  conversationId?: string | null;
  messageId?: string | null;
  /** The question this output answered — the Oracle tap's whole point. */
  question?: string | null;
  /** A parent already hydrated this subject in batch. */
  skipFetch?: boolean;
  /** Shown beside the thumbs; omit on a dense row. */
  showPrompt?: boolean;
  className?: string;
}

export function ExpertSignOff({
  subjectType,
  subjectId,
  requestId = null,
  originalContent = null,
  conversationId = null,
  messageId = null,
  question = null,
  skipFetch,
  showPrompt = true,
  className,
}: ExpertSignOffProps) {
  const { verdict, isSaving, setVerdict, captureCorrection } = useOutputFeedback({
    subjectType,
    subjectId,
    requestId,
    surfaceName: EXPERT_SIGNATURE_SURFACE,
    originalContent,
    skipFetch,
  });
  const openAddToRulebook = useOpenAddToRulebookDialog();
  const [correcting, setCorrecting] = useState(false);
  const [correction, setCorrection] = useState("");
  const [busy, setBusy] = useState(false);

  const signed = verdict === "positive";
  const wrong = verdict === "negative";

  const sign = async () => {
    try {
      await setVerdict("positive");
      toast.success(
        signed
          ? "Taken back — this one is no longer marked as yours"
          : "Marked as yours — that's your judgment, working",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not record that",
      );
    }
  };

  const markWrong = async () => {
    try {
      // The verdict lands FIRST, on its own: a person who closes the
      // correction box has still told us the output was wrong, and that must
      // not be lost with the dialog.
      if (!wrong) await setVerdict("negative");
      setCorrection("");
      setCorrecting(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not record that",
      );
    }
  };

  const submitCorrection = async () => {
    const text = correction.trim();
    if (!text) return;
    setBusy(true);
    try {
      await captureCorrection({ correctedContent: text });
      setCorrecting(false);
      // The correction becomes a RULE CANDIDATE through the existing Oracle-tap
      // dialog — the same one the message menu opens.
      openAddToRulebook({
        initialContent: text,
        initialConversationId: conversationId,
        initialMessageId: messageId,
        initialQuestion: question,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save your version",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
        {showPrompt ? (
          <span className="text-xs text-muted-foreground">
            {signed
              ? "You signed this result."
              : wrong
                ? "You said this one was wrong."
                : "Is this how you'd have done it?"}
          </span>
        ) : null}
        <Button
          size="sm"
          variant={signed ? "default" : "outline"}
          className="h-7"
          onClick={() => void sign()}
          disabled={isSaving}
          aria-pressed={signed}
          title={
            signed
              ? "You signed this result — click again to take the signature back."
              : "Yes, that's mine — this is the result I'd have produced."
          }
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ThumbsUp className="h-3.5 w-3.5" />
          )}
          {/* ONE VOCABULARY (jobs-bar-2026-09-16, item 7). Pressing "Yes,
              that's mine" used to turn the button into "Signed" — a word that
              appears nowhere else on the page, in front of someone who has
              never heard a run called a signature. The filled variant and
              `aria-pressed` already say it is on; the words stay the words. */}
          {signed ? "That's mine" : "Yes, that's mine"}
        </Button>
        <Button
          size="sm"
          variant={wrong ? "destructive" : "outline"}
          className="h-7"
          onClick={() => void markWrong()}
          disabled={isSaving}
          aria-pressed={wrong}
          title="Not how you'd have done it — say what it should have said, and that becomes a rule."
        >
          <ThumbsDown className="h-3.5 w-3.5" />
          Not right
        </Button>
        {wrong ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => {
              setCorrection("");
              setCorrecting(true);
            }}
          >
            Say what it should have said
          </Button>
        ) : null}
      </div>

      <Dialog open={correcting} onOpenChange={setCorrecting}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>What should it have said?</DialogTitle>
            <DialogDescription>
              Write it the way you would have. We keep it beside the original as
              the reference this system is measured against — and offer it
              straight to one of your Rulebooks as a new rule.
            </DialogDescription>
          </DialogHeader>
          <ProTextarea
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            placeholder="Talk or type — your version…"
            autoGrow
            minHeight={110}
            maxHeight={320}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCorrecting(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void submitCorrection()}
              disabled={busy || !correction.trim()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save my version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
