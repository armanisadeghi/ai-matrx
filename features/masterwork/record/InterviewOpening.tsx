"use client";

// features/masterwork/record/InterviewOpening.tsx
//
// 🚨 THE INTERVIEW NEVER OPENS IN SILENCE.
//
// Cold walk 13 (2026-09-20, N8): "Start the interview" showed a bare
// `ChatRoomSkeleton` for 60 seconds and "Continue this one" showed the same
// one for 53 seconds. A skeleton is a LAYOUT promise — it says "something of
// roughly this shape is coming" — and it is the right thing to draw. What it
// cannot do is answer the only two questions a person has while they watch it:
// how long has this been, and is it broken. Sixty seconds of a motionless
// shape is read as "stuck", which is exactly what the walker concluded.
//
// So every waiting gate in the interview draws the skeleton AND the platform's
// one waiting line over it (`lib/progress/WorkingNotice.tsx`) — the same
// primitive the distillation and Shadow panels already use, the same clock
// tick, and the same sentence that stops promising once it has been overtaken.
//
// It is ONE component rather than three copies because the three gates
// (resolving the interviewer, reading the history, minting or rehydrating the
// conversation) are the same wait wearing three sentences, and a fourth gate
// added later should not have to remember any of this.

import { WorkingNotice } from "@/lib/progress/WorkingNotice";
import { ChatRoomSkeleton } from "@/features/agents/components/chat/ChatRoomSkeleton";

export function InterviewOpening({
  doing,
  startedAt,
  usualMs,
}: {
  /** What is happening, in the Expert's language. Rendered verbatim. */
  doing: string;
  /** When this wait began, epoch ms. */
  startedAt: number;
  /** How long this kind of opening usually takes — see `openingRates.ts`. */
  usualMs: number;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pt-4">
        <WorkingNotice doing={doing} startedAt={startedAt} usualMs={usualMs} />
      </div>
      {/* The skeleton keeps its job: no spinner-then-shift when the column
          lands. It is now the BACKDROP to the sentence, not the whole answer. */}
      <div className="min-h-0 flex-1 overflow-hidden" aria-hidden>
        <ChatRoomSkeleton />
      </div>
    </div>
  );
}
