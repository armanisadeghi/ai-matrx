"use client";

import React, { useRef } from "react";
import { Globe, CheckCircle2 } from "lucide-react";
import type { HtmlPreviewTabProps } from "../types";

export function CompleteHtmlTab({ state, actions }: HtmlPreviewTabProps) {
    const completeTextareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSelectAllComplete = () => {
        if (completeTextareaRef.current) {
            completeTextareaRef.current.select();
            completeTextareaRef.current.setSelectionRange(0, 99999);
        }
    };

    return (
        <div className="h-full flex flex-col">
            <div className="mb-3 flex justify-between items-center">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                    Complete HTML page with embedded CSS - ready to save as .html file
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleSelectAllComplete}
                        className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                    >
                        Select All
                    </button>
                    <button
                        onClick={actions.handleCopyComplete}
                        className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded transition-colors ${
                            state.copiedComplete
                                ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                                : "bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300"
                        }`}
                    >
                        {state.copiedComplete ? (
                            <>
                                <CheckCircle2 size={16} />
                                Copied!
                            </>
                        ) : (
                            <>
                                <Globe size={16} />
                                Copy Complete HTML
                            </>
                        )}
                    </button>
                </div>
            </div>
            <textarea
                ref={completeTextareaRef}
                // The same document "Copy Complete HTML" copies. This read a
                // `getCurrentHtmlContent` that the state never had (hidden by
                // an `as any`), so the tab sat on its placeholder forever.
                value={actions.generateCompleteHtmlFromSources()}
                readOnly
                className="flex-1 w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent overflow-y-auto"
            />
        </div>
    );
}

