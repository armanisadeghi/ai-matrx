"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { TabLoading } from "@/features/settings/components/TabLoading";
import { Loader2 } from "lucide-react";

const VoiceSettingsPage = dynamic(() => import("@/features/settings/pages/VoiceSettingsPage"), { ssr: false, loading: TabLoading });

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
