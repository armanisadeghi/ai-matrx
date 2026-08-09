"use client";

/**
 * AssistChip — ONE assist rendered as a compact, actionable chip.
 *
 * The canonical rendering for an assist anywhere in the app: title +
 * accept (runs the typed action) + dismiss (durable). Used inline on
 * surfaces and stacked in the AssistsDock. Ephemeral assists (no id)
 * render without a dismiss control — they exist only while the condition
 * on screen exists.
 */

import { useState } from "react";
import { Lightbulb, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAssistRunner } from "../runtime/useAssistRunner";
import type { Assist } from "../types";

export function AssistChip({
  assist,
  className,
}: {
  assist: Assist;
  className?: string;
}) {
  const { acceptAssist, dismissAssist } = useAssistRunner();
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await acceptAssist(assist);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-1.5 rounded-full border border-primary/30 bg-card py-1 pl-2 pr-1 text-xs shadow-sm",
        className,
      )}
    >
      <button
        type="button"
        onClick={accept}
        disabled={busy}
        title={assist.body ?? assist.title}
        className="flex min-w-0 items-center gap-1.5 text-left text-foreground hover:text-primary disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        ) : (
          <Lightbulb className="h-3.5 w-3.5 shrink-0 text-primary" />
        )}
        <span className="truncate">{assist.title}</span>
      </button>
      {assist.id && (
        <button
          type="button"
          onClick={() => void dismissAssist(assist)}
          aria-label="Dismiss"
          className="rounded-full p-0.5 text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground group-hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
