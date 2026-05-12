"use client";

import React, { useState } from "react";
import {
  Copy,
  Check,
  Download,
  Expand,
  Eye,
  Minimize,
  Edit2,
  ChevronDown,
  ChevronUp,
  Globe,
  Loader2,
  Wand2,
  RotateCcw,
  WrapText,
  Maximize2,
  ListOrdered,
  FileText,
  Atom,
  Rocket,
  Zap,
  Paintbrush,
  Code2,
  Brain,
  FileCode,
  SquareArrowOutUpRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import LanguageDisplay from "@/features/code-editor/components/code-block/LanguageDisplay";
import IconButton from "@/components/official/IconButton";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { extensionForLanguage } from "@/features/code-files/actions/languageOptions";
import {
  useSaveAndOpenInCodeEditor,
  CHAT_CAPTURES_FOLDER_NAME,
} from "@/features/code/actions/saveAndOpenInCodeEditor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { getBuiltinInfoByKey } from "@/lib/redux/prompt-execution/builtins";

type AIModalConfig = {
  version: "v2" | "v3";
  builtinId: string;
  title: string;
};

// Additive header slots. Used by language-specialized wrappers (e.g.
// `JsonBlock`) to inject extra controls without forking CodeBlock itself.
export type CodeBlockDownloadOption = {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  description?: string;
};

interface CodeBlockHeaderProps {
  language: string;
  linesCount: number;
  isEditing: boolean;
  isFullScreen: boolean;
  isCollapsed: boolean;
  code: string;
  handleCopy: (e: React.MouseEvent, withLineNumbers?: boolean) => void;
  handleDownload: (e: React.MouseEvent) => void;
  toggleEdit?: (e: React.MouseEvent) => void;
  toggleFullScreen?: (e: React.MouseEvent) => void;
  toggleCollapse?: (e?: React.MouseEvent) => void;
  toggleLineNumbers?: (e: React.MouseEvent) => void;
  toggleWrapLines?: (e: React.MouseEvent) => void;
  isCopied: boolean;
  isMobile: boolean;
  isCompleteHTML?: boolean;
  handleViewHTML?: () => void;
  isCreatingPage?: boolean;
  showWrapLines?: boolean;
  handleFormat?: (e: React.MouseEvent) => void;
  handleReset?: (e: React.MouseEvent) => void;
  minimapEnabled?: boolean;
  toggleMinimap?: (e: React.MouseEvent) => void;
  showLineNumbers?: boolean;
  onAIEdit?: (config: AIModalConfig) => void;
  hideLanguageDisplay?: boolean;
  allowEdit?: boolean;
  customBuiltinKeys?: string[];
  /** Rendered after the language display, before the optional "View HTML" pill. */
  headerLeftSlot?: React.ReactNode;
  /** Rendered immediately before the Download button in the action row. */
  headerActionsSlot?: React.ReactNode;
  /**
   * When provided, replaces the single Download button with a dropdown
   * whose first item is the default download and additional items follow.
   */
  downloadOptions?: CodeBlockDownloadOption[];
}

export const CodeBlockHeader: React.FC<CodeBlockHeaderProps> = ({
  language,
  linesCount,
  isEditing,
  isFullScreen,
  isCollapsed,
  code,
  handleCopy,
  handleDownload,
  toggleEdit,
  toggleFullScreen,
  toggleCollapse,
  toggleLineNumbers,
  toggleWrapLines,
  isCopied,
  isMobile,
  isCompleteHTML = false,
  handleViewHTML,
  isCreatingPage = false,
  showWrapLines = true,
  handleFormat,
  handleReset,
  minimapEnabled = false,
  toggleMinimap,
  showLineNumbers = false,
  onAIEdit,
  hideLanguageDisplay = false,
  allowEdit = true,
  customBuiltinKeys = [],
  headerLeftSlot,
  headerActionsSlot,
  downloadOptions,
}) => {
  // Determine if collapse functionality should be available
  const canCollapse = linesCount > 5;

  return (
    <div
      className={cn(
        "flex items-center justify-between",
        "pl-5 py-0 rounded-t-xl",
        "bg-zinc-300 dark:bg-zinc-700",
        "text-xs text-gray-700 dark:text-gray-300",
        "transition-all duration-200",
        !isEditing &&
          canCollapse &&
          "cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors",
      )}
      onClick={isEditing || !canCollapse ? undefined : toggleCollapse}
    >
      <div className="flex items-center space-x-4">
        {!language && (
          <div className="flex space-x-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
        )}
        {!hideLanguageDisplay && (
          <div className="flex items-center space-x-2">
            <LanguageDisplay language={language} isMobile={isMobile} />
            {!isMobile && (
              <span className="text-xs text-neutral-600 dark:text-neutral-400">
                {linesCount} {linesCount === 1 ? "line" : "lines"}
              </span>
            )}
          </div>
        )}
        {/* Optional left slot for language-specialized wrappers */}
        {headerLeftSlot && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center"
          >
            {headerLeftSlot}
          </div>
        )}
        {/* View HTML Button */}
        {isCompleteHTML && handleViewHTML && !isMobile && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleViewHTML();
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors bg-purple-100 hover:bg-purple-200 dark:bg-purple-900 dark:hover:bg-purple-800 text-purple-700 dark:text-purple-300"
            title="Open HTML Preview in Canvas"
            disabled={isCreatingPage}
          >
            {isCreatingPage ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Creating...</span>
              </>
            ) : (
              <>
                <Globe size={14} />
                <span>Preview</span>
              </>
            )}
          </button>
        )}
      </div>
      <CodeBlockButtons
        code={code}
        language={language}
        isEditing={isEditing}
        isFullScreen={isFullScreen}
        isCopied={isCopied}
        canCollapse={canCollapse}
        isCollapsed={isCollapsed}
        handleCopy={handleCopy}
        handleDownload={handleDownload}
        toggleEdit={toggleEdit}
        toggleFullScreen={toggleFullScreen}
        toggleLineNumbers={toggleLineNumbers}
        toggleWrapLines={toggleWrapLines}
        toggleCollapse={toggleCollapse}
        isMobile={isMobile}
        showWrapLines={showWrapLines}
        handleFormat={handleFormat}
        handleReset={handleReset}
        minimapEnabled={minimapEnabled}
        toggleMinimap={toggleMinimap}
        showLineNumbers={showLineNumbers}
        onAIEdit={onAIEdit}
        allowEdit={allowEdit}
        customBuiltinKeys={customBuiltinKeys}
        headerActionsSlot={headerActionsSlot}
        downloadOptions={downloadOptions}
      />
    </div>
  );
};

interface CodeBlockButtonsProps {
  code: string;
  language: string;
  isEditing: boolean;
  isFullScreen: boolean;
  isCopied: boolean;
  canCollapse: boolean;
  isCollapsed: boolean;
  handleCopy: (e: React.MouseEvent, withLineNumbers?: boolean) => void;
  handleDownload: (e: React.MouseEvent) => void;
  toggleEdit?: (e: React.MouseEvent) => void;
  toggleFullScreen?: (e: React.MouseEvent) => void;
  toggleLineNumbers?: (e: React.MouseEvent) => void;
  toggleWrapLines?: (e: React.MouseEvent) => void;
  toggleCollapse?: (e?: React.MouseEvent) => void;
  isMobile: boolean;
  showWrapLines?: boolean;
  handleFormat?: (e: React.MouseEvent) => void;
  handleReset?: (e: React.MouseEvent) => void;
  minimapEnabled?: boolean;
  toggleMinimap?: (e: React.MouseEvent) => void;
  showLineNumbers?: boolean;
  onAIEdit?: (config: AIModalConfig) => void;
  allowEdit?: boolean;
  customBuiltinKeys?: string[];
  headerActionsSlot?: React.ReactNode;
  downloadOptions?: CodeBlockDownloadOption[];
}

// Icon mapping for dynamic icon rendering
const ICON_MAP: Record<string, LucideIcon> = {
  Rocket,
  Zap,
  Paintbrush,
  Code2,
  Brain,
  FileText,
  Atom,
};

const getIconComponent = (iconName: string): LucideIcon => {
  return ICON_MAP[iconName] || Atom;
};

const CodeBlockButtons: React.FC<CodeBlockButtonsProps> = ({
  code,
  language,
  isEditing,
  isFullScreen,
  isCopied,
  canCollapse,
  isCollapsed,
  handleCopy,
  handleDownload,
  toggleLineNumbers,
  toggleWrapLines,
  toggleEdit,
  toggleFullScreen,
  toggleCollapse,
  isMobile,
  showWrapLines = true,
  handleFormat,
  handleReset,
  minimapEnabled = false,
  toggleMinimap,
  showLineNumbers = false,
  onAIEdit,
  allowEdit = true,
  customBuiltinKeys = [],
  headerActionsSlot,
  downloadOptions,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [isOpeningInEditor, setIsOpeningInEditor] = useState(false);
  const dispatch = useAppDispatch();
  const saveAndOpenInCodeEditor = useSaveAndOpenInCodeEditor();

  const handleSaveToCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!code?.trim()) return;
    dispatch(
      openOverlay({
        overlayId: "saveToCode",
        data: {
          initialContent: code,
          initialLanguage: language ?? "plaintext",
          suggestedName: undefined,
          defaultFolderId: null,
        },
      }),
    );
  };

  const handleOpenInEditor = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!code?.trim() || isOpeningInEditor) return;
    setIsOpeningInEditor(true);
    try {
      const ext = extensionForLanguage(language);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const name = `snippet-${stamp}.${ext}`;
      await saveAndOpenInCodeEditor({
        name,
        language,
        content: code,
        folderName: CHAT_CAPTURES_FOLDER_NAME,
        tags: ["chat-capture"],
        metadata: {
          source: "chat-code-block",
          savedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error("[CodeBlockHeader] open-in-editor failed", err);
    } finally {
      setIsOpeningInEditor(false);
    }
  };

  // Merge default keys with custom keys and make unique
  const defaultKeys = ["generic-code-editor", "code-editor-dynamic-context"];
  const allKeys = [...defaultKeys, ...customBuiltinKeys];
  const uniqueKeys = Array.from(new Set(allKeys));

  // Get builtin info for all unique keys
  const builtins = uniqueKeys
    .map((key) => getBuiltinInfoByKey(key))
    .filter((b): b is NonNullable<typeof b> => b !== undefined);
  return (
    <div className="flex items-center gap-0.5 pr-5">
      {/* Fullscreen - Always visible on desktop */}
      {toggleFullScreen && !isMobile && (
        <IconButton
          icon={isFullScreen ? Minimize : Expand}
          tooltip={isFullScreen ? "Exit Fullscreen" : "Fullscreen"}
          size="sm"
          variant="ghost"
          onClick={toggleFullScreen}
          tooltipSide="bottom"
        />
      )}

      {/* Collapse - Always rendered to prevent shifting, disabled when not applicable */}
      {toggleCollapse && !isMobile && (
        <IconButton
          icon={isCollapsed ? ChevronDown : ChevronUp}
          tooltip={
            !canCollapse
              ? "Too few lines to collapse"
              : isEditing
                ? "Cannot collapse in edit mode"
                : isCollapsed
                  ? "Expand code"
                  : "Collapse code"
          }
          size="sm"
          variant="ghost"
          onClick={toggleCollapse}
          tooltipSide="bottom"
          disabled={isEditing || !canCollapse}
          className={cn(
            isEditing || !canCollapse ? "opacity-40 cursor-not-allowed" : "",
          )}
        />
      )}

      {/* Word Wrap Toggle - Available in both modes */}
      {toggleWrapLines && !isMobile && (
        <IconButton
          icon={WrapText}
          tooltip={showWrapLines ? "Disable word wrap" : "Enable word wrap"}
          size="sm"
          variant={showWrapLines ? "default" : "ghost"}
          onClick={toggleWrapLines}
          tooltipSide="bottom"
        />
      )}

      {/* Minimap Toggle - Only works in edit mode (Monaco Editor feature) */}
      {toggleMinimap && !isMobile && (
        <IconButton
          icon={Maximize2}
          tooltip={
            !isEditing
              ? "Minimap only available in edit mode"
              : minimapEnabled
                ? "Hide minimap"
                : "Show minimap"
          }
          size="sm"
          variant={minimapEnabled && isEditing ? "default" : "ghost"}
          onClick={toggleMinimap}
          tooltipSide="bottom"
          disabled={!isEditing}
          className={cn(!isEditing ? "opacity-40 cursor-not-allowed" : "")}
        />
      )}

      {/* Format - Always rendered, disabled in view mode */}
      {handleFormat && !isMobile && (
        <IconButton
          icon={Wand2}
          tooltip={
            isEditing
              ? "Format code (Shift+Alt+F)"
              : "Format only available in edit mode"
          }
          size="sm"
          variant="ghost"
          onClick={handleFormat}
          tooltipSide="bottom"
          disabled={!isEditing}
          className={cn(!isEditing ? "opacity-40 cursor-not-allowed" : "")}
        />
      )}

      {/* Reset - Always rendered, disabled in view mode */}
      {handleReset && !isMobile && (
        <IconButton
          icon={RotateCcw}
          tooltip={
            isEditing
              ? "Reset to original code"
              : "Reset only available in edit mode"
          }
          size="sm"
          variant="ghost"
          onClick={handleReset}
          tooltipSide="bottom"
          disabled={!isEditing}
          className={cn(!isEditing ? "opacity-40 cursor-not-allowed" : "")}
        />
      )}

      {/* Save to Code - Always visible on desktop */}
      {!isMobile && (
        <IconButton
          icon={FileCode}
          tooltip="Save to Code files"
          size="sm"
          variant="ghost"
          onClick={handleSaveToCode}
          tooltipSide="bottom"
          className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
        />
      )}

      {/* Save & open in /code editor — one-click path from chat to the
          full workspace. Uses the shared save-and-open helper so the
          destination (Chat Captures folder) stays consistent with every
          other surface that does this. */}
      {!isMobile && (
        <IconButton
          icon={isOpeningInEditor ? Loader2 : SquareArrowOutUpRight}
          tooltip="Save and open in editor"
          size="sm"
          variant="ghost"
          onClick={handleOpenInEditor}
          tooltipSide="bottom"
          className={cn(
            "text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300",
            isOpeningInEditor && "animate-spin",
          )}
        />
      )}

      {/* Optional action slot for language-specialized wrappers */}
      {headerActionsSlot && !isMobile && (
        <div onClick={(e) => e.stopPropagation()} className="flex items-center">
          {headerActionsSlot}
        </div>
      )}

      {/* Download — single button by default, dropdown when extra options provided */}
      {!isMobile &&
        (downloadOptions && downloadOptions.length > 0 ? (
          <DropdownMenu
            open={isDownloadMenuOpen}
            onOpenChange={setIsDownloadMenuOpen}
          >
            <DropdownMenuTrigger asChild>
              <div>
                <IconButton
                  icon={Download}
                  tooltip="Download (more formats)"
                  size="sm"
                  variant="ghost"
                  tooltipSide="bottom"
                />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[9999] w-56">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload(e as unknown as React.MouseEvent);
                  setIsDownloadMenuOpen(false);
                }}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Download className="h-4 w-4" />
                <span>Download as code</span>
              </DropdownMenuItem>
              {downloadOptions.length > 0 && <DropdownMenuSeparator />}
              {downloadOptions.map((opt, idx) => {
                const Icon = opt.icon;
                return (
                  <DropdownMenuItem
                    key={idx}
                    onClick={(e) => {
                      e.stopPropagation();
                      opt.onClick();
                      setIsDownloadMenuOpen(false);
                    }}
                    className="flex items-start gap-2 cursor-pointer"
                  >
                    <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="flex flex-col">
                      <span>{opt.label}</span>
                      {opt.description && (
                        <span className="text-[10px] text-muted-foreground">
                          {opt.description}
                        </span>
                      )}
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <IconButton
            icon={Download}
            tooltip="Download code"
            size="sm"
            variant="ghost"
            onClick={handleDownload}
            tooltipSide="bottom"
          />
        ))}

      {/* Copy - Always visible with dropdown for line numbers option */}
      <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <div>
            <IconButton
              icon={isCopied ? Check : Copy}
              tooltip={
                isCopied ? "Copied!" : "Copy code (right-click for options)"
              }
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                if (e.button === 0) {
                  // Left click - default copy
                  handleCopy(e);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDropdownOpen(true);
              }}
              tooltipSide="bottom"
            />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="z-[9999]">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              handleCopy(e as any, false);
              setIsDropdownOpen(false);
            }}
            className="flex items-center gap-2 cursor-pointer"
          >
            <FileText className="h-4 w-4" />
            <span>Copy code only</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              handleCopy(e as any, true);
              setIsDropdownOpen(false);
            }}
            className="flex items-center gap-2 cursor-pointer"
          >
            <ListOrdered className="h-4 w-4" />
            <span>Copy with line numbers</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* AI Edit - Available in both modes with dropdown for V2/V3 - Only if editing is allowed */}
      {onAIEdit && !isMobile && allowEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div>
              <IconButton
                icon={Atom}
                tooltip="AI Code Editor (click for options)"
                size="sm"
                variant="ghost"
                tooltipSide="bottom"
                className="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
              />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[9999] w-56">
            {builtins.map((builtin, index) => {
              const IconComponent = getIconComponent(builtin.icon);
              return (
                <React.Fragment key={builtin.key}>
                  {/* Non-Context Aware mode (now using AICodeEditorModal instead of V2) */}
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onAIEdit({
                        version: "v2",
                        builtinId: builtin.id,
                        title: builtin.name,
                      });
                    }}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <IconComponent className="h-4 w-4" />
                    <span>{builtin.name}</span>
                  </DropdownMenuItem>

                  {/* Context-Aware mode - KEEP THIS! IT WORKS BEAUTIFULLY! */}
                  {builtin.context && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onAIEdit({
                          version: "v3",
                          builtinId: builtin.id,
                          title: `${builtin.name} (Context)`,
                        });
                      }}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <IconComponent className="h-4 w-4" />
                      <span>{builtin.name} (Context)</span>
                    </DropdownMenuItem>
                  )}

                  {index < builtins.length - 1 && <DropdownMenuSeparator />}
                </React.Fragment>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Edit/View Toggle - Always visible on desktop, icon switches based on mode - Only if editing is allowed */}
      {toggleEdit && !isMobile && allowEdit && (
        <IconButton
          icon={isEditing ? Eye : Edit2}
          tooltip={isEditing ? "Exit edit mode" : "Edit code"}
          size="sm"
          variant="ghost"
          onClick={toggleEdit}
          tooltipSide="bottom"
        />
      )}
    </div>
  );
};

export const EditButton = ({ isEditing, toggleEdit }) => {
  if (isEditing || !toggleEdit) return null;

  return (
    <div className="absolute top-4 right-2 z-10 backdrop-blur-sm rounded-md">
      <IconButton
        icon={Edit2}
        tooltip="Edit code"
        size="sm"
        variant="ghost"
        onClick={toggleEdit}
        tooltipSide="bottom"
        className="shadow-sm hover:bg-neutral-200 dark:hover:bg-neutral-700"
      />
    </div>
  );
};

export default CodeBlockHeader;
