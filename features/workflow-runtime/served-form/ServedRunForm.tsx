"use client";

/**
 * ServedRunForm — THE run form, generated from the SERVED input surface.
 *
 * Ruled design: common-docs `systems/workflows/INPUT-SURFACE.md`. A
 * workflow's inputs are ONE declared surface, compiled server-side and served
 * by `GET /workflows/{id}/run-form`. This component is the first of that
 * declaration's four consumers — the run form — and it holds NOTHING that the
 * other three (programmatic callers, mandate delivery, the tool schema) do
 * not also address by the same names.
 *
 * WHAT THIS COMPONENT IS NOT ALLOWED TO DO, and why:
 *
 *  · It never derives the form from a definition. `deriveRunForm`'s
 *    client-side derivation is not imported here; the surface is served.
 *  · It never picks a component from anything written on the INPUT. The
 *    ladder is `resolveVariantComponent(kind, variantName)` — named variant
 *    on the kind → the kind's default extraction component → the value-type
 *    default. An input that asks for a variant its kind does not register
 *    gets the next rung down AND a loud, visible defect badge; it never gets
 *    an ad-hoc component (that is a second renderer with a new hat).
 *  · It never renders an input itself. Every field is the production
 *    `VariableInputComponent` — the same 27-component vocabulary the agent
 *    runner uses, reached through the resolver.
 *  · It never claims a provenance it may not claim. Only values a person
 *    typed here travel stamped `human`; seeded defaults are left to the
 *    server, and pinned values are shown read-only and never echoed back.
 *
 * Sourcing drives presentation, not decoration: `ask` and `require` are
 * always visible and gate the Start button; `optional` collapses behind
 * "More". A start the server refuses with 409 `inputs_required` renders the
 * server's own gap list — a run that needs an input is never a dead end.
 *
 * R12 posture: proving on a bake-off first. When the shipped run form adopts
 * this component, the legacy `deriveRunForm` / `node_inputs` path is deleted,
 * not left beside it.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, ChevronDown, Loader2, Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import { VariableInputComponent } from "@/features/agents/components/inputs/input-components/VariableInputComponent";
import {
  resolveVariantComponent,
  type ResolvedVariantComponent,
  type VariantResolvableKind,
} from "@/features/content-ir/variants/kind-variants";

import {
  buildSubmission,
  partitionBySourcing,
  provenanceLabel,
  seedServedValues,
  unsatisfiedServedInputs,
  type ServedInput,
  type ServedInputGap,
} from "./served-input";
import { loadKindSources, valueTypeFromJsonSchema } from "./kind-source";
import { useServedRunForm, useServedRunStart } from "./useServedRunForm";

export interface ServedRunFormProps {
  definitionId: string;
  /** Called with the new run id once the server accepts the start. */
  onStarted: (runId: string) => void;
  /** Copy above the fields. The surface itself never carries page chrome. */
  heading?: string;
  startLabel?: string;
}

export function ServedRunForm({
  definitionId,
  onStarted,
  heading = "What it needs from you",
  startLabel = "Start",
}: ServedRunFormProps) {
  const state = useServedRunForm(definitionId);
  const { starting, start } = useServedRunStart();

  const inputs = state.status === "ready" ? state.form.inputs : EMPTY_INPUTS;

  // ── The draft: seeded values + the names a PERSON actually answered ──────
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [touched, setTouched] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [triedToStart, setTriedToStart] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [serverGaps, setServerGaps] = useState<ServedInputGap[] | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    setValues(seedServedValues(inputs));
    setTouched(new Set<string>());
    setTriedToStart(false);
    setServerGaps(null);
    setStartError(null);
  }, [inputs]);

  // ── The kind registry, for exactly the kinds this surface addresses ──────
  const [kinds, setKinds] = useState<Record<string, VariantResolvableKind>>({});
  const [kindError, setKindError] = useState<string | null>(null);
  const kindSlugs = useMemo(
    () => Array.from(new Set(inputs.map((i) => i.kind))),
    [inputs],
  );
  useEffect(() => {
    let live = true;
    if (kindSlugs.length === 0) {
      setKinds({});
      setKindError(null);
      return;
    }
    void loadKindSources(kindSlugs).then((result) => {
      if (!live) return;
      setKinds(result.kinds);
      setKindError(result.error);
    });
    return () => {
      live = false;
    };
  }, [kindSlugs]);

  const { ask, require: required, optional } = partitionBySourcing(inputs);
  const gaps = unsatisfiedServedInputs(inputs, values, touched);
  const gapNames = new Set(gaps.map((g) => g.name));

  const setValue = (name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setTouched((prev) => {
      if (prev.has(name)) return prev;
      const next = new Set(prev);
      next.add(name);
      return next;
    });
  };

  const submit = () => {
    setTriedToStart(true);
    setStartError(null);
    setServerGaps(null);
    if (gaps.length > 0) return;
    void start(definitionId, buildSubmission(inputs, values, touched)).then(
      (outcome) => {
        if (outcome.status === "started") onStarted(outcome.runId);
        else if (outcome.status === "gaps") setServerGaps(outcome.gaps);
        else setStartError(outcome.message);
      },
    );
  };

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading what this workflow needs…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <Scream
        title="Could not load the run form"
        body={`${state.message} The run form is SERVED (GET /workflows/{id}/run-form) — without it there is nothing honest to render.`}
      />
    );
  }

  return (
    <div>
      {!state.form.surfaceServed && (
        <Scream
          title="This backend serves no input surface"
          body="The run-form response carried no `inputs` array, so the reachable server predates the compiled input surface. Nothing below is a real declaration — point at a server that serves it."
        />
      )}
      {kindError && <Scream title="Kind registry gap" body={kindError} />}

      {inputs.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          This workflow declares no inputs — it starts with one click.
        </p>
      ) : (
        <>
          <h2 className="text-sm font-medium text-foreground">{heading}</h2>
          <div className="mt-2 space-y-3">
            {[...ask, ...required].map((input) => (
              <ServedField
                key={input.name}
                input={input}
                kind={kinds[input.kind]}
                value={values[input.name]}
                onChange={(v) => setValue(input.name, v)}
                flagged={triedToStart && gapNames.has(input.name)}
              />
            ))}
          </div>

          {optional.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowOptional((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    showOptional && "rotate-180",
                  )}
                />
                More — {optional.length} optional{" "}
                {optional.length === 1 ? "input" : "inputs"}
              </button>
              {showOptional && (
                <div className="mt-2 space-y-3">
                  {optional.map((input) => (
                    <ServedField
                      key={input.name}
                      input={input}
                      kind={kinds[input.kind]}
                      value={values[input.name]}
                      onChange={(v) => setValue(input.name, v)}
                      flagged={false}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="mt-5">
        <button
          type="button"
          onClick={submit}
          disabled={starting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto sm:min-w-64"
        >
          {starting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting…
            </>
          ) : (
            <>
              {startLabel}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>

        {triedToStart && gaps.length > 0 && (
          <p className="mt-2 text-xs text-destructive">
            Still needed:{" "}
            {gaps
              .map((g) =>
                g.sourcing === "ask"
                  ? `${g.label} (you answer this every run)`
                  : g.label,
              )
              .join(", ")}
            .
          </p>
        )}

        {serverGaps && (
          <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
              {serverGaps.length === 0
                ? "The server refused to start this run for want of an input — but it did not say which."
                : `The server needs ${serverGaps.length} ${
                    serverGaps.length === 1 ? "input" : "inputs"
                  } before this run can start:`}
            </p>
            {serverGaps.length === 0 && (
              <p className="mt-1 text-[11px] text-amber-800/80 dark:text-amber-200/80">
                🚨 The 409 carried <code className="font-mono">inputs_required</code>{" "}
                but no <code className="font-mono">missing</code> list — aidream&apos;s
                error middleware flattens the detail and drops it. Server-side
                defect: carry the gap list through the normalizer. Nothing you
                entered was lost.
              </p>
            )}
            <ul className="mt-1 space-y-0.5">
              {serverGaps.map((gap) => (
                <li
                  key={gap.name}
                  className="text-xs text-amber-800 dark:text-amber-200"
                >
                  <span className="font-medium">{gap.label}</span>
                  <span className="ml-1.5 text-[11px] opacity-80">
                    {gap.kind} · {gap.sourcing}
                  </span>
                  {gap.help ? (
                    <span className="ml-1.5 text-[11px] opacity-80">
                      — {gap.help}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11px] text-amber-800/80 dark:text-amber-200/80">
              Fill them in above and start again — nothing was lost.
            </p>
          </div>
        )}

        {startError && (
          <p className="mt-2 text-xs text-destructive">{startError}</p>
        )}
      </div>
    </div>
  );
}

const EMPTY_INPUTS: ServedInput[] = [];

// ---------------------------------------------------------------------------
// One input
// ---------------------------------------------------------------------------

function ServedField({
  input,
  kind,
  value,
  onChange,
  flagged,
}: {
  input: ServedInput;
  kind: VariantResolvableKind | undefined;
  value: unknown;
  onChange: (v: unknown) => void;
  flagged: boolean;
}) {
  const resolution: ResolvedVariantComponent = resolveVariantComponent(
    kind ?? {
      kind: input.kind,
      variants: [],
      valueType: valueTypeFromJsonSchema(input.jsonSchema),
    },
    input.variant,
  );

  const readOnly = input.readOnly || input.pinned;
  const shown = readOnly && !missing(input.pinnedValue) ? input.pinnedValue : value;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3",
        flagged ? "border-destructive/60" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-foreground">
          {input.label}
        </span>
        <SourcingBadge input={input} />
        <span className="text-[11px] text-muted-foreground/70">
          {input.kind}
          {input.variant ? ` · ${input.variant}` : ""}
        </span>
      </div>

      {readOnly ? (
        <div className="mt-1.5">
          <div className="flex items-start gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1.5">
            <Lock className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="text-xs text-foreground">
              {formatReadOnly(shown)}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {provenanceLabel(input)}
          </p>
        </div>
      ) : resolution.component ? (
        <div className="mt-1">
          <VariableInputComponent
            value={value}
            onChange={onChange}
            variableName={input.label || input.name}
            customComponent={resolution.component}
            helpText={input.help || undefined}
            hideLabel
            compact
          />
        </div>
      ) : (
        // The kind registers a DB-authored renderer for this variant. Routing
        // those is the kind host's job, not this form's — screaming beats
        // silently substituting a textarea for a component that promised more.
        <Scream
          title={`No routing for "${resolution.dbComponentKey}"`}
          body={`Kind "${input.kind}" resolves input "${input.name}" to the DB-authored component "${resolution.dbComponentKey}", which this form has no routing for. Route it in the kind host before registering it.`}
        />
      )}

      {resolution.unregisteredVariant && (
        <p className="mt-1 flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Input <code className="font-mono">{input.name}</code> asks for
            variant{" "}
            <code className="font-mono">
              {resolution.unregisteredVariant}
            </code>
            , which kind <code className="font-mono">{input.kind}</code> does
            not register — rendered with its{" "}
            {resolution.source === "kind-default-component"
              ? "default input component"
              : "value-type default"}{" "}
            instead. Register the variant on the kind (or stop asking for it);
            this is a defect, not a preference.
          </span>
        </p>
      )}
    </div>
  );
}

function SourcingBadge({ input }: { input: ServedInput }) {
  if (input.pinned) {
    return (
      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        pinned
      </span>
    );
  }
  const tone =
    input.sourcing === "ask"
      ? "bg-primary/10 text-primary"
      : input.sourcing === "require"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "bg-muted text-muted-foreground";
  const label =
    input.sourcing === "ask"
      ? "you answer every run"
      : input.sourcing === "require"
        ? "required"
        : "optional";
  return (
    <span
      className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", tone)}
      title={`sourcing: ${input.sourcing}`}
    >
      {label}
    </span>
  );
}

function Scream({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-3 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
      <div>
        <p className="text-xs font-medium text-red-700 dark:text-red-300">
          {title}
        </p>
        <p className="mt-0.5 text-[11px] text-red-700/90 dark:text-red-300/90">
          {body}
        </p>
      </div>
    </div>
  );
}

function missing(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function formatReadOnly(value: unknown): string {
  if (missing(value)) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export default ServedRunForm;
