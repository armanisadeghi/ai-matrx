"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { adoptForeignStream } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import { removeRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import { callApi } from "@/lib/api/call-api";
import {
  describeBackendFailure,
  parseCallApiError,
  parsePersistedBackendError,
  parseStreamError,
} from "@/lib/api/errors";
import { isErrorEvent, type TypedStreamEvent } from "@/lib/api/types";
import { useAppDispatch } from "@/lib/redux/hooks";
import { isJsonObject, type JsonObject } from "@/types/json";

import { listAiVisibilityEvidence } from "./data";
import type {
  AiVisibilityAnalyzeBody,
  AiVisibilityEngine,
  AiVisibilityLiveAnswer,
  AiVisibilityProviderResult,
  AiVisibilityResult,
  AiVisibilityRunState,
} from "./types";

const ACTIVE_RUN_STORAGE_KEY = "seo.aiVisibility.activeRun";

interface StoredRun {
  runId: string;
  siteId: string;
  query: string;
}

function storeRun(value: StoredRun | null): void {
  try {
    if (value) {
      sessionStorage.setItem(ACTIVE_RUN_STORAGE_KEY, JSON.stringify(value));
    } else {
      sessionStorage.removeItem(ACTIVE_RUN_STORAGE_KEY);
    }
  } catch {
    // Rejoin is best-effort when browser storage is unavailable.
  }
}

function readRun(): StoredRun | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_RUN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredRun;
    return parsed.runId && parsed.siteId && parsed.query ? parsed : null;
  } catch {
    return null;
  }
}

function streamData(event: TypedStreamEvent): JsonObject | null {
  if (event.event !== "data") return null;
  const data: unknown = event.data;
  return isJsonObject(data) ? data : null;
}

function engineValue(value: unknown): AiVisibilityEngine | null {
  return value === "chat_gpt" ||
    value === "claude" ||
    value === "gemini" ||
    value === "perplexity"
    ? value
    : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

/**
 * Narrow one streamed provider entry onto the generated contract. Returns null
 * when the payload cannot be a provider result, so a malformed run is reported
 * rather than half-accepted.
 */
function readProviderResult(value: unknown): AiVisibilityProviderResult | null {
  if (!isJsonObject(value)) return null;
  const engine = stringValue(value.engine);
  const status = value.status;
  if (!engine || (status !== "completed" && status !== "failed")) return null;
  return {
    engine,
    status,
    model_name: stringValue(value.model_name) ?? null,
    response_id: stringValue(value.response_id) ?? null,
    provider_run_id: stringValue(value.provider_run_id) ?? null,
    answer_text: stringValue(value.answer_text) ?? "",
    target_mentioned: booleanValue(value.target_mentioned),
    target_cited: booleanValue(value.target_cited),
    citation_count: numberValue(value.citation_count),
    analysis: isJsonObject(value.analysis) ? value.analysis : undefined,
    error: stringValue(value.error) ?? null,
  };
}

/**
 * Narrow the streamed/persisted analysis payload onto the generated
 * `AiVisibilityResult`. Built field by field so the compiler checks this
 * against the OpenAPI contract — no assertion, and a payload that cannot be a
 * result is rejected instead of silently typed.
 */
function readAiVisibilityResult(value: unknown): AiVisibilityResult | null {
  if (!isJsonObject(value)) return null;
  const siteId = stringValue(value.site_id);
  const query = stringValue(value.query);
  const resultKind = stringValue(value.result_kind);
  if (!siteId || !query) return null;
  if (resultKind && resultKind !== "ai_visibility.analyze") return null;
  const providers = Array.isArray(value.providers)
    ? value.providers
        .map(readProviderResult)
        .filter((provider): provider is AiVisibilityProviderResult =>
          Boolean(provider),
        )
    : undefined;
  const engines = Array.isArray(value.engines)
    ? value.engines.filter((engine): engine is string =>
        typeof engine === "string",
      )
    : undefined;
  return {
    result_kind: "ai_visibility.analyze",
    site_id: siteId,
    query,
    engines,
    providers,
    summary: isJsonObject(value.summary) ? value.summary : undefined,
  };
}

const MALFORMED_RESULT =
  "The analysis finished but returned a result this app could not read. Retry the query; if it repeats, report the stream defect.";

const STAGES: Record<string, string> = {
  "seo.ai_visibility_started": "Starting the comparison",
  "seo.ai_visibility_provider_started": "Querying an AI provider",
  "seo.ai_visibility_provider_progress": "Provider response in progress",
  "seo.ai_visibility_answer_received": "Answer received — inspecting citations",
  "seo.ai_visibility_source_started": "Capturing a cited page",
  "seo.ai_visibility_source_completed": "Cited page captured",
  "seo.ai_visibility_source_failed": "A cited page could not be captured",
  "seo.ai_visibility_target_completed": "Your site evidence captured",
  "seo.ai_visibility_analysis_started": "Specialist is tracing the decision",
  "seo.ai_visibility_analysis_completed": "Decision signals identified",
  "seo.ai_visibility_analysis_failed": "One specialist analysis failed",
  "seo.ai_visibility_synthesis_completed": "Cross-provider verdict ready",
  "seo.ai_visibility_completed": "Analysis complete",
};

export function useAiVisibility(siteId: string, organizationId: string) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const evidenceKey = ["marketing", "ai-visibility", siteId] as const;
  const evidence = useQuery({
    queryKey: evidenceKey,
    queryFn: ({ signal }) => listAiVisibilityEvidence(siteId, signal),
    enabled: Boolean(siteId),
  });
  const [run, setRun] = useState<AiVisibilityRunState>({
    status: "idle",
    answers: {},
  });
  const adoptedRequestId = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (adoptedRequestId.current) {
        dispatch(removeRequest(adoptedRequestId.current));
        adoptedRequestId.current = null;
      }
    },
    [dispatch],
  );

  const consume = async (
    query: string,
    request:
      | { kind: "new"; body: AiVisibilityAnalyzeBody }
      | { kind: "rejoin"; runId: string },
  ) => {
    let finalResult: AiVisibilityResult | null = null;
    let streamFailure: string | null = null;
    let serverBusy = false;
    if (adoptedRequestId.current) {
      dispatch(removeRequest(adoptedRequestId.current));
      adoptedRequestId.current = null;
    }
    const streamAbort = new AbortController();
    const consumeStream = dispatch(
      adoptForeignStream({
        abortController: streamAbort,
        onAdopted: ({ requestId }) => {
          adoptedRequestId.current = requestId;
          setRun((current) => ({ ...current, requestId }));
        },
        onEvent: (event) => {
          if (event.event === "chunk" || event.event === "render_block") {
            setRun((current) =>
              current.hasStreamedContent
                ? current
                : { ...current, hasStreamedContent: true },
            );
            return;
          }
          if (isErrorEvent(event)) {
            const explanation = describeBackendFailure(
              parseStreamError(event.data),
            );
            streamFailure = explanation.headline;
            setRun((current) => ({
              ...current,
              status: "error",
              stage: "Analysis stopped",
              error: explanation.headline,
            }));
            return;
          }
          const data = streamData(event);
          const kind = stringValue(data?.kind);
          if (!data || !kind) return;
          const commandRunId = stringValue(data.run_id);
          if (kind === "seo.command_run" && commandRunId) {
            storeRun({ runId: commandRunId, siteId, query });
            setRun((current) => ({ ...current, runId: commandRunId }));
          }
          if (kind === "seo.run_in_progress") {
            serverBusy = true;
          }
          if (kind === "seo.run_snapshot") {
            if (data.status === "completed" && data.result) {
              const recovered = readAiVisibilityResult(data.result);
              if (recovered) {
                finalResult = recovered;
                setRun((current) => ({
                  ...current,
                  status: "done",
                  stage: "Analysis recovered",
                  result: recovered,
                }));
              } else {
                streamFailure = MALFORMED_RESULT;
              }
            } else if (data.status === "failed") {
              const persisted = parsePersistedBackendError(data.error);
              streamFailure = persisted
                ? describeBackendFailure(persisted).headline
                : "The saved analysis run failed.";
            }
          }
          const engine = engineValue(data.engine);
          if (engine && kind === "seo.ai_visibility_answer_received") {
            const answer: AiVisibilityLiveAnswer = {
              engine,
              responseId: stringValue(data.response_id),
              modelName: stringValue(data.model_name) ?? null,
              answerText: stringValue(data.answer_text) ?? "",
              targetMentioned: booleanValue(data.target_mentioned),
              targetCited: booleanValue(data.target_cited),
              citationCount: numberValue(data.citation_count),
            };
            setRun((current) => ({
              ...current,
              answers: { ...current.answers, [engine]: answer },
            }));
          }
          if (engine && kind === "seo.ai_visibility_analysis_completed") {
            setRun((current) => {
              const answer = current.answers[engine];
              return {
                ...current,
                answers: {
                  ...current.answers,
                  [engine]: {
                    engine,
                    answerText: answer?.answerText ?? "",
                    targetMentioned: answer?.targetMentioned ?? false,
                    targetCited: answer?.targetCited ?? false,
                    citationCount: answer?.citationCount ?? 0,
                    ...answer,
                    analysis: isJsonObject(data.analysis) ? data.analysis : {},
                  },
                },
              };
            });
          }
          if (engine && kind.endsWith("_failed")) {
            setRun((current) => ({
              ...current,
              answers: {
                ...current.answers,
                [engine]: {
                  engine,
                  answerText: current.answers[engine]?.answerText ?? "",
                  targetMentioned:
                    current.answers[engine]?.targetMentioned ?? false,
                  targetCited: current.answers[engine]?.targetCited ?? false,
                  citationCount: current.answers[engine]?.citationCount ?? 0,
                  ...current.answers[engine],
                  error:
                    stringValue(data.message) ?? "This provider stage failed.",
                },
              },
            }));
          }
          if (kind === "seo.ai_visibility_completed" && data.result) {
            const completed = readAiVisibilityResult(data.result);
            if (completed) {
              finalResult = completed;
              setRun((current) => ({
                ...current,
                status: "done",
                stage: "Analysis complete",
                result: completed,
              }));
            } else {
              streamFailure = MALFORMED_RESULT;
            }
          } else {
            setRun((current) => ({
              ...current,
              stage: STAGES[kind] ?? current.stage,
            }));
          }
        },
      }),
    );
    const response = await dispatch(
      request.kind === "new"
        ? callApi({
            path: "/seo/sites/{site_id}/ai-visibility/analyze",
            method: "POST",
            pathParams: { site_id: siteId },
            body: request.body,
            scopeOverrides: { organization_id: organizationId },
            stream: true,
            consumeStream,
            signal: streamAbort.signal,
          })
        : callApi({
            path: "/seo/collections/{run_id}/rejoin",
            method: "POST",
            pathParams: { run_id: request.runId },
            stream: true,
            consumeStream,
            signal: streamAbort.signal,
          }),
    );
    if (response.error) {
      storeRun(null);
      const explanation = describeBackendFailure(
        parseCallApiError(response.error),
      );
      setRun((current) => ({
        ...current,
        status: "error",
        stage: "Analysis could not start",
        error: explanation.headline,
      }));
      return;
    }
    if (!finalResult) {
      if (serverBusy) return;
      storeRun(null);
      setRun((current) => ({
        ...current,
        status: "error",
        error:
          streamFailure ??
          "The analysis stream ended without a saved result. Retry this query; if it repeats, report the stream defect.",
      }));
      return;
    }
    storeRun(null);
    await queryClient.invalidateQueries({ queryKey: evidenceKey });
  };

  const analyze = async (body: AiVisibilityAnalyzeBody) => {
    const query = body.query.trim();
    if (!query) return;
    setRun({
      status: "running",
      stage: "Preparing provider calls",
      answers: {},
    });
    await consume(query, { kind: "new", body: { ...body, query } });
  };

  const attemptedRejoin = useRef(false);
  useEffect(() => {
    if (attemptedRejoin.current) return;
    attemptedRejoin.current = true;
    const stored = readRun();
    if (stored?.siteId === siteId) {
      void Promise.resolve().then(() => {
        setRun({
          status: "running",
          stage: "Rejoining the saved analysis",
          runId: stored.runId,
          answers: {},
        });
        return consume(stored.query, {
          kind: "rejoin",
          runId: stored.runId,
        });
      });
    }
  });

  return { evidence, run, analyze };
}
