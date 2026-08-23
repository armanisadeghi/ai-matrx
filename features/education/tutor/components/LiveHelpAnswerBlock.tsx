"use client";

// features/education/tutor/components/LiveHelpAnswerBlock.tsx
//
// THE render of a `flashcards.help_live` answer — the `live_help_answer` kind
// (answer + hint level + followups + trust envelope), drawn by the kind's
// registered component through the canonical kind render path
// (KindInstanceRender -> applyIrKindRoute -> the same component a
// `__kind: live_help_answer` block gets in chat). Mounted by every surface that
// asks the tutor (StudyDeck AskAiPanel, FastFireLiveCard, the flashcard-app
// Ask AI chat) so the answer is ONE render, not three bespoke copies
// (agent-manifest wave 1, 2026-08-22).
//
// The surfaces keep what is theirs: the ask affordance, instant helper audio,
// journaling. The one piece of presentation that stays here by design is the
// refusal gate — an honest "not in your material" answer is a RefusalNotice,
// never a normal answer bubble, on every surface alike.

import { RefusalNotice } from "@/features/education/trust/components/RefusalNotice";
import { ConfidenceBadge } from "@/features/education/trust/components/ConfidenceBadge";
import { SourceCitations } from "@/features/education/trust/components/SourceCitations";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import {
  LIVE_HELP_ANSWER_KIND,
  liveHelpAnswerValue,
  type HelpLiveResult,
} from "../lanes/helpLive";

export function LiveHelpAnswerBlock({
  result,
  className,
}: {
  result: HelpLiveResult;
  className?: string;
}) {
  if (result.trust?.confidence === "not_in_material") {
    return <RefusalNotice message={result.answer} />;
  }
  return (
    <div className={className}>
      <KindInstanceRender
        kind={LIVE_HELP_ANSWER_KIND}
        value={liveHelpAnswerValue(result)}
        variant="bare"
        showRoutingNote={false}
        // The registry floor: when no component is render-trusted for the kind
        // (held inactive / registry cold on a stale client) the answer still
        // reads as an answer — never a JSON document in front of a learner.
        unroutableFallback={<PlainHelpAnswer result={result} />}
      />
    </div>
  );
}

function PlainHelpAnswer({ result }: { result: HelpLiveResult }) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
      {result.trust && (
        <div className="mb-1.5 flex items-center gap-2">
          <ConfidenceBadge confidence={result.trust.confidence} />
        </div>
      )}
      <p>{result.answer}</p>
      {result.followups.length > 0 && (
        <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs opacity-80">
          {result.followups.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {result.trust && result.trust.citations.length > 0 && (
        <div className="mt-1.5">
          <SourceCitations trust={result.trust} label="Sources" />
        </div>
      )}
    </div>
  );
}
