"use client";

/**
 * LiveResearchFeed — renders the research run's agent output as REAL
 * components, live, key by key, while the stream is still running.
 *
 * The canonical pattern for a bespoke (non-chat) streaming surface: feed the
 * accumulating chunk buffers into `useLiveJsonRegion` (one parse session per
 * JSON region) and render each envelope through the SAME kind components
 * chat uses (components/mardown-display/blocks/keyword-research/), via the
 * kinds' streaming serverData bridges. Raw JSON never reaches the DOM.
 *
 * The classification phase may emit several sequential batch payloads;
 * `splitKeywordClassificationSegments` gives each its own region/session.
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
