"use client";

/**
 * Gate tab — runs the REAL dual gate (`registry/kind-dual-gate.ts`, the
 * activation law) in the browser against a selected `kind_example` row or a
 * pasted sample, and shows both legs with their failure detail:
 *
 *   structural — ajv over `emitted_json_schema` (Pydantic-parity leg)
 *   render     — the legacy bridge must produce real serverData (UI leg)
 *
 * READ-ONLY by design (v1): this page never writes `is_active` — it shows
 * what the gate WOULD decide. Loaded via next/dynamic({ ssr:false }) behind
 * its tab so ajv stays out of the page's initial chunk.
 */

import { useState } from "react";
import { Check, CircleAlert, Info, Play, X } from "lucide-react";
import {
  describeDualGateFailure,
  runKindDualGate,
  validateStructuralLeg,
  type DualGateDefinition,
  type LegResult,
} from "@/features/content-ir/registry/kind-dual-gate";
import { kindRegistry } from "@/features/content-ir/registry/kind-registry";
import type { Json } from "@/types/database.types";
import type { ExamplesState } from "@/features/content-ir/admin/KindDetailClient";

const PASTED = "__pasted__";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface GateRun {
  ranAgainst: string;
  structural: LegResult;
  /** null = not runnable (sample is not an object — no block render path). */
  render: LegResult | null;
  wouldActivate: boolean;
  failureSummary: string;
}

/** Pure gate execution — the dual gate itself is synchronous, so the
 * canonical example's verdict is computed during render (no effect) and a
 * manual "Run gate now" simply stores a fresh run. */
function computeGateRun(
  kind: string,
  sample: unknown,
  ranAgainst: string,
  emittedJsonSchema: Json | null,
): GateRun {
  const def = kindRegistry.getDefinition(kind);
  const gateDefinition: DualGateDefinition | null = def
    ? {
        legacyBlockType: def.legacyBlockType,
        toLegacyServerData: def.toLegacyServerData,
        component: def.component,
      }
    : null;

  if (isRecord(sample)) {
    const result = runKindDualGate({
      kind,
      sample,
      emittedJsonSchema,
      definition: gateDefinition,
    });
    return {
      ranAgainst,
      structural: result.structural,
      render: result.render,
      wouldActivate: result.isActive,
      failureSummary: describeDualGateFailure(kind, result),
    };
  }

  // Scalar/array samples (workflow I/O kinds): only the structural leg is
  // runnable — there is no block render path to exercise.
  const structural = validateStructuralLeg(sample, emittedJsonSchema);
  return {
    ranAgainst,
    structural,
    render: null,
    wouldActivate: false,
    failureSummary: structural.ok
      ? `kind "${kind}" sample is not an object — the render leg cannot run, so the dual gate cannot pass`
      : `structural(Pydantic): ${structural.detail ?? "failed"}`,
  };
}

interface KindGateTabProps {
  kind: string;
  emittedJsonSchema: Json | null;
  examples: ExamplesState;
}

export default function KindGateTab({
  kind,
  emittedJsonSchema,
  examples,
}: KindGateTabProps) {
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [manualRun, setManualRun] = useState<GateRun | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);

  const rows = examples.status === "ready" ? examples.rows : [];
  const selectedId = sourceId ?? rows[0]?.id ?? PASTED;

  // The canonical example's verdict, computed during render (rows come
  // canonical-first from the shell's fetch). A manual run supersedes it.
  const autoRun =
    rows.length > 0
      ? computeGateRun(
          kind,
          rows[0].data,
          rows[0].isCanonical
            ? "canonical example"
            : `example ${rows[0].id.slice(0, 8)}`,
          emittedJsonSchema,
        )
      : null;
  const run = manualRun ?? autoRun;

  function runNow() {
    setInputError(null);
    if (selectedId === PASTED) {
      if (!pasted.trim()) {
        setInputError("Paste a JSON sample first.");
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(pasted);
      } catch (err) {
        setInputError(
          `Pasted sample is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
      setManualRun(computeGateRun(kind, parsed, "pasted sample", emittedJsonSchema));
      return;
    }
    const row = rows.find((r) => r.id === selectedId);
    if (!row) {
      setInputError("Selected example no longer exists.");
      return;
    }
    setManualRun(
      computeGateRun(
        kind,
        row.data,
        row.isCanonical ? "canonical example" : `example ${row.id.slice(0, 8)}`,
        emittedJsonSchema,
      ),
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      {/* Sample source */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted-foreground" htmlFor="gate-sample-source">
          Sample
        </label>
        <select
          id="gate-sample-source"
          value={selectedId}
          onChange={(e) => setSourceId(e.target.value)}
          className="h-8 rounded-md border border-border bg-card px-2 text-sm text-foreground"
        >
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.isCanonical ? "canonical" : r.source} ·{" "}
              {r.label ?? r.id.slice(0, 8)} · {r.validationStatus}
            </option>
          ))}
          <option value={PASTED}>Pasted JSON</option>
        </select>
        <button
          type="button"
          onClick={runNow}
          className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Play className="h-3.5 w-3.5" />
          Run gate now
        </button>
        <span className="text-[11px] text-muted-foreground">
          Read-only — this page never writes is_active.
        </span>
      </div>

      {examples.status === "error" && (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          <CircleAlert className="h-3.5 w-3.5 shrink-0" />
          {examples.message} — paste a sample to run the gate anyway.
        </div>
      )}

      {selectedId === PASTED && (
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder={`{ "__kind": "${kind}", ... }`}
          spellCheck={false}
          className="h-48 w-full rounded-md border border-border bg-card p-2 font-mono text-xs text-foreground"
        />
      )}

      {inputError && (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          <CircleAlert className="h-3.5 w-3.5 shrink-0" />
          {inputError}
        </div>
      )}

      {emittedJsonSchema === null && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <Info className="h-3.5 w-3.5 shrink-0" />
          This kind has no emitted_json_schema — the structural leg will fail
          until the schema is materialized.
        </div>
      )}

      {/* Legs */}
      {run && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <LegCard
              title="Structural leg"
              subtitle="ajv over emitted_json_schema — Pydantic-parity"
              leg={run.structural}
            />
            <LegCard
              title="Render leg"
              subtitle="legacy bridge must produce real serverData — UI leg"
              leg={run.render}
            />
          </div>

          <div
            className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
              run.wouldActivate
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                : "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300"
            }`}
          >
            {run.wouldActivate ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <X className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <div>
              <p className="font-medium">
                Dual-gate verdict against {run.ranAgainst}: would set is_active
                = {String(run.wouldActivate)}
              </p>
              {!run.wouldActivate && run.failureSummary && (
                <p className="mt-0.5 font-mono text-xs opacity-90">
                  {run.failureSummary}
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {examples.status === "loading" && !run && (
        <p className="text-xs text-muted-foreground">
          Waiting for kind_example rows — or pick &quot;Pasted JSON&quot; to run
          against your own sample.
        </p>
      )}
    </div>
  );
}

function LegCard({
  title,
  subtitle,
  leg,
}: {
  title: string;
  subtitle: string;
  leg: LegResult | null;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        {leg === null ? (
          <Info className="h-4 w-4 text-muted-foreground" />
        ) : leg.ok ? (
          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <X className="h-4 w-4 text-red-500" />
        )}
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span
          className={`ml-auto rounded px-1.5 py-0.5 text-[11px] font-medium ${
            leg === null
              ? "bg-muted text-muted-foreground"
              : leg.ok
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "bg-red-500/10 text-red-700 dark:text-red-300"
          }`}
        >
          {leg === null ? "not runnable" : leg.ok ? "pass" : "fail"}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
      <p className="mt-2 font-mono text-xs text-foreground">
        {leg === null
          ? "Sample is not an object — no block render path to exercise."
          : (leg.detail ?? (leg.ok ? "passed" : "failed"))}
      </p>
    </div>
  );
}
