"use client";

import React from "react";
import { Copy } from "lucide-react";
import { KIND_KEY } from "@ai-matrx/content-ir";
import { outputSchemaKeys } from "@/features/mandates/output-contract";
import { writeClipboard } from "@/components/agent-copy/clipboard";
import { toast } from "@/lib/toast";
import { isJsonObject } from "@/types/json";

type StructuredValue = Record<string, unknown>;

const PROSE_KEYS = ["answer", "summary", "text", "message"] as const;
const NEXT_STEP_KEYS = ["next_step", "next_steps", "next_action"] as const;
const MIN_FALLBACK_PROSE_LENGTH = 40;

export interface StructuredAgentAnswerProps {
  value: StructuredValue;
  rawContent: string;
  renderMarkdown: (content: string) => React.ReactElement;
}

/**
 * The JSON-code floor may only claim a settled object when a conversation's
 * bound agent explicitly declares every key. Registered `__kind` payloads
 * remain owned by the kind route above this fallback.
 */
export function parseStructuredAgentAnswer(
  content: string,
  outputSchema: unknown,
): StructuredValue | null {
  const declaredKeys = outputSchemaKeys(outputSchema);
  if (declaredKeys.size === 0) return null;

  try {
    const parsed: unknown = JSON.parse(content);
    if (!isJsonObject(parsed) || KIND_KEY in parsed) return null;
    return Object.keys(parsed).every((key) => declaredKeys.has(key))
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/**
 * Status tone from the VALUE, read against a vocabulary — not against one
 * agent's enum. This block is the floor for EVERY schema-bound agent, so
 * hardcoding `done | blocked | needs_user` (the Sandbox Specialist's three
 * values) would give the next agent's "complete" / "failed" / "pending" a
 * grey pill that says nothing. Anything unrecognised stays neutral rather
 * than guessing a colour that would lie about the run.
 */
export function statusTone(
  value: string,
): "success" | "warning" | "danger" | "neutral" {
  const v = value.trim().toLowerCase();
  if (
    ["done", "complete", "completed", "success", "succeeded", "ok", "passed", "resolved", "healthy"].includes(v)
  ) {
    return "success";
  }
  if (
    ["blocked", "failed", "failure", "error", "fatal", "refused", "broken"].includes(v)
  ) {
    return "danger";
  }
  if (
    ["needs_user", "needs_input", "needs_review", "pending", "partial", "in_progress", "running", "waiting", "warning", "unknown"].includes(v)
  ) {
    return "warning";
  }
  return "neutral";
}

const STATUS_TONE_CLASS: Record<
  ReturnType<typeof statusTone>,
  string
> = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

/**
 * The raw payload keeps a Copy control. Before this block existed the JSON
 * rendered through `JsonBlock`, whose header carried Copy — replacing it with
 * a bare `<pre>` would have taken a working affordance away while making the
 * answer prettier. `writeClipboard` is the ONE clipboard implementation.
 */
function CopyRawButton({ rawContent }: { rawContent: string }) {
  return (
    <button
      type="button"
      aria-label="Copy raw JSON"
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void writeClipboard(rawContent).then(() => {
          toast.success("Raw answer copied");
        });
      }}
    >
      <Copy className="h-3.5 w-3.5" />
      Copy
    </button>
  );
}

function readableLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function selectProse(
  value: StructuredValue,
): { key: string; text: string } | null {
  for (const key of PROSE_KEYS) {
    const text = nonEmptyString(value[key]);
    if (text) return { key, text };
  }
  for (const [key, candidate] of Object.entries(value)) {
    const text = nonEmptyString(candidate);
    if (text && text.length >= MIN_FALLBACK_PROSE_LENGTH) return { key, text };
  }
  return null;
}

function selectStatus(
  value: StructuredValue,
): { key: string; text: string } | null {
  for (const key of ["state", "status"] as const) {
    const text = nonEmptyString(value[key]);
    if (text) return { key, text };
  }
  return null;
}

function selectNextStep(
  value: StructuredValue,
): { key: string; text: string } | null {
  for (const key of NEXT_STEP_KEYS) {
    const candidate = value[key];
    const text = nonEmptyString(candidate);
    if (text) return { key, text };
    if (Array.isArray(candidate)) {
      const steps = candidate
        .map(nonEmptyString)
        .filter((step): step is string => Boolean(step));
      if (steps.length) return { key, text: steps.join("\n") };
    }
  }
  return null;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string")
  );
}

function isSmallObjectArray(value: unknown): value is StructuredValue[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 12 &&
    value.every((item) => isJsonObject(item))
  );
}

function hasMeaningfulContent(value: StructuredValue): boolean {
  return (
    Boolean(
      selectProse(value) || selectStatus(value) || selectNextStep(value),
    ) ||
    Object.values(value).some(
      (item) => isStringArray(item) || isSmallObjectArray(item),
    )
  );
}

export function isRenderableStructuredAgentAnswer(
  value: StructuredValue,
): boolean {
  return hasMeaningfulContent(value);
}

export function StructuredAgentAnswerBlock({
  value,
  rawContent,
  renderMarkdown,
}: StructuredAgentAnswerProps) {
  const prose = selectProse(value);
  const status = selectStatus(value);
  const nextStep = selectNextStep(value);

  return (
    <div
      className="my-3 space-y-3"
      data-content-renderer="StructuredAgentAnswerBlock"
    >
      {prose ? renderMarkdown(prose.text) : null}
      {status ? (
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE_CLASS[statusTone(status.text)]}`}
        >
          {readableLabel(status.text)}
        </span>
      ) : null}
      {nextStep ? (
        <div className="border-l-2 border-primary/50 pl-3 text-sm">
          <p className="font-medium">Next step</p>
          <p className="whitespace-pre-line text-muted-foreground">
            {nextStep.text}
          </p>
        </div>
      ) : null}
      {Object.entries(value).map(([key, item]) => {
        if (
          key === KIND_KEY ||
          key === prose?.key ||
          key === status?.key ||
          key === nextStep?.key
        )
          return null;
        if (isStringArray(item)) {
          return (
            <div key={key} className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {readableLabel(key)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {item.map((entry) => (
                  <span
                    key={entry}
                    className="rounded-full bg-muted px-2 py-0.5 text-xs"
                  >
                    {entry}
                  </span>
                ))}
              </div>
            </div>
          );
        }
        if (isSmallObjectArray(item)) {
          const columns = Array.from(
            new Set(item.flatMap((row) => Object.keys(row))),
          ).slice(0, 6);
          return (
            <div key={key} className="overflow-x-auto">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {readableLabel(key)}
              </p>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {columns.map((column) => (
                      <th key={column} className="border-b p-2 font-medium">
                        {readableLabel(column)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {item.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {columns.map((column) => (
                        <td key={column} className="border-b p-2 align-top">
                          {typeof row[column] === "string"
                            ? row[column]
                            : JSON.stringify(row[column] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return null;
      })}
      <details className="text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-muted-foreground">
          Details
          <CopyRawButton rawContent={rawContent} />
        </summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">
          {rawContent}
        </pre>
      </details>
    </div>
  );
}
