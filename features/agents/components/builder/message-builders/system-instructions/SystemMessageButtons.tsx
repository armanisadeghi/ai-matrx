import {
  Eye,
  Edit2,
  Maximize2,
  Braces,
  Wand2,
  Eraser,
  FileText,
  Sparkles,
} from "lucide-react";

export type SystemMessageViewMode = "edit" | "plain" | "preview";

import {
  ResponsiveIconButtonGroup,
  IconButtonConfig,
} from "@/components/official/ResponsiveIconButtonGroup";
import {
  AddBlockTrigger,
  BlockType,
} from "@/features/agents/components/builder/message-builders/AddBlockButton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TemplateSelector } from "@/features/content-templates/components/TemplateSelector";
import { VariableSelector } from "@/features/agents/components/variables-management/VariableSelector";
import { MicrophoneIconButton } from "@/features/audio/components/MicrophoneIconButton";

interface SystemMessageButtonsProps {
  viewMode?: SystemMessageViewMode;
  hasVariableSupport?: boolean;
  hasFullScreenEditor?: boolean;
  variableNames?: string[];
  onVariableSelected?: (name: string) => void;
  onBeforeVariableSelectorOpen?: () => void;
  /** Current system text — browse/save templates. */
  templateCurrentContent?: string;
  onTemplateContentSelected?: (content: string) => void;
  onSaveTemplate?: (label: string, content: string, tags: string[]) => void;
  onOptimize?: () => void;
  onOpenFullScreenEditor?: () => void;
  onSetViewMode?: (mode: SystemMessageViewMode) => void;
  onClear?: () => void;
  onAddBlockType?: (type: BlockType) => void;
  onVoiceTranscription?: (text: string) => void;
}

export function SystemMessageButtons({
  viewMode = "plain",
  hasVariableSupport = false,
  hasFullScreenEditor = false,
  variableNames = [],
  onVariableSelected,
  onBeforeVariableSelectorOpen,
  templateCurrentContent = "",
  onTemplateContentSelected,
  onSaveTemplate,
  onOptimize,
  onOpenFullScreenEditor,
  onSetViewMode,
  onClear,
  onAddBlockType,
  onVoiceTranscription,
}: SystemMessageButtonsProps) {
  const variableButton: IconButtonConfig = hasVariableSupport
    ? {
        id: "variable",
        icon: Braces,
        tooltip: "Insert Variable",
        mobileLabel: "Insert Variable",
        hidden: false,
        render: () => (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <VariableSelector
                  variables={variableNames}
                  onVariableSelected={(v) => onVariableSelected?.(v)}
                  onBeforeOpen={onBeforeVariableSelectorOpen}
                />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="z-[9999]">
              Insert Variable
            </TooltipContent>
          </Tooltip>
        ),
      }
    : {
        id: "variable",
        icon: Braces,
        tooltip: "Insert Variable",
        mobileLabel: "Insert Variable",
        hidden: true,
      };

  const buttons: IconButtonConfig[] = [
    variableButton,
    {
      id: "template",
      icon: FileText,
      tooltip: "Templates",
      mobileLabel: "Templates",
      render: () => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <TemplateSelector
                role="system"
                currentContent={templateCurrentContent}
                onTemplateSelected={(content) =>
                  onTemplateContentSelected?.(content)
                }
                onSaveTemplate={onSaveTemplate ?? (() => {})}
                messageIndex={-1}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="z-[9999]">
            Templates
          </TooltipContent>
        </Tooltip>
      ),
    },
    {
      id: "optimize",
      icon: Wand2,
      tooltip: "Optimize with AI",
      mobileLabel: "Optimize with AI",
      onClick: (e) => {
        e?.stopPropagation();
        onOptimize?.();
      },
      onMouseDown: (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      iconClassName: "text-purple-400",
      className: "hover:text-purple-300",
    },
    {
      id: "fullscreen",
      icon: Maximize2,
      tooltip: "Open in full screen editor",
      mobileLabel: "Full Screen Editor",
      hidden: !hasFullScreenEditor,
      onClick: (e) => {
        e?.stopPropagation();
        onOpenFullScreenEditor?.();
      },
      onMouseDown: (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
    },
    {
      id: "view-edit",
      icon: Edit2,
      tooltip: "Edit mode",
      mobileLabel: "Edit",
      hidden: !onSetViewMode,
      className: viewMode === "edit" ? "bg-primary/10 text-primary" : undefined,
      onClick: (e) => {
        e?.stopPropagation();
        onSetViewMode?.("edit");
      },
      onMouseDown: (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
    },
    {
      id: "view-plain",
      icon: Eye,
      tooltip: "Plain view (highlights variables)",
      mobileLabel: "Plain",
      hidden: !onSetViewMode,
      className:
        viewMode === "plain" ? "bg-primary/10 text-primary" : undefined,
      onClick: (e) => {
        e?.stopPropagation();
        onSetViewMode?.("plain");
      },
      onMouseDown: (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
    },
    {
      id: "view-preview",
      icon: Sparkles,
      tooltip: "Preview (renders markdown)",
      mobileLabel: "Preview",
      hidden: !onSetViewMode,
      className:
        viewMode === "preview" ? "bg-purple-500/10 text-purple-500" : undefined,
      iconClassName: viewMode === "preview" ? "text-purple-400" : undefined,
      onClick: (e) => {
        e?.stopPropagation();
        onSetViewMode?.("preview");
      },
      onMouseDown: (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
    },
    {
      id: "clear",
      icon: Eraser,
      tooltip: "Clear message",
      mobileLabel: "Clear Message",
      onClick: (e) => {
        e?.stopPropagation();
        onClear?.();
      },
      onMouseDown: (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
    },
    {
      id: "voice",
      icon: undefined,
      tooltip: "Record voice",
      mobileLabel: "Record Voice",
      hidden: !onVoiceTranscription,
      render: onVoiceTranscription
        ? () => (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <MicrophoneIconButton
                    variant="modal-controls"
                    size="sm"
                    onTranscriptionComplete={onVoiceTranscription}
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="z-[9999]">
                Record voice
              </TooltipContent>
            </Tooltip>
          )
        : undefined,
    },
    {
      id: "add-block",
      icon: undefined,
      tooltip: "Add content block",
      mobileLabel: "Add Block",
      hidden: !onAddBlockType,
      render: onAddBlockType
        ? () => (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <AddBlockTrigger onSelectType={onAddBlockType} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="z-[9999]">
                Add content block
              </TooltipContent>
            </Tooltip>
          )
        : undefined,
    },
  ];

  return (
    <ResponsiveIconButtonGroup
      buttons={buttons}
      sheetTitle="System Message Actions"
      size="sm"
    />
  );
}
