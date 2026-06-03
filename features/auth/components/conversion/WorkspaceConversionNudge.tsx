"use client";

import { useUserType } from "@/features/auth/hooks/useUserType";
import { useConversionTracker } from "@/features/auth/hooks/useConversionTracker";
import { InlineConversionCard } from "./InlineConversionCard";

interface WorkspaceConversionNudgeProps {
  /**
   * `featureName` matching what's passed to `useAuthGuardedAction` at the
   * gated callsites inside this workspace. Every gate trip bumps the
   * counter under this key; this nudge fires once the count clears
   * `threshold`.
   */
  featureName: string;
  /**
   * How many gate attempts before the inline card appears. Defaults to 1
   * — the moment a guest hits the wall, the nudge confirms what they
   * just tried to do has a no-friction path forward.
   */
  threshold?: number;
  /** Override the auto-generated heading. */
  heading?: string;
  /** Override the auto-generated description. */
  description?: string;
  /** Tailwind override forwarded to `<InlineConversionCard>`. */
  className?: string;
}

/**
 * Drop this anywhere inside a workspace (chat composer, file list, agent
 * gallery, etc.). For guests who have tried the gated action at least
 * `threshold` times, an inline conversion card renders directly in the
 * workspace flow — no modal, no interruption. For authed users and
 * not-yet-engaged guests, renders nothing.
 *
 * The contract: pair this with `useAuthGuardedAction({ featureName: X })`
 * at the gated callsite. Same `featureName` on both sides so the counter
 * and the nudge agree on what's being tried.
 */
export function WorkspaceConversionNudge({
  featureName,
  threshold = 1,
  heading,
  description,
  className,
}: WorkspaceConversionNudgeProps) {
  const userType = useUserType();
  const { gateAttemptsFor } = useConversionTracker();

  if (userType === "authenticated") return null;

  const attempts = gateAttemptsFor(featureName);
  if (attempts < threshold) return null;

  return (
    <InlineConversionCard
      heading={heading ?? `One step away from ${featureName.toLowerCase()}`}
      description={
        description ??
        `Create a free account in 30 seconds and pick up exactly where you left off. No credit card, no commitment.`
      }
      className={className}
    />
  );
}
