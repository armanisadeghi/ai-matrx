// app/(core)/masterwork/[id]/drip/page.tsx
//
// THE DAILY DRIP's answer page — the URL every daily question links to.
//
// This route exists because the link in a text message or an email has to land
// somewhere that is ONE question and ONE field. A dialog on the Rulebook page
// cannot be that: it arrives behind the whole Rulebook, on a phone, for
// somebody who has thirty seconds.
//
// On the ONE lane scaffold like every other working mode: the Rulebook read is
// gated by AccessGate, the lane publishes the Rulebook surface scope, and the
// owner check is real — the answers, and the rules they become, have to be the
// Expert's own.

"use client";

import { use } from "react";
import { DripAnswerPage } from "@/features/masterwork/drip/DripAnswerPage";
import { RulebookLaneRoute } from "@/features/masterwork/components/RulebookLaneRoute";

export default function RulebookDripRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <RulebookLaneRoute
      rulebookId={id}
      lane="drip"
      title="Today's question"
      requireOwner
      ownerMessage="Only the Rulebook's owner can answer its daily question — the answers, and the rules they become, have to be the Expert's own."
    >
      {({ rulebook, reload }) => (
        <DripAnswerPage rulebook={rulebook} onAnswered={reload} />
      )}
    </RulebookLaneRoute>
  );
}
