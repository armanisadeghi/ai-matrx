import React, { useState } from 'react';
import {
  Copy, Check, FileText, Code, Table, List, Hash, Type, BookOpen,
  CheckSquare, Braces, Minus, Archive, Link, Quote, Image,
  Info, AlertCircle, HelpCircle, Star
} from 'lucide-react';
import type { JsonValue } from '@/types/json';

// ==========================================
// SECTION TYPE DEFINITIONS
// ==========================================

export type CommonSectionType =
  // Content Types
  | "intro_text"
  | "outro_text"
  | "plain_text"
  | "paragraph"
  | "paragraph_section"
  
  // Code and Technical
  | "code_block"
  | "code_block_section"
  | "json_block"
  | "json_block_section"
  | "xml_block_section"
  | "xml_block_thinking_section"
  | "xml_block_function_calls_section"
  
  // Tables and Data
  | "table"
  | "table_block"
  | "table_block_section"
  | "entries_and_values"
  | "entry_and_value"
  | "entry_and_value_section"
  
  // Headers (Python docs enhanced)
  | "header_h1"
  | "header_h2"
  | "header_h3"
  | "header_h4"
  | "header_h5"
  | "header_h6"
  | "header_h1_underlined"
  | "header_h2_underlined"
  | "header_with_or_without_text"
  | "header_with_text"
  | "header_h1_section"
  | "header_h2_section"
  | "header_h3_section"
  | "header_h4_section"
  | "header_h5_section"
  | "header_h6_section"
  
  // Lists (Python docs enhanced)
  | "bullet"
  | "sub_bullet"
  | "numbered_list_item"
  | "check_item_checked"
  | "check_item_unchecked"
  | "header_with_list"
  | "header_with_bullets"
  | "header_with_numbered_list"
  | "numbered_list_without_header"
  | "numbered_list"
  | "bold_text_with_sub_bullets"
  | "checklist"
  
  // Text Types (Python docs enhanced)
  | "bold_text"
  | "bold_text_section"
  
  // Formatting
  | "line_break"
  | "thematic_break"
  
  // References and Links
  | "reference"
  | "link_section"
  | "citation"
  
  // Media
  | "image_section"
  | "video_section"
  | "audio_section"
  
  // Special
  | "other_section_type"
  | "unknown_section"
  | "metadata_section"
  | "summary_section"
  | "conclusion_section"
  | string;

// ==========================================
// VALIDATION UTILITIES
// ==========================================

export interface BaseContentItem {
  type: string;
  content: string;
  [key: string]: JsonValue | undefined;
}

export interface BaseSection {
  section?: string;
  type?: string;
  content?: string[];
  children?: BaseContentItem[];
  [key: string]: JsonValue | BaseContentItem[] | undefined;
}

export const isValidString = (value: unknown): value is string => {
  return typeof value === 'string';
};

export const isValidStringArray = (value: unknown): value is string[] => {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
};

export const isValidContentItem = (item: unknown): item is BaseContentItem => {
  return (
    !!item &&
    typeof item === 'object' &&
    typeof (item as Record<string, unknown>).type === 'string' &&
    typeof (item as Record<string, unknown>).content === 'string'
  );
};

export const isValidContentItemArray = (items: unknown): items is BaseContentItem[] => {
  return Array.isArray(items) && items.every(item => isValidContentItem(item));
};

export const isValidBaseSection = (section: unknown): section is BaseSection => {
  if (!section || typeof section !== 'object') return false;

  const s = section as Record<string, unknown>;
  const hasStringContent = !!s.content && isValidStringArray(s.content);
  const hasChildrenContent = !!s.children && isValidContentItemArray(s.children);
  const hasSectionType = typeof s.section === 'string' || typeof s.type === 'string';

  return hasSectionType && (hasStringContent || hasChildrenContent);
};

export const isValidBaseSectionArray = (data: unknown): data is BaseSection[] => {
  return Array.isArray(data) && data.every(section => isValidBaseSection(section));
};

// ==========================================
// SECTION TYPE UTILITIES
// ==========================================

export const getSectionTypeLabel = (sectionType: string): string => {
  const labelMap: { [key: string]: string } = {
    // Content Types
    "intro_text": "Introduction Text",
    "outro_text": "Outro Text",
    "paragraph": "Paragraph",
    "paragraph_section": "Paragraph",
    "plain_text": "Plain Text",
    
    // Code and Technical (Python enhanced)
    "code_block": "Code Block",
    "code_block_section": "Code Block",
    "json_block": "JSON Block",
    "json_block_section": "JSON Block",
    "xml_block_section": "XML Block",
    "xml_block_thinking_section": "XML Thinking Block",
    "xml_block_function_calls_section": "XML Function Calls",
    
    // Tables and Data (Python enhanced)
    "table": "Table",
    "table_block": "Table Block",
    "table_block_section": "Table",
    "entries_and_values": "Entries and Values",
    "entry_and_value": "Entry and Value",
    "entry_and_value_section": "Entry and Value",
    
    // Headers (all Python variants)
    "header_h1": "H1 Header",
    "header_h2": "H2 Header", 
    "header_h3": "H3 Header",
    "header_h4": "H4 Header",
    "header_h5": "H5 Header",
    "header_h6": "H6 Header",
    "header_h1_underlined": "H1 Header (Underlined)",
    "header_h2_underlined": "H2 Header (Underlined)",
    "header_with_or_without_text": "Header with Optional Text",
    "header_with_text": "Header with Text",
    "header_with_list": "Header with List",
    "header_with_bullets": "Header with Bullets",
    "header_with_numbered_list": "Header with Numbered List",
    "header_h1_section": "Header H1",
    "header_h2_section": "Header H2",
    "header_h3_section": "Header H3",
    "header_h4_section": "Header H4",
    "header_h5_section": "Header H5",
    "header_h6_section": "Header H6",
    
    // Lists (all Python variants)
    "bullet": "Bullet Point",
    "sub_bullet": "Sub Bullet Point",
    "numbered_list_item": "Numbered List Item",
    "check_item_checked": "Checked Item",
    "check_item_unchecked": "Unchecked Item",
    "numbered_list_without_header": "Numbered List",
    "numbered_list": "Numbered List",
    "bold_text_with_sub_bullets": "Bold Text with Sub-bullets",
    "checklist": "Checklist",
    
    // Text Types (Python enhanced)
    "bold_text": "Bold Text",
    "bold_text_section": "Bold Text",
    
    // Formatting
    "line_break": "Line Break",
    "thematic_break": "Thematic Break",
    
    // References and Links
    "reference": "Reference",
    "link_section": "Link",
    "citation": "Citation",
    
    // Media
    "image_section": "Image",
    "video_section": "Video",
    "audio_section": "Audio",
    
    // Special
    "other_section_type": "Other Section",
    "unknown_section": "Unknown Section",
    "metadata_section": "Metadata",
    "summary_section": "Summary",
    "conclusion_section": "Conclusion"
  };
  
  // Handle numbered duplicates (section_name_2, section_name_3, etc.)
  const baseType = sectionType.replace(/_\d+$/, '');
  const match = sectionType.match(/_(\d+)$/);
  const number = match ? ` (${match[1]})` : '';
  
  // Handle dynamic XML patterns
  if (sectionType.startsWith('xml_block_') && sectionType.endsWith('_section')) {
    const xmlType = sectionType.replace('xml_block_', '').replace('_section', '');
    return `XML ${xmlType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Block`;
  }
  
  return (labelMap[baseType] || baseType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())) + number;
};

export const getSectionTypeIcon = (sectionType: string, size: number = 16) => {
  const iconProps = { size, className: "text-gray-500 dark:text-gray-400" };
  
  // Enhanced type map for easier extensibility and better Python system integration
  const typeMap: Record<string, React.ReactNode> = {
    // Content Types
    "intro_text": <BookOpen {...iconProps} />,
    "outro_text": <BookOpen {...iconProps} />,
    "paragraph": <Type {...iconProps} />,
    "paragraph_section": <Type {...iconProps} />,
    "plain_text": <Type {...iconProps} />,
    
    // Code and Technical (Python enhanced)
    "code_block": <Code {...iconProps} />,
    "code_block_section": <Code {...iconProps} />,
    "json_block": <Braces {...iconProps} />,
    "json_block_section": <Braces {...iconProps} />,
    "xml_block_section": <Code {...iconProps} />,
    "xml_block_thinking_section": <Code {...iconProps} />,
    "xml_block_function_calls_section": <Code {...iconProps} />,
    
    // Tables and Data (Python enhanced)
    "table": <Table {...iconProps} />,
    "table_block": <Table {...iconProps} />,
    "table_block_section": <Table {...iconProps} />,
    "entries_and_values": <List {...iconProps} />,
    "entry_and_value": <List {...iconProps} />,
    "entry_and_value_section": <List {...iconProps} />,
    
    // Headers (all Python variants)
    "header_h1": <Hash {...iconProps} />,
    "header_h2": <Hash {...iconProps} />,
    "header_h3": <Hash {...iconProps} />,
    "header_h4": <Hash {...iconProps} />,
    "header_h5": <Hash {...iconProps} />,
    "header_h6": <Hash {...iconProps} />,
    "header_h1_underlined": <Hash {...iconProps} />,
    "header_h2_underlined": <Hash {...iconProps} />,
    "header_with_or_without_text": <Hash {...iconProps} />,
    "header_with_text": <Hash {...iconProps} />,
    "header_with_list": <Hash {...iconProps} />,
    "header_with_bullets": <Hash {...iconProps} />,
    "header_with_numbered_list": <Hash {...iconProps} />,
    "header_h1_section": <Hash {...iconProps} />,
    "header_h2_section": <Hash {...iconProps} />,
    "header_h3_section": <Hash {...iconProps} />,
    "header_h4_section": <Hash {...iconProps} />,
    "header_h5_section": <Hash {...iconProps} />,
    "header_h6_section": <Hash {...iconProps} />,
    
    // Lists (all Python variants)
    "bullet": <List {...iconProps} />,
    "sub_bullet": <List {...iconProps} />,
    "numbered_list_item": <Hash {...iconProps} />,
    "check_item_checked": <CheckSquare {...iconProps} />,
    "check_item_unchecked": <CheckSquare {...iconProps} />,
    "numbered_list_without_header": <Hash {...iconProps} />,
    "numbered_list": <Hash {...iconProps} />,
    "bold_text_with_sub_bullets": <Type {...iconProps} />,
    "checklist": <CheckSquare {...iconProps} />,
    
    // Text Types (Python enhanced)
    "bold_text": <Type {...iconProps} />,
    "bold_text_section": <Type {...iconProps} />,
    
    // Formatting
    "line_break": <Minus {...iconProps} />,
    "thematic_break": <Minus {...iconProps} />,
    
    // References and Links
    "reference": <Link {...iconProps} />,
    "link_section": <Link {...iconProps} />,
    "citation": <Quote {...iconProps} />,
    
    // Media
    "image_section": <Image {...iconProps} />,
    "video_section": <Archive {...iconProps} />,
    "audio_section": <Archive {...iconProps} />,
    
    // Special
    "unknown_section": <HelpCircle {...iconProps} />,
    "metadata_section": <Info {...iconProps} />,
    "summary_section": <Star {...iconProps} />,
    "conclusion_section": <Star {...iconProps} />,
  };

  // Check for exact match first
  if (typeMap[sectionType]) {
    return typeMap[sectionType];
  }
  
  // Handle dynamic XML block patterns (xml_block_*)
  if (sectionType.startsWith('xml_block_') && sectionType.endsWith('_section')) {
    return <Code {...iconProps} />;
  }
  
  // Handle numbered duplicates (section_name_2, section_name_3, etc.)
  const baseType = sectionType.replace(/_\d+$/, '');
  if (typeMap[baseType]) {
    return typeMap[baseType];
  }
  
  // Default fallback
  return <FileText {...iconProps} />;
};

// ==========================================
// COPY UTILITIES
// ==========================================

export const copyTextToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (!text || !text.trim()) {
      return false;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
};

export const extractTextFromHTML = (htmlString: string): string => {
  return htmlString.replace(/<[^>]*>/g, '').trim();
};

export const stringArrayToText = (strings: string[]): string => {
  return strings.filter(str => str && str.trim()).join('\n');
};

// ==========================================
// REUSABLE COMPONENTS
// ==========================================

interface JsonFallbackProps {
  data: unknown;
  onCopy?: () => void;
  title?: string;
  subtitle?: string;
  className?: string;
}

export const JsonFallback: React.FC<JsonFallbackProps> = ({ 
  data, 
  onCopy, 
  title = "Raw Data (JSON)",
  subtitle = "Unexpected Format",
  className = ""
}) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    try {
      const jsonString = JSON.stringify(data, null, 2);
      const success = await copyTextToClipboard(jsonString);
      
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        onCopy?.();
      }
    } catch (err) {
      console.error('Failed to copy JSON:', err);
    }
  };

  return (
    <div className={`w-full h-full p-4 bg-gray-50 dark:bg-gray-900 ${className}`}>
      <div className="h-full max-w-7xl mx-auto">
        <div className="h-full bg-textured border-border rounded-lg overflow-hidden shadow-sm">
          <div className="p-4 border-b border-border bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText size={16} className="text-gray-500 dark:text-gray-400" />
                <h3 className="font-semibold text-gray-800 dark:text-gray-200">
                  {title}
                </h3>
                <span className="text-sm text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/20 px-2 py-1 rounded-md">
                  {subtitle}
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

interface InvalidDataDisplayProps {
  data: unknown;
  title?: string;
  className?: string;
}

export const InvalidDataDisplay: React.FC<InvalidDataDisplayProps> = ({ 
  data, 
  title = "Invalid Data",
  className = ""
}) => {
  return (
    <div className={`bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle size={16} className="text-orange-500 dark:text-orange-400" />
        <span className="font-medium text-orange-600 dark:text-orange-400">
          {title}
        </span>
      </div>
      <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-800 p-3 rounded border-border overflow-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
};

interface CopyButtonProps {
  onCopy: () => void;
  copied: boolean;
  size?: number;
  className?: string;
  title?: string;
}

export const CopyButton: React.FC<CopyButtonProps> = ({ 
  onCopy, 
  copied, 
  size = 16, 
  className = "",
  title = "Copy to clipboard"
}) => {
  return (
    <button
      onClick={onCopy}
      className={`p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors group ${className}`}
      title={title}
    >
      {copied ? (
        <Check size={size} className="text-green-500" />
      ) : (
        <Copy size={size} className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
      )}
    </button>
  );
};

// ==========================================
// CONTENT SUMMARY UTILITIES
// ==========================================

export const extractSummaryFromContent = (content: string[] | string, maxLength: number = 50): string => {
  if (!content) return 'No content';
  
  const text = Array.isArray(content) ? content.join(' ') : content;
  const cleanText = extractTextFromHTML(text).trim();
  
  if (!cleanText) return 'No content';
  
  return cleanText.length > maxLength ? cleanText.substring(0, maxLength) + '...' : cleanText;
};

export const countValidItems = (items: unknown[]): number => {
  if (!Array.isArray(items)) return 0;
  return items.filter(item => {
    if (item == null) return false;
    if (typeof item === 'string') return !!item.trim();
    if (typeof item === 'object') {
      const content = (item as Record<string, unknown>).content;
      return typeof content === 'string' && !!content.trim();
    }
    return false;
  }).length;
};

// ==========================================
// COMMON HOOKS
// ==========================================

export const useCopyToClipboard = () => {
  const [copied, setCopied] = useState(false);
  
  const copy = async (text: string): Promise<boolean> => {
    const success = await copyTextToClipboard(text);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    return success;
  };
  
  return { copied, copy };
};

export const useSelectedIndex = (maxIndex: number) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  
  const selectIndex = (index: number) => {
    if (index >= 0 && index < maxIndex) {
      setSelectedIndex(index);
    }
  };
  
  return { selectedIndex, selectIndex };
};

// ==========================================
// ENHANCED CONTENT PROCESSING UTILITIES
// ==========================================

/**
 * Detects if content has enhanced parsed data (parsed_json, parsed_table)
 */
export const hasEnhancedContent = (data: unknown): boolean => {
  if (!data || typeof data !== 'object') return false;

  const d = data as Record<string, unknown>;
  // Check for parsed_json or parsed_table at root level
  if (d.parsed_json || d.parsed_table) return true;

  // Check for parsed content in children
  if (Array.isArray(d.children)) {
    return d.children.some((child: unknown) => hasEnhancedContent(child));
  }

  // Check for parsed content in nested objects
  if (Array.isArray(d.content)) {
    return d.content.some((item: unknown) => hasEnhancedContent(item));
  }

  return false;
};

/**
 * Extracts enhanced content when available, falls back to regular content
 */
export const getEnhancedContent = (data: unknown): string => {
  if (!data || typeof data !== 'object') return '';

  const d = data as Record<string, unknown>;
  // Priority: parsed_json > parsed_table > regular content
  if (d.parsed_json) {
    return typeof d.parsed_json === 'string' ? d.parsed_json : JSON.stringify(d.parsed_json, null, 2);
  }

  if (d.parsed_table) {
    return typeof d.parsed_table === 'string' ? d.parsed_table : JSON.stringify(d.parsed_table, null, 2);
  }

  // Fallback to regular content
  if (typeof d.content === 'string') return d.content;
  if (Array.isArray(d.content)) return d.content.join('\n');

  return '';
};

/**
 * Handles dynamic keys with suffixes (_2, _3, etc.)
 */
export const normalizeDynamicKey = (key: string): { baseKey: string; suffix: string; number: number } => {
  const match = key.match(/^(.+?)(_\d+)$/);
  if (match) {
    const baseKey = match[1];
    const suffix = match[2];
    const number = parseInt(suffix.replace('_', ''));
    return { baseKey, suffix, number };
  }
  return { baseKey: key, suffix: '', number: 0 };
};

/**
 * Groups dynamic keys by their base names
 */
export const groupDynamicKeys = (keys: string[]): Record<string, string[]> => {
  const groups: Record<string, string[]> = {};
  
  keys.forEach(key => {
    const { baseKey } = normalizeDynamicKey(key);
    if (!groups[baseKey]) {
      groups[baseKey] = [];
    }
    groups[baseKey].push(key);
  });
  
  return groups;
};

/**
 * Enhanced type detection that handles extensions and registrations
 */
export const detectSectionType = (data: unknown): string => {
  if (!data || typeof data !== 'object') return 'unknown_section';

  const d = data as Record<string, unknown>;
  // Direct type field
  if (typeof d.type === 'string') {
    return d.type;
  }

  // Key-based detection (for key-value objects)
  const keys = Object.keys(d);
  if (keys.length === 1) {
    const key = keys[0];
    const { baseKey } = normalizeDynamicKey(key);

    // Check if it's a known section type
    if (baseKey.endsWith('_section')) {
      return baseKey;
    }
  }

  // Enhanced content detection
  if (hasEnhancedContent(d)) {
    if (d.parsed_json) return 'json_block_section';
    if (d.parsed_table) return 'table_block_section';
  }

  // Fallback detection
  if (d.section || d.content) {
    return 'other_section_type';
  }

  return 'unknown_section';
};

/**
 * Advanced line break processing for Python explicit \n characters
 */
export const preprocessContentForLineBreaks = (content: string): string => {
  if (!content || typeof content !== 'string') return content;
  
  // Convert single \n to double \n for proper markdown paragraph breaks
  // But preserve existing double \n (don't make them quadruple)
  return content.replace(/(?<!\n)\n(?!\n)/g, '\n\n');
};

/**
 * Handler registry for extensible type management
 */
interface TypeHandler {
  icon: React.ReactNode;
  label: string;
  renderer?: React.ComponentType<Record<string, unknown>>;
}

class TypeHandlerRegistry {
  private handlers: Record<string, TypeHandler> = {};
  
  register(type: string, handler: TypeHandler) {
    this.handlers[type] = handler;
  }
  
  get(type: string): TypeHandler | null {
    return this.handlers[type] || null;
  }
  
  has(type: string): boolean {
    return type in this.handlers;
  }
  
  getAllTypes(): string[] {
    return Object.keys(this.handlers);
  }
}

// Global registry instance
export const typeHandlerRegistry = new TypeHandlerRegistry(); 