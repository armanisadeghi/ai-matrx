import { Button, Tile } from "@ai-matrx/design-system/controls";
import React, { useState } from "react";
import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { Copy, Check, FileText, Eye, EyeOff } from "lucide-react";
import { 
  getSectionTypeIcon, 
  getSectionTypeLabel, 
  normalizeDynamicKey,
  preprocessContentForLineBreaks
} from "./viewer-utilities";
import { BasicMarkdownContent } from "@ai-matrx/rich-content/display/chat-markdown/BasicMarkdownContent";

interface FlatSectionViewerProps {
  data: Record<string, string>;
  bookmark?: string;
}

interface ProcessedFlatSection {
  id: string;
  key: string;
  title: string;
  icon: React.ReactNode;
  content: string;
  summary: string; // Truncated at first line break
  bookmarkPath: string;
  normalizedNumber: number; // 1, 2, 3, etc. (treats unnumbered as 1)
}

const FlatSectionViewer = ({ data, bookmark }: FlatSectionViewerProps) => {
  const [selectedSectionIndex, setSelectedSectionIndex] = useState<number>(0);
  const [showRawContent, setShowRawContent] = useState<boolean>(false);
  const [bookmarkCopied, setBookmarkCopied] = useState<boolean>(false);
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const [copied, setCopied] = useState(false);
  const copy = async (text: string): Promise<boolean> => {
    if (!(await copyText(text, "Copied"))) return false;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    return true;
  };

  // Process flat section data with custom logic
  const processedSections: ProcessedFlatSection[] = React.useMemo(() => {
    return Object.entries(data).map(([key, value], index) => {
      const { baseKey, number } = normalizeDynamicKey(key);
      const title = getSectionTypeLabel(key);
      const icon = getSectionTypeIcon(key);
      
      // Custom numbering: treat unnumbered as 1, others as their actual number
      const normalizedNumber = number === 0 ? 1 : number;
      
      // Custom title with consistent numbering
      const consistentTitle = normalizedNumber > 1 ? `${getSectionTypeLabel(baseKey)} (${normalizedNumber})` : getSectionTypeLabel(baseKey);
      
      // Truncate content at first \n for sidebar summary
      const firstLineBreakIndex = value.indexOf('\n');
      const summary = firstLineBreakIndex !== -1 ? value.substring(0, firstLineBreakIndex).trim() : value.trim();
      
      // Construct bookmark path
      const bookmarkPath = bookmark ? `${bookmark}["${key}"]` : `["${key}"]`;
      
      return {
        id: `flat-section-${index}`,
        key,
        title: consistentTitle,
        icon,
        content: value,
        summary: summary || 'Empty content',
        bookmarkPath,
        normalizedNumber
      };
    });
  }, [data, bookmark]);

  const selectedSection = processedSections[selectedSectionIndex] || processedSections[0];

  const handleCopy = async () => {
    if (!selectedSection) return;
    await copy(selectedSection.content);
  };

  const handleBookmarkCopy = async () => {
    if (!selectedSection?.bookmarkPath) return;
    
    if (!(await copyText(selectedSection.bookmarkPath))) return;
    setBookmarkCopied(true);
    setTimeout(() => setBookmarkCopied(false), 2000);
  };

  if (!processedSections || processedSections.length === 0) {
    return (
      <div className="w-full h-full p-4 bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">No sections found</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full p-4 bg-gray-50 dark:bg-gray-900">
      <div className="h-full flex gap-4 max-w-7xl mx-auto">
        {/* Sidebar */}
        <div className="w-80 flex-shrink-0 bg-textured border-border rounded-lg overflow-hidden shadow-sm">
          <div className="p-4 border-b border-border bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-800 dark:text-gray-200">
                  Flat Sections
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {processedSections.length} section{processedSections.length !== 1 ? "s" : ""}
                </p>
              </div>
              <FileText size={16} className="text-gray-500 dark:text-gray-400" />
            </div>
          </div>
          
          <div className="overflow-y-auto" style={{ height: "calc(100% - 80px)" }}>
            {processedSections.map((section, index) => (
              <Tile
                key={section.id}
                variant="quiet"
                selected={selectedSectionIndex === index}
                onClick={() => setSelectedSectionIndex(index)}
                icon={section.icon}
                title={section.title}
                line={section.summary}
              />
            ))}
          </div>
        </div>
        
        {/* Main Content */}
        <div className="flex-1 bg-textured border-border rounded-lg overflow-hidden shadow-sm">
          {/* Header */}
          <div className="p-4 border-b border-border bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-3">
                  {selectedSection?.icon}
                  <h3 className="min-w-0 truncate font-semibold text-gray-800 dark:text-gray-200">
                    {selectedSection?.title || "Unknown Section"}
                  </h3>
                  
                  {/* Raw/Rendered Toggle */}
                  <Button
                    variant="outline"
                    onClick={() => setShowRawContent(!showRawContent)}
                    aria-pressed={showRawContent}
                    icon={showRawContent ? <EyeOff />  : <Eye />}
                    title={showRawContent ? "Switch to rendered markdown" : "Switch to raw content"}
                  >
                    {showRawContent ? "Raw" : "Rendered"}
                  </Button>
                </div>
                
                {/* Bookmark Path Display */}
                {selectedSection?.bookmarkPath && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 border border-blue-500 truncate max-w-2xl">
                      {selectedSection.bookmarkPath}
                    </span>
                    <Button variant="quiet" icon={bookmarkCopied ? (
                        <Check  size={12} />
                      ) : (
                        <Copy  size={12} />
                      )} glyphTone={bookmarkCopied ? "success" : undefined} onClick={handleBookmarkCopy} title="Copy bookmark path" aria-label="Copy bookmark path" />
                  </div>
                )}
              </div>
              
              <Button variant="quiet" icon={copied ? (
                  <Check  size={16} />
                ) : (
                  <Copy  size={16} />
                )} glyphTone={copied ? "success" : undefined} className="shrink-0" onClick={handleCopy} title="Copy section content" aria-label="Copy section content" />
            </div>
          </div>
          
          {/* Content */}
          <div className="p-6 overflow-y-auto" style={{ height: "calc(100% - 80px)" }}>
            <div className="max-w-4xl">
              {selectedSection ? (
                showRawContent ? (
                  /* Raw Content Display */
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400 mb-4">
                      <EyeOff size={16} />
                      <span className="font-medium">Raw Content</span>
                      <span className="text-xs bg-orange-100 dark:bg-orange-900/20 px-2 py-1 rounded">
                        No formatting applied
                      </span>
                    </div>
                    <pre /* rich-content-exempt: debug or inspector output: logs, JSON, code or source view */ className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border-border font-mono">
                      {selectedSection.content}
                    </pre>
                  </div>
                ) : (
                  /* Rendered Markdown Content */
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 mb-4">
                      <Eye size={16} />
                      <span className="font-medium">Rendered Content</span>
                      <span className="text-xs bg-blue-100 dark:bg-blue-900/20 px-2 py-1 rounded">
                        Markdown applied
                      </span>
                    </div>
                    <BasicMarkdownContent imagePolicy="self" 
                      content={preprocessContentForLineBreaks(selectedSection.content)}
                      showCopyButton={false}
                    />
                  </div>
                )
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No content available</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlatSectionViewer;
export type { FlatSectionViewerProps };
