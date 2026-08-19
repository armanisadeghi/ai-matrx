"use client";

// features/masterwork/coherence/OpenQuestionsCard.tsx
//
// "A few things only you can settle" — the Expert-facing half of the Coherence
// Partner (D11 · UNPARTNERED CAPTURE).
//
// Arman, 2026-08-19, on discovering contradictions in his own Rulebook only
// once a DOWNSTREAM agent tripped over them: "why didn't these get caught in
// the previous step? … there was no one working with me in the previous step."
//
// So the questions come to him here, where his rules are, phrased so each one
// is answerable in a sentence. Three laws this card is built around:
//
//   1. NEVER A BLOCKER. Human inconsistency is normal. Nothing gates on these —
//      not approval, not Build, not release. They sit here until answered, and
//      "it depends" / "both are right" is a real answer, not a dodge.
//   2. IT CHANGES NO RULE. Settling a question records the ANSWER. If the answer
//      means a rule should change, that is the Expert's own edit (or the Scout's
//      draft they approve) — an AI never overwrites human-authored work
//      (common-docs/systems/provenance-stamping/FEATURE.md).
//   3. IT NEVER ASKS TWICE. Every outcome here is final; the server feeds settled
//      questions back to the partner so it cannot re-raise them.
//
// On the four review verbs (systems/masterwork FEATURE.md § learned pattern 1b):
// Approve / Reject / Improve / Edit are the verbs for a machine-authored ITEM the
// human accepts into their work. A question is not an item — there is nothing to
// approve, edit or rewrite, only to answer. The four verbs map here as: answer it
// in your own words · both are right · that isn't a problem · talk it through with
// the interviewer. That is this surface's honest equivalent, declared per that rule.

import { useState } from "react";
import { Check, HelpCircle, MessagesSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import type { Rulebook } from "../types";
import { openTensions, TENSION_LABELS, type Tension } from "./types";
import { settleTension } from "./service";

export interface OpenQuestionsCardProps {
  rulebook: Rulebook;
  canEdit: boolean;
  /** Refetch after a settle, so the row leaves the list. */
  onSettled: () => void | Promise<void>;
  /**
   * Open the Scout with this question already in the composer (never auto-sent) —
   * the same seed contract the assists chips use.
   */
  onTalkItThrough: (seed: string) => void;
  /** Scroll/focus one of the Expert's own rules (THE DOOR LAW). */
  onOpenRule?: (ruleId: string) => void;
}

function seedFor(tension: Tension): string {
  return `I want to settle this: ${tension.question}`;
}

export function OpenQuestionsCard({
  rulebook,
  canEdit,
  onSettled,
  onTalkItThrough,
  onOpenRule,
}: OpenQuestionsCardProps) {
  const questions = openTensions(rulebook);
  const [answering, setAnswering] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  if (questions.length === 0) return null;

  const settle = async (
    tension: Tension,
    outcome: "answered" | "accepted" | "dismissed",
    answer?: string,
  ) => {
    setBusy(tension.id);
    try {
      const result = await settleTension({
        rulebookId: rulebook.id,
        tensionId: tension.id,
        outcome,
        ...(answer ? { answer } : {}),
      });
      if (result.status === "saved") {
        setAnswering(null);
        setDraft("");
        await onSettled();
        return;
      }
      toast.error(
        result.status === "conflict"
          ? "Your rulebook changed while you were answering — reopen and try again."
          : "That question is no longer here.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't save that answer.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <HelpCircle className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">
          A few things only you can settle
        </h2>
        <Badge variant="secondary" className="ml-auto">
          {questions.length}
        </Badge>
      </header>
      <p className="px-4 pt-2.5 text-xs text-muted-foreground">
        We read your rules together as one set. Nothing is wrong and nothing is
        waiting on these — a sentence from you on each one just makes them
        impossible to misread later.
      </p>
      <ul className="divide-y divide-border">
        {questions.map((tension) => {
          const isAnswering = answering === tension.id;
          const isBusy = busy === tension.id;
          return (
            <li key={tension.id} className="px-4 py-3">
              <div>
                <Badge variant="outline" className="mb-1.5 text-xs">
                  {TENSION_LABELS[tension.kind]}
                </Badge>
                <div>
                  <p className="text-sm">{tension.question}</p>
                  {tension.why ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tension.why}
                    </p>
                  ) : null}
                  {/* THE DOOR LAW — every rule named here is reachable. */}
                  {onOpenRule && tension.rule_ids.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {tension.rule_ids.map((ruleId) => {
                        const rule = rulebook.rules.find(
                          (r) => r.id === ruleId,
                        );
                        return (
                          <button
                            key={ruleId}
                            type="button"
                            className="text-xs text-primary underline-offset-2 hover:underline"
                            onClick={() => onOpenRule(ruleId)}
                          >
                            {rule?.name ?? ruleId}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>

              {canEdit ? (
                <div className="mt-2.5 pl-2">
                  {isAnswering ? (
                    <div className="space-y-2">
                      {tension.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          disabled={isBusy}
                          className="block w-full rounded border border-border px-2.5 py-1.5 text-left text-xs hover:bg-accent disabled:opacity-50"
                          onClick={() =>
                            void settle(tension, "answered", option)
                          }
                        >
                          {option}
                        </button>
                      ))}
                      {tension.recommendation ? (
                        <p className="text-xs text-muted-foreground">
                          If it helps: {tension.recommendation}
                        </p>
                      ) : null}
                      <ProTextarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder="Or say it in your own words — one sentence is plenty."
                        autoGrow
                        minHeight={72}
                        maxHeight={180}
                        className="text-xs"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="h-7"
                          disabled={isBusy || draft.trim().length === 0}
                          onClick={() =>
                            void settle(tension, "answered", draft.trim())
                          }
                        >
                          <Check className="h-3.5 w-3.5" />
                          Save my answer
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          onClick={() => {
                            setAnswering(null);
                            setDraft("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="h-7"
                        disabled={isBusy}
                        onClick={() => {
                          setAnswering(tension.id);
                          setDraft("");
                        }}
                      >
                        Answer this
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        disabled={isBusy}
                        onClick={() => onTalkItThrough(seedFor(tension))}
                      >
                        <MessagesSquare className="h-3.5 w-3.5" />
                        Talk it through
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        disabled={isBusy}
                        onClick={() => void settle(tension, "accepted")}
                      >
                        Both are right
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-muted-foreground"
                        disabled={isBusy}
                        onClick={() => void settle(tension, "dismissed")}
                      >
                        <X className="h-3.5 w-3.5" />
                        Not a problem
                      </Button>
                    </div>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
