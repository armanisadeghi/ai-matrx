"use client";

/**
 * ⛔ QUARANTINED DEBT — DO NOT COPY, DO NOT EXTEND, DO NOT CITE.
 *
 * This file is a BESPOKE STREAM RENDERER: it buckets its own chunk text, opens
 * its own content-ir parse sessions, splits its own multi-payload segments,
 * hand-routes envelopes into kind components, and decides "done" on its own
 * signal. Every one of those is BANNED — see
 * `features/content-ir/FEATURE.md` § No bespoke stream renderers and the
 * matching rule in CLAUDE.md.
 *
 * It exists because it was built and wrongly documented as "the canonical
 * non-chat consumer" on 2026-07-26. It never was. Arman's ruling on
 * 2026-07-28: one hand-rolled renderer becomes ten thousand, the single
 * canonical system dies, and so does the product — no feature is small enough
 * to earn an exception. This one is scheduled for deletion; the replacement is
 * the execution system + `selectKindEnvelope` + the canonical block pipeline.
 *
 * Touching this file? The only sanctioned change is deleting it.
 */

import { useMemo, useState } from "react";
import { useLiveJsonRegion } from "@/features/content-ir/react/useLiveJsonRegion";
import type {
  KeywordClassificationBatchData,
  KeywordRelationshipResearchData,
} from "@/features/content-ir/kinds/keyword-research";
import {
  keywordClassificationServerDataFromEnvelope,
  keywordResearchServerDataFromEnvelope,
  splitKeywordClassificationSegments,
} from "@/features/content-ir/kinds/keyword-research";
import KeywordResearchBlock from "@/components/mardown-display/blocks/keyword-research/KeywordResearchBlock";
import KeywordClassificationBatchBlock from "@/components/mardown-display/blocks/keyword-research/KeywordClassificationBatchBlock";

export interface LiveResearchFeedProps {
  /** Stable per-launch key namespacing parse-session identities. */
  streamKey: string;
  researchText: string;
  researchDone: boolean;
  classificationText: string;
  classificationDone: boolean;
  selectedPhrases?: ReadonlySet<string>;
  disabledPhrases?: ReadonlySet<string>;
  onKeywordSelectionChange?: (phrase: string, selected: boolean) => void;
}

function LiveResearchRegion({
  identity,
  text,
  done,
  selectedPhrases,
  disabledPhrases,
  onKeywordSelectionChange,
}: {
  identity: string;
  text: string;
  done: boolean;
  selectedPhrases?: ReadonlySet<string>;
  disabledPhrases?: ReadonlySet<string>;
  onKeywordSelectionChange?: (phrase: string, selected: boolean) => void;
}) {
  const { envelope } = useLiveJsonRegion(identity, text, {
    expectedRootKind: "keyword_relationship_research",
    done,
  });
  const currentData = envelope
    ? keywordResearchServerDataFromEnvelope(envelope)
    : undefined;
  const [latest, setLatest] = useState<{
    text: string;
    data: KeywordRelationshipResearchData | null;
  }>({ text: "", data: null });
  if (currentData && latest.text !== text) {
    setLatest({ text, data: currentData });
  }
  const serverData = currentData ?? latest.data;
  if (!serverData) return null;
  return (
    <KeywordResearchBlock
      serverData={finalizeResearch(serverData, done)}
      selectedPhrases={selectedPhrases}
      disabledPhrases={disabledPhrases}
      onKeywordSelectionChange={onKeywordSelectionChange}
    />
  );
}

/**
 * The server's raw chunk relay can stop before the payload's closing bytes
 * (the full result is parsed server-side either way), leaving the envelope
 * permanently "streaming". The PHASE event is the truth here: once the phase
 * is done, everything rendered is final — kill the pulses.
 */
function finalizeResearch(
  data: KeywordRelationshipResearchData,
  done: boolean,
): KeywordRelationshipResearchData {
  if (!done || data.isComplete) return data;
  return {
    ...data,
    isComplete: true,
    lists: data.lists.map((list) => ({ ...list, complete: true })),
  };
}

function finalizeClassification(
  data: KeywordClassificationBatchData,
  done: boolean,
): KeywordClassificationBatchData {
  if (!done || data.isComplete) return data;
  return {
    ...data,
    isComplete: true,
    results: data.results.map((card) => ({ ...card, complete: true })),
  };
}

function LiveClassificationRegion({
  identity,
  text,
  done,
  selectedPhrases,
  disabledPhrases,
  onKeywordSelectionChange,
}: {
  identity: string;
  text: string;
  done: boolean;
  selectedPhrases?: ReadonlySet<string>;
  disabledPhrases?: ReadonlySet<string>;
  onKeywordSelectionChange?: (phrase: string, selected: boolean) => void;
}) {
  const { envelope } = useLiveJsonRegion(identity, text, {
    expectedRootKind: "keyword_classification_batch_v1",
    done,
  });
  const currentData = envelope
    ? keywordClassificationServerDataFromEnvelope(envelope)
    : undefined;
  const [latest, setLatest] = useState<{
    text: string;
    data: KeywordClassificationBatchData | null;
  }>({ text: "", data: null });
  if (currentData && latest.text !== text) {
    setLatest({ text, data: currentData });
  }
  const serverData = currentData ?? latest.data;
  if (!serverData) return null;
  return (
    <KeywordClassificationBatchBlock
      serverData={finalizeClassification(serverData, done)}
      selectedPhrases={selectedPhrases}
      disabledPhrases={disabledPhrases}
      onKeywordSelectionChange={onKeywordSelectionChange}
    />
  );
}

export default function LiveResearchFeed({
  streamKey,
  researchText,
  researchDone,
  classificationText,
  classificationDone,
  selectedPhrases,
  disabledPhrases,
  onKeywordSelectionChange,
}: LiveResearchFeedProps) {
  const classificationSegments = useMemo(
    () => splitKeywordClassificationSegments(classificationText),
    [classificationText],
  );

  if (researchText.trim() === "" && classificationSegments.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {researchText.trim() !== "" && (
        <LiveResearchRegion
          identity={`${streamKey}:research`}
          text={researchText}
          done={researchDone}
          selectedPhrases={selectedPhrases}
          disabledPhrases={disabledPhrases}
          onKeywordSelectionChange={onKeywordSelectionChange}
        />
      )}
      {classificationSegments.map((segment, index) => (
        <LiveClassificationRegion
          key={index}
          identity={`${streamKey}:classification:${index}`}
          text={segment}
          // A segment is closed the moment the NEXT batch root opens; the
          // last one closes when classification itself finishes.
          done={index < classificationSegments.length - 1 || classificationDone}
          selectedPhrases={selectedPhrases}
          disabledPhrases={disabledPhrases}
          onKeywordSelectionChange={onKeywordSelectionChange}
        />
      ))}
    </div>
  );
}
