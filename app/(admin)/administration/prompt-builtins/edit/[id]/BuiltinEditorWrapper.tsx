"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PromptBuilder } from "@/features/prompts/components/builder/PromptBuilder";
import type {
  PromptMessage,
  PromptVariable,
} from "@/features/prompts/types/core";
import type { Json } from "@/types/database.types";

interface BuiltinEditorWrapperProps {
  builtinId: string;
  models: any[];
  initialData: {
    id?: string;
    name?: string;
    version?: number;
    updatedAt?: string;
    messages?: Json | null;
    variableDefaults?: Json | null;
    settings?: Json | null;
    tags?: string[];
    category?: string;
    isFavorite?: boolean;
    isArchived?: boolean;
    modelId?: string;
    outputFormat?: string;
    outputSchema?: Json | null;
    description?: string;
  };
  availableTools?: any[];
}

export function BuiltinEditorWrapper({
  builtinId,
  models,
  initialData,
  availableTools,
}: BuiltinEditorWrapperProps) {
  const router = useRouter();

  const handleBuiltinSave = async (data: {
    id?: string;
    name: string;
    messages: PromptMessage[];
    variableDefaults: PromptVariable[];
    settings: Record<string, unknown>;
  }) => {
    const response = await fetch(`/api/admin/prompt-builtins/${builtinId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        description: initialData.description,
        messages: data.messages,
        variable_defaults: data.variableDefaults,
        settings: data.settings,
        tags: initialData.tags,
        category: initialData.category,
        model_id: (data.settings.model_id as string) ?? initialData.modelId,
        is_favorite: initialData.isFavorite,
        is_archived: initialData.isArchived,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(
        (err as { error?: string }).error ||
          `Failed to save builtin (${response.status})`,
      );
    }

    toast.success("Builtin saved successfully");
  };

  return (
    <PromptBuilder
      models={models}
      initialData={initialData}
      availableTools={availableTools}
      onCustomSave={handleBuiltinSave}
      contextLabel="Prompt Builtins"
      backHref="/administration/prompt-builtins/builtins"
    />
  );
}
