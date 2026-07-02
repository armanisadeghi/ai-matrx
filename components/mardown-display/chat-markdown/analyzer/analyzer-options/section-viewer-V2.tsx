import React, { useState } from 'react';
import { Copy, Check, CheckSquare } from 'lucide-react';
import { 
  JsonFallback, 
  getSectionTypeIcon, 
  getSectionTypeLabel, 
  useCopyToClipboard,
  extractSummaryFromContent,
  isValidStringArray,
  isValidString
} from './viewer-utilities';

export interface SectionData {
  section: string;
  content: string[];
}

// Safety validation functions using centralized utilities
const isValidSectionData = (item: unknown): item is SectionData => {
  if (!item || typeof item !== 'object') return false;
  const i = item as Record<string, unknown>;
  return isValidString(i.section) && isValidStringArray(i.content);
};

const isValidData = (data: unknown): data is SectionData[] => {
  return (
    Array.isArray(data) &&
    data.every((section: unknown) => isValidSectionData(section))
  );
};

const renderSectionContent = (section: SectionData) => {
  const { section: sectionType, content } = section;
  
  // Handle different section types with appropriate formatting
  switch (sectionType) {
    case "header_with_or_without_text":
      return (
        <div className="space-y-4">
          {content.map((item, index) => (
            <h2 key={index} className="text-2xl font-bold text-gray-800 dark:text-gray-200">
              {item}
            </h2>
          ))}
        </div>
      );
      
    case "header_with_list":
      return (
        <div className="space-y-3">
          {content.map((item, index) => {
            // Check if this looks like a key (ends with colon)
            if (item.endsWith(':')) {
              return (
                <div key={index} className="font-semibold text-gray-800 dark:text-gray-200 mt-4 first:mt-0">
                  {item}
                </div>
              );
            }
            // Check if this is the first item (likely a header)
            if (index === 0) {
              return (
                <h3 key={index} className="text-xl font-bold text-gray-800 dark:text-gray-200 border-b border-border pb-2">
                  {item}
                </h3>
              );
            }
            // Regular content
            return (
              <div key={index} className="text-gray-700 dark:text-gray-300 leading-relaxed ml-4">
                {item}
              </div>
            );
          })}
        </div>
      );
      
    case "header_with_bullets":
      return (
        <div className="space-y-3">
          {content.map((item, index) => {
            if (index === 0) {
              return (
                <h3 key={index} className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-4">
                  {item}
                </h3>
              );
            }
            return (
              <div key={index} className="flex items-start gap-2">
                <span className="text-gray-600 dark:text-gray-400 mt-1">•</span>
                <div className="text-gray-700 dark:text-gray-300 leading-relaxed">
                  {item}
                </div>
              </div>
            );
          })}
        </div>
      );
      
    case "header_with_numbered_list":
    case "numbered_list_without_header":
      return (
        <div className="space-y-3">
          {content.map((item, index) => {
            if (sectionType === "header_with_numbered_list" && index === 0) {
              return (
                <h3 key={index} className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-4">
                  {item}
                </h3>
              );
            }
            const listIndex = sectionType === "header_with_numbered_list" ? index : index + 1;
            return (
              <div key={index} className="flex items-start gap-3">
                <span className="text-gray-600 dark:text-gray-400 font-medium min-w-[1.5rem]">
                  {listIndex}.
                </span>
                <div className="text-gray-700 dark:text-gray-300 leading-relaxed">
                  {item}
                </div>
              </div>
            );
          })}
        </div>
      );
      
    case "code_block":
      return (
        <div className="space-y-3">
          {content.map((item, index) => (
            <pre key={index} className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
              <code>{item}</code>
            </pre>
          ))}
        </div>
      );
      
    case "json_block":
      return (
        <div className="space-y-3">
          {content.map((item, index) => (
            <pre key={index} className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
              <code>{JSON.stringify(JSON.parse(item), null, 2)}</code>
            </pre>
          ))}
        </div>
      );
      
    case "table":
      return (
        <div className="space-y-3">
          {content.map((item, index) => (
            <div key={index} className="overflow-x-auto">
              <table className="min-w-full border-border">
                <tbody>
                  {item.split('\n').map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-border">
                      {row.split('|').map((cell, cellIndex) => (
                        <td key={cellIndex} className="px-4 py-2 text-gray-700 dark:text-gray-300">
                          {cell.trim()}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      );
      
    case "checklist":
      return (
        <div className="space-y-3">
          {content.map((item, index) => (
            <div key={index} className="flex items-start gap-3">
              <CheckSquare size={16} className="text-gray-600 dark:text-gray-400 mt-1" />
              <div className="text-gray-700 dark:text-gray-300 leading-relaxed">
                {item}
              </div>
            </div>
          ))}
        </div>
      );
      
    case "bold_text_with_sub_bullets":
      return (
        <div className="space-y-3">
          {content.map((item, index) => {
            if (index === 0) {
              return (
                <div key={index} className="font-bold text-gray-800 dark:text-gray-200">
                  {item}
                </div>
              );
            }
            return (
              <div key={index} className="flex items-start gap-2 ml-4">
                <span className="text-gray-600 dark:text-gray-400 mt-1">•</span>
                <div className="text-gray-700 dark:text-gray-300 leading-relaxed">
                  {item}
                </div>
              </div>
            );
          })}
        </div>
      );
      
    case "entries_and_values":
      return (
        <div className="space-y-2">
          {content.map((item, index) => {
            const [key, ...valueParts] = item.split(':');
            const value = valueParts.join(':').trim();
            
            if (value) {
              return (
                <div key={index} className="flex gap-3">
                  <span className="font-medium text-gray-800 dark:text-gray-200 min-w-[100px]">
                    {key.trim()}:
                  </span>
                  <span className="text-gray-700 dark:text-gray-300">
                    {value}
                  </span>
                </div>
              );
            }
            
            return (
              <div key={index} className="text-gray-700 dark:text-gray-300 leading-relaxed">
                {item}
              </div>
            );
          })}
        </div>
      );
      
    default:
      return (
        <div className="space-y-3">
          {content.map((item, index) => (
            <div key={index} className="text-gray-700 dark:text-gray-300 leading-relaxed">
              {item}
            </div>
          ))}
        </div>
      );
  }
};

const SectionViewerV2 = ({ data }: { data: unknown }) => {
  const [selectedSectionIndex, setSelectedSectionIndex] = useState<number>(0);
  const { copy, copied } = useCopyToClipboard();

  // Safety check: if data is not in expected format, show JSON fallback
  if (!isValidData(data)) {
    return (
      <JsonFallback
        data={data}
        title="Raw Data (JSON)"
        subtitle="Unexpected Format"
        className="w-full h-full p-4 bg-gray-50 dark:bg-gray-900"
      />
    );
  }

  const safeData = data;
  const selectedSection = safeData[selectedSectionIndex] || safeData[0];
  
  const handleCopy = async () => {
    if (!selectedSection || !selectedSection.content) {
      return;
    }
    
    const textContent = selectedSection.content.join('\n');
    await copy(textContent);
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
              const summary = extractSummaryFromContent(section.content, 50) || 'Content Section';
              const contentCount = section.content.length;
              
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
                    {getSectionTypeIcon(section.section)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1 break-words">
                        {getSectionTypeLabel(section.section)}
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
                {getSectionTypeIcon(selectedSection?.section || 'unknown')}
                <h3 className="font-semibold text-gray-800 dark:text-gray-200">
                  {getSectionTypeLabel(selectedSection?.section || 'Unknown Section')}
                </h3>
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
          <div className="p-6 overflow-y-auto" style={{ height: 'calc(100% - 80px)' }}>
            <div className="max-w-4xl">
              {selectedSection ? 
                renderSectionContent(selectedSection) : 
                <p className="text-gray-500 dark:text-gray-400">No content available</p>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SectionViewerV2;