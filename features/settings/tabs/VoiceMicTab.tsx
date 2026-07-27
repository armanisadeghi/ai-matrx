"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import VoiceSettingsPage from "@/features/settings/pages/VoiceSettingsPage";

export default function VoiceMicTab() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <VoiceSettingsPage />
    </Suspense>
  );
}
