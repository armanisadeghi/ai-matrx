"use client";

/**
 * ImageGenerationResult — the COMPLETED state of an image-generation
 * `agent_call`.
 *
 * The user asked for an image. The image is the answer; the agent name, the
 * agent id, and the model id are plumbing. Rendering the raw result object
 * turned "here is your picture" into a four-row key/value grid whose "Result"
 * cell was a link chip naming our storage bucket — the exact opposite of the
 * request. So the card shows the canonical media component and nothing else.
 *
 * HIDE NOTHING still holds: every field stays one click away in "View complete
 * result" (the same overlay the generic renderer opens).
 */

import React from "react";
import { Maximize2 } from "lucide-react";

import type { ToolRendererProps } from "../../types";
import { GenericRenderer } from "../../registry/GenericRenderer";
import { ResultMedia } from "../../result-fields/ResultMedia";
import { findResultMedia } from "./findResultMedia";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";

export const ImageGenerationResult: React.FC<ToolRendererProps> = (props) => {
  const { entry, onOpenOverlay, toolGroupId } = props;
  const media = findResultMedia(entry.result);

  // No image in the result — never fake one. The generic renderer tells the
  // truth about whatever DID come back.
  if (!media) return <GenericRenderer {...props} />;

  const groupId = toolGroupId ?? entry.callId;

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2">
        <ResultMedia refValue={media} alt="Generated image" density="full" />
        <div className="shrink-0">
          <CopyButtons
            label="Image"
            size="icon"
            human={() => JSON.stringify(entry.result, null, 2)}
            agent={() => ({
              kind: "tool-result",
              location: "AI Matrx — Generated image",
              description: "An image produced by an image-generation agent.",
              data: {
                tool: entry.toolName,
                callId: entry.callId,
                result: entry.result,
              },
            })}
          />
        </div>
      </div>

      {onOpenOverlay && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenOverlay(`tool-group-${groupId}`);
          }}
          className="group flex w-full items-center justify-between gap-2 rounded border border-border/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <span>View complete result</span>
          <Maximize2 className="h-3 w-3 shrink-0" />
        </button>
      )}
    </div>
  );
};
