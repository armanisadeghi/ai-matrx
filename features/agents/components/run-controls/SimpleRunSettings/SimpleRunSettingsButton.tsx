'use client';

/**
 * SimpleRunSettingsButton
 *
 * A single gear-icon button that opens the SimpleRunSettings popover.
 * Drop it anywhere in the runner chrome (toolbar, header, etc.).
 *
 * Shows a subtle "dot" indicator on the gear when the settings differ from
 * the agent's defaults — so the user knows the current run is customised.
 */

import React, { useState, useCallback } from 'react';
import { Settings2 } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ai-matrx/design-system';
import { cn } from '@/lib/utils';
import { SimpleRunSettings, type SimpleRunSettingsValue } from './SimpleRunSettings';
import {
  DEFAULT_CAPABILITY_ID,
  DEFAULT_REASONING_LEVEL,
  findCapability,
} from './capabilities';

export interface SimpleRunSettingsButtonProps {
  /** Compact size — matches other 28px toolbar buttons. Default is medium. */
  size?: 'sm' | 'md';
  className?: string;
  /** Called whenever the popover updates values. Wire this to Redux later. */
  onChange?: (value: SimpleRunSettingsValue) => void;
}

export function SimpleRunSettingsButton({
  size = 'md',
  className,
  onChange,
}: SimpleRunSettingsButtonProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<SimpleRunSettingsValue>({
    capabilityId: DEFAULT_CAPABILITY_ID,
    modelId: findCapability(DEFAULT_CAPABILITY_ID)?.modelId ?? '',
    reasoningLevel: DEFAULT_REASONING_LEVEL,
  });

  const handleChange = useCallback(
    (next: SimpleRunSettingsValue) => {
      setValue(next);
      onChange?.(next);
    },
    [onChange],
  );

  const isCustomised =
    value.capabilityId !== DEFAULT_CAPABILITY_ID ||
    value.reasoningLevel !== DEFAULT_REASONING_LEVEL;

  const sizeClasses =
    size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  const iconClasses = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  const activeCap = findCapability(value.capabilityId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={
            isCustomised
              ? `Settings: ${activeCap?.label ?? '—'} · ${capitalise(value.reasoningLevel)} thinking`
              : 'Chat settings'
          }
          aria-label="Chat settings"
          className={cn(
            'relative inline-flex items-center justify-center rounded-md',
            'text-muted-foreground/70 hover:text-foreground hover:bg-muted transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            sizeClasses,
            className,
          )}
        >
          <Settings2 className={iconClasses} />
          {isCustomised && (
            <span
              className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-blue-500 dark:bg-blue-400"
              aria-hidden
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={8}
        className="w-auto p-4"
      >
        <SimpleRunSettings
          initialCapabilityId={value.capabilityId}
          initialReasoningLevel={value.reasoningLevel}
          onChange={handleChange}
        />
      </PopoverContent>
    </Popover>
  );
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
