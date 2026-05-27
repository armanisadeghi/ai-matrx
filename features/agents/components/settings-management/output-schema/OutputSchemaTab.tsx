"use client";

/**
 * OutputSchemaTab — edit the agent's structured-output schema
 * (`agx_agent.output_schema` → AgentDefinition.outputSchema).
 *
 * Self-contained: reads/writes Redux directly. Reuses the forgiving
 * SettingsJsonEditor for editing + Apply. The "Validate" button runs advisory
 * checks (validateOutputSchema) and shows a report — it NEVER changes the
 * schema and is never applied automatically.
 */

import { useState } from "react";
import {
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentOutputSchema } from "@/features/agents/redux/agent-definition/selectors";
import { setAgentOutputSchema } from "@/features/agents/redux/agent-definition/slice";
import type { OutputSchema } from "@/features/agents/types/json-schema";
import { SettingsJsonEditor } from "../json/SettingsJsonEditor";
import {
  validateOutputSchema,
  type OutputSchemaValidation,
} from "./validateOutputSchema";

// Shown only when the editor is empty — carries the "what is this" context so
// it doesn't take permanent vertical space, plus a starter shape.
const PLACEHOLDER = `Structured-output schema — saved to output_schema, applied when the model's Response Format is json_schema (set that on the Settings tab yourself). Editing here changes only the schema.

{
  "name": "response",
  "strict": true,
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "answer": { "type": "string" }
    },
    "required": ["answer"]
  }
}`;

interface OutputSchemaTabProps {
  agentId: string;
  /** Forwarded to the editor so the modal can warn about unapplied edits. */
  onDirtyChange?: (dirty: boolean) => void;
}

export function OutputSchemaTab({ agentId, onDirtyChange }: OutputSchemaTabProps) {
  const dispatch = useAppDispatch();
  const outputSchema = useAppSelector((state) =>
    selectAgentOutputSchema(state, agentId),
  );

  const initialText = outputSchema
    ? JSON.stringify(outputSchema, null, 2)
    : "";

  // Latest successfully-parsed buffer, captured from the editor so the Validate
  // button can inspect exactly what's on screen without applying it.
  const [parsed, setParsed] = useState<Record<string, unknown> | null>(
    // OutputSchema is a typed envelope ({name, description?, schema, strict?}) —
    // no string index signature, so it has no structural overlap with
    // Record<string, unknown>. The editor treats the whole serialized envelope
    // as a JSON dict (matches `initialText = JSON.stringify(outputSchema, …)`
    // above), which is safe at runtime; the cast goes through `unknown` as the
    // compiler requests.
    (outputSchema as unknown as Record<string, unknown> | null) ?? null,
  );
  const [report, setReport] = useState<OutputSchemaValidation | null>(null);

  const handleApply = (obj: Record<string, unknown>) => {
    // An empty object means "no schema" → clear it (returns unstructured text).
    const isEmpty = !obj || Object.keys(obj).length === 0;
    dispatch(
      setAgentOutputSchema({
        id: agentId,
        outputSchema: isEmpty ? null : (obj as unknown as OutputSchema),
      }),
    );
  };

  return (
    <div className="flex flex-col h-full gap-2">
      <SettingsJsonEditor
        initialValue={initialText}
        placeholder={PLACEHOLDER}
        onParse={setParsed}
        onApply={handleApply}
        onDirtyChange={onDirtyChange}
        fillHeight
      />

      {/* Validation tool — advisory only, never mutates or auto-applies. */}
      <div className="flex items-center gap-2 border-t border-border pt-2 flex-shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setReport(validateOutputSchema(parsed))}
          className="h-7 text-xs"
        >
          <ShieldCheck className="h-3.5 w-3.5 mr-1" />
          Validate
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Checks the schema and reports issues — it never changes or applies
          anything.
        </span>
      </div>

      {report && (
        <div className="flex-shrink-0 max-h-44 overflow-y-auto">
          <ValidationReport report={report} />
        </div>
      )}
    </div>
  );
}

function ValidationReport({ report }: { report: OutputSchemaValidation }) {
  const empty =
    report.errors.length === 0 &&
    report.warnings.length === 0 &&
    report.suggestions.length === 0;

  return (
    <div className="flex flex-col gap-2 text-xs">
      {report.ok && report.errors.length === 0 && (
        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {empty
            ? "Looks good — no issues found."
            : "No blocking errors — review the notes below."}
        </div>
      )}

      <ReportGroup
        title="Errors"
        items={report.errors}
        icon={<AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
        className="text-red-600 dark:text-red-400"
      />
      <ReportGroup
        title="Warnings"
        items={report.warnings}
        icon={<AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
        className="text-amber-600 dark:text-amber-400"
      />
      <ReportGroup
        title="Suggestions"
        items={report.suggestions}
        icon={<Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
        className="text-sky-600 dark:text-sky-400"
      />
    </div>
  );
}

function ReportGroup({
  title,
  items,
  icon,
  className,
}: {
  title: string;
  items: string[];
  icon: React.ReactNode;
  className: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <div
        className={`text-[10px] font-semibold uppercase tracking-wide ${className}`}
      >
        {title} ({items.length})
      </div>
      {items.map((msg, i) => (
        <div key={i} className={`flex items-start gap-1.5 ${className}`}>
          {icon}
          <span className="leading-snug">{msg}</span>
        </div>
      ))}
    </div>
  );
}
