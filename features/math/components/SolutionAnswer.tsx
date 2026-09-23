"use client";

import React from "react";
import InlineMathText from "./InlineMathText";
import DisplayMath from "./DisplayMath";

interface SolutionAnswerProps {
    answer: string;
    className?: string;
}

/**
 * Smart component that renders solution answers
 * Handles both pure LaTeX and mixed text with embedded LaTeX
 * 
 * Detects format:
 * - Pure LaTeX: "x = 4" → renders with DisplayMath (the markdown core)
 * - Mixed text with LaTeX: "The answer is \\(x = 4\\)" → renders with InlineMathText
 * - Multi-line text: splits on \n and renders each line
 */
const SolutionAnswer: React.FC<SolutionAnswerProps> = ({ answer, className = "" }) => {
    if (!answer) return null;

    // Detect if this is mixed text (contains inline math delimiters or newlines)
    const hasMixedText = /\\\(.*?\\\)|\$[^$]+?\$|\\n/.test(answer);

    if (hasMixedText) {
        // Handle mixed text with potential newlines
        const lines = answer.split('\\n');
        
        return (
            <div className={`space-y-2 ${className}`}>
                {lines.map((line, index) => (
                    <div key={index} className="text-sm leading-relaxed">
                        <InlineMathText text={line} />
                    </div>
                ))}
            </div>
        );
    }

    // Pure LaTeX - one display formula through the markdown core. KaTeX runs
    // with strict:"ignore" and throwOnError off there, so a malformed answer
    // renders KaTeX's own error text instead of throwing.
    return <DisplayMath math={answer} className={className} />;
};

export default SolutionAnswer;

