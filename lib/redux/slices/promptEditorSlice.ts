// @ts-nocheck

import {
  createSlice,
  createAsyncThunk,
  PayloadAction,
  createSelector,
} from "@reduxjs/toolkit";
import { createClient } from "@/utils/supabase/client";
import { graveyardDb } from "@/utils/supabase/graveyardDb";
import {
  PromptMessage,
  PromptVariable,
  PromptSettings,
  PromptData,
} from "@/features/prompts/types/core";
import { getModelDefaults } from "@/features/prompts/hooks/useModelControls";
import { selectModelById } from "@/features/ai-models/redux/modelRegistrySlice";

interface PromptEditorState {
  // Identity & Metadata (Root level)
  id: string | null;
  name: string;
  description: string;

  // Content (Root level)
  messages: PromptMessage[];
  variableDefaults: PromptVariable[];

  // Settings (Root level - includes model_id)
  settings: PromptSettings; // { model_id: string, temperature: number, ... }

  // System State
  isDirty: boolean;
  isSaving: boolean;
  isLoading: boolean;
  error: string | null;
  lastSavedAt: string | null;

  // Test/Chat State
  testMode: {
    isActive: boolean;
    conversationHistory: any[]; // Using any[] for now, should be ConversationMessage[]
    isStreaming: boolean;
    currentTaskId: string | null;
    stats: any | null; // MessageStats
  };
}

const initialState: PromptEditorState = {
  id: null,
  name: "",
  description: "",
  messages: [],
  variableDefaults: [],
  settings: {}, // model_id will be set on init
  isDirty: false,
  isSaving: false,
  isLoading: false,
  error: null,
  lastSavedAt: null,
  testMode: {
    isActive: false,
    conversationHistory: [],
    isStreaming: false,
    currentTaskId: null,
    stats: null,
  },
};

// Thunks

export const initializePromptEditor = createAsyncThunk(
  "promptEditor/initialize",
  async (id: string | undefined, { dispatch, rejectWithValue }) => {
    try {
      // We assume fetchAvailableModels has been dispatched by the container or parent

      if (!id) {
        // New prompt - set defaults
        return null;
      }

      const supabase = createClient();
      const { data, error } = await graveyardDb(supabase)
        .from("prompts")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      return data;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

export const savePrompt = createAsyncThunk(
  "promptEditor/save",
  async (_, { getState, rejectWithValue }) => {
    try {
      const state = getState() as {
        promptEditor: PromptEditorState;
        userAuth: { id: string | null };
      };
      const { id, name, description, messages, variableDefaults, settings } =
        state.promptEditor;
      const userId = state.userAuth.id;
      if (!userId) throw new Error("User not authenticated");

      const supabase = createClient();

      const payload = {
        name,
        description,
        messages,
        variable_defaults: variableDefaults,
        settings,
        updated_at: new Date().toISOString(),
      };

      let result;
      if (id) {
        // Update
        const { data, error } = await graveyardDb(supabase)
          .from("prompts")
          .update(payload)
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        result = data;
      } else {
        // Insert
        const { data, error } = await graveyardDb(supabase)
          .from("prompts")
          .insert({
            ...payload,
            user_id: userId,
          })
          .select()
          .single();

        if (error) throw error;
        result = data;
      }

      return result;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

export const switchModel = createAsyncThunk(
  "promptEditor/switchModel",
  async (newModelId: string, { getState, dispatch }) => {
    const state = getState() as { promptEditor: PromptEditorState };
    const currentSettings = state.promptEditor.settings;
    const newModel = selectModelById(state as any, newModelId); // Cast to any to avoid circular type issues if strict

    if (!newModel) {
      throw new Error(`Model ${newModelId} not found`);
    }

    // Get defaults for the new model
    const newDefaults = getModelDefaults(newModel);

    // Smart migration: Preserve common settings if valid
    const mergedSettings: PromptSettings = {
      ...(newDefaults as Partial<PromptSettings>),
      model_id: newModelId,
    };

    // List of keys to try to preserve
    const keysToPreserve: (keyof PromptSettings)[] = [
      "temperature",
      "max_output_tokens",
      "top_p",
      "top_k",
      "stream",
      "image_urls", // Capabilities
      "tools", // Capabilities
    ];

    keysToPreserve.forEach((key) => {
      if (currentSettings[key] !== undefined) {
        // Check if the new model supports this key (exists in defaults or controls)
        // For simplicity, we check if it's in newDefaults or if the model has a control for it
        // But getModelDefaults returns the valid submission keys.

        // If it's a numeric value, we might need to clamp it
        // If it's a numeric value, we might need to clamp it
        if (
          typeof currentSettings[key] === "number" &&
          typeof newDefaults[key] === "number"
        ) {
          // Logic to clamp could be added here if we had min/max in defaults
          // For now, we just copy it if it exists in both
          (mergedSettings as any)[key] = currentSettings[key];
        } else if (key === "tools") {
          // Only preserve tools if new model supports tools
          const controls =
            typeof newModel.controls === "object" && newModel.controls !== null
              ? (newModel.controls as Record<string, unknown>)
              : undefined;
          const toolsControl =
            controls &&
            typeof controls.tools === "object" &&
            controls.tools !== null
              ? (controls.tools as Record<string, unknown>)
              : undefined;
          if (toolsControl?.allowed || toolsControl?.default) {
            mergedSettings.tools = currentSettings.tools;
          } else {
            mergedSettings.tools = [];
          }
        } else {
          // General copy
          (mergedSettings as any)[key] = currentSettings[key];
        }
      }
    });

    return mergedSettings;
  },
);

const promptEditorSlice = createSlice({
  name: "promptEditor",
  initialState,
  reducers: {
    setName: (state, action: PayloadAction<string>) => {
      state.name = action.payload;
      state.isDirty = true;
    },
    setDescription: (state, action: PayloadAction<string>) => {
      state.description = action.payload;
      state.isDirty = true;
    },
    updateSettings: (state, action: PayloadAction<Partial<PromptSettings>>) => {
      state.settings = { ...state.settings, ...action.payload };
      state.isDirty = true;
    },
    setMessages: (state, action: PayloadAction<PromptMessage[]>) => {
      state.messages = action.payload;
      state.isDirty = true;
    },
    updateMessage: (
      state,
      action: PayloadAction<{ index: number; message: Partial<PromptMessage> }>,
    ) => {
      const { index, message } = action.payload;
      if (state.messages[index]) {
        state.messages[index] = { ...state.messages[index], ...message };
        state.isDirty = true;
      }
    },
    addMessage: (state, action: PayloadAction<PromptMessage>) => {
      state.messages.push(action.payload);
      state.isDirty = true;
    },
    deleteMessage: (state, action: PayloadAction<number>) => {
      state.messages.splice(action.payload, 1);
      state.isDirty = true;
    },
    setVariableDefaults: (state, action: PayloadAction<PromptVariable[]>) => {
      state.variableDefaults = action.payload;
      state.isDirty = true;
    },
    addVariable: (state, action: PayloadAction<PromptVariable>) => {
      state.variableDefaults.push(action.payload);
      state.isDirty = true;
    },
    removeVariable: (state, action: PayloadAction<string>) => {
      state.variableDefaults = state.variableDefaults.filter(
        (v) => v.name !== action.payload,
      );
      state.isDirty = true;
    },
    updateVariable: (
      state,
      action: PayloadAction<{ name: string; updates: Partial<PromptVariable> }>,
    ) => {
      const { name, updates } = action.payload;
      const index = state.variableDefaults.findIndex((v) => v.name === name);
      if (index !== -1) {
        state.variableDefaults[index] = {
          ...state.variableDefaults[index],
          ...updates,
        };
        state.isDirty = true;
      }
    },
    // Test Mode Reducers
    setTestModeActive: (state, action: PayloadAction<boolean>) => {
      state.testMode.isActive = action.payload;
    },
    addConversationMessage: (state, action: PayloadAction<any>) => {
      state.testMode.conversationHistory.push(action.payload);
    },
    clearConversation: (state) => {
      state.testMode.conversationHistory = [];
      state.testMode.currentTaskId = null;
      state.testMode.stats = null;
    },
    setCurrentTaskId: (state, action: PayloadAction<string | null>) => {
      state.testMode.currentTaskId = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // Initialize
      .addCase(initializePromptEditor.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(initializePromptEditor.fulfilled, (state, action) => {
        state.isLoading = false;
        if (action.payload) {
          // Load existing
          state.id = action.payload.id;
          state.name = action.payload.name || "";
          state.description = action.payload.description || "";
          state.messages = (
            Array.isArray(action.payload.messages)
              ? action.payload.messages
              : []
          ) as PromptMessage[];
          state.variableDefaults = (
            Array.isArray(action.payload.variable_defaults)
              ? action.payload.variable_defaults
              : []
          ) as PromptVariable[];
          state.settings = action.payload.settings || {};
          state.lastSavedAt = action.payload.updated_at;
        } else {
          // New prompt - reset to defaults (except maybe keep some UI state?)
          // Actually, we should probably reset everything to be safe
          state.id = null;
          state.name = "";
          state.description = "";
          state.messages = [];
          state.variableDefaults = [];
          state.settings = {}; // Will be populated by default model selection in UI or separate action
          state.lastSavedAt = null;
        }
        state.isDirty = false;
      })
      .addCase(initializePromptEditor.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Save
      .addCase(savePrompt.pending, (state) => {
        state.isSaving = true;
        state.error = null;
      })
      .addCase(savePrompt.fulfilled, (state, action) => {
        state.isSaving = false;
        state.isDirty = false;
        state.lastSavedAt = action.payload.updated_at;
        if (!state.id) {
          state.id = action.payload.id;
        }
      })
      .addCase(savePrompt.rejected, (state, action) => {
        state.isSaving = false;
        state.error = action.payload as string;
      })
      // Switch Model
      .addCase(switchModel.fulfilled, (state, action) => {
        state.settings = action.payload;
        state.isDirty = true;
      });
  },
});

export const {
  setName,
  setDescription,
  updateSettings,
  setMessages,
  updateMessage,
  addMessage,
  deleteMessage,
  setVariableDefaults,
  addVariable,
  removeVariable,
  updateVariable,
  setTestModeActive,
  addConversationMessage,
  clearConversation,
  setCurrentTaskId,
} = promptEditorSlice.actions;

export default promptEditorSlice.reducer;

// Selectors
type WithPromptEditor = { promptEditor: PromptEditorState };

export const selectPromptEditorState = (state: WithPromptEditor) =>
  state.promptEditor;
export const selectPromptId = (state: WithPromptEditor) =>
  state.promptEditor.id;
export const selectPromptName = (state: WithPromptEditor) =>
  state.promptEditor.name;
export const selectPromptDescription = (state: WithPromptEditor) =>
  state.promptEditor.description;
export const selectPromptMessages = (state: WithPromptEditor) =>
  state.promptEditor.messages;
export const selectPromptVariables = (state: WithPromptEditor) =>
  state.promptEditor.variableDefaults;
export const selectPromptSettings = (state: WithPromptEditor) =>
  state.promptEditor.settings;
export const selectSelectedModelId = (state: WithPromptEditor) =>
  state.promptEditor.settings.model_id;
export const selectPromptStatus = createSelector(
  [
    (state: WithPromptEditor) => state.promptEditor.isDirty,
    (state: WithPromptEditor) => state.promptEditor.isSaving,
    (state: WithPromptEditor) => state.promptEditor.isLoading,
    (state: WithPromptEditor) => state.promptEditor.error,
    (state: WithPromptEditor) => state.promptEditor.lastSavedAt,
  ],
  (isDirty, isSaving, isLoading, error, lastSavedAt) => ({
    isDirty,
    isSaving,
    isLoading,
    error,
    lastSavedAt,
  }),
);
export const selectTestModeState = (state: WithPromptEditor) =>
  state.promptEditor.testMode;
export const selectConversationMessages = (state: WithPromptEditor) =>
  state.promptEditor.testMode.conversationHistory;
