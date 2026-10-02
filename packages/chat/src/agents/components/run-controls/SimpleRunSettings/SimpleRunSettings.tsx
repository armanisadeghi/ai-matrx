'use client';

/**
 * SimpleRunSettings
 *
 * The content of the "simple settings" popover: a capability grid and a
 * reasoning-level selector. Self-contained: owns its selected values via
 * local state for now, emits onChange for consumers that want to persist.
 *
 * No model names are ever rendered. No temperature / top_p / max_tokens
 * controls — power users get those in the builder.
 */

import React, { useState, useCallback } from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CapabilityGrid } from './CapabilityGrid';
import { ReasoningLevelSelector } from './ReasoningLevelSelector';
import {
  DEFAULT_CAPABILITY_ID,
  DEFAULT_REASONING_LEVEL,
  findCapability,
  type Capability,
  type ReasoningLevelId,
} from './capabilities';

export interface SimpleRunSettingsValue {
  capabilityId: Capability['id'];
  /** Underlying model id — callers who actually persist should use this. */
  modelId: string;
  reasoningLevel: ReasoningLevelId;
}

export interface SimpleRunSettingsProps {
  initialCapabilityId?: Capability['id'];
  initialReasoningLevel?: ReasoningLevelId;
  /** Called whenever either field changes — debounce in the parent if needed. */
  onChange?: (value: SimpleRunSettingsValue) => void;
  /** Called when user clicks "Reset to agent defaults". */
  onReset?: () => void;
  className?: string;
}

export function SimpleRunSettings({
  initialCapabilityId = DEFAULT_CAPABILITY_ID,
  initialReasoningLevel = DEFAULT_REASONING_LEVEL,
  onChange,
  onReset,
  className,
}: SimpleRunSettingsProps) {
  const [capabilityId, setCapabilityId] = useState<Capability['id']>(initialCapabilityId);
  const [reasoningLevel, setReasoningLevel] =
    useState<ReasoningLevelId>(initialReasoningLevel);

  const emit = useCallback(
    (nextCap: Capability['id'], nextReason: ReasoningLevelId) => {
      const cap = findCapability(nextCap);
      onChange?.({
        capabilityId: nextCap,
        modelId: cap?.modelId ?? '',
        reasoningLevel: nextReason,
      });
    },
    [onChange],
  );

  const handleCapabilityChange = useCallback(
    (id: Capability['id']) => {
      setCapabilityId(id);
      emit(id, reasoningLevel);
    },
    [emit, reasoningLevel],
  );

  const handleReasoningChange = useCallback(
    (id: ReasoningLevelId) => {
      setReasoningLevel(id);
      emit(capabilityId, id);
    },
    [emit, capabilityId],
  );

  const handleReset = useCallback(() => {
    setCapabilityId(DEFAULT_CAPABILITY_ID);
    setReasoningLevel(DEFAULT_REASONING_LEVEL);
    emit(DEFAULT_CAPABILITY_ID, DEFAULT_REASONING_LEVEL);
    onReset?.();
  }, [emit, onReset]);

  return (
    <div className={cn('flex flex-col gap-4 w-[320px]', className)}>
      <Section
        title="What kind of AI?"
        subtitle="Pick the one that fits what you're asking."
      >
        <CapabilityGrid value={capabilityId} onChange={handleCapabilityChange} />
      </Section>

      <Section
        title="How much should it think?"
        subtitle="More thinking means smarter answers, but slower."
      >
        <ReasoningLevelSelector
          value={reasoningLevel}
          onChange={handleReasoningChange}
        />
      </Section>

      <button
        type="button"
        onClick={handleReset}
        className={cn(
          'inline-flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-[11px]',
          'text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
        )}
      >
        <RotateCcw className="h-3 w-3" />
        Reset to defaults
      </button>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-[11px] text-muted-foreground leading-snug">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
