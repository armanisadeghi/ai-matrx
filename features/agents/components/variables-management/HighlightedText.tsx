import React from "react";
import { isDeclarableVariableName } from "@/features/agents/utils/variable-utils";

interface HighlightedTextProps {
    text: string;
    validVariables?: string[];
}

// Helper component to render text with highlighted variables.
// Declared variables are green; undeclared-but-declarable names are red (a real
// mistake — they resolve to nothing at run time); tokens that can never be a
// variable name ({{step_N.output.field}}) are neutral, because the runtime
// substitutes by exact declared-name match and passes those through verbatim.
export const HighlightedText = ({ text, validVariables = [] }: HighlightedTextProps) => {
    const parts = text.split(/(\{\{[^}]+\}\})/g);

    return (
        <>
            {parts.map((part, idx) => {
                const variableMatch = part.match(/^\{\{([^}]+)\}\}$/);
                if (variableMatch) {
                    const variableName = variableMatch[1];
                    const isValid = validVariables.includes(variableName);
                    const isLiteral = !isValid && !isDeclarableVariableName(variableName.trim());

                    return (
                        <span
                            key={idx}
                            className={
                                isValid
                                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 rounded-md px-1 py-0.5 font-medium"
                                    : isLiteral
                                      ? "bg-muted text-muted-foreground border border-border rounded-md px-1 py-0.5 font-medium"
                                      : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-md px-1 py-0.5 font-medium"
                            }
                            title={
                                isValid
                                    ? `Variable: ${variableName}`
                                    : isLiteral
                                      ? `Literal text — "${variableName}" is not a valid variable name, so it is sent to the model as written`
                                      : `Undefined variable: ${variableName}`
                            }
                        >
                            {part}
                        </span>
                    );
                }
                return <span key={idx}>{part}</span>;
            })}
        </>
    );
};

