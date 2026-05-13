"use client";

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  forwardRef,
  lazy,
  Suspense,
} from "react";
import {
  ArrowUp,
  Loader2,
  X,
  Minimize2,
  Maximize2,
  Plus,
  ChevronDown,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Music,
  Youtube,
  Globe,
  Settings2,
} from "lucide-react";

import { VoiceMicButton } from "./VoiceMicButton";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import type { NormalizedFile } from "@/features/files";
import { useClipboardPaste } from "@/components/ui/file-upload/useClipboardPaste";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  TapTargetButtonTransparent,
  TapTargetButtonSolid,
} from "@/components/icons/TapTargetButton";
import { PublicResourcePickerMenu } from "./resource-picker/PublicResourcePickerMenu";
import { InlineMediaRef } from "@/features/files";

import type { PublicResource, PublicResourceType } from "../types/content";
import type { AgentConfig } from "../context/DEPRECATED-ChatContext";
import type { AIModel } from "@/features/ai-models/redux/modelRegistrySlice";

const PdfOptimizePrompt = lazy(() => import("./PdfOptimizePrompt"));

// ============================================================================
// TEXT INPUT COMPONENT
// ============================================================================

interface TextInputProps {
  content: string;
  placeholder?: string;
  disabled?: boolean;
  onContentChange: (content: string) => void;
  onSubmit: () => void;
  className?: string;
}

const TextInput = forwardRef<HTMLTextAreaElement, TextInputProps>(
  (
    {
      content,
      placeholder = "What do you want to know?",
      disabled = false,
      onContentChange,
      onSubmit,
      className = "",
    },
    forwardedRef,
  ) => {
    const localRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
      if (!forwardedRef) return;
      if (typeof forwardedRef === "function") {
        forwardedRef(localRef.current);
      } else {
        forwardedRef.current = localRef.current;
      }
    }, [forwardedRef]);

    const [isFocused, setIsFocused] = useState(false);
    const [textareaHeight, setTextareaHeight] = useState("110px");
    const [isExpanded, setIsExpanded] = useState(false);
    const [maxHeight] = useState(800);

    const adjustTextareaHeight = useCallback(() => {
      if (localRef.current) {
        const minHeight = 110;
        const bottomPadding = 60;
        localRef.current.style.height = "auto";
        const scrollHeight = localRef.current.scrollHeight;
        const newHeight = Math.min(
          Math.max(minHeight, scrollHeight),
          maxHeight - bottomPadding,
        );
        localRef.current.style.height = `${newHeight}px`;
        setTextareaHeight(`${newHeight}px`);
        setIsExpanded(newHeight > minHeight);
      }
    }, [maxHeight]);

    useEffect(() => {
      adjustTextareaHeight();
      window.addEventListener("resize", adjustTextareaHeight);
      return () => window.removeEventListener("resize", adjustTextareaHeight);
    }, [adjustTextareaHeight]);

    useEffect(() => {
      if (localRef.current) {
        if (!content) {
          localRef.current.style.height = "110px";
          setTextareaHeight("110px");
          setIsExpanded(false);
        } else {
          adjustTextareaHeight();
        }
      }
    }, [content, adjustTextareaHeight]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onSubmit();
        }
      },
      [onSubmit],
    );

    const handleMinimize = useCallback(() => {
      setTextareaHeight("110px");
      setIsExpanded(false);
    }, []);

    const handleMaximize = useCallback(() => {
      if (localRef.current) {
        const bottomPadding = 60;
        setTextareaHeight(
          `${Math.min(localRef.current.scrollHeight, maxHeight - bottomPadding)}px`,
        );
        setIsExpanded(true);
      }
    }, [maxHeight]);

    return (
      <div
        className={`relative rounded-2xl bg-muted transition-all overflow-hidden ${
          isFocused ? "ring-1 ring-border/60" : ""
        } ${className}`}
      >
        {isExpanded && parseInt(textareaHeight) > 200 && (
          <button
            onClick={handleMinimize}
            className="absolute top-2 right-2 p-1.5 rounded-full text-muted-foreground hover:bg-accent z-10"
          >
            <Minimize2 size={16} />
          </button>
        )}

        {!isExpanded && content.length > 0 && (
          <button
            onClick={handleMaximize}
            className="absolute top-2 right-2 p-1.5 rounded-full text-muted-foreground hover:bg-accent z-10"
          >
            <Maximize2 size={16} />
          </button>
        )}

        <textarea
          ref={localRef}
          style={{
            height: textareaHeight,
            maxHeight: `${maxHeight}px`,
            paddingBottom: "60px",
          }}
          placeholder={placeholder}
          value={content}
          onChange={(e) => {
            onContentChange(e.target.value);
            setTimeout(adjustTextareaHeight, 0);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="w-full p-4 rounded-2xl border-none resize-none outline-none bg-muted text-foreground placeholder-muted-foreground overflow-auto text-base"
          disabled={disabled}
        />
      </div>
    );
  },
);

TextInput.displayName = "TextInput";

// ============================================================================
// RESOURCE CHIP COMPONENT
// ============================================================================

/**
 * Get icon for resource type
 */
function getResourceIcon(type: PublicResourceType) {
  switch (type) {
    case "image_link":
      return ImageIcon;
    case "file":
    case "file_link":
      return FileText;
    case "audio":
      return Music;
    case "youtube":
      return Youtube;
    case "webpage":
      return Globe;
    default:
      return Paperclip;
  }
}

interface ResourceChipsProps {
  resources: PublicResource[];
  onRemove: (index: number) => void;
  isUploading?: boolean;
}

function ResourceChips({
  resources,
  onRemove,
  isUploading,
}: ResourceChipsProps) {
  if (resources.length === 0 && !isUploading) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-2 px-2">
      {resources.map((resource, index) => {
        const Icon = getResourceIcon(resource.type);
        const isImage =
          resource.type === "image_link" ||
          (resource.type === "file" &&
            resource.data.mime_type?.startsWith("image/"));

        return (
          <div
            key={index}
            className="relative group rounded-lg overflow-hidden border border-border"
          >
            {isImage && resource.data.url ? (
              <InlineMediaRef
                ref={resource.data.url}
                size={{ width: 64, height: 64 }}
                fit="cover"
                rounded="none"
                fallback={null}
                alt={resource.data.filename || "Uploaded image"}
              />
            ) : (
              <div className="h-16 w-16 flex flex-col items-center justify-center bg-muted p-1">
                <Icon className="h-5 w-5 text-muted-foreground mb-1" />
                <span className="text-[8px] text-muted-foreground text-center truncate w-full px-1">
                  {resource.data.filename || resource.type}
                </span>
              </div>
            )}
            <button
              onClick={() => onRemove(index)}
              className="absolute top-0.5 right-0.5 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
      {isUploading && (
        <div className="h-16 w-16 flex items-center justify-center rounded-lg border border-border bg-muted">
          <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// INPUT BOTTOM CONTROLS
// ============================================================================

interface InputBottomControlsProps {
  disabled: boolean;
  onSendMessage: () => void;
  hasResources: boolean;
  onResourceSelected: (resource: PublicResource) => void;
  isUploading?: boolean;
  isAuthenticated?: boolean;
  onOpenAgentPicker?: () => void;
  selectedAgent?: AgentConfig | null;
  seamless?: boolean;
  onTranscription?: (text: string) => void;
  // Model picker props (inline inside input)
  availableModels?: AIModel[];
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
  onSettingsClick?: () => void;
}

function InputBottomControls({
  disabled,
  onSendMessage,
  hasResources,
  onResourceSelected,
  isUploading,
  isAuthenticated = false,
  onOpenAgentPicker,
  selectedAgent,
  seamless = false,
  onTranscription,
  availableModels,
  selectedModel,
  onModelChange,
  onSettingsClick,
}: InputBottomControlsProps) {
  const [isResourcePickerOpen, setIsResourcePickerOpen] = useState(false);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);

  const currentModelName =
    availableModels?.find((m) => m.id === selectedModel)?.common_name ??
    availableModels?.find((m) => m.id === selectedModel)?.name ??
    selectedModel ??
    null;

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 h-[50px] bg-muted z-5 ${seamless ? "rounded-b-none" : "rounded-b-2xl"}`}
    >
      {/* Left side controls */}
      <div className="absolute bottom-0 left-0 flex items-center">
        {/* Resource Picker Popover */}
        <Popover
          open={isResourcePickerOpen}
          onOpenChange={setIsResourcePickerOpen}
        >
          <PopoverTrigger asChild>
            <TapTargetButtonTransparent
              disabled={disabled || isUploading}
              ariaLabel="Add resources"
              icon={
                <Plus
                  className={`w-4 h-4 ${hasResources ? "text-primary" : "text-muted-foreground"}`}
                />
              }
            />
          </PopoverTrigger>
          <PopoverContent
            className="w-80 p-0 border-border"
            align="start"
            side="top"
            sideOffset={8}
          >
            <PublicResourcePickerMenu
              onResourceSelected={(resource) => {
                onResourceSelected(resource);
                setIsResourcePickerOpen(false);
              }}
              onClose={() => setIsResourcePickerOpen(false)}
              isAuthenticated={isAuthenticated}
            />
          </PopoverContent>
        </Popover>

        {/* Inline model picker */}
        {availableModels && availableModels.length > 0 && onModelChange && (
          <Popover open={isModelPickerOpen} onOpenChange={setIsModelPickerOpen}>
            <PopoverTrigger asChild>
              <button
                disabled={disabled}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed min-w-0 max-w-[180px]"
                title="Change model"
              >
                <span className="text-xs truncate">
                  {currentModelName || "Select model"}
                </span>
                <ChevronDown size={11} className="flex-shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-64 p-1 border-border"
              align="start"
              side="top"
              sideOffset={8}
            >
              <div className="max-h-72 overflow-y-auto">
                {availableModels
                  .filter((m) => !m.is_deprecated)
                  .map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        onModelChange(m.id);
                        setIsModelPickerOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs rounded-md transition-colors hover:bg-accent ${
                        m.id === selectedModel
                          ? "text-foreground font-medium bg-accent/60"
                          : "text-muted-foreground"
                      }`}
                    >
                      {m.common_name || m.name || m.id}
                    </button>
                  ))}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {onOpenAgentPicker && (
          <button
            onClick={onOpenAgentPicker}
            disabled={disabled}
            className="flex items-center gap-1 px-1 py-0.5 rounded-md transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed min-w-0 max-w-[200px]"
            title={
              selectedAgent?.name
                ? `Switch agent: ${selectedAgent.name}`
                : "Select Agent"
            }
          >
            <span className="text-xs truncate" title={selectedAgent?.name}>
              {selectedAgent?.name || "Select Agent"}
            </span>
            <ChevronDown size={12} className="flex-shrink-0" />
          </button>
        )}
      </div>

      {/* Right side controls */}
      <div className="absolute bottom-0 right-0 flex items-center">
        {onSettingsClick && (
          <TapTargetButtonTransparent
            onClick={onSettingsClick}
            disabled={disabled}
            ariaLabel="Model settings"
            icon={<Settings2 className="w-4 h-4 text-muted-foreground" />}
          />
        )}
        {onTranscription && (
          <VoiceMicButton
            disabled={disabled}
            onTranscription={onTranscription}
          />
        )}
        <TapTargetButtonSolid
          onClick={onSendMessage}
          disabled={disabled}
          ariaLabel="Send message"
          icon={<ArrowUp className="w-4 h-4" />}
        />
      </div>
    </div>
  );
}

// ============================================================================
// CHAT INPUT WITH CONTROLS
// ============================================================================

interface ChatInputWithControlsProps {
  onSubmit: (content: string, resources?: PublicResource[]) => Promise<boolean>;
  disabled?: boolean;
  placeholder?: string;
  conversationId?: string;
  enableResourcePicker?: boolean;
  isAuthenticated?: boolean;
  /** Opens the unified agent picker sheet */
  onOpenAgentPicker?: () => void;
  /** Whether the current agent has variables (allows submission without content) */
  hasVariables?: boolean;
  /** Currently selected agent */
  selectedAgent?: AgentConfig | null;
  /** Ref to the text input for external tab navigation */
  textInputRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** When true, removes top border-radius for seamless join with component above */
  seamless?: boolean;
  /** Available models for inline model picker */
  availableModels?: AIModel[];
  /** Currently selected model id */
  selectedModel?: string;
  /** Called when user picks a different model */
  onModelChange?: (modelId: string) => void;
  /** Called when user clicks the settings icon */
  onSettingsClick?: () => void;
}

export function ChatInputWithControls({
  onSubmit,
  disabled = false,
  placeholder,
  enableResourcePicker = true,
  isAuthenticated = false,
  onOpenAgentPicker,
  hasVariables = false,
  selectedAgent,
  textInputRef: externalTextInputRef,
  seamless = false,
  availableModels,
  selectedModel,
  onModelChange,
  onSettingsClick,
}: ChatInputWithControlsProps) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resources, setResources] = useState<PublicResource[]>([]);
  const [oversizedPdf, setOversizedPdf] = useState<File | null>(null);
  const internalTextInputRef = useRef<HTMLTextAreaElement>(null);
  const textInputRef = externalTextInputRef || internalTextInputRef;

  // Universal file handler — same path for authenticated and anonymous users
  const { upload, uploading: isUploading, error: uploadError } = useFileUpload();

  const normalizedToResource = useCallback(
    (normalized: NormalizedFile, originalName: string, originalSize: number): PublicResource => {
      const mimeType = normalized.meta.mime ?? "";

      let resourceType: PublicResourceType = "file";
      if (mimeType.startsWith("image/")) resourceType = "image_link";
      else if (mimeType.startsWith("audio/")) resourceType = "audio";
      else if (mimeType.startsWith("video/")) resourceType = "file";

      const url = normalized.url ?? (normalized.fileId ? `cld_files:${normalized.fileId}` : "");
      return {
        type: resourceType,
        data: {
          url,
          filename: normalized.meta.fileName ?? originalName,
          mime_type: mimeType,
          size: normalized.meta.sizeBytes ?? originalSize,
          type: mimeType,
        },
      };
    },
    [],
  );

  const handlePasteImage = useCallback(
    async (file: File) => {
      setOversizedPdf(null);
      try {
        const normalized = await upload(
          { kind: "file", file },
          { folderPath: "Public Chat Uploads", visibility: "public" },
        );
        setResources((prev) => [...prev, normalizedToResource(normalized, file.name, file.size)]);
      } catch {
        if (file.type === "application/pdf" && file.size > 10 * 1024 * 1024) {
          setOversizedPdf(file);
        }
      }
    },
    [upload, normalizedToResource],
  );

  // Setup clipboard paste handler
  useClipboardPaste({
    textareaRef: textInputRef,
    onPasteImage: handlePasteImage,
    disabled: !enableResourcePicker || disabled,
  });

  // Focus is primarily managed by ChatContainer (which knows about variables
  // and coordinates focus on agent change). This effect is intentionally empty —
  // ChatContainer's retry-based focus handles both initial load and agent changes.

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
  }, []);

  // Handle voice transcription — append to existing content
  const handleTranscription = useCallback((text: string) => {
    setContent((prev) => {
      if (!prev.trim()) return text;
      return `${prev}\n${text}`;
    });
  }, []);

  const handleRemoveResource = useCallback((index: number) => {
    setResources((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Handle resource selected from picker
  const handleResourceSelected = useCallback((resource: PublicResource) => {
    setResources((prev) => [...prev, resource]);
  }, []);

  const handleSubmit = useCallback(async () => {
    // Allow submission if:
    // - Has content, OR
    // - Has resources, OR
    // - Has variables (user can submit with variables only)
    if (!content.trim() && resources.length === 0 && !hasVariables) return;
    if (isSubmitting || disabled || isUploading) return;

    setIsSubmitting(true);

    try {
      // Make a copy of resources to ensure we send what's visible
      const resourcesToSend = [...resources];
      const success = await onSubmit(
        content,
        resourcesToSend.length > 0 ? resourcesToSend : undefined,
      );
      if (success) {
        setContent("");
        setResources([]);
        textInputRef.current?.focus();
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    content,
    resources,
    onSubmit,
    isSubmitting,
    disabled,
    isUploading,
    hasVariables,
  ]);

  const isDisabled = disabled || isSubmitting || isUploading;

  return (
    <div className="relative">
      <div
        className={`relative border border-border bg-muted ${seamless ? "rounded-b-2xl rounded-t-none border-t-0" : "rounded-2xl"}`}
      >
        {/* Resource chips display */}
        {(resources.length > 0 || isUploading) && (
          <div className="pt-2">
            <ResourceChips
              resources={resources}
              onRemove={handleRemoveResource}
              isUploading={isUploading}
            />
          </div>
        )}

        {/* Upload error display */}
        {uploadError && (
          <div className="px-4 py-2 text-sm text-red-500">
            {uploadError.message}
            {oversizedPdf && (
              <Suspense
                fallback={<Loader2 className="h-4 w-4 animate-spin mt-1" />}
              >
                <PdfOptimizePrompt
                  file={oversizedPdf}
                  onOptimized={(optimizedFile) => {
                    setOversizedPdf(null);
                    handlePasteImage(optimizedFile);
                  }}
                  onDismiss={() => setOversizedPdf(null)}
                />
              </Suspense>
            )}
          </div>
        )}

        <TextInput
          ref={textInputRef}
          content={content}
          disabled={isDisabled}
          onContentChange={handleContentChange}
          onSubmit={handleSubmit}
          placeholder={placeholder}
        />

        {/* InputBottomControls rendered inside the border container but with
                    overflow-visible so tooltips can escape above the input area */}
        <InputBottomControls
          disabled={isDisabled}
          onSendMessage={handleSubmit}
          hasResources={resources.length > 0}
          onResourceSelected={handleResourceSelected}
          isUploading={isUploading}
          isAuthenticated={isAuthenticated}
          onOpenAgentPicker={onOpenAgentPicker}
          selectedAgent={selectedAgent}
          seamless={seamless}
          onTranscription={handleTranscription}
          availableModels={availableModels}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          onSettingsClick={onSettingsClick}
        />
      </div>
    </div>
  );
}

export default ChatInputWithControls;
