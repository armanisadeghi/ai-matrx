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
import { useMandate } from "@/features/agents/mandates/useMandate";
import { MandateAgentPicker } from "@/features/agents/mandates/components/MandateAgentPicker";
import { podcastService } from "@/features/podcasts/service";
import { topicFromIdea } from "@/features/podcasts/generator/topic-idea";

/** Bank the whole generated batch on the show (D151). Never throws at the UI. */
const bankTopicIdeas = (showId: string, value: unknown): Promise<void> =>
  podcastService.bankTopicIdeas(showId, value);

/** FIRST CLIENT-SIDE MANDATE SWAP (2026-08-08): which agent generates topic
 * ideas is DB-managed via the `podcast_client.topic_ideas` mandate (declared in
 * aidream `mandates/client_mandates.py`, rebound from
 * /administration/agents/mandates). No hardcoded agent id, no silent fallback —
 * if the mandate can't resolve, the affordance disables and says why. */
const TOPIC_IDEAS_MANDATE_KEY = "podcast_client.topic_ideas";

// `topicFromIdea` (the D151 "whole idea comes across" flattener) lives in
// `../topic-idea` — a pure module shared with the parser tests.

export function TopicIdeaHelper({
  onPick,
  seedConcept,
  showId,
}: {
  onPick: (topic: string) => void;
  seedConcept?: string;
  /**
   * The show these ideas are for. With it (D151) the WHOLE generated batch is
   * banked on `pc_shows.metadata.topic_ideas` the instant it lands, so the four
   * ideas the user didn't pick become the show's idea bank instead of being
   * thrown away when the dialog closes. With no show selected there is no
   * durable parent yet, and the batch stays transient.
   */
  showId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const { mandate, loading, error } = useMandate(TOPIC_IDEAS_MANDATE_KEY);

  return (
    <>
      <div className="mt-1.5 flex items-center justify-end gap-1">
        {/* First consumer of the reusable mandate picker: swap which agent
            generates ideas (your agent vs the system default). */}
        <MandateAgentPicker mandateKey={TOPIC_IDEAS_MANDATE_KEY} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(true)}
          disabled={loading || !mandate}
          title={error ?? undefined}
        >
          <Lightbulb className="h-3.5 w-3.5" />
          {error ? "Idea helper unavailable" : "Need an idea? Get help"}
        </Button>
      </div>

      {/* The mandate resolves INSIDE the canonical launcher — passing the key
          (not a pre-resolved agentId) is what keeps the caller's binding
          `config_overrides` and the mandate attribution on the run. The
          `useMandate` call above is ONLY the availability affordance (disable
          + explain when the mandate can't resolve), never the run identity. */}
      <KindRequestDialog
        open={open}
        onOpenChange={setOpen}
        mandateKey={TOPIC_IDEAS_MANDATE_KEY}
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
        {...(showId ? { onBatch: (value: unknown) => bankTopicIdeas(showId, value) } : {})}
        onResolve={(value) => {
          const topic = topicFromIdea(value);
          if (topic) onPick(topic);
        }}
      />
    </>
  );
}
