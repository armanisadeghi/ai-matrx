"use client";
import type { MandateKey } from "@ai-matrx/agents/mandates";

import React, { useRef, useState, useEffect } from "react";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/styles/themes/utils";
import SmallCodeEditor from "./SmallCodeEditor";
import CodeBlockHeader, {
  type CodeBlockMenuItem,
} from "@/features/code-editor/components/code-block/CodeBlockHeader";
import { useAppSelector } from "@/lib/redux/hooks";
import { useThemeMode } from "@/styles/themes/useThemeMode";
import StickyButtons from "./StickyButtons";
import { useIsMobile } from "@/hooks/use-mobile";
import { HTMLPageService } from "@/features/html-pages/services/htmlPageService";
import { isCompleteHtmlDocument } from "@/features/html-pages/utils/html-preview-utils";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { Globe, Loader2 } from "lucide-react";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { toast } from "@/lib/toast";
import { ShikiCodeView } from "./highlight/ShikiCodeView";
import { parseFenceMeta } from "@/components/markdown-core/fence-meta";
import { codeLanguageToExtension } from "@/utils/file-operations/utils";
import { agentForPromptKey } from "@/features/code-editor/agent-code-editor/agents";
import { useOpenSmartCodeEditorWindow } from "@/features/overlays/openers/smartCodeEditorWindow";
import {
  mapLanguageForPrism,
  mapLanguageForMonaco,
  getMonacoFileExtension,
} from "@/features/code-editor/config/languages";

type AIModalConfig = {
  /** The editing job (mandate key) — the DB decides which agent runs it. */
  mandateKey: MandateKey;
  title: string;
};

interface CodeBlockProps {
  code: string;
  language: string;
  fontSize?: number;
  showLineNumbers?: boolean;
  wrapLines?: boolean;
  className?: string;
  onCodeChange?: (newCode: string) => void;
  inline?: boolean;
  isStreamActive?: boolean;
  allowEdit?: boolean;
  customBuiltinKeys?: string[];
  /**
   * Optional node rendered between the language display and the right-side
   * action row. Used by language-specialized wrappers (e.g. `JsonBlock`) to
   * add view-mode toggles without forking this component.
   */
  headerLeftSlot?: React.ReactNode;
  /**
   * Extra items appended to the kebab menu. Use `category` on each item to
   * place it in an existing section (View · Edit · Download · Save · AI) or
   * introduce a new one (e.g. "Data" for tabular JSON actions).
   */
  extraMenuItems?: CodeBlockMenuItem[];
  /**
   * The code fence's info string after the language (`title="app.tsx" {1,3-5}
   * showLineNumbers`) — see components/markdown-core/fence-meta.ts. Sets the
   * header title, highlighted lines and line numbering.
   */
  meta?: string;
}

export type { CodeBlockProps };

const CodeBlock: React.FC<CodeBlockProps> = ({
  code: initialCode,
  language: rawLanguage = "text",
  fontSize = 12,
  showLineNumbers = false,
  wrapLines = true,
  className,
  onCodeChange,
  inline = false,
  isStreamActive = false,
  allowEdit = true,
  customBuiltinKeys = [],
  headerLeftSlot,
  extraMenuItems,
  meta,
}) => {
  const fence = parseFenceMeta(meta);
  // Map language for respective editors (with additional safety checks)
  const viewLanguage = mapLanguageForPrism(rawLanguage);
  const monacoLanguage = mapLanguageForMonaco(rawLanguage);
  const monacoFileExtension = getMonacoFileExtension(rawLanguage);

  const [editedCode, setEditedCode] = useState<string | null>(null);
  const [previousInitialCode, setPreviousInitialCode] = useState(initialCode);
  if (previousInitialCode !== initialCode) {
    setPreviousInitialCode(initialCode);
    setEditedCode(initialCode);
  }
  const [isCopied, setIsCopied] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [lineNumbers, setLineNumbers] = useState(
    showLineNumbers || fence.showLineNumbers === true,
  );
  const [showWrapLines, setShowWrapLines] = useState(wrapLines);
  const [minimapEnabled, setMinimapEnabled] = useState(false);
  const [isTopInView, setIsTopInView] = useState(false);
  const [isBottomInView, setIsBottomInView] = useState(false);
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  const [formatTrigger, setFormatTrigger] = useState(0);
  const openSmartCodeEditorWindow = useOpenSmartCodeEditorWindow();
  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const showStickyButtons = isBottomInView && !isTopInView && !isEditing;
  const mode = useThemeMode();
  const isMobile = useIsMobile();
  const user = useAppSelector(selectUser);
  const { open: openCanvas } = useCanvas();

  // Use edited code if available (when user is editing), otherwise use deferred prop value
  const code = editedCode ?? initialCode;

  // Detect a complete HTML document (gated on the html language). Detection
  // logic is shared with the inline auto-preview renderer — see
  // isCompleteHtmlDocument in features/html-pages/utils/html-preview-utils.
  const isCompleteHTMLDocument = (htmlCode: string): boolean =>
    viewLanguage === "html" && isCompleteHtmlDocument(htmlCode);

  // Function to handle HTML document viewing in canvas
  const handleViewHTML = async () => {
    if (!user?.id) {
      toast.error("You must be logged in to view HTML pages");
      return;
    }

    setIsCreatingPage(true);
    try {
      const result = await HTMLPageService.createPage(
        code,
        "HTML Preview",
        "Generated from code block",
        user.id,
      );

      // Open the HTML page in the canvas
      openCanvas({
        type: "iframe",
        data: result.url,
        metadata: {
          title: "HTML Preview",
        },
      });
    } catch (error) {
      console.error("Failed to create HTML page:", error);
      toast.error(`Failed to create HTML page: ${extractErrorMessage(error)}`);
    } finally {
      setIsCreatingPage(false);
    }
  };

  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: "0px",
      threshold: 0,
    };
    const topObserver = new IntersectionObserver(
      ([entry]) => setIsTopInView(entry.isIntersecting),
      observerOptions,
    );
    const bottomObserver = new IntersectionObserver(
      ([entry]) => setIsBottomInView(entry.isIntersecting),
      observerOptions,
    );

    if (topRef.current) topObserver.observe(topRef.current);
    if (bottomRef.current) bottomObserver.observe(bottomRef.current);

    return () => {
      if (topRef.current) topObserver.unobserve(topRef.current);
      if (bottomRef.current) bottomObserver.unobserve(bottomRef.current);
      topObserver.disconnect();
      bottomObserver.disconnect();
    };
  }, [isFullScreen]);

  // Manage body scroll lock when fullscreen is active
  useEffect(() => {
    if (isFullScreen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isFullScreen]);

  const handleCopy = async (
    e: React.MouseEvent,
    withLineNumbers: boolean = false,
  ) => {
    e.stopPropagation();
    let textToCopy = code;

    if (withLineNumbers) {
      // Add line numbers to each line
      // Numbers match what the block shows (fence `showLineNumbers{N}`).
      const lines = code.split("\n");
      const firstLine = fence.startLine ?? 1;
      const width = String(firstLine + lines.length - 1).length;
      const paddedLines = lines.map((line, index) => {
        const lineNumber = (firstLine + index).toString().padStart(width, " ");
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
    // A fence title that looks like a filename names the download.
    const titleFile =
      fence.title && /^[\w./-]+\.\w+$/.test(fence.title)
        ? fence.title.split("/").pop()
        : undefined;
    const ext = codeLanguageToExtension(rawLanguage || "txt");
    a.download = titleFile ?? `code${ext}`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const toggleLineNumbers = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLineNumbers((prev) => !prev);
  };

  const toggleWrapLines = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowWrapLines((prev) => !prev);
  };

  const toggleFullScreen = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Add a small delay when exiting fullscreen to allow animation to complete
    if (isFullScreen) {
      // First start the transition
      document.body.style.overflow = "auto"; // Restore scrolling

      // Small delay to allow animation to complete before changing state
      setTimeout(() => {
        setIsFullScreen(false);
        setIsCollapsed(false);
      }, 150);
    } else {
      // Entering fullscreen
      document.body.style.overflow = "hidden"; // Prevent background scrolling
      setIsFullScreen(true);
      if (isCollapsed) setIsCollapsed(false);
    }
  };

  const toggleCollapse = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isEditing) return;
    setIsCollapsed((prev) => !prev);
    if (isFullScreen) setIsFullScreen(false);
  };

  const toggleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(!isEditing);
    if (!isEditing) {
      // Entering edit mode - maintain current fullscreen state
      setIsCollapsed(false);
    }
  };

  const handleCodeChange = (newCode: string | undefined) => {
    if (newCode) {
      setEditedCode(newCode);
      onCodeChange?.(newCode);
    }
  };

  const handleFormat = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isEditing) return;
    // Trigger format in the editor
    setFormatTrigger((prev) => prev + 1);
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isEditing) return;
    // Reset code to initial value
    setEditedCode(initialCode);
    onCodeChange?.(initialCode);
  };

  const toggleMinimap = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMinimapEnabled((prev) => !prev);
  };

  const handleOpenAIModal = (config: AIModalConfig) => {
    const agent = agentForPromptKey(config.mandateKey);
    openSmartCodeEditorWindow({
      agents: [agent],
      defaultPickerMandateKey: agent.mandateKey,
      initialCode: editedCode ?? initialCode ?? "",
      language: monacoLanguage,
      title: config.title,
      onCodeChange: (event) => {
        setEditedCode(event.code);
        onCodeChange?.(event.code);
      },
    });
  };

  return (
    <>
      {/* Backdrop overlay for fullscreen mode */}
      {isFullScreen && (
        <div
          className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            e.stopPropagation();
            document.body.style.overflow = "auto";
            setTimeout(() => {
              setIsFullScreen(false);
              setIsCollapsed(false);
            }, 150);
          }}
        />
      )}
      <div
        ref={containerRef}
        className={cn(
          "w-full my-4 rounded-t-xl rounded-b-lg border border-neutral-200 dark:border-neutral-700",
          // `overflow-clip` (NOT `overflow-hidden`) so this box still clips to
          // its rounded corners without becoming a scroll container — an
          // overflow-hidden ancestor would trap StickyButtons' `position:
          // sticky` and disable it (D153).
          !isFullScreen && "overflow-clip",
          isFullScreen &&
            "fixed w-[95vw] h-[90dvh] z-[9999] bg-textured flex flex-col shadow-2xl rounded-xl overflow-hidden",
          className,
        )}
        style={
          isFullScreen
            ? {
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }
            : undefined
        }
      >
        <CodeBlockHeader
          language={rawLanguage}
          title={fence.title}
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
          allowEdit={allowEdit}
          customBuiltinKeys={customBuiltinKeys}
          headerLeftSlot={headerLeftSlot}
          extraMenuItems={extraMenuItems}
        />
        {showStickyButtons && (
          <StickyButtons
            linesCount={code.split("\n").length}
            isCollapsed={isCollapsed}
            isCopied={isCopied}
            handleCopy={handleCopy}
            toggleCollapse={toggleCollapse}
          />
        )}
        <div
          className={cn("relative", isFullScreen && "flex-1 overflow-hidden")}
        >
          {isEditing ? (
            <div className="w-full">
              <SmallCodeEditor
                language={monacoLanguage}
                fileExtension={monacoFileExtension}
                initialCode={code}
                onChange={handleCodeChange}
                mode={mode}
                height={
                  isFullScreen
                    ? "calc(100dvh - 15rem)"
                    : `${Math.max(400, code.split("\n").length * 20 + 100)}px`
                }
                showCopyButton={false}
                showFormatButton={false}
                showResetButton={false}
                showWordWrapToggle={false}
                showMinimapToggle={false}
                formatTrigger={formatTrigger}
                controlledWordWrap={showWrapLines ? "on" : "off"}
                controlledMinimap={minimapEnabled}
              />
            </div>
          ) : (
            // Code View
            <div className={cn("relative", isFullScreen && "h-full")}>
              <div ref={topRef} style={{ height: "1px" }} />
              <div
                ref={bottomRef}
                className={cn(
                  "transition-all duration-300 ease-in-out relative",
                  isCollapsed ? "max-h-[150px]" : "max-h-none",
                  isFullScreen ? "h-full overflow-auto" : "overflow-hidden",
                  showWrapLines && "overflow-x-hidden",
                )}
              >
                <ShikiCodeView
                  code={code}
                  language={rawLanguage}
                  mode={mode === "dark" ? "dark" : "light"}
                  showLineNumbers={lineNumbers}
                  startLine={fence.startLine}
                  wrapLines={showWrapLines}
                  fontSize={fontSize}
                  highlightLines={fence.highlightLines}
                />

                {/* Floating View Button for HTML Documents - Opens in Canvas */}
                {isCompleteHTMLDocument(code) && !isCollapsed && (
                  <button
                    onClick={handleViewHTML}
                    disabled={isCreatingPage}
                    className={cn(
                      "absolute bottom-4 right-4 z-20",
                      "flex items-center gap-2 px-4 py-2 rounded-full",
                      "bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600",
                      "text-white text-sm font-medium",
                      "shadow-lg hover:shadow-xl",
                      "transition-all duration-200 ease-in-out",
                      "transform hover:scale-105",
                      isCreatingPage && "opacity-50 cursor-not-allowed",
                    )}
                    title="Open HTML Preview in Canvas"
                  >
                    {isCreatingPage ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Creating...</span>
                      </>
                    ) : (
                      <>
                        <Globe className="w-4 h-4" />
                        <span>Preview</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              {isCollapsed && (
                <div
                  className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent opacity-80 cursor-pointer"
                  onClick={toggleCollapse}
                >
                  <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-muted-foreground text-sm">
                    Click to expand {code.split("\n").length - 3} more lines
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CodeBlock;
