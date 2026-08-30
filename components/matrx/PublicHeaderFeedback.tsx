"use client";

import React, { lazy, Suspense } from "react";
import { useSelector } from "react-redux";
import { selectUser } from "@/lib/redux/slices/userSlice";
import { Bug } from "lucide-react";
import { cn } from "@/lib/utils";
import { PUBLIC_HEADER_ICON_BUTTON } from "./publicHeaderChrome";

// Lazy load FeedbackButton only for a real account. Supabase anonymous users
// also have UUIDs, but feature announcements are meaningless for a guest.
const FeedbackButton = lazy(() => import("@/features/feedback/FeedbackButton"));

/**
 * Public Header Feedback - Conditionally renders for account users
 *
 * Uses lazy loading with ssr: false to defer until after page render.
 * Only visible when the session belongs to a non-anonymous account.
 * Reserves space with placeholder to prevent layout shift.
 */
export function PublicHeaderFeedback() {
  const user = useSelector(selectUser);
  const hasAccount = !!user.id && !user.isAnonymous;

  // Don't render anything if not authenticated (no placeholder needed)
  if (!hasAccount) {
    return null;
  }

  return (
    <Suspense fallback={<FeedbackButtonPlaceholder />}>
      <FeedbackButton variant="transparent" />
    </Suspense>
  );
}

/**
 * Placeholder sized to the BugTapButton's 44×44 outer tap target.
 * Prevents layout shift while the lazy-loaded button hydrates.
 */
function FeedbackButtonPlaceholder() {
  return (
    <span
      className={cn(
        PUBLIC_HEADER_ICON_BUTTON,
        "flex items-center justify-center opacity-30",
      )}
      aria-hidden="true"
    >
      <Bug className="w-4 h-4" />
    </span>
  );
}
