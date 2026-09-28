"use client";

// Source tab — THE ONE EDITOR's source view (components/rich-editor). Toast UI is
// gone from the app; the host's tabs are the one view switch (no toolbar row).

import React from "react";
import type { MarkdownTabProps } from "../types";
import RichEditor from "@/components/rich-editor/RichEditor";

export function MarkdownSplitViewTab({ state, actions, controllerRef }: MarkdownTabProps) {
    return (
        <RichEditor
            value={state.currentMarkdown}
            onChange={(newContent) => actions.setCurrentMarkdown(newContent)}
            defaultView="source"
            chrome="bare"
            controllerRef={controllerRef}
            defaultOutlineOpen={false}
            className="h-full"
        />
    );
}
