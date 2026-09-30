"use client";

// components/official/drill-explorer/DrillExplainButton.tsx — "EXPLAIN THIS" (lane DRILL-EXPLAIN;
// program DRILL-FINISH decisions 10 and 22).
//
// One control in the explorer's header row. It opens THE Alchemy session (`openAlchemySession`,
// the preparation workspace every Alchemy menu opens) on the question on screen and its answer as
// one typed payload (`explainPayload.ts`). There the person chooses where it goes — a new chat, an
// assistant window, connected tools — picks the agent and model, and writes the question. Nothing
// is sent to a model from here, no agent is chosen here, and the answer travels as attached content,
// never as user_input.
//
// Absent while there is no answer on screen (a control is absent or honest).

import { MessageCircleQuestion } from "lucide-react";

import { openAlchemySession } from "@/components/agent-copy/alchemy-session";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

import { drillExplainPayload, type DrillExplainInput } from "./explainPayload";

export function DrillExplainButton({ input }: { input: DrillExplainInput }) {
  // Built at render only to decide presence; the click builds it again from the same input so the
  // address it carries is the one in the bar at that moment.
  if (!drillExplainPayload(input)) return null;
  const open = () => {
    const built = drillExplainPayload({ ...input, address: typeof window === "undefined" ? input.address : window.location.href });
    if (!built) return;
    const opened = openAlchemySession({
      key: `drill-explain:${crypto.randomUUID()}`,
      label: built.label,
      source: { kind: "json", value: built.value },
      envelope: built.envelope,
      intent: { kind: "prepare", forDestination: true },
    });
    if (!opened) {
      toast.error("Explain this did not open", { description: "Alchemy is not running on this page. Reload the page and try again." });
    }
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="gap-1"
      data-drill-explorer-explain
      title="Open this question and its answer in Alchemy, then choose an agent to ask about it"
      onClick={open}
    >
      <MessageCircleQuestion className="h-3 w-3" /> Explain this
    </Button>
  );
}
