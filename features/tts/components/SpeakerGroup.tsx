/**
 * SpeakerGroup — Variant 2: 3-button group (Play, Pause, Stop)
 *
 * Thin shell. Permanently renders 3 tap-buttons in TapTargetButtonGroup.
 * On first Play click, lazily loads SpeakerGroupCore.
 * Shape never changes.
 */

"use client";

import React, { useState, useCallback, lazy, Suspense } from "react";
import {
  PlayTapButton,
  PauseTapButton,
  StopTapButton,
} from "@/components/icons/tap-buttons";
import { TapTargetButtonGroup } from "@/components/icons/TapTargetButton";

export interface SpeakerGroupProps {
  text: string;
  processMarkdown?: boolean;
  className?: string;
  disabled?: boolean;
}

const SpeakerGroupCore = lazy(() => import("./SpeakerGroupCore"));

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
      <PauseTapButton variant="group" disabled />
      <StopTapButton variant="group" disabled />
    </TapTargetButtonGroup>
  );
}

export function SpeakerGroup({
  text,
  processMarkdown = true,
  className,
  disabled = false,
}: SpeakerGroupProps) {
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
      <SpeakerGroupCore
        text={text}
        processMarkdown={processMarkdown}
        className={className}
        disabled={disabled}
        autoStart
      />
    </Suspense>
  );
}
