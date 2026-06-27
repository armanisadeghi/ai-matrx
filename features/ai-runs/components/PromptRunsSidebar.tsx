"use client";

import React, { useState, useEffect } from "react";
import { History, ChevronDown, FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { graveyardDb } from "@/utils/supabase/graveyardDb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RunsList } from "./RunsList";
import { aiRunsService } from "../services/ai-runs-service";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

interface PromptRunsSidebarProps {
  promptId: string;
  promptName: string;
  currentRunId?: string;
  onRunSelect?: (runId: string) => void;
  onNewRun?: () => void;
  footer?: React.ReactNode; // Optional footer content for testing/additional features
}

interface PromptListItem {
  id: string;
  name: string;
  description: string | null;
}

export function PromptRunsSidebar({
  promptId,
  promptName,
  currentRunId,
  onRunSelect,
  onNewRun,
  footer,
}: PromptRunsSidebarProps) {
  const router = useRouter();
  const [prompts, setPrompts] = useState<PromptListItem[]>([]);
  const [isLoadingPrompts, setIsLoadingPrompts] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Fetch all prompts for the dropdown
  useEffect(() => {
    const fetchPrompts = async () => {
      setIsLoadingPrompts(true);
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { data, error } = await graveyardDb(supabase)
          .from("prompts")
          .select("id, name, description")
          .eq("user_id", user?.id)
          .order("name", { ascending: true });

        if (error) throw error;

        setPrompts(data || []);
      } catch (error) {
        console.error("Error fetching prompts:", error);
      } finally {
        setIsLoadingPrompts(false);
      }
    };

    fetchPrompts();
  }, []);

  // Always show runs for current prompt
  const filters = {
    source_type: "prompts" as const,
    source_id: promptId,
    limit: 20,
  };

  const handleRunStar = async (runId: string) => {
    try {
      await aiRunsService.toggleStar(runId);
      // Trigger immediate refresh by changing the key
      setRefreshTrigger((prev) => prev + 1);
    } catch (error) {
      console.error("Error toggling star:", error);
    }
  };

  const handlePromptChange = (newPromptId: string) => {
    // Navigate to the new prompt's run page
    router.push(`/ai/prompts/run/${newPromptId}`);
  };

  return (
    <div className="h-full flex flex-col bg-textured border-r border-border">
      {/* Compact Header */}
      <div className="flex-shrink-0 border-b border-border px-2.5 py-2">
        <div className="flex items-center justify-between gap-1.5 mb-2">
          <div className="flex items-center gap-1.5">
            <History className="w-4 h-4 text-gray-600 dark:text-gray-400 flex-shrink-0" />
            <h2 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
              Runs
            </h2>
          </div>
          {onNewRun && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onNewRun}
              className="h-6 px-2 text-xs"
              title="Start new run"
            >
              <FilePlus className="w-3.5 h-3.5 mr-1" />
              New
            </Button>
          )}
        </div>

        {/* Prompt selector - shows current prompt with dropdown to switch */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between text-xs h-7 px-2"
              disabled={isLoadingPrompts}
            >
              <span className="truncate">{promptName}</span>
              <ChevronDown className="w-3 h-3 ml-1 flex-shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-[240px] max-h-[300px] overflow-y-auto"
          >
            {prompts.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400">
                {isLoadingPrompts ? "Loading..." : "No prompts found"}
              </div>
            ) : (
              prompts.map((prompt) => (
                <DropdownMenuItem
                  key={prompt.id}
                  onClick={() => handlePromptChange(prompt.id)}
                  disabled={prompt.id === promptId}
                  className={cn(
                    prompt.id === promptId && "bg-blue-50 dark:bg-blue-950/30",
                  )}
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-medium text-xs truncate">
                      {prompt.name}
                    </span>
                    {prompt.description && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {prompt.description}
                      </span>
                    )}
                  </div>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Runs list */}
      <div className="flex-1 overflow-hidden" key={refreshTrigger}>
        <RunsList
          filters={filters}
          activeRunId={currentRunId}
          onRunClick={onRunSelect}
          onRunStar={handleRunStar}
          compact
          emptyMessage="No runs yet"
          emptySubmessage="Start a conversation"
        />
      </div>

      {/* Optional footer */}
      {footer && (
        <div className="flex-shrink-0 border-t border-border">{footer}</div>
      )}
    </div>
  );
}
