"use client";
import { useState, useCallback, useRef } from "react";
import SmallCodeEditor from "./SmallCodeEditor";
import CodeBlockHeader from "@/features/code-editor/components/code-block/CodeBlockHeader";
import { languageMap } from "@/features/code-editor/components/code-block/LanguageDisplay";
import { Folder, PanelLeftClose, PanelLeft, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useMeasure } from "@uidotdev/usehooks";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { HTMLPageService } from "@/features/html-pages/services/htmlPageService";
import { SmartCodeEditorModal } from "@/features/code-editor/agent-code-editor/components/SmartCodeEditorModal";
import { agentForPromptKey } from "@/features/code-editor/agent-code-editor/agents";
import {
  mapLanguageForMonaco,
  getMonacoFileExtension,
} from "@/features/code-editor/config/languages";

type AIModalConfig = {
  version: "v2" | "v3";
  builtinId: string;
  title: string;
};

export interface CodeFile {
  name: string;
  path: string;
  language: string;
  content: string;
  icon?: React.ReactNode;
  readOnly?: boolean;
}

interface MultiFileCodeEditorProps {
  files: CodeFile[];
  onChange?: (path: string, content: string) => void;
  onFileSelect?: (path: string) => void;
  runCode?: () => void;
  autoFormatOnOpen?: boolean;
  defaultWordWrap?: "on" | "off";
  showSidebar?: boolean;
  height?: string;
}

export default function MultiFileCodeEditor({
  files,
  onChange,
  onFileSelect,
  runCode,
  autoFormatOnOpen = false,
  defaultWordWrap = "off",
  showSidebar: initialShowSidebar = true,
  height = "600px",
}: MultiFileCodeEditorProps) {
  const [ref, { height: measuredHeight }] = useMeasure();
  // Measures the exact height of the Monaco editor wrapper div so we can give
  // Monaco an explicit pixel height regardless of toolbar visibility.
  const [editorWrapperRef, { height: editorWrapperHeight }] =
    useMeasure<HTMLDivElement>();
  const [activeFile, setActiveFile] = useState<string>(files[0]?.path || "");
  const [sidebarVisible, setSidebarVisible] = useState(initialShowSidebar);
  // Sidebar width in pixels — draggable via mouse
  const [sidebarWidth, setSidebarWidth] = useState(180);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  // Use height prop from parent (e.g. "100%") when available, otherwise fall back
  // to the measured container height minus the tab bar. This prevents Monaco from
  // overflowing its flex container before the first useMeasure cycle completes.
  const useParentHeight = height === "100%";

  // CodeBlock-like state management
  const [isCopied, setIsCopied] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [lineNumbers, setLineNumbers] = useState(false);
  const [showWrapLines, setShowWrapLines] = useState(false);
  const [minimapEnabled, setMinimapEnabled] = useState(false);
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  const [formatTrigger, setFormatTrigger] = useState(0);
  const [aiModalConfig, setAiModalConfig] = useState<AIModalConfig | null>(
    null,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const mode = useAppSelector((s) => s.theme.mode);
  const isMobile = useIsMobile();
  const user = useAppSelector(selectUser);
  const { open: openCanvas } = useCanvas();

  // Pure CSS drag handler — no library dependency, safe inside dialogs/tabs
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      dragStartX.current = e.clientX;
      dragStartWidth.current = sidebarWidth;

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        const delta = ev.clientX - dragStartX.current;
        const newWidth = Math.min(
          400,
          Math.max(120, dragStartWidth.current + delta),
        );
        setSidebarWidth(newWidth);
      };
      const onMouseUp = () => {
        isDragging.current = false;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [sidebarWidth],
  );

  // Safe fallback: if no file matches activeFile, fall back to first file
  const currentFile = files.find((f) => f.path === activeFile) ?? files[0];

  // Guard: nothing to render if files is empty
  if (!currentFile) return null;

  const code = currentFile.content;
  const monacoLanguage = mapLanguageForMonaco(currentFile.language);
  const monacoFileExtension = getMonacoFileExtension(currentFile.language);

  // Ensure the path has the correct extension for Monaco to recognize TSX/JSX properly
  const getProperPath = (file: CodeFile): string => {
    const ext = monacoFileExtension || getMonacoFileExtension(file.language);
    if (ext) {
      // If we have a specific extension for TSX/JSX, ensure the path uses it
      const pathWithoutExt = file.path.replace(/\.[^.]+$/, "");
      return `${pathWithoutExt}${ext}`;
    }
    return file.path;
  };

  const editorPath = getProperPath(currentFile);

  // Monaco needs an explicit pixel height — it's a canvas-based editor that won't
  // fill a flex container via CSS alone. We measure the exact wrapper div height
  // and pass it directly, bypassing any guesswork about toolbar height.
  const tabBarHeight = 48;
  const editorHeight = editorWrapperHeight
    ? `${editorWrapperHeight}px`
    : useParentHeight
      ? undefined
      : measuredHeight
        ? `${measuredHeight - tabBarHeight}px`
        : "500px";

  const handleFileSelect = useCallback(
    (path: string) => {
      setActiveFile(path);
      onFileSelect?.(path);
    },
    [onFileSelect],
  );

  const handleContentChange = useCallback(
    (content: string | undefined) => {
      if (content !== undefined && activeFile) {
        onChange?.(activeFile, content);
      }
    },
    [activeFile, onChange],
  );

  // CodeBlock-like handlers
  const handleCopy = async (
    e: React.MouseEvent,
    withLineNumbers: boolean = false,
  ) => {
    e.stopPropagation();
    let textToCopy = code;

    if (withLineNumbers) {
      const lines = code.split("\n");
      const paddedLines = lines.map((line, index) => {
        const lineNumber = (index + 1)
          .toString()
          .padStart(lines.length.toString().length, " ");
        return `${lineNumber} | ${line}`;
      });
      textToCopy = paddedLines.join("\n");
    }

    await navigator.clipboard.writeText(textToCopy);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const blob = new Blob([code], { type: "text/plain" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = currentFile.name;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const toggleLineNumbers = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLineNumbers(!lineNumbers);
  };

  const toggleWrapLines = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowWrapLines(!showWrapLines);
  };

  const toggleFullScreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFullScreen) {
      document.body.style.overflow = "auto";
      setTimeout(() => {
        setIsFullScreen(false);
        setIsCollapsed(false);
      }, 150);
    } else {
      document.body.style.overflow = "hidden";
      setIsFullScreen(true);
      if (isCollapsed) setIsCollapsed(false);
    }
  };

  const toggleCollapse = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isEditing) return;
    setIsCollapsed(!isCollapsed);
    if (isFullScreen) setIsFullScreen(false);
  };

  const toggleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(!isEditing);
    if (!isEditing) {
      setIsCollapsed(false);
    }
  };

  const handleFormat = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isEditing) return;
    setFormatTrigger((prev) => prev + 1);
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isEditing) return;
    // Reset to original file content
    const originalFile = files.find((f) => f.path === activeFile);
    if (originalFile) {
      onChange?.(activeFile, originalFile.content);
    }
  };

  const toggleMinimap = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMinimapEnabled(!minimapEnabled);
  };

  const handleOpenAIModal = (config: AIModalConfig) => {
    setAiModalConfig(config);
  };

  const handleCloseAIModal = () => {
    setAiModalConfig(null);
  };

  const handleAICodeChange = (newCode: string, _fileId: string | null) => {
    onChange?.(activeFile, newCode);
  };

  // Function to detect if code is a complete HTML document
  const isCompleteHTMLDocument = (htmlCode: string): boolean => {
    if (!htmlCode || monacoLanguage !== "html") return false;

    const trimmedCode = htmlCode.trim();
    const hasDoctype = /^\s*<!DOCTYPE\s+html/i.test(trimmedCode);
    const hasHtmlTag =
      /<html[^>]*>/i.test(trimmedCode) && /<\/html>/i.test(trimmedCode);
    const hasHead =
      /<head[^>]*>/i.test(trimmedCode) && /<\/head>/i.test(trimmedCode);
    const hasBody =
      /<body[^>]*>/i.test(trimmedCode) && /<\/body>/i.test(trimmedCode);

    return hasDoctype && hasHtmlTag && hasHead && hasBody;
  };

  // Function to handle HTML document viewing in canvas
  const handleViewHTML = async () => {
    if (!user?.id) {
      alert("You must be logged in to view HTML pages");
      return;
    }

    setIsCreatingPage(true);
    try {
      const result = await HTMLPageService.createPage(
        code,
        currentFile.name,
        "Generated from multi-file editor",
        user.id,
      );

      openCanvas({
        type: "iframe",
        data: result.url,
        metadata: {
          title: currentFile.name,
        },
      });
    } catch (error) {
      console.error("Failed to create HTML page:", error);
      alert(`Failed to create HTML page: ${error.message}`);
    } finally {
      setIsCreatingPage(false);
    }
  };

  // Get the language icon from LanguageDisplay
  const getLanguageIcon = (file: CodeFile, compact = false) => {
    if (file.icon) return file.icon;

    const normalizedLang = file.language.toLowerCase();
    const langInfo = languageMap[normalizedLang] || languageMap["code"];
    const Icon = langInfo.icon;
    const size = compact ? 14 : 16;

    // Handle custom icons like Python that don't need size prop
    if (langInfo.size === null) {
      return <Icon className={cn(langInfo.color)} />;
    }

    return <Icon size={size} className={cn(langInfo.color)} />;
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "w-full rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700 transition-all duration-300 ease-in-out",
        isFullScreen &&
          "fixed left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[95%] h-[90%] z-50 bg-textured flex flex-col shadow-2xl",
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
        {sidebarVisible ? (
          /* Pure CSS flex split — no library, safe inside dialogs and tabs */
          <div className="flex h-full w-full overflow-hidden">
            {/* File Sidebar */}
            <div
              className="flex-shrink-0 h-full bg-gray-50 dark:bg-gray-900 border-r border-gray-300 dark:border-gray-700 overflow-y-auto flex flex-col"
              style={{ width: sidebarWidth }}
            >
              {/* VS Code-style compact header */}
              <div className="px-2 py-1 border-b border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  <Folder className="h-3.5 w-3.5" />
                  Explorer
                </div>
              </div>
              {/* VS Code-style compact file list */}
              <div className="py-0.5 flex-1 overflow-y-auto">
                {files.map((file) => (
                  <button
                    key={file.path}
                    onClick={() => handleFileSelect(file.path)}
                    className={cn(
                      "w-full flex items-center gap-1.5 px-2 py-0.5 text-xs transition-colors",
                      "hover:bg-gray-200 dark:hover:bg-gray-800",
                      activeFile === file.path
                        ? "bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        : "text-gray-700 dark:text-gray-300",
                    )}
                  >
                    {getLanguageIcon(file, true)}
                    <span className="truncate">{file.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Drag Handle */}
            <div
              onMouseDown={handleDragStart}
              className="w-1 flex-shrink-0 h-full bg-gray-300 dark:bg-gray-700 hover:bg-blue-400 dark:hover:bg-blue-500 cursor-col-resize flex items-center justify-center group transition-colors"
              title="Drag to resize"
            >
              <GripVertical className="h-4 w-4 text-gray-400 dark:text-gray-500 group-hover:text-blue-500 dark:group-hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </div>

            {/* Editor Area */}
            <div className="flex-1 min-w-0 h-full flex flex-col">
              {/* Custom File Tab with CodeBlock Header */}
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-300 dark:border-gray-700 flex-shrink-0">
                {/* Left: Sidebar Toggle + File Info */}
                <div className="flex items-center gap-2 min-w-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSidebarVisible(false)}
                    className="h-6 w-6 p-0 flex-shrink-0 hover:bg-gray-200 dark:hover:bg-gray-700"
                    title="Hide sidebar"
                  >
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  </Button>
                  {getLanguageIcon(currentFile)}
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                    {currentFile.name}
                  </span>
                </div>

                {/* Right: Header Controls (without language display) */}
                <div className="flex-shrink-0">
                  <CodeBlockHeader
                    language={currentFile.language}
                    linesCount={code.split("\n").length}
                    isEditing={isEditing}
                    isFullScreen={isFullScreen}
                    isCollapsed={isCollapsed}
                    code={code}
                    handleCopy={handleCopy}
                    handleDownload={handleDownload}
                    toggleEdit={toggleEdit}
                    toggleFullScreen={toggleFullScreen}
                    toggleCollapse={toggleCollapse}
                    toggleLineNumbers={toggleLineNumbers}
                    toggleWrapLines={toggleWrapLines}
                    isCopied={isCopied}
                    isMobile={isMobile}
                    isCompleteHTML={isCompleteHTMLDocument(code)}
                    handleViewHTML={handleViewHTML}
                    isCreatingPage={isCreatingPage}
                    showWrapLines={showWrapLines}
                    handleFormat={handleFormat}
                    handleReset={handleReset}
                    minimapEnabled={minimapEnabled}
                    toggleMinimap={toggleMinimap}
                    showLineNumbers={lineNumbers}
                    onAIEdit={handleOpenAIModal}
                    hideLanguageDisplay={true}
                  />
                </div>
              </div>

              {/* Monaco Editor - uses path prop for multi-model support */}
              <div ref={editorWrapperRef} className="flex-1 min-h-0">
                <SmallCodeEditor
                  path={editorPath}
                  language={monacoLanguage}
                  fileExtension={monacoFileExtension}
                  initialCode={currentFile.content}
                  onChange={handleContentChange}
                  runCode={runCode}
                  mode={mode}
                  autoFormat={autoFormatOnOpen}
                  defaultWordWrap={defaultWordWrap}
                  showFormatButton={false}
                  showCopyButton={false}
                  showResetButton={false}
                  showWordWrapToggle={false}
                  showMinimapToggle={false}
                  height={editorHeight}
                  readOnly={!isEditing || currentFile.readOnly}
                  formatTrigger={formatTrigger}
                  controlledWordWrap={showWrapLines ? "on" : "off"}
                  controlledMinimap={minimapEnabled}
                />
              </div>
            </div>
          </div>
        ) : (
          /* Editor without Sidebar */
          <div className="flex-1 flex flex-col">
            {/* Custom File Tab with CodeBlock Header */}
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-300 dark:border-gray-700">
              {/* Left: Sidebar Toggle + File Info */}
              <div className="flex items-center gap-2 min-w-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSidebarVisible(true)}
                  className="h-6 w-6 p-0 flex-shrink-0 hover:bg-gray-200 dark:hover:bg-gray-700"
                  title="Show sidebar"
                >
                  <PanelLeft className="h-3.5 w-3.5" />
                </Button>
                {getLanguageIcon(currentFile)}
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                  {currentFile.name}
                </span>
              </div>

              {/* Right: Header Controls (without language display) */}
              <div className="flex-shrink-0">
                <CodeBlockHeader
                  language={currentFile.language}
                  linesCount={code.split("\n").length}
                  isEditing={isEditing}
                  isFullScreen={isFullScreen}
                  isCollapsed={isCollapsed}
                  code={code}
                  handleCopy={handleCopy}
                  handleDownload={handleDownload}
                  toggleEdit={toggleEdit}
                  toggleFullScreen={toggleFullScreen}
                  toggleCollapse={toggleCollapse}
                  toggleLineNumbers={toggleLineNumbers}
                  toggleWrapLines={toggleWrapLines}
                  isCopied={isCopied}
                  isMobile={isMobile}
                  isCompleteHTML={isCompleteHTMLDocument(code)}
                  handleViewHTML={handleViewHTML}
                  isCreatingPage={isCreatingPage}
                  showWrapLines={showWrapLines}
                  handleFormat={handleFormat}
                  handleReset={handleReset}
                  minimapEnabled={minimapEnabled}
                  toggleMinimap={toggleMinimap}
                  showLineNumbers={lineNumbers}
                  onAIEdit={handleOpenAIModal}
                  hideLanguageDisplay={true}
                />
              </div>
            </div>

            {/* Monaco Editor - uses path prop for multi-model support */}
            <div ref={editorWrapperRef} className="flex-1 min-h-0">
              <SmallCodeEditor
                path={editorPath}
                language={monacoLanguage}
                fileExtension={monacoFileExtension}
                initialCode={currentFile.content}
                onChange={handleContentChange}
                runCode={runCode}
                mode={mode}
                autoFormat={autoFormatOnOpen}
                defaultWordWrap={defaultWordWrap}
                showFormatButton={false}
                showCopyButton={false}
                showResetButton={false}
                showWordWrapToggle={false}
                showMinimapToggle={false}
                height={editorHeight}
                readOnly={!isEditing || currentFile.readOnly}
                formatTrigger={formatTrigger}
                controlledWordWrap={showWrapLines ? "on" : "off"}
                controlledMinimap={minimapEnabled}
              />
            </div>
          </div>
        )}
      </div>

      {/* AI Code Editor Modal — agent-system. v2 (current_code) and v3
          (dynamic_context) collapse to the same SmartCodeEditorModal; the
          agent UUID selects which variable receives the code. */}
      {aiModalConfig &&
        (() => {
          const agent = agentForPromptKey(aiModalConfig.builtinId);
          return (
            <SmartCodeEditorModal
              open={true}
              onOpenChange={handleCloseAIModal}
              agents={[agent]}
              defaultPickerAgentId={agent.id}
              initialCode={code}
              language={monacoLanguage}
              onCodeChange={handleAICodeChange}
              title={aiModalConfig.title}
            />
          );
        })()}
    </div>
  );
}
