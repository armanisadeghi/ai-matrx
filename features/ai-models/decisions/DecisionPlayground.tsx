"use client";

import { Loader2, Play, RefreshCw, Scale } from "lucide-react";
import { formatUsd } from "@ai-matrx/kit/format";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { ModelListDropdown } from "@/features/ai-models/components/lab/ModelListDropdown";
import { useModels } from "@/features/ai-models/hooks/useModels";
import {
  firstDecisionModelId,
  resolvePreferredDecisionModel,
} from "@/features/ai-models/preferredDecisionModel";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useAppDispatch } from "@/lib/redux/hooks";
import { DecisionQuestionEditor } from "./DecisionQuestionEditor";
import {
  decisionQuestionPayload,
  newQuestion,
  parseDecisionValue,
  questionErrors,
  type DecisionQuestion,
} from "./decision-form";
import { loadDecision, runDecision } from "./decision-api";
import type { DecisionResultView } from "./decision-result";

export function DecisionPlayground() {
  const dispatch = useAppDispatch();
  const { organizationState, retry } = useOrganizationRequired();
  const params = useSearchParams();
  const [model, setModel] = useState<string | null>(null);
  const [offeringId, setOfferingId] = useState<string | undefined>();
  const [stateMode, setStateMode] = useState<"text" | "json">("text");
  const [state, setState] = useState("");
  const [questions, setQuestions] = useState<DecisionQuestion[]>([
    newQuestion(),
  ]);
  const [result, setResult] = useState<DecisionResultView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const executionId = params.get("execution_id");
  // The model that loads when nobody picked one: the settings ladder's
  // `agents.model_prefs.decision_default_model` (org → user, nearest wins),
  // else the catalog's first decision model, else nothing — and the ready
  // check says "Choose a decision model" out loud. Never hard-coded.
  const catalog = useModels();
  const [defaultApplied, setDefaultApplied] = useState(false);
  const [defaultUnavailable, setDefaultUnavailable] = useState(false);

  useEffect(() => {
    if (defaultApplied || organizationState !== "ready" || !catalog.isReady) return;
    let active = true;
    void resolvePreferredDecisionModel().then((preferred) => {
      if (!active) return;
      setDefaultApplied(true);
      const fallback = firstDecisionModelId(catalog.models);
      const initial = preferred ?? fallback;
      if (initial) {
        setModel((current) => current ?? initial);
      } else {
        setDefaultUnavailable(true);
      }
    });
    return () => {
      active = false;
    };
  }, [catalog.isReady, catalog.models, defaultApplied, organizationState]);

  useEffect(() => {
    if (!executionId || organizationState !== "ready") return;
    let active = true;
    const recover = async () => {
      setBusy(true);
      setRecovering(true);
      setError(null);
      try {
        const savedResult = await loadDecision(dispatch, executionId);
        if (active) setResult(savedResult);
      } catch (reason) {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "This saved decision could not be loaded.",
          );
      } finally {
        if (active) {
          setBusy(false);
          setRecovering(false);
        }
      }
    };
    void recover();
    return () => {
      active = false;
    };
  }, [dispatch, executionId, organizationState]);

  const parsedState = parseDecisionValue(state, stateMode, "State");
  const validationErrors = [
    ...(model
      ? []
      : [
          defaultUnavailable
            ? "Choose a decision model. No default is set and the catalog has no decision model to fall back on."
            : "Choose a decision model.",
        ]),
    ...(parsedState.error ? [parsedState.error] : []),
    ...questionErrors(questions),
  ];

  const run = () => {
    if (
      busy ||
      organizationState !== "ready" ||
      parsedState.value === undefined ||
      validationErrors.length > 0 ||
      !model
    )
      return;
    setBusy(true);
    setError(null);
    const payloadQuestions: Record<string, Record<string, unknown>> = {};
    for (const question of questions) {
      const payload = decisionQuestionPayload(question);
      if (!payload) {
        setBusy(false);
        setError("Fix the question details before running this decision.");
        return;
      }
      payloadQuestions[question.name.trim()] = payload;
    }
    void runDecision(dispatch, {
      model,
      offeringId,
      state: parsedState.value,
      questions: payloadQuestions,
    })
      .then(setResult)
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error
            ? reason.message
            : "The decision did not complete.",
        );
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300">
          <Scale className="size-5" />
          <h1 className="text-lg font-semibold text-foreground">
            Decision playground
          </h1>
        </div>
        {result && (
          <a
            className="text-sm font-medium text-primary hover:underline"
            href={`?execution_id=${encodeURIComponent(result.executionId)}`}
          >
            Share this result
          </a>
        )}
      </header>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
        <main className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <label className="mb-2 block text-sm font-medium">
              Decision model
            </label>
            <ModelListDropdown
              value={model}
              onValueChange={(modelId) => {
                setModel(modelId);
                setOfferingId(undefined);
              }}
              inputModalities={["text"]}
              outputModalities={["decision"]}
              selectionPurpose="decision"
              pinnedOfferingId={offeringId}
              onOfferingPinChange={setOfferingId}
              placeholder="Choose a decision model"
              aria-label="Decision model"
            />
          </section>
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="text-sm font-medium">State</label>
              <ModeSwitch value={stateMode} onChange={setStateMode} />
            </div>
            <ProTextarea
              value={state}
              onChange={(event) => setState(event.target.value)}
              placeholder={
                stateMode === "text"
                  ? "Describe the situation to evaluate"
                  : '{\n  "customer": "…"\n}'
              }
              aria-label="Decision state"
              autoGrow
              minHeight={160}
              maxHeight={360}
              className="font-mono text-sm"
            />
          </section>
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium">Questions</h2>
                <p className="text-xs text-muted-foreground">
                  Name each answer so a workflow can use it directly.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setQuestions([...questions, newQuestion()])}
              >
                Add question
              </Button>
            </div>
            <DecisionQuestionEditor
              questions={questions}
              onChange={setQuestions}
            />
          </section>
          {validationErrors.length > 0 && (
            <section className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-950 dark:text-amber-100">
              <p className="font-medium">Ready check</p>
              <ul className="mt-1 list-disc pl-5">
                {validationErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </section>
          )}
          {error && (
            <section className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </section>
          )}
          <Button
            type="button"
            size="lg"
            onClick={run}
            disabled={
              busy ||
              organizationState !== "ready" ||
              validationErrors.length > 0
            }
            className="w-full sm:w-auto"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            {busy ? "Running decision…" : "Run decision"}
          </Button>
        </main>
        <aside className="min-w-0">
          <OrganizationContextNotice
            state={organizationState}
            what="Decisions"
            onRetry={retry}
            compact
          />
          <DecisionResultCard result={result} loading={recovering} />
        </aside>
      </div>
    </div>
  );
}

function ModeSwitch({
  value,
  onChange,
}: {
  value: "text" | "json";
  onChange: (value: "text" | "json") => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-muted p-0.5 text-xs">
      <button
        type="button"
        onClick={() => onChange("text")}
        className={`rounded px-2 py-1 ${value === "text" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
      >
        Text
      </button>
      <button
        type="button"
        onClick={() => onChange("json")}
        className={`rounded px-2 py-1 ${value === "json" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
      >
        JSON
      </button>
    </div>
  );
}

function DecisionResultCard({
  result,
  loading,
}: {
  result: DecisionResultView | null;
  loading: boolean;
}) {
  if (loading)
    return (
      <section className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline size-4 animate-spin" />
        Reconnecting to the saved decision…
      </section>
    );
  if (!result)
    return (
      <section className="rounded-xl border border-dashed border-border bg-muted/30 p-5 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">No result yet</p>
        <p className="mt-1">
          Run a decision to inspect every named answer, distribution, usage, and
          cost here.
        </p>
      </section>
    );
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {result.source === "live"
            ? "Live decision result"
            : "Recovered decision result"}
        </p>
        <h2 className="mt-1 break-all text-base font-semibold">
          {result.model}
        </h2>
      </div>
      <div className="space-y-2">
        {Object.entries(result.answers).map(([name, answer]) => (
          <AnswerCard key={name} name={name} answer={answer} />
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
        <Fact label="Input tokens" value={String(result.inputTokens)} />
        <Fact label="Output tokens" value={String(result.outputTokens)} />
        <Fact
          label="Cost"
          value={formatUsd(result.costUsd, {
            digits: "adaptive",
            unknown: "Unavailable",
          })}
        />
        <Fact label="Route" value={result.route ?? "Unavailable"} />
        <Fact label="Execution ID" value={result.executionId} />
        <Fact label="Request ID" value={result.requestId ?? "Unavailable"} />
        <Fact
          label="Provider request"
          value={result.providerRequestId ?? "Unavailable"}
        />
        <Fact label="Offering" value={result.offeringId ?? "Preferred"} />
      </dl>
      <a
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        href={`?execution_id=${encodeURIComponent(result.executionId)}`}
      >
        <RefreshCw className="size-3.5" />
        Reload this result
      </a>
    </section>
  );
}

function AnswerCard({
  name,
  answer,
}: {
  name: string;
  answer: DecisionResultView["answers"][string];
}) {
  const summary =
    answer.type === "choice"
      ? `Choice: ${answer.choice} · confidence ${(answer.confidence * 100).toFixed(0)}%`
      : answer.type === "score"
        ? `Score: ${answer.score} · confidence ${(answer.confidence * 100).toFixed(0)}%`
        : `Noul degree: ${(answer.noul * 100).toFixed(0)}% true`;
  const detail = answer.type === "noul" ? null : answer.probabilities;
  return (
    <article className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="font-medium">{name}</p>
      <p className="mt-1 text-sm">{summary}</p>
      {detail && (
        <div className="mt-2 space-y-1 text-xs">
          <p className="font-medium text-muted-foreground">
            Probability distribution
          </p>
          {Object.entries(detail).map(([label, probability]) => (
            <div
              key={label}
              className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-2"
            >
              <div className="min-w-0">
                <span className="truncate">{label}</span>
                <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: `${Math.max(0, Math.min(100, probability * 100))}%`,
                    }}
                  />
                </div>
              </div>
              <span className="text-right tabular-nums">
                {(probability * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
      {answer.type === "score" && (
        <div className="mt-2 text-xs">
          <p className="font-medium text-muted-foreground">Score legend</p>
          {Object.entries(answer.legend).map(([score, legend]) => (
            <p key={score}>
              {score}:{" "}
              {typeof legend === "string" ? legend : JSON.stringify(legend)}
            </p>
          ))}
        </div>
      )}
      {answer.type === "noul" && (
        <p className="mt-2 text-xs text-muted-foreground">
          Degree of the true criterion; the false degree is{" "}
          {((1 - answer.noul) * 100).toFixed(0)}%.
        </p>
      )}
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Raw result details</summary>
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap">
          {JSON.stringify(answer, null, 2)}
        </pre>
      </details>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-xs" title={value}>
        {value}
      </dd>
    </div>
  );
}
