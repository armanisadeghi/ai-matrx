"use client";

import { formatDurationMs } from "@ai-matrx/kit/format";
import React, { useState } from "react";
import { Terminal, CheckCircle2, XCircle, ChevronDown, ChevronUp, Clock } from "lucide-react";

export interface FunctionResultBlockProps {
  functionName: string;
  success: boolean;
  result?: unknown;
  error?: string | null;
  durationMs?: number | null;
}

const FunctionResultBlock: React.FC<FunctionResultBlockProps> = ({
  functionName,
  success,
  result,
  error,
  durationMs,
}) => {
  const [showResult, setShowResult] = useState(false);
  const hasResult = result != null;
  const resultStr = hasResult ? JSON.stringify(result, null, 2) : null;

  return (
    <div className={`rounded-lg border my-2 overflow-hidden ${success ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"}`}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Terminal className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {success ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />
            ) : (
              <XCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
            )}
            <span className="text-sm font-medium text-foreground font-mono">{functionName}()</span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${success ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
              {success ? "success" : "failed"}
            </span>
            {durationMs != null && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                {formatDurationMs(durationMs, { style: "compact" })}
              </span>
            )}
          </div>
          {error && (
            <p className="text-xs text-destructive/80 mt-1 leading-relaxed">{error}</p>
          )}
        </div>
        {hasResult && (
          <button
            onClick={() => setShowResult((v) => !v)}
            className="flex-shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted/50"
          >
            {showResult ? "Hide" : "Result"}
            {showResult ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>
      {showResult && resultStr && (
        <div className="border-t border-border/40 px-3 py-2">
          <pre className="text-xs text-muted-foreground overflow-auto max-h-48 leading-relaxed">
            {resultStr}
          </pre>
        </div>
      )}
    </div>
  );
};

export default FunctionResultBlock;
