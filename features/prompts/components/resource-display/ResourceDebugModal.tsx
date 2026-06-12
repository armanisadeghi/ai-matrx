"use client";

import React, { useState, useEffect } from "react";
import { X, ChevronDown, ChevronRight, Copy, Check, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import type { Resource } from "../../types/resources";
import { fetchResourcesData } from "../../utils/resource-data-fetcher";
import { formatResourcesToXml, extractSettingsAttachments, appendResourcesToMessage } from "../../utils/resource-formatting";
import type { PromptVariable } from "../../types/core";

interface ResourceDebugModalProps {
    resources: Resource[];
    isVisible: boolean;
    chatInput?: string;
    variableDefaults?: PromptVariable[];
}

export function ResourceDebugModal({ resources, isVisible, chatInput = "", variableDefaults = [] }: ResourceDebugModalProps) {
    const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [minimized, setMinimized] = useState(false);
    const [showMessagePreview, setShowMessagePreview] = useState(false);
    const [previewData, setPreviewData] = useState<{
        formattedXml: string;
        fullMessage: string;
        settingsAttachments: any;
        metadata: any;
    } | null>(null);
    const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

    if (!isVisible) return null;

    const toggleExpanded = (index: number) => {
        const newExpanded = new Set(expandedIndices);
        if (newExpanded.has(index)) {
            newExpanded.delete(index);
        } else {
            newExpanded.add(index);
        }
        setExpandedIndices(newExpanded);
    };

    const copyToClipboard = async (data: any, index: number) => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
            setCopiedIndex(index);
            setTimeout(() => setCopiedIndex(null), 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    };

    const copyAll = async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(resources, null, 2));
            setCopiedIndex(-1);
            setTimeout(() => setCopiedIndex(null), 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    };

    // Helper function to replace variables in content
    const replaceVariables = (content: string): string => {
        let result = content;
        variableDefaults.forEach(({ name, defaultValue }) => {
            const regex = new RegExp(`\\{\\{${name}\\}\\}`, 'g');
            result = result.replace(regex, defaultValue || '');
        });
        return result;
    };

    const generateMessagePreview = async () => {
        setIsGeneratingPreview(true);
        try {
            // Fetch data for resources that need it (e.g., tables)
            const enrichedResources = await fetchResourcesData(resources);
            
            // Format resources to XML
            const formattedXml = formatResourcesToXml(enrichedResources);
            
            // Extract settings attachments
            const settingsAttachments = extractSettingsAttachments(enrichedResources);
            
            // Extract message metadata (files and resource references)
            const metadata = await import('../../utils/resource-formatting').then(mod => 
                mod.extractMessageMetadata(enrichedResources)
            );
            
            // Use actual chatInput with variables replaced, or a placeholder if empty
            const baseMessage = chatInput.trim() || "Here are the resources I want to discuss:";
            const messageWithVariablesReplaced = replaceVariables(baseMessage);
            const fullMessage = appendResourcesToMessage(messageWithVariablesReplaced, formattedXml);
            
            setPreviewData({
                formattedXml,
                fullMessage,
                settingsAttachments,
                metadata
            });
            setShowMessagePreview(true);
        } catch (error) {
            console.error('Failed to generate preview:', error);
        } finally {
            setIsGeneratingPreview(false);
        }
    };

    const copyPreviewToClipboard = async (content: string) => {
        try {
            await navigator.clipboard.writeText(content);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    };

    return (
        <div className="fixed bottom-4 right-4 z-[9999] w-96 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 bg-zinc-800 border-b border-zinc-700">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-xs font-semibold text-white">Resource Debug</span>
                    <span className="text-xs text-zinc-400">({resources.length})</span>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-zinc-400 hover:text-white hover:bg-zinc-700"
                        onClick={() => setMinimized(!minimized)}
                    >
                        {minimized ? <ChevronDown className="w-3.5 h-3.5 rotate-180" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </Button>
                </div>
            </div>

            {!minimized && (
                <>
                    {/* Content */}
                    <div className="max-h-96 overflow-y-auto bg-zinc-900">
                        {resources.length === 0 ? (
                            <div className="p-4 text-center text-xs text-zinc-500">
                                No resources attached
                            </div>
                        ) : (
                            <div className="p-2 space-y-1">
                                {resources.map((resource, index) => {
                                    const isExpanded = expandedIndices.has(index);
                                    const isCopied = copiedIndex === index;

                                    return (
                                        <div
                                            key={index}
                                            className="border border-zinc-700 rounded bg-zinc-800/50 overflow-hidden"
                                        >
                                            {/* Resource Header */}
                                            <div
                                                className="flex items-center justify-between px-2 py-1.5 cursor-pointer hover:bg-zinc-700/50 transition-colors"
                                                onClick={() => toggleExpanded(index)}
                                            >
                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                    {isExpanded ? (
                                                        <ChevronDown className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                                                    ) : (
                                                        <ChevronRight className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                                                    )}
                                                    <span className="text-xs font-medium text-white truncate">
                                                        {resource.type}
                                                    </span>
                                                    <span className="text-[10px] text-zinc-500">
                                                        #{index + 1}
                                                    </span>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-5 w-5 p-0 text-zinc-400 hover:text-white hover:bg-zinc-600"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        copyToClipboard(resource.data, index);
                                                    }}
                                                >
                                                    {isCopied ? (
                                                        <Check className="w-3 h-3 text-green-500" />
                                                    ) : (
                                                        <Copy className="w-3 h-3" />
                                                    )}
                                                </Button>
                                            </div>

                                            {/* Expanded Content */}
                                            {isExpanded && (
                                                <div className="px-2 pb-2">
                                                    <pre className="text-[10px] text-zinc-300 bg-zinc-900 p-2 rounded overflow-x-auto max-h-48 overflow-y-auto font-mono">
                                                        {JSON.stringify(resource.data, null, 2)}
                                                    </pre>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    {resources.length > 0 && (
                        <div className="px-2 py-2 bg-zinc-800 border-t border-zinc-700">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] text-zinc-500">
                                    Total: {resources.length} resource{resources.length !== 1 ? 's' : ''}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[10px] text-zinc-400 hover:text-white hover:bg-zinc-700"
                                    onClick={copyAll}
                                >
                                    {copiedIndex === -1 ? (
                                        <>
                                            <Check className="w-3 h-3 mr-1 text-green-500" />
                                            Copied!
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-3 h-3 mr-1" />
                                            Copy All
                                        </>
                                    )}
                                </Button>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white border-blue-500"
                                onClick={generateMessagePreview}
                                disabled={isGeneratingPreview}
                            >
                                {isGeneratingPreview ? (
                                    <>
                                        <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <Eye className="w-3 h-3 mr-1.5" />
                                        Preview Message Content
                                    </>
                                )}
                            </Button>
                        </div>
                    )}
                </>
            )}
            
            {/* Message Preview Dialog */}
            <Dialog open={showMessagePreview} onOpenChange={setShowMessagePreview}>
                <DialogContent className="max-w-4xl max-h-[80dvh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Formatted Message Preview</DialogTitle>
                        <DialogDescription>
                            This is the exact content that will be sent to the AI model
                        </DialogDescription>
                    </DialogHeader>
                    
                    {previewData && (
                        <div className="flex-1 overflow-y-auto space-y-4">
                            {/* Full Message with XML */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-sm font-semibold">Complete Message (with resources)</h3>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-xs"
                                        onClick={() => copyPreviewToClipboard(previewData.fullMessage)}
                                    >
                                        <Copy className="w-3 h-3 mr-1" />
                                        Copy
                                    </Button>
                                </div>
                                <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto max-h-96 overflow-y-auto border border-border">
                                    {previewData.fullMessage}
                                </pre>
                            </div>
                            
                            {/* XML Only */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-sm font-semibold">Resources XML Only</h3>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-xs"
                                        onClick={() => copyPreviewToClipboard(previewData.formattedXml)}
                                    >
                                        <Copy className="w-3 h-3 mr-1" />
                                        Copy
                                    </Button>
                                </div>
                                <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto max-h-64 overflow-y-auto border border-border">
                                    {previewData.formattedXml}
                                </pre>
                            </div>
                            
                            {/* Message Metadata */}
                            {previewData.metadata && (previewData.metadata.files?.length > 0 || previewData.metadata.resources?.length > 0) && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-sm font-semibold">Message Metadata</h3>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-2 text-xs"
                                            onClick={() => copyPreviewToClipboard(JSON.stringify(previewData.metadata, null, 2))}
                                        >
                                            <Copy className="w-3 h-3 mr-1" />
                                            Copy
                                        </Button>
                                    </div>
                                    <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto border border-border max-h-64 overflow-y-auto">
                                        {JSON.stringify(previewData.metadata, null, 2)}
                                    </pre>
                                    <p className="text-xs text-muted-foreground mt-2">
                                        This metadata is attached to the user message and sent to the backend for processing.
                                        <br />
                                        • <strong>files</strong>: Array of file URIs with mime types for the backend to process
                                        <br />
                                        • <strong>resources</strong>: Array of resource references (type + id for DB resources, full object for tables)
                                    </p>
                                </div>
                            )}
                            
                            {/* Settings Attachments */}
                            {Object.keys(previewData.settingsAttachments).length > 0 && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-sm font-semibold">Settings Attachments (Legacy)</h3>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-2 text-xs"
                                            onClick={() => copyPreviewToClipboard(JSON.stringify(previewData.settingsAttachments, null, 2))}
                                        >
                                            <Copy className="w-3 h-3 mr-1" />
                                            Copy
                                        </Button>
                                    </div>
                                    <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto border border-border">
                                        {JSON.stringify(previewData.settingsAttachments, null, 2)}
                                    </pre>
                                    <p className="text-xs text-muted-foreground mt-2">
                                        These attachments (YouTube URLs, Image URLs, File URLs) can optionally be added to the model config.
                                        <br />
                                        <strong>Note:</strong> Files are now primarily sent via message metadata above.
                                    </p>
                                </div>
                            )}
                            
                            {/* Stats */}
                            <div className="grid grid-cols-4 gap-4 pt-4 border-t">
                                <div>
                                    <div className="text-xs text-muted-foreground">Resources</div>
                                    <div className="text-sm font-semibold">{resources.length}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">Files</div>
                                    <div className="text-sm font-semibold">{previewData.metadata?.files?.length || 0}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">XML Size</div>
                                    <div className="text-sm font-semibold">{previewData.formattedXml.length.toLocaleString()}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">Total Size</div>
                                    <div className="text-sm font-semibold">{previewData.fullMessage.length.toLocaleString()}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

