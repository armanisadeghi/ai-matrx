"use client";

// features/masterwork/components/detail/SuggestedWording.tsx
//
// 🚨 A REWRITE OF HER WORDS IS A SUGGESTION, NEVER A SILENT OVERWRITE
// (cold walk 22, friction). The Rulebook's Guide line was replaced after the
// interview's first turn — "An assistant that decides, the way I do …"
// became "How this shop decides, on-site, …" — and the page printed the
// rewrite as though she had written it. The live text stays on screen (it is
// what the Rulebook currently says), and this one line under it says plainly
// that the wording is not hers, shows hers, and lets her choose. Either
// choice is saved: "Use it" records the suggestion as her wording, "Keep
// mine" puts hers back.

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SuggestedWording({
  hers,
  onUse,
  onKeepMine,
}: {
  /** The wording she wrote or last chose. */
  hers: string;
  onUse: () => Promise<void>;
  onKeepMine: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<"use" | "keep" | null>(null);
  const run = async (which: "use" | "keep", act: () => Promise<void>) => {
    setBusy(which);
    try {
      await act();
    } finally {
      setBusy(null);
    }
  };
  return (
    <div
      className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
      data-suggested-wording=""
    >
      <span className="min-w-0" title={`Your wording: “${hers}”`}>
        Suggested wording from the interview — you wrote{" "}
        <span className="text-foreground">“{hers}”</span>
      </span>
      <span className="flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs"
          disabled={busy !== null}
          onClick={() => void run("use", onUse)}
        >
          {busy === "use" ? "Saving…" : "Use it"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          disabled={busy !== null}
          onClick={() => void run("keep", onKeepMine)}
        >
          {busy === "keep" ? "Saving…" : "Keep mine"}
        </Button>
      </span>
    </div>
  );
}
