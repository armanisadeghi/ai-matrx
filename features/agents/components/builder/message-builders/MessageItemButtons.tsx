import { Maximize2, Braces, Copy, Check, Eraser, X, FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { copyContent } from "@ai-matrx/rich-content/copy/copy-commands";

// View-mode toggle has moved to MessageViewModeMenu next to the role
// selector. This file owns the action icon row only.

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
import { TemplateSelector } from "@/features/message-templates/components/TemplateSelector";
import type { MessageRole } from "@/features/message-templates/types/message-templates-db";
import { VariableSelector } from "@/features/agents/components/variables-management/VariableSelector";
import { MicrophoneIconButton } from "@/features/audio/components/MicrophoneIconButton";

interface MessageItemButtonsProps {
  hasVariableSupport?: boolean;
  hasFullScreenEditor?: boolean;
  variableNames?: string[];
  onVariableSelected?: (name: string) => void;
  onBeforeVariableSelectorOpen?: () => void;
  templateRole?: MessageRole;
  templateCurrentContent?: string;
  onTemplateContentSelected?: (content: string) => void;
  templateMessageIndex?: number;
  onSaveTemplate?: (label: string, content: string, tags: string[]) => void;
  onOpenFullScreenEditor?: () => void;
  onClear?: () => void;
  onDelete?: () => void;
  onAddBlockType?: (type: BlockType) => void;
  /** Gated block types this message offers (e.g. `speech_script` on a TTS model). */
  extraBlockTypes?: BlockType[];
  onVoiceTranscription?: (text: string) => void;
  sheetTitle?: string;
}

export function MessageItemButtons({
  hasVariableSupport = false,
  hasFullScreenEditor = false,
  variableNames = [],
  onVariableSelected,
  onBeforeVariableSelectorOpen,
  templateRole = "user",
  templateCurrentContent = "",
  onTemplateContentSelected,
  templateMessageIndex = 0,
  onSaveTemplate,
  onOpenFullScreenEditor,
  onClear,
  onDelete,
  onAddBlockType,
  extraBlockTypes,
  onVoiceTranscription,
  sheetTitle = "Message Actions",
}: MessageItemButtonsProps) {
  // Copy confirms on the button itself (check for 1.5 s) — never a toast.
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);
  const flashCopied = () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    setCopied(true);
    copiedTimer.current = setTimeout(() => setCopied(false), 1500);
  };
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
      id: "copy",
      icon: copied ? Check : Copy,
      tooltip: copied ? "Copied" : "Copy message",
      mobileLabel: "Copy Message",
      onClick: async (e) => {
        e?.stopPropagation();
        if (!templateCurrentContent) {
          toast.error("Nothing to copy");
          return;
        }
        await copyContent(templateCurrentContent, {
          formatJson: false,
          onSuccess: flashCopied,
          onError: () => toast.error("Failed to copy"),
        });
      },
      onMouseDown: (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
    },
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
                role={templateRole}
                currentContent={templateCurrentContent}
                onTemplateSelected={(content) =>
                  onTemplateContentSelected?.(content)
                }
                onSaveTemplate={onSaveTemplate ?? (() => {})}
                messageIndex={templateMessageIndex}
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
      id: "delete",
      icon: X,
      tooltip: "Delete message",
      mobileLabel: "Delete Message",
      onClick: (e) => {
        e?.stopPropagation();
        onDelete?.();
      },
      onMouseDown: (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      iconClassName: "text-destructive",
      className: "hover:text-destructive",
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
                  <AddBlockTrigger
                    onSelectType={onAddBlockType}
                    extraTypes={extraBlockTypes}
                  />
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
      sheetTitle={sheetTitle}
      size="sm"
    />
  );
}
