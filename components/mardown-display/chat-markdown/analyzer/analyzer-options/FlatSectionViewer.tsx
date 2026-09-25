import React, { useState } from "react";
import { Copy, Check, FileText, Eye, EyeOff } from "lucide-react";
import { 
  getSectionTypeIcon, 
  getSectionTypeLabel, 
  useCopyToClipboard,
  normalizeDynamicKey,
  preprocessContentForLineBreaks
} from "./viewer-utilities";
import { BasicMarkdownContent } from "../../BasicMarkdownContent";

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
  const { copy, copied } = useCopyToClipboard();

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
    
    try {
      await navigator.clipboard.writeText(selectedSection.bookmarkPath);
      setBookmarkCopied(true);
      setTimeout(() => setBookmarkCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy bookmark path:", err);
    }
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
              <button
                key={section.id}
                onClick={() => setSelectedSectionIndex(index)}
                className={`w-full p-4 text-left border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  selectedSectionIndex === index ? "bg-blue-50 dark:bg-blue-900/20 border-r-2 border-r-blue-500" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  {section.icon}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium mb-1 break-words text-gray-800 dark:text-gray-200">
                      {section.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {section.summary}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
        
        {/* Main Content */}
        <div className="flex-1 bg-textured border-border rounded-lg overflow-hidden shadow-sm">
          {/* Header */}
          <div className="p-4 border-b border-border bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  {selectedSection?.icon}
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200">
                    {selectedSection?.title || "Unknown Section"}
                  </h3>
                  
                  {/* Raw/Rendered Toggle */}
                  <button
                    onClick={() => setShowRawContent(!showRawContent)}
                    className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      showRawContent
                        ? "bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300"
                        : "bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                    }`}
                    title={showRawContent ? "Switch to rendered markdown" : "Switch to raw content"}
                  >
                    {showRawContent ? (
                      <>
                        <EyeOff size={12} />
                        Raw
                      </>
                    ) : (
                      <>
                        <Eye size={12} />
                        Rendered
                      </>
                    )}
                  </button>
                </div>
                
                {/* Bookmark Path Display */}
                {selectedSection?.bookmarkPath && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 border border-blue-500 truncate max-w-2xl">
                      {selectedSection.bookmarkPath}
                    </span>
                    <button
                      onClick={handleBookmarkCopy}
                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                      title="Copy bookmark path"
                    >
                      {bookmarkCopied ? (
                        <Check size={12} className="text-green-500" />
                      ) : (
                        <Copy size={12} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                      )}
                    </button>
                  </div>
                )}
              </div>
              
              <button
                onClick={handleCopy}
                className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors group"
                title="Copy section content"
              >
                {copied ? (
                  <Check size={16} className="text-green-500" />
                ) : (
                  <Copy size={16} className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                )}
              </button>
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
                    <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border-border font-mono">
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