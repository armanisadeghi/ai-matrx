"use client";

// features/mandates/workspace/RunThisJobSection.tsx
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
import { selectIsSuperAdmin, selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { toast } from "@/lib/toast";
import { isJsonObject, type JsonObject, type JsonValue } from "@/types/json";
import { MEDIA_VALUE_KINDS, SCALAR_VALUE_KINDS } from "../provision-shapes";
import type { ServedInput } from "@/features/workflow-runtime/served-form/served-input";
import { isUserTextOnly, useMandateInputSurface } from "../input-surface";
import { Section } from "./Section";
import { ServerNotes } from "@/components/official/ServerNotes";
import { RunFailureCard } from "../RunFailureCard";
import {
  describeMandateRunFailure,
  readMandateRunHolder,
  runMandateAdHocTest,
  type MandateRunFailure,
  type MandateTestResponse,
} from "../test-run";
import type { MandateWorkspaceData } from "./useMandateWorkspaceData";
import { ProTextarea } from "@/components/official/ProTextarea";

/**
 * One fillable input, derived from THE SERVED SURFACE
 * (`GET /mandates/{key}/input-surface` — `../input-surface.ts`).
 *
 * 🚨 THIS FORM NO LONGER DERIVES ITS OWN FIELDS. Until 2026-08-31 it read the
 * Provision's offer, or failing that the mandate's promoted
 * `required_variables` — both CODE declarations. A mandate a person authored
 * has neither, so this section offered one anonymous text box and said "This
 * job declares no inputs" while the mandate's own described inputs and the
 * bound agent's real variables sat unread. The server now answers that
 * question, once, for every consumer.
 */
interface RunField {
  name: string;
  kind: string;
  /** `require`/`ask` — a value the job needs before it can run. */
  required: boolean;
  description: string;
  /** Structured kinds are typed as JSON, so the value stays structured on the
   * wire instead of collapsing into a text blob. */
  structured: boolean;
  /** Where the declaration came from — shown, because a field whose origin is
   * invisible is a field nobody can judge. */
  origin: ServedInput["origin"];
  /** The platform delivers this on every run: visible, never typed. */
  pinned: boolean;
}

const ORIGIN_LABEL: Record<ServedInput["origin"], string> = {
  provision: "offered by this job",
  mandate_input: "this job's own input",
  holder: "the agent's own",
  variable: "declared variable",
  field: "declared",
  // The BINDING asks this one — a `prompt_user` source in the winning binding's
  // map is served as a real field, so the form says who is asking.
  binding_prompt: "asked by the binding",
};

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

/** The served surface → this form's fields. A one-to-one read, no derivation:
 * platform-pinned entries stay VISIBLE (the golden rule) but are never typed. */
function fieldsFromSurface(inputs: readonly ServedInput[]): RunField[] {
  return inputs.map((input) => ({
    name: input.name,
    kind: input.kind,
    required: input.sourcing !== "optional" && !input.pinned,
    description: input.help || (input.label !== input.name ? input.label : ""),
    structured:
      !SCALAR_VALUE_KINDS.has(input.kind) && !MEDIA_VALUE_KINDS.has(input.kind),
    origin: input.origin,
    pinned: input.pinned,
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
  // THE PRINCIPAL DECIDES WHICH HOLDER RUNS. This section shows the viewer
  // THEIR resolution — the ribbon and OverrideFlow directly above it — so the
  // run must be resolved as THEM. Sending no principal resolves the system
  // default, which would ignore the override the user just made one section
  // down and could never reach a workflow Holder (those are bound per
  // principal). See the law on `runMandateAdHocTest`.
  const viewerUserId = useAppSelector(selectUserId);
  const viewerOrgId = useAppSelector(selectEffectiveOrganizationId);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [userInput, setUserInput] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MandateTestResponse | null>(null);
  // 🚨 A REFUSAL IS PANEL STATE, NOT A TOAST. A 409/422 used to clear the panel
  // and flash the sentence past the person; it now lands here and stays until
  // the next run replaces it.
  const [failure, setFailure] = useState<MandateRunFailure | null>(null);
  // THE SERVED SURFACE — asked before the super-admin gate because a hook may
  // never sit behind an early return. It is one authenticated GET; a
  // non-admin's request simply never renders anything.
  const surfaceState = useMandateInputSurface(data.mandate.mandate_key);

  // The gate: the endpoint is require_super_admin, so for everyone else this
  // section does not exist.
  if (!isSuperAdmin) return null;

  const surface = surfaceState.status === "ready" ? surfaceState.surface : null;
  const fields: RunField[] = surface ? fieldsFromSurface(surface.inputs) : [];

  function currentValue(field: RunField): unknown {
    return field.name in values ? values[field.name] : "";
  }

  /** Named `variables`, every one of them. Nothing structured is ever folded
   * into `user_input`. */
  function buildVariables(): JsonObject | null {
    const out: JsonObject = {};
    for (const field of fields) {
      // A platform-pinned value is delivered server-side and stamped there;
      // echoing it back would be this client claiming a source it may not
      // claim (INPUT-SURFACE.md § THE source=human INVARIANT).
      if (field.pinned) continue;
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
    setFailure(null);
    try {
      const response = await runMandateAdHocTest(dispatch, data.mandate.mandate_key, {
        variables,
        userInput: message,
        candidate: {
          candidate_id: crypto.randomUUID(),
          label: "Run this job",
          selection: "current",
        },
        principal: {
          user_id: viewerUserId,
          organization_id: viewerOrgId,
        },
      });
      setResult(response);
      if (response.error) toast.error(`The run failed: ${response.error}`);
    } catch (error: unknown) {
      // 🚨 THE REFUSAL STAYS IN THE PANEL. It used to be cleared to nothing and
      // announced only in a toast, so the server's sentence — the one thing
      // that says what refused and what to do about it — had to be caught mid
      // flight. The toast is now the courtesy; the panel is the record.
      setFailure(describeMandateRunFailure(error));
      setResult(null);
      toast.error(`Couldn't run this job: ${describeError(error)}`);
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

      {/* WHAT THE SERVER COULD NOT READ, in its own words — never swallowed
          into a shorter, calmer, wrong sentence. */}
      {surface ? (
        <ServerNotes
          heading="What the server could not read"
          notes={surface.notes}
          testId="run-surface-notes"
        />
      ) : null}

      {surfaceState.status === "loading" ? (
        <p className="text-[12px] text-muted-foreground">
          Reading this job&apos;s inputs…
        </p>
      ) : surfaceState.status === "error" ? (
        <p className="text-[12px] text-destructive">
          This job&apos;s inputs could not be read: {surfaceState.message}
        </p>
      ) : fields.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          {surface && isUserTextOnly(surface)
            ? "Nothing is declared for this job — not in code, not on the mandate, not by the agent that fulfils it. Run it as-is, or type a message below."
            : "No input is fillable here right now — see above."}
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
                {field.pinned ? (
                  <Badge variant="outline" className="py-0 text-[10px] text-muted-foreground">
                    delivered automatically
                  </Badge>
                ) : field.required ? (
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
                <span className="text-[10px] text-muted-foreground/70">
                  {ORIGIN_LABEL[field.origin]}
                </span>
              </div>
              {/* 🚨 A QUESTION THIS JOB ASKS YOU NEVER GETS SILENTLY ANSWERED
                  (walk, 2026-08-31). A `prompt_user` source served as an
                  OPTIONAL field was left blank here and the run went ahead on
                  the agent's own default — the person was asked nothing, told
                  nothing, and got a value they never chose ("Luxury
                  Shopping"). Whoever bound this job chose to be asked; a
                  substitution for that choice is exactly the stand-in that has
                  to announce itself. It is not made required — the binding's
                  author said optional and that stands — but the consequence of
                  leaving it blank is stated BEFORE the run, not discovered
                  after it. */}
              {field.origin === "binding_prompt" && !field.required && !field.pinned ? (
                <p className="mb-1 text-[11px] leading-snug text-amber-700 dark:text-amber-400">
                  This job asks you for this. Leave it blank and the run uses
                  the holder&rsquo;s own default instead of an answer from you.
                </p>
              ) : null}
              {field.pinned ? (
                <p className="text-[11.5px] text-muted-foreground">
                  {field.description ||
                    "The platform supplies this on every run — it is not yours to type."}
                </p>
              ) : field.structured ? (
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
      <ProTextarea
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

      {failure ? <RunFailureCard failure={failure} /> : null}
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

      {/* 🚨 WHAT THIS RUN DID THAT NOBODY ASKED FOR — the server's own
          sentences off `MandateTestResult.notes`, which arrive in the body of a
          200 and so turn nothing red. The `mandate_consumption_map_no_op`
          scream is one of them: until 2026-08-31 it reached this browser on
          every affected run and appeared nowhere on this screen (V3 round 4 §
          honesty). */}
      <ServerNotes
        heading="What this run did"
        notes={result.notes ?? []}
        testId="mandate-run-notes"
      />

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
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    parsed = undefined;
  }
  if (isJsonObject(parsed) || Array.isArray(parsed)) {
    return <StructuredValueView value={parsed} />;
  }
  return <MarkdownStream content={output} />;
}
