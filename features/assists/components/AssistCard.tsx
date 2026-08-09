"use client";

/**
 * AssistCard — the EXPANDED view of one assist: full title (never truncated),
 * readable markdown body, the agent's reasoning when present, and an
 * intentional action row. This is where the Claude-Code bar is enforced:
 * the user reads exactly what will happen, then clicks a verb-labeled
 * button. The card never auto-runs anything.
 */

import { lazy, Suspense, useState } from "react";
import { Lightbulb, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAssistRunner } from "../runtime/useAssistRunner";
import { describeAssistAction } from "../runtime/action-descriptors";
import type { Assist } from "../types";

// Markdown loads only when a card actually opens — chips stay feather-light.
const BasicMarkdownContent = lazy(
  () => import("@/components/mardown-display/chat-markdown/BasicMarkdownContent"),
);

const SOURCE_LABEL: Record<Assist["sourceKind"], string> = {
  deterministic: "Noticed by the system",
  agent: "Suggested by AI",
  sweep: "Found by a background review",
  stream: "From a live run",
};

export function AssistCard({
  assist,
  onClose,
}: {
  assist: Assist;
  /** Close the containing popover (after an action, or "Not now"). */
  onClose: () => void;
}) {
  const { acceptAssist, dismissAssist } = useAssistRunner();
  const [busy, setBusy] = useState<"run" | "dismiss" | null>(null);
  const descriptor = describeAssistAction(assist.action);

  const run = async () => {
    if (busy) return;
    setBusy("run");
    try {
      const outcome = await acceptAssist(assist);
      if (outcome.ok) {
        if (descriptor) toast.success(descriptor.receipt);
        onClose();
      }
      // Failures already toast + capture inside the runner; keep the card
      // open so the user still has the context.
    } finally {
      setBusy(null);
    }
  };

  const dismiss = async () => {
    if (busy) return;
    setBusy("dismiss");
    try {
      await dismissAssist(assist);
      onClose();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex w-full flex-col">
      <div className="flex items-start gap-2 border-b border-border/60 px-3 py-2.5">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-snug text-foreground">
            {assist.title}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {SOURCE_LABEL[assist.sourceKind]}
            {typeof assist.confidence === "number" &&
              ` · ${Math.round(assist.confidence * 100)}% confident`}
          </div>
        </div>
      </div>

      {(assist.body || assist.reasoning) && (
        <div className="max-h-64 overflow-y-auto px-3 py-2 text-sm">
          {assist.body && (
            <Suspense
              fallback={
                <p className="whitespace-pre-wrap text-foreground">
                  {assist.body}
                </p>
              }
            >
              <BasicMarkdownContent
                content={assist.body}
                showCopyButton={false}
              />
            </Suspense>
          )}
          {assist.reasoning && (
            <div className="mt-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Why: </span>
              {assist.reasoning}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-border/60 px-3 py-2">
        {descriptor ? (
          <p className="mb-2 text-xs text-muted-foreground">
            {descriptor.explainer}
          </p>
        ) : (
          <p className="mb-2 text-xs text-destructive">
            This assist's action type isn't recognized by this version of the
            app.
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={run}
            disabled={!descriptor || busy !== null}
            className="h-7 px-3 text-xs"
          >
            {busy === "run" && (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            )}
            {descriptor?.verb ?? "Unavailable"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            disabled={busy !== null}
            className="h-7 px-2 text-xs text-muted-foreground"
          >
            Not now
          </Button>
          {assist.id && (
            <Button
              size="sm"
              variant="ghost"
              onClick={dismiss}
              disabled={busy !== null}
              className="ml-auto h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
            >
              {busy === "dismiss" && (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              )}
              Don't show again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
