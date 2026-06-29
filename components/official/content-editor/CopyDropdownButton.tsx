// components/content-editor/CopyDropdownButton.tsx
"use client";

import React, { useState, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Copy, ChevronDown, FileText, Code, Brain } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { FaMicrosoft } from "react-icons/fa";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";

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

  const handleCopyPlainText = async () => {
    await copyToClipboard(content, {
      isMarkdown: true,
      formatForGoogleDocs: false,
      onSuccess: handleSuccess,
    });
  };

  const handleCopyGoogleDocs = async () => {
    await copyToClipboard(content, {
      isMarkdown: true,
      formatForGoogleDocs: true,
      onSuccess: handleSuccess,
    });
  };

  const handleCopyMicrosoftWord = async () => {
    await copyToClipboard(content, {
      isMarkdown: true,
      formatForGoogleDocs: true,
      onSuccess: handleSuccess,
    });
  };

  const handleHtmlPreview = async () => {
    await copyToClipboard(content, {
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
    await copyToClipboard(content, {
      isMarkdown: true,
      formatForGoogleDocs: false,
      includeThinking: true,
      onSuccess: handleSuccess,
    });
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
          <span className="text-xs text-green-600 dark:text-green-400">
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
              <button
                onClick={handleCopyPlainText}
                className="flex items-center w-full px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors first:rounded-t-lg"
              >
                <FileText className="h-4 w-4 mr-2" />
                Plain Text
              </button>
              <button
                onClick={handleCopyGoogleDocs}
                className="flex items-center w-full px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors border-t border-zinc-100 dark:border-zinc-600"
              >
                <FcGoogle className="h-4 w-4 mr-2" />
                Google Docs
              </button>
              <button
                onClick={handleCopyMicrosoftWord}
                className="flex items-center w-full px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors border-t border-zinc-100 dark:border-zinc-600"
              >
                <FaMicrosoft className="h-4 w-4 mr-2 text-blue-500" />
                Microsoft Word
              </button>
              {onShowHtmlPreview && (
                <button
                  onClick={handleHtmlPreview}
                  className="flex items-center w-full px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors border-t border-zinc-100 dark:border-zinc-600"
                >
                  <Code className="h-4 w-4 mr-2 text-green-600" />
                  HTML
                </button>
              )}
              <button
                onClick={handleCopyWithThinking}
                className="flex items-center w-full px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors border-t border-zinc-100 dark:border-zinc-600 last:rounded-b-lg"
              >
                <Brain className="h-4 w-4 mr-2 text-purple-600" />
                With Thinking
              </button>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
