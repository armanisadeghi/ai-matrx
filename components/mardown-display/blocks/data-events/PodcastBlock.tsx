"use client";
import React, { useState } from "react";
import {
  Mic2,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

// ── PodcastCompleteBlock ─────────────────────────────────────────────────────

export interface PodcastCompleteBlockProps {
  showId: string;
  success: boolean;
  episodeCount?: number;
  error?: string | null;
}

export const PodcastCompleteBlock: React.FC<PodcastCompleteBlockProps> = ({
  showId,
  success,
  episodeCount,
  error,
}) => (
  <div
    className={`rounded-lg border my-2 overflow-hidden ${success ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"}`}
  >
    <div className="flex items-center gap-2 px-3 py-2.5">
      <Mic2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      {success ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />
      ) : (
        <XCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">
            Podcast Complete
          </span>
          <span className="text-xs font-mono text-muted-foreground">
            {showId}
          </span>
          {episodeCount != null && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {episodeCount} episode{episodeCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {error && (
          <p className="text-xs text-destructive/80 mt-0.5 leading-relaxed">
            {error}
            <ErrorAlchemyMenu error={error} />
          </p>
        )}
      </div>
    </div>
  </div>
);

// ── PodcastStageBlock ────────────────────────────────────────────────────────

export interface PodcastStageBlockProps {
  stage: string;
  success: boolean;
  error?: string | null;
  resultKeys?: string[];
}

export const PodcastStageBlock: React.FC<PodcastStageBlockProps> = ({
  stage,
  success,
  error,
  resultKeys = [],
}) => {
  const [showKeys, setShowKeys] = useState(false);

  return (
    <div className="rounded-lg border bg-card my-2 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <Mic2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        {success ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />
        ) : error ? (
          <XCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
        ) : (
          <Loader2 className="w-3.5 h-3.5 text-primary animate-spin flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Podcast stage</span>
            <span className="text-sm font-medium text-foreground font-mono">
              {stage}
            </span>
          </div>
          {error && (
            <p className="text-xs text-destructive/80 mt-0.5">{error} <ErrorAlchemyMenu error={error} /></p>
          )}
        </div>
        {resultKeys.length > 0 && (
          <button
            onClick={() => setShowKeys((v) => !v)}
            className="text-muted-foreground hover:text-foreground flex-shrink-0"
          >
            {showKeys ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>
      {showKeys && resultKeys.length > 0 && (
        <div className="border-t border-border/40 px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {resultKeys.map((k) => (
              <span
                key={k}
                className="text-xs px-1.5 py-0.5 rounded bg-muted font-mono text-muted-foreground"
              >
                {k}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
