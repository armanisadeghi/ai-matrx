"use client";

import React, { useState, useEffect } from "react";
import { ArrowRight, FileText, Loader2, AlertCircle, ExternalLink, File, Globe } from "lucide-react";
import { Button } from "@ai-matrx/design-system";
import {
    PickerSearchField,
    PickerView,
    PickerViewBody,
    ResourcePickerSubViewHeader,
} from "./ResourcePickerSubViewHeader";
import { usePickerInputFocus } from "./usePickerInputFocus";
import { parseYouTubeUrl } from "@ai-matrx/rich-content/utils/youtube";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

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

        // ONE canonical YouTube detector — `lib/media/youtube.ts`. The
        // hostname copy that used to live here could not tell a watch URL
        // from a channel page.
        if (parseYouTubeUrl(urlObj.toString())) {
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
    const inputRef = usePickerInputFocus();

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

    // Enter belongs to this field — same rule as "Add a link" (PB-04 run 2).
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
        e.preventDefault();
        e.stopPropagation();
        if (!isValidating) void handleValidate();
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
        const pastedText = e.clipboardData.getData('text');
        setUrl(pastedText);
        setTimeout(() => handleValidate(pastedText), 50);
    };

    return (
        <PickerView>
            <ResourcePickerSubViewHeader
                onBack={onBack}
                search={
                    <div onPaste={handlePaste}>
                        <PickerSearchField
                            ref={inputRef}
                            type="url"
                            value={url}
                            onChange={setUrl}
                            onKeyDown={handleKeyDown}
                            loading={isValidating}
                            placeholder="https://example.com/document.pdf"
                        />
                    </div>
                }
                actions={
                    <button
                        type="button"
                        onClick={() => void handleValidate()}
                        disabled={isValidating || !url.trim()}
                        aria-label="Preview"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 pointer-coarse:h-11 pointer-coarse:w-11"
                    >
                        {isValidating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <ArrowRight className="h-4 w-4" />
                        )}
                    </button>
                }
            />

            <PickerViewBody className="space-y-2">
                {/* Error with suggestion */}
                {error && (
                    <div className="space-y-2">
                        <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-2.5">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                            <p className="min-w-0 flex-1 text-sm text-destructive">{error}</p>
                            <ErrorAlchemyMenu error={error} />
                        </div>
                        {suggestedType && onSwitchTo && (
                            <Button
                                size="sm"
                                className="h-9 w-full text-sm pointer-coarse:h-11"
                                onClick={() => onSwitchTo(suggestedType, url)}
                            >
                                <Globe className="mr-1.5 h-4 w-4" />
                                Switch to {suggestedType === 'webpage' ? 'Web page' : suggestedType === 'youtube' ? 'YouTube' : 'Image link'}
                            </Button>
                        )}
                    </div>
                )}

                {previewFile && (
                    <div className="overflow-hidden rounded-lg border border-border">
                        <div className="flex items-center gap-2.5 bg-muted/50 p-2.5">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-purple-500/10">
                                <File className="h-6 w-6 text-purple-600 dark:text-purple-500" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-foreground">
                                    {previewFile.filename}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span className="uppercase">{previewFile.extension}</span>
                                    <span>•</span>
                                    <span className="truncate">{previewFile.type}</span>
                                </div>
                            </div>
                        </div>
                        <div className="border-t border-border bg-background p-2.5">
                            <a
                                href={previewFile.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
                            >
                                <span className="truncate">{previewFile.url}</span>
                                <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                        </div>
                    </div>
                )}
            </PickerViewBody>

            {previewFile && (
                <div className="shrink-0 border-t border-border p-1.5">
                    <Button
                        onClick={handleSelect}
                        className="h-9 w-full text-sm pointer-coarse:h-11"
                        size="sm"
                    >
                        <FileText className="mr-2 h-4 w-4" />
                        Add file
                    </Button>
                </div>
            )}
        </PickerView>
    );
}
