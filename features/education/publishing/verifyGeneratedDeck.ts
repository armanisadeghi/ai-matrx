import { runAgentExtraction } from "@/features/education/convert/runAgentExtraction";
import {
  coerceTrustEnvelope,
  coerceVerifyResult,
  readStoredVerification,
  type VerifyResult,
} from "@/features/education/trust/types";
import {
  excerptFromCitations,
  persistVerificationVerdict,
} from "@/features/education/trust/useVerifyAgainstSource";
import { fcService } from "@/features/flashcards/data/fcService";
import { FC_MANDATES } from "@/features/flashcards/data/mandates";
import type { AppDispatch, AppStore } from "@/lib/redux/store";
import { ensureOrgId } from "@/lib/organizations/personalOrg";

export interface DeckCardVerification {
  cardId: string;
  front: string;
  verdict: VerifyResult;
}

export interface DeckVerificationResult {
  ready: boolean;
  cards: DeckCardVerification[];
}

export function assertGeneratedDeckHasCards(cardCount: number): void {
  if (cardCount === 0) {
    throw new Error(
      "The generated draft contains no cards. Generate this plan again before verification.",
    );
  }
}

/** Reuse a paid verdict only while it is still about the card's exact answer. */
export function currentStoredVerdict(
  metadata: unknown,
  currentBack: string,
): VerifyResult | null {
  const stored = readStoredVerification(metadata);
  if (
    !stored ||
    stored.status !== "verified" ||
    stored.verifiedBack !== currentBack
  ) {
    return null;
  }
  return {
    status: stored.status,
    explanation: stored.explanation,
    suggestedFix: stored.suggestedFix,
  };
}

/**
 * Verification pass for a generated draft. It refuses unknown/fabricated
 * chunk ids before paying for a verifier run, then persists every verdict via
 * the same card metadata seam used by the learner-facing trust action.
 */
export async function verifyGeneratedDeck(
  setId: string,
  allowedChunkIds: readonly string[],
  dispatch: AppDispatch,
  store: AppStore,
  onProgress?: (completed: number, total: number) => void,
): Promise<DeckVerificationResult> {
  const loaded = await fcService.getSetWithCards(setId);
  if (loaded.error || !loaded.data) {
    throw new Error(loaded.error ?? "The generated deck could not be loaded.");
  }
  assertGeneratedDeckHasCards(loaded.data.cards.length);

  // Execution refuses a run with no organization, so resolve one up front —
  // the never-null personal org — rather than depending on whatever the person
  // happens to have selected in the sidebar.
  const organizationId = await ensureOrgId(undefined);
  const allowed = new Set(allowedChunkIds);
  const results: DeckCardVerification[] = [];
  for (const card of loaded.data.cards) {
    const trust = coerceTrustEnvelope(card.metadata);
    const citations = trust?.citations ?? [];
    const citationIdsValid =
      citations.length > 0 &&
      citations.every(
        (citation) =>
          citation.sourceKind === "chunk" && allowed.has(citation.sourceId),
      );
    const sourceExcerpt = excerptFromCitations(citations);

    let verdict: VerifyResult;
    let shouldPersist = true;
    if (!citationIdsValid || !sourceExcerpt) {
      verdict = {
        status: "unverifiable",
        explanation:
          "The generated card did not cite one of the retrieved source passages.",
        suggestedFix: null,
      };
    } else {
      const stored = currentStoredVerdict(card.metadata, card.back);
      if (stored) {
        verdict = stored;
        shouldPersist = false;
      } else {
        const extracted = await runAgentExtraction(dispatch, store, {
          mandateKey: FC_MANDATES.verifyAgainstSource,
          surfaceKey: "education-content-pipeline-verify",
          sourceFeature: "education-flashcards",
          organizationId,
          variables: {
            front: card.front,
            back: card.back,
            source_excerpt: sourceExcerpt,
          },
          timeoutMs: 90_000,
        });
        verdict = coerceVerifyResult(extracted.value) ?? {
          status: "unverifiable",
          explanation: "The verification mandate returned no usable verdict.",
          suggestedFix: null,
        };
      }
    }

    if (shouldPersist) {
      await persistVerificationVerdict(
        { kind: "fc_card", id: card.id },
        verdict,
        card.back,
      );
    }
    results.push({ cardId: card.id, front: card.front, verdict });
    onProgress?.(results.length, loaded.data.cards.length);
  }

  return {
    ready:
      results.length > 0 &&
      results.every((result) => result.verdict.status === "verified"),
    cards: results,
  };
}
