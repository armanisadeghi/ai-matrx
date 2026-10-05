"use client";

import React, { useState } from "react";
import type { MarkdownTabProps } from "../types";
import { useTextareaFormatting } from "@/components/rich-editor/format/useTextareaFormatting";

export function MarkdownPlainTextTab({ state, actions }: MarkdownTabProps) {
    // Plain is raw text, but the ONE formatting layer (chords + the selection
    // toolbar's buttons) still inserts markdown on request.
    const [element, setElement] = useState<HTMLTextAreaElement | null>(null);
    useTextareaFormatting(element);
    return (
        <textarea
            ref={setElement}
            className="w-full h-full p-4 outline-none resize-none border-none bg-background text-foreground text-base font-mono"
            value={state.currentMarkdown}
            onChange={(e) => actions.setCurrentMarkdown(e.target.value)}
            placeholder="Start writing markdown..."
            aria-label="Markdown Editor"
        />
    );
}
