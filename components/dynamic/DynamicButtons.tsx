/**
 * DynamicButtons
 *
 * Database-driven button group that loads system prompts configured as buttons.
 * Shows disabled state for placeholders.
 *
 * TODO(prompt-to-agent-sweep): UNIQUE CASE — does NOT follow the 1:1 prompt→agent id mapping.
 *
 * Unlike notes / context-menu / quick-chat / code-editor consumers, this
 * component reads from `public.system_prompts`, whose `source_prompt_id`
 * column points at user-prompt rows in `public.prompts` (NOT
 * `prompt_builtins`). Many rows even have `source_prompt_id = null` and
 * rely on a hard-coded `functionality_id` ("translate-text",
 * "explain-text", "fix-code", etc.) — i.e. the legacy "system prompts"
 * router with no agent-side equivalent today.
 *
 * To migrate properly:
 *   1. Decide whether the agent system grows a parallel
 *      `agx_system_prompts` (or similar) registry, OR every
 *      `system_prompts` row gets a paired `agx_shortcut` and we rewire
 *      `useButtonPrompts` to load from `agx_shortcut` instead.
 *   2. Once shortcuts exist for each row, swap this body for
 *      `useShortcutTrigger()` and the appropriate scope mapping
 *      (selection / content / context). The shortcut row provides
 *      auto_run / allow_chat / display_mode — drop
 *      `placement_settings.allowChat`, `<PromptRunnerModal>`, and the
 *      whole local `runId`/modalOpen state.
 *   3. For "no custom logic" buttons (Translate, Search Web, Explain,
 *      etc.) the shortcut's default `display_mode: "modal-full"` is the
 *      desired UI — drop the inline modal entirely.
 *
 * Until executed, this consumer keeps the legacy prompt-execution slice
 * AND the `features/prompts/** ` runner UI alive.
 */

"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { useButtonPrompts } from "@/hooks/useSystemPrompts";
import type { UIContext } from "@/lib/services/prompt-context-resolver";
import { Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface DynamicButtonsProps {
  category?: string;
  context?: UIContext;
  renderAs?: "inline" | "grid" | "stack";
  className?: string;
}

export function DynamicButtons({
  category,
  context: _uiContext = {},
  renderAs = "inline",
  className,
}: DynamicButtonsProps) {
  const { systemPrompts, loading } = useButtonPrompts(category);
  const [executingId, setExecutingId] = React.useState<string | null>(null);

  const handleButtonClick = async (systemPrompt: {
    id: string;
    name: string;
    prompt_snapshot?: { placeholder?: boolean };
  }) => {
    if (systemPrompt.prompt_snapshot?.placeholder) {
      return;
    }

    setExecutingId(systemPrompt.id);
    toast.info(
      `${systemPrompt.name} — migrate this button to an agent shortcut (useShortcutTrigger).`,
    );
    setExecutingId(null);
  };

  if (loading) {
    return (
      <div className={cn("flex gap-2", className)}>
        <Button disabled>
          <Loader2 className="h-4 w-4 animate-spin" />
        </Button>
      </div>
    );
  }

  if (systemPrompts.length === 0) {
    return null;
  }

  const containerClass = cn(
    renderAs === "inline" && "flex items-center gap-2",
    renderAs === "grid" &&
      "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2",
    renderAs === "stack" && "flex flex-col gap-2",
    className,
  );

  return (
    <>
      <div className={containerClass}>
        {systemPrompts.map((systemPrompt) => {
          const isPlaceholder = systemPrompt.prompt_snapshot?.placeholder;
          const isExecutingThis = executingId === systemPrompt.id;
          const settings = systemPrompt.placement_settings || {};
          const variant = settings.variant || "outline";
          const size = settings.size || "sm";
          const showIcon = settings.showIcon ?? true;

          return (
            <Button
              key={systemPrompt.id}
              variant={variant as any}
              size={size as any}
              onClick={() => handleButtonClick(systemPrompt)}
              disabled={isPlaceholder || isExecutingThis}
              className={cn("relative", isPlaceholder && "opacity-60")}
            >
              {isExecutingThis && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              {isPlaceholder && !isExecutingThis && (
                <Lock className="h-4 w-4 mr-2" />
              )}
              {showIcon &&
                !isExecutingThis &&
                !isPlaceholder &&
                systemPrompt.display_config?.icon && (
                  <span className="mr-2">{/* Icon placeholder */}</span>
                )}
              <span>{systemPrompt.name}</span>
              {isPlaceholder && (
                <Badge variant="outline" className="ml-2 text-xs">
                  Soon
                </Badge>
              )}
            </Button>
          );
        })}
      </div>

      {/* TODO(prompts-deletion): PromptRunnerModal removed — execution modal is temporarily
          disabled. Migrate this component to useShortcutTrigger() (see file-level TODO). */}
    </>
  );
}
