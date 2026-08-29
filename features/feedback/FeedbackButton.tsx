"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import {
  BugTapButton,
  type TapButtonProps,
} from "@ai-matrx/tap-target/buttons";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";

// The "NEW!" highlight (PartyPopper, X, bouncing tooltip, dismiss + view-count
// logic) lives in a separate chunk. Most users have already exhausted the 5
// view budget, so this chunk is rarely fetched in production.
const FeedbackHighlight = dynamic(() => import("./FeedbackHighlight"), {
  ssr: false,
  loading: () => null,
});

// Forwarded directly to BugTapButton — derive from the canonical type so we
// can never drift from the owner's prop shape.
type FeedbackButtonProps = Pick<TapButtonProps, "variant" | "tooltip">;

export default function FeedbackButton({
  variant = "glass",
  tooltip,
}: FeedbackButtonProps) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector((state) => state.userAuth.id);
  const feedbackFeatureViewCount = useAppSelector(
    (state) => state.userPreferences.system.feedbackFeatureViewCount,
  );
  const preferencesLoaded = useAppSelector(
    (state) => state.userPreferences._meta.loadedPreferences !== null,
  );

  const [dismissTick, setDismissTick] = useState(0);

  const shouldShowHighlight =
    !!userId && preferencesLoaded && feedbackFeatureViewCount < 5;

  const handleClick = useCallback(() => {
    if (shouldShowHighlight) setDismissTick((n) => n + 1);
    dispatch(openOverlay({ overlayId: "feedbackDialog" }));
  }, [dispatch, shouldShowHighlight]);

  return (
    <div className="relative">
      <BugTapButton
        variant={variant}
        ariaLabel="Submit Feedback"
        tooltip={tooltip}
        onClick={handleClick}
      />
      {shouldShowHighlight && <FeedbackHighlight dismissTick={dismissTick} />}
    </div>
  );
}
