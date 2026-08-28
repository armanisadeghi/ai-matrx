"use client";

/**
 * ServedInputFields — THE renderer of a workflow's SERVED input surface,
 * values in, values OUT. It has no Start button and knows no run.
 *
 * ─── Why this exists apart from `ServedRunForm` ─────────────────────────────
 * The compiled input surface (common-docs `systems/workflows/INPUT-SURFACE.md`)
 * has more than one collector. The run form starts a run with it; a trigger
 * authors a schedule's `default_inputs` with it; a masterwork try-box collects
 * with it; the bake-off prototypes each arrange it their own way. Every one of
 * those needs the SAME fields and the SAME gate law, and NOT the same
 * submission semantics — a trigger never stamps `input_sources`, and a
 * schedule's saved payload is not a run start.
 *
 * So the fields are here and the submission is the HOST's. This component
 * emits `(name, value)` and nothing else: no start, no `useServedRunStart`, no
 * provenance claim. `ServedRunForm` is this component plus start machinery, and
 * that is the only composition allowed to claim `human`.
 *
 * ─── What a host gets ───────────────────────────────────────────────────────
 *  · `ServedInputFields` — the default arrangement: `ask` + `require` always
 *    visible, `optional` behind a "More" disclosure, one card per input.
 *  · `ServedFieldControl` — ONE input's control with no chrome at all, for a
 *    host with a bespoke presentation (the bake-off variants). It is the served
 *    twin of the legacy `RunFormFieldControl`: same job, declared surface.
 *  · `useServedInputValues` — the draft (seeded values + which names a PERSON
 *    answered). `touched` is not bookkeeping: an `ask` input is satisfied only
 *    by a human answer, and only the host holding `touched` can tell.
 *  · `useServedInputKinds` — the kind registry for exactly the kinds on this
 *    surface, loaded once.
 *
 * The component-picking ladder is `resolveVariantComponent` and nothing else:
 * named variant on the kind → the kind's default extraction component → the
 * value-type default. An input asking for a variant its kind does not register
 * gets the next rung down AND a loud, visible defect badge. It never gets an
 * ad-hoc component — that is a second renderer with a new hat.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import { VariableInputComponent } from "@/features/agents/components/inputs/input-components/VariableInputComponent";
import {
  resolveVariantComponent,
  type ResolvedVariantComponent,
  type VariantResolvableKind,
} from "@/features/content-ir/variants/kind-variants";

import {
  partitionBySourcing,
  provenanceLabel,
  seedServedValues,
  type ServedInput,
} from "./served-input";
import { loadKindSources, valueTypeFromJsonSchema } from "./kind-source";

/** Stable identity for "this surface declares nothing", so effects settle. */
export const EMPTY_SERVED_INPUTS: ServedInput[] = [];

// ---------------------------------------------------------------------------
// The draft — values + who answered them
// ---------------------------------------------------------------------------

export interface ServedInputDraft {
  values: Record<string, unknown>;
  /** Names a PERSON entered a value for in THIS surface. */
  touched: ReadonlySet<string>;
  setValue: (name: string, value: unknown) => void;
  /** Replace the whole draft (a host restoring a stored payload). */
  setValues: (values: Record<string, unknown>) => void;
}

/**
 * Seed a draft from the surface's declared defaults and track what a person
 * actually answered. Re-seeds whenever the surface itself changes.
 *
 * `initial`, when given, wins over the declared defaults for the names it
 * carries — that is a host restoring something already stored (a trigger's
 * `default_inputs`), not a person answering, so those names are NOT touched.
 */
export function useServedInputValues(
  inputs: readonly ServedInput[],
  initial?: Record<string, unknown>,
): ServedInputDraft {
  const [values, setValuesState] = useState<Record<string, unknown>>({});
  const [touched, setTouched] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  useEffect(() => {
    setValuesState({ ...seedServedValues(inputs), ...(initial ?? {}) });
    setTouched(new Set<string>());
    // `initial` is a host's stored payload: it seeds, it does not re-seed on
    // every parent render. The surface identity is what makes a draft stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs]);

  const setValue = (name: string, value: unknown) => {
    setValuesState((prev) => ({ ...prev, [name]: value }));
    setTouched((prev) => {
      if (prev.has(name)) return prev;
      const next = new Set(prev);
      next.add(name);
      return next;
    });
  };

  return { values, touched, setValue, setValues: setValuesState };
}

// ---------------------------------------------------------------------------
// The kind registry, for exactly the kinds this surface addresses
// ---------------------------------------------------------------------------

export interface ServedInputKinds {
  kinds: Record<string, VariantResolvableKind>;
  /** LOUD: a kind this surface addresses could not be read. Never silent. */
  error: string | null;
}

export function useServedInputKinds(
  inputs: readonly ServedInput[],
): ServedInputKinds {
  const [kinds, setKinds] = useState<Record<string, VariantResolvableKind>>({});
  const [error, setError] = useState<string | null>(null);
  const kindSlugs = useMemo(
    () => Array.from(new Set(inputs.map((i) => i.kind))),
    [inputs],
  );

  useEffect(() => {
    let live = true;
    if (kindSlugs.length === 0) {
      setKinds({});
      setError(null);
      return;
    }
    void loadKindSources(kindSlugs).then((result) => {
      if (!live) return;
      setKinds(result.kinds);
      setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [kindSlugs]);

  return { kinds, error };
}

// ---------------------------------------------------------------------------
// The default arrangement
// ---------------------------------------------------------------------------

export interface ServedInputFieldsProps {
  inputs: readonly ServedInput[];
  values: Record<string, unknown>;
  /** VALUES OUT. The host decides what a value means. */
  onChange: (name: string, value: unknown) => void;
  /** Copy above the fields; the surface itself never carries page chrome. */
  heading?: string;
  /** Names to mark as blocking, computed by the host from its own gate. */
  flaggedNames?: ReadonlySet<string>;
  /** Shown when the surface declares nothing. */
  emptyMessage?: string;
  /** The host already screams about the kind registry (it holds the hook). */
  kinds?: Record<string, VariantResolvableKind>;
  className?: string;
}

export function ServedInputFields({
  inputs,
  values,
  onChange,
  heading = "What it needs from you",
  flaggedNames,
  emptyMessage = "This workflow declares no inputs — it starts with one click.",
  kinds: hoistedKinds,
  className,
}: ServedInputFieldsProps) {
  // A host that renders the fields and nothing else should not also have to
  // load the registry; one that wants the error text hoists the hook itself.
  const own = useServedInputKinds(hoistedKinds ? EMPTY_SERVED_INPUTS : inputs);
  const kinds = hoistedKinds ?? own.kinds;

  const [showOptional, setShowOptional] = useState(false);
  const { ask, require: required, optional } = partitionBySourcing(inputs);

  if (inputs.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className={className}>
      {heading ? (
        <h2 className="text-sm font-medium text-foreground">{heading}</h2>
      ) : null}
      <div className={cn("space-y-3", heading && "mt-2")}>
        {[...ask, ...required].map((input) => (
          <ServedField
            key={input.name}
            input={input}
            kind={kinds[input.kind]}
            value={values[input.name]}
            onChange={(v) => onChange(input.name, v)}
            flagged={flaggedNames?.has(input.name) ?? false}
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
                  onChange={(v) => onChange(input.name, v)}
                  flagged={false}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One input, with the standard card chrome
// ---------------------------------------------------------------------------

export function ServedField({
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
      <ServedFieldControl
        input={input}
        kind={kind}
        value={value}
        onChange={onChange}
        className={input.readOnly || input.pinned ? "mt-1.5" : "mt-1"}
      />
    </div>
  );
}

/**
 * ONE input's control, with no chrome of its own — the served twin of the
 * legacy `RunFormFieldControl`. A host with a bespoke presentation (label,
 * grid, help placement) renders this and keeps its own arrangement; it never
 * hand-picks a component, because the ladder lives here.
 */
export function ServedFieldControl({
  input,
  kind,
  value,
  onChange,
  className,
}: {
  input: ServedInput;
  kind: VariantResolvableKind | undefined;
  value: unknown;
  onChange: (v: unknown) => void;
  className?: string;
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
    <div className={className}>
      {readOnly ? (
        <div>
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
        <VariableInputComponent
          value={value}
          onChange={onChange}
          variableName={input.label || input.name}
          customComponent={resolution.component}
          helpText={input.help || undefined}
          hideLabel
          compact
        />
      ) : (
        // The kind registers a DB-authored renderer for this variant. Routing
        // those is the kind host's job, not this form's — screaming beats
        // silently substituting a textarea for a component that promised more.
        <ServedFormScream
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
            <code className="font-mono">{resolution.unregisteredVariant}</code>,
            which kind <code className="font-mono">{input.kind}</code> does not
            register — rendered with its{" "}
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

export function SourcingBadge({ input }: { input: ServedInput }) {
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

/** The loud band. A degraded served surface always says so out loud. */
export function ServedFormScream({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
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
