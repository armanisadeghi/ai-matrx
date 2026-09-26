"use client";

// features/mandates/record-next/MandateTryPanel.tsx
//
// THE TEST TAB AT YOUR OWN LEVEL — the level-aware copy of the admin bench's
// "Try it now" (`features/mandates/admin/TryItNowPanel.tsx`, untouched).
//
// Owner model (common-docs/systems/intelligence/mandates/MANDATE-SYSTEM.md §2): binding a
// mandate includes testing "the current configuration or a new one" — at every
// level, not only for Matrx admins. So a person (or an organization's manager)
// runs the job here with:
//   · what runs for them now (their resolution: user → org → system), or
//   · a candidate agent or workflow they can see — before binding it.
//
// What is the SAME as the admin panel: the served input surface
// (`useMandateInputSurface`), the same input controls, the refusal card that
// keeps the server's sentence on screen, the same result shape
// (`MandateTestResult`). What DIFFERS, by design:
//   · the door is `POST /mandates/{key}/try` — the run is ALWAYS as the caller
//     (the request has no user field) and charged to them; nothing is saved
//     onto the mandate's test cases (that is the admin bench's job);
//   · the answer renders through the platform's real output renderers — the
//     output kind's own component, the structured-value floor, markdown for
//     text, inline media for a file — never a JSON dump.

import { StructuredValueView } from "@/components/official/structured-value/StructuredValueView";
import { useState } from "react";
import Link from "next/link";
import { ExternalLink, FlaskConical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HolderAssignment } from "@/features/bindings/HolderAssignment";
import type { HolderDraft } from "@/features/bindings/ScopeHolderBar";
import { VariableInputComponent } from "@/features/agents/components/inputs/input-components/VariableInputComponent";
import type { VariableCustomComponent } from "@/features/agents/types/agent-definition.types";
import { ProTextarea } from "@/components/official/ProTextarea";
import { ProJsonTextarea } from "@/components/official/ProJsonTextarea";
import { PropertyRow, CONFIGURATION_CHOICE_SIZE } from "@/components/official/ConfigurationFields";
import { ServerNotes } from "@/components/official/ServerNotes";
import { useAppDispatch } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { isJsonObject, type JsonObject, type JsonValue } from "@/types/json";
import { displayLabelForKey } from "@/features/agents/utils/variable-utils";
import { formatDurationMs } from "@ai-matrx/kit/format";
import { useMandateInputSurface } from "@/features/mandates/input-surface";
import {
  MEDIA_VALUE_KINDS,
  SCALAR_VALUE_KINDS,
} from "@/features/mandates/provision-shapes";
import type { ServedInput } from "@/features/workflow-runtime/served-form/served-input";
import { RunFailureCard } from "@/features/mandates/RunFailureCard";
import {
  describeMandateRunFailure,
  readMandateRunHolder,
  type MandateRunFailure,
  type MandateTestResponse,
} from "@/features/mandates/test-run";
import { runMandateTry, type MandateTryCandidate } from "./owner-service";
import { AnswerValueView } from "@/components/official/structured-value/AnswerValueView";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

type CandidateMode = "current" | "candidate";

const MODE_WORDS: Record<CandidateMode, string> = {
  current: "What runs for you now",
  candidate: "An agent or workflow you pick",
};

const EMPTY_CANDIDATE: HolderDraft = {
  kind: "agent",
  agentId: null,
  agentVersionId: null,
  useLatest: true,
  workflowId: null,
  workflowVersionId: null,
};

function isBlank(value: unknown): boolean {
  return (
    value == null ||
    (typeof value === "string" && !value.trim()) ||
    (Array.isArray(value) && !value.length) ||
    (isJsonObject(value) && !Object.keys(value).length)
  );
}

function componentForKind(kind: string): VariableCustomComponent | undefined {
  if (kind === "number" || kind === "integer") return { type: "number" };
  if (kind === "boolean") return { type: "toggle" };
  if (kind === "markdown") return { type: "markdown" };
  if (kind === "file" || kind === "file_list") return { type: "document" };
  return undefined;
}

function fieldLabel(field: ServedInput): string {
  return displayLabelForKey(
    field.name,
    field.label === field.name ? undefined : field.label,
  );
}

function isStructured(field: ServedInput): boolean {
  return !SCALAR_VALUE_KINDS.has(field.kind) && !MEDIA_VALUE_KINDS.has(field.kind);
}

/** Served values → the `variables` body. Pure — exported for tests. */
export function buildTryVariables(
  fields: readonly ServedInput[],
  values: Record<string, unknown>,
): JsonObject {
  const variables: JsonObject = {};
  for (const field of fields) {
    if (field.pinned) continue;
    const value = values[field.name] ?? "";
    if (isBlank(value)) {
      if (field.sourcing !== "optional") {
        throw new Error(`${fieldLabel(field)} is required.`);
      }
      continue;
    }
    const structured = isStructured(field);
    try {
      variables[field.name] =
        structured && typeof value === "string"
          ? (JSON.parse(value) as JsonValue)
          : (JSON.parse(JSON.stringify(value)) as JsonValue);
    } catch {
      throw new Error(
        `${fieldLabel(field)} needs a valid ${structured ? "JSON value" : "value"}.`,
      );
    }
  }
  return variables;
}

/** The candidate body for a mode. Pure — exported for tests. */
export function tryCandidateFor(
  mode: CandidateMode,
  draft: HolderDraft,
): MandateTryCandidate | null {
  if (mode === "current") return { selection: "current", label: MODE_WORDS.current };
  if (draft.kind === "agent") {
    return draft.agentId
      ? { selection: "agent", agent_id: draft.agentId, label: "Candidate agent" }
      : null;
  }
  return draft.workflowId
    ? {
        selection: "workflow",
        workflow_id: draft.workflowId,
        workflow_version_id: draft.workflowVersionId ?? null,
        label: "Candidate workflow",
      }
    : null;
}

export function MandateTryPanel({
  mandateKey,
  outputKind,
  organizationId,
}: {
  mandateKey: string;
  /** The mandate's declared output kind — narrows the workflow picker. */
  outputKind: string | null;
  /** Organization seat: the route organization the run happens in. */
  organizationId: string | null;
}) {
  const dispatch = useAppDispatch();
  const surfaceState = useMandateInputSurface(mandateKey);
  const surface = surfaceState.status === "ready" ? surfaceState.surface : null;
  const fields = surface?.inputs ?? [];
  const [mode, setMode] = useState<CandidateMode>("current");
  // The one canonical chooser's three values — here a candidate to run once.
  const [draft, setDraft] = useState<HolderDraft>(EMPTY_CANDIDATE);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [userInput, setUserInput] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MandateTestResponse | null>(null);
  const [failure, setFailure] = useState<MandateRunFailure | null>(null);

  const candidate = tryCandidateFor(mode, draft);

  const run = async () => {
    if (!candidate) return;
    setFailure(null);
    let variables: JsonObject;
    try {
      variables = buildTryVariables(fields, values);
    } catch (error: unknown) {
      setFailure(describeMandateRunFailure(error));
      return;
    }
    setRunning(true);
    try {
      const answer = await runMandateTry(dispatch, mandateKey, {
        variables,
        userInput: surface?.acceptsUserInput && userInput.trim() ? userInput : null,
        candidate,
        organizationId,
      });
      setResult(answer);
    } catch (error: unknown) {
      setResult(null);
      setFailure(describeMandateRunFailure(error));
    } finally {
      setRunning(false);
    }
  };

  const setValue = (name: string, value: unknown) =>
    setValues((current) => ({ ...current, [name]: value }));

  return (
    <div className="space-y-4" data-testid="mandate-try-panel">
      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <FlaskConical className="h-4 w-4 text-muted-foreground" />
          Try this job
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={mode} onValueChange={(value) => setMode(value as CandidateMode)}>
            <SelectTrigger
              aria-label="What runs"
              className={cn(CONFIGURATION_CHOICE_SIZE, "w-56")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(MODE_WORDS) as CandidateMode[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {MODE_WORDS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {mode === "candidate" ? (
          <HolderAssignment
            purpose="try"
            holder={draft}
            onHolderChange={setDraft}
            mandateKey={mandateKey}
            consumerId={`mandate-try-candidate-${mandateKey}`}
            outputKind={outputKind}
            disabled={running}
          />
        ) : null}
        <p className="text-xs text-muted-foreground">
          {mode === "current"
            ? "Runs whatever fulfils this job for you right now — your own binding first, then your organization's, then the platform's."
            : "Runs the one you pick instead, just for this try. Nothing is bound or saved."}
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-card p-3">
        <h3 className="text-sm font-medium">Inputs</h3>
        {surfaceState.status === "loading" ? (
          <p className="text-xs text-muted-foreground">Reading what this job takes…</p>
        ) : null}
        {surfaceState.status === "error" ? (
          <p className="text-xs text-destructive">{surfaceState.message} <ErrorAlchemyMenu error={surfaceState.message} /></p>
        ) : null}
        {surface ? <ServerNotes heading="About these inputs" notes={surface.notes} /> : null}
        {fields.map((field) => {
          const label = fieldLabel(field);
          const value = values[field.name] ?? "";
          return (
            <div key={field.name} className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                {label}
                {field.sourcing === "optional" ? (
                  <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
                ) : null}
              </label>
              {field.help ? (
                <p className="text-xs text-muted-foreground">{field.help}</p>
              ) : null}
              {field.pinned ? (
                <PropertyRow
                  label="Value"
                  value={
                    field.pinnedValue == null
                      ? "Provided at run time"
                      : typeof field.pinnedValue === "object"
                        ? <StructuredValueView value={field.pinnedValue} density="inline" footer={false} />
                        : String(field.pinnedValue)
                  }
                />
              ) : isStructured(field) ? (
                <ProJsonTextarea
                  aria-label={label}
                  value={typeof value === "string" ? value : JSON.stringify(value, null, 2)}
                  onChange={(event) => setValue(field.name, event.target.value)}
                  placeholder="JSON value"
                  className="min-h-24 text-sm"
                  minHeight={96}
                  enableTextStats={false}
                  autoFocus={false}
                />
              ) : ["text", "string", "markdown"].includes(field.kind) ? (
                <ProTextarea
                  aria-label={label}
                  value={String(value)}
                  onChange={(event) => setValue(field.name, event.target.value)}
                  placeholder={field.placeholder || field.example || label}
                  className="min-h-20 text-sm"
                  minHeight={80}
                  autoFocus={false}
                />
              ) : (
                <VariableInputComponent
                  variableName={label}
                  value={value}
                  onChange={(next: unknown) => setValue(field.name, next)}
                  customComponent={componentForKind(field.kind)}
                  hideLabel
                  compact
                  autoFocus={false}
                />
              )}
            </div>
          );
        })}
        {surface && fields.length === 0 && !surface.acceptsUserInput ? (
          <p className="text-xs text-muted-foreground">This job takes no inputs.</p>
        ) : null}
        {surface?.acceptsUserInput ? (
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">
              Your message <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <ProTextarea
              aria-label="Your message"
              value={userInput}
              onChange={(event) => setUserInput(event.target.value)}
              placeholder="Anything you would type to it"
              className="min-h-20 text-sm"
              minHeight={80}
              autoFocus={false}
            />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button
            size="sm"
            onClick={() => void run()}
            disabled={running || !candidate || surfaceState.status !== "ready"}
          >
            {running ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FlaskConical className="mr-1.5 h-3.5 w-3.5" />
            )}
            {running ? "Running…" : "Run it"}
          </Button>
          <p className="text-xs text-muted-foreground">
            {!candidate
              ? draft.kind === "agent"
                ? "Choose an agent to try."
                : "Choose a workflow to try."
              : "Each run uses real AI and is charged to your account. Nothing about the job changes."}
          </p>
        </div>
      </div>

      {failure ? <RunFailureCard failure={failure} testId="mandate-try-failure" /> : null}
      {result ? <TryResult result={result} /> : null}
    </div>
  );
}

function TryResult({ result }: { result: MandateTestResponse }) {
  const holder = readMandateRunHolder(result);
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3" data-testid="mandate-try-result">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Result</span>
        <span>{formatDurationMs(result.duration_ms)}</span>
        {result.model_id ? <span>{result.model_id}</span> : null}
        {holder.runId ? (
          <Link
            href={`/workflows/runs/${encodeURIComponent(holder.runId)}`}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            Open the workflow run
            <ExternalLink className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
      {result.error ? (
        <p className="text-sm text-destructive">{result.error} <ErrorAlchemyMenu error={result.error} /></p>
      ) : null}
      {result.structural.checked && result.structural.ok === false ? (
        <div className="rounded border border-warning/50 bg-warning/5 p-2 text-xs">
          <p className="font-medium text-foreground">The answer could not be confirmed against this job&rsquo;s output:</p>
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
            {(result.structural.errors ?? []).map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <ServerNotes heading="What this run did" notes={result.notes ?? []} />
      <AnswerValueView
        value={result.artifact ?? null}
        text={result.output ?? ""}
        kind={result.structural.output_kind ?? null}
      />
    </div>
  );
}
