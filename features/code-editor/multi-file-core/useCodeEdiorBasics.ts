"use client";
import { useState, useCallback, useRef } from "react";
import { extractErrorMessage } from "@/utils/errors";
import { useMeasure } from "@uidotdev/usehooks";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { HTMLPageService } from "@/features/html-pages/services/htmlPageService";
import { CodeFile } from "./types";
import {
  mapLanguageForMonaco,
  getMonacoFileExtension,
} from "@/features/code-editor/config/languages";

interface UseCodeEditorBasicsProps {
  files: CodeFile[];
  onChange?: (path: string, content: string) => void;
  onFileSelect?: (path: string) => void;
  runCode?: () => void;
  autoFormatOnOpen?: boolean;
  defaultWordWrap?: "on" | "off";
  showSidebar?: boolean;
  height?: string;
}

export function useCodeEditorBasics({
  files,
  onChange,
  onFileSelect,
  runCode,
  autoFormatOnOpen = false,
  defaultWordWrap = "off",
  showSidebar: initialShowSidebar = true,
  height = "600px",
}: UseCodeEditorBasicsProps) {
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
      alert(`Failed to create HTML page: ${extractErrorMessage(error)}`);
    } finally {
      setIsCreatingPage(false);
    }
  };

  return {
    editorWrapperRef,
    editorWrapperHeight,
    activeFile,
    sidebarVisible,
    sidebarWidth,
    isDragging,
    dragStartX,
    dragStartWidth,
    isCopied,
    setIsCopied,
    isFullScreen,
    setIsFullScreen,
    isCollapsed,
    setIsCollapsed,
    isEditing,
    setIsEditing,
    lineNumbers,
    setLineNumbers,
    showWrapLines,
    setShowWrapLines,
    minimapEnabled,
    setMinimapEnabled,
    isCreatingPage,
    setIsCreatingPage,
    handleFileSelect,
    handleContentChange,
    handleCopy,
    handleDownload,
    toggleLineNumbers,
    toggleWrapLines,
    toggleFullScreen,
    toggleCollapse,
    toggleEdit,
    handleFormat,
    handleReset,
    toggleMinimap,
    isCompleteHTMLDocument,
    handleViewHTML,
    handleDragStart,
    editorPath,
    currentFile,
    code,
    monacoLanguage,
    monacoFileExtension,
    formatTrigger,
    setFormatTrigger,
    setSidebarVisible,
    setSidebarWidth,
  };
}
