"use client";

import React from "react";
import type { MarkdownTabProps } from "../types";
import { MatrxSplit } from "@/components/matrx/MatrxSplit";

export function MatrxSplitTab({ state, actions }: MarkdownTabProps) {
    return (
        <MatrxSplit imagePolicy="other"
            value={state.currentMarkdown}
            onChange={(value) => actions.setCurrentMarkdown(value)}
            placeholder="Start writing markdown..."
        />
    );
}
