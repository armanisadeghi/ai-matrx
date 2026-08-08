"use client";

/**
 * TopicIdeaHelper — the "Need an idea? Get help" affordance under the podcast
 * topic textarea. Thin consumer of the reusable Kind Request primitive: it
 * asks the Topic Idea Generator agent for a batch of ideas, the `topic_ideas`
 * kind component lets the user pick ONE (single-select, dictated via
 * `uiOptions`), and the chosen idea's text drops into the topic field.
 *
 * This surface owns NO agent/streaming/selection logic — that all lives in
 * `KindRequestDialog`. It only declares the agent, the inputs, and what to do
 * with the returned value. Any other field anywhere could adopt the same
 * pattern by swapping the agent + expectedKind.
 */

import { useState } from "react";
import { Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KindRequestDialog } from "@/features/content-ir/react/actions/KindRequestDialog";
import { useAgentSlot } from "@/features/agents/slots/useAgentSlot";
import { SlotAgentPicker } from "@/features/agents/slots/components/SlotAgentPicker";

/** FIRST CLIENT-SIDE SLOT SWAP (2026-08-08): which agent generates topic
 * ideas is DB-managed via the `podcast_client.topic_ideas` slot (declared in
 * aidream `agent_slots/client_slots.py`, repinned from
 * /administration/agents/slots). No hardcoded agent id, no silent fallback —
 * if the slot can't resolve, the affordance disables and says why. */
const TOPIC_IDEAS_SLOT_KEY = "podcast_client.topic_ideas";

function topicFromIdea(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    const hook = typeof o.hook === "string" ? o.hook.trim() : "";
    if (title && hook) return `${title}\n\n${hook}`;
    if (title) return title;
    if (hook) return hook;
  }
  return "";
}

export function TopicIdeaHelper({
  onPick,
  seedConcept,
}: {
  onPick: (topic: string) => void;
  seedConcept?: string;
}) {
  const [open, setOpen] = useState(false);
  const { slot, loading, error } = useAgentSlot(TOPIC_IDEAS_SLOT_KEY);

  return (
    <>
      <div className="mt-1.5 flex items-center justify-end gap-1">
        {/* First consumer of the reusable slot picker: swap which agent
            generates ideas (your agent vs the system default). */}
        <SlotAgentPicker slotKey={TOPIC_IDEAS_SLOT_KEY} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(true)}
          disabled={loading || !slot}
          title={error ?? undefined}
        >
          <Lightbulb className="h-3.5 w-3.5" />
          {error ? "Idea helper unavailable" : "Need an idea? Get help"}
        </Button>
      </div>

      <KindRequestDialog
        open={open}
        onOpenChange={setOpen}
        agentId={slot?.agentId ?? ""}
        title="Get topic ideas"
        description="Describe a concept or area of interest. We'll suggest a few episode ideas — pick the one you like."
        fields={[
          {
            name: "concept",
            label: "Your concept or area of interest",
            placeholder:
              "e.g. underreported good news about a country's economy",
            control: "textarea",
            defaultValue: seedConcept?.trim() ? seedConcept.trim() : "",
            required: true,
          },
        ]}
        fixedVariables={{ content_format: "podcast", idea_count: "5" }}
        expectedKind="topic_ideas"
        uiOptions={{ selectionMode: "single" }}
        onResolve={(value) => {
          const topic = topicFromIdea(value);
          if (topic) onPick(topic);
        }}
      />
    </>
  );
}
