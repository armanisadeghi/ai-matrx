"use client";

import { cn } from "@/lib/utils";
import { AiModelRef } from "@/components/official/entity-ref/AiIdentityRef";

interface Props {
  modelId: string;
  className?: string;
}

interface ModelStyle {
  className: string;
}

function styleFor(modelId: string): ModelStyle {
  const m = modelId.toLowerCase();
  if (m.includes("claude")) {
    return {
      className:
        "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800/40",
    };
  }
  if (
    m.includes("gpt") ||
    m.includes("o1") ||
    m.includes("o3") ||
    m.includes("o4")
  ) {
    return {
      className:
        "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/40",
    };
  }
  if (m.includes("gemini")) {
    return {
      className:
        "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/40",
    };
  }
  if (m.includes("llama") || m.includes("mistral") || m.includes("groq")) {
    return {
      className:
        "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800/40",
    };
  }
  return {
    className: "bg-muted text-muted-foreground border-border",
  };
}

export function ModelBadge({ modelId, className }: Props) {
  const style = styleFor(modelId);
  return (
    <AiModelRef
      modelId={modelId}
      showIcon={false}
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium tabular-nums",
        style.className,
        className,
      )}
    />
  );
}
