"use client";

import React, { useState } from "react";
import { cn } from "@/styles/themes/utils";
import { Copy, Check } from "lucide-react";
import { useCanvasPresentation } from "@ai-matrx/canvas/react";
import { treeWrapsLines } from "@/components/mardown-display/blocks/canvas-adaptive";

interface TreeBlockProps {
  content: string;
  className?: string;
}

interface TreeLine {
  text: string;
  depth: number;
  connector: string;
  label: string;
  hasHighlight: boolean;
  highlightText?: string;
}

const CONNECTORS = [
  "├─",
  "└─",
  "│",
  "├──",
  "└──",
  "├─ ",
  "└─ ",
  "+--",
  "|--",
  "|  ",
  "+- ",
  "|- ",
];
const ARROW = /\s*[→➜➔\->]+\s*/;

function parseTreeLines(content: string): TreeLine[] {
  return content.split("\n").map((line) => {
    if (!line.trim()) {
      return {
        text: line,
        depth: 0,
        connector: "",
        label: line,
        hasHighlight: false,
      };
    }

    let depth = 0;
    let pos = 0;
    let connector = "";

    // Count depth by looking for tree-drawing characters
    while (pos < line.length) {
      const rest = line.slice(pos);

      // Check for connectors at current position
      let foundConnector = false;
      for (const c of CONNECTORS) {
        if (rest.startsWith(c)) {
          if (c === "│" || c === "|  " || c === "|") {
            depth++;
            pos += c.length;
            foundConnector = true;
            break;
          } else {
            connector = c;
            pos += c.length;
            foundConnector = true;
            break;
          }
        }
      }

      if (!foundConnector) {
        if (rest[0] === " " || rest[0] === "\t") {
          pos++;
        } else {
          break;
        }
      }

      if (connector) break;
    }

    const label = line.slice(pos).trim();
    const arrowMatch = label.match(ARROW);
    let hasHighlight = false;
    let highlightText: string | undefined;

    if (arrowMatch) {
      const afterArrow = label
        .slice(arrowMatch.index! + arrowMatch[0].length)
        .trim();
      if (afterArrow.startsWith("**") && afterArrow.endsWith("**")) {
        hasHighlight = true;
        highlightText = afterArrow.slice(2, -2);
      }
    }

    return { text: line, depth, connector, label, hasHighlight, highlightText };
  });
}

const DEPTH_COLORS = [
  "text-blue-500 dark:text-blue-400",
  "text-green-500 dark:text-green-400",
  "text-amber-500 dark:text-amber-400",
  "text-purple-500 dark:text-purple-400",
  "text-cyan-500 dark:text-cyan-400",
  "text-rose-500 dark:text-rose-400",
];

const TreeBlock: React.FC<TreeBlockProps> = ({ content, className }) => {
  const [copied, setCopied] = useState(false);
  const lines = parseTreeLines(content);
  // A portrait canvas pane grows the tree downward: long lines wrap under
  // their own branch instead of pushing the pane into sideways scrolling.
  const wrap = treeWrapsLines(useCanvasPresentation());

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "my-3 rounded-lg border border-border bg-card overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-muted/30">
        <span className="text-xs font-mono font-semibold text-teal-600 dark:text-teal-400">
          Tree
        </span>
        <button
          onClick={handleCopy}
          className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
      <div
        data-tree-wrap={wrap ? "wrap" : "scroll"}
        className={cn(
          "px-4 py-3 font-mono text-sm leading-relaxed",
          wrap ? "overflow-x-hidden" : "overflow-x-auto",
        )}
      >
        {lines.map((line, idx) => {
          if (!line.text.trim()) {
            return <div key={idx} className="h-2" />;
          }

          const depthColor = DEPTH_COLORS[line.depth % DEPTH_COLORS.length];

          // Render the raw line with colored connectors
          const raw = line.text;
          const labelStart = raw.indexOf(line.label);

          if (labelStart <= 0) {
            // No connector prefix — root node
            return (
              <div key={idx} className="text-foreground font-semibold">
                {line.label}
              </div>
            );
          }

          const prefix = raw.slice(0, labelStart);

          // Split label at arrow if present
          const arrowMatch = line.label.match(ARROW);

          return (
            <div
              key={idx}
              className={cn(
                "hover:bg-muted/20 rounded-sm transition-colors",
                wrap
                  ? "whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
                  : "whitespace-pre",
              )}
            >
              <span className={cn("select-none", depthColor)}>{prefix}</span>
              {arrowMatch ? (
                <>
                  <span className="text-foreground">
                    {line.label.slice(0, arrowMatch.index)}
                  </span>
                  <span className="text-muted-foreground">{arrowMatch[0]}</span>
                  {line.hasHighlight && line.highlightText ? (
                    <span className="font-semibold text-primary bg-primary/10 px-1 rounded">
                      {line.highlightText}
                    </span>
                  ) : (
                    <span className="text-foreground">
                      {line.label.slice(
                        arrowMatch.index! + arrowMatch[0].length,
                      )}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-foreground">{line.label}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TreeBlock;
