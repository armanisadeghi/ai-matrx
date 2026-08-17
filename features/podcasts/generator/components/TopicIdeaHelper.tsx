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

/** Bank the whole generated batch on the show (D151). Never throws at the UI. */
const bankTopicIdeas = (showId: string, value: unknown): Promise<void> =>
  podcastService.bankTopicIdeas(showId, value);

/** FIRST CLIENT-SIDE MANDATE SWAP (2026-08-08): which agent generates topic
 * ideas is DB-managed via the `podcast_client.topic_ideas` mandate (declared in
 * aidream `agent_slots/client_slots.py`, rebound from
 * /administration/agents/mandates). No hardcoded agent id, no silent fallback —
 * if the mandate can't resolve, the affordance disables and says why. */
const TOPIC_IDEAS_MANDATE_KEY = "podcast_client.topic_ideas";

/** Fields we never echo into the topic box — plumbing, not the idea. */
const IDEA_META_FIELDS = new Set(["__kind", "id", "index", "selected"]);

/** Turn a field name into a human label ("why_now" → "Why now"). */
function labelFor(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Flatten a chosen idea into the topic field.
 *
 * 🚨 FOUND_DEFECTS D151 — this used to keep `title` and `hook` and silently
 * drop EVERY other field the generator wrote (angle, audience, why-now, the
 * suggested segments…). The user picked an idea and got a third of it. Now the
 * whole idea comes across: title and hook lead, and every other field the agent
 * emitted follows as a labeled line.
 */
function topicFromIdea(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const o = value as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title.trim() : "";
  const hook = typeof o.hook === "string" ? o.hook.trim() : "";

  const rest: string[] = [];
  for (const [key, raw] of Object.entries(o)) {
    if (key === "title" || key === "hook" || IDEA_META_FIELDS.has(key)) continue;
    const text =
      typeof raw === "string"
        ? raw.trim()
        : Array.isArray(raw)
          ? raw.filter((x) => typeof x === "string").join("; ")
          : typeof raw === "number" || typeof raw === "boolean"
            ? String(raw)
            : "";
    if (text) rest.push(`${labelFor(key)}: ${text}`);
  }

  return [title, hook, rest.join("\n")].filter(Boolean).join("\n\n");
}

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

      <KindRequestDialog
        open={open}
        onOpenChange={setOpen}
        agentId={mandate?.agentId ?? ""}
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
