import { Suspense } from "react";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import SettingsContainer from "@/features/ai-models/components/settings/SettingsContainer";

export const metadata = {
  title: "AI Settings Vocabulary",
};

export default function AiSettingsPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <SuspenseLoader
              centered={false}
              message="Loading model settings…"
            />
          </div>
        }
      >
        <SettingsContainer />
      </Suspense>
    </div>
  );
}
