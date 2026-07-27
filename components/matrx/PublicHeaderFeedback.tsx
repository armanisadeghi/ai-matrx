"use client";

import React, { Suspense } from "react";
import dynamic from "next/dynamic";
import { useSelector } from "react-redux";
import { selectUser } from "@/lib/redux/slices/userSlice";
import { Bug } from "lucide-react";

// Lazy load FeedbackButton - only loads when user is authenticated
const FeedbackButton = dynamic(() => import("@/features/feedback/FeedbackButton"), { ssr: false, loading: () => <FeedbackButtonPlaceholder /> });

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
      className="flex h-11 w-11 items-center justify-center opacity-30"
      aria-hidden="true"
    >
      <Bug className="w-4 h-4" />
    </span>
  );
}
