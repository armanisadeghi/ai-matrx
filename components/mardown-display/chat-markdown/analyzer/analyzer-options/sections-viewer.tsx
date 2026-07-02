import React, { useState } from 'react';
import { Copy, Check, FileText, Hash, Type, List, Minus } from 'lucide-react';

export interface ContentItem {
  type: string;
  content: string;
  children?: ContentItem[];
}

export interface ContentSection {
  type: string;
  children: ContentItem[];
}

// Safety validation functions
const isValidContentItem = (item: unknown): item is ContentItem => {
  if (!item || typeof item !== 'object') return false;
  const i = item as Record<string, unknown>;
  return (
    typeof i.type === 'string' &&
    typeof i.content === 'string' &&
    (i.children === undefined || (Array.isArray(i.children) && i.children.every((child: unknown) => isValidContentItem(child))))
  );
};

const isValidContentSection = (section: unknown): section is ContentSection => {
  if (!section || typeof section !== 'object') return false;
  const s = section as Record<string, unknown>;
  return (
    typeof s.type === 'string' &&
    Array.isArray(s.children) &&
    s.children.every((item: unknown) => isValidContentItem(item))
  );
};

const isValidContentData = (data: unknown): data is ContentSection[] => {
  return (
    Array.isArray(data) &&
    data.every((section: unknown) => isValidContentSection(section))
  );
};

// JSON Fallback Component
const JsonFallback = ({ data, onCopy }: { data: unknown; onCopy: () => void }) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    try {
      const jsonString = JSON.stringify(data, null, 2);
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onCopy();
    } catch (err) {
      console.error('Failed to copy JSON:', err);
    }
  };

  return (
    <div className="w-full h-full p-4 bg-gray-50 dark:bg-gray-900">
      <div className="h-full max-w-7xl mx-auto">
        <div className="h-full bg-textured border-border rounded-lg overflow-hidden shadow-sm">
          <div className="p-4 border-b border-border bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText size={16} className="text-gray-500 dark:text-gray-400" />
                <h3 className="font-semibold text-gray-800 dark:text-gray-200">
                  Raw Data (JSON)
                </h3>
                <span className="text-sm text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/20 px-2 py-1 rounded-md">
                  Unexpected Format
                </span>
              </div>
              <button
                onClick={handleCopy}
                className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors group"
                title="Copy JSON data"
              >
                {copied ? (
                  <Check size={16} className="text-green-500" />
                ) : (
                  <Copy size={16} className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                )}
              </button>
            </div>
          </div>
          
          <div className="p-6 overflow-auto" style={{ height: 'calc(100% - 80px)' }}>
            <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border-border">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

const getSectionIcon = (sectionType: string) => {
  const iconProps = { size: 16, className: "text-gray-500 dark:text-gray-400" };
  
  switch (sectionType) {
    case "json_block_section":
      return <FileText {...iconProps} />;
    case "table_block_section":
      return <FileText {...iconProps} />;
    case "xml_block_section":
      return <FileText {...iconProps} />;
    case "code_block_section":
      return <FileText {...iconProps} />;
    case "paragraph_section":
      return <Type {...iconProps} />;
    case "header_h1_section":
    case "header_h2_section":
    case "header_h3_section":
    case "header_h4_section":
    case "header_h5_section":
    case "header_h6_section":
      return <Hash {...iconProps} />;
    case "bold_text_section":
      return <Type {...iconProps} />;
    case "entry_and_value_section":
      return <List {...iconProps} />;
    case "checklist":
      return <List {...iconProps} />;
    case "numbered_list":
      return <Hash {...iconProps} />;
    case "reference":
      return <FileText {...iconProps} />;
    default:
      return <FileText {...iconProps} />;
  }
};

const getSectionLabel = (sectionType: string) => {
  return sectionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const renderContentItem = (item: ContentItem, index: number) => {
  // Safety check: validate the item structure
  if (!isValidContentItem(item)) {
    return (
      <div key={index} className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-3 mb-2">
        <div className="flex items-center gap-2 mb-2">
          <FileText size={14} className="text-orange-500 dark:text-orange-400" />
          <span className="text-xs font-medium text-orange-600 dark:text-orange-400 uppercase tracking-wide">
            Invalid Content Item
          </span>
        </div>
        <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-800 p-2 rounded border-border overflow-auto">
          {JSON.stringify(item, null, 2)}
        </pre>
      </div>
    );
  }

  const { type, content } = item;
  
  // Safety check: ensure content is a string
  const safeContent = typeof content === 'string' ? content : String(content || '');
  
  if (type === "line_break") {
    return <div key={index} className="h-2" />;
  }
  
  if (type === "thematic_break") {
    return <hr key={index} className="my-4 border-gray-300 dark:border-gray-600" />;
  }
  
  if (type === "header_h1") {
    return (
      <h1 key={index} className="text-3xl font-bold text-gray-800 dark:text-gray-200 mb-4">
        {safeContent}
      </h1>
    );
  }
  
  if (type === "header_h2") {
    return (
      <h2 key={index} className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-3">
        {safeContent}
      </h2>
    );
  }
  
  if (type === "header_h3") {
    return (
      <h3 key={index} className="text-xl font-medium text-gray-800 dark:text-gray-200 mb-2">
        {safeContent}
      </h3>
    );
  }
  
  if (type === "bullet") {
    return (
      <div key={index} className="flex items-start gap-2 mb-1">
        <span className="text-gray-600 dark:text-gray-400 mt-1">•</span>
        <div 
          className="text-gray-700 dark:text-gray-300 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: safeContent }}
        />
      </div>
    );
  }
  
  if (type === "paragraph") {
    return (
      <div 
        key={index} 
        className="text-gray-700 dark:text-gray-300 leading-relaxed mb-2"
        dangerouslySetInnerHTML={{ __html: safeContent }}
      />
    );
  }
  
  return (
    <div key={index} className="text-gray-700 dark:text-gray-300 leading-relaxed mb-2">
      {safeContent}
    </div>
  );
};

const extractSummaryFromSection = (section: ContentSection): string => {
  // Safety check: validate section structure
  if (!isValidContentSection(section) || !section.children || !Array.isArray(section.children)) {
    return 'Invalid Section';
  }

  // Filter valid children
  const validChildren = section.children.filter(child => isValidContentItem(child));
  
  if (validChildren.length === 0) {
    return 'No Valid Content';
  }

  // Find the first header or meaningful content for summary
  const header = validChildren.find(child => 
    child.type && child.type.startsWith('header_') && 
    child.content && typeof child.content === 'string' && child.content.trim()
  );
  
  if (header && header.content) {
    return header.content.trim();
  }
  
  // Fallback to first paragraph with content
  const paragraph = validChildren.find(child => 
    child.type === 'paragraph' && 
    child.content && typeof child.content === 'string' && child.content.trim()
  );
  
  if (paragraph && paragraph.content) {
    const text = paragraph.content.replace(/<[^>]*>/g, '').trim();
    return text.length > 50 ? text.substring(0, 50) + '...' : text;
  }
  
  // Fallback to any content with text
  const anyContent = validChildren.find(child => 
    child.content && typeof child.content === 'string' && child.content.trim()
  );
  
  if (anyContent && anyContent.content) {
    const text = anyContent.content.replace(/<[^>]*>/g, '').trim();
    return text.length > 50 ? text.substring(0, 50) + '...' : text;
  }
  
  return 'Content Section';
};

const SectionsViewer = ({ data }: { data: unknown }) => {
  const [selectedSectionIndex, setSelectedSectionIndex] = useState<number>(0);
  const [copiedData, setCopiedData] = useState<boolean>(false);

  // Safety check: if data is not in expected format, show JSON fallback
  if (!isValidContentData(data)) {
    return <JsonFallback data={data} onCopy={() => setCopiedData(true)} />;
  }

  const safeData = data;
  const selectedSection = safeData[selectedSectionIndex] || safeData[0];
  
  const copyToClipboard = async () => {
    try {
      if (!selectedSection || !isValidContentSection(selectedSection) || !selectedSection.children) {
        return;
      }

      const validChildren = selectedSection.children.filter(item => 
        isValidContentItem(item) && item.content && typeof item.content === 'string' && item.content.trim()
      );
      
      const textContent = validChildren
        .map(item => item.content.replace(/<[^>]*>/g, ''))
        .join('\n');
      
      if (textContent.trim()) {
        await navigator.clipboard.writeText(textContent);
        setCopiedData(true);
        setTimeout(() => setCopiedData(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  if (!safeData || safeData.length === 0) {
    return (
      <div className="w-full h-full p-4 bg-inherit flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">No content to display</p>
      </div>
    );
  }
  
  return (
    <div className="w-full h-full p-4 bg-gray-50 dark:bg-gray-900">
      <div className="h-full flex gap-4 max-w-7xl mx-auto">
        {/* Sidebar */}
        <div className="w-80 flex-shrink-0 bg-textured border-border rounded-lg overflow-hidden shadow-sm">
          <div className="p-4 border-b border-border bg-gray-50 dark:bg-gray-900">
            <h2 className="font-semibold text-gray-800 dark:text-gray-200">Content Sections</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{safeData.length} section{safeData.length !== 1 ? 's' : ''}</p>
          </div>
          
          <div className="overflow-y-auto" style={{ height: 'calc(100% - 80px)' }}>
            {safeData.map((section, index) => {
              // Additional safety check for each section
              if (!isValidContentSection(section)) {
                return (
                  <div
                    key={index}
                    className="w-full p-4 border-b border-orange-200 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20"
                  >
                    <div className="flex items-start gap-3">
                      <FileText size={16} className="text-orange-500 dark:text-orange-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-orange-600 dark:text-orange-400 mb-1 break-words">
                          Invalid Section Data
                        </p>
                        <p className="text-xs text-orange-500 dark:text-orange-400">
                          Section {index + 1}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              const summary = extractSummaryFromSection(section);
              const validChildren = section.children ? section.children.filter(child => 
                isValidContentItem(child) && child.content && 
                typeof child.content === 'string' && child.content.trim() && 
                child.type !== 'line_break'
              ) : [];
              const contentCount = validChildren.length;
              
              return (
                <button
                  key={index}
                  onClick={() => setSelectedSectionIndex(index)}
                  className={`w-full p-4 text-left border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    selectedSectionIndex === index 
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-r-2 border-r-blue-500' 
                      : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {getSectionIcon(section.type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1 break-words">
                        {getSectionLabel(section.type)}
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
            })}
          </div>
        </div>
        
        {/* Main Content */}
        <div className="flex-1 bg-textured border-border rounded-lg overflow-hidden shadow-sm">
          {/* Header */}
          <div className="p-4 border-b border-border bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText size={20} className="text-gray-500 dark:text-gray-400" />
                <h3 className="font-semibold text-gray-800 dark:text-gray-200">
                  Section {selectedSectionIndex + 1}
                </h3>
              </div>
              <button
                onClick={copyToClipboard}
                className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors group"
                title="Copy section content"
              >
                {copiedData ? (
                  <Check size={16} className="text-green-500" />
                ) : (
                  <Copy size={16} className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                )}
              </button>
            </div>
          </div>
          
          {/* Content */}
          <div className="p-6 overflow-y-auto" style={{ height: 'calc(100% - 80px)' }}>
            <div className="max-w-4xl">
              {selectedSection && isValidContentSection(selectedSection) ? (
                selectedSection.children && Array.isArray(selectedSection.children) ? (
                  selectedSection.children.map((item, index) => 
                    renderContentItem(item, index)
                  )
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic">No content items available</p>
                )
              ) : (
                <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText size={16} className="text-orange-500 dark:text-orange-400" />
                    <span className="font-medium text-orange-600 dark:text-orange-400">
                      Invalid Section Data
                    </span>
                  </div>
                  <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-800 p-3 rounded border-border overflow-auto">
                    {JSON.stringify(selectedSection, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


export default SectionsViewer;