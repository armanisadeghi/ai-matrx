import React, { useState } from 'react';
import { Copy, Check, FileText, CheckSquare } from 'lucide-react';
import { 
  JsonFallback, 
  getSectionTypeIcon, 
  getSectionTypeLabel, 
  useCopyToClipboard 
} from './viewer-utilities';

export type SectionType =
    | "intro_text"
    | "code_block"
    | "table"
    | "entries_and_values"
    | "header_with_or_without_text"
    | "header_with_list"
    | "header_with_bullets"
    | "header_with_numbered_list"
    | "header_with_text"
    | "numbered_list_without_header"
    | "bold_text_with_sub_bullets"
    | "plain_text"
    | "outro_text"
    | "json_block"
    | "checklist"
    | "other_section_type"
    | string;

export interface ClassifiedSection {
    section: SectionType;
    content: string[];
}

// Safety validation functions
const isValidClassifiedSection = (item: unknown): item is ClassifiedSection => {
  if (!item || typeof item !== 'object') return false;
  const i = item as Record<string, unknown>;
  return (
    typeof i.section === 'string' &&
    Array.isArray(i.content) &&
    i.content.every((c: unknown) => typeof c === 'string')
  );
};

const isValidClassifiedData = (data: unknown): data is ClassifiedSection[] => {
  return (
    Array.isArray(data) &&
    data.every((section: unknown) => isValidClassifiedSection(section))
  );
};

// Using centralized JsonFallback component from utilities



// Using centralized icon and label functions from utilities

const renderContent = (section: ClassifiedSection) => {
  const { content, section: sectionType } = section;
  
  // Safety check: ensure content is valid
  if (!content || !Array.isArray(content) || content.length === 0) {
    return (
      <p className="text-gray-500 dark:text-gray-400 text-sm italic">
        No content available
      </p>
    );
  }

  // Additional safety: filter out invalid content items
  const safeContent = content.filter(item => item != null && typeof item === 'string');
  
  if (safeContent.length === 0) {
    return (
      <p className="text-gray-500 dark:text-gray-400 text-sm italic">
        No valid content found
      </p>
    );
  }
  
  if (sectionType === "code_block" || sectionType === "json_block") {
    return (
      <pre className="bg-gray-50 dark:bg-gray-800 rounded-md p-3 overflow-x-auto text-sm font-mono">
        <code className="text-gray-800 dark:text-gray-200">
          {safeContent.join('\n')}
        </code>
      </pre>
    );
  }
  
  if (sectionType === "numbered_list_without_header" || sectionType === "header_with_numbered_list") {
    return (
      <ol className="list-decimal list-inside space-y-1">
        {safeContent.map((item, index) => (
          <li key={index} className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
            {item}
          </li>
        ))}
      </ol>
    );
  }
  
  if (sectionType === "header_with_bullets" || sectionType === "header_with_list" || sectionType === "bold_text_with_sub_bullets") {
    return (
      <ul className="list-disc list-inside space-y-1">
        {safeContent.map((item, index) => (
          <li key={index} className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
            {item}
          </li>
        ))}
      </ul>
    );
  }
  
  if (sectionType === "checklist") {
    return (
      <div className="space-y-2">
        {safeContent.map((item, index) => (
          <div key={index} className="flex items-start gap-2">
            <CheckSquare size={16} className="text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0" />
            <span className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
              {item}
            </span>
          </div>
        ))}
      </div>
    );
  }
  
  return (
    <div className="space-y-2">
      {safeContent.map((item, index) => (
        <p key={index} className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
          {item}
        </p>
      ))}
    </div>
  );
};

const SectionViewer = ({ data }: { data: unknown }) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { copied, copy } = useCopyToClipboard();

  // Safety check: if data is not in expected format, show JSON fallback
  if (!isValidClassifiedData(data)) {
    return <JsonFallback data={data} onCopy={() => {}} className="bg-inherit" />;
  }

  const safeData = data;

  const copyToClipboard = async (content: string[], index: number) => {
    if (!content || !Array.isArray(content)) {
      return;
    }
    const text = content.join('\n');
    const success = await copy(text);
    if (success) {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
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
    <div className="w-full h-full p-4 bg-inherit">
      <div className="max-w-4xl mx-auto h-full">
        <div className="h-full overflow-y-auto">
          <div className="space-y-4">
            {safeData.map((section, index) => {
              // Additional safety check for each section
              if (!isValidClassifiedSection(section)) {
                return (
                  <div
                    key={index}
                    className="bg-textured border border-orange-200 dark:border-orange-700 rounded-lg p-4 shadow-sm"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <FileText size={14} className="text-orange-500 dark:text-orange-400" />
                      <span className="text-xs font-medium text-orange-600 dark:text-orange-400 uppercase tracking-wide">
                        Invalid Section Data
                      </span>
                    </div>
                    <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border-border overflow-auto">
                      {JSON.stringify(section, null, 2)}
                    </pre>
                  </div>
                );
              }

              return (
                <div
                  key={index}
                  className="bg-textured border-border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {getSectionTypeIcon(section.section, 14)}
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                        {getSectionTypeLabel(section.section)}
                      </span>
                    </div>
                    <button
                      onClick={() => copyToClipboard(section.content, index)}
                      className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
                      title="Copy to clipboard"
                    >
                      {copiedIndex === index ? (
                        <Check size={14} className="text-green-500" />
                      ) : (
                        <Copy size={14} className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                      )}
                    </button>
                  </div>
                  
                  <div className="pl-1">
                    {renderContent(section)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SectionViewer;