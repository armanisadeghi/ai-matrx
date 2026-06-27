"use client";

import React, { useState, useEffect } from "react";
import { UniversalPromptEditor } from "../UniversalPromptEditor";
import { normalizePromptData, UniversalPromptData } from "../types";
import { createClient } from "@/utils/supabase/client";
import { toast } from "sonner";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { useModels } from "@/features/ai-models/hooks/useModels";
import { graveyardDb } from "@/utils/supabase/graveyardDb";

interface PromptEditorProps {
  promptId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess?: () => void;
  initialSelection?: any;
  promptData?: any;
  /** @deprecated Pass nothing — models come from Redux automatically */
  models?: any[];
  tools?: any[];
}

/**
 * Ready-to-use Prompt Editor Component
 *
 * Handles all CRUD operations for prompts table internally.
 * Just pass a prompt ID and it does everything.
 *
 * @example
 * ```tsx
 * <PromptEditor
 *   promptId={myPromptId}
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onSaveSuccess={() => console.log('Saved!')}
 * />
 * ```
 */
export function PromptEditor({
  promptId,
  isOpen,
  onClose,
  onSaveSuccess,
  initialSelection,
  promptData: preloadedPromptData,
  tools: preloadedTools,
}: PromptEditorProps) {
  const { models } = useModels();
  const [promptData, setPromptData] = useState<UniversalPromptData | null>(
    null,
  );
  const [tools, setTools] = useState<any[]>(preloadedTools || []);
  const [loading, setLoading] = useState(!preloadedPromptData);
  const [isSaving, setIsSaving] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (isOpen && promptId) {
      if (preloadedPromptData) {
        setPromptData(normalizePromptData(preloadedPromptData, "prompt"));
        setLoading(false);
      } else {
        loadData();
      }
    }
  }, [isOpen, promptId, preloadedPromptData]);

  async function loadData() {
    try {
      setLoading(true);

      const [toolsRes, promptRes] = await Promise.all([
        fetch("/api/tools")
          .then((r) => r.json())
          .catch(() => ({ tools: [] })),
        graveyardDb(supabase).from("prompts").select("*").eq("id", promptId).single(),
      ]);

      setTools(toolsRes?.tools || []);

      if (promptRes.data) {
        setPromptData(normalizePromptData(promptRes.data, "prompt"));
      } else {
        toast.error("Prompt not found");
        onClose();
      }
    } catch (error) {
      console.error("Failed to load prompt data:", error);
      toast.error("Failed to load prompt");
      onClose();
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(updated: UniversalPromptData) {
    setIsSaving(true);
    try {
      const { error } = await graveyardDb(supabase)
        .from("prompts")
        .update({
          name: updated.name,
          description: updated.description,
          messages: updated.messages,
          variable_defaults: updated.variable_defaults,
          settings: updated.settings,
        })
        .eq("id", promptId);

      if (error) throw error;

      toast.success("Prompt saved successfully");
      onSaveSuccess?.();
      onClose();
    } catch (error) {
      console.error("Save failed:", error);
      toast.error("Failed to save prompt");
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) return null;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
        <MatrxMiniLoader />
      </div>
    );
  }

  if (!promptData) return null;

  return (
    <UniversalPromptEditor
      isOpen={isOpen}
      onClose={onClose}
      promptData={promptData}
      models={models}
      availableTools={tools}
      onSave={handleSave}
      isSaving={isSaving}
      initialSelection={initialSelection}
    />
  );
}
