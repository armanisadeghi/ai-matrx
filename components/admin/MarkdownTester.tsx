"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_UTILITIES_SURFACE_NAME,
  createAdminUtilitiesScope,
} from "@/features/surfaces/manifests/admin-utilities.manifest";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import MarkdownStream from "@/components/MarkdownStream";
import { AudioTestModal } from "@/components/admin/AudioTestModal";
import {
  FileText,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  RefreshCw,
  Zap,
  Hand,
  Volume2,
  Waves,
  Cpu,
  Link,
  Unlink,
  Braces,
  Copy,
  GitCompare,
} from "lucide-react";
import { useMarkdownAutosave } from "./markdown-tester/useMarkdownAutosave";
import { SampleManager } from "./markdown-tester/SampleManager";
import { BlockParserComparison } from "./markdown-tester/BlockParserComparison";
import type { MarkdownSample } from "./markdown-tester/samples-service";
// Shared rich-content lab pieces — the Markdown Studio renders the same ones.
import { SpeechTextPanel } from "@/components/markdown-studio/lab/SpeechTextPanel";
import { BlockProcessingPanel } from "@/components/markdown-studio/lab/BlockProcessingPanel";
import { JsonExtractionPanel } from "@/components/markdown-studio/lab/JsonExtractionPanel";
import { syncPaneScroll } from "@/components/markdown-studio/lab/sync-scroll";

// context-menu-exempt: entity — an admin scratch tool for testing markdown rendering — the pad holds no record, so there is nothing to attach or share

interface MarkdownTesterProps {
  className?: string;
}

const SAMPLE_CONTENT = ``;

const MarkdownTester: React.FC<MarkdownTesterProps> = ({ className }) => {
  const [inputContent, setInputContent] = useState(SAMPLE_CONTENT);
  const [manualRenderedContent, setRenderedContent] = useState(SAMPLE_CONTENT);
  const [showPreview, setShowPreview] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState("enhanced-markdown");
  const [audioModalOpen, setAudioModalOpen] = useState(false);
  const [syncScroll, setSyncScroll] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingRef = useRef(false);

  const [loadedSampleId, setLoadedSampleId] = useState<string | null>(null);
  const { loadAutosave } = useMarkdownAutosave("admin-tester", inputContent);

  useEffect(() => {
    loadAutosave().then((saved) => {
      if (saved) {
        setInputContent(saved);
        setRenderedContent(saved);
      }
    });
  }, [loadAutosave]);

  const handleLoadSample = useCallback((sample: MarkdownSample) => {
    setInputContent(sample.content);
    setRenderedContent(sample.content);
    setLoadedSampleId(sample.id);
  }, []);

  const handleLoadAutosave = useCallback(async () => {
    const content = await loadAutosave();
    if (content !== null) {
      setInputContent(content);
      setRenderedContent(content);
      setLoadedSampleId(null);
    }
  }, [loadAutosave]);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
  }, []);

  const getTextarea = useCallback(() => textareaRef.current, []);

  // Auto mode renders the live input; manual mode renders the last Update.
  const renderedContent = isAutoMode ? inputContent : manualRenderedContent;

  const handleManualUpdate = useCallback(() => {
    setIsUpdating(true);
    // Small delay to show the updating state
    setTimeout(() => {
      setRenderedContent(inputContent);
      setIsUpdating(false);
    }, 100);
  }, [inputContent]);

  const toggleUpdateMode = useCallback(() => {
    const newAutoMode = !isAutoMode;
    setIsAutoMode(newAutoMode);

    // If switching to auto mode, immediately sync the content
    if (newAutoMode) {
      setRenderedContent(inputContent);
    }
  }, [isAutoMode, inputContent]);

  const handleCopyInput = useCallback(() => {
    navigator.clipboard.writeText(inputContent);
  }, [inputContent]);

  const handleClear = useCallback(() => {
    setInputContent("");
    setLoadedSampleId(null);
  }, []);

  const handleContentInserted = useCallback(() => {
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  }, []);

  const handleTextareaScroll = useCallback(() => {
    if (!syncScroll || isSyncingRef.current) return;
    const ta = textareaRef.current;
    const preview = previewScrollRef.current;
    if (!ta || !preview) return;
    isSyncingRef.current = true;
    syncPaneScroll({ text: renderedContent, textarea: ta, preview, direction: "text-to-preview" });
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  }, [syncScroll, renderedContent]);

  const handlePreviewScroll = useCallback(() => {
    if (!syncScroll || isSyncingRef.current) return;
    const ta = textareaRef.current;
    const preview = previewScrollRef.current;
    if (!ta || !preview) return;
    isSyncingRef.current = true;
    syncPaneScroll({ text: renderedContent, textarea: ta, preview, direction: "preview-to-text" });
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  }, [syncScroll, renderedContent]);

  useEffect(() => {
    const ta = textareaRef.current;
    const preview = previewScrollRef.current;
    if (!syncScroll || !ta || !preview) return undefined;

    ta.addEventListener("scroll", handleTextareaScroll, { passive: true });
    preview.addEventListener("scroll", handlePreviewScroll, { passive: true });

    return () => {
      ta.removeEventListener("scroll", handleTextareaScroll);
      preview.removeEventListener("scroll", handlePreviewScroll);
    };
  }, [syncScroll, handleTextareaScroll, handlePreviewScroll]);

  const containerClasses = isFullScreen
    ? "fixed inset-0 z-50 bg-textured"
    : `h-dvh flex flex-col ${className || ""}`;

  // Calculate available height considering external header (assuming ~64px for typical header)
  const availableHeight = isFullScreen ? "100dvh" : "calc(100dvh - 64px)";

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_UTILITIES_SURFACE_NAME}
      getScope={() =>
        createAdminUtilitiesScope({
          utilities_section: "markdown_tester",
          markdown_tester_input: inputContent,
          markdown_tester_extraction_config: {
            activeTab,
            showPreview,
            isAutoMode,
            syncScroll,
          },
        })
      }
    >
      <>
        {isFullScreen && (
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        )}

        <div className={containerClasses} style={{ height: availableHeight }}>
          {/* Fixed Header Section */}
          <div className="flex-shrink-0 bg-textured border-b border-border px-4 py-2">
            {/* Title and Main Controls */}
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-base font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Markdown Content Tester
              </h1>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPreview(!showPreview)}
                  className="h-7 px-2"
                >
                  {showPreview ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  <span className="ml-1.5 text-xs">
                    {showPreview ? "Hide" : "Show"}
                  </span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  className="h-7 px-2"
                >
                  {isFullScreen ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                  <span className="ml-1.5 text-xs">
                    {isFullScreen ? "Exit" : "Fullscreen"}
                  </span>
                </Button>
              </div>
            </div>

            {/* Action Controls */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Update Mode Toggle */}
              <Button
                variant={isAutoMode ? "default" : "outline"}
                size="sm"
                onClick={toggleUpdateMode}
                className="h-7 px-2.5 text-xs"
              >
                {isAutoMode ? (
                  <>
                    <Zap className="h-3.5 w-3.5 mr-1.5" />
                    Auto
                  </>
                ) : (
                  <>
                    <Hand className="h-3.5 w-3.5 mr-1.5" />
                    Manual
                  </>
                )}
              </Button>

              {/* Manual Update Button - only show in manual mode */}
              {!isAutoMode && (
                <Button
                  onClick={handleManualUpdate}
                  disabled={isUpdating}
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 mr-1.5 ${isUpdating ? "animate-spin" : ""}`}
                  />
                  {isUpdating ? "Updating..." : "Update"}
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyInput}
                className="h-7 px-2.5 text-xs"
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copy
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                className="h-7 px-2.5 text-xs"
              >
                Clear
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setAudioModalOpen(true)}
                className="h-7 px-2.5 text-xs"
              >
                <Volume2 className="h-3.5 w-3.5 mr-1.5" />
                Test Audio
              </Button>

              <SampleManager
                currentContent={inputContent}
                loadedSampleId={loadedSampleId}
                onLoad={handleLoadSample}
                onLoadAutosave={handleLoadAutosave}
              />

              {showPreview && activeTab === "enhanced-markdown" && (
                <div className="flex items-center gap-1.5 border rounded-md px-2 py-0.5 bg-muted/50">
                  {syncScroll ? (
                    <Link className="h-3 w-3 text-primary" />
                  ) : (
                    <Unlink className="h-3 w-3 text-muted-foreground" />
                  )}
                  <Label
                    htmlFor="sync-scroll"
                    className="text-xs cursor-pointer select-none"
                  >
                    Sync Scroll
                  </Label>
                  <Switch
                    id="sync-scroll"
                    checked={syncScroll}
                    onCheckedChange={setSyncScroll}
                  />
                </div>
              )}

              <div className="ml-auto flex items-center gap-1.5">
                <Badge variant="secondary" className="text-xs h-6">
                  {inputContent.length} chars
                </Badge>
                <Badge variant="secondary" className="text-xs h-6">
                  {inputContent.split("\n").length} lines
                </Badge>
              </div>
            </div>
          </div>

          {/* Main Content Area with Independent Scrolling */}
          <div
            className={`flex-1 flex gap-3 p-3 min-h-0 ${showPreview ? "" : "justify-center"}`}
          >
            {/* Input Column */}
            <div
              className={`flex flex-col min-h-0 ${showPreview ? "w-1/2" : "w-full max-w-4xl"}`}
            >
              <div className="flex items-center gap-2 mb-2 flex-shrink-0">
                <h3 className="text-sm font-medium">Input Content</h3>
                <Badge variant="outline" className="text-xs">
                  Markdown/JSON
                </Badge>
              </div>

              <div className="flex-1 min-h-0 border rounded-lg bg-textured border-gray-200 dark:border-gray-700 overflow-hidden">
                <EditableContextMenu
                  sourceFeature="documents"
                  surfaceName={ADMIN_UTILITIES_SURFACE_NAME}
                  contentSource={{ type: "raw" }}
                  getApplicationScope={() =>
                    createAdminUtilitiesScope({
                      utilities_section: "markdown_tester",
                      markdown_tester_input: inputContent,
                      markdown_tester_extraction_config: {
                        activeTab,
                        showPreview,
                        isAutoMode,
                                    syncScroll,
                      },
                    })
                  }
                  getTextarea={getTextarea}
                  onContentInserted={handleContentInserted}
                  onTextReplace={(text) => setInputContent(text)}
                  onTextInsertBefore={(text) =>
                    setInputContent(`${text}${inputContent}`)
                  }
                  onTextInsertAfter={(text) =>
                    setInputContent(`${inputContent}${text}`)
                  }
                >
                  <textarea
                    ref={textareaRef}
                    value={inputContent}
                    onChange={(e) => setInputContent(e.target.value)}
                    className="w-full h-full p-3 font-mono text-sm resize-none focus:outline-none bg-transparent text-gray-900 dark:text-gray-100 border-0 overflow-y-auto"
                    placeholder="Enter your markdown, JSON, or mixed content here... Right-click for content blocks and AI actions."
                    spellCheck={false}
                  />
                </EditableContextMenu>
              </div>
            </div>

            {/* Preview Column */}
            {showPreview && (
              <>
                <Separator orientation="vertical" className="self-stretch" />
                <div className="flex flex-col min-h-0 w-1/2">
                  <div className="flex items-center gap-2 mb-2 flex-shrink-0">
                    <h3 className="text-sm font-medium">Rendered Output</h3>
                    <Tabs
                      value={activeTab}
                      onValueChange={handleTabChange}
                      className="flex-1"
                    >
                      <div className="flex items-center gap-2">
                        <TabsList className="h-7">
                          <TabsTrigger
                            value="enhanced-markdown"
                            className="text-xs h-6 px-2.5"
                          >
                            Markdown
                          </TabsTrigger>
                          <TabsTrigger
                            value="speech-text"
                            className="text-xs h-6 px-2.5"
                          >
                            Speech
                          </TabsTrigger>
                          <TabsTrigger
                            value="json"
                            className="text-xs h-6 px-2.5 flex items-center gap-1"
                          >
                            <Cpu className="h-3 w-3" />
                            JSON
                          </TabsTrigger>
                          <TabsTrigger
                            value="stream"
                            className="text-xs h-6 px-2.5 flex items-center gap-1"
                          >
                            <Waves className="h-3 w-3" />
                            Stream
                          </TabsTrigger>
                          <TabsTrigger
                            value="json-extract"
                            className="text-xs h-6 px-2.5 flex items-center gap-1"
                          >
                            <Braces className="h-3 w-3" />
                            JSON Extract
                          </TabsTrigger>
                          <TabsTrigger
                            value="analysis"
                            className="text-xs h-6 px-2.5 flex items-center gap-1"
                          >
                            <GitCompare className="h-3 w-3" />
                            Analysis
                          </TabsTrigger>
                        </TabsList>
                        <div className="ml-auto flex items-center gap-1.5">
                          <Badge variant="outline" className="text-xs h-5">
                            {isAutoMode ? "Auto" : "Manual"}
                          </Badge>
                        </div>
                      </div>
                    </Tabs>
                  </div>

                  <div className="flex-1 border rounded-lg bg-textured border-gray-200 dark:border-gray-700 min-h-0 flex flex-col overflow-hidden">
                    {activeTab === "enhanced-markdown" && (
                      <div
                        className="flex-1 overflow-auto p-3"
                        ref={previewScrollRef}
                      >
                        <MarkdownStream imagePolicy="self"
                          content={renderedContent}
                          isStreamActive={false}
                          hideCopyButton={true}
                          allowFullScreenEditor={true}
                        />
                      </div>
                    )}

                    {activeTab === "speech-text" && (
                      <SpeechTextPanel content={renderedContent} />
                    )}

                    {(activeTab === "json" || activeTab === "stream") && (
                      <BlockProcessingPanel
                        mode={activeTab}
                        content={renderedContent}
                      />
                    )}

                    {activeTab === "json-extract" && (
                      <JsonExtractionPanel content={renderedContent} />
                    )}

                    {activeTab === "analysis" && (
                      <BlockParserComparison
                        currentContent={renderedContent}
                        loadedSampleId={loadedSampleId}
                      />
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Audio Test Modal */}
        <AudioTestModal
          open={audioModalOpen}
          onOpenChange={setAudioModalOpen}
          markdownContent={renderedContent}
        />
      </>
    </SurfaceRuntimeProvider>
  );
};

export default MarkdownTester;
