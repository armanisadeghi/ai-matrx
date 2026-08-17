"use client";

// features/masterwork/components/masterworks/AuditionDialog.tsx
//
// "Compare to the original" — the Audition in the UI. The Expert puts the
// Masterwork's output next to the real published work produced from the same
// inputs (the news-writer play: same newswire, our brief vs the Times'), and
// the judge scores both against the Rulebook's own rules. Gaps the reference
// exposes land as DRAFT rules — the Audition feeds the Rulebook, closing the
// loop: run → audition → new rules → rebuild → run again.
//
// Server half: aidream POST /masterworks/audition (streaming; verdict event
// `masterwork_audition_verdict`). Owner-only mount: gap capture writes draft
// rules through the Rulebook's one write path.

import { useEffect, useState } from "react";
import { Scale } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import type { paths } from "@/types/python-generated/api-types";

const AUDITION_PATH = "/masterworks/audition" satisfies keyof paths;

interface RuleFinding {
  rule_id: string;
  winner: string;
  note: string;
}

interface AuditionVerdict {
  verdict: string;
  summary: string;
  findings: RuleFinding[];
  gaps: string[];
  gaps_captured: number;
}

const VERDICT_COPY: Record<string, { label: string; cls: string }> = {
  candidate_better: {
    label: "Your Masterwork beat the original",
    cls: "border-primary/50 text-primary",
  },
  parity: { label: "On par with the original", cls: "border-border text-foreground" },
  reference_better: {
    label: "The original is still better",
    cls: "border-destructive/50 text-destructive",
  },
};

export function AuditionDialog({
  open,
  onOpenChange,
  rulebookId,
  initialCandidate,
  onGapsCaptured,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rulebookId: string;
  /** Prefill from a finished in-place run, when opened from its result. */
  initialCandidate?: string;
  /** Fired when gap drafts landed on the Rulebook (refresh rule counts). */
  onGapsCaptured?: () => void;
}) {
  const dispatch = useAppDispatch();
  const [candidate, setCandidate] = useState(initialCandidate ?? "");
  const [reference, setReference] = useState("");
  const [contextNote, setContextNote] = useState("");
  const [running, setRunning] = useState(false);
  const [verdict, setVerdict] = useState<AuditionVerdict | null>(null);

  // Opened from a finished run: the Masterwork's own output IS the candidate,
  // so adopt it each time the dialog opens with one. Opening with no prefill
  // (the plain "Compare" entry) leaves whatever the Expert already typed —
  // and a prefill never silently overwrites a verdict from a prior Audition.
  useEffect(() => {
    if (!open || !initialCandidate) return;
    setCandidate(initialCandidate);
    setVerdict(null);
  }, [open, initialCandidate]);

  const audition = async () => {
    if (candidate.trim().length < 50 || reference.trim().length < 50) {
      toast.error("Paste both texts first — ours and the original.");
      return;
    }
    setRunning(true);
    setVerdict(null);
    try {
      const result = await dispatch(
        callApi({
          path: AUDITION_PATH,
          method: "POST",
          body: {
            rulebook_id: rulebookId,
            candidate_text: candidate,
            reference_text: reference,
            context_note: contextNote.trim() || undefined,
          } as never,
          stream: true,
          onStreamEvent: (event) => {
            if (event.event !== "data") return;
            const data = event.data as Record<string, unknown>;
            if (data.type === "masterwork_audition_verdict") {
              setVerdict({
                verdict: String(data.verdict ?? "parity"),
                summary: String(data.summary ?? ""),
                findings: Array.isArray(data.findings)
                  ? (data.findings as RuleFinding[])
                  : [],
                gaps: Array.isArray(data.gaps) ? (data.gaps as string[]) : [],
                gaps_captured: Number(data.gaps_captured ?? 0),
              });
              if (Number(data.gaps_captured ?? 0) > 0) onGapsCaptured?.();
            }
          },
        }),
      );
      const error = (result as { error?: { message?: string } }).error;
      if (error) toast.error(error.message ?? "The comparison failed.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "The comparison failed.",
      );
    } finally {
      setRunning(false);
    }
  };

  const verdictCopy = verdict
    ? (VERDICT_COPY[verdict.verdict] ?? VERDICT_COPY.parity)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" />
            Compare to the original
          </DialogTitle>
          <DialogDescription>
            Put your Masterwork&apos;s work next to the real thing made from the
            same inputs. Both get judged against your rules — and anything the
            original does that your Rulebook misses becomes a draft rule.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="audition-candidate">
              Your Masterwork&apos;s output
            </Label>
            <ProTextarea
              id="audition-candidate"
              value={candidate}
              onChange={(e) => setCandidate(e.target.value)}
              rows={5}
              placeholder="Paste what your Masterwork produced…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audition-reference">
              The original (the real published work)
            </Label>
            <ProTextarea
              id="audition-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              rows={5}
              placeholder="Paste the real thing — the article, the brief, the deliverable…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audition-context">
              What were the shared inputs?{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="audition-context"
              value={contextNote}
              onChange={(e) => setContextNote(e.target.value)}
              placeholder='e.g. "the Aug 14 newswire" or "the client brief from Monday"'
              maxLength={500}
            />
          </div>
          <Button onClick={() => void audition()} disabled={running}>
            {running ? "Judging rule by rule…" : "Compare"}
          </Button>

          {verdict && verdictCopy ? (
            <div className="space-y-3 border-t border-border pt-3">
              <Badge variant="outline" className={verdictCopy.cls}>
                {verdictCopy.label}
              </Badge>
              <p className="text-sm text-foreground">{verdict.summary}</p>
              {verdict.findings.length > 0 ? (
                <ul className="space-y-1">
                  {verdict.findings.map((f) => (
                    <li key={f.rule_id} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {f.rule_id}
                      </span>{" "}
                      —{" "}
                      {f.winner === "candidate"
                        ? "yours wins"
                        : f.winner === "reference"
                          ? "the original wins"
                          : "even"}
                      {f.note ? `: ${f.note}` : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {verdict.gaps.length > 0 ? (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-2">
                  <p className="text-xs font-medium text-foreground">
                    {verdict.gaps_captured > 0
                      ? `${verdict.gaps_captured} new draft ${verdict.gaps_captured === 1 ? "rule" : "rules"} captured from what the original does better — review them on the Rulebook page.`
                      : "The original does these better — no rule covers them yet:"}
                  </p>
                  <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                    {verdict.gaps.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
