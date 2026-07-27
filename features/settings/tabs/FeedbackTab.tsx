"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import UserFeedbackPage from "@/features/settings/pages/FeedbackSettingsPage";

export default function FeedbackTab() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <UserFeedbackPage />
    </Suspense>
  );
}
