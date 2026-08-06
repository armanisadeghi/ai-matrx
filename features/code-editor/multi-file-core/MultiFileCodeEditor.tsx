"use client";

/**
 * MultiFileCodeEditor (standalone wrapper)
 *
 * Drop-in replacement for the original component. Adds its own sidebar +
 * drag-handle and delegates all editor rendering to MultiFileCodeEditorBody.
 *
 * For the floating-window variant see:
 *   features/window-panels/windows/code/CodeEditorWindow.tsx
 */

import { useRef } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMeasure } from "@/hooks/usehooks";

import { useCodeEditorBasics } from "./useCodeEdiorBasics";
import { MultiFileCodeEditorBody } from "./MultiFileCodeEditorBody";
import CodeSidebar from "./CodeSidebar";
import { CodeFile } from "./types";

interface MultiFileCodeEditorV2Props {
  files: CodeFile[];
  onChange?: (path: string, content: string) => void;
  onFileSelect?: (path: string) => void;
  runCode?: () => void;
  autoFormatOnOpen?: boolean;
  defaultWordWrap?: "on" | "off";
  showSidebar?: boolean;
  height?: string;
}

export default function MultiFileCodeEditorV2({
  files,
  onChange,
  onFileSelect,
  runCode,
  autoFormatOnOpen = false,
  defaultWordWrap = "off",
  showSidebar: initialShowSidebar = true,
  height = "600px",
}: MultiFileCodeEditorV2Props) {
  // Measures the outer container for a fallback pixel height when Monaco's
  // wrapper hasn't been measured yet.
  const [ref, { height: measuredHeight }] = useMeasure();

  const hookResult = useCodeEditorBasics({
    files,
    onChange,
    onFileSelect,
    runCode,
    autoFormatOnOpen,
    defaultWordWrap,
    showSidebar: initialShowSidebar,
    height,
  });

  const containerRef = useRef<HTMLDivElement>(null);

  if (!hookResult) return null;

  const {
    editorWrapperRef,
    editorWrapperHeight,
    activeFile,
    sidebarVisible,
    sidebarWidth,
    setSidebarVisible,
    handleDragStart,
    handleFileSelect,
    currentFile,
    code,
    monacoLanguage,
    monacoFileExtension,
    editorPath,
    isEditing,
    isFullScreen,
    isCollapsed,
    isCopied,
    lineNumbers,
    showWrapLines,
    minimapEnabled,
    isCreatingPage,
    formatTrigger,
    handleContentChange,
    handleCopy,
    handleDownload,
    toggleEdit,
    toggleFullScreen,
    toggleCollapse,
    toggleLineNumbers,
    toggleWrapLines,
    handleFormat,
    handleReset,
    toggleMinimap,
    handleViewHTML,
    isCompleteHTMLDocument,
  } = hookResult;

  const useParentHeight = height === "100%";

  // Monaco needs an explicit pixel height — it's a canvas-based editor that
  // won't fill a flex container via CSS alone.
  const editorHeight = editorWrapperHeight
    ? `${editorWrapperHeight}px`
    : useParentHeight
      ? undefined
      : measuredHeight
        ? `${measuredHeight - 48}px`
        : "500px";

  return (
    <div
      ref={containerRef}
      className={cn(
        "w-full rounded-lg overflow-hidden transition-all duration-300 ease-in-out",
        isFullScreen &&
          "fixed left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[95%] h-[90%] z-50 bg-background flex flex-col shadow-2xl",
      )}
      style={{
        height: isFullScreen ? undefined : height,
        opacity: isFullScreen ? 1 : undefined,
        transform: isFullScreen ? "translate(-50%, -50%) scale(1)" : undefined,
        transition:
          "opacity 300ms ease-in-out, transform 300ms ease-in-out, width 300ms ease-in-out, height 300ms ease-in-out",
      }}
    >
      <div
        ref={ref}
        className={cn("flex h-full", isFullScreen && "flex-1 overflow-hidden")}
      >
        {/* Pure CSS flex split — no library, safe inside dialogs and tabs */}
        <div className="flex h-full w-full overflow-hidden">
          {/* File Sidebar */}
          {sidebarVisible && (
            <CodeSidebar
              files={files}
              activeFile={activeFile}
              handleFileSelect={handleFileSelect}
              sidebarWidth={sidebarWidth}
            />
          )}

          {/* Drag Handle */}
          {sidebarVisible && (
            <div
              onMouseDown={handleDragStart}
              className="w-1 flex-shrink-0 h-full bg-gray-300 dark:bg-gray-700 hover:bg-blue-400 dark:hover:bg-blue-500 cursor-col-resize flex items-center justify-center group transition-colors"
              title="Drag to resize"
            >
              <GripVertical className="h-4 w-4 text-gray-400 dark:text-gray-500 group-hover:text-blue-500 dark:group-hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </div>
          )}

          {/* Editor area */}
          <MultiFileCodeEditorBody
            currentFile={currentFile}
            code={code}
            monacoLanguage={monacoLanguage}
            monacoFileExtension={monacoFileExtension}
            editorPath={editorPath}
            isEditing={isEditing}
            isFullScreen={isFullScreen}
            isCollapsed={isCollapsed}
            isCopied={isCopied}
            lineNumbers={lineNumbers}
            showWrapLines={showWrapLines}
            minimapEnabled={minimapEnabled}
            isCreatingPage={isCreatingPage}
            formatTrigger={formatTrigger}
            handleContentChange={handleContentChange}
            handleCopy={handleCopy}
            handleDownload={handleDownload}
            toggleEdit={toggleEdit}
            toggleFullScreen={toggleFullScreen}
            toggleCollapse={toggleCollapse}
            toggleLineNumbers={toggleLineNumbers}
            toggleWrapLines={toggleWrapLines}
            handleFormat={handleFormat}
            handleReset={handleReset}
            toggleMinimap={toggleMinimap}
            handleViewHTML={handleViewHTML}
            isCompleteHTMLDocument={isCompleteHTMLDocument}
            sidebarVisible={sidebarVisible}
            onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
            runCode={runCode}
            autoFormatOnOpen={autoFormatOnOpen}
            defaultWordWrap={defaultWordWrap}
            editorWrapperRef={editorWrapperRef}
            editorHeight={editorHeight}
          />
        </div>
      </div>
    </div>
  );
}
