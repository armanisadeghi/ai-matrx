"use client";
import React, { useState } from "react";
import { Globe, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

export interface FetchResultsBlockProps {
  results?: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
}

const FetchResultsBlock: React.FC<FetchResultsBlockProps> = ({
  results = [],
  metadata,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  const toggleItem = (i: number) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const getField = (item: Record<string, unknown>, ...keys: string[]) => {
    for (const k of keys) if (item[k] != null) return String(item[k]);
    return null;
  };

  return (
    <div className="rounded-lg border bg-card my-2 overflow-hidden">
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          <span className="font-medium text-foreground">Fetched Pages</span>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {results.length}
          </span>
          {Boolean(metadata?.query) && (
            <span className="text-xs text-muted-foreground italic truncate max-w-40">
              "{String(metadata?.query)}"
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="divide-y divide-border/50">
          {results.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">
              No pages fetched
            </div>
          ) : (
            results.map((item, i) => {
              const title = getField(item, "title", "name", "heading");
              const url = getField(item, "url", "link", "href", "source_url");
              const content = getField(
                item,
                "content",
                "body",
                "text",
                "markdown",
              );
              const isOpen = expandedItems.has(i);

              return (
                <div key={i} className="px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono text-muted-foreground w-5 flex-shrink-0">
                          {i + 1}.
                        </span>
                        <span className="text-sm font-medium text-foreground truncate">
                          {title ?? url ?? `Page ${i + 1}`}
                        </span>
                      </div>
                      {url && title && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-primary hover:underline mt-0.5 ml-6 truncate"
                        >
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{url}</span>
                        </a>
                      )}
                      {content && !isOpen && (
                        <p className="text-xs text-muted-foreground mt-1 ml-6 line-clamp-2 leading-relaxed">
                          {content}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => toggleItem(i)}
                      className="flex-shrink-0 text-muted-foreground hover:text-foreground p-0.5"
                    >
                      {isOpen ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  {isOpen && (
                    <pre className="mt-2 text-xs bg-muted/50 rounded p-2 overflow-auto max-h-60 text-muted-foreground leading-relaxed">
                      {JSON.stringify(item, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default FetchResultsBlock;
