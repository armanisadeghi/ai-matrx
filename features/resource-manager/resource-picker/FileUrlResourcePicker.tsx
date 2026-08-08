"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronLeft, FileText, Loader2, AlertCircle, ExternalLink, File, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResourcePickerSubViewHeader } from "./ResourcePickerSubViewHeader";

interface FileUrlResourcePickerProps {
    onBack: () => void;
    onSelect: (fileUrl: FileUrlData) => void;
    onSwitchTo?: (type: 'webpage' | 'youtube' | 'image_url', url: string) => void;
    initialUrl?: string;
}

type FileUrlData = {
    url: string;
    filename: string;
    type: string; // MIME type
    extension: string;
    isValid: boolean;
};

// Normalize a URL by prepending https:// if no protocol is present
function normalizeUrl(url: string): string {
    const trimmed = url.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Detect URL type — tolerates bare domains (no protocol)
function detectUrlType(url: string): 'youtube' | 'image' | 'webpage' | 'file' {
    try {
        const urlObj = new URL(normalizeUrl(url));

        if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
            return 'youtube';
        }

        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
        const pathname = urlObj.pathname.toLowerCase();
        if (imageExtensions.some(ext => pathname.endsWith(ext))) {
            return 'image';
        }

        const fileExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.json', '.xml', '.zip', '.md'];
        if (fileExtensions.some(ext => pathname.endsWith(ext))) {
            return 'file';
        }

        return 'webpage';
    } catch {
        return 'webpage';
    }
}

// Validate if URL is accessible and extract file info
async function validateFileUrl(url: string): Promise<{ 
    isValid: boolean; 
    filename?: string; 
    type?: string; 
    extension?: string; 
    error?: string;
    suggestedType?: 'webpage' | 'youtube' | 'image_url';
}> {
    try {
        const urlObj = new URL(normalizeUrl(url));

        // Detect URL type
        const detectedType = detectUrlType(url);
        
        if (detectedType === 'youtube') {
            return { 
                isValid: false, 
                error: 'This appears to be a YouTube URL',
                suggestedType: 'youtube'
            };
        }
        
        if (detectedType === 'image') {
            return { 
                isValid: false, 
                error: 'This appears to be an image URL',
                suggestedType: 'image_url'
            };
        }
        
        if (detectedType === 'webpage') {
            return { 
                isValid: false, 
                error: 'This appears to be a webpage. Would you like to scrape it instead?',
                suggestedType: 'webpage'
            };
        }

        // Extract filename from URL
        const pathname = urlObj.pathname;
        const filename = pathname.split('/').pop() || 'document';
        
        // Extract extension
        const extensionMatch = filename.match(/\.([^.]+)$/);
        const extension = extensionMatch ? extensionMatch[1].toLowerCase() : '';

        if (!extension) {
            return { 
                isValid: false, 
                error: 'URL must point to a file with an extension',
                suggestedType: 'webpage'
            };
        }

        // Determine MIME type from extension
        const mimeTypes: Record<string, string> = {
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'ppt': 'application/vnd.ms-powerpoint',
            'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'txt': 'text/plain',
            'csv': 'text/csv',
            'json': 'application/json',
            'xml': 'application/xml',
            'html': 'text/html',
            'zip': 'application/zip',
            'md': 'text/markdown',
        };

        const mimeType = mimeTypes[extension] || 'application/octet-stream';

        return { 
            isValid: true, 
            filename,
            type: mimeType,
            extension
        };
    } catch (error) {
        return { isValid: false, error: 'Invalid URL format' };
    }
}

export function FileUrlResourcePicker({ onBack, onSelect, onSwitchTo, initialUrl }: FileUrlResourcePickerProps) {
    const [url, setUrl] = useState(initialUrl || "");
    const [isValidating, setIsValidating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [suggestedType, setSuggestedType] = useState<'webpage' | 'youtube' | 'image_url' | null>(null);
    const [previewFile, setPreviewFile] = useState<FileUrlData | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-focus the input on mount (preventScroll to avoid auto-scroll)
    useEffect(() => {
        inputRef.current?.focus({ preventScroll: true });
    }, []);

    // Auto-validate if initialUrl is provided
    useEffect(() => {
        if (initialUrl && initialUrl.trim()) {
            handleValidate();
        }
    }, [initialUrl]);

    const handleValidate = async (rawUrl?: string) => {
        const target = normalizeUrl(rawUrl ?? url);
        setUrl(target);
        setError(null);
        setSuggestedType(null);
        setPreviewFile(null);

        if (!target.trim()) {
            setError("Please enter a file URL");
            return;
        }

        setIsValidating(true);

        try {
            const validation = await validateFileUrl(target);

            if (!validation.isValid) {
                setError(validation.error || 'Invalid file URL');
                setSuggestedType(validation.suggestedType || null);
                return;
            }

            const fileData: FileUrlData = {
                url: target,
                filename: validation.filename || 'document',
                type: validation.type || 'application/octet-stream',
                extension: validation.extension || '',
                isValid: true
            };

            setPreviewFile(fileData);
        } catch (err) {
            setError("Could not validate file URL. Please check the URL and try again.");
        } finally {
            setIsValidating(false);
        }
    };

    const handleSelect = () => {
        if (previewFile) {
            onSelect(previewFile);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isValidating) {
            handleValidate();
        }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        const pastedText = e.clipboardData.getData('text');
        setUrl(pastedText);
        setTimeout(() => handleValidate(pastedText), 50);
    };

    return (
        <div className="flex flex-col max-h-[min(460px,70dvh)]">
            {/* Header */}
            <ResourcePickerSubViewHeader
                title="File URL"
                onBack={onBack}
                icon={
                    <FileText className="h-3.5 w-3.5 shrink-0 text-purple-600 dark:text-purple-400" />
                }
            />

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                <div className="space-y-2">
                    <div className="flex gap-2">
                        <Input
                            ref={inputRef}
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyPress={handleKeyPress}
                            onPaste={handlePaste}
                            placeholder="https://example.com/document.pdf"
                            className="flex-1 text-xs h-7"
                            disabled={isValidating}
                        />
                        <Button
                            size="sm"
                            onClick={() => void handleValidate()}
                            disabled={isValidating || !url.trim()}
                            className="h-7 w-7 p-0"
                            variant="ghost"
                        >
                            {isValidating ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <ChevronLeft className="w-3.5 h-3.5 rotate-180" />
                            )}
                        </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                        Paste a direct URL to a file
                    </p>
                </div>

                {/* Error with suggestion */}
                {error && (
                    <div className="space-y-2">
                        <div className="flex items-start gap-2 p-2 border border-destructive/20 bg-destructive/10 rounded">
                            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-destructive">{error}</p>
                        </div>
                        {suggestedType && onSwitchTo && (
                            <Button
                                size="sm"
                                className="w-full text-xs h-8"
                                onClick={() => onSwitchTo(suggestedType, url)}
                            >
                                <Globe className="w-3.5 h-3.5 mr-1.5" />
                                Switch to {suggestedType === 'webpage' ? 'Webpage' : suggestedType === 'youtube' ? 'YouTube' : 'Image URL'}
                            </Button>
                        )}
                    </div>
                )}

                {/* File Preview */}
                {previewFile && (
                    <div className="border-border rounded-lg overflow-hidden">
                        {/* File Icon/Info */}
                        <div className="p-2.5 bg-muted/50 flex items-center gap-2.5">
                            <div className="w-12 h-12 rounded bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                                <File className="w-6 h-6 text-purple-600 dark:text-purple-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-foreground truncate">
                                    {previewFile.filename}
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center gap-2">
                                    <span className="uppercase">{previewFile.extension}</span>
                                    <span>•</span>
                                    <span className="truncate">{previewFile.type}</span>
                                </div>
                            </div>
                        </div>

                        {/* URL */}
                        <div className="p-2 border-t border-border bg-background">
                            <a
                                href={previewFile.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                            >
                                <span className="truncate">{previewFile.url}</span>
                                <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                            </a>
                        </div>
                    </div>
                )}

                {/* Help Text */}
                {!previewFile && !error && (
                    <div className="p-2.5 border border-blue-500/20 bg-blue-500/10 rounded-lg">
                        <p className="text-xs text-blue-600 dark:text-blue-400">
                            <strong>Supported formats:</strong>
                        </p>
                        <ul className="text-xs text-blue-600 dark:text-blue-400 mt-1 space-y-0.5 ml-3">
                            <li>• PDF (.pdf)</li>
                            <li>• Documents (.doc, .docx, .txt)</li>
                            <li>• Spreadsheets (.xls, .xlsx, .csv)</li>
                            <li>• Presentations (.ppt, .pptx)</li>
                            <li>• Data files (.json, .xml, .csv)</li>
                            <li>• Archives (.zip)</li>
                        </ul>
                    </div>
                )}
            </div>

            {/* Footer with Add Button */}
            {previewFile && (
                <div className="border-t border-border p-2">
                    <Button
                        onClick={handleSelect}
                        className="w-full"
                        size="sm"
                    >
                        <FileText className="w-4 h-4 mr-2" />
                        Add File
                    </Button>
                </div>
            )}
        </div>
    );
}
