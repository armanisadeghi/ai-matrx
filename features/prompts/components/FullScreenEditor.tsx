"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { X, FileText, MessageSquare, Plus, Zap, Settings2, Variable, Wrench, Save, Eye, Edit2, Rainbow, CheckCircle2, AlertTriangle, FileJson, Info, Check, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PromptEditorContextMenu } from "./PromptEditorContextMenu";
import { SystemPromptOptimizer } from "@/features/prompts/components/actions/prompt-optimizers/SystemPromptOptimizer";
import { ModelSettings } from "./configuration/ModelSettings";
import { VariableEditor } from "./configuration/VariableEditor";
import { sanitizeVariableName, isVariableUsed } from "@/features/prompts/utils/variable-utils";
import { validateVariables } from "@/features/prompts/utils/variable-validator";
import { formatText } from "@/utils/text/text-case-converter";
import { mapIcon } from "@/utils/icons/icon-mapper";
import { PromptMessage, PromptVariable, VariableCustomComponent, PromptSettings } from "@/features/prompts/types/core";
import { HighlightedText } from "./HighlightedText";
import MarkdownStream from "@/components/MarkdownStream";
import { escapeEmbeddedCodeFences } from "@/features/prompts/utils/escape-code-fences";
import CodeBlock from "@/features/code-editor/components/code-block/CodeBlock";

type MessageItem =
    | { type: "system"; index: -1 }
    | { type: "message"; index: number }
    | { type: "settings" }
    | { type: "variables" }
    | { type: "tools" }
    | { type: "advanced" };

interface FullScreenEditorProps {
    isOpen: boolean;
    onClose: () => void;
    developerMessage: string;
    onDeveloperMessageChange: (value: string) => void;
    messages: PromptMessage[];
    onMessageContentChange: (index: number, content: string) => void;
    onMessageRoleChange: (index: number, role: string) => void;
    initialSelection?: MessageItem | null;
    onAddMessage?: () => void;
    // Model Settings
    model?: string;
    models?: any[];
    modelConfig?: PromptSettings;
    onModelChange?: (value: string) => void;
    onModelConfigChange?: (config: PromptSettings) => void;
    // Variables
    variableDefaults?: PromptVariable[];
    onAddVariable?: (name: string, defaultValue: string, customComponent?: VariableCustomComponent, required?: boolean, helpText?: string) => void;
    onUpdateVariable?: (oldName: string, newName: string, defaultValue: string, customComponent?: VariableCustomComponent, required?: boolean, helpText?: string) => void;
    onRemoveVariable?: (variableName: string) => void;
    // Tools
    selectedTools?: string[];
    availableTools?: any[];
    onAddTool?: (tool: string) => void;
    onRemoveTool?: (tool: string) => void;
    modelSupportsTools?: boolean;
    // Optional save functionality
    onSave?: () => void;
    isSaving?: boolean;
    isDirty?: boolean;
}

export function FullScreenEditor({
    isOpen,
    onClose,
    developerMessage,
    onDeveloperMessageChange,
    messages,
    onMessageContentChange,
    onMessageRoleChange,
    initialSelection,
    onAddMessage,
    model,
    models,
    modelConfig,
    onModelChange,
    onModelConfigChange,
    variableDefaults = [],
    onAddVariable,
    onUpdateVariable,
    onRemoveVariable,
    selectedTools = [],
    availableTools = [],
    onAddTool,
    onRemoveTool,
    modelSupportsTools = false,
    onSave,
    isSaving = false,
    isDirty = false,
}: FullScreenEditorProps) {
    const [selectedItem, setSelectedItem] = useState<MessageItem>({ type: "system", index: -1 });
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [isOptimizerOpen, setIsOptimizerOpen] = useState(false);
    const [selectedVariableIndex, setSelectedVariableIndex] = useState<number | null>(null);
    const [isAddingVariable, setIsAddingVariable] = useState(false);
    const [viewMode, setViewMode] = useState<"view" | "edit" | "pretty">("view");

    // State for variable being edited/added
    const [editingVariableName, setEditingVariableName] = useState("");
    const [editingVariableDefaultValue, setEditingVariableDefaultValue] = useState("");
    const [editingVariableCustomComponent, setEditingVariableCustomComponent] = useState<VariableCustomComponent | undefined>();
    const [editingVariableRequired, setEditingVariableRequired] = useState(false);
    const [editingVariableHelpText, setEditingVariableHelpText] = useState("");

    // JSON editing state
    const [editableJson, setEditableJson] = useState("");
    const [jsonError, setJsonError] = useState<string | null>(null);
    const [jsonApplied, setJsonApplied] = useState(false);

    // Calculate variable validation
    const variableValidation = useMemo(() => {
        return validateVariables(messages, developerMessage, variableDefaults);
    }, [messages, developerMessage, variableDefaults]);

    // Build the complete prompt object
    const promptObject = useMemo(() => {
        return {
            developerMessage,
            messages,
            variableDefaults,
            model,
            modelConfig,
            selectedTools,
        };
    }, [developerMessage, messages, variableDefaults, model, modelConfig, selectedTools]);

    // Sync editableJson with promptObject
    useEffect(() => {
        setEditableJson(JSON.stringify(promptObject, null, 2));
        setJsonError(null);
        setJsonApplied(false);
    }, [promptObject]);

    // Update selected item when initialSelection changes
    useEffect(() => {
        if (isOpen && initialSelection) {
            setSelectedItem(initialSelection);
        } else if (isOpen && !initialSelection) {
            // Reset to system message if no initial selection
            setSelectedItem({ type: "system", index: -1 });
        }
    }, [isOpen, initialSelection]);

    // Reset to view mode when switching between messages
    useEffect(() => {
        if (selectedItem.type === "system" || selectedItem.type === "message") {
            setViewMode("view");
        }
    }, [selectedItem]);

    // Auto-focus textarea when switching to edit mode
    useEffect(() => {
        if (viewMode === "edit" && textareaRef.current) {
            textareaRef.current.focus();
        }
    }, [viewMode]);

    // Sync editing state when selecting a variable
    useEffect(() => {
        if (isAddingVariable) {
            setEditingVariableName("");
            setEditingVariableDefaultValue("");
            setEditingVariableCustomComponent(undefined);
            setEditingVariableRequired(false);
            setEditingVariableHelpText("");
        } else if (selectedVariableIndex !== null && variableDefaults[selectedVariableIndex]) {
            const variable = variableDefaults[selectedVariableIndex];
            setEditingVariableName(variable.name);
            setEditingVariableDefaultValue(variable.defaultValue);
            setEditingVariableCustomComponent(variable.customComponent);
            setEditingVariableRequired(variable.required || false);
            setEditingVariableHelpText(variable.helpText || "");
        }
    }, [isAddingVariable, selectedVariableIndex, variableDefaults]);

    const getCurrentContent = () => {
        if (selectedItem.type === "system") {
            return developerMessage;
        }
        if (selectedItem.type === "message") {
            return messages[selectedItem.index]?.content || "";
        }
        return "";
    };

    const handleContentChange = (newContent: string) => {
        if (selectedItem.type === "system") {
            onDeveloperMessageChange(newContent);
        } else if (selectedItem.type === "message") {
            onMessageContentChange(selectedItem.index, newContent);
        }
    };

    const handleApplyJson = () => {
        try {
            const parsed = JSON.parse(editableJson);

            // Validate developerMessage
            if (parsed.developerMessage !== undefined && typeof parsed.developerMessage !== "string") {
                throw new Error("developerMessage must be a string");
            }

            // Validate messages structure
            if (parsed.messages && !Array.isArray(parsed.messages)) {
                throw new Error("messages must be an array");
            }

            // Validate each message
            if (parsed.messages) {
                for (let i = 0; i < parsed.messages.length; i++) {
                    const msg = parsed.messages[i];
                    if (!msg.role || !["system", "user", "assistant"].includes(msg.role)) {
                        throw new Error(`Message ${i} must have a valid role (system, user, or assistant)`);
                    }
                    if (typeof msg.content !== "string") {
                        throw new Error(`Message ${i} content must be a string`);
                    }
                }
            }

            // Validate variableDefaults structure
            if (parsed.variableDefaults && !Array.isArray(parsed.variableDefaults)) {
                throw new Error("variableDefaults must be an array");
            }

            // Validate selectedTools
            if (parsed.selectedTools && !Array.isArray(parsed.selectedTools)) {
                throw new Error("selectedTools must be an array");
            }

            // Apply changes using provided callbacks
            if (parsed.developerMessage !== undefined && onDeveloperMessageChange) {
                onDeveloperMessageChange(parsed.developerMessage);
            }

            if (parsed.messages && Array.isArray(parsed.messages)) {
                // Apply message changes
                parsed.messages.forEach((msg: PromptMessage, index: number) => {
                    if (index < messages.length) {
                        onMessageContentChange(index, msg.content);
                        onMessageRoleChange(index, msg.role);
                    }
                });
            }

            if (parsed.model && onModelChange) {
                onModelChange(parsed.model);
            }

            if (parsed.modelConfig && onModelConfigChange) {
                onModelConfigChange(parsed.modelConfig);
            }

            if (parsed.selectedTools && Array.isArray(parsed.selectedTools)) {
                // Remove tools that are no longer selected
                selectedTools.forEach((tool) => {
                    if (!parsed.selectedTools.includes(tool) && onRemoveTool) {
                        onRemoveTool(tool);
                    }
                });

                // Add newly selected tools
                parsed.selectedTools.forEach((tool: string) => {
                    if (!selectedTools.includes(tool) && onAddTool) {
                        onAddTool(tool);
                    }
                });
            }

            setJsonError(null);
            setJsonApplied(true);

            // Auto-hide success message after 3 seconds
            setTimeout(() => setJsonApplied(false), 3000);
        } catch (error) {
            setJsonError(error instanceof Error ? error.message : "Invalid JSON format");
            setJsonApplied(false);
        }
    };

    const getCurrentRole = () => {
        if (selectedItem.type === "system") {
            return "system";
        }
        if (selectedItem.type === "message") {
            return messages[selectedItem.index]?.role || "user";
        }
        return "user";
    };

    const getRoleColor = (role: string) => {
        switch (role) {
            case "system":
                return "text-purple-600 dark:text-purple-400";
            case "user":
                return "text-blue-600 dark:text-blue-400";
            case "assistant":
                return "text-green-600 dark:text-green-400";
            default:
                return "text-gray-600 dark:text-gray-400";
        }
    };

    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case "system":
                return "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300";
            case "user":
                return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300";
            case "assistant":
                return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300";
            default:
                return "bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300";
        }
    };

    const handleOptimizedAccept = (optimizedText: string) => {
        onDeveloperMessageChange(optimizedText);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-none w-screen h-screen p-0 m-0 rounded-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-90 data-[state=open]:zoom-in-90 data-[state=open]:duration-300 data-[state=closed]:duration-200">
                <div className="flex h-full bg-gray-50 dark:bg-gray-950">
                    {/* Sidebar */}
                    <div className="w-80 bg-textured border-r border-border flex flex-col">
                        {/* Sidebar Header */}
                        <div className="p-3 border-b border-border">
                            <div className="flex items-center justify-between">
                                <DialogTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">
                                    Full Screen Editor
                                </DialogTitle>
                                <div className="flex items-center gap-1.5">
                                    {onSave && (
                                        <Button
                                            variant="default"
                                            size="sm"
                                            className="h-7 text-xs"
                                            onClick={onSave}
                                            disabled={isSaving || !isDirty}
                                        >
                                            <Save className="w-3 h-3 mr-1" />
                                            {isSaving ? "Saving..." : "Save"}
                                        </Button>
                                    )}
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setIsOptimizerOpen(true)}
                                className="w-full mt-2 h-8 text-xs bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-0"
                            >
                                <Zap className="h-3.5 w-3.5 mr-1.5" />
                                Optimize System Prompt
                            </Button>
                        </div>

                        {/* Message List */}
                        <div className="flex-1 overflow-y-auto p-2">
                            {/* System Message */}
                            <button
                                onClick={() => setSelectedItem({ type: "system", index: -1 })}
                                className={`w-full text-left p-2 rounded-md mb-1.5 transition-colors ${
                                    selectedItem.type === "system"
                                        ? "bg-purple-100 dark:bg-purple-900/30 border-2 border-purple-500 dark:border-purple-500"
                                        : "bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent"
                                }`}
                            >
                                <div className="flex items-center gap-1.5 mb-1">
                                    <FileText className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                                    <span className="text-xs font-medium text-gray-900 dark:text-gray-100">Message 0</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${getRoleBadgeColor("system")}`}>system</span>
                                </div>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-2">
                                    {developerMessage || "No content"}
                                </p>
                            </button>

                            {/* Prompt Messages */}
                            {messages.map((message, index) => (
                                <button
                                    key={index}
                                    onClick={() => setSelectedItem({ type: "message", index })}
                                    className={`w-full text-left p-2 rounded-md mb-1.5 transition-colors ${
                                        selectedItem.type === "message" && selectedItem.index === index
                                            ? `border-2 ${
                                                  message.role === "user"
                                                      ? "bg-blue-100 dark:bg-blue-900/30 border-blue-500 dark:border-blue-500"
                                                      : "bg-green-100 dark:bg-green-900/30 border-green-500 dark:border-green-500"
                                              }`
                                            : "bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent"
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <MessageSquare className={`w-3.5 h-3.5 ${getRoleColor(message.role)}`} />
                                        <span className="text-xs font-medium text-gray-900 dark:text-gray-100">Message {index + 1}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${getRoleBadgeColor(message.role)}`}>
                                            {message.role}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-2">
                                        {message.content || "No content"}
                                    </p>
                                </button>
                            ))}

                            {/* Special Tabs Divider */}
                            {(models || variableDefaults.length > 0) && (
                                <div className="my-1.5 border-t border-gray-300 dark:border-gray-700" />
                            )}

                            {/* Model Settings Tab */}
                            {models && model && modelConfig && (
                                <button
                                    onClick={() => setSelectedItem({ type: "settings" })}
                                    className={`w-full text-left p-2 rounded-md mb-1.5 transition-colors ${
                                        selectedItem.type === "settings"
                                            ? "bg-orange-100 dark:bg-orange-900/30 border-2 border-orange-500 dark:border-orange-500"
                                            : "bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent"
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Settings2 className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                                        <span className="text-xs font-medium text-gray-900 dark:text-gray-100">Model Settings</span>
                                    </div>
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-1">
                                        {models.find((m) => m.id === model)?.common_name || model}
                                    </p>
                                </button>
                            )}

                            {/* Variables Tab */}
                            {variableDefaults && variableDefaults.length >= 0 && onAddVariable && (
                                <button
                                    onClick={() => setSelectedItem({ type: "variables" })}
                                    className={`w-full text-left p-2 rounded-md mb-1.5 transition-colors ${
                                        selectedItem.type === "variables"
                                            ? "bg-cyan-100 dark:bg-cyan-900/30 border-2 border-cyan-500 dark:border-cyan-500"
                                            : "bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent"
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Variable className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                                        <span className="text-xs font-medium text-gray-900 dark:text-gray-100">Variables</span>
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300">
                                            {variableDefaults.length}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-1">
                                        {variableDefaults.length === 0 ? "No variables" : variableDefaults.map((v) => v.name).join(", ")}
                                    </p>
                                </button>
                            )}

                            {/* Tools Tab */}
                            {availableTools && availableTools.length > 0 && onAddTool && onRemoveTool && (
                                <button
                                    onClick={() => setSelectedItem({ type: "tools" })}
                                    className={`w-full text-left p-2 rounded-md mb-1.5 transition-colors ${
                                        selectedItem.type === "tools"
                                            ? "bg-emerald-100 dark:bg-emerald-900/30 border-2 border-emerald-500 dark:border-emerald-500"
                                            : "bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent"
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Wrench className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                        <span className="text-xs font-medium text-gray-900 dark:text-gray-100">Tools</span>
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                                            {selectedTools.length}
                                        </span>
                                        {!modelSupportsTools && (
                                            <span className="text-[9px] px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                                                N/A
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-1">
                                        {selectedTools.length === 0 ? "No tools" : `${selectedTools.length} selected`}
                                    </p>
                                </button>
                            )}

                            {/* Advanced Tab */}
                            <button
                                onClick={() => setSelectedItem({ type: "advanced" })}
                                className={`w-full text-left p-2 rounded-md mb-1.5 transition-colors ${
                                    selectedItem.type === "advanced"
                                        ? "bg-gray-100 dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-500"
                                        : "bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent"
                                }`}
                            >
                                <div className="flex items-center gap-1.5 mb-1">
                                    <FileJson className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" />
                                    <span className="text-xs font-medium text-gray-900 dark:text-gray-100">Advanced</span>
                                </div>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-1">
                                    JSON Editor
                                </p>
                            </button>
                        </div>

                        {/* Add Message Button */}
                        {onAddMessage && (
                            <div className="p-2 border-t border-border">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={onAddMessage}
                                    className="w-full h-8 text-xs text-gray-400 hover:text-gray-300 border border-dashed border-gray-600 hover:border-gray-500"
                                >
                                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                                    Add message
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Editor Area */}
                    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-950">
                        {/* Editor Header */}
                        <div className="p-4 border-b border-border bg-textured">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                        {selectedItem.type === "system"
                                            ? `Message 0`
                                            : selectedItem.type === "message"
                                            ? `Message ${selectedItem.index + 1}`
                                            : selectedItem.type === "settings"
                                            ? "Model Settings"
                                            : selectedItem.type === "variables"
                                            ? "Variables"
                                            : selectedItem.type === "tools"
                                            ? "Tools"
                                            : "Advanced"}
                                    </h3>
                                    {(selectedItem.type === "system" || selectedItem.type === "message") && (
                                        <div className="flex items-center gap-3 mt-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-500 dark:text-gray-400">Role:</span>
                                                {selectedItem.type === "system" ? (
                                                    <span className="px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                                                        Developer
                                                    </span>
                                                ) : (
                                                    <select
                                                        value={getCurrentRole()}
                                                        onChange={(e) => {
                                                            if (selectedItem.type === "message") {
                                                                onMessageRoleChange(selectedItem.index, e.target.value);
                                                            }
                                                        }}
                                                        className="px-2 py-0.5 text-xs border border-border rounded bg-textured text-gray-900 dark:text-gray-100"
                                                    >
                                                        <option value="user">User</option>
                                                        <option value="assistant">Assistant</option>
                                                    </select>
                                                )}
                                            </div>

                                            {/* 3-way toggle */}
                                            <div className="flex items-center gap-0.5 bg-gray-200 dark:bg-gray-800 rounded p-0.5">
                                                <button
                                                    onClick={() => setViewMode("view")}
                                                    className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors ${
                                                        viewMode === "view"
                                                            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                                                            : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                                                    }`}
                                                >
                                                    <Eye className="w-3 h-3" />
                                                    <span>View</span>
                                                </button>
                                                <button
                                                    onClick={() => setViewMode("edit")}
                                                    className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors ${
                                                        viewMode === "edit"
                                                            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                                                            : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                                                    }`}
                                                >
                                                    <Edit2 className="w-3 h-3" />
                                                    <span>Edit</span>
                                                </button>
                                                <button
                                                    onClick={() => setViewMode("pretty")}
                                                    className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors ${
                                                        viewMode === "pretty"
                                                            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                                                            : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                                                    }`}
                                                >
                                                    <Rainbow className="w-3 h-3" />
                                                    <span>Pretty</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {selectedItem.type === "settings" && model && models && (
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className="text-xs text-gray-500 dark:text-gray-400">Model:</span>
                                            <span className="px-2 py-0.5 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded">
                                                {models.find((m) => m.id === model)?.common_name || model}
                                            </span>
                                        </div>
                                    )}
                                    {selectedItem.type === "variables" && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                            Manage prompt variables and their default values
                                        </p>
                                    )}
                                    {selectedItem.type === "tools" && (
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                {modelSupportsTools
                                                    ? "Manage available tools for this prompt"
                                                    : "Tools not supported by current model"}
                                            </span>
                                        </div>
                                    )}
                                    {selectedItem.type === "advanced" && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                            Edit the complete prompt configuration as JSON
                                        </p>
                                    )}
                                </div>
                                {(selectedItem.type === "system" || selectedItem.type === "message") && viewMode === "edit" && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400 pr-12">Right-click for content blocks</div>
                                )}
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 relative">
                            <div className="absolute inset-2">
                                {(selectedItem.type === "system" || selectedItem.type === "message") && (
                                    <>
                                        {viewMode === "edit" && (
                                            <PromptEditorContextMenu getTextarea={() => textareaRef.current}>
                                                <textarea
                                                    ref={textareaRef}
                                                    value={getCurrentContent()}
                                                    onChange={(e) => {
                                                        handleContentChange(e.target.value);
                                                    }}
                                                    placeholder={
                                                        selectedItem.type === "system"
                                                            ? "Enter system instructions for the AI..."
                                                            : "Enter message content..."
                                                    }
                                                    className="w-full h-full bg-textured border border-border rounded-lg p-4 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-none outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 overflow-y-auto"
                                                />
                                            </PromptEditorContextMenu>
                                        )}
                                        {viewMode === "view" && (
                                            <div 
                                                className="w-full h-full bg-textured border border-border rounded-lg p-4 text-sm text-gray-900 dark:text-gray-100 overflow-y-auto cursor-text"
                                                onClick={() => setViewMode("edit")}
                                            >
                                                <div className="whitespace-pre-wrap">
                                                    {getCurrentContent() ? (
                                                        <HighlightedText
                                                            text={getCurrentContent()}
                                                            validVariables={variableDefaults.map((v) => v.name)}
                                                        />
                                                    ) : (
                                                        <span className="text-gray-400 dark:text-gray-500 italic">
                                                            {selectedItem.type === "system" ? "No system instructions" : "No message content"}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        {viewMode === "pretty" && (
                                            <div className="w-full h-full bg-textured border border-border rounded-lg p-4 overflow-y-auto">
                                                {getCurrentContent() ? (
                                                    <MarkdownStream
                                                        content={escapeEmbeddedCodeFences(getCurrentContent())}
                                                        hideCopyButton={false}
                                                        allowFullScreenEditor={false}
                                                    />
                                                ) : (
                                                    <span className="text-sm text-gray-400 dark:text-gray-500 italic">
                                                        {selectedItem.type === "system" ? "No system instructions" : "No message content"}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {selectedItem.type === "settings" && model && models && modelConfig && onModelConfigChange && onModelChange && (
                                <div className="absolute inset-2 overflow-hidden">
                                    <div className="h-full overflow-y-auto bg-textured border border-border rounded-lg p-6">
                                        <div className="max-w-2xl space-y-4">
                                            {/* Model Selection */}
                                            <div className="pb-3 border-b border-border">
                                                <Label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                                                    Select Model
                                                </Label>
                                                <Select value={model} onValueChange={onModelChange}>
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue>{models.find((m) => m.id === model)?.common_name || model}</SelectValue>
                                                    </SelectTrigger>
                                                    <SelectContent className="max-h-[400px]">
                                                        {models.map((m) => (
                                                            <SelectItem key={m.id} value={m.id}>
                                                                {m.common_name || m.id}
                                                                {m.is_deprecated && (
                                                                    <span className="text-xs text-gray-400 ml-2">(deprecated)</span>
                                                                )}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {/* Model Settings */}
                                            <div>
                                                <Label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                                                    Model Configuration
                                                </Label>
                                                <ModelSettings
                                                    modelId={model}
                                                    models={models}
                                                    settings={modelConfig}
                                                    onSettingsChange={onModelConfigChange}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {selectedItem.type === "variables" && onAddVariable && onUpdateVariable && onRemoveVariable && (
                                <div className="absolute inset-2 overflow-hidden flex flex-col">
                                    <div className="flex-1 overflow-hidden flex">
                                        {/* Variables List */}
                                        <div className="w-[420px] border-r border-border bg-gray-50 dark:bg-gray-900/50 flex flex-col overflow-hidden">
                                            {/* List Header */}
                                            <div className="flex-shrink-0 p-4 border-b border-border bg-textured">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div>
                                                        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                            Variables
                                                        </h4>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                            {variableDefaults.length} defined
                                                        </p>
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => {
                                                            setIsAddingVariable(true);
                                                            setSelectedVariableIndex(null);
                                                        }}
                                                        className="h-8 text-xs"
                                                    >
                                                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                                                        New Variable
                                                    </Button>
                                                </div>

                                                {/* Compact Validation Summary */}
                                                {variableValidation.hasIssues && (
                                                    <div className="flex items-center gap-2 p-2 rounded bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                                                        <AlertTriangle className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                                                        <div className="text-xs text-yellow-800 dark:text-yellow-300 flex-1">
                                                            {variableValidation.undefinedVariables.length > 0 && (
                                                                <span>{variableValidation.undefinedVariables.length} undefined</span>
                                                            )}
                                                            {variableValidation.undefinedVariables.length > 0 && variableValidation.unusedVariables.length > 0 && (
                                                                <span className="mx-1">•</span>
                                                            )}
                                                            {variableValidation.unusedVariables.length > 0 && (
                                                                <span>{variableValidation.unusedVariables.length} unused</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Variables List */}
                                            <div className="flex-1 overflow-y-auto p-3">
                                                {variableDefaults.length === 0 && !isAddingVariable ? (
                                                    <div className="text-center text-gray-500 dark:text-gray-400 py-12">
                                                        <Variable className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                                        <p className="text-sm font-medium">No Variables</p>
                                                        <p className="text-xs mt-1">Click "New Variable" to add one</p>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {variableDefaults.map((variable, index) => {
                                                            const isUsed = isVariableUsed(variable.name, messages, developerMessage);
                                                            const isSelected = selectedVariableIndex === index && !isAddingVariable;
                                                            
                                                            return (
                                                                <div
                                                                    key={variable.name}
                                                                    onClick={() => {
                                                                        setSelectedVariableIndex(index);
                                                                        setIsAddingVariable(false);
                                                                    }}
                                                                    className={`group relative p-3 rounded-lg transition-all cursor-pointer border-2 ${
                                                                        isSelected
                                                                            ? "bg-cyan-50 dark:bg-cyan-900/30 border-cyan-500 dark:border-cyan-500 shadow-sm"
                                                                            : !isUsed
                                                                                ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                                                                                : "bg-white dark:bg-gray-800 border-transparent hover:border-gray-200 dark:hover:border-gray-700 hover:shadow-sm"
                                                                    }`}
                                                                >
                                                                    <div className="flex items-start gap-3">
                                                                        {/* Status Indicator */}
                                                                        <div className="flex-shrink-0 mt-0.5">
                                                                            {!isUsed ? (
                                                                                <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center" title="Unused variable">
                                                                                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                                                                </div>
                                                                            ) : (
                                                                                <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center" title="Variable in use">
                                                                                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        {/* Variable Info */}
                                                                        <div className="flex-1 min-w-0">
                                                                            {/* Name */}
                                                                            <div className="flex items-center gap-2 mb-1">
                                                                                <h5 className={`text-sm font-semibold truncate ${
                                                                                    isUsed 
                                                                                        ? 'text-gray-900 dark:text-gray-100' 
                                                                                        : 'text-amber-900 dark:text-amber-100'
                                                                                }`} title={formatText(variable.name)}>
                                                                                    {formatText(variable.name)}
                                                                                </h5>
                                                                                {variable.required && (
                                                                                    <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium">
                                                                                        Required
                                                                                    </span>
                                                                                )}
                                                                            </div>

                                                                            {/* Variable Name (mono) */}
                                                                            <p className="font-mono text-xs text-gray-500 dark:text-gray-400 mb-2 truncate" title={`{{${variable.name}}}`}>
                                                                                {`{{${variable.name}}}`}
                                                                            </p>

                                                                            {/* Type & Default Value */}
                                                                            <div className="space-y-1">
                                                                                <div className="flex items-center gap-2">
                                                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 font-medium">
                                                                                        {variable.customComponent?.type || 'textarea'}
                                                                                    </span>
                                                                                    {variable.customComponent?.type === 'toggle' && (
                                                                                        <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                                                                            {variable.customComponent.toggleValues?.[0]} / {variable.customComponent.toggleValues?.[1]}
                                                                                        </span>
                                                                                    )}
                                                                                    {(variable.customComponent?.type === 'select' || 
                                                                                      variable.customComponent?.type === 'radio' || 
                                                                                      variable.customComponent?.type === 'checkbox') && 
                                                                                     variable.customComponent.options && (
                                                                                        <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                                                                            {variable.customComponent.options.length} options
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                {variable.defaultValue && (
                                                                                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate" title={variable.defaultValue}>
                                                                                        <span className="text-gray-500 dark:text-gray-500">Default:</span> {variable.defaultValue}
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                        {/* Delete Button */}
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                onRemoveVariable(variable.name);
                                                                                if (selectedVariableIndex === index) {
                                                                                    setSelectedVariableIndex(null);
                                                                                }
                                                                            }}
                                                                            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 p-1"
                                                                            title="Delete variable"
                                                                        >
                                                                            <X className="w-4 h-4" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Variable Editor Panel */}
                                        <div className="flex-1 overflow-y-auto bg-textured">
                                            {isAddingVariable ? (
                                                <div className="p-6">
                                                    <div className="max-w-3xl mx-auto">
                                                        <div className="mb-6">
                                                            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                                                                Add Variable
                                                            </h3>
                                                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                                                Create a new prompt variable
                                                            </p>
                                                        </div>
                                                        <VariableEditor
                                                            name={editingVariableName}
                                                            defaultValue={editingVariableDefaultValue}
                                                            customComponent={editingVariableCustomComponent}
                                                            required={editingVariableRequired}
                                                            helpText={editingVariableHelpText}
                                                            existingNames={variableDefaults.map((v) => v.name)}
                                                            onNameChange={setEditingVariableName}
                                                            onDefaultValueChange={setEditingVariableDefaultValue}
                                                            onCustomComponentChange={setEditingVariableCustomComponent}
                                                            onRequiredChange={setEditingVariableRequired}
                                                            onHelpTextChange={setEditingVariableHelpText}
                                                        />
                                                        <div className="flex justify-end gap-2 mt-6 pt-6 border-t border-border">
                                                            <Button 
                                                                variant="outline" 
                                                                onClick={() => setIsAddingVariable(false)}
                                                            >
                                                                Cancel
                                                            </Button>
                                                            <Button
                                                                onClick={() => {
                                                                    const sanitizedName = sanitizeVariableName(editingVariableName);
                                                                    if (
                                                                        sanitizedName &&
                                                                        !variableDefaults.some((v) => v.name === sanitizedName)
                                                                    ) {
                                                                        onAddVariable(
                                                                            sanitizedName,
                                                                            editingVariableDefaultValue,
                                                                            editingVariableCustomComponent,
                                                                            editingVariableRequired,
                                                                            editingVariableHelpText
                                                                        );
                                                                        setIsAddingVariable(false);
                                                                    }
                                                                }}
                                                                disabled={
                                                                    !editingVariableName.trim() ||
                                                                    variableDefaults.some(
                                                                        (v) => v.name === sanitizeVariableName(editingVariableName)
                                                                    )
                                                                }
                                                            >
                                                                Add Variable
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : selectedVariableIndex !== null && variableDefaults[selectedVariableIndex] ? (
                                                <div className="p-6">
                                                    <div className="max-w-3xl mx-auto">
                                                        {/* Validation Panel for selected variable */}
                                                        {(variableValidation.undefinedVariables.length > 0 || variableValidation.unusedVariables.length > 0) && (
                                                            <div className="mb-6 p-4 rounded-lg border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                                                                <div className="flex items-start gap-2">
                                                                    <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                                                                    <div className="flex-1">
                                                                        <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                                                                            Validation Status
                                                                        </p>
                                                                        <div className="text-xs text-blue-800 dark:text-blue-300 space-y-1">
                                                                            {variableValidation.undefinedVariables.length > 0 && (
                                                                                <div className="flex items-center gap-2">
                                                                                    <AlertTriangle className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
                                                                                    <span>{variableValidation.undefinedVariables.length} undefined: {variableValidation.undefinedVariables.join(', ')}</span>
                                                                                </div>
                                                                            )}
                                                                            {variableValidation.unusedVariables.length > 0 && (
                                                                                <div className="flex items-center gap-2">
                                                                                    <Info className="w-3 h-3" />
                                                                                    <span>{variableValidation.unusedVariables.length} unused: {variableValidation.unusedVariables.join(', ')}</span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        {variableValidation.undefinedVariables.length > 0 && onAddVariable && (
                                                                            <Button
                                                                                size="sm"
                                                                                variant="outline"
                                                                                onClick={() => {
                                                                                    variableValidation.undefinedVariables.forEach(name => {
                                                                                        onAddVariable(name, "", undefined);
                                                                                    });
                                                                                }}
                                                                                className="mt-3 h-7 text-xs"
                                                                            >
                                                                                <Plus className="w-3 h-3 mr-1" />
                                                                                Add All Undefined
                                                                            </Button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="mb-6">
                                                            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                                                                Edit Variable
                                                            </h3>
                                                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                                                Update variable configuration
                                                            </p>
                                                        </div>
                                                        <VariableEditor
                                                            name={editingVariableName}
                                                            defaultValue={editingVariableDefaultValue}
                                                            customComponent={editingVariableCustomComponent}
                                                            required={editingVariableRequired}
                                                            helpText={editingVariableHelpText}
                                                            existingNames={variableDefaults.map((v) => v.name)}
                                                            originalName={variableDefaults[selectedVariableIndex].name}
                                                            onNameChange={setEditingVariableName}
                                                            onDefaultValueChange={setEditingVariableDefaultValue}
                                                            onCustomComponentChange={setEditingVariableCustomComponent}
                                                            onRequiredChange={setEditingVariableRequired}
                                                            onHelpTextChange={setEditingVariableHelpText}
                                                        />
                                                        <div className="flex justify-end gap-2 mt-6 pt-6 border-t border-border">
                                                            <Button
                                                                onClick={() => {
                                                                    const originalName = variableDefaults[selectedVariableIndex].name;
                                                                    const sanitizedName = sanitizeVariableName(editingVariableName);
                                                                    if (sanitizedName) {
                                                                        onUpdateVariable(
                                                                            originalName,
                                                                            sanitizedName,
                                                                            editingVariableDefaultValue,
                                                                            editingVariableCustomComponent,
                                                                            editingVariableRequired,
                                                                            editingVariableHelpText
                                                                        );
                                                                    }
                                                                }}
                                                                disabled={!editingVariableName.trim()}
                                                            >
                                                                <Save className="w-3.5 h-3.5 mr-1.5" />
                                                                Save Changes
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="h-full flex items-center justify-center">
                                                    <div className="text-center text-gray-500 dark:text-gray-400 max-w-md">
                                                        {variableValidation.undefinedVariables.length > 0 ? (
                                                            <>
                                                                <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-yellow-500 dark:text-yellow-400 opacity-50" />
                                                                <p className="text-base font-medium mb-2">Undefined Variables Detected</p>
                                                                <p className="text-sm mb-4">
                                                                    You have {variableValidation.undefinedVariables.length} undefined variable{variableValidation.undefinedVariables.length !== 1 ? 's' : ''} in your messages.
                                                                </p>
                                                                <div className="space-y-2 mb-4">
                                                                    {variableValidation.undefinedVariables.map((varName) => (
                                                                        <div
                                                                            key={varName}
                                                                            className="flex items-center justify-between gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded"
                                                                        >
                                                                            <span className="text-sm font-mono">{`{{${varName}}}`}</span>
                                                                            <Button
                                                                                size="sm"
                                                                                variant="outline"
                                                                                onClick={() => {
                                                                                    onAddVariable(varName, "", undefined);
                                                                                    const newIndex = variableDefaults.length;
                                                                                    setSelectedVariableIndex(newIndex);
                                                                                    setIsAddingVariable(false);
                                                                                }}
                                                                                className="h-7 text-xs"
                                                                            >
                                                                                <Plus className="w-3 h-3 mr-1" />
                                                                                Add
                                                                            </Button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Variable className="w-16 h-16 mx-auto mb-4 opacity-30" />
                                                                <p className="text-base font-medium mb-2">No Variable Selected</p>
                                                                <p className="text-sm">
                                                                    Select a variable from the list to edit its configuration, or click "New Variable" to create one.
                                                                </p>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {selectedItem.type === "tools" && onAddTool && onRemoveTool && (
                                <div className="absolute inset-2 overflow-hidden flex">
                                    <div className="flex-1 overflow-hidden flex">
                                        {/* Selected Tools List */}
                                        <div className="w-72 border-r border-border bg-gray-50 dark:bg-gray-900/50 p-4 overflow-y-auto">
                                            <div className="mb-4">
                                                <Label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                    Selected Tools ({selectedTools.length})
                                                </Label>
                                            </div>

                                            {!modelSupportsTools && (
                                                <div className="text-center text-gray-500 dark:text-gray-400 py-8 px-4">
                                                    <Wrench className="w-10 h-10 mx-auto mb-2 opacity-50" />
                                                    <p className="text-xs">Tools not supported by current model</p>
                                                    <p className="text-[10px] mt-1">Change model to use tools</p>
                                                </div>
                                            )}

                                            {modelSupportsTools && selectedTools.length === 0 && (
                                                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                                                    <Wrench className="w-10 h-10 mx-auto mb-2 opacity-50" />
                                                    <p className="text-xs">No tools selected</p>
                                                </div>
                                            )}

                                            {modelSupportsTools && (
                                                <div className="space-y-2">
                                                    {selectedTools.map((toolName) => {
                                                        const tool = availableTools.find((t) => t.name === toolName);
                                                        const displayName = formatText(toolName);
                                                        const icon = tool ? mapIcon(tool.icon, tool.category, 16) : null;

                                                        return (
                                                            <div
                                                                key={toolName}
                                                                className="p-3 rounded-lg bg-white dark:bg-gray-800 border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-colors"
                                                            >
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                        {icon && (
                                                                            <span className="flex-shrink-0 text-gray-500 dark:text-gray-400">
                                                                                {icon}
                                                                            </span>
                                                                        )}
                                                                        <div className="flex-1 min-w-0">
                                                                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                                                                {displayName}
                                                                            </p>
                                                                            {tool?.category && (
                                                                                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                                                                                    {tool.category}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => onRemoveTool(toolName)}
                                                                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                                                                        title="Remove tool"
                                                                    >
                                                                        <X className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        {/* Available Tools */}
                                        <div className="flex-1 overflow-y-auto bg-textured p-6">
                                            <div className="max-w-2xl h-full flex flex-col">
                                                <div className="mb-6 flex-shrink-0">
                                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                                        Available Tools
                                                    </h3>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                                        Click a tool to add it to your prompt
                                                    </p>
                                                </div>

                                                <div className="flex-1 overflow-y-auto">
                                                    {!modelSupportsTools ? (
                                                        <div className="text-center text-gray-500 dark:text-gray-400 py-20">
                                                            <Wrench className="w-16 h-16 mx-auto mb-4 opacity-30" />
                                                            <p className="text-sm">Tools are not supported by the current model</p>
                                                            <p className="text-xs mt-2">
                                                                Switch to a model that supports tools to enable this feature
                                                            </p>
                                                        </div>
                                                    ) : availableTools.filter((tool) => !selectedTools.includes(tool.name)).length === 0 ? (
                                                        <div className="text-center text-gray-500 dark:text-gray-400 py-20">
                                                            <Wrench className="w-16 h-16 mx-auto mb-4 opacity-30" />
                                                            <p className="text-sm">All tools have been added</p>
                                                            <p className="text-xs mt-2">Remove some tools to add different ones</p>
                                                        </div>
                                                    ) : (
                                                        <div className="grid grid-cols-1 gap-3 pb-4">
                                                            {availableTools
                                                                .filter((tool) => !selectedTools.includes(tool.name))
                                                                .map((tool) => {
                                                                    const displayName = formatText(tool.name);
                                                                    const icon = mapIcon(tool.icon, tool.category, 20);

                                                                    return (
                                                                        <button
                                                                            key={tool.name}
                                                                            onClick={() => onAddTool(tool.name)}
                                                                            className="w-full flex items-start gap-4 p-4 text-left bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors border-2 border-transparent hover:border-emerald-200 dark:hover:border-emerald-800"
                                                                        >
                                                                            <span className="flex-shrink-0 text-gray-500 dark:text-gray-400 mt-0.5">
                                                                                {icon}
                                                                            </span>
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="flex items-center gap-2 mb-1">
                                                                                    <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                                                                                        {displayName}
                                                                                    </h4>
                                                                                    {tool.category && (
                                                                                        <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full font-mono">
                                                                                            {tool.category.toLowerCase()}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                {tool.description && (
                                                                                    <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                                                                                        {tool.description}
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                            <Plus className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-1" />
                                                                        </button>
                                                                    );
                                                                })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {selectedItem.type === "advanced" && (
                                <div className="absolute inset-2 overflow-hidden flex flex-col">
                                    <div className="flex-1 overflow-hidden flex flex-col bg-textured border border-border rounded-lg">
                                        {/* Header with Apply Button */}
                                        <div className="flex-shrink-0 p-4 border-b border-border">
                                            <div className="flex items-start gap-3">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                                                        <p className="text-xs text-gray-700 dark:text-gray-300">
                                                            Edit the JSON below and click "Apply Changes" to update the prompt. Changes are not saved until you click the main Save button.
                                                        </p>
                                                    </div>
                                                    {jsonError && (
                                                        <div className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-300">
                                                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                                            <span>{jsonError}</span>
                                                        </div>
                                                    )}
                                                    {jsonApplied && !jsonError && (
                                                        <div className="flex items-start gap-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-xs text-green-700 dark:text-green-300">
                                                            <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                                            <span>Changes applied! Switch to other tabs to see updates.</span>
                                                        </div>
                                                    )}
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
                                        </div>

                                        {/* JSON Editor */}
                                        <div className="flex-1 overflow-y-auto p-4">
                                            <CodeBlock
                                                code={editableJson}
                                                language="json"
                                                onCodeChange={(newCode) => setEditableJson(newCode)}
                                                showLineNumbers={true}
                                                wrapLines={true}
                                                fontSize={14}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>

            {/* System Prompt Optimizer Dialog */}
            <SystemPromptOptimizer
                isOpen={isOptimizerOpen}
                onClose={() => setIsOptimizerOpen(false)}
                currentSystemMessage={developerMessage}
                onAccept={handleOptimizedAccept}
            />
        </Dialog>
    );
}
