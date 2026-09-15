"use client";

import React from "react";
import { KIND_KEY } from "@ai-matrx/content-ir";
import { outputSchemaKeys } from "@/features/mandates/output-contract";
import { isJsonObject } from "@/types/json";

type StructuredValue = Record<string, unknown>;

const PROSE_KEYS = ["answer", "summary", "text", "message"] as const;
const NEXT_STEP_KEYS = ["next_step", "next_steps", "next_action"] as const;
const MIN_FALLBACK_PROSE_LENGTH = 40;

export interface StructuredAgentAnswerProps {
  value: StructuredValue;
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
  renderMarkdown,
}: StructuredAgentAnswerProps) {
  const prose = selectProse(value);
  const status = selectStatus(value);
  const nextStep = selectNextStep(value);
  const claimed = new Set<string>();
  if (prose) claimed.add(prose.key);
  if (status) claimed.add(status.key);
  if (nextStep) claimed.add(nextStep.key);
  for (const [key, item] of Object.entries(value)) {
    if (isStringArray(item) || isSmallObjectArray(item)) claimed.add(key);
  }

  return (
    <div
      className="my-3 space-y-3"
      data-content-renderer="StructuredAgentAnswerBlock"
    >
      {prose ? renderMarkdown(prose.text) : null}
      {status ? (
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
            status.text === "done"
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : status.text === "blocked"
                ? "bg-red-500/15 text-red-700 dark:text-red-300"
                : status.text === "needs_user"
                  ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                  : "bg-muted text-muted-foreground"
          }`}
        >
          {status.text}
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
      {Object.keys(value).some((key) => !claimed.has(key)) ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Details
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">
            {JSON.stringify(
              Object.fromEntries(
                Object.entries(value).filter(([key]) => !claimed.has(key)),
              ),
              null,
              2,
            )}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
