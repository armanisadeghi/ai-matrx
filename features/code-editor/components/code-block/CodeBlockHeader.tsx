"use client";

import React, { useRef, useState } from "react";
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
  Loader2,
  RotateCcw,
  WrapText,
  Maximize2,
  ListOrdered,
  Atom,
  Rocket,
  Zap,
  Paintbrush,
  Code2,
  Brain,
  FileText,
  FileCode,
  SquareArrowOutUpRight,
  MoreHorizontal,
  Globe
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
import { getBuiltinInfoByKey } from "@/lib/redux/prompt-execution/builtins";
import AdvancedMenu, {
  type MenuItem,
} from "@/components/official/AdvancedMenu";
import { useAdvancedMenu } from "@/hooks/use-advanced-menu";

type AIModalConfig = {
  version: "v2" | "v3";
  builtinId: string;
  title: string;
};

/**
 * Items that wrappers (e.g. `JsonBlock`) can append to the unified kebab menu.
 * Use `category` to slot the item into one of the existing buckets — common
 * choices: `"Data"`, `"Download"`, `"Save"`, `"AI"`, `"View"`. Any new category
 * appears as its own section in the menu in the order it was first declared.
 */
export type CodeBlockMenuItem = MenuItem;

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
  /** Rendered after the language display. Used by wrappers to inject
   *  view-mode toggles (e.g. JsonBlock's Code/Tree/Table/Path switcher). */
  headerLeftSlot?: React.ReactNode;
  /**
   * Extra items appended to the kebab menu. Use `category` to control
   * grouping inside the menu (the four section buckets the header already
   * declares are: View · Edit · Download · Save · AI). New categories
   * (e.g. "Data" from JsonBlock) appear as their own section.
   */
  extraMenuItems?: CodeBlockMenuItem[];
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
  onAIEdit,
  hideLanguageDisplay = false,
  allowEdit = true,
  customBuiltinKeys = [],
  headerLeftSlot,
  extraMenuItems,
}) => {
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
        {headerLeftSlot && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center"
          >
            {headerLeftSlot}
          </div>
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
        toggleWrapLines={toggleWrapLines}
        toggleCollapse={toggleCollapse}
        isMobile={isMobile}
        showWrapLines={showWrapLines}
        handleFormat={handleFormat}
        handleReset={handleReset}
        minimapEnabled={minimapEnabled}
        toggleMinimap={toggleMinimap}
        onAIEdit={onAIEdit}
        allowEdit={allowEdit}
        customBuiltinKeys={customBuiltinKeys}
        isCompleteHTML={isCompleteHTML}
        handleViewHTML={handleViewHTML}
        isCreatingPage={isCreatingPage}
        extraMenuItems={extraMenuItems}
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
  toggleWrapLines?: (e: React.MouseEvent) => void;
  toggleCollapse?: (e?: React.MouseEvent) => void;
  isMobile: boolean;
  showWrapLines?: boolean;
  handleFormat?: (e: React.MouseEvent) => void;
  handleReset?: (e: React.MouseEvent) => void;
  minimapEnabled?: boolean;
  toggleMinimap?: (e: React.MouseEvent) => void;
  onAIEdit?: (config: AIModalConfig) => void;
  allowEdit?: boolean;
  customBuiltinKeys?: string[];
  isCompleteHTML?: boolean;
  handleViewHTML?: () => void;
  isCreatingPage?: boolean;
  extraMenuItems?: CodeBlockMenuItem[];
}

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

/**
 * Synthetic event for menu-triggered actions. The existing handlers all
 * begin with `e.stopPropagation()` — the menu already swallows propagation
 * for us, so this stub satisfies the type while doing nothing observable.
 */
const noopEvent = (): React.MouseEvent =>
  ({ stopPropagation() {} }) as unknown as React.MouseEvent;

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
  onAIEdit,
  allowEdit = true,
  customBuiltinKeys = [],
  isCompleteHTML = false,
  handleViewHTML,
  isCreatingPage = false,
  extraMenuItems,
}) => {
  const menu = useAdvancedMenu();
  const kebabRef = useRef<HTMLDivElement>(null);
  const [isOpeningInEditor, setIsOpeningInEditor] = useState(false);
  const dispatch = useAppDispatch();
  const saveAndOpenInCodeEditor = useSaveAndOpenInCodeEditor();

  const handleSaveToCode = () => {
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

  const handleOpenInEditor = async () => {
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

  const defaultKeys = ["generic-code-editor", "code-editor-dynamic-context"];
  const allKeys = [...defaultKeys, ...customBuiltinKeys];
  const uniqueKeys = Array.from(new Set(allKeys));
  const builtins = uniqueKeys
    .map((key) => getBuiltinInfoByKey(key))
    .filter((b): b is NonNullable<typeof b> => b !== undefined);

  // Build the unified menu items list. Order here determines section order
  // because `AdvancedMenu` preserves insertion order when grouping.
  const menuItems: MenuItem[] = [];

  if (toggleWrapLines) {
    menuItems.push({
      key: "wrap",
      icon: WrapText,
      iconColor: showWrapLines ? "text-blue-600 dark:text-blue-400" : undefined,
      label: showWrapLines ? "Disable word wrap" : "Enable word wrap",
      category: "View",
      showToast: false,
      action: () => toggleWrapLines(noopEvent()),
    });
  }

  if (toggleMinimap) {
    menuItems.push({
      key: "minimap",
      icon: Maximize2,
      iconColor:
        isEditing && minimapEnabled
          ? "text-blue-600 dark:text-blue-400"
          : undefined,
      label: minimapEnabled ? "Hide minimap" : "Show minimap",
      description: !isEditing ? "Only available in edit mode" : undefined,
      disabled: !isEditing,
      category: "View",
      showToast: false,
      action: () => toggleMinimap(noopEvent()),
    });
  }

  if (handleFormat) {
    menuItems.push({
      key: "format",
      icon: Zap,
      label: "Format code",
      description: isEditing ? "Shift+Alt+F" : "Only available in edit mode",
      disabled: !isEditing,
      category: "Edit",
      showToast: false,
      action: () => handleFormat(noopEvent()),
    });
  }

  if (handleReset) {
    menuItems.push({
      key: "reset",
      icon: RotateCcw,
      label: "Reset to original",
      description: !isEditing ? "Only available in edit mode" : undefined,
      disabled: !isEditing,
      category: "Edit",
      showToast: false,
      action: () => handleReset(noopEvent()),
    });
  }

  menuItems.push({
    key: "copy-numbered",
    icon: ListOrdered,
    label: "Copy with line numbers",
    category: "Copy",
    showToast: false,
    action: () => handleCopy(noopEvent(), true),
  });

  menuItems.push({
    key: "download",
    icon: Download,
    label: "Download as code",
    description: `code.${extensionForLanguage(language) || "txt"}`,
    category: "Download",
    showToast: false,
    action: () => handleDownload(noopEvent()),
  });

  if (isCompleteHTML && handleViewHTML) {
    menuItems.push({
      key: "view-html",
      icon: Globe,
      iconColor: "text-purple-600 dark:text-purple-400",
      label: "Open HTML preview",
      description: "Render in Canvas",
      disabled: isCreatingPage,
      category: "Preview",
      showToast: false,
      action: handleViewHTML,
    });
  }

  menuItems.push({
    key: "save-to-code",
    icon: FileCode,
    iconColor: "text-rose-600 dark:text-rose-400",
    label: "Save to Code files",
    description: "Add to your /code workspace",
    category: "Save",
    showToast: false,
    action: handleSaveToCode,
  });

  menuItems.push({
    key: "save-and-open",
    icon: isOpeningInEditor ? Loader2 : SquareArrowOutUpRight,
    iconColor: "text-blue-600 dark:text-blue-400",
    label: "Save and open in editor",
    description: "Drops into Chat Captures",
    disabled: isOpeningInEditor,
    category: "Save",
    showToast: false,
    action: handleOpenInEditor,
  });

  if (allowEdit && onAIEdit) {
    for (const builtin of builtins) {
      const IconComp = getIconComponent(builtin.icon);
      menuItems.push({
        key: `ai-${builtin.key}`,
        icon: IconComp,
        iconColor: "text-purple-600 dark:text-purple-400",
        label: builtin.name,
        category: "AI",
        showToast: false,
        action: () =>
          onAIEdit({
            version: "v2",
            builtinId: builtin.id,
            title: builtin.name,
          }),
      });
      if (builtin.context) {
        menuItems.push({
          key: `ai-${builtin.key}-ctx`,
          icon: IconComp,
          iconColor: "text-purple-600 dark:text-purple-400",
          label: `${builtin.name} (Context)`,
          category: "AI",
          showToast: false,
          action: () =>
            onAIEdit({
              version: "v3",
              builtinId: builtin.id,
              title: `${builtin.name} (Context)`,
            }),
        });
      }
    }
  }

  if (extraMenuItems && extraMenuItems.length > 0) {
    menuItems.push(...extraMenuItems);
  }

  return (
    <div className="flex items-center gap-0.5 pr-5">
      {/* 1. Fullscreen */}
      {toggleFullScreen && (
        <IconButton
          icon={isFullScreen ? Minimize : Expand}
          tooltip={isFullScreen ? "Exit fullscreen" : "Fullscreen"}
          size="sm"
          variant="ghost"
          onClick={toggleFullScreen}
          tooltipSide="bottom"
        />
      )}

      {/* 2. Collapse / Expand */}
      {toggleCollapse && (
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

      {/* 3. Copy */}
      <IconButton
        icon={isCopied ? Check : Copy}
        tooltip={isCopied ? "Copied!" : "Copy code"}
        size="sm"
        variant="ghost"
        onClick={(e) => {
          e.stopPropagation();
          handleCopy(e);
        }}
        tooltipSide="bottom"
      />

      {/* 4. Edit / View */}
      {toggleEdit && allowEdit && (
        <IconButton
          icon={isEditing ? Eye : Edit2}
          tooltip={isEditing ? "Exit edit mode" : "Edit code"}
          size="sm"
          variant="ghost"
          onClick={toggleEdit}
          tooltipSide="bottom"
        />
      )}

      {/* 5. Kebab — everything else lives here */}
      <div ref={kebabRef} onClick={(e) => e.stopPropagation()}>
        <IconButton
          icon={MoreHorizontal}
          tooltip="More actions"
          size="sm"
          variant="ghost"
          tooltipSide="bottom"
          onClick={() => {
            if (kebabRef.current) menu.open(kebabRef.current);
          }}
        />
      </div>

      <AdvancedMenu
        {...menu.menuProps}
        anchorElement={menu.anchorElement}
        items={menuItems}
        title="Code actions"
        position="bottom-right"
        width="260px"
        maxWidth="300px"
      />
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
