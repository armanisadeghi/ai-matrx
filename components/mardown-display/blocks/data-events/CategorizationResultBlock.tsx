"use client";
import React, { useState } from "react";
import { Tag, ChevronDown, ChevronUp, TestTube2 } from "lucide-react";
import { ToggledDataBody } from "./ToggledDataBody";

export interface CategorizationResultBlockProps {
  promptId: string;
  category: string;
  tags?: string[];
  description?: string;
  dryRun?: boolean;
  metadata?: Record<string, unknown>;
}

const CategorizationResultBlock: React.FC<CategorizationResultBlockProps> = ({
  promptId,
  category,
  tags = [],
  description,
  dryRun,
  metadata,
}) => {
  const [showMeta, setShowMeta] = useState(false);
  const hasExtra =
    (metadata && Object.keys(metadata).length > 0) || description;

  return (
    <div className="rounded-lg border bg-card my-2 overflow-hidden">
      <div className="flex items-start gap-2 px-3 py-2.5">
        <Tag className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">
              Categorized
            </span>
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
              {category}
            </span>
            {dryRun && (
              <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-warning/15 text-warning font-medium">
                <TestTube2 className="w-3 h-3" />
                dry run
              </span>
            )}
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-1 font-mono">
            prompt: <span className="text-foreground/60">{promptId}</span>
          </p>
        </div>
        {hasExtra && (
          <button
            onClick={() => setShowMeta((v) => !v)}
            className="text-muted-foreground hover:text-foreground flex-shrink-0"
          >
            {showMeta ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>
      {showMeta && (
        <div className="border-t border-border/40 px-3 py-2 space-y-1">
          {description && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {description}
            </p>
          )}
          {metadata && Object.keys(metadata).length > 0 && (
            <ToggledDataBody
              value={metadata}
              className="text-xs text-muted-foreground overflow-auto max-h-40"
            />
          )}
        </div>
      )}
    </div>
  );
};

export default CategorizationResultBlock;
