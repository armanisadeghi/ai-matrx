"use client";

/**
 * VideoPromptOptionsBlock — renderer for the `video_prompt_options` kind.
 *
 * Displays an agent's video-prompt variations as cards; each card's Generate
 * button fires the declared generation agent via the platform-owned
 * `KindAgentActionButton` (click-only, chat overlay, prompt pre-filled).
 * `aspect_ratio` / `clip_length` map onto `llmOverrides`
 * (`aspect_ratio` / `duration_seconds`) so the generation call inherits the
 * variation's settings without any per-agent plumbing.
 *
 * Consumes the bridge serverData from
 * features/content-ir/kinds/video-prompt-options.ts. Without a declared
 * `action` the cards render display-only (copy still works) — never a broken
 * button.
 */

import { Check, Clapperboard, Clock, Copy, Proportions } from "lucide-react";
import { useCallback, useState } from "react";
import { KindAgentActionButton } from "@/features/content-ir/react/actions/KindAgentActionButton";
import type {
  VideoPromptActionData,
  VideoPromptOptionsData,
  VideoPromptVariationData,
} from "@/features/content-ir/kinds/video-prompt-options";
import type { LLMParams } from "@/features/agents/types/agent-api-types";

export interface VideoPromptOptionsBlockProps {
  serverData?: unknown;
}

const ASPECT_RATIO_VALUES = new Set<NonNullable<LLMParams["aspect_ratio"]>>([
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
]);

function isVariation(value: unknown): value is VideoPromptVariationData {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as VideoPromptVariationData).prompt === "string"
  );
}

function readData(serverData: unknown): VideoPromptOptionsData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  const candidate = serverData as Partial<VideoPromptOptionsData>;
  if (!Array.isArray(candidate.prompts)) return null;
  const prompts = candidate.prompts.filter(isVariation);
  if (prompts.length === 0) return null;
  return {
    concept: typeof candidate.concept === "string" ? candidate.concept : null,
    action:
      candidate.action && typeof candidate.action.agentId === "string"
        ? candidate.action
        : null,
    prompts,
  };
}

/** "16:9" → the typed enum member; anything else is dropped (advisory only). */
function toAspectRatio(value: string | null): LLMParams["aspect_ratio"] | null {
  if (!value) return null;
  const trimmed = value.trim() as NonNullable<LLMParams["aspect_ratio"]>;
  return ASPECT_RATIO_VALUES.has(trimmed) ? trimmed : null;
}

/** "8s" / "8" → 8; anything non-numeric is dropped (advisory only). */
function toDurationSeconds(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value.trim().replace(/s$/i, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function variationOverrides(
  variation: VideoPromptVariationData,
): Partial<LLMParams> | null {
  const overrides: Partial<LLMParams> = {};
  const aspectRatio = toAspectRatio(variation.aspectRatio);
  if (aspectRatio) overrides.aspect_ratio = aspectRatio;
  const durationSeconds = toDurationSeconds(variation.clipLength);
  if (durationSeconds !== null) overrides.duration_seconds = durationSeconds;
  return Object.keys(overrides).length > 0 ? overrides : null;
}

function CopyPromptButton({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [prompt]);
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label="Copy prompt"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function VariationCard({
  variation,
  index,
  action,
}: {
  variation: VideoPromptVariationData;
  index: number;
  action: VideoPromptActionData | null;
}) {
  const number = variation.variation ?? index + 1;
  const overrides = variationOverrides(variation);

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">
          Variation {number}
        </span>
        {variation.aspectRatio ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            <Proportions className="h-3 w-3" />
            {variation.aspectRatio}
          </span>
        ) : null}
        {variation.clipLength ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {variation.clipLength}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <CopyPromptButton prompt={variation.prompt} />
          {action ? (
            <KindAgentActionButton
              agentId={action.agentId}
              label={action.label ?? "Generate video"}
              variables={{ [action.variableName]: variation.prompt }}
              llmOverrides={overrides}
              sourceFeature="video-prompt-options"
            />
          ) : null}
        </div>
      </div>
      {variation.interpretation ? (
        <p className="mb-2 text-sm text-muted-foreground">
          {variation.interpretation}
        </p>
      ) : null}
      <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-sm text-foreground">
        {variation.prompt}
      </p>
    </div>
  );
}

export default function VideoPromptOptionsBlock({
  serverData,
}: VideoPromptOptionsBlockProps) {
  const data = readData(serverData);
  if (!data) return null;

  return (
    <div className="my-2 space-y-2">
      <div className="flex items-center gap-2">
        <Clapperboard className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          Video prompt options
        </span>
      </div>
      {data.concept ? (
        <p className="text-sm text-muted-foreground">
          Concept: {data.concept}
        </p>
      ) : null}
      <div className="space-y-2">
        {data.prompts.map((variation, index) => (
          <VariationCard
            key={index}
            variation={variation}
            index={index}
            action={data.action}
          />
        ))}
      </div>
    </div>
  );
}
