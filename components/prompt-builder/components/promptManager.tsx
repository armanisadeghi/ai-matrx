"use client";

import React, { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAllUserPrompts } from "@/lib/redux/slices/promptCacheSlice";
import {
  createUserPrompt,
  updateUserPrompt,
} from "@/lib/redux/thunks/promptCrudThunks";
import { PromptMessage, PromptData } from "@/features/prompts/types/core";
import PromptOverlayWrapper from "@/components/prompt-builder/components/PromptOverlayWrapper";
import CompactPromptsList from "@/components/prompt-builder/components/CompactPromptsList";

// Demo component to show usage
export default function PromptManager() {
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<PromptData | null>(null);
  const [originalPromptData, setOriginalPromptData] = useState<any>(null);
  const dispatch = useAppDispatch();
  const prompts = useAppSelector(selectAllUserPrompts);

  // Calculate dirty state
  const isDirty = useMemo(() => {
    if (!isOverlayOpen) return false;
    if (!currentPrompt && !originalPromptData) return false;
    // For new prompts, check if any content exists
    if (!currentPrompt) {
      return Boolean(
        originalPromptData?.name?.trim() ||
        originalPromptData?.messages?.some((msg) => msg.content.trim()),
      );
    }
    // For existing prompts, compare with original
    return (
      JSON.stringify({
        name: originalPromptData?.name,
        messages: originalPromptData?.messages,
        variableDefaults: originalPromptData?.variableDefaults,
      }) !==
      JSON.stringify({
        name: currentPrompt.name,
        messages: currentPrompt.messages,
        variableDefaults: currentPrompt.variableDefaults,
      })
    );
  }, [isOverlayOpen, currentPrompt, originalPromptData]);

  const handleSave = async (promptData: {
    name: string;
    messages: PromptMessage[];
    variables: string[];
    variableDefaults: Record<string, string>;
  }) => {
    try {
      if (currentPrompt) {
        // Update existing prompt
        dispatch(
          updateUserPrompt({
            id: currentPrompt.id,
            data: {
              name: promptData.name,
              messages: promptData.messages,
              variableDefaults: promptData.variableDefaults as any,
            },
          }),
        );
        console.log("Prompt updated successfully");
      } else {
        // Create new prompt
        const result = await dispatch(
          createUserPrompt({
            name: promptData.name,
            messages: promptData.messages,
            variableDefaults: promptData.variableDefaults as any,
          } as any),
        ).unwrap();
        console.log("Prompt created successfully:", result);
      }
    } catch (error) {
      console.error("Error saving prompt:", error);
    }
  };

  const handleEditPrompt = (prompt: PromptData) => {
    setCurrentPrompt(prompt);
    setOriginalPromptData({
      name: prompt.name,
      messages: prompt.messages,
      variableDefaults: prompt.variableDefaults,
    });
    setIsOverlayOpen(true);
  };

  const handleCreateNew = () => {
    setCurrentPrompt(null);
    setOriginalPromptData(null);
    setIsOverlayOpen(true);
  };

  const handleCreateWithTemplate = () => {
    setCurrentPrompt(null);
    setOriginalPromptData({
      messages: initialMessages,
    });
    setIsOverlayOpen(true);
  };

  const handleCloseOverlay = () => {
    setIsOverlayOpen(false);
    setCurrentPrompt(null);
    setOriginalPromptData(null);
  };

  const initialMessages = [
    {
      role: "system",
      content:
        "You are a helpful assistant specialized in {{domain}}.\n\nAlways respond in a {{tone}} manner.",
    },
    {
      role: "user",
      content:
        "Please help me with {{task}} using the following context:\n\n{{context}}",
    },
  ];

  const promptsList = prompts;

  return (
    <div className="p-8 min-h-dvh bg-gray-100 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">
            Prompt Management
          </h1>
          <div className="flex gap-2">
            <button
              onClick={handleCreateNew}
              className="px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-600 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create New Prompt
            </button>
            <button
              onClick={handleCreateWithTemplate}
              className="px-4 py-2 bg-green-600 dark:bg-green-500 text-white rounded hover:bg-green-700 dark:hover:bg-green-600"
            >
              Use Template
            </button>
          </div>
        </div>

        {/* Compact Prompts List */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Saved Prompts ({promptsList.length})
          </h2>
          <CompactPromptsList
            prompts={promptsList}
            onEditPrompt={handleEditPrompt}
            onCreateNew={handleCreateNew}
          />
        </div>
      </div>

      <PromptOverlayWrapper
        isOpen={isOverlayOpen}
        onClose={handleCloseOverlay}
        onSave={handleSave}
        initialMessages={originalPromptData?.messages || []}
        currentPrompt={currentPrompt}
        isDirty={isDirty}
      />
    </div>
  );
}
