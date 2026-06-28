import React, { useState } from "react";
import {
  GitCompare,
  Hammer,
  BarChart,
  Save,
  Maximize2,
  Settings,
  MoreHorizontal,
  Edit3,
  Play,
  Route,
  AppWindow,
  LayoutTemplate,
  Code2,
  ChevronLeft,
  Copy,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectIsOverlayOpen } from "@/lib/redux/slices/overlaySlice";
import { SystemPromptOptimizer } from "@/features/prompts/components/actions/prompt-optimizers/SystemPromptOptimizer";
import { PromptActionsMenu } from "@/features/prompts/components/layouts/PromptActionsMenu";
import { usePromptRunner } from "@/features/prompts/hooks/usePromptRunner";
import { PromptModeNavigation } from "@/features/prompts/components/PromptModeNavigation";
import { usePromptsBasePath } from "../../hooks/usePromptsBasePath";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { toast } from "sonner";

interface PromptBuilderHeaderCompactProps {
  promptName: string;
  onPromptNameChange: (value: string) => void;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onOpenFullScreenEditor?: () => void;
  onOpenSettings?: () => void;
  developerMessage: string;
  onDeveloperMessageChange: (value: string) => void;
  fullPromptObject?: any;
  onAcceptFullPrompt?: (optimizedObject: any) => void;
  onAcceptAsCopy?: (optimizedObject: any) => void;
  // Mobile tab support
  mobileActiveTab?: "edit" | "test";
  onMobileTabChange?: (tab: "edit" | "test") => void;
  promptId?: string; // For mode switcher
}

export function PromptBuilderHeaderCompact({
  promptName,
  onPromptNameChange,
  isDirty,
  isSaving,
  onSave,
  onOpenFullScreenEditor,
  onOpenSettings,
  developerMessage,
  onDeveloperMessageChange,
  fullPromptObject,
  onAcceptFullPrompt,
  onAcceptAsCopy,
  mobileActiveTab = "edit",
  onMobileTabChange,
  promptId,
}: PromptBuilderHeaderCompactProps) {
  const router = useRouter();
  const { openPrompt } = usePromptRunner();
  const dispatch = useAppDispatch();
  const basePath = usePromptsBasePath();
  const [isOptimizerOpen, setIsOptimizerOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isDuplicatingMobile, setIsDuplicatingMobile] = useState(false);
  const isAdminMode = useAppSelector((state) =>
    selectIsOverlayOpen(state, "adminIndicator"),
  );

  const handleMobileDuplicate = async () => {
    if (!fullPromptObject?.id || !fullPromptObject?.name) return;
    setIsDuplicatingMobile(true);
    setIsMobileDrawerOpen(false);
    try {
      const result = await dispatch(
        createUserPrompt({
          name: `${fullPromptObject.name} (Copy)`,
          description: fullPromptObject.description,
          messages: fullPromptObject.messages || [],
          variableDefaults: fullPromptObject.variableDefaults || [],
          settings: fullPromptObject.settings || {},
        }),
      ).unwrap();
      if (result?.id) {
        toast.success("Prompt duplicated!", {
          description: "Redirecting to your copy...",
        });
        router.push(`${basePath}/edit/${result.id}`);
      }
    } catch (error) {
      console.error("Error duplicating prompt:", error);
      toast.error("Failed to duplicate prompt");
    } finally {
      setIsDuplicatingMobile(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2 h-full w-full overflow-hidden">
        {/* Mobile - Left: Back chevron + status */}
        <div className="md:hidden flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 rounded-full text-muted-foreground hover:text-foreground"
            onClick={() => router.push(basePath)}
            title="Back to Prompts"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {isDirty && (
            <div
              className="w-2 h-2 bg-orange-500 rounded-full"
              title="Unsaved changes"
            />
          )}
        </div>

        {/* Mobile - Center: Tab Toggle */}
        {onMobileTabChange && (
          <div className="md:hidden flex items-center gap-1 bg-muted rounded-md p-0.5 flex-shrink-0">
            <button
              onClick={() => onMobileTabChange("edit")}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                mobileActiveTab === "edit"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Edit3 className="h-3 w-3 inline mr-1" />
              Edit
            </button>
            <button
              onClick={() => onMobileTabChange("test")}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                mobileActiveTab === "test"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Play className="h-3 w-3 inline mr-1" />
              Test
            </button>
          </div>
        )}

        {/* Mobile - Right: Actions drawer trigger */}
        <div className="md:hidden flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 rounded-full text-muted-foreground hover:text-foreground"
            onClick={() => setIsMobileDrawerOpen(true)}
            title="Actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>

        {/* Desktop - Inline controls with tighter spacing */}
        <div className="hidden md:flex items-center gap-1 flex-1 min-w-0">
          {/* Left: Unified navigation (only if we have promptId) */}
          {promptId ? (
            <div className="flex-1 min-w-0">
              <PromptModeNavigation
                promptId={promptId}
                promptName={promptName}
                currentMode="edit"
                onPromptNameChange={onPromptNameChange}
              />
            </div>
          ) : (
            /* Fallback for new prompts without ID */
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground flex-shrink-0"
                title="Back to Prompts"
                onClick={() => router.push(basePath)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <div className="h-6 w-px bg-border flex-shrink-0 mx-1" />
              {/* Prompt name input - compact */}
              <input
                type="text"
                value={promptName}
                onChange={(e) => onPromptNameChange(e.target.value)}
                className="text-sm font-medium bg-transparent border border-border min-w-0 text-gray-900 dark:text-gray-100 px-2 py-1 rounded max-w-[180px] xl:max-w-[240px]"
                placeholder="Untitled prompt"
              />
            </>
          )}

          {/* Status indicators - compact */}
          <div className="flex items-center gap-1">
            <span className="px-1.5 py-0.5 text-[10px] border border-border text-gray-600 dark:text-gray-400 rounded">
              Draft
            </span>
            {isDirty && (
              <span className="px-1.5 py-0.5 text-[10px] border border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 rounded">
                Unsaved
              </span>
            )}
          </div>

          {/* Action buttons - compact */}
          <div className="flex items-center gap-0.5 ml-2">
            {onOpenSettings && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 rounded-full hover:bg-accent"
                onClick={onOpenSettings}
                title="Settings"
              >
                <Settings className="h-3 w-3" />
              </Button>
            )}
            {onOpenFullScreenEditor && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 rounded-full hover:bg-accent"
                onClick={onOpenFullScreenEditor}
                title="Full Editor"
              >
                <Maximize2 className="h-3 w-3" />
              </Button>
            )}

            {/* Secondary actions - only show on larger screens */}
            <div className="hidden lg:flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 rounded-full hover:bg-accent"
                onClick={() => setIsOptimizerOpen(true)}
                title="Optimize System Message"
              >
                <Hammer className="h-3 w-3" />
              </Button>
              {isAdminMode && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 rounded-full hover:bg-amber-50 dark:hover:bg-amber-950"
                    title="Compare (Admin Only)"
                  >
                    <GitCompare className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 rounded-full hover:bg-amber-50 dark:hover:bg-amber-950"
                    title="Evaluate (Admin Only)"
                  >
                    <BarChart className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                  </Button>
                </>
              )}
            </div>

            {/* Actions Menu - visible on all screens */}
            {fullPromptObject?.id && (
              <PromptActionsMenu
                promptId={fullPromptObject.id}
                promptData={{
                  name: fullPromptObject.name,
                  description: fullPromptObject.description,
                  messages: fullPromptObject.messages,
                  variableDefaults: fullPromptObject.variableDefaults,
                  settings: fullPromptObject.settings,
                  tools: fullPromptObject.tools,
                }}
                triggerClassName=""
              />
            )}

            {/* Save button - always visible */}
            <Button
              onClick={onSave}
              disabled={isSaving || !isDirty}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white h-7 px-2 ml-1 text-xs"
            >
              <Save className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      <SystemPromptOptimizer
        isOpen={isOptimizerOpen}
        onClose={() => setIsOptimizerOpen(false)}
        currentSystemMessage={developerMessage}
        onAccept={(optimizedText) => {
          onDeveloperMessageChange(optimizedText);
        }}
        fullPromptObject={fullPromptObject}
        onAcceptFullPrompt={onAcceptFullPrompt}
        onAcceptAsCopy={onAcceptAsCopy}
      />

      {/* Mobile Actions Drawer */}
      <Drawer open={isMobileDrawerOpen} onOpenChange={setIsMobileDrawerOpen}>
        <DrawerContent className="pb-safe">
          <DrawerHeader className="pb-2">
            <DrawerTitle>Actions</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-1 px-4 pb-6">
            {promptId && (
              <DrawerClose asChild>
                <button
                  onClick={() => router.push(`${basePath}/run/${promptId}`)}
                  className="flex items-center gap-3 w-full h-12 px-3 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  <Play className="h-4 w-4 text-muted-foreground" />
                  Switch to Run Mode
                </button>
              </DrawerClose>
            )}
            {onOpenSettings && (
              <DrawerClose asChild>
                <button
                  onClick={onOpenSettings}
                  className="flex items-center gap-3 w-full h-12 px-3 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  Settings
                </button>
              </DrawerClose>
            )}
            {onOpenFullScreenEditor && (
              <DrawerClose asChild>
                <button
                  onClick={onOpenFullScreenEditor}
                  className="flex items-center gap-3 w-full h-12 px-3 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  <Maximize2 className="h-4 w-4 text-muted-foreground" />
                  Full Editor
                </button>
              </DrawerClose>
            )}
            <DrawerClose asChild>
              <button
                onClick={() => setIsOptimizerOpen(true)}
                className="flex items-center gap-3 w-full h-12 px-3 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                <Hammer className="h-4 w-4 text-muted-foreground" />
                Optimize
              </button>
            </DrawerClose>
            {isAdminMode && (
              <>
                <button className="flex items-center gap-3 w-full h-12 px-3 rounded-lg text-sm font-medium text-amber-600 dark:text-amber-400 hover:bg-muted transition-colors">
                  <GitCompare className="h-4 w-4" />
                  Compare
                </button>
                <button className="flex items-center gap-3 w-full h-12 px-3 rounded-lg text-sm font-medium text-amber-600 dark:text-amber-400 hover:bg-muted transition-colors">
                  <BarChart className="h-4 w-4" />
                  Evaluate
                </button>
              </>
            )}
            {fullPromptObject?.id && (
              <>
                <div className="h-px bg-border my-1" />
                <DrawerClose asChild>
                  <button
                    onClick={() => {
                      openPrompt({
                        promptId: fullPromptObject.id,
                        executionConfig: {
                          auto_run: false,
                          allow_chat: true,
                          show_variables: true,
                          apply_variables: false,
                          track_in_runs: true,
                          use_pre_execution_input: false,
                        },
                      });
                    }}
                    className="flex items-center gap-3 w-full h-12 px-3 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    <Play className="h-4 w-4 text-muted-foreground" />
                    Open Run Modal
                  </button>
                </DrawerClose>
                <DrawerClose asChild>
                  <button
                    onClick={() =>
                      router.push(`${basePath}/run/${fullPromptObject.id}`)
                    }
                    className="flex items-center gap-3 w-full h-12 px-3 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    <Route className="h-4 w-4 text-muted-foreground" />
                    Go To Run Page
                  </button>
                </DrawerClose>
                <button
                  onClick={handleMobileDuplicate}
                  disabled={isDuplicatingMobile}
                  className="flex items-center gap-3 w-full h-12 px-3 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isDuplicatingMobile ? (
                    <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted-foreground" />
                  )}
                  Duplicate
                </button>
                <DrawerClose asChild>
                  <button
                    onClick={() =>
                      router.push(
                        `/prompt-apps/new?promptId=${fullPromptObject.id}`,
                      )
                    }
                    className="flex items-center gap-3 w-full h-12 px-3 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    <AppWindow className="h-4 w-4 text-muted-foreground" />
                    Create App
                  </button>
                </DrawerClose>
                {isAdminMode && (
                  <>
                    <button className="flex items-center gap-3 w-full h-12 px-3 rounded-lg text-sm font-medium text-amber-600 dark:text-amber-400 hover:bg-muted transition-colors">
                      <LayoutTemplate className="h-4 w-4" />
                      Convert to Template
                    </button>
                    <button className="flex items-center gap-3 w-full h-12 px-3 rounded-lg text-sm font-medium text-amber-600 dark:text-amber-400 hover:bg-muted transition-colors">
                      <Code2 className="h-4 w-4" />
                      Convert to Builtin
                    </button>
                  </>
                )}
              </>
            )}
            <div className="h-px bg-border my-1" />
            <DrawerClose asChild>
              <button
                onClick={onSave}
                disabled={isSaving || !isDirty}
                className="flex items-center gap-3 w-full h-12 px-3 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                <Save className="h-4 w-4 text-muted-foreground" />
                Save Prompt
              </button>
            </DrawerClose>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
