import { cn } from "@/lib/utils";
import { getLanguageIconNode } from "@ai-matrx/rich-content/code-block/LanguageDisplay";
import { Folder } from "lucide-react";
import { CodeFile } from "./types";

export default function CodeSidebar({
  files,
  activeFile,
  handleFileSelect,
  sidebarWidth,
  className,
}: {
  files: CodeFile[];
  activeFile: string;
  handleFileSelect: (path: string) => void;
  /** Fixed pixel width applied via inline style. Omit when inside WindowPanel
   *  (the panel's own resizable handle controls the width). */
  sidebarWidth?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex-shrink-0 h-full bg-gray-50 dark:bg-gray-900 border-r border-gray-300 dark:border-gray-700 overflow-y-auto flex flex-col",
        className,
      )}
      style={sidebarWidth !== undefined ? { width: sidebarWidth } : undefined}
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
            {getLanguageIconNode(file.language, true, file.icon)}
            <span className="truncate">{file.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
