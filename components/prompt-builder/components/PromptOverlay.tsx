"use client";

import { PromptMessage } from "@/features/prompts/types/core";
import { useState, useEffect, useCallback } from "react";
import { Settings, Plus, Save, X, ChevronUp, ChevronDown, Trash2 } from "lucide-react";

const PromptOverlay = ({ isOpen, onClose, onSave, initialMessages = [], currentPrompt = null, isDirty = false }) => {
    const [messages, setMessages] = useState<PromptMessage[]>([]);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [defaultValues, setDefaultValues] = useState({});
    const [name, setName] = useState("");

    // Initialize messages on mount or when initialMessages changes
    useEffect(() => {
        if (currentPrompt) {
            // Editing existing prompt
            setMessages(currentPrompt.messages || []);
            setDefaultValues(currentPrompt.variableDefaults || {});
            setName(currentPrompt.name || "");
        } else if (initialMessages.length > 0) {
            // Creating new with template
            setMessages(initialMessages);
            setDefaultValues({});
            setName("");
        } else {
            // Creating new from scratch
            setMessages([
                { role: "system", content: "" },
                { role: "user", content: "" },
            ]);
            setDefaultValues({});
            setName("");
        }
    }, [initialMessages, isOpen, currentPrompt]);

    // Extract variables from all message contents
    const extractVariables = useCallback(() => {
        const variableRegex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
        const variables = new Set<string>();

        messages.forEach((message) => {
            const matches = message.content.matchAll(variableRegex);
            for (const match of matches) {
                variables.add(match[1]);
            }
        });

        return Array.from(variables);
    }, [messages]);

    const handleMessageChange = (index, content) => {
        const updatedMessages = [...messages];
        updatedMessages[index] = { ...updatedMessages[index], content };
        setMessages(updatedMessages);
    };

    const addMessage = () => {
        setMessages([...messages, { role: "user", content: "" }]);
    };

    const removeMessage = (index) => {
        if (messages.length > 1) {
            setMessages(messages.filter((_, i) => i !== index));
        }
    };

    const toggleRole = (index) => {
        const updatedMessages = [...messages];
        const currentRole = updatedMessages[index].role;
        // Cycle through: system -> user -> assistant -> system
        if (currentRole === "system") {
            updatedMessages[index].role = "user";
        } else if (currentRole === "user") {
            updatedMessages[index].role = "assistant";
        } else {
            updatedMessages[index].role = "system";
        }
        setMessages(updatedMessages);
    };

    const moveMessage = (index, direction) => {
        const newIndex = direction === "up" ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= messages.length) return;

        const updatedMessages = [...messages];
        [updatedMessages[index], updatedMessages[newIndex]] = [updatedMessages[newIndex], updatedMessages[index]];
        setMessages(updatedMessages);
    };

    const handleSave = () => {
        const variables = extractVariables();
        onSave({
            name: name.trim() || "Untitled Prompt",
            messages,
            variables,
            variableDefaults: defaultValues,
        });
        onClose();
    };

    const handleDefaultValueChange = (variable, value) => {
        setDefaultValues((prev) => ({
            ...prev,
            [variable]: value,
        }));
    };

    const handleKeyDown = (e) => {
        if (e.key === "Escape") {
            onClose();
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            handleSave();
        }
    };

    const canSave = name.trim() || messages.some((msg) => msg.content.trim());

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/50 dark:bg-black/60 flex items-center justify-center p-4 z-50"
            onClick={onClose}
            onKeyDown={handleKeyDown}
            tabIndex={-1}
        >
            <div
                className="bg-textured rounded-lg shadow-xl w-full max-w-6xl h-[90dvh] flex flex-col border-border"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-3 border-b border-border">
                    <div className="flex items-center gap-2 flex-1">
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Prompt name..."
                            className="text-sm font-medium bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 border-none outline-none focus:ring-0 flex-1 max-w-xs"
                        />
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-600 dark:text-gray-400"
                            title="Configure variables"
                        >
                            <Settings className="w-4 h-4" />
                        </button>
                        {isDirty && <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">• Unsaved changes</span>}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={addMessage}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-600 dark:text-gray-400"
                            title="Add message"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!canSave}
                            className="px-3 py-1 bg-blue-600 dark:bg-blue-500 text-white rounded text-xs hover:bg-blue-700 dark:hover:bg-blue-600 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Save className="w-3 h-3" />
                            {currentPrompt ? "Update" : "Create"}
                        </button>
                        <button
                            onClick={onClose}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-600 dark:text-gray-400"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Content with sidebar */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Main content */}
                    <div className={`flex-1 overflow-y-auto p-3 space-y-3 transition-all duration-200 ${sidebarOpen ? "mr-2" : ""}`}>
                        {messages.map((message, index) => (
                            <div key={index} className="border-border rounded-md">
                                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-border">
                                    <button
                                        onClick={() => toggleRole(index)}
                                        className={`px-2 py-1 rounded text-xs font-medium ${
                                            message.role === "system"
                                                ? "bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200"
                                                : message.role === "user"
                                                ? "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200"
                                                : "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200"
                                        }`}
                                    >
                                        {message.role}
                                    </button>
                                    <div className="flex items-center gap-1">
                                        {/* Move up button */}
                                        <button
                                            onClick={() => moveMessage(index, "up")}
                                            disabled={index === 0}
                                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="Move up"
                                        >
                                            <ChevronUp className="w-3 h-3" />
                                        </button>
                                        {/* Move down button */}
                                        <button
                                            onClick={() => moveMessage(index, "down")}
                                            disabled={index === messages.length - 1}
                                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="Move down"
                                        >
                                            <ChevronDown className="w-3 h-3" />
                                        </button>
                                        {/* Remove button */}
                                        {messages.length > 1 && (
                                            <button
                                                onClick={() => removeMessage(index)}
                                                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400"
                                                title="Remove message"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <textarea
                                    value={message.content}
                                    onChange={(e) => handleMessageChange(index, e.target.value)}
                                    placeholder={`Enter ${message.role} message... Use {{variable}} for variables`}
                                    className="w-full p-3 text-sm resize-none border-0 focus:outline-none focus:ring-0 min-h-[200px] bg-textured text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                                    rows={18}
                                />
                            </div>
                        ))}
                    </div>

                    {/* Sidebar */}
                    {sidebarOpen && (
                        <div className="w-80 border-l border-border bg-gray-50 dark:bg-gray-800 p-3 overflow-y-auto">
                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Variable Defaults</h3>
                                {extractVariables().length === 0 ? (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        No variables detected. Use {"{variable}"} syntax in your messages.
                                    </p>
                                ) : (
                                    extractVariables().map((variable) => (
                                        <div key={variable} className="space-y-1">
                                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">{variable}</label>
                                            <textarea
                                                value={defaultValues[variable] || ""}
                                                onChange={(e) => handleDefaultValueChange(variable, e.target.value)}
                                                placeholder={`Default value for ${variable}`}
                                                className="w-full p-2 text-xs border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-textured text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 resize-none"
                                                rows={3}
                                            />
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Variables preview */}
                {extractVariables().length > 0 && (
                    <div className="px-3 py-2 border-t border-border bg-gray-50 dark:bg-gray-800">
                        <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Variables (Simple Brokers) detected:</div>
                        <div className="flex flex-wrap gap-1">
                            {extractVariables().map((variable) => (
                                <span
                                    key={variable}
                                    className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-xs font-mono"
                                >
                                    {variable}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="px-3 py-2 border-t border-border bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400">
                    Use <code className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-1 rounded">{"{variable}"}</code>{" "}
                    syntax for variables •
                    <kbd className="ml-1 px-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded">Cmd+Enter</kbd> to save
                    •<kbd className="ml-1 px-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded">Esc</kbd> to close
                </div>
            </div>
        </div>
    );
};

export default PromptOverlay;