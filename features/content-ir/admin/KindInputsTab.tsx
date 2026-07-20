"use client";

/**
 * Inputs tab — the first real consumer of the R5 kind ⇄ agent-spec bridge
 * (`convert/kind-variable-bridge.ts`).
 *
 * It proves the converter end-to-end, in one screen, with nothing faked:
 *
 *   1. FORWARD  — `kindFieldsToVariableDefinitions(schema)` turns the kind's
 *      fields into agent `VariableDefinition[]`, rendered by the PRODUCTION
 *      `VariableInputComponent` (the same component the agent runner uses).
 *   2. INSPECT  — the derived definitions as copyable JSON.
 *   3. REVERSE  — `variableDefinitionsToKindFields(vars)` walks back, and BOTH
 *      honesty channels are shown side by side: the converter's own `losses[]`
 *      AND a before/after type-drift table (the forward flattenings that
 *      `losses[]` structurally cannot see — see `kind-input-values.ts`).
 *   4. VALIDATE — the live form values are assembled into a `__kind` instance
 *      and run through `validateStructuralLeg` (the REAL activation-gate ajv
 *      leg, not a parallel validator), pass/fail with per-field errors.
 *
 * Loaded via `next/dynamic({ ssr: false })` from KindDetailClient: it pulls in
 * ajv (through kind-dual-gate) and the whole production input stack (through
 * VariableInputComponent → ProTextarea), neither of which belongs in the
 * page's initial chunk.
 *
 * READ-ONLY: this tab never writes a kind, an example, or `is_active`.
 */

import { useEffect, useState } from "react";
import {
  ArrowRightLeft,
  Check,
  CircleAlert,
  Copy,
  Info,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { VariableInputComponent } from "@/features/agents/components/inputs/input-components/VariableInputComponent";
import {
  kindFieldsToVariableDefinitions,
  variableDefinitionsToKindFields,
} from "@/features/content-ir/convert/kind-variable-bridge";
import { validateStructuralLeg } from "@/features/content-ir/registry/kind-dual-gate";
import { getKindSchemaBySlugFromTables } from "@/features/content-ir/registry/schema-source-kind-tables";
import type { KindSchema } from "@/features/content-ir/core/kind-schema.types";
import type { Json } from "@/types/database.types";
import {
  assembleKindInstance,
  attributeStructuralErrors,
  describeRoundTripDrift,
  fieldTypeLabel,
  initialValuesForVariables,
  pairKindFieldsWithVariables,
} from "@/features/content-ir/input/kind-input-values";

type SchemaState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "missing" }
  | { status: "ready"; schema: KindSchema };

interface KindInputsTabProps {
  kind: string;
  emittedJsonSchema: Json | null;
}

async function copyJson(label: string, text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${label}`);
  } catch (error) {
    toast.error(
      `Clipboard copy failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export default function KindInputsTab({
  kind,
  emittedJsonSchema,
}: KindInputsTabProps) {
  const [schemaState, setSchemaState] = useState<SchemaState>({
    status: "loading",
  });
  const [values, setValues] = useState<Record<string, unknown>>({});
  // Bumping this reseeds the form from the bridge's defaultValues.
  const [resetNonce, setResetNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // The canonical schema read: kind_definition.data + kind_edge,
        // reconstructed by the round-trip-proven storageToKindSchema. The
        // page's server payload carries `data` but not the edges, so `object`
        // / `array` fields could not be resolved from it.
        const schema = await getKindSchemaBySlugFromTables(kind);
        if (cancelled) return;
        if (!schema) {
          setSchemaState({ status: "missing" });
          return;
        }
        setSchemaState({ status: "ready", schema });
        setValues(
          initialValuesForVariables(kindFieldsToVariableDefinitions(schema)),
        );
      } catch (error) {
        if (cancelled) return;
        setSchemaState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, resetNonce]);

  if (schemaState.status === "loading") {
    return (
      <div className="flex items-center gap-2 py-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading kind schema</span>
      </div>
    );
  }

  if (schemaState.status === "error") {
    return (
      <div className="mx-auto flex max-w-4xl items-center gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300">
        <CircleAlert className="h-3.5 w-3.5 shrink-0" />
        Failed to reconstruct the kind schema: {schemaState.message}
      </div>
    );
  }

  if (schemaState.status === "missing") {
    return (
      <div className="mx-auto flex max-w-4xl items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
        <Info className="h-3.5 w-3.5 shrink-0" />
        No stored field list for &quot;{kind}&quot; — python-owned kinds derive
        their schema from the pydantic mirror, so the bridge has no fields to
        convert.
      </div>
    );
  }

  const { schema } = schemaState;
  const pairs = pairKindFieldsWithVariables(schema);
  const variables = pairs.map((pair) => pair.variable);
  const roundTrip = variableDefinitionsToKindFields(variables);
  const drift = describeRoundTripDrift(pairs, roundTrip.fields);
  const driftedCount = drift.filter((row) => row.changed).length;

  const assembled = assembleKindInstance(schema.kind, pairs, values);
  const instanceText = JSON.stringify(assembled.instance, null, 2);
  const variablesText = JSON.stringify(variables, null, 2);
  const reconstructedText = JSON.stringify(roundTrip.fields, null, 2);

  const leg = validateStructuralLeg(assembled.instance, emittedJsonSchema);
  const attributed = attributeStructuralErrors(
    leg.ok ? undefined : leg.detail,
    pairs.map((pair) => pair.fieldKey),
  );

  const hasCoercionErrors = Object.keys(assembled.coercionErrors).length > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-3">
      {/* Explainer */}
      <div className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        <ArrowRightLeft className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          <span className="font-medium text-foreground">
            {Object.keys(schema.fields).length} kind fields
          </span>{" "}
          converted to{" "}
          <span className="font-medium text-foreground">
            {variables.length} agent variables
          </span>{" "}
          by <code className="font-mono">kindFieldsToVariableDefinitions</code>,
          rendered below with the production{" "}
          <code className="font-mono">VariableInputComponent</code>. Values are
          assembled into a <code className="font-mono">__kind</code> instance and
          validated by <code className="font-mono">validateStructuralLeg</code> —
          the same ajv leg the activation gate runs. Read-only: nothing here is
          persisted.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* ---------------------------------------------------------------- */}
        {/* LEFT — the live derived form                                     */}
        {/* ---------------------------------------------------------------- */}
        <section className="rounded-md border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <span className="text-sm font-semibold text-foreground">
              Derived input form
            </span>
            <span className="text-[11px] text-muted-foreground">
              production VariableInputComponent
            </span>
            <button
              type="button"
              onClick={() => setResetNonce((n) => n + 1)}
              className="ml-auto flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-foreground transition-colors hover:bg-accent"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to defaults
            </button>
          </div>

          <div className="space-y-4 p-3">
            {pairs.length === 0 && (
              <p className="text-xs text-muted-foreground">
                This kind declares no fields — nothing to convert.
              </p>
            )}

            {pairs.map((pair) => {
              const componentType =
                pair.variable.customComponent?.type ?? "textarea";
              const fieldErrors = attributed.byField[pair.fieldKey] ?? [];
              const coercionError = assembled.coercionErrors[pair.fieldKey];
              return (
                <div key={pair.fieldKey} className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                      {pair.fieldKey}
                    </code>
                    <span className="text-[11px] text-muted-foreground">
                      {fieldTypeLabel(pair.field)}
                    </span>
                    <span className="text-[11px] text-muted-foreground">→</span>
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary">
                      {componentType}
                    </span>
                    {pair.field.required && (
                      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200">
                        required
                      </span>
                    )}
                    {pair.renamed && (
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        renamed → {pair.variable.name}
                      </span>
                    )}
                  </div>

                  <VariableInputComponent
                    value={values[pair.variable.name]}
                    onChange={(next) =>
                      setValues((prev) => ({
                        ...prev,
                        [pair.variable.name]: next,
                      }))
                    }
                    variableName={pair.variable.name}
                    customComponent={pair.variable.customComponent}
                    helpText={pair.variable.helpText}
                    hideLabel
                    compact
                  />

                  {coercionError && (
                    <p className="flex items-start gap-1.5 text-[11px] text-red-700 dark:text-red-300">
                      <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>
                        Cannot coerce to{" "}
                        <code className="font-mono">{pair.field.type}</code>:{" "}
                        {coercionError}
                      </span>
                    </p>
                  )}

                  {fieldErrors.map((message) => (
                    <p
                      key={message}
                      className="flex items-start gap-1.5 font-mono text-[11px] text-red-700 dark:text-red-300"
                    >
                      <X className="mt-0.5 h-3 w-3 shrink-0" />
                      {message}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* RIGHT — inspect, round-trip, validate                            */}
        {/* ---------------------------------------------------------------- */}
        <div className="space-y-3">
          {/* Round-trip honesty — the load-bearing panel */}
          <section className="rounded-md border border-border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
              <span className="text-sm font-semibold text-foreground">
                Round trip
              </span>
              <span className="text-[11px] text-muted-foreground">
                variableDefinitionsToKindFields
              </span>
              <span
                className={`ml-auto rounded px-1.5 py-0.5 text-[11px] font-medium ${
                  roundTrip.losses.length === 0 && driftedCount === 0
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "bg-amber-500/10 text-amber-800 dark:text-amber-200"
                }`}
              >
                {roundTrip.losses.length} losses · {driftedCount} type drift
              </span>
            </div>

            {/* Channel 1 — the converter's own loss report */}
            <div className="border-b border-border px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                losses[] — value-domain narrowings
              </p>
              {roundTrip.losses.length === 0 ? (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  None. The reverse converter narrowed no value domains.
                </p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {roundTrip.losses.map((loss) => (
                    <li
                      key={`${loss.name}:${loss.reason}`}
                      className="flex items-start gap-1.5 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[11px] text-amber-900 dark:text-amber-200"
                    >
                      <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>
                        <code className="font-mono font-medium">
                          {loss.name}
                        </code>{" "}
                        — {loss.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Channel 2 — forward flattenings losses[] cannot see */}
            <div className="px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Type drift — original vs reconstructed
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Forward flattenings (structured field → textarea) come back as{" "}
                <code className="font-mono">string</code> and are NOT recorded in{" "}
                <code className="font-mono">losses[]</code>. Only this comparison
                sees them.
              </p>
              <div className="mt-1.5 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-1 pr-2 font-medium">Field</th>
                      <th className="py-1 pr-2 font-medium">Original</th>
                      <th className="py-1 pr-2 font-medium">Reconstructed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drift.map((row) => (
                      <tr
                        key={row.fieldKey}
                        className="border-b border-border/60 last:border-0"
                      >
                        <td className="py-1 pr-2 font-mono text-[11px] text-foreground">
                          {row.fieldKey}
                        </td>
                        <td className="py-1 pr-2 text-[11px] text-muted-foreground">
                          {row.originalType}
                        </td>
                        <td
                          className={`py-1 pr-2 text-[11px] ${
                            row.changed
                              ? "font-medium text-amber-800 dark:text-amber-200"
                              : "text-muted-foreground"
                          }`}
                        >
                          {row.reconstructedType ?? "(field dropped)"}
                          {row.changed && " ← lossy"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Validation */}
          <section className="rounded-md border border-border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
              <span className="text-sm font-semibold text-foreground">
                Structural validation
              </span>
              <span className="text-[11px] text-muted-foreground">
                ajv over emitted_json_schema
              </span>
              <span
                className={`ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                  leg.ok
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "bg-red-500/10 text-red-700 dark:text-red-300"
                }`}
              >
                {leg.ok ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <X className="h-3 w-3" />
                )}
                {leg.ok ? "pass" : "fail"}
              </span>
            </div>

            <div className="space-y-1.5 px-3 py-2">
              {emittedJsonSchema === null && (
                <p className="flex items-start gap-1.5 text-[11px] text-amber-800 dark:text-amber-200">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  This kind has no emitted_json_schema — the structural leg
                  cannot pass until it is materialized.
                </p>
              )}

              {hasCoercionErrors && (
                <p className="flex items-start gap-1.5 text-[11px] text-red-700 dark:text-red-300">
                  <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                  {Object.keys(assembled.coercionErrors).length} field(s) could
                  not be coerced into kind space and were omitted from the
                  instance — see the form.
                </p>
              )}

              {assembled.omittedFields.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Omitted (blank):{" "}
                  <code className="font-mono">
                    {assembled.omittedFields.join(", ")}
                  </code>
                </p>
              )}

              {/* The raw validator output, verbatim — attribution above is
                  best-effort string parsing and must never be the only view. */}
              <p className="font-mono text-[11px] text-foreground">
                {leg.detail ?? (leg.ok ? "passed" : "failed")}
              </p>

              {attributed.formLevel.length > 0 && (
                <ul className="space-y-0.5">
                  {attributed.formLevel.map((message) => (
                    <li
                      key={message}
                      className="font-mono text-[11px] text-red-700 dark:text-red-300"
                    >
                      {message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Assembled instance */}
          <JsonPanel
            title="Assembled instance"
            subtitle="live form values, in kind space"
            text={instanceText}
            copyLabel={`${kind} instance`}
          />

          {/* Derived variable definitions */}
          <JsonPanel
            title="Derived VariableDefinition[]"
            subtitle="kindFieldsToVariableDefinitions output"
            text={variablesText}
            copyLabel={`${kind} VariableDefinition[]`}
          />

          {/* Reconstructed fields */}
          <JsonPanel
            title="Reconstructed kind fields"
            subtitle="variableDefinitionsToKindFields output"
            text={reconstructedText}
            copyLabel={`${kind} reconstructed fields`}
          />
        </div>
      </div>
    </div>
  );
}

function JsonPanel({
  title,
  subtitle,
  text,
  copyLabel,
}: {
  title: string;
  subtitle: string;
  text: string;
  copyLabel: string;
}) {
  return (
    <section className="rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="text-[11px] text-muted-foreground">{subtitle}</span>
        <button
          type="button"
          onClick={() => void copyJson(copyLabel, text)}
          className="ml-auto flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-foreground transition-colors hover:bg-accent"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy
        </button>
      </div>
      <details open>
        <summary className="cursor-pointer px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground">
          {text.length.toLocaleString()} chars — click to collapse
        </summary>
        <pre className="max-h-72 overflow-auto border-t border-border p-3 font-mono text-[11px] text-foreground">
          {text}
        </pre>
      </details>
    </section>
  );
}
