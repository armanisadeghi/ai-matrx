"use client";

import React, { useState } from "react";
import { cn } from "@/styles/themes/utils";
import { ChevronRight, ChevronDown, Copy, Check } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";

interface YamlBlockProps {
  content: string;
  className?: string;
}

interface YamlLine {
  indent: number;
  key?: string;
  value?: string;
  isComment: boolean;
  isArrayItem: boolean;
  isSection: boolean;
  raw: string;
}

function parseYamlLines(content: string): YamlLine[] {
  return content.split("\n").map((raw) => {
    const indent = raw.search(/\S|$/);
    const trimmed = raw.trim();

    if (!trimmed || trimmed === "---" || trimmed === "...") {
      return {
        indent,
        isComment: false,
        isArrayItem: false,
        isSection: false,
        raw,
      };
    }

    if (trimmed.startsWith("#")) {
      return {
        indent,
        isComment: true,
        isArrayItem: false,
        isSection: false,
        raw,
      };
    }

    const isArrayItem = trimmed.startsWith("- ");
    let effectiveTrimmed = isArrayItem ? trimmed.slice(2) : trimmed;

    const colonIdx = effectiveTrimmed.indexOf(":");
    if (colonIdx !== -1) {
      const key = effectiveTrimmed.slice(0, colonIdx).trim();
      const afterColon = effectiveTrimmed.slice(colonIdx + 1).trim();
      const isSection =
        afterColon === "" ||
        afterColon === "|" ||
        afterColon === ">" ||
        afterColon === "|-" ||
        afterColon === ">-";
      return {
        indent,
        key,
        value: isSection ? undefined : afterColon,
        isComment: false,
        isArrayItem,
        isSection,
        raw,
      };
    }

    return {
      indent,
      value: effectiveTrimmed,
      isComment: false,
      isArrayItem,
      isSection: false,
      raw,
    };
  });
}

function renderValue(value: string): React.ReactNode {
  if (value === "true" || value === "false") {
    return (
      <span className="text-orange-600 dark:text-orange-400 font-medium">
        {value}
      </span>
    );
  }
  if (value === "null" || value === "~") {
    return <span className="text-muted-foreground italic">null</span>;
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return (
      <span className="text-purple-600 dark:text-purple-400">{value}</span>
    );
  }
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return <span className="text-green-600 dark:text-green-400">{value}</span>;
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    return <span className="text-green-600 dark:text-green-400">{value}</span>;
  }
  return <span className="text-green-600 dark:text-green-400">{value}</span>;
}

const YamlBlock: React.FC<YamlBlockProps> = ({ content, className }) => {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const lines = parseYamlLines(content);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleCollapse = (lineIdx: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(lineIdx)) next.delete(lineIdx);
      else next.add(lineIdx);
      return next;
    });
  };

  const getChildRange = (parentIdx: number): [number, number] => {
    const parentIndent = lines[parentIdx].indent;
    let end = parentIdx + 1;
    while (end < lines.length) {
      const line = lines[end];
      if (line.raw.trim() === "") {
        end++;
        continue;
      }
      if (line.indent <= parentIndent) break;
      end++;
    }
    return [parentIdx + 1, end];
  };

  const visibleLines: number[] = [];
  const hiddenSections = new Set<number>();
  for (let idx = 0; idx < lines.length; idx++) {
    if (hiddenSections.has(idx)) continue;
    visibleLines.push(idx);
    if (collapsed.has(idx)) {
      const [start, end] = getChildRange(idx);
      for (let j = start; j < end; j++) hiddenSections.add(j);
    }
  }

  return (
    <div
      className={cn(
        "my-3 rounded-lg border border-border bg-card overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-muted/30">
        <span className="text-xs font-mono font-semibold text-amber-600 dark:text-amber-400">
          YAML
        </span>
        <Button variant="quiet" icon={copied ? (
            <Check />
          ) : (
            <Copy />
          )} glyphTone={copied ? "success" : undefined} onClick={handleCopy} aria-label="Copy" />
      </div>
      <div className="px-3 py-2 font-mono text-sm leading-relaxed overflow-x-auto">
        {visibleLines.map((idx) => {
          const line = lines[idx];
          const trimmed = line.raw.trim();

          if (!trimmed) {
            return <div key={idx} className="h-3" />;
          }

          if (trimmed === "---" || trimmed === "...") {
            return (
              <div
                key={idx}
                className="text-muted-foreground/50"
                style={{ paddingLeft: line.indent * 8 }}
              >
                {trimmed}
              </div>
            );
          }

          if (line.isComment) {
            return (
              <div
                key={idx}
                className="text-muted-foreground italic"
                style={{ paddingLeft: line.indent * 8 }}
              >
                {trimmed}
              </div>
            );
          }

          const hasChildren =
            line.isSection ||
            (line.key &&
              idx + 1 < lines.length &&
              lines[idx + 1].indent > line.indent);
          const isCollapsed = collapsed.has(idx);

          return (
            <div
              key={idx}
              className="flex items-start group/line hover:bg-muted/30 rounded-sm -mx-1 px-1"
              style={{ paddingLeft: line.indent * 8 }}
            >
              {hasChildren ? (
                <Button variant="quiet" icon={isCollapsed ? (
                    <ChevronRight />
                  ) : (
                    <ChevronDown />
                  )} onClick={() => toggleCollapse(idx)} aria-label={isCollapsed ? "Expand" : "Collapse"} aria-expanded={!(isCollapsed)} className="mr-1 mt-0.5" />
              ) : (
                <span className="w-[18px] flex-shrink-0" />
              )}
              <span>
                {line.isArrayItem && (
                  <span className="text-muted-foreground">- </span>
                )}
                {line.key && (
                  <>
                    <code className="text-blue-600 dark:text-blue-400 font-medium">
                      {line.key}
                    </code>
                    <span className="text-muted-foreground">:</span>
                  </>
                )}
                {line.value !== undefined && (
                  <span className="ml-1">{renderValue(line.value)}</span>
                )}
                {!line.key && line.value === undefined && (
                  <span className="text-foreground">{trimmed}</span>
                )}
                {isCollapsed && (
                  <span className="ml-2 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    ...
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default YamlBlock;
