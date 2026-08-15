"use client";

import React, { lazy, Suspense } from "react";
import { useSelector } from "react-redux";
import { selectUser } from "@/lib/redux/slices/userSlice";
import { Bug } from "lucide-react";
import { cn } from "@/lib/utils";
import { PUBLIC_HEADER_ICON_BUTTON } from "./publicHeaderChrome";

// Lazy load FeedbackButton - only loads when user is authenticated
const FeedbackButton = lazy(() => import("@/features/feedback/FeedbackButton"));

/**
 * Public Header Feedback - Conditionally renders for authenticated users
 *
 * Uses lazy loading with ssr: false to defer until after page render.
 * Only visible when user is authenticated.
 * Reserves space with placeholder to prevent layout shift.
 */
export function PublicHeaderFeedback() {
  const user = useSelector(selectUser);
  const isAuthenticated = !!user.id;

  // Don't render anything if not authenticated (no placeholder needed)
  if (!isAuthenticated) {
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
      className={cn(PUBLIC_HEADER_ICON_BUTTON, "flex items-center justify-center opacity-30")}
      aria-hidden="true"
    >
      <Bug className="w-4 h-4" />
    </span>
  );
}
