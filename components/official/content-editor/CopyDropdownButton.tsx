// components/content-editor/CopyDropdownButton.tsx
"use client";

import React, { useState, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Copy, ChevronDown, FileCode2, FileText, Code, Brain } from "lucide-react";
import { copyRichContent, copyContent, type CopyFlavor } from "@/components/agent-copy/copy-commands";

import { Tile } from "@ai-matrx/design-system/controls";
interface CopyDropdownButtonProps {
  content: string;
  onCopySuccess?: () => void;
  onShowHtmlPreview?: (html: string) => void;
  className?: string;
}

export function CopyDropdownButton({
  content,
  onCopySuccess,
  onShowHtmlPreview,
  className = "",
}: CopyDropdownButtonProps) {
  const [showOptions, setShowOptions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Position the portaled menu relative to the trigger and keep it inside the viewport.
  useLayoutEffect(() => {
    if (!showOptions || !buttonRef.current) return undefined;

    const updatePosition = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const menuWidth = 224; // w-56
      const estimatedMenuHeight = 240;
      const margin = 8;

      const spaceBelow = window.innerHeight - rect.bottom;
      const placeAbove = spaceBelow < estimatedMenuHeight + margin;

      const top = placeAbove
        ? Math.max(margin, rect.top - estimatedMenuHeight - 4)
        : rect.bottom + 4;

      // Right-align to the button, but clamp to the viewport.
      let left = rect.right - menuWidth;
      if (left < margin) left = margin;
      if (left + menuWidth > window.innerWidth - margin) {
        left = window.innerWidth - menuWidth - margin;
      }

      setMenuStyle({ position: "fixed", top, left, width: menuWidth });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [showOptions]);

  const handleSuccess = () => {
    setCopied(true);
    setShowOptions(false);
    onCopySuccess?.();
    setTimeout(() => setCopied(false), 2000);
  };

  // THE one copy module (copy-commands.ts): Copy = formatted + markdown
  // (knob), then the two explicit flavors. "Google Docs" and "Microsoft Word"
  // wrote the same bytes as the formatted copy, so they are that one row.
  const copyAs = async (flavor: CopyFlavor) => {
    if (await copyRichContent(content, flavor)) handleSuccess();
  };

  const handleHtmlPreview = async () => {
    await copyContent(content, {
      isMarkdown: true,
      formatForWordPress: true,
      showHtmlPreview: true,
      onShowHtmlPreview: (html) => {
        onShowHtmlPreview?.(html);
        setShowOptions(false);
      },
      onSuccess: handleSuccess,
    });
  };

  const handleCopyWithThinking = async () => {
    if (await copyRichContent(content, "default", { includeThinking: true, toast: "Copied with thinking" })) handleSuccess();
  };

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        onClick={() => setShowOptions(!showOptions)}
        disabled={!content}
        className="flex items-center gap-1 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title={copied ? "Copied!" : "Copy"}
      >
        <Copy className="h-3.5 w-3.5" />
        {copied ? (
          <span className="type-secondary text-green-600 dark:text-green-400">
            Copied!
          </span>
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>

      {/* Dropdown — rendered in a portal so it never gets clipped by overflow ancestors */}
      {showOptions &&
        content &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-[9998]"
              onClick={() => setShowOptions(false)}
            />
            <div
              role="menu"
              style={menuStyle}
              className="z-[9999] bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg"
            >
              <Tile variant="quiet" icon={<Copy />} title="Copy" onClick={() => copyAs("default")} />
              <Tile variant="quiet" icon={<FileCode2 />} title="Copy markdown" onClick={() => copyAs("markdown")} />
              <Tile variant="quiet" icon={<FileText />} title="Copy text" onClick={() => copyAs("text")} />
              {onShowHtmlPreview && (
                <Tile variant="quiet" icon={<Code />} title="HTML" onClick={handleHtmlPreview} />
              )}
              <Tile variant="quiet" icon={<Brain />} title="With Thinking" onClick={handleCopyWithThinking} />
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
