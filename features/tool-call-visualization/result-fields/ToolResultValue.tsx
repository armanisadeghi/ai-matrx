"use client";

/**
 * ToolResultValue — the door every tool-call renderer draws a WHOLE result
 * through (`entry.result`). A result is a settled answer: when it is kind data
 * (`scope_system_result`, any `__kind` payload, or its JSON text) it renders
 * through the value door — `KindValueNode` → the lazy `KindValueFrontDoor` →
 * `AnswerValueView`, the kind's own component — and anything else goes to the
 * value grid, `ResultValue`.
 *
 * `ResultValue` therefore only meets a kind nested inside data from here, so
 * its bottom-layer report (`report-kind-at-raw-renderer.ts`) names a caller
 * that skipped this door, never one that took it. The kind stack stays behind
 * the lazy door, so every tool card's chunk stays small. Guard:
 * `__tests__/a-kind-tool-result-takes-the-value-door.test.tsx`.
 */

import React from "react";
import { detectResultShape } from "./shape";
import { KindValueNode } from "./KindValueNode";
import { ResultValue, type ResultDensity } from "./ResultValue";

export interface ToolResultValueProps {
    value: unknown;
    density?: ResultDensity;
    className?: string;
}

export const ToolResultValue: React.FC<ToolResultValueProps> = ({
    value,
    density = "inline",
    className,
}) => {
    const shape = detectResultShape(value);
    if (shape.kind === "kindInstance") {
        return (
            <div className={className}>
                <KindValueNode value={value} slug={shape.slug} density={density} />
            </div>
        );
    }
    return <ResultValue value={value} density={density} className={className} />;
};
