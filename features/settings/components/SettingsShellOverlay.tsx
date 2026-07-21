"use client";

import { useSelector } from "react-redux";
import type { RootState } from "@/lib/redux/store";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  closeOverlay,
  selectIsOverlayOpen,
  selectOverlayData,
} from "@/lib/redux/slices/overlaySlice";
import { SettingsShell } from "./SettingsShell";

/**
 * Controller component that bridges the overlay system to `SettingsShell`.
 *
 * The rest of the app talks to an overlay id — `userPreferencesWindow` is the
 * canonical one and still used by deep links, url hydration, and menus. The
 * legacy `userPreferences` (modal) id is also accepted so no call site needs
 * to change during the Phase 8 cutover.
 *
 * Either id opens the same shell. Data passed via `openOverlay({ data })` can
 * include `{ initialTab: string; isAdmin?: boolean }`.
 */
type OverlayData = {
  initialTab?: string;
  initialTabId?: string;
  isAdmin?: boolean;
};

export function SettingsShellOverlay() {
  const dispatch = useAppDispatch();

  // Accept both the legacy modal overlay id and the window overlay id.
  const isWindowOpen = useSelector((s: RootState) =>
    selectIsOverlayOpen(s, "userPreferencesWindow"),
  );
  const isModalOpen = useSelector((s: RootState) =>
    selectIsOverlayOpen(s, "userPreferences"),
  );
  const windowData = useSelector(
    (s: RootState) =>
      selectOverlayData(s, "userPreferencesWindow") as OverlayData | null,
  );
  const modalData = useSelector(
    (s: RootState) =>
      selectOverlayData(s, "userPreferences") as OverlayData | null,
  );

  const isOpen = isWindowOpen || isModalOpen;
  const data = windowData ?? modalData;

  // Admin status comes from the user slice; treat as boolean.
  const isAdmin = useSelector((s: RootState) =>
    Boolean((s as RootState & { user?: { isAdmin?: boolean } }).user?.isAdmin),
  );

  const handleClose = () => {
    if (isWindowOpen)
      dispatch(closeOverlay({ overlayId: "userPreferencesWindow" }));
    if (isModalOpen) dispatch(closeOverlay({ overlayId: "userPreferences" }));
  };

  if (!isOpen) return null;

  return (
    <SettingsShell
      isOpen
      onClose={handleClose}
      initialTabId={
        data?.initialTabId ?? mapLegacyTab(data?.initialTab) ?? undefined
      }
      isAdmin={data?.isAdmin ?? isAdmin}
    />
  );
}

/**
 * Maps a legacy `PreferenceTab` id (from the old VSCodePreferencesModal) to the
 * new tab id in our registry. Anything unmapped falls through to the default.
 */
const LEGACY_TAB_MAP: Record<string, string> = {
  display: "appearance.theme",
  prompts: "ai.prompts", // deprecated — routes to AI section anchor
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
  playground: "ai", // recipes are dead; send to category
  agentContext: "ai.assistants",
  // Unified device tab (media-capture Phase 4) — legacy short ids route here.
  audioDevices: "devices",
  mediaDevices: "devices",
};

function mapLegacyTab(legacy: string | undefined): string | undefined {
  if (!legacy) return undefined;
  return LEGACY_TAB_MAP[legacy] ?? legacy;
}

// Default export used by windowRegistry.componentImport. Same component —
// the registry system expects a default-exported React component.
export default SettingsShellOverlay;
