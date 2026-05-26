"use client";

import { PromptAppsGrid } from "@/features/prompt-apps/components/layouts/PromptAppsGrid";
import { PageSpecificHeader } from "@/components/layout/new-layout/PageSpecificHeader";
import { AppWindow } from "lucide-react";
import type { PromptApp } from "@/features/prompt-apps/types/promptAppTypes";

interface PromptAppsListClientProps {
  apps: PromptApp[];
}

export function PromptAppsListClient({ apps }: PromptAppsListClientProps) {
  return (
    <>
      <PageSpecificHeader>
        <div className="flex items-center justify-center w-full">
          <div className="flex items-center gap-2">
            <AppWindow className="h-5 w-5 text-primary flex-shrink-0" />
            <h1 className="text-base font-bold text-foreground">Prompt Apps</h1>
          </div>
        </div>
      </PageSpecificHeader>

      <div className="h-page w-full overflow-auto">
        <div className="container mx-auto px-4 sm:px-6 md:px-8 lg:px-12 py-4 sm:py-6 max-w-[1800px]">
          <PromptAppsGrid apps={apps} />
        </div>
      </div>
    </>
  );
}
