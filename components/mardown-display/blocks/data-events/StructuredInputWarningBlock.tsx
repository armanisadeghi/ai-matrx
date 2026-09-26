"use client";
import React, { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface StructuredInputWarningBlockProps {
  blockType: string;
  failures?: Record<string, unknown>[];
}

const StructuredInputWarningBlock: React.FC<
  StructuredInputWarningBlockProps
> = ({ blockType, failures = [] }) => {
  const [showFailures, setShowFailures] = useState(false);
  const hasFailures = failures.length > 0;

  return (
    <div className="rounded-lg border border-warning/40 bg-warning/5 my-2 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">
              Structured Input Warning
            </span>
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {blockType}
            </span>
            {hasFailures && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-warning/15 text-warning font-medium">
                {failures.length} failure{failures.length !== 1 ? "s" : ""}
                <ErrorAlchemyMenu />
              </span>
            )}
          </div>
        </div>
        {hasFailures && (
          <button
            onClick={() => setShowFailures((v) => !v)}
            className="text-muted-foreground hover:text-foreground flex-shrink-0"
          >
            {showFailures ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>
      {showFailures && hasFailures && (
        <div className="border-t border-border/40 px-3 py-2">
          <pre className="text-xs text-muted-foreground overflow-auto max-h-48 leading-relaxed">
            {JSON.stringify(failures, null, 2)}
            <ErrorAlchemyMenu />
          </pre>
        </div>
      )}
    </div>
  );
};

export default StructuredInputWarningBlock;
