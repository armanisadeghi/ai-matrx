"use client";

// features/spaces/state/knobs.ts — Spaces' defaults and limits are Feature Knobs (admin → organization → person).
// Until the snapshot answers, a reader holds the register's own default (the same number seeded in the row).

import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs.client";

export const SPACES_KNOBS = {
  maxUploadMb: { ref: { feature: "spaces.media", key: "max_upload_mb" }, seed: 100 },
  embedHeightPx: { ref: { feature: "spaces.media", key: "embed_height_px" }, seed: 400 },
  homeRecentCount: { ref: { feature: "spaces.home", key: "recent_count" }, seed: 12 },
  homeUpcomingDays: { ref: { feature: "spaces.home", key: "upcoming_days" }, seed: 14 },
} as const;

export function useSpacesKnob(name: keyof typeof SPACES_KNOBS): number {
  const organizationId = useAppSelector(selectActiveOrganizationId);
  const userId = useAppSelector(selectUserId);
  const knob = SPACES_KNOBS[name];
  const value = Number(useEffectiveKnob(organizationId, userId, knob.ref));
  return Number.isFinite(value) && value > 0 ? value : knob.seed;
}
