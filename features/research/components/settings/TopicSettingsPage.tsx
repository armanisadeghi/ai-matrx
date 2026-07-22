"use client";

// Thin page wrapper around the ONE shared settings form
// (`TopicSettingsForm`). The previously duplicated inline form was
// consolidated during the research-project decoupling (2026-07-21) — do not
// reintroduce form fields here.

import { Loader2 } from "lucide-react";
import { useTopicContext } from "../../context/ResearchContext";
import { TopicSettingsForm } from "./TopicSettingsForm";

export default function TopicSettingsPage() {
  const { topic, refresh } = useTopicContext();

  if (!topic) {
    return (
      <div className="flex items-center justify-center min-h-[40dvh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 space-y-6">
      <div className="flex items-center gap-2 rounded-full matrx-glass-thin-border px-3 py-1.5">
        <span className="text-xs font-medium text-foreground/80">Settings</span>
      </div>
      <TopicSettingsForm topic={topic} onSaved={refresh} />
    </div>
  );
}
