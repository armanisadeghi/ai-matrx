"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  initializePromptEditor,
  savePrompt,
  selectPromptName,
  selectPromptStatus,
  setName,
  selectPromptId,
  selectPromptSettings,
} from "@/lib/redux/slices/promptEditorSlice";
import { fetchAvailableModels } from "@/features/ai-models/redux/modelRegistrySlice";
import { PromptMessageList } from "./PromptMessageList";
import { PromptVariableManager } from "./PromptVariableManager";
import { PromptTestPanel } from "./PromptTestPanel";
import {
  AgentSettingsBridge,
  BUILDER_AGENT_ID_PREFIX,
} from "./AgentSettingsBridge";
import { AgentSettingsPanelInline } from "./AgentSettingsPanelWrapper";
import { AgentSettingsModalButton } from "@/features/agent-settings/components/AgentSettingsModal";
import { fetchAvailableTools } from "@/lib/redux/slices/agent-settings/agentSettingsSlice";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Save,
  Loader2,
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import Link from "next/link";
import { usePromptsBasePath } from "../../hooks/usePromptsBasePath";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface PromptBuilderReduxProps {
  promptId?: string;
}

export const PromptBuilderRedux: React.FC<PromptBuilderReduxProps> = ({
  promptId,
}) => {
  const dispatch = useAppDispatch();
  const name = useAppSelector(selectPromptName);
  const status = useAppSelector(selectPromptStatus);
  const id = useAppSelector(selectPromptId);
  const promptSettings = useAppSelector(selectPromptSettings);
  const basePath = usePromptsBasePath();

  // Stable agentId for this builder session — keyed by prompt ID
  const agentId = useMemo(
    () => `${BUILDER_AGENT_ID_PREFIX}${id ?? "new"}`,
    [id],
  );

  const [activeTab, setActiveTab] = useState("settings");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    dispatch(fetchAvailableModels());
    dispatch(fetchAvailableTools());
    dispatch(initializePromptEditor(promptId));
  }, [dispatch, promptId]);

  const handleSave = async () => {
    try {
      await dispatch(savePrompt()).unwrap();
      toast.success("Prompt saved successfully");
    } catch {
      toast.error("Failed to save prompt");
    }
  };

  if (status.isLoading) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status.error) {
    return (
      <div className="flex flex-col items-center justify-center h-dvh space-y-4">
        <div className="text-destructive font-medium">Error loading prompt</div>
        <div className="text-muted-foreground">{status.error}</div>
        <Link href={basePath}>
          <Button variant="outline">Back to Prompts</Button>
        </Link>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col h-[calc(100dvh-var(--header-height,2.5rem))] bg-textured text-foreground overflow-hidden">
        {/*
         * Bridge: invisible — syncs promptEditorSlice ↔ agentSettingsSlice.
         * Only mounted after the prompt has loaded (id is set or it's a new prompt).
         */}
        {!status.isLoading && <AgentSettingsBridge agentId={agentId} />}

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="flex items-center justify-between px-3 py-2 border-b bg-card shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link href={basePath}>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>

            {/* Sidebar collapse toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setSidebarCollapsed((v) => !v)}
                >
                  {sidebarCollapsed ? (
                    <PanelLeftOpen className="h-4 w-4" />
                  ) : (
                    <PanelLeftClose className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
              </TooltipContent>
            </Tooltip>

            <div className="flex items-center gap-2 min-w-0">
              <Input
                value={name}
                onChange={(e) => dispatch(setName(e.target.value))}
                className="h-7 w-52 text-sm font-medium min-w-0"
                placeholder="Prompt Name"
              />
              {status.isDirty && (
                <span className="text-xs text-muted-foreground italic shrink-0">
                  Unsaved
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Modal settings trigger — always accessible even when sidebar is collapsed */}
            <AgentSettingsModalButton
              agentId={agentId}
              label="Settings"
              showTools
              showVariables
              showParams
            />

            <Button
              onClick={handleSave}
              disabled={status.isSaving || !status.isDirty}
              size="sm"
              className="h-7 text-xs"
            >
              {status.isSaving ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1.5" />
              )}
              Save
            </Button>
          </div>
        </header>

        {/* ── Main Content ─────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* ── Left sidebar — collapsible ──────────────────────────────── */}
          <div
            className={cn(
              "shrink-0 flex flex-col border-r overflow-hidden transition-all duration-200",
              sidebarCollapsed ? "w-0" : "w-72",
            )}
          >
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="h-full flex flex-col overflow-hidden"
            >
              <div className="px-2 py-2 border-b shrink-0">
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="settings" className="text-xs">
                    Settings
                  </TabsTrigger>
                  <TabsTrigger value="variables" className="text-xs">
                    Variables
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 min-h-0 overflow-hidden">
                {/* New agentSettings-powered settings panel */}
                <TabsContent
                  value="settings"
                  className="h-full m-0 border-0 data-[state=inactive]:hidden"
                >
                  <AgentSettingsPanelInline agentId={agentId} />
                </TabsContent>

                <TabsContent
                  value="variables"
                  className="h-full m-0 border-0 data-[state=inactive]:hidden"
                >
                  <PromptVariableManager />
                </TabsContent>
              </div>
            </Tabs>
          </div>

          {/* ── Center + Right: resizable ───────────────────────────────── */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <ResizablePanelGroup
              orientation="horizontal"
              style={{ height: "100%" }}
            >
              <ResizablePanel defaultSize={55} minSize={30}>
                <div className="h-full overflow-hidden p-4 bg-muted/10">
                  <PromptMessageList />
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              <ResizablePanel defaultSize={45} minSize={25}>
                <div className="h-full overflow-hidden border-l">
                  <PromptTestPanel />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};
