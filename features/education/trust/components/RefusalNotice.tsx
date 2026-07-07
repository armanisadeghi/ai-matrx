// features/education/trust/components/RefusalNotice.tsx
//
// The honest-refusal surface. When an AI answer's confidence is
// `not_in_material`, the tutor (or any grounded surface) does NOT fabricate — it
// says so and offers the general-knowledge escape hatch as an EXPLICIT user
// choice. This component IS that presentation: a calm callout + one opt-in
// button. It is never a silent fallback; the user decides whether to leave the
// grounded corpus.

"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface RefusalNoticeProps {
  /** The refusal copy from the agent (falls back to a sensible default). */
  message?: string | null;
  /** Fired when the learner explicitly opts into a general-knowledge answer. */
  onAnswerAnyway?: () => void;
  /** Disable the escape hatch while a general-knowledge answer is generating. */
  busy?: boolean;
  className?: string;
}

const DEFAULT_MESSAGE =
  "That isn't in your study material, so I won't guess. Want me to answer from general knowledge instead?";

export function RefusalNotice({
  message,
  onAnswerAnyway,
  busy,
  className,
}: RefusalNoticeProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-amber-600/30 bg-amber-500/10 p-3",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <p className="text-sm text-foreground">{message?.trim() || DEFAULT_MESSAGE}</p>
      </div>
      {onAnswerAnyway && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onAnswerAnyway}
          disabled={busy}
          className="self-start"
        >
          {busy ? "Answering…" : "Answer from general knowledge"}
        </Button>
      )}
    </div>
  );
}
