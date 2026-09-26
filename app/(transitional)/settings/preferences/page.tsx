"use client";

/**
 * /settings/preferences — legacy URL kept alive during Phase 8 cutover.
 *
 * Historically this rendered the full VSCodePreferencesModal inline. The new
 * preferences system lives in a WindowPanel overlay rather than a route, so
 * this page now redirects to the dashboard and, once there, dispatches
 * `openOverlay({ overlayId: "userPreferencesWindow" })`. Deep links like `?tab=prompts`
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
  textToSpeech: "voice.voices",
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
  // Unified device tab (media-capture Phase 4) — legacy short ids route here.
  audioDevices: "devices",
  mediaDevices: "devices",
};

function SettingsPreferencesInner() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const params = useSearchParams();
  const rawTab = params.get("tab") ?? undefined;
  const controlId = params.get("control") ?? undefined;
  const tabId = rawTab ? (LEGACY_TAB_ALIASES[rawTab] ?? rawTab) : undefined;

  // Navigate FIRST, open the window once we have left. Opening it first
  // writes its `panels` param onto this address with history.replaceState,
  // which the App Router takes as the newest navigation — the in-flight
  // replace to /dashboard was dropped and the tab sat on "Opening settings…"
  // forever (reproduced 2026-09-26). The cleanup runs on the real unmount
  // (address already /dashboard) and also on React's dev double-invoke
  // (address still here — skipped; the re-run effect replaces again).
  useEffect(() => {
    router.replace("/dashboard");
    return () => {
      if (window.location.pathname === "/settings/preferences") return;
      dispatch(
        openOverlay({
          overlayId: "userPreferencesWindow",
          data: {
            ...(tabId ? { initialTabId: tabId } : {}),
            ...(controlId ? { initialControlId: controlId } : {}),
          },
        }),
      );
    };
  }, [controlId, dispatch, router, tabId]);

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
