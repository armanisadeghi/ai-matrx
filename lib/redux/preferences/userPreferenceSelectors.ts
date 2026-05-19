import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type {
  UserPreferencesState,
  PlaygroundPreferences,
  DisplayPreferences,
  PromptsPreferences,
  VoicePreferences,
  TextToSpeechPreferences,
  AssistantPreferences,
  EmailPreferences,
  VideoConferencePreferences,
  PhotoEditingPreferences,
  ImageGenerationPreferences,
  TextGenerationPreferences,
  CodingPreferences,
  FlashcardPreferences,
  AiModelsPreferences,
  SystemPreferences,
  AgentContextPreferences,
} from "@/lib/redux/preferences/userPreferencesSlice";

// Base selector
export const selectUserPreferences = (state: RootState): UserPreferencesState =>
  state.userPreferences;

// Module selectors with explicit return types
export const selectPlaygroundPreferences = createSelector(
  selectUserPreferences,
  (state): PlaygroundPreferences => state.playground,
);

export const selectDisplayPreferences = createSelector(
  selectUserPreferences,
  (state): DisplayPreferences => state.display,
);

export const selectPromptsPreferences = createSelector(
  selectUserPreferences,
  (state): PromptsPreferences => state.prompts,
);

export const selectVoicePreferences = createSelector(
  selectUserPreferences,
  (state): VoicePreferences => state.voice,
);

export const selectTextToSpeechPreferences = createSelector(
  selectUserPreferences,
  (state): TextToSpeechPreferences => state.textToSpeech,
);

export const selectAssistantPreferences = createSelector(
  selectUserPreferences,
  (state): AssistantPreferences => state.assistant,
);

export const selectEmailPreferences = createSelector(
  selectUserPreferences,
  (state): EmailPreferences => state.email,
);

export const selectVideoConferencePreferences = createSelector(
  selectUserPreferences,
  (state): VideoConferencePreferences => state.videoConference,
);

export const selectPhotoEditingPreferences = createSelector(
  selectUserPreferences,
  (state): PhotoEditingPreferences => state.photoEditing,
);

export const selectImageGenerationPreferences = createSelector(
  selectUserPreferences,
  (state): ImageGenerationPreferences => state.imageGeneration,
);

export const selectTextGenerationPreferences = createSelector(
  selectUserPreferences,
  (state): TextGenerationPreferences => state.textGeneration,
);

export const selectCodingPreferences = createSelector(
  selectUserPreferences,
  (state): CodingPreferences => state.coding,
);

export const selectFlashcardPreferences = createSelector(
  selectUserPreferences,
  (state): FlashcardPreferences => state.flashcard,
);

export const selectAiModelsPreferences = createSelector(
  selectUserPreferences,
  (state): AiModelsPreferences => state.aiModels,
);

export const selectSystemPreferences = createSelector(
  selectUserPreferences,
  (state): SystemPreferences => state.system,
);

export const selectDefaultContextPreferences = createSelector(
  selectUserPreferences,
  (state): AgentContextPreferences => state.agentContext,
);

// Meta selectors for async state management
export const selectPreferencesLoading = createSelector(
  selectUserPreferences,
  (state): boolean => state._meta.isLoading,
);

export const selectPreferencesError = createSelector(
  selectUserPreferences,
  (state): string | null => state._meta.error,
);

export const selectPreferencesLastSaved = createSelector(
  selectUserPreferences,
  (state): string | null => state._meta.lastSaved,
);

export const selectHasUnsavedChanges = createSelector(
  selectUserPreferences,
  (state): boolean => state._meta.hasUnsavedChanges,
);
