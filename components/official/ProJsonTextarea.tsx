"use client";

import React, { useEffect, useMemo, useRef } from "react";
import Ajv, {
  type AnySchema,
  type ErrorObject,
  type Options as AjvOptions,
  type ValidateFunction,
} from "ajv";
import { AlertTriangle, CheckCircle2, Code2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ProTextarea,
  type ProTextareaProps,
} from "@/components/official/ProTextarea";
import type { ApplicationScope } from "@/features/agents/types/scope.types";

export type ProJsonIssueSeverity = "error" | "warning" | "info";
export type ProJsonIssueKind =
  | "parse"
  | "shape"
  | "unknown_key"
  | "schema"
  | "custom";

export interface ProJsonValidationIssue {
  kind: ProJsonIssueKind;
  severity: ProJsonIssueSeverity;
  message: string;
  path?: string;
  line?: number | null;
  column?: number | null;
  source?: string;
  details?: unknown;
}

export interface ProJsonValidationState {
  text: string;
  parsed: unknown | null;
  parseError: ProJsonValidationIssue | null;
  issues: ProJsonValidationIssue[];
  errors: ProJsonValidationIssue[];
  warnings: ProJsonValidationIssue[];
  isJson: boolean;
  isValid: boolean;
  isEmpty: boolean;
}

export type ProJsonValidator = (args: {
  text: string;
  parsed: unknown;
}) => ProJsonValidationIssue[];

export interface ProJsonTextareaProps
  extends Omit<ProTextareaProps, "value" | "onChange" | "getApplicationScope"> {
  value: string;
  onChange: React.ChangeEventHandler<HTMLTextAreaElement>;
  rootType?: "any" | "object" | "array";
  schema?: AnySchema;
  ajvOptions?: AjvOptions;
  allowedTopLevelKeys?: readonly string[];
  validators?: readonly ProJsonValidator[];
  onValidationChange?: (state: ProJsonValidationState) => void;
  showValidationPanel?: boolean;
  showFormatButton?: boolean;
  onParsedChange?: (parsed: unknown | null) => void;
  getApplicationScope?: (state: ProJsonValidationState) => ApplicationScope;
}

const DEFAULT_AJV_OPTIONS: AjvOptions = {
  allErrors: true,
  strict: false,
  allowUnionTypes: true,
};

function getJsonType(value: unknown): "null" | "array" | "object" | string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function lineColumnFromPosition(text: string, position: number) {
  const before = text.slice(0, Math.max(0, position));
  const lines = before.split("\n");
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

function parseJsonErrorLocation(message: string, text: string) {
  const lineColumnMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  if (lineColumnMatch) {
    return {
      line: Number(lineColumnMatch[1]),
      column: Number(lineColumnMatch[2]),
    };
  }

  const positionMatch = message.match(/position\s+(\d+)/i);
  if (positionMatch) {
    return lineColumnFromPosition(text, Number(positionMatch[1]));
  }

  return { line: null, column: null };
}

function pointerToParts(path: string): string[] {
  if (!path || path === "/") return [];
  return path
    .split("/")
    .slice(1)
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function findPathLine(text: string, path?: string): number | null {
  if (!path) return null;
  const parts = pointerToParts(path);
  const key = [...parts].reverse().find((part) => Number.isNaN(Number(part)));
  if (!key) return null;

  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^\\s*"${escaped}"\\s*:`);
  const lines = text.split("\n");
  const index = lines.findIndex((line) => pattern.test(line));
  return index >= 0 ? index + 1 : null;
}

function issuePathFromAjv(error: ErrorObject): string {
  if (error.keyword === "required") {
    const missing = (error.params as { missingProperty?: string })
      .missingProperty;
    return `${error.instancePath}/${missing ?? ""}`;
  }
  if (error.keyword === "additionalProperties") {
    const additional = (error.params as { additionalProperty?: string })
      .additionalProperty;
    return `${error.instancePath}/${additional ?? ""}`;
  }
  return error.instancePath;
}

function labelForPath(path?: string): string {
  if (!path) return "root";
  const parts = pointerToParts(path);
  return parts.length ? parts.join(".") : "root";
}

function normalizeIssue(
  issue: ProJsonValidationIssue,
): ProJsonValidationIssue {
  return {
    severity: "error",
    ...issue,
    line: issue.line ?? null,
    column: issue.column ?? null,
  };
}

function buildJsonValidationState({
  text,
  schema,
  schemaValidator,
  schemaCompileError,
  rootType,
  allowedTopLevelKeys,
  validators,
}: {
  text: string;
  schema?: AnySchema;
  schemaValidator?: ValidateFunction | null;
  schemaCompileError?: Error | null;
  rootType: "any" | "object" | "array";
  allowedTopLevelKeys?: readonly string[];
  validators?: readonly ProJsonValidator[];
}): ProJsonValidationState {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      text,
      parsed: null,
      parseError: null,
      issues: [],
      errors: [],
      warnings: [],
      isJson: false,
      isValid: true,
      isEmpty: true,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const location = parseJsonErrorLocation(message, text);
    const parseError = normalizeIssue({
      kind: "parse",
      severity: "error",
      message,
      line: location.line,
      column: location.column,
      source: "JSON.parse",
    });
    return {
      text,
      parsed: null,
      parseError,
      issues: [parseError],
      errors: [parseError],
      warnings: [],
      isJson: false,
      isValid: false,
      isEmpty: false,
    };
  }

  const issues: ProJsonValidationIssue[] = [];
  const actualType = getJsonType(parsed);

  if (rootType !== "any" && actualType !== rootType) {
    issues.push(
      normalizeIssue({
        kind: "shape",
        severity: "error",
        message: `Root value must be a JSON ${rootType}. Received ${actualType}.`,
        path: "",
        source: "rootType",
      }),
    );
  }

  if (
    allowedTopLevelKeys &&
    allowedTopLevelKeys.length > 0 &&
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed)
  ) {
    const allowed = new Set(allowedTopLevelKeys);
    for (const key of Object.keys(parsed as Record<string, unknown>)) {
      if (!allowed.has(key)) {
        const path = `/${key}`;
        issues.push(
          normalizeIssue({
            kind: "unknown_key",
            severity: "warning",
            message: `Unknown top-level key "${key}".`,
            path,
            line: findPathLine(text, path),
            source: "allowedTopLevelKeys",
          }),
        );
      }
    }
  }

  if (schema) {
    if (schemaCompileError) {
      issues.push(
        normalizeIssue({
          kind: "schema",
          severity: "error",
          message: `Schema could not be compiled: ${schemaCompileError.message}`,
          source: "schema",
        }),
      );
    } else if (schemaValidator) {
      schemaValidator(parsed);
      for (const error of schemaValidator.errors ?? []) {
        const path = issuePathFromAjv(error);
        issues.push(
          normalizeIssue({
            kind: "schema",
            severity: "error",
            message: `${labelForPath(path)} ${error.message ?? "failed schema validation"}`,
            path,
            line: findPathLine(text, path),
            source: `schema:${error.keyword}`,
            details: error.params,
          }),
        );
      }
    }
  }

  for (const validator of validators ?? []) {
    try {
      for (const issue of validator({ text, parsed })) {
        const normalized = normalizeIssue(issue);
        issues.push({
          ...normalized,
          line: normalized.line ?? findPathLine(text, normalized.path),
        });
      }
    } catch (error) {
      issues.push(
        normalizeIssue({
          kind: "custom",
          severity: "error",
          message:
            error instanceof Error
              ? `Custom validator failed: ${error.message}`
              : "Custom validator failed.",
          source: "custom",
        }),
      );
    }
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return {
    text,
    parsed,
    parseError: null,
    issues,
    errors,
    warnings,
    isJson: true,
    isValid: errors.length === 0,
    isEmpty: false,
  };
}

function defaultApplicationScope(
  text: string,
  state: ProJsonValidationState,
): ApplicationScope {
  return {
    content: text,
    json_text: text,
    json_valid: state.isValid,
    json_is_parseable: state.isJson,
    json_parsed: state.isJson ? state.parsed : null,
    json_issues: state.issues,
    context: {
      json: {
        isValid: state.isValid,
        isJson: state.isJson,
        errors: state.errors.length,
        warnings: state.warnings.length,
        issues: state.issues,
      },
    },
  };
}

function statusLabel(state: ProJsonValidationState) {
  if (state.isEmpty) return "Empty";
  if (state.errors.length > 0) return `${state.errors.length} error${state.errors.length === 1 ? "" : "s"}`;
  if (state.warnings.length > 0) {
    return `${state.warnings.length} warning${state.warnings.length === 1 ? "" : "s"}`;
  }
  return "Valid JSON";
}

function ValidationPanel({ state }: { state: ProJsonValidationState }) {
  if (state.isEmpty || state.issues.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
        {state.isEmpty ? "Validation will run as you type." : "No JSON issues found."}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {state.issues.map((issue, index) => (
        <IssueCard key={`${issue.kind}-${issue.path ?? "root"}-${index}`} issue={issue} text={state.text} />
      ))}
    </div>
  );
}

function IssueCard({
  issue,
  text,
}: {
  issue: ProJsonValidationIssue;
  text: string;
}) {
  const isError = issue.severity === "error";
  const lines = text.split("\n");
  const line = issue.line ?? null;
  const lineIndex = line != null ? line - 1 : -1;
  const start = lineIndex >= 0 ? Math.max(0, lineIndex - 2) : -1;
  const end = lineIndex >= 0 ? Math.min(lines.length - 1, lineIndex + 2) : -1;
  const visible = start >= 0 ? lines.slice(start, end + 1) : [];

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border text-[11px]",
        isError
          ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/20 dark:text-red-200"
          : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200",
      )}
    >
      <div
        className={cn(
          "flex items-start gap-2 border-b px-3 py-2",
          isError
            ? "border-red-200 dark:border-red-900/60"
            : "border-amber-200 dark:border-amber-900/60",
        )}
      >
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold">{issue.message}</span>
            {issue.path && (
              <code className="rounded bg-background/70 px-1 font-mono text-[10px]">
                {labelForPath(issue.path)}
              </code>
            )}
            {line != null && (
              <span className="text-[10px] opacity-80">
                line {line}
                {issue.column != null ? `, col ${issue.column}` : ""}
              </span>
            )}
          </div>
          {issue.source && (
            <p className="mt-0.5 text-[10px] opacity-75">{issue.source}</p>
          )}
        </div>
      </div>

      {visible.length > 0 && (
        <div className="overflow-x-auto bg-zinc-950 font-mono">
          {visible.map((lineText, offset) => {
            const absoluteIndex = start + offset;
            const active = absoluteIndex === lineIndex;
            return (
              <div
                key={absoluteIndex}
                className={cn("flex", active && (isError ? "bg-red-950/60" : "bg-amber-950/50"))}
              >
                <span
                  className={cn(
                    "w-10 shrink-0 select-none border-r py-0.5 pr-3 text-right",
                    active
                      ? isError
                        ? "border-red-800 bg-red-950/70 text-red-300"
                        : "border-amber-800 bg-amber-950/70 text-amber-300"
                      : "border-zinc-800 text-zinc-600",
                  )}
                >
                  {absoluteIndex + 1}
                </span>
                <span className={cn("flex-1 whitespace-pre px-3 py-0.5", active ? "text-white" : "text-zinc-300")}>
                  {lineText || " "}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const ProJsonTextarea = React.forwardRef<
  HTMLTextAreaElement,
  ProJsonTextareaProps
>(function ProJsonTextarea(
  {
    value,
    onChange,
    className,
    rootType = "any",
    schema,
    ajvOptions,
    allowedTopLevelKeys,
    validators,
    onValidationChange,
    showValidationPanel = true,
    showFormatButton = true,
    onParsedChange,
    getApplicationScope,
    surfaceContextItems,
    ...props
  },
  ref,
) {
  const compiledSchema = useMemo(
    () => {
      let schemaValidator: ValidateFunction | null = null;
      let schemaCompileError: Error | null = null;
      if (schema) {
        try {
          const ajv = new Ajv({ ...DEFAULT_AJV_OPTIONS, ...ajvOptions });
          schemaValidator = ajv.compile(schema);
        } catch (error) {
          schemaCompileError =
            error instanceof Error
              ? error
              : new Error("Schema could not be compiled.");
        }
      }

      return {
        schemaValidator,
        schemaCompileError,
      };
    },
    [ajvOptions, schema],
  );

  const validationState = useMemo(
    () =>
      buildJsonValidationState({
        text: value,
        schema,
        schemaValidator: compiledSchema.schemaValidator,
        schemaCompileError: compiledSchema.schemaCompileError,
        rootType,
        allowedTopLevelKeys,
        validators,
      }),
    [
      allowedTopLevelKeys,
      compiledSchema.schemaCompileError,
      compiledSchema.schemaValidator,
      rootType,
      schema,
      validators,
      value,
    ],
  );

  const validationSignature = useMemo(
    () =>
      JSON.stringify({
        text: validationState.text,
        isJson: validationState.isJson,
        isValid: validationState.isValid,
        issues: validationState.issues,
      }),
    [
      validationState.isJson,
      validationState.isValid,
      validationState.issues,
      validationState.text,
    ],
  );
  const lastValidationNotification = useRef<string | null>(null);

  useEffect(() => {
    if (!onValidationChange && !onParsedChange) return;
    if (lastValidationNotification.current === validationSignature) return;
    lastValidationNotification.current = validationSignature;
    onValidationChange?.(validationState);
    onParsedChange?.(validationState.isJson ? validationState.parsed : null);
  }, [
    onParsedChange,
    onValidationChange,
    validationSignature,
    validationState,
  ]);

  const handleFormat = () => {
    if (!validationState.isJson) {
      toast.error("JSON must be valid before formatting");
      return;
    }
    const next = JSON.stringify(validationState.parsed, null, 2);
    const target = document.createElement("textarea");
    target.value = next;
    onChange({
      target,
      currentTarget: target,
    } as React.ChangeEvent<HTMLTextAreaElement>);
    toast.success("JSON formatted");
  };

  const resolvedScopeItems = useMemo(
    () => [
      ...(surfaceContextItems ?? []),
      {
        id: "json-validation",
        key: "json_validation",
        label: "JSON validation",
        value: JSON.stringify({
          isValid: validationState.isValid,
          isJson: validationState.isJson,
          errors: validationState.errors,
          warnings: validationState.warnings,
        }),
      },
      {
        id: "json-parsed",
        key: "json_parsed",
        label: "Parsed JSON",
        value: validationState.isJson
          ? JSON.stringify(validationState.parsed)
          : "null",
      },
    ],
    [surfaceContextItems, validationState],
  );

  const resolveApplicationScope = () => {
    const base = getApplicationScope
      ? getApplicationScope(validationState)
      : defaultApplicationScope(value, validationState);
    return {
      ...defaultApplicationScope(value, validationState),
      ...base,
      context: {
        ...defaultApplicationScope(value, validationState).context,
        ...(base.context ?? {}),
      },
    };
  };

  const hasErrors = validationState.errors.length > 0;
  const hasWarnings = validationState.warnings.length > 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant={hasErrors ? "destructive" : hasWarnings ? "warning" : "success"}
            className="font-mono text-[10px]"
          >
            {statusLabel(validationState)}
          </Badge>
          {schema && (
            <Badge variant="outline" className="gap-1 font-mono text-[10px]">
              <Code2 className="h-3 w-3" />
              schema
            </Badge>
          )}
          {validators && validators.length > 0 && (
            <Badge variant="outline" className="font-mono text-[10px]">
              {validators.length} custom
            </Badge>
          )}
        </div>

        {showFormatButton && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleFormat}
            disabled={!validationState.isJson}
            className="h-7 px-2 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Format
          </Button>
        )}
      </div>

      <ProTextarea
        ref={ref}
        value={value}
        onChange={onChange}
        spellCheck={false}
        aria-invalid={hasErrors}
        className={cn(
          "font-mono text-[12px] leading-relaxed",
          hasErrors
            ? "border-red-400 focus-visible:ring-red-400 dark:border-red-700"
            : hasWarnings
              ? "border-amber-400 focus-visible:ring-amber-400 dark:border-amber-700"
              : "border-input",
          className,
        )}
        surfaceContextItems={resolvedScopeItems}
        getApplicationScope={resolveApplicationScope}
        {...props}
      />

      {showValidationPanel && <ValidationPanel state={validationState} />}
    </div>
  );
});

ProJsonTextarea.displayName = "ProJsonTextarea";
