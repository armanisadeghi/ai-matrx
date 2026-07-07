"use client";

// features/education/trust/useVerifyAgainstSource.ts
//
// The "Verify against source" trust action. Given a card (front/back) and the
// exact source passage it cited (the envelope's citation excerpts), re-check
// whether the card is STILL faithfully supported — catching drift after a
// source edit or a manual card change. Drives the `verifyAgainstSource` agent
// and returns a typed VerifyResult.
//
// Mirrors the production launch+extract pattern (useGenerateCards): launch a
// background auto-run with JSON extraction on, poll the active-requests slice
// until extraction finalizes, coerce. React Compiler is on — no manual memo.

import { useState } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
  selectRequestError,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { RootState } from "@/lib/redux/store";
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
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function waitForExtraction(requestId: string): Promise<VerifyResult | null> {
    const start = Date.now();
    while (Date.now() - start < EXTRACTION_TIMEOUT_MS) {
      const state = store.getState() as RootState;
      if (selectJsonExtractionComplete(requestId)(state)) {
        const snapshot = selectFirstExtractedObject(requestId)(state);
        return coerceVerifyResult(snapshot?.value ?? null);
      }
      if (selectRequestStatus(requestId)(state) === "error") {
        const reqError = selectRequestError(requestId)(state);
        throw new Error(
          reqError?.user_message ??
            reqError?.message ??
            "Verification failed before returning a result",
        );
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error("Timed out verifying against the source");
  }

  async function verify(
    args: VerifyAgainstSourceArgs,
  ): Promise<VerifyResult | null> {
    setIsVerifying(true);
    setError(null);
    setResult(null);
    try {
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
      const { requestId } = await dispatch(
        launchAgentExecution({
          agentId: FC_AGENTS.verifyAgainstSource,
          surfaceKey: "education-trust-verify",
          sourceFeature: "education-flashcards",
          jsonExtraction: { enabled: true },
          runtime: {
            variables: {
              front: args.front,
              back: args.back,
              source_excerpt: args.sourceExcerpt,
            },
          },
          config: { autoRun: true, displayMode: "background" },
        }),
      ).unwrap();
      if (!requestId) throw new Error("Verification launch returned no request id");
      const verdict = await waitForExtraction(requestId);
      setResult(verdict);
      return verdict;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Verification failed";
      setError(message);
      return null;
    } finally {
      setIsVerifying(false);
    }
  }

  function reset() {
    setResult(null);
    setError(null);
  }

  return { verify, isVerifying, result, error, reset };
}
