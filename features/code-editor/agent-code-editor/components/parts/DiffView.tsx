"use client";

/**
 * DiffView — unified diff renderer with syntax highlighting.
 *
 * Copied from features/code-editor/components/DiffView.tsx — the only change
 * is the import path for generateUnifiedDiff, which now points at the
 * agent-code-editor utils.
 */

import React from "react";
import { Prism as SyntaxHighlighterBase } from "react-syntax-highlighter";
import {
  vscDarkPlus,
  vs,
} from "react-syntax-highlighter/dist/cjs/styles/prism";
import { useThemeMode } from "@/styles/themes/useThemeMode";
import {
  generateUnifiedDiff,
  type DiffLine,
} from "@/features/code-editor/agent-code-editor/utils/generateDiff";
import { cn } from "@/styles/themes/utils";

// Type assertion to resolve React 19 type incompatibility
const SyntaxHighlighter = SyntaxHighlighterBase as any;

interface DiffViewProps {
  originalCode: string;
  modifiedCode: string;
  language: string;
  showLineNumbers?: boolean;
  className?: string;
}

export function DiffView({
  originalCode,
  modifiedCode,
  language,
  showLineNumbers = true,
  className,
}: DiffViewProps) {
  const mode = useThemeMode();
  const diff = generateUnifiedDiff(originalCode, modifiedCode);

  const getDiffLineStyle = (type: DiffLine["type"]) => {
    if (type === "added") {
      return mode === "dark"
        ? "bg-green-900/60 border-l-4 border-green-500"
        : "bg-green-100 border-l-4 border-green-600";
    }
    if (type === "removed") {
      return mode === "dark"
        ? "bg-red-900/60 border-l-4 border-red-500"
        : "bg-red-100 border-l-4 border-red-600";
    }
    return "bg-textured";
  };

  return (
    <div className={cn("h-full overflow-hidden", className)}>
      <div className="h-full overflow-auto">
        <div className="font-mono text-xs bg-textured">
          {diff.lines.map((line, index) => (
            <div
              key={index}
              className={cn("flex items-center", getDiffLineStyle(line.type))}
            >
              {showLineNumbers && (
                <div
                  className={cn(
                    "shrink-0 w-10 text-right pr-2 select-none",
                    mode === "dark" ? "text-gray-500" : "text-gray-400",
                  )}
                >
                  {line.lineNumber}
                </div>
              )}
              <div className="flex-1 px-2 overflow-x-auto">
                {line.type === "removed" ? (
                  <span
                    className={cn(
                      "whitespace-pre",
                      mode === "dark" ? "text-gray-400" : "text-gray-600",
                    )}
                  >
                    {line.content || " "}
                  </span>
                ) : (
                  <SyntaxHighlighter
                    language={language}
                    style={mode === "dark" ? vscDarkPlus : vs}
                    PreTag="span"
                    customStyle={{
                      margin: 0,
                      padding: 0,
                      background: "transparent",
                      fontSize: "inherit",
                      fontFamily: "inherit",
                      lineHeight: "1.2",
                    }}
                    codeTagProps={{
                      style: {
                        background: "transparent",
                        fontFamily: "inherit",
                        lineHeight: "1.2",
                      },
                    }}
                  >
                    {line.content || " "}
                  </SyntaxHighlighter>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
