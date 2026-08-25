"use client";

import React, { useState, useTransition } from "react";
import { SqlFunction } from "@/types/sql-functions";
import { ParsedArgument } from "../utils/parseArguments";
import { executeSqlFunctionCall } from "@/actions/admin/sql-functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Play, Copy, Check, AlertCircle, Loader2 } from "lucide-react";
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";

interface SqlFunctionTesterProps {
  func: SqlFunction;
  parsedArgs: ParsedArgument[];
}

type ArgValues = Record<string, string>;
type ArgNulls = Record<string, boolean>;

type ExecuteResult = {
  data: unknown;
  error: string | null;
  sql: string;
} | null;

function getArgKey(arg: ParsedArgument, index: number): string {
  return arg.name || `$${index + 1}`;
}

function initArgValues(inputArgs: ParsedArgument[]): ArgValues {
  const initial: ArgValues = {};
  inputArgs.forEach((arg, i) => {
    const key = getArgKey(arg, i);
    const lower = arg.type.toLowerCase().replace(/\[\]$/, "").trim();
    let def = arg.defaultValue ?? "";
    if (["boolean", "bool"].includes(lower)) {
      def =
        def.toLowerCase() === "true" || def === "t" || def === "1"
          ? "true"
          : "false";
    }
    initial[key] = def;
  });
  return initial;
}

export default function SqlFunctionTester({
  func,
  parsedArgs,
}: SqlFunctionTesterProps) {
  const inputArgs = parsedArgs.filter((a) => a.mode !== "OUT");

  const [argValues, setArgValues] = useState<ArgValues>(() =>
    initArgValues(inputArgs),
  );
  const [argNulls, setArgNulls] = useState<ArgNulls>(() => {
    const init: ArgNulls = {};
    inputArgs.forEach((arg, i) => {
      init[getArgKey(arg, i)] = false;
    });
    return init;
  });
  const [result, setResult] = useState<ExecuteResult>(null);
  const [isPending, startTransition] = useTransition();

  const handleExecute = () => {
    startTransition(async () => {
      const args = inputArgs.map((arg, i) => {
        const key = getArgKey(arg, i);
        return {
          argName: arg.name,
          argType: arg.type,
          value: argValues[key] ?? "",
          isNull: argNulls[key] ?? false,
        };
      });
      const res = await executeSqlFunctionCall(
        func.schema,
        func.name,
        func.returns,
        args,
      );
      setResult(res);
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Args + Execute — capped height, scrolls if many args */}
      <div
        className={`shrink-0 overflow-y-auto p-3 space-y-2${result ? " border-b border-slate-200 dark:border-slate-700" : ""}`}
        style={{ maxHeight: "220px" }}
      >
        {inputArgs.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500 italic px-1">
            This function takes no arguments.
          </p>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 px-0.5">
              <span className="w-28 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Name
              </span>
              <span className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Type
              </span>
              <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Value
              </span>
              <span className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 text-center">
                Null
              </span>
            </div>

            {inputArgs.map((arg, i) => {
              const key = getArgKey(arg, i);
              return (
                <ArgRow
                  key={key}
                  argKey={key}
                  arg={arg}
                  index={i}
                  value={argValues[key] ?? ""}
                  isNull={argNulls[key] ?? false}
                  onChange={(v) =>
                    setArgValues((prev) => ({ ...prev, [key]: v }))
                  }
                  onNullToggle={(checked) =>
                    setArgNulls((prev) => ({ ...prev, [key]: checked }))
                  }
                />
              );
            })}
          </div>
        )}

        <div className="flex justify-end pt-0.5">
          <Button
            onClick={handleExecute}
            disabled={isPending}
            size="sm"
            className="h-7 text-xs bg-emerald-700 hover:bg-emerald-600 text-white"
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 mr-1.5" />
            )}
            {isPending ? "Running…" : "Execute Function"}
          </Button>
        </div>
      </div>

      {/* Result — fills all remaining space */}
      {result ? <ResultDisplay result={result} /> : <div className="flex-1" />}
    </div>
  );
}

// ─── ArgRow ─────────────────────────────────────────────────────────────────

interface ArgRowProps {
  argKey: string;
  arg: ParsedArgument;
  index: number;
  value: string;
  isNull: boolean;
  onChange: (v: string) => void;
  onNullToggle: (checked: boolean) => void;
}

const NUMERIC_TYPES = [
  "integer",
  "int",
  "int4",
  "int8",
  "int2",
  "bigint",
  "smallint",
  "serial",
  "bigserial",
  "numeric",
  "decimal",
  "real",
  "float",
  "float4",
  "float8",
  "double precision",
  "double",
  "oid",
];

function ArgRow({
  argKey,
  arg,
  index,
  value,
  isNull,
  onChange,
  onNullToggle,
}: ArgRowProps) {
  const lower = arg.type.toLowerCase().replace(/\[\]$/, "").trim();
  const isArray = arg.type.trim().endsWith("[]");
  const isBool = ["boolean", "bool"].includes(lower);
  const isJson = ["json", "jsonb"].includes(lower) || isArray;
  const isNumeric = NUMERIC_TYPES.includes(lower);
  const isDateTime = lower.startsWith("timestamp") || lower === "timestamptz";
  const isDate = lower === "date";

  const placeholderText =
    arg.defaultValue !== undefined
      ? `Default: ${arg.defaultValue}`
      : lower === "uuid"
        ? "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        : isArray
          ? '["value1", "value2"]'
          : undefined;

  let inputEl: React.ReactNode;

  if (isBool) {
    inputEl = (
      <Select
        value={value || "false"}
        onValueChange={onChange}
        disabled={isNull}
      >
        <SelectTrigger className="h-7 text-xs border-slate-300 dark:border-slate-600 flex-1 font-mono">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">true</SelectItem>
          <SelectItem value="false">false</SelectItem>
        </SelectContent>
      </Select>
    );
  } else if (isJson) {
    inputEl = (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={isNull}
        placeholder={placeholderText}
        rows={2}
        className="flex-1 w-full text-xs font-mono border border-slate-300 dark:border-slate-600 rounded-md p-1.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 resize-y disabled:opacity-40 min-h-[48px] focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-slate-500"
      />
    );
  } else {
    inputEl = (
      <Input
        type={
          isDateTime
            ? "datetime-local"
            : isDate
              ? "date"
              : isNumeric
                ? "number"
                : "text"
        }
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={isNull}
        placeholder={placeholderText}
        className="h-7 text-xs flex-1 border-slate-300 dark:border-slate-600 font-mono"
      />
    );
  }

  return (
    <div className="flex items-start gap-2">
      <div className="w-28 shrink-0 pt-1.5">
        <span className="font-mono text-xs text-slate-700 dark:text-slate-300 truncate block">
          {arg.name || `$${index + 1}`}
        </span>
      </div>
      <div className="w-20 shrink-0 pt-1.5">
        <code className="text-[10px] text-blue-600 dark:text-blue-400 truncate block">
          {arg.type}
        </code>
      </div>
      <div className="flex-1 min-w-0">{inputEl}</div>
      <div className="w-12 shrink-0 flex justify-center pt-1.5">
        <div className="flex items-center gap-1">
          <Checkbox
            id={`null-${argKey}`}
            checked={isNull}
            onCheckedChange={(checked) => onNullToggle(Boolean(checked))}
            className="h-3.5 w-3.5"
          />
        </div>
      </div>
    </div>
  );
}

// ─── ResultDisplay ───────────────────────────────────────────────────────────

function ResultDisplay({ result }: { result: ExecuteResult }) {
  const [sqlCopied, setSqlCopied] = useState(false);

  if (!result) return null;

  const { data, error, sql } = result;

  const handleCopySql = () => {
    navigator.clipboard.writeText(sql);
    setSqlCopied(true);
    setTimeout(() => setSqlCopied(false), 1500);
  };

  const rowCount = Array.isArray(data) ? data.length : null;
  const resultLabel =
    rowCount !== null
      ? `Result — ${rowCount} row${rowCount !== 1 ? "s" : ""}`
      : "Result";

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-3 gap-2">
      {/* Generated SQL — fixed height */}
      {sql && (
        <div className="shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Generated SQL
            </span>
            <button
              type="button"
              onClick={handleCopySql}
              className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-0.5 transition-colors"
            >
              {sqlCopied ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {sqlCopied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-mono text-slate-700 dark:text-slate-300 overflow-x-auto whitespace-nowrap">
            {sql}
          </pre>
        </div>
      )}

      {/* Error — fixed height */}
      {error && (
        <div className="shrink-0 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-2.5">
          <div className="flex items-start gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-red-500 dark:text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider mb-0.5">
                Error
              </p>
              <p className="text-xs text-red-700 dark:text-red-300 font-mono whitespace-pre-wrap">
                {error}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* No data message */}
      {!error && data === null && (
        <p className="shrink-0 text-xs text-slate-400 dark:text-slate-500 italic">
          Function executed — no return value.
        </p>
      )}

      {/* JsonInspector — fills all remaining space */}
      {!error && data !== null && data !== undefined && (
        <div className="flex-1 min-h-0 flex flex-col gap-1">
          <p className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {resultLabel}
          </p>
          <div className="flex-1 min-h-0 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700">
            <JsonInspector data={data} defaultView="json" />
          </div>
        </div>
      )}
    </div>
  );
}
