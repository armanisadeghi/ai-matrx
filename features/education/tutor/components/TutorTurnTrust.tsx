"use client";

// features/education/tutor/components/TutorTurnTrust.tsx
//
// The PER-TURN structured trust surface for the conversational tutor — the real
// TrustEnvelope for the latest assistant answer, extracted from the tutor's
// streamed output (turnTrust.ts). This is the target state FEATURE.md called
// for: not a conversation-level grounding-DERIVED strip, but the honest,
// per-claim envelope for THIS turn, mounted flush under the answer it describes
// (via AgentConversationColumn's `afterMessages` slot).
//
// It renders the SAME P0 trust primitives every other education surface uses —
// never a bespoke citation/confidence UI:
//   • not_in_material → <RefusalNotice/>  (the honest-refusal presentation; the
//     tutor's prose already offers the general-knowledge choice, so no extra
//     escape-hatch button is wired here — the student just replies).
//   • grounded / inferred → <ConfidenceBadge/> + <SourceCitations/>.
//
// Renders nothing when the turn carries no envelope; the caller then falls back
// to the grounding-derived TutorTrustStrip.

import { ConfidenceBadge } from "@/features/education/trust/components/ConfidenceBadge";
import { SourceCitations } from "@/features/education/trust/components/SourceCitations";
import { RefusalNotice } from "@/features/education/trust/components/RefusalNotice";
import { isRefusal, type TrustEnvelope } from "@/features/education/trust/types";

export function TutorTurnTrust({ trust }: { trust: TrustEnvelope | null }) {
  if (!trust) return null;

  // Honest refusal — the answer isn't in the learner's material.
  if (isRefusal(trust)) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-2">
        <RefusalNotice message={null} />
      </div>
    );
  }

  // Grounded / inferred — show how grounded this specific answer is + its sources.
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-2">
      <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card/40 px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ConfidenceBadge confidence={trust.confidence} />
          {trust.groundedIn && (
            <span>
              Grounded in{" "}
              <span className="font-medium text-foreground">{trust.groundedIn}</span>
            </span>
          )}
        </div>
        <SourceCitations trust={trust} label={null} />
      </div>
    </div>
  );
}
