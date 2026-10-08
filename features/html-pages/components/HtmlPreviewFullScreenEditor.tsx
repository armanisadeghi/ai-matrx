"use client";

import { FormatButtons } from "@ai-matrx/rich-editor/format/FormatButtons";
import { formatTargetWithin } from "@ai-matrx/rich-editor/format/format-target";
import React, { useState, useRef } from "react";
import FullScreenOverlay, {
  TabDefinition,
} from "@/components/official/FullScreenOverlay";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import type { HtmlPreviewState, HtmlPreviewActions } from "./types";
import RichEditor, { type RichEditorController } from "@ai-matrx/rich-editor/editor/RichEditor";
import { MarkdownPlainTextTab } from "./tabs/MarkdownPlainTextTab";
import { MarkdownPreviewTab } from "./tabs/MarkdownPreviewTab";
import { HtmlCodeFilesTab } from "./tabs/HtmlCodeFilesTab";
import { CustomCopyTab } from "./tabs/CustomCopyTab";
import { SavePageTab } from "./tabs/SavePageTab";
import { MatrxSplitTab } from "./tabs/MatrxSplitTab";
import { MarkdownWysiwygTab } from "./tabs/MarkdownWysiwygTab";
import { MarkdownSplitViewTab } from "./tabs/MarkdownSplitViewTab";
import { HtmlCodeTab } from "./tabs/HtmlCodeTab";
import { CompleteHtmlTab } from "./tabs/CompleteHtmlTab";
import { EditHtmlTab } from "./tabs/EditHtmlTab";

interface HtmlPreviewFullScreenEditorProps {
  isOpen: boolean;
  onClose: () => void;
  htmlPreviewState: HtmlPreviewState & HtmlPreviewActions;
  title?: string;
  description?: string;
  analysisData?: any;
  messageId?: string;
  onSave?: (markdownContent: string) => Promise<void>;
  showSaveButton?: boolean;
  isAgentSystem?: boolean;
}

/**
 * Complete HTML Preview Editor with Markdown editing
 * Integrates markdown editing tabs with HTML preview and management
 *
 * Tab Structure (11 tabs):
 * 1.  Source           — THE ONE EDITOR's source view (Markdown, live preview)
 * 2.  Write            — THE ONE EDITOR's visual view (formatted)
 * 3.  Plain            — Raw markdown textarea editor
 * 4.  Split            — Plain text left, the formatted result live right (opens here)
 * 5.  Preview          — Rendered markdown preview
 * 6.  HTML Files       — Multi-file source editor (content.html / wordpress.css / metadata.json / complete.html)
 * 7.  HTML Code        — Body-only HTML read-only textarea + copy buttons
 * 8.  Complete HTML    — Full document (with CSS) read-only textarea + copy
 * 9.  Edit HTML        — Monaco editor for the full HTML document
 * 10. Copy Options     — Custom copy helpers with formatting choices
 * 11. Publish          — Live preview + metadata editing + publish to html_pages
 */
export default function HtmlPreviewFullScreenEditor({
  isOpen,
  onClose,
  htmlPreviewState,
  title = "HTML Page Editor",
  description = "Edit markdown, preview and publish your HTML content",
  analysisData,
  messageId,
  onSave,
  showSaveButton = false,
  isAgentSystem = false,
}: HtmlPreviewFullScreenEditorProps) {
  const user = useAppSelector(selectUser);
  // Opens in Split — the plain text beside its live result (the notes default).
  const [activeTab, setActiveTab] = useState<string>("matrx-split");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // THE ONE EDITOR's controller (Source / Write tabs).
  const richEditorRef = useRef<RichEditorController | null>(null);
  const saveLockRef = useRef(false);
  const retrySaveRef = useRef<(() => Promise<void>) | null>(null);

  const richTabActive = activeTab === "markdown" || activeTab === "wysiwyg";

  // Leaving Source / Write delivers the editor's pending keystrokes first.
  const handleTabChange = (newTab: string) => {
    if (richTabActive && richEditorRef.current) {
      const markdown = richEditorRef.current.flush();
      if (markdown !== htmlPreviewState.currentMarkdown) {
        htmlPreviewState.setCurrentMarkdown(markdown);
      }
    }
    setActiveTab(newTab);
  };

  // Handle save callback
  const settleSave = async (operation: () => Promise<void>) => {
    if (saveLockRef.current) return;
    saveLockRef.current = true;
    retrySaveRef.current = operation;
    setIsSaving(true);
    setSaveError(null);
    try {
      await operation();
      onClose();
    } catch (error) {
      console.error("[HtmlPreviewFullScreenEditor] save failed", error);
      setSaveError(error instanceof Error ? error.message : "Save failed");
    } finally {
      saveLockRef.current = false;
      setIsSaving(false);
    }
  };

  const handleSave = () => {
    if (onSave) {
      // The one editor's text with pending keystrokes, when it is showing.
      const finalMarkdown =
        richTabActive && richEditorRef.current
          ? richEditorRef.current.flush()
          : htmlPreviewState.currentMarkdown;
      void settleSave(() => onSave(finalMarkdown));
    }
  };

  // Define tabs for the FullScreenOverlay
  const tabDefinitions: TabDefinition[] = [
    // 1. Source — THE ONE EDITOR's source view
    {
      id: "markdown",
      label: "Source",
      content: (
        <div data-format-scope="html-pages" className="contents">
        <MarkdownSplitViewTab
          state={htmlPreviewState}
          actions={htmlPreviewState}
          activeTab={activeTab}
          controllerRef={richEditorRef}
        />
        </div>
      ),
      className: "overflow-hidden p-0 bg-background",
    },
    // 2. Write — THE ONE EDITOR's visual view
    {
      id: "wysiwyg",
      label: "Write",
      content: (
        <div data-format-scope="html-pages" className="contents">
        <MarkdownWysiwygTab
          state={htmlPreviewState}
          actions={htmlPreviewState}
          activeTab={activeTab}
          controllerRef={richEditorRef}
        />
        </div>
      ),
      className: "overflow-hidden p-0 bg-background",
    },
    // 3. Plain text / raw markdown editor
    {
      id: "write",
      label: "Plain",
      content: (
        <div data-format-scope="html-pages" className="contents">
        <MarkdownPlainTextTab
          state={htmlPreviewState}
          actions={htmlPreviewState}
          analysisData={analysisData}
          messageId={messageId}
        />
        </div>
      ),
      className: "p-0",
    },
    // 4. Matrx split (custom split preview)
    {
      id: "matrx-split",
      label: "Split",
      content: (
        <div data-format-scope="html-pages" className="contents">
        <MatrxSplitTab state={htmlPreviewState} actions={htmlPreviewState} />
        </div>
      ),
      className: "p-0 overflow-hidden",
    },
    // 5. Rendered markdown preview
    {
      id: "preview",
      label: "Read",
      content: (
        <MarkdownPreviewTab
          state={htmlPreviewState}
          actions={htmlPreviewState}
          analysisData={analysisData}
          messageId={messageId}
        />
      ),
      className: "p-0",
    },
    // 6. Multi-file HTML/CSS/JSON source editor
    {
      id: "html-files",
      label: "HTML Files",
      content: (
        <HtmlCodeFilesTab
          state={htmlPreviewState}
          actions={htmlPreviewState}
          user={user}
          isAgentSystem={isAgentSystem}
        />
      ),
      className: "p-0 overflow-hidden",
    },
    // 7. Body-only HTML code view (read-only textarea with copy)
    {
      id: "html-code",
      label: "HTML Code",
      content: (
        <HtmlCodeTab state={htmlPreviewState} actions={htmlPreviewState} />
      ),
      className: "p-4",
    },
    // 8. Complete HTML file view (full document with embedded CSS)
    {
      id: "complete-html",
      label: "Complete HTML",
      content: (
        <CompleteHtmlTab state={htmlPreviewState} actions={htmlPreviewState} />
      ),
      className: "p-4",
    },
    // 9. Editable complete HTML (Monaco editor for full document)
    {
      id: "edit-html",
      label: "Edit HTML",
      content: (
        <EditHtmlTab state={htmlPreviewState} actions={htmlPreviewState} />
      ),
      className: "p-0 overflow-hidden",
    },
    // 10. Copy options with various formatting choices
    {
      id: "custom",
      label: "Copy Options",
      content: (
        <CustomCopyTab
          state={htmlPreviewState}
          actions={htmlPreviewState}
          user={user}
        />
      ),
      className: "p-4",
    },
    // 11. Publish tab
    {
      id: "save",
      label: "Publish",
      content: (
        <SavePageTab
          state={htmlPreviewState}
          actions={htmlPreviewState}
          user={user}
        />
      ),
      className: "p-4",
    },
  ];

  return (
    <FullScreenOverlay
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={description}
      tabs={tabDefinitions}
      initialTab={activeTab}
      onTabChange={handleTabChange}
      showSaveButton={showSaveButton}
      onSave={handleSave}
      showCancelButton={true}
      onCancel={onClose}
      footerLeading={
        // THE formatting toolbar in every editable tab (Source, Write, Plain, Split) — the footer row.
        activeTab !== "preview" ? (
          <FormatButtons className="flex-1" resolve={() => visibleScopeTarget("html-pages")} />
        ) : null
      }
      hideTitle={true}
      isPending={isSaving}
      pendingMessage="Saving changes…"
      errorMessage={saveError}
      onRetry={saveError ? () => {
        const retry = retrySaveRef.current;
        if (retry) void settleSave(retry);
      } : undefined}
    />
  );
}

/** The editor inside the visible tab carrying this format scope (tabs may stay mounted while hidden). */
function visibleScopeTarget(scope: string) {
  if (typeof document === "undefined") return null;
  const scopes = Array.from(document.querySelectorAll<HTMLElement>(`[data-format-scope="${scope}"]`));
  for (const el of scopes) {
    const host = el.querySelector<HTMLElement>("[data-format-host]");
    if (host && host.getClientRects().length > 0) return formatTargetWithin(el);
  }
  return null;
}
