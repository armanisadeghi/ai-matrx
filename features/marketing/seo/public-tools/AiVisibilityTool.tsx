"use client";

import { useCallback, useRef, useState } from "react";
import { AlertTriangle, PanelRightOpen, Play, ScanSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProTextarea } from "@/components/official/ProTextarea";
import { adoptForeignStream } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import {
  useOpenLiveRunWindow,
  type LiveRunWindowHandle,
} from "@/features/overlays/openers/liveRunWindow";
import { callApi } from "@/lib/api/call-api";
import { useAppDispatch } from "@/lib/redux/hooks";
import type {
  LiveRunProgressItem,
  LiveRunProgressState,
} from "@/features/agents/components/live-run/LiveRunProgress";
import { isJsonObject, type JsonObject } from "@/types/json";

import {
  AiVisibilityReport,
  parsePublicVisibilityResult,
  type PublicVisibilityResult,
} from "../ai-visibility/AiVisibilityReport";

const ENGINES = [
  ["chat_gpt", "ChatGPT"],
  ["claude", "Claude"],
  ["gemini", "Gemini"],
  ["perplexity", "Perplexity"],
] as const;

function initialProgress(): LiveRunProgressState {
  return {
    title: "Checking AI recommendations",
    description:
      "Each engine updates here as its response and analysis complete.",
    items: ENGINES.map(([id, label]) => ({
      id,
      label,
      status: "waiting",
      detail: "Waiting",
    })),
  };
}

export function AiVisibilityTool() {
  const dispatch = useAppDispatch();
  const openLiveRunWindow = useOpenLiveRunWindow();
  const liveWindow = useRef<LiveRunWindowHandle | null>(null);
  const liveRequestId = useRef<string | null>(null);
  const liveProgress = useRef<LiveRunProgressState>(initialProgress());
  const [brandName, setBrandName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [aliases, setAliases] = useState("");
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicVisibilityResult | null>(null);

  const updateEngine = useCallback(
    (engine: string, patch: Partial<LiveRunProgressItem>) => {
      liveProgress.current = {
        ...liveProgress.current,
        items: liveProgress.current.items.map((item) =>
          item.id === engine ? { ...item, ...patch } : item,
        ),
      };
      liveWindow.current?.update({ progress: liveProgress.current });
    },
    [],
  );

  const failProgress = useCallback((message: string) => {
    liveProgress.current = {
      ...liveProgress.current,
      title: "Report could not run",
      description: message,
      items: liveProgress.current.items.map((item) =>
        item.status === "completed" || item.status === "failed"
          ? item
          : { ...item, status: "failed", detail: "Not completed" },
      ),
    };
    liveWindow.current?.update({ progress: liveProgress.current });
  }, []);

  const run = useCallback(async () => {
    if (running || !brandName.trim() || !websiteUrl.trim() || !query.trim())
      return;
    setRunning(true);
    setError(null);
    setResult(null);
    setStage("Starting the comparison");
    liveProgress.current = initialProgress();
    liveWindow.current = openLiveRunWindow({
      instanceId: "public-ai-visibility",
      label: "AI visibility analysis",
      pending: true,
      progress: liveProgress.current,
      height: "70vh",
    });
    const abortController = new AbortController();
    let finalResult: PublicVisibilityResult | null = null;
    const consumeStream = dispatch(
      adoptForeignStream({
        abortController,
        onAdopted: ({ requestId }) => {
          liveRequestId.current = requestId;
          liveWindow.current?.update({ requestId, pending: false });
        },
        onEvent: (event) => {
          if (event.event === "error") {
            const data: JsonObject = isJsonObject(event.data) ? event.data : {};
            const message =
              typeof data["user_message"] === "string"
                ? data["user_message"]
                : typeof data["message"] === "string"
                  ? data["message"]
                  : "The report stopped before it completed.";
            setError(message);
            failProgress(message);
            return;
          }
          if (event.event !== "data" || !isJsonObject(event.data)) return;
          const kind =
            typeof event.data.kind === "string" ? event.data.kind : null;
          if (!kind) return;
          const engine =
            typeof event.data.engine === "string" ? event.data.engine : null;
          if (engine && kind === "seo.ai_visibility_provider_started") {
            updateEngine(engine, {
              status: "running",
              detail: "Requesting response",
            });
          } else if (engine && kind === "seo.ai_visibility_provider_waiting") {
            updateEngine(engine, {
              status: "running",
              detail: "Retrieving the live response",
            });
          } else if (engine && kind === "seo.ai_visibility_answer_received") {
            const citations =
              typeof event.data.citation_count === "number"
                ? event.data.citation_count
                : 0;
            const mentioned = event.data.target_mentioned === true;
            updateEngine(engine, {
              status: "running",
              detail: `Response received · ${citations} citation${citations === 1 ? "" : "s"} · Brand ${mentioned ? "mentioned" : "not mentioned"}`,
              preview:
                typeof event.data.answer_text === "string"
                  ? event.data.answer_text
                  : undefined,
            });
          } else if (engine && kind === "seo.ai_visibility_analysis_started") {
            updateEngine(engine, {
              status: "running",
              detail: "Analyzing recommendations and evidence",
            });
          } else if (
            engine &&
            kind === "seo.ai_visibility_analysis_completed"
          ) {
            const analysis = isJsonObject(event.data.analysis)
              ? event.data.analysis
              : {};
            const claims = Array.isArray(analysis.claims)
              ? analysis.claims.length
              : 0;
            const signals = Array.isArray(analysis.decision_signals)
              ? analysis.decision_signals.length
              : 0;
            updateEngine(engine, {
              status: "completed",
              detail: `Complete · ${claims} claim${claims === 1 ? "" : "s"} · ${signals} decision signal${signals === 1 ? "" : "s"}`,
            });
          } else if (
            engine &&
            (kind === "seo.ai_visibility_provider_failed" ||
              kind === "seo.ai_visibility_analysis_failed")
          ) {
            updateEngine(engine, {
              status: "failed",
              detail:
                typeof event.data.message === "string"
                  ? event.data.message
                  : "This engine did not complete",
            });
          } else if (kind === "seo.ai_visibility_synthesis_completed") {
            setStage("Preparing the report");
          } else if (kind === "seo.public_ai_visibility_report_published") {
            setStage("Report ready");
          }
          if (kind === "seo.ai_visibility_completed") {
            const parsed = parsePublicVisibilityResult(event.data.result);
            if (parsed) {
              finalResult = parsed;
              setResult(parsed);
            }
          }
        },
      }),
    );
    try {
      const response = await dispatch(
        callApi({
          path: "/seo/public/ai-visibility",
          method: "POST",
          body: {
            brand_name: brandName.trim(),
            website_url: websiteUrl.trim(),
            aliases: aliases
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            query: query.trim(),
            country_iso: "US",
            city: city.trim() || null,
            force_refresh: false,
          },
          stream: true,
          consumeStream,
          signal: abortController.signal,
        }),
      );
      if (response.error) throw new Error(response.error.message);
      if (!finalResult)
        throw new Error("The stream ended before the durable report arrived.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      failProgress(message);
    } finally {
      setRunning(false);
    }
  }, [
    aliases,
    brandName,
    city,
    dispatch,
    failProgress,
    openLiveRunWindow,
    query,
    running,
    updateEngine,
    websiteUrl,
  ]);

  return (
    <div className="space-y-8">
      <section className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-violet-500/10 p-5 shadow-lg sm:p-8">
        <div className="mb-6 max-w-3xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <ScanSearch className="h-3.5 w-3.5" /> Free AI visibility report
          </div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-4xl">
            See exactly how AI recommends a brand
          </h2>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Ask the same real buyer question across ChatGPT, Claude, Gemini, and
            Perplexity. We identify mentions, recommendation position,
            citations, claims, and the signals behind each answer.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            value={brandName}
            onChange={(event) => setBrandName(event.target.value)}
            placeholder="Brand name"
            disabled={running}
          />
          <Input
            value={websiteUrl}
            onChange={(event) => setWebsiteUrl(event.target.value)}
            placeholder="Website, e.g. example.com"
            disabled={running}
          />
          <Input
            value={aliases}
            onChange={(event) => setAliases(event.target.value)}
            placeholder="Other names or people (comma separated)"
            disabled={running}
          />
          <Input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="City (optional)"
            disabled={running}
          />
          <div className="sm:col-span-2">
            <ProTextarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Which med spa should I go to in Sherman Oaks, California?"
              minHeight={88}
              maxHeight={180}
              enableCleanup={false}
              enableTextStats={false}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Aliases can include a doctor, founder, old business name, or common
            spelling.
          </p>
          <Button
            size="lg"
            className="gap-2"
            disabled={
              !running &&
              (!brandName.trim() ||
                !websiteUrl.trim() ||
                query.trim().length < 2)
            }
            onClick={() => {
              if (running) {
                liveWindow.current = openLiveRunWindow({
                  instanceId: "public-ai-visibility",
                  label: stage ?? "AI visibility analysis",
                  requestId: liveRequestId.current,
                  pending: !liveRequestId.current,
                  progress: liveProgress.current,
                  height: "70vh",
                });
                return;
              }
              void run();
            }}
          >
            {running ? (
              <PanelRightOpen className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {running ? "View live progress" : "Analyze AI visibility"}
          </Button>
        </div>
        {running && stage ? (
          <p className="mt-3 text-xs text-primary">{stage}</p>
        ) : null}
        {error ? (
          <div className="mt-4 flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}
      </section>

      {result ? (
        <AiVisibilityReport
          result={result}
          shareUrl={result.share_path ?? undefined}
        />
      ) : null}
    </div>
  );
}
