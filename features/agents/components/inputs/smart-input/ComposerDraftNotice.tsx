"use client";

// The one quiet line the durable composer draft is allowed to say.
//
// Two things must never be silent: a restore (text the person did not just type
// appearing in their box) and a refusal (the browser blocking storage, so the
// draft is NOT being kept). Everything else says nothing at all.

import { RotateCcw, TriangleAlert } from "lucide-react";
import { useComposerDraftRestore } from "@/features/agents/redux/execution-system/instance-user-input/useComposerDraftRestore";

/** Long enough that losing it on a reload would actually hurt. */
const SILENCE_BELOW_CHARS = 120;

export function ComposerDraftNotice({
  conversationId,
  surfaceKey,
  currentChars,
}: {
  conversationId: string;
  /** Stable per surface AND per record — the alias that survives a re-minted id. */
  surfaceKey?: string;
  currentChars: number;
}) {
  const { restored, restoredChars, storageAvailable, enabled, acknowledge } =
    useComposerDraftRestore(conversationId, surfaceKey);

  if (restored) {
    return (
      <div className="flex items-center gap-1.5 px-1 pt-1 text-[11px] text-muted-foreground">
        <RotateCcw className="w-3 h-3 shrink-0" />
        <span>
          We put your unsent draft back ({restoredChars.toLocaleString()}{" "}
          characters).
        </span>
        <button
          type="button"
          onClick={acknowledge}
          className="underline underline-offset-2 hover:text-foreground"
        >
          Dismiss
        </button>
      </div>
    );
  }

  // Honest failure: the person is writing something long and this browser will
  // not keep it. Never a silent no-op they believe is working.
  if (enabled && !storageAvailable && currentChars >= SILENCE_BELOW_CHARS) {
    return (
      <div className="flex items-center gap-1.5 px-1 pt-1 text-[11px] text-amber-600 dark:text-amber-500">
        <TriangleAlert className="w-3 h-3 shrink-0" />
        <span>
          This browser is blocking storage, so this draft will not survive a
          reload. Copy it somewhere safe before you leave the page.
        </span>
      </div>
    );
  }

  return null;
}
