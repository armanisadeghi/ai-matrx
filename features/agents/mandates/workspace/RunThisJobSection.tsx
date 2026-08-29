"use client";

// features/agents/mandates/workspace/RunThisJobSection.tsx
//
// RUN THIS JOB — the workspace's run affordance. The Mandate workspace could
// state the job, the Holder, the override and the notes, but there was no way
// to actually RUN the thing you are looking at: the only run affordance in the
// product was the admin console's bench, on an /administration route.
//
// It renders inside BOTH hosts MandateWorkspace serves (the (core) route and
// the MandateWindow panel twin) because it is a plain section of the workspace
// — no host branch anywhere in this file.
//
// WHAT IT REUSES, and why nothing here is a fork:
//   · the run itself      → `runMandateAdHocTest` (../test-run.ts), the ONE
//                           client path for POST /mandates/{key}/test
//   · the input controls  → the canonical `VariableInputComponent`, so a
//                           number is a stepper and a file is a file picker
//   · the output          → the canonical content pipeline: `StructuredValueView`
//                           for structured results, `MarkdownStream` for prose.
//                           Nothing on this surface hand-renders a payload.
//
// 🚨 THE USER-INPUT LAW. Every declared value goes as a named entry in
// `variables`. `user_input` carries ONLY what the person typed in the free-text
// box — never a serialized structure, never a stuffed template.
//
// 🚨 SUPER ADMIN ONLY, and gated BEFORE the affordance exists. The server
// declares `require_super_admin` on this endpoint, so for anyone else this
// section renders nothing at all — a visible button that always 403s is the
// dead end this repo bans, and a teaser would be page content a normal user
// can neither use nor act on.
//
// No spinner-as-answer problem and no hand-rolled progress bar: this endpoint
// returns ONE completed result and exposes no requestId, so there is no stream
// to adopt. When it learns to stream, this section adopts it and renders the
// canonical LiveRunWindow — see ../test-run.ts.

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, FlaskConical, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import MarkdownStream from "@/components/MarkdownStream";
import { StructuredValueView } from "@/components/official/structured-value/StructuredValueView";
import { VariableInputComponent } from "@/features/agents/components/inputs/input-components/VariableInputComponent";
import type { VariableCustomComponent } from "@/features/agents/types/agent-definition.types";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";
import { isJsonObject, type JsonObject, type JsonValue } from "@/types/json";
import {
  MEDIA_VALUE_KINDS,
  SCALAR_VALUE_KINDS,
  type OfferedValue,
} from "../provision-shapes";
import { Section } from "./Section";
import {
  readMandateRunHolder,
  runMandateAdHocTest,
  type MandateTestResponse,
} from "../test-run";
import type { MandateWorkspaceData } from "./useMandateWorkspaceData";

/** One fillable input. `offered` is the Provision's declaration when there is
 * one; a legacy contract-only mandate supplies the name alone. */
interface RunField {
  name: string;
  kind: string;
  /** Guaranteed values are what the real call site always supplies. */
  required: boolean;
  description: string;
  /** Structured kinds are typed as JSON, so the value stays structured on the
   * wire instead of collapsing into a text blob. */
  structured: boolean;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The canonical input control for a declared kind. Undefined = the default
 * textarea, which is right for text/markdown/unknown scalars. */
function componentForKind(kind: string): VariableCustomComponent | undefined {
  if (kind === "number" || kind === "integer") return { type: "number" };
  if (kind === "boolean") return { type: "toggle" };
  if (kind === "markdown") return { type: "markdown" };
  if (kind === "file" || kind === "file_list") return { type: "document" };
  return undefined;
}

function fieldsFromOffer(
  values: readonly OfferedValue[],
  pinnedContext: readonly string[],
): RunField[] {
  return values
    // Pinned context is delivered by the platform on every launch — it is not
    // the caller's to type, and offering it would invite a hand-mapped value
    // that the real call site never sends.
    .filter((value) => !pinnedContext.includes(value.name))
    .map((value) => ({
      name: value.name,
      kind: value.kind,
      required: value.guaranteed,
      description: value.description,
      structured:
        !SCALAR_VALUE_KINDS.has(value.kind) && !MEDIA_VALUE_KINDS.has(value.kind),
    }));
}

function isBlank(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (isJsonObject(value)) return Object.keys(value).length === 0;
  return false;
}

/** Anything the canonical inputs emit becomes a JSON value; unserializable
 * input is refused loudly rather than sent as `undefined`. */
function toJsonValue(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  const round: unknown = JSON.parse(JSON.stringify(value));
  return round as JsonValue;
}

export function RunThisJobSection({ data }: { data: MandateWorkspaceData }) {
  const dispatch = useAppDispatch();
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [userInput, setUserInput] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MandateTestResponse | null>(null);

  // The gate is the FIRST thing, before any field derivation: the endpoint is
  // require_super_admin, so for everyone else this section does not exist.
  if (!isSuperAdmin) return null;

  const fields: RunField[] = data.offer
    ? fieldsFromOffer(data.offer.values, data.pinnedContext)
    : data.contract.requiredVariables.map((name) => ({
        name,
        kind: "text",
        required: true,
        description: "",
        structured: false,
      }));

  function currentValue(field: RunField): unknown {
    return field.name in values ? values[field.name] : "";
  }

  /** Named `variables`, every one of them. Nothing structured is ever folded
   * into `user_input`. */
  function buildVariables(): JsonObject | null {
    const out: JsonObject = {};
    for (const field of fields) {
      const raw = currentValue(field);
      if (isBlank(raw)) {
        if (field.required) {
          toast.error(
            `"${field.name}" is required for this job — fill it in before running.`,
          );
          return null;
        }
        continue;
      }
      if (field.structured && typeof raw === "string") {
        // A structured kind stays structured on the wire — a JSON blob typed
        // into a string variable is exactly the smuggling the law forbids.
        try {
          out[field.name] = JSON.parse(raw) as JsonValue;
        } catch (error: unknown) {
          toast.error(
            `"${field.name}" is a ${field.kind} value and must be valid JSON: ${describeError(error)}`,
          );
          return null;
        }
        continue;
      }
      try {
        const json = toJsonValue(raw);
        if (json !== undefined) out[field.name] = json;
      } catch (error: unknown) {
        toast.error(`"${field.name}" can't be sent: ${describeError(error)}`);
        return null;
      }
    }
    return out;
  }

  async function run() {
    const variables = buildVariables();
    if (!variables) return;
    const message = userInput.trim() ? userInput : null;
    if (
      fields.length > 0 &&
      Object.keys(variables).length === 0 &&
      message === null
    ) {
      toast.error("Give the job something to work on — fill an input or type a message.");
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const response = await runMandateAdHocTest(dispatch, data.mandate.mandate_key, {
        variables,
        userInput: message,
        candidate: {
          candidate_id: crypto.randomUUID(),
          label: "Run this job",
          selection: "current",
        },
      });
      setResult(response);
      if (response.error) toast.error(`The run failed: ${response.error}`);
    } catch (error: unknown) {
      // Verbatim, never softened — a failed run that reads as "something went
      // wrong" is a run nobody can fix.
      toast.error(`Couldn't run this job: ${describeError(error)}`);
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Section title="Run this job" hint="super admin">
    <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        Run the job on values you fill in here. It uses whatever fulfils the
        mandate right now — the Holder above, agent or workflow.
      </p>

      {fields.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          This job declares no inputs — run it as-is, or type a message below.
        </p>
      ) : (
        <div className="space-y-2">
          {fields.map((field) => (
            <div key={field.name} className="rounded-lg border border-border/50 p-2.5">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[11px] text-foreground">
                  {field.name}
                </span>
                <Badge variant="outline" className="py-0 font-mono text-[10px]">
                  {field.kind}
                </Badge>
                {field.required ? (
                  <Badge variant="outline" className="py-0 text-[10px]">
                    required
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="py-0 text-[10px] text-muted-foreground"
                  >
                    optional
                  </Badge>
                )}
              </div>
              {field.structured ? (
                <Textarea
                  value={typeof currentValue(field) === "string" ? (currentValue(field) as string) : ""}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.name]: event.target.value,
                    }))
                  }
                  placeholder={field.description || `JSON for ${field.kind}`}
                  className="min-h-16 font-mono text-base"
                />
              ) : (
                <VariableInputComponent
                  variableName={field.name}
                  value={currentValue(field)}
                  onChange={(value: unknown) =>
                    setValues((current) => ({ ...current, [field.name]: value }))
                  }
                  customComponent={componentForKind(field.kind)}
                  helpText={field.description || undefined}
                  hideLabel
                  compact
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Free text ONLY — what a person would say. Never a channel for values. */}
      <Textarea
        value={userInput}
        onChange={(event) => setUserInput(event.target.value)}
        placeholder="Anything you'd say to whoever does this job (optional)"
        className="min-h-16 text-base"
      />

      <Button
        size="sm"
        variant="secondary"
        className="gap-1.5"
        disabled={running}
        onClick={() => void run()}
      >
        {running ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FlaskConical className="h-3.5 w-3.5" />
        )}
        {running ? "Running…" : "Run it"}
      </Button>

      {result ? <RunResult result={result} /> : null}
    </div>
    </Section>
  );
}

/** The result — the error verbatim when it failed, the answer through the
 * canonical pipeline when it worked, and the door to the child workflow run
 * when a WORKFLOW held the mandate. */
function RunResult({ result }: { result: MandateTestResponse }) {
  const holder = readMandateRunHolder(result);
  const structural = result.structural;
  const failed = Boolean(result.error);

  return (
    <div
      className={
        failed
          ? "space-y-2 rounded-lg border border-destructive/60 bg-destructive/5 p-3"
          : "space-y-2 rounded-lg border border-border/60 p-3"
      }
    >
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className="font-semibold text-foreground">Result</span>
        {failed ? (
          <Badge variant="destructive" className="py-0 text-[10px]">
            failed
          </Badge>
        ) : structural?.checked && !structural.ok ? (
          <Badge variant="destructive" className="py-0 text-[10px]">
            wrong shape
          </Badge>
        ) : (
          <Badge variant="secondary" className="py-0 text-[10px]">
            ran
          </Badge>
        )}
        <Badge variant="outline" className="py-0 text-[10px]">
          {((result.duration_ms ?? 0) / 1000).toFixed(1)}s
        </Badge>
        {holder.holderType === "workflow" ? (
          <Badge variant="outline" className="py-0 text-[10px]">
            workflow
          </Badge>
        ) : null}
      </div>

      {/* THE WORKFLOW LEG — a workflow holder produced a real child run, and a
          run the UI names must open (no dead ends). */}
      {holder.holderType === "workflow" && holder.runId ? (
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link href={`/workflows/runs/${holder.runId}`}>
            <ExternalLink className="h-3.5 w-3.5" />
            Open the run
          </Link>
        </Button>
      ) : null}

      {failed ? (
        // Verbatim. The server's words, not ours.
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-destructive/10 p-2 text-[11.5px] text-destructive">
          {result.error}
        </pre>
      ) : (
        <>
          {(structural?.errors ?? []).length > 0 ? (
            <p className="text-[11.5px] text-destructive">
              {(structural?.errors ?? []).join("; ")}
            </p>
          ) : null}
          <ResultBody result={result} />
        </>
      )}
    </div>
  );
}

/** The answer, through the ONE canonical content pipeline — structured data as
 * a human document (`StructuredValueView`), prose through `MarkdownStream`.
 * Nothing here formats a payload by hand. */
function ResultBody({ result }: { result: MandateTestResponse }) {
  const artifact = result.artifact;
  if (artifact != null && isJsonObject(artifact)) {
    return <StructuredValueView value={artifact} />;
  }
  const output = result.output ?? "";
  if (!output.trim()) {
    return (
      <p className="text-[12px] text-muted-foreground">
        The run finished and produced nothing — that is a result worth reporting.
      </p>
    );
  }
  // An agent that answered with a JSON document gets the document floor; plain
  // prose gets the canonical markdown renderer.
  try {
    const parsed: unknown = JSON.parse(output);
    if (isJsonObject(parsed) || Array.isArray(parsed)) {
      return <StructuredValueView value={parsed} />;
    }
  } catch {
    // Not JSON — it is prose, which is exactly what MarkdownStream renders.
  }
  return <MarkdownStream content={output} />;
}
