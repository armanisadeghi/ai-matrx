"use client";

/**
 * NegativeVerdictFollowUp — the follow-up strip that appears beside the
 * thumbs whenever a NEGATIVE verdict exists on an assistant message. One
 * coherent surface, two moves plus help:
 *
 *   [Diagnose]            → opens the turn-based drill-down review walk
 *   [Attach your version] → O1 one-click corrected-output capture
 *                           (reads "Your version (attached)" once one exists)
 *   [?]                   → popover explaining what each action actually does
 *
 * Styling matches the tap-button pills around it (rounded-full, quiet until
 * hover) — this strip must read as part of the action bar, not a foreign UI.
 *
 * Feedback state is READ from the same `lib/output-feedback` store the
 * thumbs write (`skipFetch` — the host bar already loaded the record);
 * nothing here duplicates verdict state.
 */

import { lazy, Suspense, useState } from "react";
import { FilePenLine, HelpCircle, Stethoscope } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useOutputFeedback } from "@/lib/output-feedback/useOutputFeedback";
import { useOpenReviewWalkWindow } from "@/features/overlays/openers/reviewWalkWindow";
import { cn } from "@/lib/utils";

// The editor pulls ProTextarea (voice + agent menu) — loaded only after the
// user actually asks for it, like the other one-shot chat dialogs.
const AttachVersionDialog = lazy(() =>
  import("./AttachVersionDialog").then((m) => ({
    default: m.AttachVersionDialog,
  })),
);

export interface NegativeVerdictFollowUpProps {
  /** Server `cx_message.id` — the walk's root unit. */
  messageId: string;
  /** The message content as rendered — prefill for "Attach your version". */
  content: string;
  /** Surfaces-registry name of the host bar (forwarded to feedback writes). */
  surfaceName?: string | null;
  /** The agent behind the conversation, when the host knows it — powers the
   * finding receipt's door to `/agents/{id}/hindsight`. */
  agentId?: string | null;
  agentName?: string | null;
  className?: string;
}

const PILL =
  "inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

export function NegativeVerdictFollowUp({
  messageId,
  content,
  surfaceName,
  agentId,
  agentName,
  className,
}: NegativeVerdictFollowUpProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMounted, setEditorMounted] = useState(false);
  const openWalk = useOpenReviewWalkWindow();

  // Same store the thumbs write to — the host bar already fetched the record.
  const { record, verdict, captureCorrection, isSaving } = useOutputFeedback({
    subjectType: "message",
    subjectId: messageId,
    surfaceName: surfaceName ?? null,
    originalContent: content,
    skipFetch: true,
  });

  if (verdict !== "negative") return null;

  const hasCorrection = Boolean(record?.correctedContent);

  return (
    <>
      <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
        <button
          type="button"
          onClick={() =>
            openWalk({
              unitKind: "assistant_message",
              unitId: messageId,
              agentId: agentId ?? null,
              agentName: agentName ?? null,
            })
          }
          className={PILL}
          aria-label="Diagnose this response"
        >
          <Stethoscope className="h-3.5 w-3.5" aria-hidden />
          Diagnose
        </button>
        <button
          type="button"
          onClick={() => {
            setEditorMounted(true);
            setEditorOpen(true);
          }}
          className={cn(
            PILL,
            hasCorrection &&
              "border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300",
          )}
          aria-label={
            hasCorrection ? "Edit your attached version" : "Attach your version"
          }
        >
          <FilePenLine className="h-3.5 w-3.5" aria-hidden />
          {hasCorrection ? "Your version (attached)" : "Attach your version"}
        </button>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="What do these do?"
            >
              <HelpCircle className="h-3.5 w-3.5" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 space-y-3 text-xs">
            <div>
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
                <Stethoscope className="h-3.5 w-3.5" aria-hidden />
                Diagnose
              </div>
              <p className="text-muted-foreground">
                Opens a breakdown of this turn — your message, the context the
                system added, and every step the agent took. Mark the piece
                that looks wrong and the system traces where it came from,
                then files it so the agent actually gets fixed.
              </p>
            </div>
            <div>
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
                <FilePenLine className="h-3.5 w-3.5" aria-hidden />
                Attach your version
              </div>
              <p className="text-muted-foreground">
                Write what the response SHOULD have said. Your version is
                saved next to the original and becomes the reference the
                system judges itself against.
              </p>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {editorMounted && (
        <Suspense fallback={null}>
          <AttachVersionDialog
            open={editorOpen}
            onOpenChange={setEditorOpen}
            originalContent={record?.originalContent ?? content}
            existingCorrection={record?.correctedContent ?? null}
            captureCorrection={captureCorrection}
            isSaving={isSaving}
          />
        </Suspense>
      )}
    </>
  );
}
