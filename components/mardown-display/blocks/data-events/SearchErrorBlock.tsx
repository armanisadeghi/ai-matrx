"use client";
import React, { useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { inlineKindText } from "@/features/content-ir/surfaces/kind-one-line";
import { ToggledDataBody } from "./ToggledDataBody";
import { Button } from "@ai-matrx/design-system/controls";

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
              <Button variant="quiet" icon={showDetail ? <ChevronUp /> : <ChevronDown />} onClick={() => setShowDetail((v) => !v)} aria-label={showDetail ? "Collapse" : "Expand"} aria-expanded={showDetail} />
            )}
          </div>
          <p className="text-xs text-destructive/80 mt-0.5 leading-relaxed">
            {/* A kind in the message (a dict a server error printed) reads as its one-line form (K7). */}
            {inlineKindText(error, { plain: true })} <ErrorAlchemyMenu error={error} />
          </p>
          {/* The same "show data" toggle as the sibling search / fetch cards — not a
              debug source view — so the same door: kindless stays JSON, a kind
              renders as its kind (K7). */}
          {showDetail && metadata && (
            <ToggledDataBody
              value={metadata}
              className="mt-2 text-xs bg-muted/50 rounded p-2 overflow-auto max-h-40 text-muted-foreground"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchErrorBlock;
