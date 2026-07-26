"use client";

import React, { useState } from "react";
import { SqlFunction } from "@/types/sql-functions";
import { parseArguments } from "../utils/parseArguments";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  X,
  Edit,
  Trash2,
  Code,
  ShieldAlert,
  Shield,
  Calendar,
  User,
  Copy,
  Check,
  ArrowRight,
  Play,
} from "lucide-react";
import SyntaxHighlighter from "@/features/administration/database-admin/SyntaxHighlighter";
import SqlFunctionTester from "./SqlFunctionTester";

interface SqlFunctionDetailProps {
  func: SqlFunction;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied!" : label}
      className="inline-flex items-center justify-center h-4 w-4 rounded text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0"
    >
      {copied ? (
        <Check className="h-2.5 w-2.5 text-emerald-500" />
      ) : (
        <Copy className="h-2.5 w-2.5" />
      )}
    </button>
  );
}

export default function SqlFunctionDetail({
  func,
  onClose,
  onEdit,
  onDelete,
}: SqlFunctionDetailProps) {
  const [defCopied, setDefCopied] = useState(false);
  const [rightPanel, setRightPanel] = useState<"definition" | "test">(
    "definition",
  );

  const parsedArgs = parseArguments(func.arguments);

  const fnLabel = `${func.schema}.${func.name}`;
  const signatureText = `-- Signature: ${fnLabel}\n${fnLabel}(${func.arguments}) → ${func.returns}`;
  const argsText =
    parsedArgs.length > 0
      ? `-- Arguments for ${fnLabel}\n` +
        parsedArgs
          .map(
            (a, i) =>
              `${a.name || `$${i + 1}`}: ${a.type}${a.defaultValue ? ` DEFAULT ${a.defaultValue}` : ""}`,
          )
          .join("\n")
      : func.arguments;
  const returnsText = `-- Return type for ${fnLabel}\n${func.returns}`;
  const descriptionText = func.description
    ? `-- Description for ${fnLabel}\n${func.description}`
    : "";

  const handleCopyCode = () => {
    if (func.definition) {
      navigator.clipboard.writeText(func.definition);
      setDefCopied(true);
      setTimeout(() => setDefCopied(false), 1500);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Code className="h-4 w-4 text-slate-500 dark:text-slate-400 shrink-0" />
          <span className="font-mono text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
            {func.schema}.{func.name}
          </span>
          <div className="flex items-center gap-1.5">
            {func.security_type === "SECURITY DEFINER" ? (
              <Badge
                variant="outline"
                className="text-[10px] py-0 gap-1 border-green-500/40 text-green-700 dark:text-green-400 bg-green-500/10"
              >
                <ShieldAlert className="h-3 w-3" />
                Definer
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[10px] py-0 gap-1 border-yellow-500/40 text-yellow-700 dark:text-yellow-400 bg-yellow-500/10"
              >
                <Shield className="h-3 w-3" />
                Invoker
              </Badge>
            )}
            {func.language && (
              <Badge
                variant="outline"
                className="text-[10px] py-0 border-blue-500/40 text-blue-700 dark:text-blue-400 bg-blue-500/10"
              >
                {func.language}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-3">
          <Button
            variant="default"
            size="sm"
            onClick={onEdit}
            className="h-6 text-xs px-2 bg-slate-700 hover:bg-slate-600 text-white"
          >
            <Edit className="h-3 w-3 mr-1" />
            Edit
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            className="h-6 text-xs px-2"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Delete
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-6 w-6 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Body: 50/50 split */}
      <div className="flex-1 min-h-0 grid grid-cols-2 overflow-hidden">
        {/* Left: metadata */}
        <div className="overflow-y-auto border-r border-slate-200 dark:border-slate-700 p-3 space-y-3">
          {/* Signature */}
          <section>
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Signature
              </h4>
              <CopyButton text={signatureText} label="Copy signature" />
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-2 font-mono text-xs text-slate-800 dark:text-slate-200">
              <span className="text-slate-400 dark:text-slate-500">
                {func.schema}.
              </span>
              <span className="text-blue-700 dark:text-blue-400 font-semibold">
                {func.name}
              </span>
              <span className="text-slate-400 dark:text-slate-500">(</span>
              {parsedArgs.length > 0 ? (
                <span className="text-slate-400 dark:text-slate-500">...</span>
              ) : null}
              <span className="text-slate-400 dark:text-slate-500">)</span>
              <span className="mx-1.5 text-slate-400 dark:text-slate-500">
                <ArrowRight className="inline h-3 w-3" />
              </span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                {func.returns}
              </span>
            </div>
          </section>

          {/* Arguments Table */}
          <section>
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Arguments{" "}
                {parsedArgs.length > 0 && (
                  <span className="text-slate-400 dark:text-slate-500">
                    ({parsedArgs.length})
                  </span>
                )}
              </h4>
              {func.arguments && (
                <CopyButton text={argsText} label="Copy arguments" />
              )}
            </div>
            {parsedArgs.length > 0 ? (
              <div className="rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left px-2 py-1 font-medium text-slate-500 dark:text-slate-400 w-6">
                        #
                      </th>
                      <th className="text-left px-2 py-1 font-medium text-slate-500 dark:text-slate-400">
                        Name
                      </th>
                      <th className="text-left px-2 py-1 font-medium text-slate-500 dark:text-slate-400">
                        Type
                      </th>
                      <th className="text-left px-2 py-1 font-medium text-slate-500 dark:text-slate-400">
                        Default
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedArgs.map((arg, i) => (
                      <tr
                        key={i}
                        className="border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <td className="px-2 py-1 text-slate-400 dark:text-slate-500 tabular-nums">
                          {i + 1}
                        </td>
                        <td className="px-2 py-1 font-mono">
                          {arg.name ? (
                            <span className="text-slate-800 dark:text-slate-200">
                              {arg.name}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500 italic">
                              unnamed
                            </span>
                          )}
                          {arg.mode !== "IN" && (
                            <Badge
                              variant="outline"
                              className="ml-1.5 text-[9px] py-0 px-1 font-sans border-slate-300 dark:border-slate-600"
                            >
                              {arg.mode}
                            </Badge>
                          )}
                        </td>
                        <td className="px-2 py-1 font-mono text-blue-600 dark:text-blue-400">
                          {arg.type}
                        </td>
                        <td className="px-2 py-1 font-mono text-slate-500 dark:text-slate-400">
                          {arg.defaultValue ?? (
                            <span className="text-slate-300 dark:text-slate-600">
                              &mdash;
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic px-1">
                No arguments
              </p>
            )}
          </section>

          {/* Return Type */}
          <section>
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Returns
              </h4>
              <CopyButton text={returnsText} label="Copy return type" />
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1.5">
              <code className="font-mono text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                {func.returns}
              </code>
            </div>
          </section>

          {/* Description */}
          {func.description && (
            <section>
              <div className="flex items-center justify-between mb-1.5">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Description
                </h4>
                <CopyButton text={descriptionText} label="Copy description" />
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed px-1">
                {func.description}
              </p>
            </section>
          )}

          {/* Metadata row */}
          {(func.owner || func.created || func.last_modified) && (
            <section className="pt-2 border-t border-slate-200 dark:border-slate-700">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {func.owner && (
                  <div className="flex items-center gap-1.5">
                    <User className="h-3 w-3 text-slate-400 dark:text-slate-500 shrink-0" />
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      Owner
                    </span>
                    <span className="text-[10px] text-slate-700 dark:text-slate-300 ml-auto font-medium">
                      {func.owner}
                    </span>
                  </div>
                )}
                {func.created && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3 w-3 text-slate-400 dark:text-slate-500 shrink-0" />
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      Created
                    </span>
                    <span className="text-[10px] text-slate-700 dark:text-slate-300 ml-auto">
                      {new Date(func.created).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {func.last_modified && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3 w-3 text-slate-400 dark:text-slate-500 shrink-0" />
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      Modified
                    </span>
                    <span className="text-[10px] text-slate-700 dark:text-slate-300 ml-auto">
                      {new Date(func.last_modified).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Right: definition or test runner */}
        <div className="flex flex-col min-h-0 overflow-hidden">
          {/* Right panel header with mode toggle */}
          <div className="flex items-center justify-between px-3 py-1 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setRightPanel("definition")}
                className={`text-[10px] px-2 py-0.5 rounded font-medium uppercase tracking-wider transition-colors ${
                  rightPanel === "definition"
                    ? "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                    : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                }`}
              >
                Definition
              </button>
              <button
                type="button"
                onClick={() => setRightPanel("test")}
                className={`text-[10px] px-2 py-0.5 rounded font-medium uppercase tracking-wider transition-colors flex items-center gap-1 ${
                  rightPanel === "test"
                    ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                    : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                }`}
              >
                <Play className="h-2.5 w-2.5" />
                Test Runner
              </button>
            </div>

            {rightPanel === "definition" && func.definition && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyCode}
                className="h-5 text-[10px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 px-1.5"
              >
                {defCopied ? (
                  <>
                    <Check className="h-3 w-3 mr-1" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Right panel body */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {rightPanel === "definition" ? (
              <div className="h-full overflow-auto bg-slate-50 dark:bg-slate-900/50 [&_pre]:!rounded-none [&_pre]:!p-3">
                {func.definition ? (
                  <SyntaxHighlighter
                    code={func.definition}
                    language={func.language || "sql"}
                  />
                ) : (
                  <p className="p-3 text-xs text-slate-500 dark:text-slate-400 italic">
                    Source code not available
                  </p>
                )}
              </div>
            ) : (
              <SqlFunctionTester func={func} parsedArgs={parsedArgs} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
