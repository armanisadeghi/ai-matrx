"use client";

/**
 * NegativeVerdictFollowUp — the follow-up strip that appears beside the
 * thumbs whenever a NEGATIVE verdict exists on an assistant message. One
 * coherent surface, two moves:
 *
 *   [Diagnose]            → opens the drill-down review walk for this message
 *   [Attach your version] → O1 one-click corrected-output capture
 *                           (reads "Your version (attached)" once one exists)
 *
 * Feedback state is READ from the same `lib/output-feedback` store the
 * thumbs write (`skipFetch` — the host bar already loaded the record);
 * nothing here duplicates verdict state.
 */

import { lazy, Suspense, useState } from "react";
import { FilePenLine, Stethoscope } from "lucide-react";
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
      <div className={cn("flex flex-wrap items-center gap-1", className)}>
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
          className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
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
            "inline-flex h-10 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium",
            hasCorrection
              ? "border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
          aria-label={
            hasCorrection ? "Edit your attached version" : "Attach your version"
          }
        >
          <FilePenLine className="h-3.5 w-3.5" aria-hidden />
          {hasCorrection ? "Your version (attached)" : "Attach your version"}
        </button>
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
