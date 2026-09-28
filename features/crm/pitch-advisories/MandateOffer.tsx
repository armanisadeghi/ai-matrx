"use client";

// features/crm/pitch-advisories/MandateOffer.tsx
//
// An advisory offer that runs an AI job ("Cut to the 5–8 who match", "Run fact
// check") by its MANDATE KEY — never a hardcoded agent. When the job is not
// built yet, or has no agent assigned in this organization, the click says so
// in words and nothing pretends to run. Never a dead button.

import { useState } from "react";
import { isMandateKey } from "@ai-matrx/agents/mandates";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveMandate } from "@/features/mandates/service";
import { useOpenMandateWindow } from "@/features/overlays/openers/mandateWindow";
import type { AdvisoryOffer } from "./service";

export function MandateOffer({
  offer,
  surfaceName,
}: {
  offer: AdvisoryOffer;
  surfaceName?: string;
}) {
  const openMandateWindow = useOpenMandateWindow();
  const [state, setState] = useState<"idle" | "checking" | "unavailable">("idle");
  const [note, setNote] = useState<string | null>(null);
  const key = offer.mandate_key ?? "";

  async function run() {
    if (!isMandateKey(key)) {
      setState("unavailable");
      setNote(
        `“${offer.label}” needs a helper that isn't built yet. Nothing ran, and your pitch is unaffected.`,
      );
      return;
    }
    setState("checking");
    try {
      const resolved = await resolveMandate(key, { optional: true });
      if (!resolved) {
        setState("unavailable");
        setNote(
          `“${offer.label}” has no AI agent assigned in this organization yet. Nothing ran, and your pitch is unaffected.`,
        );
        return;
      }
      setState("idle");
      setNote(null);
      openMandateWindow({ initialMandateKey: key, mandateKeys: [key], surfaceName });
    } catch (failure) {
      setState("unavailable");
      setNote(
        `“${offer.label}” could not start: ${failure instanceof Error ? failure.message : String(failure)}. Your pitch is unaffected.`,
      );
    }
  }

  return (
    <span className="inline-flex min-w-0 flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 w-fit text-xs"
        onClick={() => void run()}
        disabled={state === "checking"}
      >
        {state === "checking" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
        {offer.label}
      </Button>
      {note && <span className="text-[11px] text-muted-foreground">{note}</span>}
    </span>
  );
}
