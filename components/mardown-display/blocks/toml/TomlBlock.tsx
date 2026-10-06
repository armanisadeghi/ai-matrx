"use client";

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { toast } from "@/lib/toast";
import React, { useState } from "react";
import { cn } from "@/styles/themes/utils";
import { Copy, Check, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";

interface TomlBlockProps {
  content: string;
  className?: string;
}

interface TomlLine {
  type: "section" | "key-value" | "comment" | "blank" | "array-section";
  indent: number;
  section?: string;
  key?: string;
  value?: string;
  raw: string;
}

function parseTomlLines(content: string): TomlLine[] {
  return content.split("\n").map((raw) => {
    const trimmed = raw.trim();

    if (!trimmed) {
      return { type: "blank", indent: 0, raw };
    }

    if (trimmed.startsWith("#")) {
      return { type: "comment", indent: 0, raw };
    }

    // [[array.section]]
    const arraySection = trimmed.match(/^\[\[(.+)\]\]$/);
    if (arraySection) {
      return {
        type: "array-section",
        indent: 0,
        section: arraySection[1],
        raw,
      };
    }

    // [section] — must not be part of a value assignment
    const section = trimmed.match(/^\[([^\]]+)\]$/);
    if (section) {
      return { type: "section", indent: 0, section: section[1], raw };
    }

    // key = value
    const kvMatch = trimmed.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (kvMatch) {
      return {
        type: "key-value",
        indent: 0,
        key: kvMatch[1].trim(),
        value: kvMatch[2].trim(),
        raw,
      };
    }

    return { type: "key-value", indent: 0, value: trimmed, raw };
  });
}

function renderTomlValue(value: string): React.ReactNode {
  if (value === "true" || value === "false") {
    return (
      <span className="text-orange-600 dark:text-orange-400 font-medium">
        {value}
      </span>
    );
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

  if (value.startsWith('"""') || value.startsWith("'''")) {
    return <span className="text-green-600 dark:text-green-400">{value}</span>;
  }

  if (value.startsWith("[")) {
    // Inline array — color the brackets and try to color individual items
    return <span className="text-green-600 dark:text-green-400">{value}</span>;
  }

  if (value.startsWith("{")) {
    return <span className="text-blue-600 dark:text-blue-400">{value}</span>;
  }

  // Date/time patterns
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return <span className="text-cyan-600 dark:text-cyan-400">{value}</span>;
  }

  return <span className="text-green-600 dark:text-green-400">{value}</span>;
}

const TomlBlock: React.FC<TomlBlockProps> = ({ content, className }) => {
  const { copyText } = useClipboard({
    notify: (message, kind) =>
      kind === "error" ? toast.error(message) : toast.success(message),
  });
  const [copied, setCopied] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(
    new Set(),
  );
  const lines = parseTomlLines(content);

  const handleCopy = async () => {
    await copyText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleSection = (idx: number) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const getSectionEnd = (sectionIdx: number): number => {
    let end = sectionIdx + 1;
    while (end < lines.length) {
      const line = lines[end];
      if (line.type === "section" || line.type === "array-section") break;
      end++;
    }
    return end;
  };

  const hiddenLines = new Set<number>();
  for (const idx of collapsedSections) {
    const end = getSectionEnd(idx);
    for (let j = idx + 1; j < end; j++) hiddenLines.add(j);
  }

  return (
    <div
      className={cn(
        "my-3 rounded-lg border border-border bg-card overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-muted/30">
        <span className="text-xs font-mono font-semibold text-violet-600 dark:text-violet-400">
          TOML
        </span>
        <Button variant="quiet" icon={copied ? (
            <Check />
          ) : (
            <Copy />
          )} glyphTone={copied ? "success" : undefined} onClick={handleCopy} aria-label="Copy" />
      </div>
      <div className="px-3 py-2 font-mono text-sm leading-relaxed overflow-x-auto">
        {lines.map((line, idx) => {
          if (hiddenLines.has(idx)) return null;

          if (line.type === "blank") {
            return <div key={idx} className="h-3" />;
          }

          if (line.type === "comment") {
            return (
              <div key={idx} className="text-muted-foreground italic">
                {line.raw.trim()}
              </div>
            );
          }

          if (line.type === "section" || line.type === "array-section") {
            const isCollapsed = collapsedSections.has(idx);
            const bracket = line.type === "array-section" ? "[[" : "[";
            const closeBracket = line.type === "array-section" ? "]]" : "]";

            return (
              <div
                key={idx}
                className="flex items-center group/section hover:bg-muted/30 rounded-sm -mx-1 px-1 mt-2 first:mt-0"
              >
                <Button variant="quiet" icon={isCollapsed ? (
                    <ChevronRight />
                  ) : (
                    <ChevronDown />
                  )} onClick={() => toggleSection(idx)} aria-label={isCollapsed ? "Expand" : "Collapse"} aria-expanded={!(isCollapsed)} className="mr-1" />
                <span>
                  <span className="text-muted-foreground">{bracket}</span>
                  <span className="text-blue-600 dark:text-blue-400 font-semibold">
                    {line.section}
                  </span>
                  <span className="text-muted-foreground">{closeBracket}</span>
                </span>
                {isCollapsed && (
                  <span className="ml-2 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    ...
                  </span>
                )}
              </div>
            );
          }

          // key-value
          return (
            <div
              key={idx}
              className="hover:bg-muted/30 rounded-sm -mx-1 px-1 pl-5"
            >
              {line.key && (
                <>
                  <code className="text-amber-600 dark:text-amber-400">
                    {line.key}
                  </code>
                  <span className="text-muted-foreground"> = </span>
                </>
              )}
              {line.value !== undefined && renderTomlValue(line.value)}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TomlBlock;
