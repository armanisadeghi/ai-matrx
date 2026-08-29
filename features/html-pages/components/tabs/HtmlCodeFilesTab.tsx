"use client";

import React, { useMemo, useState } from "react";
import { RefreshCw, RotateCcw, AlertCircle } from "lucide-react";
import MultiFileCodeEditor, {
  CodeFile,
} from "@/features/code-editor/components/code-block/MultiFileCodeEditor";
import MultiFileCodeEditorV2 from "@/features/code-editor/multi-file-core/MultiFileCodeEditor";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { HtmlPreviewState, HtmlPreviewActions } from "../types";
import { formatMetadataAsJson } from "@/features/html-pages/utils/html-source-files-utils";
import {
  confirmRegenerateFromMarkdown,
  confirmResetToOriginal,
} from "@/features/html-pages/utils/confirm-destructive";

interface HtmlCodeFilesTabProps {
  state: HtmlPreviewState;
  actions: HtmlPreviewActions;
  isAgentSystem: boolean;
  user?: any;
}

/**
 * Multi-file code viewer and editor for HTML content - SOURCE FILES ARCHITECTURE
 *
 * SINGLE SOURCE OF TRUTH:
 * All files are source files that combine to create the final output.
 *
 * Source Files (EDITABLE):
 * - content.html: Body content only - the main HTML content
 * - wordpress.css: WordPress styling rules
 * - metadata.json: SEO and meta information
 *
 * Generated File (READ-ONLY):
 * - complete.html: Generated from source files above
 *
 * Architecture:
 * content.html + wordpress.css + metadata.json → complete.html
 *
 * LLM Integration:
 * When Claude modifies these files, changes are preserved and used for publishing.
 * No data is lost or ignored when generating the final page.
 */
export function HtmlCodeFilesTab({
  state,
  actions,
  isAgentSystem,
}: HtmlCodeFilesTabProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Generate complete HTML from source files
  const completeHtml = useMemo(() => {
    return actions.generateCompleteHtmlFromSources();
  }, [state.contentHtml, state.wordPressCSS, state.metadata]);

  const handleUpdate = async () => {
    // Regenerating from markdown overwrites content.html / CSS — only a
    // consequence when those were hand-edited, so only then does it ask.
    if (state.isContentDirty && !(await confirmRegenerateFromMarkdown())) {
      return;
    }
    setIsUpdating(true);
    setTimeout(() => {
      actions.handleUpdateFromMarkdown();
      setIsUpdating(false);
    }, 100);
  };

  const handleReset = async () => {
    const ok = await confirmResetToOriginal(state);
    if (!ok) return;
    setIsResetting(true);
    setTimeout(() => {
      actions.handleRefreshMarkdown();
      setIsResetting(false);
    }, 100);
  };

  const files: CodeFile[] = useMemo(
    () => [
      {
        name: "content.html",
        path: "source/content.html",
        language: "html",
        content: state.contentHtml,
        readOnly: false,
      },
      {
        name: "wordpress.css",
        path: "source/wordpress.css",
        language: "css",
        content: state.wordPressCSS,
        readOnly: false,
      },
      {
        name: "metadata.json",
        path: "source/metadata.json",
        language: "json",
        content: formatMetadataAsJson(state.metadata),
        readOnly: false,
      },
      {
        name: "complete.html",
        path: "output/complete.html",
        language: "html",
        content: completeHtml,
        readOnly: true, // Generated file, cannot be edited
      },
    ],
    [state.contentHtml, state.wordPressCSS, state.metadata, completeHtml],
  );

  const handleChange = (path: string, content: string) => {
    // Route changes to appropriate source file handlers
    switch (path) {
      case "source/content.html":
        actions.setContentHtml(content);
        break;
      case "source/wordpress.css":
        actions.setWordPressCSS(content);
        break;
      case "source/metadata.json":
        actions.setMetadataFromJson(content);
        break;
      case "output/complete.html":
        // Read-only, should not be editable
        console.warn("Attempted to edit read-only complete.html");
        break;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          {state.isMarkdownDirty && (
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-3 w-3" />
              <span>Markdown has changed</span>
            </div>
          )}
          {state.isContentDirty && (
            <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
              <AlertCircle className="h-3 w-3" />
              <span>Content manually edited</span>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleUpdate}
                  disabled={!state.isMarkdownDirty || isUpdating}
                  variant={state.isMarkdownDirty ? "default" : "outline"}
                  size="sm"
                  className="h-8 px-3"
                >
                  <RefreshCw
                    className={`h-4 w-4 mr-2 ${isUpdating ? "animate-spin" : ""}`}
                  />
                  Update from Markdown
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {state.isMarkdownDirty
                    ? "Regenerate source files from edited markdown"
                    : "Markdown hasn't changed"}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleReset}
                  disabled={isResetting}
                  variant="outline"
                  size="sm"
                  className="h-8 px-3"
                >
                  <RotateCcw
                    className={`h-4 w-4 mr-2 ${isResetting ? "animate-spin" : ""}`}
                  />
                  Reset All to Original
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Reset all files to initial markdown state</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* File Editor */}
      <div className="flex-1 overflow-hidden">
        {isAgentSystem ? (
          <MultiFileCodeEditorV2
            files={files}
            onChange={handleChange}
            showSidebar={true}
            autoFormatOnOpen={true}
            defaultWordWrap="on"
            height="100%"
          />
        ) : (
          <MultiFileCodeEditor
            files={files}
            onChange={handleChange}
            showSidebar={true}
            autoFormatOnOpen={true}
            defaultWordWrap="on"
            height="100%"
          />
        )}
      </div>
    </div>
  );
}
