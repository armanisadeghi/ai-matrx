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
import { isJsonObject, type JsonObject } from "@/types/json";

import {
  AiVisibilityReport,
  parsePublicVisibilityResult,
  type PublicVisibilityResult,
} from "../ai-visibility/AiVisibilityReport";

const STAGES: Record<string, string> = {
  "seo.ai_visibility_started": "Starting the four-engine comparison",
  "seo.ai_visibility_provider_started": "Sending the buyer question",
  "seo.ai_visibility_provider_waiting":
    "Waiting for the live, web-grounded answer",
  "seo.ai_visibility_answer_received":
    "Answer received — checking brand visibility",
  "seo.ai_visibility_source_started": "Opening a cited source",
  "seo.ai_visibility_source_completed": "Source captured",
  "seo.ai_visibility_analysis_started": "Tracing claims and decision signals",
  "seo.ai_visibility_analysis_completed": "Provider analysis complete",
  "seo.ai_visibility_synthesis_completed":
    "Building the cross-provider verdict",
  "seo.public_ai_visibility_report_published":
    "Publishing the shareable report",
  "seo.ai_visibility_completed": "Report complete",
};

export function AiVisibilityTool() {
  const dispatch = useAppDispatch();
  const openLiveRunWindow = useOpenLiveRunWindow();
  const liveWindow = useRef<LiveRunWindowHandle | null>(null);
  const liveRequestId = useRef<string | null>(null);
  const [brandName, setBrandName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [aliases, setAliases] = useState("");
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicVisibilityResult | null>(null);

  const run = useCallback(async () => {
    if (running || !brandName.trim() || !websiteUrl.trim() || !query.trim())
      return;
    setRunning(true);
    setError(null);
    setResult(null);
    setStage("Preparing the live comparison");
    liveWindow.current = openLiveRunWindow({
      instanceId: "public-ai-visibility",
      label: "Preparing the live AI visibility report",
      pending: true,
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
            setError(
              typeof data["user_message"] === "string"
                ? data["user_message"]
                : typeof data["message"] === "string"
                  ? data["message"]
                  : "The report stopped before it completed.",
            );
            return;
          }
          if (event.event !== "data" || !isJsonObject(event.data)) return;
          const kind =
            typeof event.data.kind === "string" ? event.data.kind : null;
          if (!kind) return;
          const engine =
            typeof event.data.engine === "string"
              ? `${event.data.engine.replaceAll("_", " ")}: `
              : "";
          const nextStage = STAGES[kind];
          if (nextStage) {
            setStage(nextStage);
            liveWindow.current?.update({ label: `${engine}${nextStage}` });
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
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunning(false);
    }
  }, [
    aliases,
    brandName,
    city,
    dispatch,
    openLiveRunWindow,
    query,
    running,
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
          <p className="mt-3 text-xs text-primary">
            {stage}… Results appear as each engine returns.
          </p>
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
