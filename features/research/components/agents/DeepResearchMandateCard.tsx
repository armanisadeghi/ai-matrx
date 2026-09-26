"use client";

// Deep research on this topic, through the mandate system.
//
// The job is the code-declared mandate `research.topic_deep_research`
// (aidream client_mandates.py): its provision is exactly the three values this
// card sends — the topic, its included sources, and the person's question —
// and its Holder (a system agent on Google Deep Research by default) is chosen
// by the mandate ladder, never here. The run opens in the platform's flexible
// agent panel, the canonical viewer for a streamed, cited report.
//
// The old direct card (GoogleBackgroundAgentCard, and its Antigravity sandbox
// option) was removed 2026-09-26 (Arman approved; common-docs UI-REGISTER,
// BYPASS-CENSUS row 34).

import { useEffect, useState } from "react";
import { Loader2, Play, Telescope } from "lucide-react";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { IntelligenceIndicator } from "@/features/mandates/feature-intelligence/IntelligenceIndicator";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { getSources } from "../../service";
import type { ResearchTopic } from "../../types";

export const DEEP_RESEARCH_MANDATE = MANDATE_KEYS.research__topic_deep_research;

/** How many included sources travel with the question (most relevant first). */
const MAX_SOURCES = 40;

function topicText(topic: ResearchTopic): string {
  const description = topic.description?.trim();
  return description ? `${topic.name}\n\n${description}` : topic.name;
}

export function DeepResearchMandateCard({ topic }: { topic: ResearchTopic }) {
  const launcher = useAgentLauncher();
  const [question, setQuestion] = useState("");
  const [sources, setSources] = useState<string[] | null>(null);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSources(topic.id, { is_included: true, limit: MAX_SOURCES })
      .then((rows) => {
        if (cancelled) return;
        setSources(
          rows.map((row) =>
            row.title?.trim() ? `${row.title.trim()} — ${row.url}` : row.url,
          ),
        );
        setSourcesError(null);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setSources(null);
        setSourcesError(
          reason instanceof Error ? reason.message : String(reason),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [topic.id]);

  const run = async () => {
    const asked = question.trim();
    if (!asked) {
      setError("Write the question you want researched first.");
      return;
    }
    if (sources === null && !sourcesError) return;
    setLaunching(true);
    setError(null);
    try {
      await launcher.launchMandate(DEEP_RESEARCH_MANDATE, {
        surfaceKey: `research-deep-research:${topic.id}`,
        sourceFeature: "research",
        organizationId: topic.organization_id,
        config: {
          displayMode: "flexible-panel",
          autoRun: true,
          allowChat: true,
          showPreExecutionGate: false,
        },
        runtime: {
          variables: {
            topic: topicText(topic),
            sources: (sources ?? []).join("\n"),
            question: asked,
          },
        },
      });
      toast.success("Deep research started", {
        description:
          "It reads the web for several minutes; the report streams into the panel.",
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLaunching(false);
    }
  };

  const sourceNote = sourcesError
    ? "Sources could not be read, so the research starts from the web alone."
    : sources === null
      ? "Reading this topic's included sources…"
      : sources.length === 0
        ? "This topic has no included sources yet; the research starts from the web."
        : `Starts from this topic's ${sources.length} included source${sources.length === 1 ? "" : "s"} and reads beyond them.`;

  return (
    <section className="mb-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Telescope className="h-4 w-4 text-primary" /> Deep research
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Ask one question about this topic. A research agent reads the web
            for several minutes and returns a report where every claim links to
            its source.
          </p>
        </div>
        <IntelligenceIndicator
          feature="research"
          mandateKeys={[DEEP_RESEARCH_MANDATE]}
          context={{ topicId: topic.id }}
        />
      </div>

      <label className="block space-y-1 text-xs font-medium">
        Question
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={3}
          placeholder="One specific question: the figure, condition, or time period you care about"
          className="w-full resize-y rounded-md border border-input bg-background p-2.5 text-base sm:text-sm"
        />
      </label>
      <p className="mt-2 text-[11.5px] text-muted-foreground">{sourceNote}</p>

      <div className="mt-3">
        <Button
          type="button"
          size="sm"
          disabled={launching || (sources === null && !sourcesError)}
          onClick={() => void run()}
        >
          {launching ? <Loader2 className="animate-spin" /> : <Play />}
          Research this question
        </Button>
      </div>

      {error ? (
        <p className="mt-3 text-xs text-destructive">
          {error} <ErrorAlchemyMenu error={error} />
        </p>
      ) : null}
    </section>
  );
}
