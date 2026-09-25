"use client";

import React, { useRef } from "react";
import { Copy, CheckCircle2 } from "lucide-react";
import type { HtmlPreviewTabProps } from "../types";

export function HtmlCodeTab({ state, actions }: HtmlPreviewTabProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSelectAll = () => {
        if (textareaRef.current) {
            textareaRef.current.select();
            textareaRef.current.setSelectionRange(0, 99999);
        }
    };

    return (
        <div className="h-full flex flex-col">
            <div className="mb-3 flex gap-2 flex-wrap">
                <button
                    onClick={handleSelectAll}
                    className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                >
                    Select All
                </button>
                <button
                    onClick={actions.handleCopyHtml}
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded transition-colors ${
                        state.copied
                            ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                            : "bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300"
                    }`}
                >
                    {state.copied ? (
                        <>
                            <CheckCircle2 size={16} />
                            Copied!
                        </>
                    ) : (
                        <>
                            <Copy size={16} />
                            Copy HTML
                        </>
                    )}
                </button>
                <button
                    onClick={actions.handleCopyHtmlNoBullets}
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded transition-colors ${
                        state.copiedNoBullets
                            ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                            : "bg-orange-100 hover:bg-orange-200 dark:bg-orange-900 dark:hover:bg-orange-800 text-orange-700 dark:text-orange-300"
                    }`}
                >
                    {state.copiedNoBullets ? (
                        <>
                            <CheckCircle2 size={16} />
                            Copied!
                        </>
                    ) : (
                        <>
                            <Copy size={16} />
                            Copy HTML No Bullet Styles
                        </>
                    )}
                </button>
            </div>
            <textarea
                ref={textareaRef}
                value={state.contentHtml}
                readOnly
                className="flex-1 w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent overflow-y-auto"
            />
        </div>
    );
}

