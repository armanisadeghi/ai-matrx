/**
 * usePreferencesModal — Phase 8 compatibility shim.
 *
 * Legacy API: `{ isOpen, activeTab, openPreferences, closePreferences }` with
 * local state. Now dispatches into the overlay slice so opening from anywhere
 * mounts the new `SettingsShell`.
 *
 * New code should dispatch `openOverlay({ overlayId: "userPreferencesWindow", data: { initialTabId } })`
 * directly and use `useSetting(path)` to read/write individual values.
 */
import { useCallback } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/lib/redux/store";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  openOverlay,
  closeOverlay,
  selectIsOverlayOpen,
  selectOverlayData,
} from "@/lib/redux/slices/overlaySlice";

export type PreferenceTab =
  | "display"
  | "prompts"
  | "messaging"
  | "voice"
  | "textToSpeech"
  | "assistant"
  | "aiModels"
  | "email"
  | "videoConference"
  | "photoEditing"
  | "imageGeneration"
  | "textGeneration"
  | "coding"
  | "flashcard"
  | "playground"
  | "agentContext";

const LEGACY_TAB_MAP: Record<PreferenceTab, string> = {
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
};

interface UsePreferencesModalReturn {
  isOpen: boolean;
  activeTab: PreferenceTab | undefined;
  openPreferences: (tab?: PreferenceTab) => void;
  closePreferences: () => void;
}

export function usePreferencesModal(): UsePreferencesModalReturn {
  const dispatch = useAppDispatch();

  const isOpen = useSelector((s: RootState) =>
    selectIsOverlayOpen(s, "userPreferencesWindow"),
  );
  const overlayData = useSelector(
    (s: RootState) =>
      selectOverlayData(s, "userPreferencesWindow") as {
        initialTab?: PreferenceTab;
      } | null,
  );
  const activeTab = overlayData?.initialTab;

  const openPreferences = useCallback(
    (tab?: PreferenceTab) => {
      dispatch(
        openOverlay({
          overlayId: "userPreferencesWindow",
          data: tab
            ? { initialTab: tab, initialTabId: LEGACY_TAB_MAP[tab] ?? tab }
            : {},
        }),
      );
    },
    [dispatch],
  );

  const closePreferences = useCallback(() => {
    dispatch(closeOverlay({ overlayId: "userPreferencesWindow" }));
  }, [dispatch]);

  return { isOpen, activeTab, openPreferences, closePreferences };
}
