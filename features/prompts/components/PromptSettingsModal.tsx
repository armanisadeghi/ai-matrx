"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CopyInput, Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyTextarea, Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Check,
  Info,
  FileJson,
  Settings2,
  Variable,
  Plus,
  RefreshCw,
  AlertCircle,
  X,
  Rocket,
  Wrench,
  Sliders,
  AlertCircle as UnusedIcon,
  Tag,
  Star,
  Archive,
  Loader2,
} from "lucide-react";
import {
  PromptVariable,
  PromptMessage,
  PromptSettings,
  VariableCustomComponent,
} from "@/features/prompts/types/core";
import { VariableEditor } from "./configuration/VariableEditor";
import { ModelSettings } from "./configuration/ModelSettings";
import CodeBlock from "@/features/code-editor/components/code-block/CodeBlock";
import { FullPromptOptimizer } from "@/features/prompts/components/actions/prompt-optimizers/FullPromptOptimizer";
import StandalonePromptsPreferences from "@/components/user-preferences/StandalonePromptsPreferences";
import { isVariableUsed } from "@/features/prompts/utils/variable-utils";
import { usePromptCategorizer } from "@/features/prompts/hooks/usePromptCategorizer";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAllUserPrompts } from "@/lib/redux/slices/promptCacheSlice";

class ModalErrorBoundary extends React.Component<
  { children: React.ReactNode; onClose: () => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; onClose: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error) {
    console.error("[PromptSettingsModal] Crash caught:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center h-full">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">
              Settings failed to load
            </p>
            <p className="text-xs text-muted-foreground max-w-sm">
              {this.state.error?.message ?? "An unexpected error occurred."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Retry
            </Button>
            <Button size="sm" onClick={this.props.onClose}>
              Close
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface PromptSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  promptId?: string;
  promptName: string;
  promptDescription?: string;
  variableDefaults: PromptVariable[];
  messages: PromptMessage[];
  settings: Record<string, any>;
  models: any[];
  availableTools?: any[];
  // Metadata fields
  tags?: string[];
  category?: string;
  isFavorite?: boolean;
  isArchived?: boolean;
  modelId?: string;
  outputFormat?: string;
  outputSchema?: unknown;
  onUpdate: (
    id: string,
    data: {
      name: string;
      description?: string;
      variableDefaults: PromptVariable[];
      messages?: PromptMessage[];
      settings?: Record<string, any>;
      tags?: string[];
      category?: string;
      isFavorite?: boolean;
      isArchived?: boolean;
      modelId?: string;
      outputFormat?: string;
      outputSchema?: unknown;
    },
  ) => void;
  onLocalStateUpdate: (
    updates: {
      name?: string;
      description?: string;
      variableDefaults?: PromptVariable[];
      messages?: PromptMessage[];
      settings?: Record<string, any>;
      tags?: string[];
      category?: string;
      isFavorite?: boolean;
      isArchived?: boolean;
      modelId?: string;
      outputFormat?: string;
      outputSchema?: unknown;
    },
    isFromSave?: boolean,
  ) => void;
}

export function PromptSettingsModal({
  isOpen,
  onClose,
  promptId,
  promptName,
  promptDescription = "",
  variableDefaults,
  messages,
  settings,
  models,
  availableTools = [],
  tags = [],
  category = "",
  isFavorite = false,
  isArchived = false,
  modelId,
  outputFormat,
  outputSchema,
  onUpdate,
  onLocalStateUpdate,
}: PromptSettingsModalProps) {
  const [localName, setLocalName] = useState(promptName);
  const [localDescription, setLocalDescription] = useState(promptDescription);
  const [localVariables, setLocalVariables] = useState<PromptVariable[]>([
    ...variableDefaults,
  ]);
  const [localMessages, setLocalMessages] = useState<PromptMessage[]>([
    ...messages,
  ]);
  const [localSettings, setLocalSettings] = useState<Record<string, any>>({
    ...settings,
  });
  const [isSaving, setIsSaving] = useState(false);

  // Metadata state
  const [localTags, setLocalTags] = useState<string[]>([...tags]);
  const [localCategory, setLocalCategory] = useState(category);
  const [localIsFavorite, setLocalIsFavorite] = useState(isFavorite);
  const [localIsArchived, setLocalIsArchived] = useState(isArchived);
  const [localModelId, setLocalModelId] = useState(modelId ?? "");
  const [localOutputFormat, setLocalOutputFormat] = useState(
    outputFormat ?? "",
  );
  const [localOutputSchema, setLocalOutputSchema] = useState(
    outputSchema ? JSON.stringify(outputSchema, null, 2) : "",
  );
  const [tagInput, setTagInput] = useState("");
  const [outputSchemaError, setOutputSchemaError] = useState<string | null>(
    null,
  );

  const prevIsOpenRef = useRef(isOpen);

  const allPrompts = useAppSelector(selectAllUserPrompts);
  const {
    categorize,
    status: categorizerStatus,
    error: categorizerError,
  } = usePromptCategorizer();
  const isCategorizing = categorizerStatus === "loading";

  const existingCategories = Array.from(
    new Set(allPrompts.map((p) => p.category).filter(Boolean) as string[]),
  ).sort();

  const existingTags = Array.from(
    new Set(allPrompts.flatMap((p) => p.tags ?? [])),
  ).sort();

  // JSON editing state
  const [editableJson, setEditableJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonApplied, setJsonApplied] = useState(false);

  // Variable editor state
  const [selectedVariableIndex, setSelectedVariableIndex] = useState<
    number | null
  >(null);
  const [isAddingVariable, setIsAddingVariable] = useState(false);
  const [editingVariableName, setEditingVariableName] = useState("");
  const [editingVariableDefaultValue, setEditingVariableDefaultValue] =
    useState("");
  const [editingVariableCustomComponent, setEditingVariableCustomComponent] =
    useState<VariableCustomComponent | undefined>();
  const [editingVariableRequired, setEditingVariableRequired] = useState(false);
  const [editingVariableHelpText, setEditingVariableHelpText] = useState("");

  // Full prompt optimizer state
  const [isFullOptimizerOpen, setIsFullOptimizerOpen] = useState(false);

  // Snapshot props into local state only when the modal opens (false → true).
  // Previous implementation included all props in the dep array, which caused an
  // infinite loop: parent passes new object refs on every render → effect fires →
  // local state changes → re-render → effect fires again.
  useEffect(() => {
    const justOpened = isOpen && !prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;

    if (!justOpened) return;

    setLocalName(promptName);
    setLocalDescription(promptDescription);
    setLocalVariables(JSON.parse(JSON.stringify(variableDefaults)));
    setLocalMessages([...messages]);
    setLocalSettings({ ...settings });
    setLocalTags([...tags]);
    setLocalCategory(category);
    setLocalIsFavorite(isFavorite);
    setLocalIsArchived(isArchived);
    setLocalModelId(modelId ?? "");
    setLocalOutputFormat(outputFormat ?? "");
    setLocalOutputSchema(
      outputSchema ? JSON.stringify(outputSchema, null, 2) : "",
    );
    setOutputSchemaError(null);
    setTagInput("");
    setSelectedVariableIndex(null);
    setIsAddingVariable(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Sync editing state when selecting a variable
  useEffect(() => {
    if (isAddingVariable) {
      setEditingVariableName("");
      setEditingVariableDefaultValue("");
      setEditingVariableCustomComponent(undefined);
      setEditingVariableRequired(false);
      setEditingVariableHelpText("");
    } else if (
      selectedVariableIndex !== null &&
      localVariables[selectedVariableIndex]
    ) {
      const variable = localVariables[selectedVariableIndex];
      setEditingVariableName(variable.name);
      setEditingVariableDefaultValue(variable.defaultValue);
      // Deep clone to ensure we get the full structure
      setEditingVariableCustomComponent(
        variable.customComponent
          ? JSON.parse(JSON.stringify(variable.customComponent))
          : undefined,
      );
      setEditingVariableRequired(variable.required || false);
      setEditingVariableHelpText(variable.helpText || "");
    }
  }, [isAddingVariable, selectedVariableIndex, localVariables]);

  // Build the complete prompt object
  const promptObject = useMemo(() => {
    return {
      id: promptId,
      name: localName,
      description: localDescription,
      messages: localMessages,
      variableDefaults: localVariables,
      settings: localSettings,
      tags: localTags.length > 0 ? localTags : undefined,
      category: localCategory || undefined,
      isFavorite: localIsFavorite,
      isArchived: localIsArchived,
      modelId: localModelId || undefined,
      outputFormat: localOutputFormat || undefined,
      outputSchema: localOutputSchema ? parseOutputSchema() : undefined,
    };
  }, [
    promptId,
    localName,
    localDescription,
    localMessages,
    localVariables,
    localSettings,
    localTags,
    localCategory,
    localIsFavorite,
    localIsArchived,
    localModelId,
    localOutputFormat,
    localOutputSchema,
  ]);

  const handleAddTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !localTags.includes(trimmed)) {
      setLocalTags([...localTags, trimmed]);
    }
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    setLocalTags(localTags.filter((t) => t !== tag));
  };

  const handleOutputSchemaChange = (value: string) => {
    setLocalOutputSchema(value);
    if (!value.trim()) {
      setOutputSchemaError(null);
      return;
    }
    try {
      JSON.parse(value);
      setOutputSchemaError(null);
    } catch {
      setOutputSchemaError("Invalid JSON");
    }
  };

  const parseOutputSchema = (): unknown => {
    if (!localOutputSchema.trim()) return undefined;
    try {
      return JSON.parse(localOutputSchema);
    } catch {
      return undefined;
    }
  };

  const handleAutoCategorize = async () => {
    if (!promptId) return;
    const result = await categorize(promptId);
    if (!result) return;
    if (result.category) setLocalCategory(result.category);
    if (result.tags.length > 0) {
      setLocalTags((prev) => [
        ...prev,
        ...result.tags.filter((t) => !prev.includes(t)),
      ]);
    }
    if (result.description) setLocalDescription(result.description);
  };

  // Sync editableJson with promptObject
  useEffect(() => {
    setEditableJson(JSON.stringify(promptObject, null, 2));
    setJsonError(null);
    setJsonApplied(false);
  }, [promptObject]);

  const handleRemoveVariable = (name: string) => {
    setLocalVariables((prev) => prev.filter((v) => v.name !== name));
    if (
      localVariables.findIndex((v) => v.name === name) === selectedVariableIndex
    ) {
      setSelectedVariableIndex(null);
    }
  };

  const handleApplyJson = () => {
    try {
      const parsed = JSON.parse(editableJson);

      // Validate that ID matches (if provided in JSON)
      if (parsed.id && parsed.id !== promptId) {
        throw new Error(
          `ID mismatch: Expected "${promptId}" but got "${parsed.id}"`,
        );
      }

      // Validate required fields
      if (!parsed.name || typeof parsed.name !== "string") {
        throw new Error("Name is required and must be a string");
      }

      // Validate messages structure if provided
      if (parsed.messages && !Array.isArray(parsed.messages)) {
        throw new Error("Messages must be an array");
      }

      // Validate each message has role and content
      if (parsed.messages) {
        for (let i = 0; i < parsed.messages.length; i++) {
          const msg = parsed.messages[i];
          if (
            !msg.role ||
            !["system", "user", "assistant"].includes(msg.role)
          ) {
            throw new Error(
              `Message ${i} must have a valid role (system, user, or assistant)`,
            );
          }
          if (typeof msg.content !== "string") {
            throw new Error(`Message ${i} content must be a string`);
          }
        }
      }

      // Validate variableDefaults structure
      if (parsed.variableDefaults && !Array.isArray(parsed.variableDefaults)) {
        throw new Error("Variable defaults must be an array");
      }

      // Update all local state with parsed values
      setLocalName(parsed.name);
      setLocalDescription(parsed.description || "");
      setLocalVariables(
        Array.isArray(parsed.variableDefaults) ? parsed.variableDefaults : [],
      );
      setLocalMessages(
        Array.isArray(parsed.messages) ? parsed.messages : localMessages,
      );
      setLocalSettings(
        parsed.settings && typeof parsed.settings === "object"
          ? parsed.settings
          : localSettings,
      );
      if (Array.isArray(parsed.tags)) setLocalTags(parsed.tags);
      if (parsed.category !== undefined)
        setLocalCategory(parsed.category || "");
      if (typeof parsed.isFavorite === "boolean")
        setLocalIsFavorite(parsed.isFavorite);
      if (typeof parsed.isArchived === "boolean")
        setLocalIsArchived(parsed.isArchived);
      if (parsed.modelId !== undefined) setLocalModelId(parsed.modelId || "");
      if (parsed.outputFormat !== undefined)
        setLocalOutputFormat(parsed.outputFormat || "");
      if (parsed.outputSchema !== undefined) {
        setLocalOutputSchema(
          parsed.outputSchema
            ? JSON.stringify(parsed.outputSchema, null, 2)
            : "",
        );
      }

      setJsonError(null);
      setJsonApplied(true);

      // Auto-hide success message after 3 seconds
      setTimeout(() => setJsonApplied(false), 3000);
    } catch (error) {
      setJsonError(
        error instanceof Error ? error.message : "Invalid JSON format",
      );
      setJsonApplied(false);
    }
  };

  const handleSave = async () => {
    if (!promptId) return;

    setIsSaving(true);
    try {
      const updateData = {
        name: localName.trim(),
        description: localDescription.trim(),
        variableDefaults: localVariables,
        messages: localMessages,
        settings: localSettings,
        tags: localTags.length > 0 ? localTags : undefined,
        category: localCategory.trim() || undefined,
        isFavorite: localIsFavorite,
        isArchived: localIsArchived,
        modelId: localModelId.trim() || undefined,
        outputFormat: localOutputFormat.trim() || undefined,
        outputSchema: parseOutputSchema(),
      };

      onUpdate(promptId, updateData);
      onLocalStateUpdate(updateData, true);
      onClose();
    } catch (error) {
      console.error("Error saving prompt settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setLocalName(promptName);
    setLocalDescription(promptDescription);
    setLocalVariables([...variableDefaults]);
    setLocalMessages([...messages]);
    setLocalSettings({ ...settings });
    setLocalTags([...tags]);
    setLocalCategory(category);
    setLocalIsFavorite(isFavorite);
    setLocalIsArchived(isArchived);
    setLocalModelId(modelId ?? "");
    setLocalOutputFormat(outputFormat ?? "");
    setLocalOutputSchema(
      outputSchema ? JSON.stringify(outputSchema, null, 2) : "",
    );
    setOutputSchemaError(null);
    onClose();
  };

  // Get model name from local settings
  const selectedModel = models.find((m) => m.id === localSettings?.model_id);
  const modelName =
    selectedModel?.common_name || selectedModel?.name || "Unknown";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[95dvh] flex flex-col bg-textured p-0">
        <DialogHeader className="px-4 py-3 border-b border-border flex-shrink-0">
          <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Prompt Settings
          </DialogTitle>
          <DialogDescription className="sr-only">
            Configure prompt metadata, variables, tools, messages, and model settings.
          </DialogDescription>
        </DialogHeader>

        <ModalErrorBoundary onClose={onClose}>
        <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
          <TabsList>
            <TabsTrigger value="overview" className="text-xs sm:text-sm">
              <Info className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="metadata" className="text-xs sm:text-sm">
              <Tag className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
              Metadata
            </TabsTrigger>
            <TabsTrigger value="variables" className="text-xs sm:text-sm">
              <Variable className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
              Variables
            </TabsTrigger>
            <TabsTrigger value="tools" className="text-xs sm:text-sm">
              <Wrench className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
              Tools
            </TabsTrigger>
            <TabsTrigger value="messages" className="text-xs sm:text-sm">
              <FileJson className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
              Messages
            </TabsTrigger>
            <TabsTrigger value="settings" className="text-xs sm:text-sm">
              <Settings2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="preferences" className="text-xs sm:text-sm">
              <Sliders className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
              Preferences
            </TabsTrigger>
            <TabsTrigger value="json" className="text-xs sm:text-sm">
              <FileJson className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
              JSON
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-4 pb-4">
            <TabsContent
              value="overview"
              className="h-full overflow-y-auto mt-3 space-y-3"
            >
              {/* AI Optimization Feature */}
              <Card className="p-4 bg-gradient-to-br from-blue-50 to-orange-50 dark:from-blue-950/30 dark:to-orange-950/30 border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                    <Rocket className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                        AI-Powered Prompt Optimization
                      </h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-200 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 font-medium">
                        BETA
                      </span>
                    </div>
                    <p className="text-xs text-blue-800 dark:text-blue-200/90 mb-3">
                      Let AI analyze and enhance your entire prompt
                      configuration including messages, variables, and settings
                      for optimal performance.
                    </p>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setIsFullOptimizerOpen(true)}
                      className="h-8 text-xs bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white"
                    >
                      <Rocket className="h-3.5 w-3.5 mr-1.5" />
                      Optimize All Settings
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Basic Info */}
              <Card className="p-3 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Basic Information
                </h3>
                <div className="space-y-2">
                  <div>
                    <Label
                      htmlFor="prompt-name"
                      className="text-xs font-medium text-gray-700 dark:text-gray-300"
                    >
                      Name
                    </Label>
                    <CopyInput
                      id="prompt-name"
                      value={localName}
                      onChange={(e) => setLocalName(e.target.value)}
                      placeholder="Enter prompt name..."
                      className="mt-1 h-8 text-sm bg-gray-50 dark:bg-gray-700"
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor="prompt-description"
                      className="text-xs font-medium text-gray-700 dark:text-gray-300"
                    >
                      Description
                    </Label>
                    <CopyTextarea
                      id="prompt-description"
                      value={localDescription}
                      onChange={(e) => setLocalDescription(e.target.value)}
                      placeholder="Describe what this prompt does..."
                      className="mt-1 text-sm bg-gray-50 dark:bg-gray-700 min-h-[60px]"
                      rows={2}
                    />
                  </div>
                  {promptId && (
                    <div>
                      <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        ID
                      </Label>
                      <CopyInput
                        value={promptId}
                        readOnly
                        className="mt-1 h-8 text-xs font-mono bg-gray-50 dark:bg-gray-700"
                      />
                    </div>
                  )}
                </div>
              </Card>

              {/* Quick Stats */}
              <Card className="p-3 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Quick Stats
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded">
                    <span className="text-gray-600 dark:text-gray-400">
                      Messages:
                    </span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                      {messages.length}
                    </span>
                  </div>
                  <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded">
                    <span className="text-gray-600 dark:text-gray-400">
                      Variables:
                    </span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                      {localVariables.length}
                    </span>
                  </div>
                  <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded col-span-2">
                    <span className="text-gray-600 dark:text-gray-400">
                      Model:
                    </span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                      {modelName}
                    </span>
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent
              value="metadata"
              className="h-full overflow-y-auto mt-3 space-y-3"
            >
              <div className="max-w-3xl mx-auto space-y-3">
                {/* AI Auto-Categorize — only for user prompts (not builtins) */}
                {promptId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAutoCategorize}
                    disabled={isCategorizing || isSaving}
                    className="w-full flex items-center gap-2"
                  >
                    {isCategorizing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Rocket className="h-4 w-4 text-primary" />
                    )}
                    {isCategorizing
                      ? "Categorizing..."
                      : "Auto-Categorize with AI"}
                  </Button>
                )}

                {/* Category */}
                <Card className="p-3 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Category
                  </h3>
                  <div className="relative">
                    <Input
                      value={localCategory}
                      onChange={(e) => setLocalCategory(e.target.value)}
                      placeholder="e.g. Writing, Code, Research..."
                      className="h-9 text-sm"
                      list="category-suggestions"
                    />
                    <datalist id="category-suggestions">
                      {existingCategories.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                </Card>

                {/* Tags */}
                <Card className="p-3 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5" />
                    Tags
                  </h3>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {localTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:text-destructive transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && tagInput.trim()) {
                        e.preventDefault();
                        handleAddTag(tagInput);
                      } else if (
                        e.key === "Backspace" &&
                        !tagInput &&
                        localTags.length > 0
                      ) {
                        handleRemoveTag(localTags[localTags.length - 1]);
                      }
                    }}
                    placeholder="Type and press Enter to add..."
                    className="h-9 text-sm"
                    list="tag-suggestions"
                  />
                  <datalist id="tag-suggestions">
                    {existingTags
                      .filter((t) => !localTags.includes(t))
                      .map((t) => (
                        <option key={t} value={t} />
                      ))}
                  </datalist>
                </Card>

                {/* Favorite / Archived toggles */}
                <Card className="p-3 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Status
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-1">
                      <Label className="flex items-center gap-1.5 cursor-pointer text-sm">
                        <Star
                          className={cn(
                            "h-4 w-4",
                            localIsFavorite
                              ? "fill-amber-400 text-amber-400"
                              : "text-muted-foreground",
                          )}
                        />
                        Favorite
                      </Label>
                      <Switch
                        checked={localIsFavorite}
                        onCheckedChange={setLocalIsFavorite}
                      />
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <Label className="flex items-center gap-1.5 cursor-pointer text-sm">
                        <Archive className="h-4 w-4 text-muted-foreground" />
                        Archived
                      </Label>
                      <Switch
                        checked={localIsArchived}
                        onCheckedChange={setLocalIsArchived}
                      />
                    </div>
                  </div>
                </Card>

                {/* Output Format & Schema */}
                <Card className="p-3 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Output Configuration
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Output Format
                      </Label>
                      <Input
                        value={localOutputFormat}
                        onChange={(e) => setLocalOutputFormat(e.target.value)}
                        placeholder="e.g. text, json_object, json_schema..."
                        className="mt-1 h-9 text-sm"
                        list="output-format-suggestions"
                      />
                      <datalist id="output-format-suggestions">
                        <option value="text" />
                        <option value="json_object" />
                        <option value="json_schema" />
                        <option value="markdown" />
                      </datalist>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Output Schema
                        <span className="ml-1 text-muted-foreground font-normal">
                          (JSON)
                        </span>
                      </Label>
                      <Textarea
                        value={localOutputSchema}
                        onChange={(e) =>
                          handleOutputSchemaChange(e.target.value)
                        }
                        placeholder='{"type": "object", "properties": {...}}'
                        className="mt-1 text-xs font-mono min-h-[80px]"
                        rows={4}
                      />
                      {outputSchemaError && (
                        <p className="mt-1 text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {outputSchemaError}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              </div>
            </TabsContent>

            <TabsContent
              value="variables"
              className="h-full overflow-hidden flex flex-col mt-3"
            >
              <div className="flex justify-between items-center mb-3 flex-shrink-0">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Variables ({localVariables.length})
                </h3>
                <Button
                  size="sm"
                  onClick={() => {
                    setIsAddingVariable(true);
                    setSelectedVariableIndex(null);
                  }}
                  className="h-7 text-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add Variable
                </Button>
              </div>

              <div className="flex-1 overflow-hidden flex gap-3">
                {/* Variables List */}
                <div className="w-64 flex-shrink-0 overflow-y-auto space-y-2">
                  {localVariables.length === 0 && !isAddingVariable ? (
                    <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                      <Variable className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p className="text-xs">No variables yet</p>
                    </div>
                  ) : (
                    localVariables.map((variable, index) => {
                      const isUsed = isVariableUsed(
                        variable.name,
                        localMessages,
                      );
                      return (
                        <div
                          key={variable.name}
                          onClick={() => {
                            setSelectedVariableIndex(index);
                            setIsAddingVariable(false);
                          }}
                          className={`p-1 border border-border rounded-lg cursor-pointer transition-colors ${
                            selectedVariableIndex === index && !isAddingVariable
                              ? "bg-cyan-100 dark:bg-cyan-900/30 border-2 border-cyan-500 dark:border-cyan-500"
                              : isUsed
                                ? "bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent"
                                : "bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 border-2 border-amber-200 dark:border-amber-800"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                {!isUsed && (
                                  <UnusedIcon className="w-3 h-3 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                                )}
                                <p
                                  className={`font-mono text-sm font-medium ${
                                    isUsed
                                      ? "text-gray-900 dark:text-gray-100"
                                      : "text-amber-900 dark:text-amber-100"
                                  }`}
                                >
                                  {variable.name}
                                </p>
                              </div>
                              {variable.customComponent && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  {variable.customComponent.type}
                                </p>
                              )}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveVariable(variable.name);
                              }}
                              className="text-gray-400 hover:text-red-500 transition-colors p-1"
                              title="Delete variable"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Variable Editor */}
                <div className="flex-1 overflow-y-auto">
                  {isAddingVariable ? (
                    <div>
                      <VariableEditor
                        name={editingVariableName}
                        defaultValue={editingVariableDefaultValue}
                        customComponent={editingVariableCustomComponent}
                        required={editingVariableRequired}
                        helpText={editingVariableHelpText}
                        existingNames={localVariables.map((v) => v.name)}
                        onNameChange={setEditingVariableName}
                        onDefaultValueChange={setEditingVariableDefaultValue}
                        onCustomComponentChange={
                          setEditingVariableCustomComponent
                        }
                        onRequiredChange={setEditingVariableRequired}
                        onHelpTextChange={setEditingVariableHelpText}
                      />
                      <div className="flex justify-end gap-2 mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsAddingVariable(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            const sanitizedName = editingVariableName.trim();
                            if (
                              sanitizedName &&
                              !localVariables.some(
                                (v) => v.name === sanitizedName,
                              )
                            ) {
                              setLocalVariables([
                                ...localVariables,
                                {
                                  name: sanitizedName,
                                  defaultValue: editingVariableDefaultValue,
                                  customComponent:
                                    editingVariableCustomComponent,
                                  required: editingVariableRequired,
                                  helpText: editingVariableHelpText,
                                },
                              ]);
                              setIsAddingVariable(false);
                            }
                          }}
                          disabled={
                            !editingVariableName.trim() ||
                            localVariables.some(
                              (v) => v.name === editingVariableName.trim(),
                            )
                          }
                        >
                          Add Variable
                        </Button>
                      </div>
                    </div>
                  ) : selectedVariableIndex !== null &&
                    localVariables[selectedVariableIndex] ? (
                    <div>
                      <VariableEditor
                        name={editingVariableName}
                        defaultValue={editingVariableDefaultValue}
                        customComponent={editingVariableCustomComponent}
                        required={editingVariableRequired}
                        helpText={editingVariableHelpText}
                        existingNames={localVariables.map((v) => v.name)}
                        originalName={
                          localVariables[selectedVariableIndex].name
                        }
                        onNameChange={setEditingVariableName}
                        onDefaultValueChange={setEditingVariableDefaultValue}
                        onCustomComponentChange={
                          setEditingVariableCustomComponent
                        }
                        onRequiredChange={setEditingVariableRequired}
                        onHelpTextChange={setEditingVariableHelpText}
                      />
                      <div className="flex justify-end gap-2 mt-4">
                        <Button
                          size="sm"
                          onClick={() => {
                            const originalName =
                              localVariables[selectedVariableIndex].name;
                            setLocalVariables((prev) =>
                              prev.map((v) =>
                                v.name === originalName
                                  ? {
                                      name: editingVariableName,
                                      defaultValue: editingVariableDefaultValue,
                                      customComponent:
                                        editingVariableCustomComponent,
                                      required: editingVariableRequired,
                                      helpText: editingVariableHelpText,
                                    }
                                  : v,
                              ),
                            );
                          }}
                        >
                          Save Changes
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 dark:text-gray-400 py-20">
                      <Variable className="w-16 h-16 mx-auto mb-4 opacity-30" />
                      <p className="text-sm">
                        Select a variable to edit or click Add to create a new
                        one
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="tools"
              className="h-full overflow-y-auto mt-3 space-y-3"
            >
              <div className="max-w-3xl mx-auto">
                <Card className="p-3 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Selected Tools
                  </h3>
                  {localSettings?.tools &&
                  Array.isArray(localSettings.tools) &&
                  localSettings.tools.length > 0 ? (
                    <div className="space-y-2">
                      {localSettings.tools.map(
                        (toolName: string, index: number) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"
                          >
                            <span className="text-sm font-mono text-gray-900 dark:text-gray-100">
                              {toolName}
                            </span>
                            <button
                              onClick={() => {
                                setLocalSettings((prev) => ({
                                  ...prev,
                                  tools: (prev.tools || []).filter(
                                    (_: string, i: number) => i !== index,
                                  ),
                                }));
                              }}
                              className="text-gray-400 hover:text-red-500 transition-colors p-1"
                              title="Remove tool"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                      No tools selected
                    </p>
                  )}
                </Card>

                {availableTools.length > 0 && (
                  <Card className="p-3 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      Available Tools
                    </h3>
                    <div className="space-y-2">
                      {availableTools.map((tool, index) => {
                        const toolName =
                          typeof tool === "string" ? tool : tool.name;
                        const isSelected =
                          localSettings?.tools?.includes(toolName);
                        return (
                          <button
                            key={index}
                            onClick={() => {
                              if (isSelected) {
                                setLocalSettings((prev) => ({
                                  ...prev,
                                  tools: (prev.tools || []).filter(
                                    (t: string) => t !== toolName,
                                  ),
                                }));
                              } else {
                                setLocalSettings((prev) => ({
                                  ...prev,
                                  tools: [...(prev.tools || []), toolName],
                                }));
                              }
                            }}
                            className={`w-full text-left p-2 rounded transition-colors ${
                              isSelected
                                ? "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-900 dark:text-cyan-100"
                                : "bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100"
                            }`}
                          >
                            <span className="text-sm font-mono">
                              {toolName}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </Card>
                )}

                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
                  <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  <span>
                    Tools allow the AI model to perform specific actions during
                    conversation. Only models that support function calling can
                    use tools.
                  </span>
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="messages"
              className="h-full overflow-y-auto mt-3 space-y-2"
            >
              {localMessages.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                  No messages defined
                </p>
              ) : (
                localMessages.map((message, index) => (
                  <Card
                    key={index}
                    className="p-3 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          message.role === "system"
                            ? "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300"
                            : message.role === "user"
                              ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                              : "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                        }`}
                      >
                        {message.role}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {message.content.length} chars
                      </span>
                    </div>
                    <pre className="text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 p-2 rounded overflow-x-auto whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                      {message.content || "(empty)"}
                    </pre>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent
              value="settings"
              className="h-full overflow-y-auto mt-3"
            >
              <div className="max-w-3xl mx-auto">
                <ModelSettings
                  modelId={localSettings?.model_id || ""}
                  models={models}
                  settings={localSettings as PromptSettings}
                  onSettingsChange={(newSettings) => {
                    setLocalSettings((prev) => ({
                      ...prev,
                      ...newSettings,
                    }));
                  }}
                />
              </div>
            </TabsContent>

            <TabsContent
              value="json"
              className="flex-1 flex flex-col min-h-0 mt-3"
            >
              <div className="mb-3 flex justify-between items-center gap-2 flex-shrink-0">
                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
                  <Info className="w-3 h-3 flex-shrink-0" />
                  <span>
                    Edit the JSON (all fields except ID) and click "Apply
                    Changes" to preview. Navigate to other tabs to see the
                    impact. Changes won't be saved until you click "Save
                    Settings".
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={handleApplyJson}
                  className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600 flex-shrink-0"
                >
                  {jsonApplied ? (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                      Applied!
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                      Apply Changes
                    </>
                  )}
                </Button>
              </div>

              {/* Error Message */}
              {jsonError && (
                <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-300 flex items-start gap-1 flex-shrink-0">
                  <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>{jsonError}</span>
                </div>
              )}

              {/* Success Message */}
              {jsonApplied && !jsonError && (
                <div className="mb-3 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-xs text-green-700 dark:text-green-300 flex items-start gap-1 flex-shrink-0">
                  <Check className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>
                    Changes applied! Check other tabs to see updates. Click
                    "Save Settings" to persist changes.
                  </span>
                </div>
              )}

              <div className="flex-1 min-h-0 overflow-y-auto">
                <CodeBlock
                  code={editableJson}
                  language="json"
                  onCodeChange={(newCode) => setEditableJson(newCode)}
                  showLineNumbers={true}
                  wrapLines={true}
                  fontSize={14}
                />
              </div>
            </TabsContent>

            {/* Preferences Tab */}
            <TabsContent
              value="preferences"
              className="h-full overflow-hidden mt-3 flex flex-col"
            >
              <StandalonePromptsPreferences
                onSaveSuccess={() => {
                  // Optional: add success toast
                  console.log("Prompts preferences saved!");
                }}
              />
            </TabsContent>
          </div>
        </Tabs>

        {/* Actions */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border flex-shrink-0">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isSaving}
            className="h-8 text-sm"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !promptId}
            className="h-8 text-sm bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {isSaving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
        </ModalErrorBoundary>
      </DialogContent>

      {/* Full Prompt Optimizer */}
      <FullPromptOptimizer
        isOpen={isFullOptimizerOpen}
        onClose={() => setIsFullOptimizerOpen(false)}
        currentPromptObject={promptObject}
        onAccept={(optimizedObject) => {
          // Apply optimized object to local state
          if (
            optimizedObject.name &&
            typeof optimizedObject.name === "string"
          ) {
            setLocalName(optimizedObject.name);
          }
          if (optimizedObject.description !== undefined) {
            setLocalDescription(optimizedObject.description || "");
          }
          if (Array.isArray(optimizedObject.variableDefaults)) {
            setLocalVariables(optimizedObject.variableDefaults);
          }
          if (Array.isArray(optimizedObject.messages)) {
            setLocalMessages(optimizedObject.messages);
          }
          if (
            optimizedObject.settings &&
            typeof optimizedObject.settings === "object"
          ) {
            setLocalSettings(optimizedObject.settings);
          }
          setIsFullOptimizerOpen(false);
        }}
      />
    </Dialog>
  );
}
