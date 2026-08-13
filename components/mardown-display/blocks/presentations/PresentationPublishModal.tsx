"use client";

import React, { useState, useEffect } from 'react';
import { X, ExternalLink, Copy, CheckCircle2 } from 'lucide-react';
import { PresentationData } from './Slideshow';

interface PresentationPublishModalProps {
    isOpen: boolean;
    onClose: () => void;
    publishedUrl: string | null;
    isPublishing: boolean;
}

export const PresentationPublishModal: React.FC<PresentationPublishModalProps> = ({
    isOpen,
    onClose,
    publishedUrl,
    isPublishing
}) => {
    const [copiedUrl, setCopiedUrl] = useState(false);
    const [iframeKey, setIframeKey] = useState(0);

    useEffect(() => {
        if (publishedUrl) {
            setIframeKey(prev => prev + 1);
        }
    }, [publishedUrl]);

    const handleCopyUrl = async () => {
        if (publishedUrl) {
            await navigator.clipboard.writeText(publishedUrl);
            setCopiedUrl(true);
            setTimeout(() => setCopiedUrl(false), 2000);
        }
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div 
                className="fixed inset-0 bg-black/50 z-50 transition-opacity"
                onClick={onClose}
            />
            
            {/* Modal */}
            <div className="fixed inset-4 md:inset-8 lg:inset-16 bg-textured rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden border-border">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                        {isPublishing ? 'Publishing Presentation...' : 'Presentation Published'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    >
                        <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 flex flex-col p-6 overflow-hidden">
                    {isPublishing ? (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center">
                                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                                <p className="text-gray-600 dark:text-gray-400">
                                    Creating your webpage...
                                </p>
                            </div>
                        </div>
                    ) : publishedUrl ? (
                        <>
                            {/* URL Display */}
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-4">
                                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                                    YOUR WEBPAGE URL
                                </div>
                                <div className="flex items-center gap-2">
                                    <a
                                        href={publishedUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 text-sm text-blue-600 dark:text-blue-400 hover:underline truncate font-medium"
                                    >
                                        {publishedUrl}
                                    </a>
                                    <button
                                        onClick={handleCopyUrl}
                                        className="p-2 hover:bg-blue-100 dark:hover:bg-blue-800 rounded transition-colors"
                                        title="Copy URL"
                                    >
                                        {copiedUrl ? (
                                            <CheckCircle2 size={18} className="text-green-600 dark:text-green-400" />
                                        ) : (
                                            <Copy size={18} className="text-blue-600 dark:text-blue-400" />
                                        )}
                                    </button>
                                    <a
                                        href={publishedUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2 hover:bg-blue-100 dark:hover:bg-blue-800 rounded transition-colors"
                                        title="Open in new tab"
                                    >
                                        <ExternalLink size={18} className="text-blue-600 dark:text-blue-400" />
                                    </a>
                                </div>
                                {copiedUrl && (
                                    <div className="mt-2 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                                        <CheckCircle2 className="size-3.5" aria-hidden="true" />
                                        URL copied to clipboard!
                                    </div>
                                )}
                            </div>

                            {/* Preview Section */}
                            <div className="flex-1 flex flex-col min-h-0">
                                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                    Live Preview
                                </h3>
                                <div className="flex-1 border-border rounded-lg overflow-hidden bg-white dark:bg-gray-950">
                                    <iframe
                                        key={iframeKey}
                                        src={`${publishedUrl}?t=${iframeKey}`}
                                        className="w-full h-full"
                                        title="Published Presentation Preview"
                                        sandbox="allow-same-origin allow-scripts"
                                    />
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div className="mt-4 flex justify-end gap-3">
                                <button
                                    onClick={onClose}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                                >
                                    Close
                                </button>
                                <a
                                    href={publishedUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors inline-flex items-center gap-2"
                                >
                                    Open in New Tab
                                    <ExternalLink className="h-4 w-4" />
                                </a>
                            </div>
                        </>
                    ) : null}
                </div>
            </div>
        </>
    );
};
