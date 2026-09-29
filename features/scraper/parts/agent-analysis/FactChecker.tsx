"use client";

/**
 * Fact Checker tab of a full-scrape result.
 *
 * 🚨 THE ONE PIPELINE. The run goes through the canonical execution system
 * (`useLiveAgentRun` → `launchAgentExecution({ mandateKey })`) and every live
 * byte is rendered by `<LiveRunDisplay>` → `MarkdownStream` → the kind
 * registry. This tab hand-renders NOTHING of the stream: it previously
 * accumulated chunks into a string and fed them to `MarkdownRenderer`, which
 * bypassed the kind registry (structured answers arrived as raw JSON code
 * blocks) and let the model's chain-of-thought leak into the panel as literal
 * `<reasoning>` tags. See CLAUDE.md § "Streaming/AI surfaces".
 *
 * The sub-tabs (Summary, Claims, Warning) are a POST-PROCESSING product
 * feature over the SETTLED answer text — never over the live stream. The
 * agent answers in three sections plus one `fact_check_report` kind block
 * (contract: `fact-check-parsing-util.ts`). The Claims tab renders that kind
 * through the canonical pipeline (`MarkdownStream` → kind registry → its
 * registered component) — never a bespoke table (THE CANONICAL COMPONENT
 * LAW). While the run is in flight every tab shows the live output instead of
 * a spinner (THE FLOATING LAW: a spinner is never the answer while AI works).
 *
 * The mandate wiring is unchanged: the tab gates on `useMandate` and never
 * names an agent id.
 */

import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, ClipboardList, FileText, ShieldAlert } from "lucide-react";
import {
  FACT_CHECK_STATUSES,
  STATUS_LABEL,
  VERDICT_LABEL,
  parseFactCheck,
  reportAsKindBlock,
  type FactCheckVerdict,
} from "./fact-check-parsing-util";
import { PageTemplate, Card } from "@/components/official/PageTemplate";
import MarkdownStream from "@/components/MarkdownStream";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectFirstExtractedObject } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";
import { useLiveAgentRun } from "@/features/agents/hooks/useLiveAgentRun";
import {
  SCRAPER_ANALYSIS_MANDATES,
} from "@/features/scraper/constants/analysis-agents";
import { useMandate } from "@/features/mandates/useMandate";
import { AnalysisMandateGate } from "./AnalysisMandateGate";
import {
  factCheckVariables,
  type PageAnalysisFacts,
} from "./page-analysis-offer-values";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface FactCheckerPageProps {
  value: string;
  overview?: {
    page_title?: string;
    char_count?: number;
    url?: string;
    website?: string;
  };
  /** The scrape's real facts by the provision's declared names (mapped-only
   *  offers — payload-neutral on the mandate door). */
  offerValues?: PageAnalysisFacts;
}

const MANDATE_KEY = SCRAPER_ANALYSIS_MANDATES.factChecker;

const SURFACE_KEY = "scraper:fact-check";

const VERDICT_BADGE: Record<FactCheckVerdict, NonNullable<BadgeProps["variant"]>> = {
  safe: "success",
  risky: "warning",
  blocked_by_claims: "destructive",
};

const FactCheckerPage: React.FC<FactCheckerPageProps> = ({
  value,
  overview = {},
  offerValues,
}) => {
  const {
    run,
    isRunning,
    error,
    conversationId,
    activeRequestId,
    hasLiveRun,
  } = useLiveAgentRun();
  /** The settled answer text — the ONLY thing this tab parses. */
  const [answerText, setAnswerText] = useState<string>("");
  // Gate: the tab runs only once its mandate resolves; unresolved renders the
  // unbound state (picker + door), never a hardcoded agent.
  const {
    mandate,
    loading: mandateLoading,
    error: mandateError,
  } = useMandate(MANDATE_KEY);
  const mandateReady = Boolean(mandate);

  const pageTitle = overview?.page_title || "Content";
  const characterCount = overview?.char_count
    ? overview.char_count.toLocaleString()
    : "N/A";
  const pageUrl = overview?.url;

  // `run` is a fresh closure every render, so it can never be an effect dep —
  // the auto-run would re-fire forever. The launch effect keys on the mandate
  // + the content only, and reaches the current launcher through this ref.
  const runRef = useRef(run);
  // Same reason: the facts ride along with the content but never re-fire the run.
  const offerValuesRef = useRef(offerValues);
  useEffect(() => {
    runRef.current = run;
    offerValuesRef.current = offerValues;
  });

  useEffect(() => {
    if (!mandateReady || !value || value.trim().length === 0) {
      return undefined;
    }

    // Cancel-on-unmount: aborting HARVESTS whatever the run produced and stops
    // the wait; `useLiveAgentRun` destroys the instance on unmount.
    const controller = new AbortController();
    void runRef.current<string>({
      mandateKey: MANDATE_KEY,
      surfaceKey: SURFACE_KEY,
      sourceFeature: "scraper",
      initiation: "auto",
      expect: "text",
      variables: factCheckVariables(value, offerValuesRef.current),
      signal: controller.signal,
      // Stale text from the previous run must never survive into this one.
      // Cleared here (a callback fired by the run, before the stream) rather
      // than in the effect body, which would cascade a render.
      onConversationCreated: () => setAnswerText(""),
    })
      .then((text) => {
        if (!controller.signal.aborted) setAnswerText(text ?? "");
      })
      .catch((err) => {
        console.error("[FactChecker] Agent run failed:", err);
      });

    return () => {
      controller.abort();
    };
  }, [mandateReady, value]);

  // 🚨 THE ARTIFACT FIRST (ruling 2026-09-29): the report's fields come from
  // the platform's extracted object for this run — never from re-parsing a
  // string. The resolved `answerText` supplies only the three prose sections
  // (its fenced block was already lifted out into a structured block).
  const artifact = useAppSelector((state) =>
    activeRequestId && answerText
      ? (selectFirstExtractedObject(activeRequestId)(state)?.value ?? null)
      : null,
  );
  // React Compiler memoizes this; a settled answer is parsed once per text.
  const parsed = answerText ? parseFactCheck(answerText, artifact) : null;

  /** The live output — what every tab shows while the agent is still writing. */
  const liveOutput = (label: string) => (
    <LiveRunDisplay
      conversationId={conversationId}
      label={label}
      pending={isRunning}
      bodyClassName="max-h-[70dvh] overflow-y-auto px-3 py-3 text-sm"
    />
  );

  /**
   * Shared posture for every tab: unbound mandate → gate; resolving → a plain
   * line; run failed with nothing to show → error; still writing → the live
   * stream. Returns null once there is settled text to section up.
   */
  const preSection = (label: string) => {
    if (mandateError) {
      return (
        <AnalysisMandateGate
          mandateKey={MANDATE_KEY}
          title="Fact Checker"
          error={mandateError}
        />
      );
    }
    if (mandateLoading) {
      return (
        <Card title={label}>
          <p className="text-sm text-muted-foreground">
            Resolving the agent assigned to this tab…
          </p>
        </Card>
      );
    }
    if (error && !hasLiveRun) {
      return (
        <Card title="Error">
          <div className="text-destructive p-4">Error: {error} <ErrorAlchemyMenu error={error} /></div>
        </Card>
      );
    }
    if (!answerText) return liveOutput(label);
    return null;
  };

  /** Settled markdown through THE ONE PIPELINE (kind blocks route to their component). */
  const markdown = (content: string) => (
    <MarkdownStream imagePolicy="ai" content={content} isStreamActive={false} />
  );

  const empty = (message: string) => (
    <p className="text-muted-foreground text-center py-8 text-sm">{message}</p>
  );

  const renderSummary = () => {
    const pre = preSection("Generating verdict");
    if (pre) return pre;

    return (
      <Card title="Fact-check verdict">
        <div className="space-y-4 p-4">
          {parsed?.verdict ? (
            <Badge variant={VERDICT_BADGE[parsed.verdict]} className="text-sm">
              {VERDICT_LABEL[parsed.verdict]}
            </Badge>
          ) : null}
          {parsed?.summary
            ? markdown(parsed.summary)
            : empty(
                "This answer has no \"Fact-check verdict\" section. The Full Report tab shows everything the agent wrote.",
              )}
        </div>
      </Card>
    );
  };

  const renderClaims = () => {
    const pre = preSection("Checking claims");
    if (pre) return pre;

    if (parsed?.report) {
      return (
        <Card title="Claims">
          <div data-fact-check-report-source={parsed.reportSource} className="space-y-4">
            {parsed.reportSource === "answer_text" ? (
              <div className="flex items-start gap-2 rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  The platform did not hand back this run&rsquo;s structured
                  claims report, so it was read from the JSON the agent wrote
                  into its answer text instead.
                </span>
              </div>
            ) : null}
            {markdown(reportAsKindBlock(parsed.report))}
          </div>
        </Card>
      );
    }

    return (
      <Card title="Claims">
        <div className="space-y-4 p-4">
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              The agent did not include its structured claims report in this
              answer, so the per-claim table cannot be drawn. Showing the
              written &ldquo;Facts &amp; Citations&rdquo; section instead.
            </span>
          </div>
          {parsed?.factsAndCitations
            ? markdown(parsed.factsAndCitations)
            : empty(
                "This answer has no \"Facts & Citations\" section either. The Full Report tab shows everything the agent wrote.",
              )}
        </div>
      </Card>
    );
  };

  const renderWarning = () => {
    const pre = preSection("Writing warning");
    if (pre) return pre;

    const warning = parsed?.warning || parsed?.report?.warning || "";
    return (
      <Card title="Warning">
        <div className="p-4">
          {warning
            ? markdown(warning)
            : empty("The agent raised no warning for this page.")}
        </div>
      </Card>
    );
  };

  /**
   * Full Report is the run itself — always the canonical display, before and
   * after settling (the pipeline keeps rendering the finished message).
   */
  const renderFullReport = () => {
    if (mandateError) {
      return (
        <AnalysisMandateGate
          mandateKey={MANDATE_KEY}
          title="Fact Checker"
          error={mandateError}
        />
      );
    }
    if (error && !hasLiveRun) {
      return (
        <Card title="Error">
          <div className="text-destructive p-4">Error: {error} <ErrorAlchemyMenu error={error} /></div>
        </Card>
      );
    }
    return liveOutput("Fact check");
  };

  const counts = parsed?.statusCounts;
  const statsItems = [
    { label: "Content Source", value: overview?.website || "Unknown" },
    { label: "Character Count", value: characterCount || "N/A" },
    {
      label: "Verdict",
      value: parsed?.verdict
        ? VERDICT_LABEL[parsed.verdict]
        : answerText
          ? "Not stated"
          : "Checking…",
    },
    ...(counts
      ? FACT_CHECK_STATUSES.map((status) => ({
          label: STATUS_LABEL[status],
          value: counts[status],
        }))
      : []),
  ];

  const tabs = [
    { id: "summary", label: "Summary", icon: ShieldAlert, content: renderSummary() },
    { id: "claims", label: "Claims", icon: ClipboardList, content: renderClaims() },
    { id: "warning", label: "Warning", icon: AlertTriangle, content: renderWarning() },
    {
      id: "full-report",
      label: "Full Report",
      icon: FileText,
      content: renderFullReport(),
    },
  ];

  return (
    <PageTemplate
      title="Fact Checker"
      subtitle={pageTitle}
      url={pageUrl}
      statsItems={statsItems}
      tabs={tabs}
      defaultActiveTab="summary"
      heroSize="xs"
    />
  );
};

export default FactCheckerPage;
