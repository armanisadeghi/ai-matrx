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

import { useEffect, useState } from "react";
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

export type RuleFeedbackMode = "reject" | "request";

export function RuleFeedbackDialog({
  open,
  onOpenChange,
  mode,
  ruleName,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: RuleFeedbackMode;
  ruleName: string;
  onSubmit: (feedback: string) => Promise<void>;
}) {
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setFeedback("");
  }, [open, mode, ruleName]);

  const submit = async () => {
    const text = feedback.trim();
    if (!text) return;
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

  const isReject = mode === "reject";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isReject ? (
              <XCircle className="h-4 w-4 text-destructive" />
            ) : (
              <MessageSquareWarning className="h-4 w-4 text-primary" />
            )}
            {isReject ? "Reject this rule" : "Request changes"}
          </DialogTitle>
          <DialogDescription>
            {isReject ? (
              <>
                Tell us why “{ruleName}” is wrong. Your reason goes straight to
                the interviewer, who will rewrite the rule for your review — or
                drop it entirely if it shouldn&apos;t exist.
              </>
            ) : (
              <>
                Say what should change about “{ruleName}”. The rule stays as it
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
              ? "What's wrong with it? Talk or type — the more specific, the better the rewrite…"
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
            disabled={busy || !feedback.trim()}
          >
            {isReject ? "Reject with feedback" : "Send change request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
