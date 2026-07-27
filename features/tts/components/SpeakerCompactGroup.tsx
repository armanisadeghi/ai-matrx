/**
 * SpeakerCompactGroup — Variant 3: 2-button group (Play/Pause toggle + Stop)
 *
 * Thin shell. Permanently renders 2 tap-buttons in TapTargetButtonGroup.
 * On first Play click, lazily loads SpeakerCompactGroupCore.
 * Shape never changes.
 */

"use client";

import React, { useState, useCallback, lazy, Suspense } from "react";
import { PlayTapButton, StopTapButton } from "@/components/icons/tap-buttons";
import { TapTargetButtonGroup } from "@/components/icons/TapTargetButton";

export interface SpeakerCompactGroupProps {
  text: string;
  processMarkdown?: boolean;
  className?: string;
  disabled?: boolean;
}

const SpeakerCompactGroupCore = lazy(() => import("./SpeakerCompactGroupCore"));

function StaticShell({
  onClick,
  clickable,
}: {
  onClick?: () => void;
  clickable: boolean;
}) {
  return (
    <TapTargetButtonGroup>
      <PlayTapButton
        variant="group"
        onClick={clickable ? onClick : undefined}
        disabled={!clickable}
      />
      <StopTapButton variant="group" disabled />
    </TapTargetButtonGroup>
  );
}

export function SpeakerCompactGroup({
  text,
  processMarkdown = true,
  className,
  disabled = false,
}: SpeakerCompactGroupProps) {
  const [engaged, setEngaged] = useState(false);

  const handleClick = useCallback(() => {
    if (!disabled && text.trim()) setEngaged(true);
  }, [disabled, text]);

  if (!engaged) {
    return (
      <StaticShell
        onClick={handleClick}
        clickable={!disabled && !!text.trim()}
      />
    );
  }

  return (
    <Suspense fallback={<StaticShell clickable={false} />}>
      <SpeakerCompactGroupCore
        text={text}
        processMarkdown={processMarkdown}
        className={className}
        disabled={disabled}
        autoStart
      />
    </Suspense>
  );
}
