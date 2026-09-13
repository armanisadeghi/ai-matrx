"use client";

// features/masterwork/components/masterworks/CompareTwoDialog.tsx
//
// "Compare two" — the BLIND PAIRWISE Audition in the UI. Its sibling
// (AuditionDialog) puts one output next to the Expert's real published work.
// This one puts TWO of the Expert's own answers next to each other, with no
// reference at all, and asks the question the two-schools work actually needs:
// same inputs, two different answers — is either better, or is each one true to
// its own book?
//
// THE KEY IS REVEALED AFTER THE VERDICT, AND THAT IS THE POINT. The server
// randomises which answer the judge reads as "A", seals that mapping on the run
// row BEFORE the judge is called, and sends it back only with the verdict. So
// this dialog shows the verdict first and the key underneath it — never a hint
// of which arm was which while the judge was working, because there was none.
//
// Server half: aidream POST /masterworks/audition-pairwise (durable streaming
// run via useMasterworkRun; verdict event `masterwork_pairwise_verdict`).
// Owner-only.

import { useState } from "react";
import { GitCompareArrows, Lock } from "lucide-react";
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
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import { MasterworkDictationOrigin } from "@/features/masterwork/MasterworkDictationOrigin";
import type { paths } from "@/types/python-generated/api-types";
import { useMasterworkRun } from "../../durable-run/useMasterworkRun";

const PAIRWISE_PATH = "/masterworks/audition-pairwise" satisfies keyof paths;

type Mode = "preference" | "faithfulness";

interface Difference {
  aspect: string;
  one_does: string;
  two_does: string;
  matters: string;
}

interface ArmFaithfulness {
  side: string;
  label: string;
  verdict: string;
  reasoning: string;
  departures: { rule_id: string; note: string }[];
  honored_rule_ids: string[];
}

interface PairwiseVerdict {
  mode: string;
  candidate_one_label: string;
  candidate_two_label: string;
  preferred: string | null;
  preferred_label: string | null;
  summary: string;
  differences: Difference[];
  faithfulness: ArmFaithfulness[];
  blind_key: Record<string, string>;
  blind_key_sealed_at: string | null;
  verdict_sentence: string | null;
}

function parseVerdict(raw: unknown): PairwiseVerdict | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (data.type !== "masterwork_pairwise_verdict") return null;
  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  return {
    mode: String(data.mode ?? "preference"),
    candidate_one_label: String(data.candidate_one_label ?? "Answer 1"),
    candidate_two_label: String(data.candidate_two_label ?? "Answer 2"),
    preferred: str(data.preferred),
    preferred_label: str(data.preferred_label),
    summary: String(data.summary ?? ""),
    differences: Array.isArray(data.differences)
      ? (data.differences as Difference[])
      : [],
    faithfulness: Array.isArray(data.faithfulness)
      ? (data.faithfulness as ArmFaithfulness[])
      : [],
    blind_key:
      data.blind_key && typeof data.blind_key === "object"
        ? (data.blind_key as Record<string, string>)
        : {},
    blind_key_sealed_at: str(data.blind_key_sealed_at),
    verdict_sentence: str(data.verdict_sentence),
  };
}

const FAITHFUL_COPY: Record<string, { label: string; cls: string }> = {
  faithful: {
    label: "true to its own book",
    cls: "border-primary/50 text-primary",
  },
  partly_faithful: {
    label: "mostly true to its own book",
    cls: "border-border text-foreground",
  },
  unfaithful: {
    label: "not its own book's answer",
    cls: "border-destructive/50 text-destructive",
  },
};

export function CompareTwoDialog({
  open,
  onOpenChange,
  rulebookId,
  initialFirst,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rulebookId: string;
  /** Prefill the first answer from a finished run, when opened from its result. */
  initialFirst?: string;
}) {
  const [mode, setMode] = useState<Mode>("preference");
  const [labelOne, setLabelOne] = useState("Answer 1");
  const [labelTwo, setLabelTwo] = useState("Answer 2");
  const [textOne, setTextOne] = useState(initialFirst ?? "");
  const [textTwo, setTextTwo] = useState("");
  const [rulebookTwo, setRulebookTwo] = useState("");
  const [caseNote, setCaseNote] = useState("");

  const run = useMasterworkRun<PairwiseVerdict>({
    surface: "compare_two",
    rulebookId,
    path: PAIRWISE_PATH,
    parseResult: parseVerdict,
  });
  const verdict = run.result;

  const compare = () => {
    if (textOne.trim().length < 50 || textTwo.trim().length < 50) {
      toast.error("Paste both answers first — at least a paragraph each.");
      return;
    }
    run.reset();
    void run.launch(
      {
        rulebook_id: rulebookId,
        mode,
        candidate_one: { label: labelOne.trim() || "Answer 1", text: textOne },
        candidate_two: {
          label: labelTwo.trim() || "Answer 2",
          text: textTwo,
          rulebook_id:
            mode === "faithfulness" && rulebookTwo.trim()
              ? rulebookTwo.trim()
              : undefined,
        },
        case_note: caseNote.trim() || undefined,
      },
      caseNote.trim() || "compare two",
    );
  };

  return (
    <MasterworkDictationOrigin
      surface="masterwork.compare_two"
      rulebookId={rulebookId}
    >
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCompareArrows className="h-4 w-4 text-primary" />
              Compare two answers
            </DialogTitle>
            <DialogDescription>
              Two answers to the same question, judged by someone who is never
              told which is which. You see which one was which only after the
              verdict is in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={mode === "preference" ? "default" : "outline"}
                onClick={() => setMode("preference")}
              >
                Which is better?
              </Button>
              <Button
                size="sm"
                variant={mode === "faithfulness" ? "default" : "outline"}
                onClick={() => setMode("faithfulness")}
              >
                Is each true to its own book?
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {mode === "preference"
                ? "The judge picks the answer a practitioner would rather have received, and names exactly what is different between them."
                : "Neither answer competes with the other: each is judged only against the rules of the book it came from. Two schools can both be right."}
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="compare-label-one">The first answer</Label>
              <Input
                id="compare-label-one"
                value={labelOne}
                onChange={(e) => setLabelOne(e.target.value)}
                placeholder="What do you call it? e.g. “Watson’s adviser”"
                maxLength={120}
              />
              <ProTextarea
                id="compare-text-one"
                value={textOne}
                onChange={(e) => setTextOne(e.target.value)}
                rows={5}
                enableTextStats
                placeholder="Paste the first answer…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="compare-label-two">The second answer</Label>
              <Input
                id="compare-label-two"
                value={labelTwo}
                onChange={(e) => setLabelTwo(e.target.value)}
                placeholder="What do you call it? e.g. “Montessori’s adviser”"
                maxLength={120}
              />
              <ProTextarea
                id="compare-text-two"
                value={textTwo}
                onChange={(e) => setTextTwo(e.target.value)}
                rows={5}
                enableTextStats
                placeholder="Paste the second answer…"
              />
              {mode === "faithfulness" ? (
                <Input
                  id="compare-rulebook-two"
                  value={rulebookTwo}
                  onChange={(e) => setRulebookTwo(e.target.value)}
                  placeholder="If the second answer comes from a DIFFERENT Rulebook, paste its id here — otherwise both are judged against this one."
                />
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="compare-case">
                What were they both answering?{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="compare-case"
                value={caseNote}
                onChange={(e) => setCaseNote(e.target.value)}
                placeholder="e.g. “the shoes and kitchen-counter case”"
                maxLength={2000}
              />
            </div>

            <Button onClick={compare} disabled={run.running}>
              {run.running
                ? (run.stage ?? "Judging blind…")
                : "Compare, blind"}
            </Button>
            {run.error ? (
              <p className="text-sm text-destructive">{run.error}</p>
            ) : null}

            {verdict ? (
              <div className="space-y-3 border-t border-border pt-3">
                {verdict.verdict_sentence ? (
                  <p className="rounded-md border border-primary/30 bg-primary/5 p-2 text-sm font-medium text-foreground">
                    {verdict.verdict_sentence}
                  </p>
                ) : null}
                <p className="text-sm text-foreground">{verdict.summary}</p>

                {verdict.differences.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground">
                      What is actually different
                    </p>
                    <ul className="space-y-2">
                      {verdict.differences.map((d, i) => (
                        <li
                          key={`${d.aspect}-${i}`}
                          className="rounded-md border border-border p-2 text-xs"
                        >
                          <p className="font-medium text-foreground">
                            {d.aspect}
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            <span className="font-medium">
                              {verdict.candidate_one_label}:
                            </span>{" "}
                            {d.one_does}
                          </p>
                          <p className="text-muted-foreground">
                            <span className="font-medium">
                              {verdict.candidate_two_label}:
                            </span>{" "}
                            {d.two_does}
                          </p>
                          {d.matters ? (
                            <p className="mt-1 text-foreground">{d.matters}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {verdict.faithfulness.length > 0 ? (
                  <div className="space-y-2">
                    {verdict.faithfulness.map((arm) => {
                      const copy =
                        FAITHFUL_COPY[arm.verdict] ??
                        FAITHFUL_COPY.partly_faithful;
                      return (
                        <div
                          key={arm.side}
                          className="rounded-md border border-border p-2"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {arm.label}
                            </span>
                            <Badge variant="outline" className={copy.cls}>
                              {copy.label}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {arm.reasoning}
                          </p>
                          {arm.departures.length > 0 ? (
                            <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                              {arm.departures.map((dep, i) => (
                                <li key={`${dep.rule_id}-${i}`}>
                                  <span className="font-medium">
                                    {dep.rule_id}
                                  </span>
                                  {dep.note ? ` — ${dep.note}` : null}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {/* The key. Shown only here, after the verdict — and it was
                    written down before the judge ever saw the answers. */}
                {Object.keys(verdict.blind_key).length > 0 ? (
                  <div className="rounded-md border border-border bg-muted/30 p-2">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      <Lock className="h-3 w-3" />
                      What the judge was reading
                    </p>
                    <ul className="mt-1 text-xs text-muted-foreground">
                      {Object.entries(verdict.blind_key).map(([slot, label]) => (
                        <li key={slot}>
                          It called <span className="font-medium">{slot}</span>{" "}
                          what you call{" "}
                          <span className="font-medium">{label}</span>
                        </li>
                      ))}
                    </ul>
                    {verdict.blind_key_sealed_at ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Written down at{" "}
                        {new Date(
                          verdict.blind_key_sealed_at,
                        ).toLocaleTimeString()}
                        , before the judge was asked — so it could not have been
                        chosen to fit the answer.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </MasterworkDictationOrigin>
  );
}
