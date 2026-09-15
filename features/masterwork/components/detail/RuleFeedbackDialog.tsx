"use client";

// features/masterwork/components/detail/RuleFeedbackDialog.tsx
//
// The Expert's two feedback moves on a rule, one dialog:
//  - mode="reject": the rule is wrong — say why. It leaves the approval queue
//    and waits for the Scout, who must rewrite it per this feedback (re-queued
//    as a fresh draft) or withdraw it.
//  - mode="request": the rule stays where it is (approved stays approved) but
//    carries a change request the Scout applies next turn.
// The textarea is ProTextarea — the Expert can just tap the mic and talk.

import { useEffect, useRef, useState } from "react";
import { MessageSquareWarning, XCircle } from "lucide-react";
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
import { MasterworkDictationOrigin } from "@/features/masterwork/MasterworkDictationOrigin";
import type { ReviewVocabulary } from "@/features/masterwork/review/vocabulary";

export type RuleFeedbackMode = "reject" | "request";

export function RuleFeedbackDialog({
  open,
  onOpenChange,
  mode,
  vocabulary = "standard",
  ruleName,
  rulebookId,
  rulebookName,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: RuleFeedbackMode;
  /**
   * The Expert's wording. In `ownership` the two modes ARE "not mine" and
   * "mine but wrong", and "not mine" is a complete answer with no sentence —
   * the caller stores the default reason. The statuses written are identical.
   */
  vocabulary?: ReviewVocabulary;
  ruleName: string;
  /** The Rulebook this feedback is about — stamps the dictation's origin. */
  rulebookId: string;
  rulebookName: string;
  onSubmit: (feedback: string) => Promise<void>;
}) {
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setFeedback("");
  }, [open, mode, ruleName]);

  // 🚨 A CLOSING DIALOG MUST NOT RELABEL ITSELF. The caller derives `open`
  // from "is a rule targeted?" and `mode` from that same target, so clearing
  // the target flips BOTH at once — and Radix keeps the panel mounted through
  // its close animation. The Expert who had just clicked "Reject with
  // feedback" watched the panel turn into "Request changes", still carrying
  // her words, on its way out (wall W12's second half). Hold the last shown
  // identity until the panel is actually gone.
  const shown = useRef({ mode, ruleName });
  if (open) shown.current = { mode, ruleName };
  const shownMode = open ? mode : shown.current.mode;
  const shownRuleName = open ? ruleName : shown.current.ruleName;

  const ownership = vocabulary === "ownership";
  // "Not mine" needs no explanation to be true. Every other move does: a
  // change request with no words tells the interviewer nothing to act on.
  const mayBeEmpty = ownership && shownMode === "reject";

  const submit = async () => {
    const text = feedback.trim();
    if (!text && !mayBeEmpty) return;
    setBusy(true);
    try {
      await onSubmit(text);
      onOpenChange(false);
    } catch {
      // The caller already toasted; stay open so the Expert's text survives.
    } finally {
      setBusy(false);
    }
  };

  const isReject = shownMode === "reject";
  return (
    // The reason the Expert dictates here IS expert judgment about this
    // Rulebook — it belongs to the Record, not to a nameless Recordings folder.
    <MasterworkDictationOrigin
      surface="masterwork.rule_feedback"
      rulebookId={rulebookId}
      rulebookName={rulebookName}
    >
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isReject ? (
              <XCircle className="h-4 w-4 text-destructive" />
            ) : (
              <MessageSquareWarning className="h-4 w-4 text-primary" />
            )}
            {isReject
              ? ownership
                ? "Not mine"
                : "Reject this rule"
              : ownership
                ? "Mine but wrong"
                : "Request changes"}
          </DialogTitle>
          <DialogDescription>
            {isReject ? (
              ownership ? (
                <>
                  “{shownRuleName}” isn&apos;t how you do it. That alone is enough —
                  send it as it is, or say a word about why and the interviewer
                  will use it. Either way the rule leaves your book and lands on
                  the next session&apos;s agenda.
                </>
              ) : (
                <>
                  Tell us why “{shownRuleName}” is wrong. Your reason goes straight to
                  the interviewer, who will rewrite the rule for your review — or
                  drop it entirely if it shouldn&apos;t exist.
                </>
              )
            ) : ownership ? (
              <>
                The idea in “{shownRuleName}” is yours, but this got it wrong. Say
                what it should say. The rule keeps its current state; your words
                go on the next session&apos;s agenda.
              </>
            ) : (
              <>
                Say what should change about “{shownRuleName}”. The rule stays as it
                is for now; your note is applied on the interviewer&apos;s next
                turn.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <ProTextarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder={
            isReject
              ? ownership
                ? "Optional — say a word about why, or just send it. Talk or type…"
                : "What's wrong with it? Talk or type — the more specific, the better the rewrite…"
              : ownership
                ? "What should it say instead? Talk or type…"
                : "What should change? Talk or type…"
          }
          autoGrow
          minHeight={110}
          maxHeight={320}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={isReject ? "destructive" : "default"}
            onClick={() => void submit()}
            disabled={busy || (!feedback.trim() && !mayBeEmpty)}
          >
            {isReject
              ? ownership
                ? "It's not mine"
                : "Reject with feedback"
              : ownership
                ? "Send my correction"
                : "Send change request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </MasterworkDictationOrigin>
  );
}
