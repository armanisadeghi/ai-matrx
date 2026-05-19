"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { PartyPopper, X } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setModulePreferences } from "@/lib/redux/preferences/userPreferencesSlice";

interface FeedbackHighlightProps {
  // Increments each time the parent's feedback button is clicked. We use it
  // as a one-shot "dismiss now" signal so clicking the bug hides the
  // highlight without persisting a count change.
  dismissTick: number;
}

export default function FeedbackHighlight({
  dismissTick,
}: FeedbackHighlightProps) {
  const dispatch = useAppDispatch();
  const feedbackFeatureViewCount = useAppSelector(
    (state) => state.userPreferences.system.feedbackFeatureViewCount,
  );
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (dismissTick > 0) setVisible(false);
  }, [dismissTick]);

  // Auto-increment the view count after 3s. Once it hits 5 the parent gate
  // unmounts this component permanently. Engine debounces the Supabase
  // write automatically (≤250ms).
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      dispatch(
        setModulePreferences({
          module: "system",
          preferences: {
            feedbackFeatureViewCount: feedbackFeatureViewCount + 1,
          },
        }),
      );
    }, 3000);
    return () => clearTimeout(timer);
  }, [visible, feedbackFeatureViewCount, dispatch]);

  const dismissPermanent = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setVisible(false);
      dispatch(
        setModulePreferences({
          module: "system",
          preferences: { feedbackFeatureViewCount: 5 },
        }),
      );
    },
    [dispatch],
  );

  if (!visible) return null;

  return (
    <>
      {/* Anchored to the visible 32×32 inner pill (offset 6px from the 44×44 outer tap target) */}
      <span className="pointer-events-none absolute top-1.5 right-1.5 flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
      </span>

      <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 z-50">
        <div className="bg-blue-600 text-white text-xs font-medium px-3 py-2 pr-8 rounded-lg shadow-lg whitespace-nowrap animate-bounce relative">
          <PartyPopper className="w-4 h-4 inline mr-1" /> NEW! Report bugs &amp;
          issues
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onClick={dismissPermanent}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 hover:bg-blue-700 rounded p-0.5 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-3 h-3" />
          </button>
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-blue-600 rotate-45" />
        </div>
      </div>
    </>
  );
}
