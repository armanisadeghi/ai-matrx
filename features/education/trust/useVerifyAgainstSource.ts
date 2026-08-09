"use client";

// features/education/trust/useVerifyAgainstSource.ts
//
// The "Verify against source" trust action. Given a card (front/back) and the
// exact source passage it cited (the envelope's citation excerpts), re-check
// whether the card is STILL faithfully supported — catching drift after a
// source edit or a manual card change. Drives the `verifyAgainstSource` agent
// and returns a typed VerifyResult.
//
// Runs through the canonical headless primitive (`useHeadlessAgentJson`,
// D126). React Compiler is on — no manual memo.

import { useState } from "react";
import { useHeadlessAgentJson } from "@/features/agents/hooks/useHeadlessAgentJson";
import { FC_AGENTS } from "@/features/flashcards/data/agents";
import { coerceVerifyResult, type SourceCitation, type VerifyResult } from "./types";

const EXTRACTION_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 250;

export interface VerifyAgainstSourceArgs {
  front: string;
  back: string;
  /** The cited passage(s) to verify against — usually the citations' excerpts. */
  sourceExcerpt: string;
}

export interface UseVerifyAgainstSource {
  verify: (args: VerifyAgainstSourceArgs) => Promise<VerifyResult | null>;
  isVerifying: boolean;
  result: VerifyResult | null;
  error: string | null;
  reset: () => void;
}

/** Build the source-excerpt string from an envelope's citations. */
export function excerptFromCitations(citations: SourceCitation[]): string {
  return citations
    .map((c) => (c.excerpt ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
}

export function useVerifyAgainstSource(): UseVerifyAgainstSource {
  const { run, isRunning, error, reset: resetRun } = useHeadlessAgentJson();
  const [result, setResult] = useState<VerifyResult | null>(null);

  async function verify(
    args: VerifyAgainstSourceArgs,
  ): Promise<VerifyResult | null> {
    setResult(null);
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
        agentId: FC_AGENTS.verifyAgainstSource,
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
      });
      setResult(verdict);
      return verdict;
    } catch {
      // The hook already mirrored the message into `error`.
      return null;
    }
  }

  function reset() {
    setResult(null);
    resetRun();
  }

  return { verify, isVerifying: isRunning, result, error, reset };
}
