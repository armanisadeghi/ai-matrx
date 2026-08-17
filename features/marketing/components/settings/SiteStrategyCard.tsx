"use client";

/**
 * Site strategy interview (WS-11 / M-22) — the frontend entry point for
 * POST /seo/sites/strategy-interview. The user (an editor on the site)
 * describes the business in free text; the Site Strategy Interviewer values the
 * topic tree (seo.site_topic_value) and hands back the open questions it
 * refused to guess at.
 *
 * THE FLOATING LAW: this is a multi-minute paid interview, so it is a DURABLE
 * STREAMED COMMAND — the interviewer's reasoning streams into the floating
 * `LiveRunWindow` through `useSeoCommandRun({live})`, and a reload rejoins it.
 * The spinner it replaced was the whole defect.
 */

import { useState } from "react";
import { Compass, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useSeoCommandRun } from "@/features/marketing/seo/durable-run/useSeoCommandRun";

const STRATEGY_INTERVIEW_PATH = "/seo/sites/strategy-interview";

interface StrategyInterviewResult {
  valuations_written: number;
  unknown_topic_slugs: string[];
  open_questions: string[];
}

/** The server's own milestones, in the user's words. Never invented stages. */
const STRATEGY_STAGES: Record<string, string> = {
  "seo.strategy_started": "Reading your topic tree…",
  "seo.strategy_agent_completed": "Valuing topics for this business…",
  "seo.strategy_applied": "Saving topic values…",
  "seo.strategy_completed": "Strategy interview complete",
};

export function SiteStrategyCard({
  siteId,
  organizationId,
}: {
  siteId: string;
  organizationId: string;
}) {
  const [businessContext, setBusinessContext] = useState("");

  const command = useSeoCommandRun<StrategyInterviewResult>({
    key: `strategy.${siteId}`,
    path: STRATEGY_INTERVIEW_PATH,
    finalKind: "seo.strategy_completed",
    stageLabels: STRATEGY_STAGES,
    scopeOverrides: { organization_id: organizationId },
    live: { label: "Site strategy interview" },
  });
  const submitting = command.running;
  const result = command.result;

  const submit = () => {
    const context = businessContext.trim();
    if (!context) return;
    void command.launch({ site_id: siteId, business_context: context }, siteId);
  };

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex h-10 items-center gap-2 border-b border-border px-3">
        <Compass className="h-4 w-4 text-primary" />
        <h1 className="text-sm font-semibold text-foreground">
          Site strategy interview
        </h1>
      </div>
      <div className="grid gap-3 p-3">
        <p className="text-xs text-muted-foreground">
          Describe this business in your own words — services offered, services
          explicitly avoided, target audience, capacity, brand positioning.
          The Site Strategy Interviewer translates it into strategic values on
          the shared topic tree, which the Page↔Keyword Mapper and priority
          scoring use to decide what this site should (and shouldn&apos;t)
          pursue.
        </p>
        <Textarea
          value={businessContext}
          onChange={(event) => setBusinessContext(event.target.value)}
          minHeight={120}
          maxHeight={280}
          placeholder="e.g. We're a boutique electronics recycler serving Southern California. We handle CRT/TV recycling and enterprise IT asset disposition, but we do NOT do residential appliance pickup — it's not profitable at our scale..."
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            className="h-8 gap-1.5"
            disabled={!businessContext.trim() || submitting}
            onClick={submit}
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Run strategy interview
          </Button>
        </div>
        {command.stage && submitting ? (
          <p className="text-right text-[11px] text-muted-foreground">
            {command.stage}
          </p>
        ) : null}
        {command.error ? (
          <p className="text-[11px] text-destructive">{command.error}</p>
        ) : null}
        {result ? (
          <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium text-foreground">
              {result.valuations_written} topic value
              {result.valuations_written === 1 ? "" : "s"} written
            </p>
            {result.unknown_topic_slugs.length ? (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Unknown topic slugs referenced: {result.unknown_topic_slugs.join(", ")}
              </p>
            ) : null}
            {result.open_questions.length ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Open questions — answer these to sharpen the values further
                </p>
                <ul className="mt-1 grid gap-1">
                  {result.open_questions.map((question) => (
                    <li key={question} className="flex items-start gap-1.5 text-xs">
                      <Badge variant="outline" className="mt-0.5 shrink-0 text-[9px]">
                        ?
                      </Badge>
                      <span className="text-foreground/90">{question}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
