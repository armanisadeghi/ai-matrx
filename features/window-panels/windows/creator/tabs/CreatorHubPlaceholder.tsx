"use client";

import { Wrench } from "lucide-react";

/**
 * Shared stub for Creator Hub tabs that mirror the agent run page's
 * CreatorRunPanel tabs. Those tabs are conversation-scoped; the global hub
 * has no conversation, so the content is wired up later. This keeps the tab
 * structure visible without coupling to a live run.
 */
export default function CreatorHubPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <Wrench className="h-6 w-6 text-muted-foreground/50" />
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        This panel is wired up later. It mirrors the {label} tab from the agent
        run page, which needs an active conversation to populate.
      </p>
    </div>
  );
}
