"use client";

import { Aperture, ImageIcon } from "lucide-react";

import type { ToolRendererProps } from "../../types";
import { GenericRenderer } from "../../registry/GenericRenderer";
import { isImageGenerationAgentCall } from "./agentCallKind";
import { isCollaborationAgentCall } from "./collab";
import { CollabCallCard } from "./CollabCallCard";

function ImageGenerationLoading() {
  return (
    <div
      className="relative isolate min-h-36 overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] via-background to-violet-500/[0.08] p-4 shadow-sm"
      role="status"
      aria-live="polite"
      aria-label="Creating your image"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-30 [background-image:linear-gradient(hsl(var(--border)/.45)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/.45)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />
      <div
        aria-hidden="true"
        className="absolute -left-10 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full bg-cyan-400/15 blur-3xl animate-pulse"
      />
      <div
        aria-hidden="true"
        className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-violet-500/15 blur-3xl animate-pulse [animation-delay:700ms]"
      />

      <div className="relative flex min-h-28 items-center gap-4">
        <div className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/30 bg-gradient-to-br from-cyan-400/20 via-primary/20 to-violet-500/25 shadow-[0_12px_32px_-16px_hsl(var(--primary)/.8)] dark:border-white/10">
          <div
            aria-hidden="true"
            className="absolute -inset-8 rotate-12 bg-[linear-gradient(110deg,transparent_35%,hsl(var(--background)/.8)_50%,transparent_65%)] animate-shimmer bg-[length:200%_100%]"
          />
          <ImageIcon className="relative h-8 w-8 text-primary" />
          <Aperture className="absolute right-2 top-2 h-4 w-4 text-violet-500 animate-pulse" />
          <span className="absolute bottom-2 left-2 h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_10px_2px_rgb(34_211_238_/_0.55)]" />
        </div>

        <div className="min-w-0 flex-1 space-y-2.5">
          <div>
            <p className="text-sm font-medium text-foreground">
              Composing your image
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Building the scene, details, lighting, and final finish.
            </p>
          </div>

          <div className="flex gap-1.5" aria-hidden="true">
            {[0, 1, 2, 3].map((step) => (
              <span
                key={step}
                className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
              >
                <span
                  className="block h-full w-full origin-left animate-pulse rounded-full bg-gradient-to-r from-cyan-400 via-primary to-violet-500"
                  style={{ animationDelay: `${step * 180}ms` }}
                />
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Dispatches `agent_call` by declared child-agent contract.
 *
 * Specialized paths: live image generation, and conversation-aware
 * collaboration calls (`history_mode` "snapshot"/"fork" → `CollabCallCard`,
 * all statuses except error). Failed and unknown agent calls retain the
 * canonical generic result/error rendering.
 */
export function AgentCallInline(props: ToolRendererProps) {
  const { entry } = props;
  const isActive =
    entry.status === "started" ||
    entry.status === "progress" ||
    entry.status === "step";

  if (isActive && isImageGenerationAgentCall(entry)) {
    return <ImageGenerationLoading />;
  }

  if (entry.status !== "error" && isCollaborationAgentCall(entry)) {
    return <CollabCallCard {...props} />;
  }

  return <GenericRenderer {...props} />;
}
