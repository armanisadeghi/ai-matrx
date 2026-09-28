// components/content-editor/ContentEditor.tsx
"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  FileText,
  PilcrowRight,
  Eye,
  SplitSquareHorizontal,
  Save,
  Clock,
  ChevronDown,
  ChevronRight,
  Columns,
} from "lucide-react";
import { MatrxSplit } from "@/components/matrx/MatrxSplit";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import MarkdownStream from "@/components/MarkdownStream";
import type { ContentEditorProps, EditorMode, EditorModeConfig } from "./types";
import RichEditor, { type RichEditorController } from "@/components/rich-editor/RichEditor";
import { CopyDropdownButton } from "./CopyDropdownButton.lazy";
import { ContentManagerMenu } from "./ContentManagerMenu.lazy";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";

// Mode configurations
export const MODE_CONFIGS: EditorModeConfig[] = [
  {
    value: "plain",
    icon: FileText,
    label: "Plain",
    description: "Quick, unformatted text",
  },
  {
    value: "wysiwyg",
    icon: PilcrowRight,
    label: "Write",
    description: "Edit the formatted text",
  },
  {
    value: "markdown",
    icon: SplitSquareHorizontal,
    label: "Source",
    description: "The Markdown source, with a live preview",
  },
  {
    value: "matrx-split",
    icon: Columns,
    label: "Split",
    description: "Plain text on the left, the formatted result live on the right",
  },
  {
    value: "preview",
    icon: Eye,
    label: "Read",
    description: "Read the formatted text",
  },
];

export function ContentEditor({
  value,
  onChange,
  availableModes = ["plain", "matrx-split", "wysiwyg", "markdown", "preview"],
  initialMode = "matrx-split",
  mode: controlledMode,
  onModeChange,
  autoSave = false,
  autoSaveDelay = 1000,
  onSave,
  collapsible = false,
  defaultCollapsed = false,
  collapseMode = "hide",
  collapsedPreviewHeight = 120,
  title,
  headerActions = [],
  showCopyButton = true,
  showContentManager = true,
  onShowHtmlPreview,
  placeholder = "Start typing...",
  showModeSelector = true,
  className,
  sourceFeature = "documents",
  surfaceName,
  contentSource,
  entity,
  imagePolicy,
}: ContentEditorProps) {
  // Internal state
  const [localContent, setLocalContent] = useState(value);
  const [internalMode, setInternalMode] = useState<EditorMode>(
    controlledMode || initialMode,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  // Refs - properly typed
  // THE ONE EDITOR (components/rich-editor) serves Write ("wysiwyg") and
  // Source ("markdown"); Toast UI is gone from the app.
  const richEditorRef = useRef<RichEditorController | null>(null);
  const plainTextareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const localContentRef = useRef(localContent);
  const modeRef = useRef(internalMode);

  // Determine current mode (controlled vs uncontrolled)
  const currentMode =
    controlledMode !== undefined ? controlledMode : internalMode;

  // Keep refs in sync
  useEffect(() => {
    localContentRef.current = localContent;
    modeRef.current = currentMode;
  }, [localContent, currentMode]);

  // Sync external value changes
  useEffect(() => {
    if (value !== localContent) {
      setLocalContent(value);
    }
  }, [value]);

  // Sync controlled mode changes
  useEffect(() => {
    if (controlledMode !== undefined && controlledMode !== internalMode) {
      setInternalMode(controlledMode);
    }
  }, [controlledMode]);

  // Auto-save logic
  useEffect(() => {
    if (!autoSave || !onSave) return undefined;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for auto-save
    if (localContent !== value) {
      saveTimeoutRef.current = setTimeout(async () => {
        setIsSaving(true);
        try {
          await onSave(localContent);
          setLastSaved(new Date());
        } catch (error) {
          console.error("Auto-save failed:", error);
        } finally {
          setIsSaving(false);
        }
      }, autoSaveDelay);
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [localContent, value, autoSave, autoSaveDelay, onSave]);

  // Handle mode changes with proper TUI editor sync
  const handleModeChange = useCallback(
    (newMode: EditorMode) => {
      // Deliver the one editor's pending keystrokes before switching.
      const currentModeValue = modeRef.current;
      if (
        (currentModeValue === "wysiwyg" || currentModeValue === "markdown") &&
        richEditorRef.current
      ) {
        try {
          const markdown = richEditorRef.current.flush();
          // Only update if content actually changed to prevent unnecessary re-renders
          if (markdown !== localContentRef.current) {
            setLocalContent(markdown);
            onChange(markdown);
          }
        } catch (error) {
          console.error("Error syncing content from the editor:", error);
        }
      }

      // Update mode
      if (controlledMode === undefined) {
        setInternalMode(newMode);
      }
      onModeChange?.(newMode);
    },
    [controlledMode, onChange, onModeChange],
  );

  // Handle content changes
  const handleContentChange = useCallback(
    (newContent: string) => {
      setLocalContent(newContent);
      onChange(newContent);
    },
    [onChange],
  );

  // The one editor's changes
  const handleRichChange = useCallback(
    (newContent: string) => {
      setLocalContent(newContent);
      onChange(newContent);
    },
    [onChange],
  );

  // Handle header action click
  const handleActionClick = useCallback(
    (action: (typeof headerActions)[0]) => {
      // Get current content from appropriate source
      let currentContent = localContent;
      if (
        (currentMode === "wysiwyg" || currentMode === "markdown") &&
        richEditorRef.current
      ) {
        try {
          currentContent = richEditorRef.current.flush();
        } catch (error) {
          console.error("Error getting content for action:", error);
        }
      }
      action.onClick(currentContent);
    },
    [localContent, currentMode],
  );

  // Get filtered mode configs
  const filteredModes = MODE_CONFIGS.filter((config) =>
    availableModes.includes(config.value),
  );
  const currentModeConfig = MODE_CONFIGS.find(
    (config) => config.value === currentMode,
  );
  const ModeIcon = currentModeConfig?.icon || FileText;

  // Determine if header should be clickable (for collapse)
  const isHeaderClickable = collapsible;

  return (
    <div
      className={cn(
        "flex flex-col bg-textured border-border rounded-lg overflow-hidden",
        className,
      )}
    >
      {/* Header with mode selector, title, actions, and status */}
      {showModeSelector && (
        <div
          className={cn(
            "flex-none bg-white dark:bg-zinc-850 px-3 py-2",
            isHeaderClickable &&
              "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors",
          )}
          onClick={
            isHeaderClickable ? () => setIsCollapsed(!isCollapsed) : undefined
          }
        >
          <div className="flex items-center gap-2">
            {/* Collapse indicator */}
            {collapsible && (
              <div className="flex-none">
                {isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                )}
              </div>
            )}

            {/* Mode Selector */}
            <div onClick={(e) => e.stopPropagation()}>
              <Select
                value={currentMode}
                onValueChange={(value) => handleModeChange(value as EditorMode)}
              >
                <SelectTrigger
                  hideArrow
                  size="sm"
                  className="w-auto gap-1 px-2 py-1 h-auto border-0 bg-transparent shadow-none rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:border-0 focus:ring-0 focus:border-0"
                >
                  <ModeIcon className="h-3.5 w-3.5" />
                  <ChevronDown className="h-3 w-3" />
                </SelectTrigger>
                <SelectContent>
                  {filteredModes.map((config) => (
                    <SelectItem
                      key={config.value}
                      value={config.value}
                      className="text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <config.icon className="h-3.5 w-3.5" />
                        <div className="flex flex-col">
                          <span className="font-medium">{config.label}</span>
                          <span className="text-[10px] text-zinc-500">
                            {config.description}
                          </span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Title */}
            {title && (
              <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {title}
              </div>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Header Actions */}
            {headerActions.length > 0 && (
              <div
                className="flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                {headerActions.map((action) => (
                  <Button
                    key={action.id}
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => handleActionClick(action)}
                    title={action.label}
                  >
                    <action.icon className="h-3.5 w-3.5" />
                  </Button>
                ))}
              </div>
            )}

            {/* Built-in Copy Button */}
            {showCopyButton && (
              <div onClick={(e) => e.stopPropagation()}>
                <CopyDropdownButton
                  content={localContent}
                  onShowHtmlPreview={
                    onShowHtmlPreview
                      ? (html) => onShowHtmlPreview(html, title)
                      : undefined
                  }
                />
              </div>
            )}

            {/* Built-in Content Manager */}
            {showContentManager && (
              <div onClick={(e) => e.stopPropagation()}>
                <ContentManagerMenu
                  content={localContent}
                  onShowHtmlPreview={onShowHtmlPreview}
                />
              </div>
            )}

            {/* Auto-save status */}
            {autoSave && onSave && (
              <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                {isSaving ? (
                  <>
                    <Save className="h-3 w-3 animate-pulse" />
                    <span>Saving...</span>
                  </>
                ) : lastSaved ? (
                  <>
                    <Clock className="h-3 w-3" />
                    <span>Saved {lastSaved.toLocaleTimeString()}</span>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Editor Area */}
      {(!isCollapsed || collapseMode === "fade") && (
        <div
          className={cn(
            "relative bg-textured rounded-none",
            isCollapsed && collapseMode === "fade"
              ? "overflow-hidden"
              : "overflow-visible",
          )}
          style={
            isCollapsed && collapseMode === "fade"
              ? {
                  maxHeight:
                    typeof collapsedPreviewHeight === "number"
                      ? `${collapsedPreviewHeight}px`
                      : collapsedPreviewHeight,
                }
              : undefined
          }
        >
          {/* Plain Text Mode — right-click: universal menu incl. content-block insert */}
          {currentMode === "plain" && (
            <EditableContextMenu
              sourceFeature={sourceFeature}
              surfaceName={surfaceName}
              contentSource={contentSource}
              entity={entity}
              getTextarea={() => plainTextareaRef.current}
              onTextReplace={handleContentChange}
              onTextInsertBefore={(text) =>
                handleContentChange(`${text}${localContent}`)
              }
              onTextInsertAfter={(text) =>
                handleContentChange(`${localContent}${text}`)
              }
            >
              <Textarea
                ref={plainTextareaRef}
                value={localContent}
                onChange={(e) => handleContentChange(e.target.value)}
                placeholder={placeholder}
                className="w-full min-h-[300px] border-none rounded-none resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm leading-relaxed bg-transparent p-3"
                style={{
                  height: "auto",
                  minHeight: "300px",
                  maxHeight: "none",
                }}
                rows={Math.max(
                  12,
                  Math.ceil(localContent.length / 80) +
                    localContent.split("\n").length +
                    2,
                )}
              />
            </EditableContextMenu>
          )}

          {/* Write ("wysiwyg") and Source ("markdown"): THE ONE EDITOR — one
              instance serves both, so switching between them keeps it; the
              mode selector above is the one view switch (no toolbar row). */}
          {(currentMode === "wysiwyg" || currentMode === "markdown") && (
            <div
              style={{ height: currentMode === "markdown" ? "600px" : "500px" }}
              className="rounded-none"
            >
              <RichEditor
                value={localContent}
                onChange={handleRichChange}
                view={currentMode === "markdown" ? "source" : "visual"}
                chrome="bare"
                controllerRef={richEditorRef}
                placeholder={placeholder}
                surfaceName={surfaceName}
                sourceFeature={sourceFeature}
                contentSource={contentSource}
                defaultOutlineOpen={false}
                imagePolicy={imagePolicy}
                className="h-full"
              />
            </div>
          )}

          {/* Matrx Split Mode */}
          {currentMode === "matrx-split" && (
            <div style={{ height: "500px", minHeight: "500px" }}>
              <MatrxSplit imagePolicy={imagePolicy}
                value={localContent}
                onChange={handleContentChange}
                placeholder={placeholder}
              />
            </div>
          )}

          {/* Preview Mode */}
          {currentMode === "preview" && (
            <NonEditableContextMenu
              sourceFeature={sourceFeature}
              surfaceName={surfaceName}
              contentSource={contentSource}
              entity={entity}
              contextData={{ content: localContent }}
            >
              <div className="w-full p-6 bg-textured overflow-visible">
                {localContent.trim() ? (
                  <div className="overflow-visible">
                    <MarkdownStream imagePolicy={imagePolicy} content={localContent} />
                  </div>
                ) : (
                  <div className="text-center py-12 text-zinc-400 dark:text-zinc-500">
                    No content to preview
                  </div>
                )}
              </div>
            </NonEditableContextMenu>
          )}

          {/* Fade overlay + expand affordance when collapsed in fade mode */}
          {isCollapsed && collapseMode === "fade" && (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-white dark:to-zinc-900"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCollapsed(false);
                }}
                className="absolute left-1/2 bottom-1 -translate-x-1/2 flex items-center justify-center h-6 w-6 rounded-full bg-white dark:bg-zinc-800 border border-border shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                title="Expand"
              >
                <ChevronDown className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-300" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
