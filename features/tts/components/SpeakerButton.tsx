/**
 * SpeakerButton — Single play/pause toggle
 *
 * Thin shell. Renders a single Volume2TapButton.
 * On first click, lazily loads SpeakerButtonCore.
 * Shape never changes — always one button.
 *
 * Supports variant prop to work standalone ("glass") or inside a group ("group").
 */

'use client';

import React, { useState, useCallback, lazy, Suspense } from 'react';
import { Volume2TapButton } from '@/components/icons/tap-buttons';
import type { SpeakerVariant } from '../types';

export interface SpeakerButtonProps {
  text: string;
  processMarkdown?: boolean;
  variant?: SpeakerVariant;
  className?: string;
  disabled?: boolean;
}

const SpeakerButtonCore = lazy(() => import('./SpeakerButtonCore'));

export function SpeakerButton({
  text,
  processMarkdown = true,
  variant,
  className,
  disabled = false,
}: SpeakerButtonProps) {
  const [engaged, setEngaged] = useState(false);

  const handleClick = useCallback(() => {
    if (!disabled && text.trim()) setEngaged(true);
  }, [disabled, text]);

  if (!engaged) {
    return (
      <Volume2TapButton
        variant={variant}
        onClick={handleClick}
        disabled={disabled || !text.trim()}
        ariaLabel="Play audio"
        className={className}
      />
    );
  }

  return (
    <Suspense
      fallback={
        <Volume2TapButton variant={variant} disabled ariaLabel="Loading…" className={className} />
      }
    >
      <SpeakerButtonCore
        text={text}
        processMarkdown={processMarkdown}
        variant={variant}
        className={className}
        disabled={disabled}
        autoStart
      />
    </Suspense>
  );
}
