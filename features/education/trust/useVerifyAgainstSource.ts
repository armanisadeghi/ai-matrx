"use client";

// features/education/trust/useVerifyAgainstSource.ts
//
// The "Verify against source" trust action. Given a card (front/back) and the
// exact source passage it cited (the envelope's citation excerpts), re-check
// whether the card is STILL faithfully supported — catching drift after a
// source edit or a manual card change. Drives the `verifyAgainstSource` agent
// and returns a typed VerifyResult.
//
// Runs through the canonical `useFloatingAgentRun` primitive: the check
// STREAMS into the floating LiveRunWindow while the model re-reads the cited
// passage (THE FLOATING LAW — never a spinner while AI works). React Compiler
// is on — no manual memo.

import { useState } from "react";
import { useFloatingAgentRun } from "@/features/agents/hooks/useFloatingAgentRun";
import { FC_MANDATES } from "@/features/flashcards/data/mandates";
import { fcService } from "@/features/flashcards/data/fcService";
import { toast } from "@/lib/toast";
import {
  coerceVerifyResult,
  stampAppliedCorrection,
  VERIFICATION_KEY,
  type SourceCitation,
  type VerifyResult,
  type VerifySubject,
} from "./types";

const EXTRACTION_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 250;

export interface VerifyAgainstSourceArgs {
  front: string;
  back: string;
  /** The cited passage(s) to verify against — usually the citations' excerpts. */
  sourceExcerpt: string;
  /**
   * The durable row this verdict is about. With it (D151) the verdict is
   * PERSISTED the instant it lands — so the same card stops being re-verified
   * forever — and `applyFix` becomes available. Without it the verdict is
   * transient, exactly as before.
   */
  subject?: VerifySubject;
}

export interface UseVerifyAgainstSource {
  verify: (args: VerifyAgainstSourceArgs) => Promise<VerifyResult | null>;
  isVerifying: boolean;
  result: VerifyResult | null;
  error: string | null;
  /**
   * Write a `drifted` verdict's `suggestedFix` onto the subject as its new
   * answer, and stamp the stored verdict as applied. A corrected answer the
   * user cannot apply is a paid answer thrown away twice over.
   */
  applyFix: (subject: VerifySubject, fix: string) => Promise<boolean>;
  applying: boolean;
  reset: () => void;
}

/** Build the source-excerpt string from an envelope's citations. */
export function excerptFromCitations(citations: SourceCitation[]): string {
  return citations
    .map((c) => (c.excerpt ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Persist a verdict onto its subject row. Only fc_card has a home today. */
export async function persistVerificationVerdict(
  subject: VerifySubject,
  verdict: VerifyResult,
  verifiedBack: string,
): Promise<void> {
  const saved = await fcService.mergeCardJson(
    subject.id,
    "metadata",
    (current) => ({
      ...current,
      [VERIFICATION_KEY]: {
        status: verdict.status,
        explanation: verdict.explanation,
        suggestedFix: verdict.suggestedFix,
        verifiedBack,
        verifiedAt: new Date().toISOString(),
        appliedAt: null,
      },
    }),
  );
  if (saved.error) {
    console.error(
      "[trust.verifyAgainstSource] verdict produced but NOT saved:",
      saved.error,
    );
  }
}

export function useVerifyAgainstSource(): UseVerifyAgainstSource {
  const { run, isRunning, error, reset: resetRun } = useFloatingAgentRun();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [applying, setApplying] = useState(false);

  async function verify(
    args: VerifyAgainstSourceArgs,
  ): Promise<VerifyResult | null> {
    setResult(null);
    // Clear any prior run's error + window too — the early "unverifiable"
    // return below never enters run(), which is where the hook clears its own
    // error state.
    resetRun();
    if (!args.sourceExcerpt.trim()) {
      // No cited passage to check against — an honest "can't verify", not an error.
      const unverifiable: VerifyResult = {
        status: "unverifiable",
        explanation: "This card has no cited source passage to verify against.",
        suggestedFix: null,
      };
      setResult(unverifiable);
      return unverifiable;
    }
    try {
      const verdict = await run<VerifyResult | null>({
        mandateKey: FC_MANDATES.verifyAgainstSource,
        label: "Verifying against the source",
        surfaceKey: "education-trust-verify",
        sourceFeature: "education-flashcards",
        variables: {
          front: args.front,
          back: args.back,
          source_excerpt: args.sourceExcerpt,
        },
        timeoutMs: EXTRACTION_TIMEOUT_MS,
        pollIntervalMs: POLL_INTERVAL_MS,
        failureMessages: {
          streamError: "Verification failed before returning a result",
          noJson: "Verification finished but returned no structured result",
          timeout: "Timed out verifying against the source",
        },
        coerce: (value) => coerceVerifyResult(value),
        // 🚨 D151 — persist on arrival, from inside the primitive. A verdict
        // held only in this hook's state dies with the card view, and the same
        // card is then re-verified (and re-paid for) on every visit.
        ...(args.subject
          ? {
              onResult: async (runResult) => {
                const verdict = coerceVerifyResult(runResult.data);
                if (!verdict) return;
                await persistVerificationVerdict(
                  args.subject as VerifySubject,
                  verdict,
                  args.back,
                );
              },
            }
          : {}),
      });
      setResult(verdict);
      return verdict;
    } catch {
      // The hook already mirrored the message into `error`.
      return null;
    }
  }

  async function applyFix(
    subject: VerifySubject,
    fix: string,
  ): Promise<boolean> {
    setApplying(true);
    try {
      const written = await fcService.updateCard(subject.id, { back: fix });
      if (written.error) {
        toast.error("Couldn't apply the correction", {
          description: written.error,
        });
        return false;
      }
      // The verdict is now history, not a pending decision — stamp it so the
      // surface stops offering an action the user already took.
      const stamped = await fcService.mergeCardJson(
        subject.id,
        "metadata",
        (current) => stampAppliedCorrection(current, fix),
      );
      if (stamped.error) {
        console.error(
          "[trust.applyFix] correction applied but not stamped:",
          stamped.error,
        );
      }
      setResult((prev) => (prev ? { ...prev, status: "verified" } : prev));
      toast.success("Correction applied to this card.");
      return true;
    } finally {
      setApplying(false);
    }
  }

  function reset() {
    setResult(null);
    resetRun();
  }

  return {
    verify,
    isVerifying: isRunning,
    result,
    error,
    applyFix,
    applying,
    reset,
  };
}
