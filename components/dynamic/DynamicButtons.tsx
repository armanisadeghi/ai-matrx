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

'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { useButtonPrompts } from '@/hooks/useSystemPrompts';
import { PromptContextResolver, type UIContext } from '@/lib/services/prompt-context-resolver';
// TODO(prompts-deletion): PromptRunnerModal removed with features/prompts.
// This component uses the legacy prompt-execution system. Migrate to useShortcutTrigger()
// per the TODO comment at the top of this file.
import { Loader2, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useAppDispatch } from '@/lib/redux/hooks';
import { startPromptInstance } from '@/lib/redux/prompt-execution/thunks/startInstanceThunk';
import { v4 as uuidv4 } from 'uuid';

interface DynamicButtonsProps {
  category?: string;
  context?: UIContext;
  renderAs?: 'inline' | 'grid' | 'stack';
  className?: string;
}

export function DynamicButtons({
  category,
  context: uiContext = {},
  renderAs = 'inline',
  className,
}: DynamicButtonsProps) {
  const dispatch = useAppDispatch();
  const { systemPrompts, loading } = useButtonPrompts(category);
  const [executingId, setExecutingId] = React.useState<string | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalRunId, setModalRunId] = React.useState<string | null>(null);
  const [modalTitle, setModalTitle] = React.useState<string>('');

  const handleButtonClick = async (systemPrompt: any) => {
    // Check if placeholder
    if (systemPrompt.prompt_snapshot?.placeholder) {
      return; // Disabled
    }

    try {
      setExecutingId(systemPrompt.id);

      // Resolve variables
      const variables = PromptContextResolver.resolve(
        systemPrompt.prompt_snapshot,
        systemPrompt.functionality_id,
        'button',
        uiContext
      );

      // Check if can resolve
      const canResolve = PromptContextResolver.canResolve(
        systemPrompt.prompt_snapshot,
        systemPrompt.functionality_id,
        'button',
        uiContext
      );

      if (!canResolve.canResolve) {
        console.warn(`Cannot resolve variables for ${systemPrompt.name}:`, canResolve.missingVariables);
        setExecutingId(null);
        return;
      }

      // Get placement settings
      const settings = systemPrompt.placement_settings || {};
      const allowChat = settings.allowChat ?? true;

      // Initialize the run via Redux
      const newRunId = uuidv4();
      const promptId = systemPrompt.source_prompt_id || systemPrompt.prompt_snapshot?.id || 'unknown';
      
      await dispatch(startPromptInstance({
        runId: newRunId,
        promptId,
        promptSource: 'prompts',
        executionConfig: {
          auto_run: true,
          allow_chat: allowChat,
          show_variables: false,
          apply_variables: true,
          track_in_runs: true,
          use_pre_execution_input: false,
        },
        variables,
      })).unwrap();
      
      // Store runId and open modal
      setModalRunId(newRunId);
      setModalTitle(systemPrompt.name);
      setModalOpen(true);
      setExecutingId(null);
    } catch (error) {
      console.error('Error executing button action:', error);
      setExecutingId(null);
    }
  };

  if (loading) {
    return (
      <div className={cn('flex gap-2', className)}>
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
    renderAs === 'inline' && 'flex items-center gap-2',
    renderAs === 'grid' && 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2',
    renderAs === 'stack' && 'flex flex-col gap-2',
    className
  );

  return (
    <>
      <div className={containerClass}>
        {systemPrompts.map((systemPrompt) => {
          const isPlaceholder = systemPrompt.prompt_snapshot?.placeholder;
          const isExecutingThis = executingId === systemPrompt.id;
          const settings = systemPrompt.placement_settings || {};
          const variant = settings.variant || 'outline';
          const size = settings.size || 'sm';
          const showIcon = settings.showIcon ?? true;

          return (
            <Button
              key={systemPrompt.id}
              variant={variant as any}
              size={size as any}
              onClick={() => handleButtonClick(systemPrompt)}
              disabled={isPlaceholder || isExecutingThis}
              className={cn(
                'relative',
                isPlaceholder && 'opacity-60'
              )}
            >
              {isExecutingThis && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {isPlaceholder && !isExecutingThis && <Lock className="h-4 w-4 mr-2" />}
              {showIcon && !isExecutingThis && !isPlaceholder && systemPrompt.display_config?.icon && (
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
