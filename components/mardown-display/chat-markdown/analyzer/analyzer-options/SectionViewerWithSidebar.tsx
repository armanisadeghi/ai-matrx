import React, { useState } from 'react';
import { Copy, Check, Braces } from 'lucide-react';
import { 
  JsonFallback, 
  getSectionTypeIcon, 
  getSectionTypeLabel, 
  isValidBaseSectionArray,
  isValidContentItem,
  useCopyToClipboard,
  extractTextFromHTML,
  countValidItems
} from './viewer-utilities';
import RawJsonExplorer from "@/components/official/json-explorer/RawJsonExplorer";



export interface ContentItem {
  type: string;
  content: string;
  children?: ContentItem[];
}

export interface ContentSection {
  type: string;
  children: ContentItem[];
}

const renderContentItem = (item: ContentItem, index: number) => {
  const { type, content } = item;
  
  if (type === "line_break") {
    return <div key={index} className="h-2" />;
  }
  
  if (type === "thematic_break") {
    return <hr key={index} className="my-4 border-gray-300 dark:border-gray-600" />;
  }
  
  if (type === "header_h1") {
    return (
      <h1 key={index} className="text-3xl font-bold text-gray-800 dark:text-gray-200 mb-4">
        {content}
      </h1>
    );
  }
  
  if (type === "header_h2") {
    return (
      <h2 key={index} className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-3">
        {content}
      </h2>
    );
  }
  
  if (type === "header_h3") {
    return (
      <h3 key={index} className="text-xl font-medium text-gray-800 dark:text-gray-200 mb-2">
        {content}
      </h3>
    );
  }
  
  if (type === "bullet") {
    return (
      <div key={index} className="flex items-start gap-2 mb-1">
        <span className="text-gray-600 dark:text-gray-400 mt-1">•</span>
        <div 
          className="text-gray-700 dark:text-gray-300 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </div>
    );
  }
  
  if (type === "paragraph") {
    return (
      <div 
        key={index} 
        className="text-gray-700 dark:text-gray-300 leading-relaxed mb-2"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }
  
  return (
    <div key={index} className="text-gray-700 dark:text-gray-300 leading-relaxed mb-2">
      {content}
    </div>
  );
};

const extractSummaryFromSection = (section: ContentSection): string => {
  if (!section.children || !Array.isArray(section.children)) {
    return 'Invalid Section';
  }

  // Filter valid children
  const validChildren = section.children.filter(child => isValidContentItem(child));
  
  if (validChildren.length === 0) {
    return 'No Valid Content';
  }

  // Find the first header or meaningful content for summary
  const header = validChildren.find(child => 
    child.type.startsWith('header_') && child.content && child.content.trim()
  );
  
  if (header) {
    return header.content.trim();
  }
  
  // Fallback to first paragraph with content
  const paragraph = validChildren.find(child => 
    child.type === 'paragraph' && child.content && child.content.trim()
  );
  
  if (paragraph) {
    const text = extractTextFromHTML(paragraph.content).trim();
    return text.length > 50 ? text.substring(0, 50) + '...' : text;
  }
  
  // Fallback to any content with text
  const anyContent = validChildren.find(child => 
    child.content && child.content.trim()
  );
  
  if (anyContent) {
    const text = extractTextFromHTML(anyContent.content).trim();
    return text.length > 50 ? text.substring(0, 50) + '...' : text;
  }
  
  return 'Content Section';
};

const SectionViewerWithSidebar = ({ data }: { data: unknown }) => {
  const [selectedSectionIndex, setSelectedSectionIndex] = useState<number>(0);
  const [showJsonExplorer, setShowJsonExplorer] = useState<boolean>(false);
  const { copied, copy } = useCopyToClipboard();
  
  // Determine if we should show the sidebar (only hide for JsonFallback when not in explorer mode)
  const shouldShowSidebar = isValidBaseSectionArray(data);
  
  // Safety check: if data is not in expected format and not in JSON explorer mode, show JSON fallback
  if (!shouldShowSidebar && !showJsonExplorer) {
    return <JsonFallback data={data} onCopy={() => {}} />;
  }
  
  // Safe access with fallback (only when we have valid data)
  const safeData = shouldShowSidebar ? (data as ContentSection[]) : [];
  const selectedSection = safeData[selectedSectionIndex] || safeData[0];
  
  const copyToClipboard = async () => {
    if (!selectedSection || !selectedSection.children) {
      return;
    }
    
    const validChildren = selectedSection.children.filter(item => 
      isValidContentItem(item) && item.content && item.content.trim()
    );
    
    const textContent = validChildren
      .map(item => extractTextFromHTML(item.content))
      .join('\n');
    
    if (textContent.trim()) {
      await copy(textContent);
    }
  };
  
  return (
    <div className="w-full h-full p-4 bg-gray-50 dark:bg-gray-900">
      <div className="h-full flex gap-4 max-w-7xl mx-auto">
        {/* Sidebar - Show when we have valid data OR when in JSON explorer mode */}
        {(shouldShowSidebar || showJsonExplorer) && (
          <div className="w-80 flex-shrink-0 bg-textured border-border rounded-lg overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border bg-gray-50 dark:bg-gray-900">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-800 dark:text-gray-200">
                    {showJsonExplorer ? "JSON Explorer" : "Content Sections"}
                  </h2>
                  {shouldShowSidebar && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {safeData.length} section{safeData.length !== 1 ? 's' : ''}
                    </p>
                  )}
                  {!shouldShowSidebar && showJsonExplorer && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Raw data analysis
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setShowJsonExplorer(!showJsonExplorer)}
                  className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors group"
                  title={showJsonExplorer ? "Back to normal view" : "View JSON data explorer"}
                >
                  <Braces size={16} className={showJsonExplorer ? "text-blue-500 dark:text-blue-400" : "text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300"} />
                </button>
              </div>
            </div>
          
          <div className="overflow-y-auto" style={{ height: 'calc(100% - 80px)' }}>
            {shouldShowSidebar ? (
              safeData.map((section, index) => {
                const summary = extractSummaryFromSection(section);
                const validChildren = (section.children || []).filter(child => 
                  isValidContentItem(child) && child.content && child.content.trim() && child.type !== 'line_break'
                );
                const contentCount = validChildren.length;
                
                return (
                  <button
                    key={index}
                    onClick={() => setSelectedSectionIndex(index)}
                    className={`w-full p-4 text-left border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                      selectedSectionIndex === index && !showJsonExplorer
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-r-2 border-r-blue-500' 
                        : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {getSectionTypeIcon(section.type || 'unknown')}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1 break-words">
                          {getSectionTypeLabel(section.type || 'Unknown Section')}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {summary}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {contentCount} content item{contentCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                <p className="text-sm">Data structure not recognized</p>
                <p className="text-xs mt-1">Use JSON explorer to analyze raw data</p>
              </div>
                         )}
          </div>
          </div>
        )}
        
        {/* Main Content */}
        <div className="flex-1 bg-textured border-border rounded-lg overflow-hidden shadow-sm">
          {showJsonExplorer ? (
            /* JSON Explorer Mode */
            <>
              <div className="p-4 border-b border-border bg-gray-50 dark:bg-gray-900">
                <div className="flex items-center gap-3">
                  <Braces size={16} className="text-gray-500 dark:text-gray-400" />
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200">
                    Raw Data Explorer
                  </h3>
                </div>
              </div>
              <div className="overflow-hidden" style={{ height: 'calc(100% - 80px)' }}>
                <RawJsonExplorer pageData={data} />
              </div>
            </>
          ) : (
            /* Normal Section View Mode */
            <>
              <div className="p-4 border-b border-border bg-gray-50 dark:bg-gray-900">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getSectionTypeIcon(selectedSection?.type || 'unknown')}
                    <h3 className="font-semibold text-gray-800 dark:text-gray-200">
                      {getSectionTypeLabel(selectedSection?.type || 'Unknown Section')}
                    </h3>
                  </div>
                  {shouldShowSidebar && (
                    <button
                      onClick={copyToClipboard}
                      className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors group"
                      title="Copy section content"
                    >
                      {copied ? (
                        <Check size={16} className="text-green-500" />
                      ) : (
                        <Copy size={16} className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                      )}
                    </button>
                  )}
                </div>
              </div>
              
              <div className="p-6 overflow-y-auto" style={{ height: 'calc(100% - 80px)' }}>
                <div className="max-w-4xl">
                  {shouldShowSidebar ? (
                    selectedSection && selectedSection.children ? 
                      selectedSection.children.map((item, index) => 
                        renderContentItem(item, index)
                      ) : 
                      <p className="text-gray-500 dark:text-gray-400">No content available</p>
                  ) : (
                    <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                      <p className="text-lg mb-2">Data structure not recognized</p>
                      <p className="text-sm">Switch to JSON explorer to analyze the raw data structure</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SectionViewerWithSidebar;