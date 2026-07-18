"use client";

/**
 * KindInputForm — the canonical D1 input component: collect a valid instance
 * of any registered kind from a human.
 *
 * WIRING JOB, NOT A FORM BUILDER (SHAPE_SYSTEM.md posture: "the form system is
 * production — the input-component asset is a bridge to it, never a new form
 * builder"). Every layer here is an existing primitive:
 *
 *   resolve   → `resolveComponent(kind, "web", "input")` (R1 resolver; compiled
 *               floor in system-components.ts, DB `kind_component` overrides)
 *   route     → `decideKindInputPath` (./kind-input-resolution.ts — the pure law)
 *   schema    → `getKindInputContractBySlug` (fields + emitted_json_schema)
 *   bridge    → `kindFieldsToVariableDefinitions` (R5, convert/kind-variable-bridge)
 *   render    → the production `VariableInputComponent` — the agent runner's own
 *               inputs; nested/structured fields are the bridge's documented
 *               structured-JSON textarea v1, never a fake sub-form
 *   assemble  → `assembleKindInstance` (./kind-input-values.ts)
 *   validate  → `validateStructuralLeg` (registry/kind-dual-gate.ts — the REAL
 *               activation-gate ajv leg with its `__kind`-strip semantics)
 *   emit      → `onSubmit(instance)` — only after the structural leg passes
 *
 * Kinds with no stored field list (python-owned, non-object roots) fall back to
 * ONE whole-instance JSON textarea validated against `emitted_json_schema` —
 * the documented "instance-json" mode, same honesty posture as the bridge.
 *
 * Refusals are LOUD: an unknown kind, a missing/inactive input binding, or an
 * unrouted dedicated component key renders an explicit error card AND reports
 * through `captureError` (source "content-ir"). Never a guessed form.
 *
 * HEAVY (ajv via kind-dual-gate + the production input stack) — consumers load
 * it with `next/dynamic({ ssr: false })`, as the admin Try-input tab does.
 */

import { useEffect, useState } from "react";
import { CircleAlert, Loader2, Send, X } from "lucide-react";
import { VariableInputComponent } from "@/features/agents/components/inputs/input-components/VariableInputComponent";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { KIND_KEY, type KindSchema } from "../core/kind-schema.types";
import {
  componentRegistry,
  resolveComponent,
} from "../registry/component-registry";
import { validateStructuralLeg } from "../registry/kind-dual-gate";
import { getKindInputContractBySlug } from "../registry/schema-source-kind-tables";
import type { Json } from "@/types/database.types";
import { decideKindInputPath, type KindInputPath } from "./kind-input-resolution";
import {
  assembleKindInstance,
  attributeStructuralErrors,
  fieldTypeLabel,
  initialValuesForVariables,
  initialValuesFromInstance,
  pairKindFieldsWithVariables,
  type KindInputPair,
} from "./kind-input-values";

export interface KindInputFormProps {
  /** Canonical kind slug — the form resolves everything else from it. */
  kind: string;
  /**
   * Receives the schema-valid canonical instance: the `__kind`-stamped object
   * in bridged-form mode; in instance-json mode the parsed value (stamped when
   * it is a plain object — non-object roots pass through unstamped, since a
   * scalar has no key to carry identity). Never called with an invalid value.
   */
  onSubmit: (instance: unknown) => void | Promise<void>;
  submitLabel?: string;
  onCancel?: () => void;
  /**
   * Prefill the form from an existing instance value (edit flows). In
   * bridged-form mode each field is seeded via `initialValuesFromInstance`
   * (the exact coercion inverse); in instance-json mode the JSON draft is
   * seeded with the pretty-printed value. A root `__kind` is ignored either
   * way. Read once per kind load — not a controlled value.
   */
  initialValue?: unknown;
}

type FormState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "refused"; reason: string }
  | {
      status: "ready";
      path: Exclude<KindInputPath, { mode: "refused" }>;
      schema: KindSchema | null;
      emittedJsonSchema: Json | null;
      pairs: KindInputPair[];
    };

function refusalMessage(kind: string, detail: string): string {
  return `KindInputForm refused kind "${kind}": ${detail}`;
}

export default function KindInputForm({
  kind,
  onSubmit,
  submitLabel = "Submit",
  onCancel,
  initialValue,
}: KindInputFormProps) {
  const [state, setState] = useState<FormState>({ status: "loading" });
  // Bridged-form draft, keyed by VARIABLE name (what the inputs collect).
  const [values, setValues] = useState<Record<string, unknown>>({});
  // Instance-json draft.
  const [jsonDraft, setJsonDraft] = useState("");
  // Submit-time verdicts.
  const [structuralDetail, setStructuralDetail] = useState<string | null>(null);
  const [coercionErrors, setCoercionErrors] = useState<Record<string, string>>({});
  const [jsonParseError, setJsonParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // A kind switch resets the whole form. Render-phase state adjustment (the
  // React prop-sync pattern), not an effect — the effect below only LOADS.
  const [syncedKind, setSyncedKind] = useState(kind);
  if (syncedKind !== kind) {
    setSyncedKind(kind);
    setState({ status: "loading" });
    setStructuralDetail(null);
    setCoercionErrors({});
    setJsonParseError(null);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Warm the resolver so DB input bindings (workflow I/O kinds have no
        // compiled floor) are visible; the compiled floor answers regardless.
        await componentRegistry.ensureWarm().catch(() => undefined);
        const contract = await getKindInputContractBySlug(kind);
        if (cancelled) return;
        if (!contract) {
          const reason = `unknown kind — no content_ir.kind_definition row for "${kind}".`;
          captureError({
            source: "content-ir",
            message: refusalMessage(kind, reason),
          });
          setState({ status: "refused", reason });
          return;
        }
        const path = decideKindInputPath(
          kind,
          resolveComponent(kind, "web", "input"),
          contract.schema,
          contract.dataOnly,
        );
        if (path.mode === "refused") {
          captureError({
            source: "content-ir",
            message: refusalMessage(kind, path.reason),
          });
          setState({ status: "refused", reason: path.reason });
          return;
        }
        const pairs =
          path.mode === "bridged-form" && contract.schema
            ? pairKindFieldsWithVariables(contract.schema)
            : [];
        // Prefill (edit flows): seed from the instance value when provided —
        // the exact coercion inverse per field; JSON draft otherwise.
        const seed =
          initialValue !== null &&
          typeof initialValue === "object" &&
          !Array.isArray(initialValue)
            ? (initialValue as Record<string, unknown>)
            : null;
        setValues(
          seed && path.mode === "bridged-form"
            ? initialValuesFromInstance(pairs, seed)
            : initialValuesForVariables(pairs.map((p) => p.variable)),
        );
        setJsonDraft(
          path.mode === "instance-json" && initialValue !== undefined
            ? JSON.stringify(initialValue, null, 2)
            : "",
        );
        setState({
          status: "ready",
          path,
          schema: contract.schema,
          emittedJsonSchema: contract.emittedJsonSchema,
          pairs,
        });
      } catch (error) {
        if (cancelled) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, initialValue]);

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Resolving input path for {kind}</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300">
        <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Failed to load the input contract for &quot;{kind}&quot;: {state.message}
      </div>
    );
  }

  if (state.status === "refused") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300">
        <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          No input path for <code className="font-mono">{kind}</code> —{" "}
          {state.reason}
        </span>
      </div>
    );
  }

  const { path, emittedJsonSchema, pairs } = state;
  const schemaMissing = emittedJsonSchema === null;

  async function emit(instance: unknown): Promise<void> {
    const leg = validateStructuralLeg(instance, emittedJsonSchema);
    if (!leg.ok) {
      setStructuralDetail(leg.detail ?? "failed");
      return;
    }
    setStructuralDetail(null);
    setSubmitting(true);
    try {
      await onSubmit(instance);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitBridgedForm(): Promise<void> {
    const assembled = assembleKindInstance(kind, pairs, values);
    setCoercionErrors(assembled.coercionErrors);
    if (Object.keys(assembled.coercionErrors).length > 0) {
      setStructuralDetail(null);
      return;
    }
    await emit(assembled.instance);
  }

  async function submitInstanceJson(): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonDraft) as unknown;
    } catch (error) {
      setJsonParseError(error instanceof Error ? error.message : String(error));
      return;
    }
    setJsonParseError(null);
    const instance =
      parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? { [KIND_KEY]: kind, ...(parsed as Record<string, unknown>) }
        : parsed;
    await emit(instance);
  }

  const attributed = attributeStructuralErrors(
    structuralDetail ?? undefined,
    pairs.map((pair) => pair.fieldKey),
  );

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void (path.mode === "bridged-form"
          ? submitBridgedForm()
          : submitInstanceJson());
      }}
    >
      {schemaMissing && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This kind has no emitted_json_schema — instances cannot be validated,
          so submission is disabled until the schema is materialized.
        </div>
      )}

      {path.mode === "bridged-form" ? (
        <div className="space-y-4">
          {pairs.map((pair) => {
            const fieldErrors = attributed.byField[pair.fieldKey] ?? [];
            const coercionError = coercionErrors[pair.fieldKey];
            return (
              <div key={pair.fieldKey} className="space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                    {pair.fieldKey}
                  </code>
                  <span className="text-[11px] text-muted-foreground">
                    {fieldTypeLabel(pair.field)}
                  </span>
                  {pair.field.required && (
                    <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200">
                      required
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
      ) : (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">
              Whole-instance JSON — this kind stores no field list (python-owned
              or non-object root), so the instance is authored directly and
              validated against its emitted schema.
            </span>
          </div>
          <textarea
            value={jsonDraft}
            onChange={(event) => setJsonDraft(event.target.value)}
            spellCheck={false}
            rows={10}
            className="w-full rounded-md border border-border bg-card p-2 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={`JSON instance of "${kind}"`}
          />
          {jsonParseError && (
            <p className="flex items-start gap-1.5 text-[11px] text-red-700 dark:text-red-300">
              <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              Not valid JSON: {jsonParseError}
            </p>
          )}
        </div>
      )}

      {/* Unattributed / form-level structural errors, verbatim — attribution is
          best-effort string parsing and must never be the only view. */}
      {structuralDetail && (
        <div className="space-y-0.5 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2">
          <p className="text-[11px] font-medium text-red-700 dark:text-red-300">
            The assembled instance failed the structural leg (ajv over
            emitted_json_schema):
          </p>
          {(attributed.formLevel.length > 0
            ? attributed.formLevel
            : [structuralDetail]
          ).map((message) => (
            <p
              key={message}
              className="font-mono text-[11px] text-red-700 dark:text-red-300"
            >
              {message}
            </p>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting || schemaMissing}
          className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex h-8 items-center rounded-md border border-border px-3 text-xs text-foreground transition-colors hover:bg-accent"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
