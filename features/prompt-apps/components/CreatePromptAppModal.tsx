"use client";

import { useState, useEffect } from "react";
import { graveyardDb } from "@/utils/supabase/graveyardDb";
import FullScreenOverlay, {
  TabDefinition,
} from "@/components/official/FullScreenOverlay";
import { CreatePromptAppForm } from "./CreatePromptAppForm";
import { AutoCreatePromptAppForm } from "./AutoCreatePromptAppForm";
import { SearchablePromptSelect } from "./SearchablePromptSelect";
import { supabase } from "@/utils/supabase/client";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { requireUserId } from "@/utils/auth/getUserId";

interface CreatePromptAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** If provided, this prompt will be pre-selected */
  promptId?: string;
  /** Full prompt object for auto-create functionality */
  prompt?: any;
}

export function CreatePromptAppModal({
  isOpen,
  onClose,
  promptId,
  prompt: promptProp,
}: CreatePromptAppModalProps) {
  const [prompts, setPrompts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState<string | undefined>(
    promptId,
  );
  const [selectedPrompt, setSelectedPrompt] = useState<any>(promptProp);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  // Sync preselected prompt once prompts are loaded
  useEffect(() => {
    if (prompts.length > 0 && promptId && !selectedPrompt) {
      const found = prompts.find((p) => p.id === promptId);
      if (found) setSelectedPrompt(found);
    }
  }, [prompts, promptId, selectedPrompt]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const userId = requireUserId();

      const { data: promptsData, error: promptsError } = await graveyardDb(supabase)
        .from("prompts")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (promptsError) throw promptsError;

      const { data: categoriesData } = await graveyardDb(supabase)
        .from("prompt_app_categories")
        .select("*")
        .order("sort_order");

      setPrompts(promptsData || []);
      setCategories(categoriesData || []);
    } catch (err) {
      console.error("Error loading data:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePromptChange = (id: string, prompt: any) => {
    setSelectedPromptId(id);
    setSelectedPrompt(prompt);
  };

  const promptSelector = isLoading ? (
    <div className="flex items-center gap-2 px-6 pt-4 pb-2">
      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      <span className="text-sm text-muted-foreground">Loading prompts...</span>
    </div>
  ) : error ? null : (
    <div className="px-6 pt-4 pb-3 space-y-2 border-b border-border">
      <Label className="text-sm font-semibold">Select Your Prompt</Label>
      <SearchablePromptSelect
        prompts={prompts}
        value={selectedPromptId}
        onChange={handlePromptChange}
        placeholder="Choose the prompt to power your app..."
      />
      {prompts.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {prompts.length} prompt{prompts.length !== 1 ? "s" : ""} available
        </p>
      )}
    </div>
  );

  const tabs: TabDefinition[] = [
    {
      id: "auto",
      label: "Auto Create",
      content: isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-destructive font-semibold">{error}</p>
            <button
              onClick={loadData}
              className="mt-4 text-sm text-primary hover:underline"
            >
              Try Again
            </button>
          </div>
        </div>
      ) : (
        <div className="p-6">
          <AutoCreatePromptAppForm
            prompt={selectedPrompt}
            prompts={prompts}
            categories={categories}
            onSuccess={onClose}
          />
        </div>
      ),
    },
    {
      id: "manual",
      label: "Create Manually",
      content: isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-destructive font-semibold">{error}</p>
            <button
              onClick={loadData}
              className="mt-4 text-sm text-primary hover:underline"
            >
              Try Again
            </button>
          </div>
        </div>
      ) : (
        <div className="p-6">
          <CreatePromptAppForm
            prompts={prompts}
            categories={categories}
            preselectedPromptId={selectedPromptId}
            onSuccess={onClose}
          />
        </div>
      ),
    },
  ];

  return (
    <FullScreenOverlay
      isOpen={isOpen}
      onClose={onClose}
      title=""
      description="Turn your prompt into a shareable web app"
      tabs={tabs}
      sharedHeader={promptSelector}
      showCancelButton
      cancelButtonLabel="Close"
      onCancel={onClose}
      width="90vw"
      height="90dvh"
    />
  );
}
