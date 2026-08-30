'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { X, Copy, Check, Download, ExternalLink } from 'lucide-react';
import { markdownToHtml } from '@ai-matrx/print/markdown';

interface QuickHtmlShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    markdown: string;
    title?: string;
}

function buildStandaloneHtml(bodyHtml: string, title: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title || 'AI Response'}</title>
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
            font-size: 16px;
            line-height: 1.7;
            color: #1a1a1a;
            background: #ffffff;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem 1.5rem 4rem;
        }
        h1 { font-size: 2rem; font-weight: 700; margin: 1.5rem 0 0.75rem; line-height: 1.3; }
        h2 { font-size: 1.5rem; font-weight: 700; margin: 1.5rem 0 0.5rem; line-height: 1.3; }
        h3 { font-size: 1.25rem; font-weight: 600; margin: 1.25rem 0 0.5rem; }
        h4, h5, h6 { font-size: 1rem; font-weight: 600; margin: 1rem 0 0.25rem; }
        p { margin: 0.75rem 0; }
        ul, ol { margin: 0.75rem 0; padding-left: 1.75rem; }
        li { margin: 0.25rem 0; }
        strong, b { font-weight: 700; }
        em, i { font-style: italic; }
        code {
            font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
            font-size: 0.875em;
            background: #f3f4f6;
            border-radius: 4px;
            padding: 0.15em 0.4em;
        }
        pre {
            background: #1e1e2e;
            color: #cdd6f4;
            border-radius: 8px;
            padding: 1rem 1.25rem;
            overflow-x: auto;
            margin: 1rem 0;
        }
        pre code { background: none; padding: 0; color: inherit; font-size: 0.875rem; }
        blockquote {
            border-left: 4px solid #d1d5db;
            padding-left: 1rem;
            margin: 1rem 0;
            color: #6b7280;
            font-style: italic;
        }
        hr { border: none; border-top: 1px solid #e5e7eb; margin: 2rem 0; }
        a { color: #2563eb; text-decoration: underline; }
        table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
        th, td { border: 1px solid #d1d5db; padding: 0.5rem 0.75rem; text-align: left; }
        th { background: #f9fafb; font-weight: 600; }
        tr:nth-child(even) { background: #f9fafb; }
        img { max-width: 100%; height: auto; border-radius: 4px; }
    </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

export default function QuickHtmlShareModal({ isOpen, onClose, markdown, title = 'AI Response' }: QuickHtmlShareModalProps) {
    const [copied, setCopied] = useState(false);

    const bodyHtml = useMemo(() => markdownToHtml(markdown), [markdown]);
    const standaloneHtml = useMemo(() => buildStandaloneHtml(bodyHtml, title), [bodyHtml, title]);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(standaloneHtml);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // fallback
        }
    }, [standaloneHtml]);

    const handleDownload = useCallback(() => {
        const blob = new Blob([standaloneHtml], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'response'}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [standaloneHtml, title]);

    const handleOpenInTab = useCallback(() => {
        const blob = new Blob([standaloneHtml], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        // Don't revoke immediately — the tab needs it
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }, [standaloneHtml]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Modal */}
            <div className="relative z-10 w-full max-w-4xl max-h-[90dvh] flex flex-col rounded-xl bg-card border border-border shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
                    <div>
                        <h2 className="text-sm font-semibold text-foreground">Share as HTML</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">Preview, copy, or download a self-contained HTML page</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Action bar */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border flex-shrink-0 bg-muted/30">
                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                        {copied ? (
                            <><Check className="w-3.5 h-3.5" />Copied!</>
                        ) : (
                            <><Copy className="w-3.5 h-3.5" />Copy HTML</>
                        )}
                    </button>
                    <button
                        onClick={handleDownload}
                        className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-foreground bg-accent hover:bg-accent/80 transition-colors"
                    >
                        <Download className="w-3.5 h-3.5" />
                        Download .html
                    </button>
                    <button
                        onClick={handleOpenInTab}
                        className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-foreground bg-accent hover:bg-accent/80 transition-colors"
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open in tab
                    </button>
                    <span className="ml-auto text-xs text-muted-foreground">Self-contained · No external dependencies</span>
                </div>

                {/* Preview iframe */}
                <div className="flex-1 min-h-0 overflow-hidden">
                    <iframe
                        srcDoc={standaloneHtml}
                        title="HTML Preview"
                        className="w-full h-full border-0 bg-white"
                        sandbox="allow-same-origin"
                    />
                </div>
            </div>
        </div>
    );
}
