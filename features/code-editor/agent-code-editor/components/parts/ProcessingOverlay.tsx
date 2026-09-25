"use client";

/**
 * ProcessingOverlay — compact "AI is responding" overlay with live streaming
 * text preview. Extracted from AICodeEditor.tsx:178-194.
 *
 * Pure presentational component. Parent is responsible for positioning it
 * over the code display (expects `absolute inset-0` parent wrapper).
 */

import React from "react";
import { Loader2 } from "lucide-react";
import MarkdownStream from "@/components/MarkdownStream";

interface ProcessingOverlayProps {
  /** Live streaming text from the agent — optional; shown when present. */
  streamingText?: string;
  /** Label above the spinner. Defaults to "AI is responding..." */
  label?: string;
}

export function ProcessingOverlay({
  streamingText,
  label = "AI is responding...",
}: ProcessingOverlayProps) {
  return (
    <div className="absolute inset-0 bg-background/90 backdrop-blur-sm flex flex-col items-center justify-center z-10">
      <Loader2 className="w-10 h-10 animate-spin text-primary mb-3" />
      <p className="text-sm font-medium">{label}</p>

      {streamingText && (
        <div className="mt-4 w-full max-w-xl px-4">
          <div className="bg-muted/50 rounded border p-2 max-h-[450px] overflow-y-auto font-mono text-[10px]">
            <p className="text-muted-foreground mb-1 text-[9px] uppercase tracking-wider font-semibold">
              Live Response
            </p>
            <MarkdownStream imagePolicy="ai" content={streamingText} />
          </div>
        </div>
      )}
    </div>
  );
}
