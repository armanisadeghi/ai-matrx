"use client";

/**
 * /settings/preferences — legacy URL kept alive during Phase 8 cutover.
 *
 * Historically this rendered the full VSCodePreferencesModal inline. The new
 * preferences system lives in a WindowPanel overlay rather than a route, so
 * this page now just dispatches `openOverlay({ overlayId: "userPreferencesWindow" })`
 * on mount and redirects to the dashboard. Deep links like `?tab=prompts`
 * still work — the tab id is mapped to the new registry id.
 */

import { useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Settings as SettingsIcon, ArrowRight } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";

const LEGACY_TAB_ALIASES: Record<string, string> = {
  display: "appearance.theme",
  prompts: "ai.prompts",
  messaging: "communication.messaging",
  voice: "voice.input",
  textToSpeech: "voice.tts",
  assistant: "ai.assistants",
  aiModels: "ai.models",
  email: "communication.email",
  videoConference: "communication.video",
  photoEditing: "ai.photoEditing",
  imageGeneration: "ai.imageGeneration",
  textGeneration: "ai.textGeneration",
  coding: "editor.coding",
  flashcard: "learning.flashcards",
  playground: "ai",
  agentContext: "ai.assistants",
};

function SettingsPreferencesInner() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const params = useSearchParams();
  const rawTab = params.get("tab") ?? undefined;
  const tabId = rawTab ? (LEGACY_TAB_ALIASES[rawTab] ?? rawTab) : undefined;

  useEffect(() => {
    dispatch(
      openOverlay({
        overlayId: "userPreferencesWindow",
        data: tabId ? { initialTabId: tabId } : {},
      }),
    );
    router.replace("/dashboard");
  }, [dispatch, router, tabId]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <SettingsIcon className="h-4 w-4" />
        Opening settings…
        <Link
          href="/dashboard"
          className="ml-2 inline-flex items-center gap-1 text-primary hover:underline"
        >
          Dashboard
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

export default function SettingsPreferencesPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPreferencesInner />
    </Suspense>
  );
}
