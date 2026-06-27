"use client";

import React, { useState, useEffect } from "react";
import { UniversalPromptEditor } from "../UniversalPromptEditor";
import { normalizePromptData, UniversalPromptData } from "../types";
import { createClient } from "@/utils/supabase/client";
import { toast } from "sonner";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { useModels } from "@/features/ai-models/hooks/useModels";
import { graveyardDb } from "@/utils/supabase/graveyardDb";

interface TemplateEditorProps {
  templateId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess?: () => void;
  initialSelection?: any;
  templateData?: any;
  /** @deprecated Pass nothing — models come from Redux automatically */
  models?: any[];
  tools?: any[];
}

/**
 * Ready-to-use Template Editor Component
 *
 * Handles all CRUD operations for prompt_templates table internally.
 * Just pass a template ID and it does everything.
 *
 * @example
 * ```tsx
 * <TemplateEditor
 *   templateId={myTemplateId}
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onSaveSuccess={() => console.log('Saved!')}
 * />
 * ```
 */
export function TemplateEditor({
  templateId,
  isOpen,
  onClose,
  onSaveSuccess,
  initialSelection,
  templateData: preloadedTemplateData,
  tools: preloadedTools,
}: TemplateEditorProps) {
  const { models } = useModels();
  const [templateData, setTemplateData] = useState<UniversalPromptData | null>(
    null,
  );
  const [tools, setTools] = useState<any[]>(preloadedTools || []);
  const [loading, setLoading] = useState(!preloadedTemplateData);
  const [isSaving, setIsSaving] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (isOpen && templateId) {
      if (preloadedTemplateData) {
        setTemplateData(normalizePromptData(preloadedTemplateData, "template"));
        setLoading(false);
      } else {
        loadData();
      }
    }
  }, [isOpen, templateId, preloadedTemplateData]);

  async function loadData() {
    try {
      setLoading(true);

      const [toolsRes, templateRes] = await Promise.all([
        fetch("/api/tools")
          .then((r) => r.json())
          .catch(() => ({ tools: [] })),
        graveyardDb(supabase)
          .from("prompt_templates")
          .select("*")
          .eq("id", templateId)
          .single(),
      ]);

      setTools(toolsRes?.tools || []);

      if (templateRes.data) {
        setTemplateData(normalizePromptData(templateRes.data, "template"));
      } else {
        toast.error("Template not found");
        onClose();
      }
    } catch (error) {
      console.error("Failed to load template data:", error);
      toast.error("Failed to load template");
      onClose();
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(updated: UniversalPromptData) {
    setIsSaving(true);
    try {
      const { error } = await graveyardDb(supabase)
        .from("prompt_templates")
        .update({
          name: updated.name,
          description: updated.description,
          category: updated.category,
          messages: updated.messages,
          variable_defaults: updated.variable_defaults,
          settings: updated.settings,
          is_featured: updated.is_featured,
        })
        .eq("id", templateId);

      if (error) throw error;

      toast.success("Template saved successfully");
      onSaveSuccess?.();
      onClose();
    } catch (error) {
      console.error("Save failed:", error);
      toast.error("Failed to save template");
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

  if (!templateData) return null;

  return (
    <UniversalPromptEditor
      isOpen={isOpen}
      onClose={onClose}
      promptData={templateData}
      models={models}
      availableTools={tools}
      onSave={handleSave}
      isSaving={isSaving}
      initialSelection={initialSelection}
    />
  );
}
