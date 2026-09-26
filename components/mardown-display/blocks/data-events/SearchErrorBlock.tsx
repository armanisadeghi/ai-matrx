"use client";
import React, { useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface SearchErrorBlockProps {
  error: string;
  metadata?: Record<string, unknown>;
}

const SearchErrorBlock: React.FC<SearchErrorBlockProps> = ({ error, metadata }) => {
  const [showDetail, setShowDetail] = useState(false);
  const hasExtra = metadata && Object.keys(metadata).length > 0;

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 my-2 overflow-hidden">
      <div className="flex items-start gap-2 px-3 py-2.5">
        <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">Search Error</span>
            {hasExtra && (
              <button
                onClick={() => setShowDetail((v) => !v)}
                className="text-muted-foreground hover:text-foreground"
              >
                {showDetail ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
          <p className="text-xs text-destructive/80 mt-0.5 leading-relaxed">{error} <ErrorAlchemyMenu error={error} /></p>
          {showDetail && metadata && (
            <pre className="mt-2 text-xs bg-muted/50 rounded p-2 overflow-auto max-h-40 text-muted-foreground">
              {JSON.stringify(metadata, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchErrorBlock;
