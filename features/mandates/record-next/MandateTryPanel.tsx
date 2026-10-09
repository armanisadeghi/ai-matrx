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

import { useRef, useState } from "react";
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
import { VariableInputComponent } from "@ai-matrx/chat/agents/components/inputs/input-components/VariableInputComponent";
import type { VariableCustomComponent } from "@ai-matrx/chat/agents/types/agent-definition.types";
import { ProTextarea } from "@/components/official/ProTextarea";
import { ProJsonTextarea } from "@/components/official/ProJsonTextarea";
import { PropertyRow, CONFIGURATION_CHOICE_SIZE } from "@ai-matrx/design-system/controls";
import { ServerNotes } from "@/components/official/ServerNotes";
import { useAppDispatch } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { isJsonObject, type JsonObject, type JsonValue } from "@/types/json";
import { formatDurationMs } from "@ai-matrx/kit/format";
import { useMandateInputSurface } from "@/features/mandates/input-surface";
import {
  MEDIA_VALUE_KINDS,
  SCALAR_VALUE_KINDS,
} from "@/features/mandates/provision-shapes";
import type { ServedInput } from "@/features/workflow-runtime/served-form/served-input";
import { RunFailureCard } from "@ai-matrx/chat/mandates/RunFailureCard";
import {
  describeMandateRunFailure,
  readMandateRunHolder,
  type MandateRunFailure,
  type MandateTestResponse,
} from "@/features/mandates/test-run";
import { runMandateTry, type MandateTryCandidate } from "./owner-service";
import { AnswerValueView } from "@/components/official/structured-value/AnswerValueView";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import type { AnyMandateKey } from "@ai-matrx/agents/mandates";
import { displayLabel } from "@ai-matrx/kit/text-case";

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

/**
 * A problem with what the PERSON typed — a required input left blank, or a
 * value that doesn't parse — as opposed to a transport/server failure.
 *
 * 🚨 THE DEFECT THIS EXISTS FOR: `buildTryVariables` used to throw a plain
 * `Error`, which `run()` caught and handed to `describeMandateRunFailure` —
 * the SAME path a dead socket takes. `RunFailureCard` then printed "The run
 * never reached the server… check your connection", which is a LIE for a run
 * that was never even attempted because a required field was empty. Carrying
 * the field name here lets the panel name exactly which input is missing and
 * put focus on it, instead of routing a client-side validation problem
 * through the network-failure card.
 */
export class MandateInputProblem extends Error {
  readonly fieldName: string;
  constructor(fieldName: string, message: string) {
    super(message);
    this.name = "MandateInputProblem";
    this.fieldName = fieldName;
  }
}

function componentForKind(kind: string): VariableCustomComponent | undefined {
  if (kind === "number" || kind === "integer") return { type: "number" };
  if (kind === "boolean") return { type: "toggle" };
  if (kind === "markdown") return { type: "markdown" };
  if (kind === "file" || kind === "file_list") return { type: "document" };
  return undefined;
}

function fieldLabel(field: ServedInput): string {
  return displayLabel(field.label === field.name ? undefined : field.label, field.name);
}

function isStructured(field: ServedInput): boolean {
  return (
    !SCALAR_VALUE_KINDS.has(field.kind) && !MEDIA_VALUE_KINDS.has(field.kind)
  );
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
        throw new MandateInputProblem(
          field.name,
          `${fieldLabel(field)} is required.`,
        );
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
      throw new MandateInputProblem(
        field.name,
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
  mandateKey: AnyMandateKey;
  /** The mandate's declared output kind — narrows the workflow picker. */
  outputKind: string | null;
  /** Organization seat: the route organization the run happens in. */
  organizationId: string | null;
}) {
  const dispatch = useAppDispatch();
  const surfaceState = useMandateInputSurface(mandateKey, organizationId);
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
  /** Which required/invalid input blocked the last attempt, named exactly —
   * kept SEPARATE from `failure` (a transport/server outcome) because this is
   * neither: nothing was sent. */
  const [inputProblem, setInputProblem] = useState<{
    fieldName: string;
    message: string;
  } | null>(null);
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});

  const candidate = tryCandidateFor(mode, draft);

  function focusField(fieldName: string) {
    const el = fieldRefs.current[fieldName];
    if (!el) return;
    el.scrollIntoView?.({ behavior: "smooth", block: "center" });
    const focusable = el.querySelector<HTMLElement>(
      "textarea, input, select, [contenteditable='true'], [tabindex]",
    );
    (focusable ?? el).focus();
  }

  const run = async () => {
    if (!candidate) return;
    setFailure(null);
    setInputProblem(null);
    let variables: JsonObject;
    try {
      variables = buildTryVariables(fields, values);
    } catch (error: unknown) {
      if (error instanceof MandateInputProblem) {
        setInputProblem({ fieldName: error.fieldName, message: error.message });
        focusField(error.fieldName);
        return;
      }
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

  const setValue = (name: string, value: unknown) => {
    setValues((current) => ({ ...current, [name]: value }));
    setInputProblem((current) =>
      current?.fieldName === name ? null : current,
    );
  };

  return (
    <div className="space-y-4" data-testid="mandate-try-panel">
      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <h3 className="flex items-center gap-2 type-title">
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
        <p className="type-secondary text-muted-foreground">
          {mode === "current"
            ? "Runs your binding, else your org's, else the platform's."
            : "Runs your pick for this try only; nothing is saved."}
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-card p-3">
        <h3 className="type-title">Inputs</h3>
        {surfaceState.status === "loading" ? (
          <p className="type-secondary text-muted-foreground">Reading what this job takes…</p>
        ) : null}
        {surfaceState.status === "error" ? (
          <p className="type-secondary text-destructive">
            {surfaceState.message}{" "}
            <ErrorAlchemyMenu error={surfaceState.message} />
          </p>
        ) : null}
        {surface ? (
          <ServerNotes heading="About these inputs" notes={surface.notes} />
        ) : null}
        {fields.map((field) => {
          const label = fieldLabel(field);
          const value = values[field.name] ?? "";
          const problem =
            inputProblem?.fieldName === field.name ? inputProblem.message : null;
          return (
            <div
              key={field.name}
              ref={(el) => {
                fieldRefs.current[field.name] = el;
              }}
              className="space-y-1"
            >
              <label className="text-xs font-medium text-foreground">
                {label}
                {field.sourcing === "optional" ? (
                  <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
                ) : null}
              </label>
              {field.help ? (
                <p className="type-secondary text-muted-foreground">{field.help}</p>
              ) : null}
              {field.pinned ? (
                <PropertyRow
                  label="Value"
                  value={
                    field.pinnedValue == null ? (
                      "Provided at run time"
                    ) : typeof field.pinnedValue === "object" ||
                      typeof field.pinnedValue === "string" ? (
                      <AnswerValueView
                        value={field.pinnedValue}
                        density="inline"
                        emptyText="Empty"
                      />
                    ) : (
                      String(field.pinnedValue)
                    )
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
                  variableName={field.name}
                  label={label}
                  value={value}
                  onChange={(next: unknown) => setValue(field.name, next)}
                  customComponent={componentForKind(field.kind)}
                  hideLabel
                  compact
                  autoFocus={false}
                />
              )}
              {problem ? (
                <p className="type-secondary text-destructive" role="alert">
                  {problem}
                  <ErrorAlchemyMenu error={problem} size="xs" />
                </p>
              ) : null}
            </div>
          );
        })}
        {surface && fields.length === 0 && !surface.acceptsUserInput ? (
          <p className="type-secondary text-muted-foreground">This job takes no inputs.</p>
        ) : null}
        {surface?.acceptsUserInput ? (
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">
              Your message{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
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
            icon={running ? (
              <Loader2 className="animate-spin" />
            ) : (
              <FlaskConical />
            )}
            variant="primary"
            onClick={() => void run()}
            disabled={running || !candidate || surfaceState.status !== "ready"}
          >
            {running ? "Running…" : "Run it"}
          </Button>
          <p className="type-secondary text-muted-foreground">
            {!candidate
              ? draft.kind === "agent"
                ? "Choose an agent to try."
                : "Choose a workflow to try."
              : "Each run uses real AI and is charged to your account. Nothing about the job changes."}
          </p>
        </div>
      </div>

      {failure ? (
        <RunFailureCard failure={failure} testId="mandate-try-failure" />
      ) : null}
      {result ? <TryResult result={result} /> : null}
    </div>
  );
}

function TryResult({ result }: { result: MandateTestResponse }) {
  const holder = readMandateRunHolder(result);
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3" data-testid="mandate-try-result">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-secondary text-muted-foreground">
        <span className="font-medium text-foreground">Result</span>
        <span>{formatDurationMs(result.duration_ms)}</span>
        {result.model_id ? <span>{result.model_id}</span> : null}
        {holder.runId ? (
          <Link
            href={`/workflows/runs/${encodeURIComponent(holder.runId)}`}
            className="inline-flex items-center gap-1 text-primary hover:underline"
             target="_blank"
             rel="noopener noreferrer"
           >
            Open the workflow run
            <ExternalLink className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
      {result.error ? (
        <p className="type-body text-destructive">{result.error} <ErrorAlchemyMenu error={result.error} /></p>
      ) : null}
      {result.structural.checked && result.structural.ok === false ? (
        <div className="rounded border border-warning/50 bg-warning/5 p-2 type-secondary">
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
