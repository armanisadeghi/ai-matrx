import React, { useState } from 'react';
import { Copy, Check, FileText, Hash, Type, List, Minus, Quote, Link, CornerDownLeft, Square, SquareCheckBig } from 'lucide-react';
import { addUtmSource } from '@/utils/url-utm';

export interface LineItem {
  type: string;
  content: string;
}

const getLineIcon = (lineType: string) => {
  const iconProps = { size: 16, className: "text-gray-500 dark:text-gray-400" };
  
  switch (lineType) {
    case "header_h1":
    case "header_h2":
    case "header_h3":
    case "header_h4":
    case "header_h5":
    case "header_h6":
    case "header_h1_underlined":
    case "header_h2_underlined":
      return <Hash {...iconProps} />;
    case "check_item_checked":
    case "check_item_unchecked":
      return <List {...iconProps} />;
    case "bullet":
    case "sub_bullet":
      return <List {...iconProps} />;
    case "numbered_list_item":
      return <Hash {...iconProps} />;
    case "quote":
      return <Quote {...iconProps} />;
    case "link":
    case "image":
      return <Link {...iconProps} />;
    case "reference":
      return <FileText {...iconProps} />;
    case "entry_and_value":
      return <List {...iconProps} />;
    case "thematic_break":
      return <Minus {...iconProps} />;
    case "paragraph":
      return <Type {...iconProps} />;
    case "bold_text":
    case "italic_text":
      return <Type {...iconProps} />;
    case "line_break":
      return <CornerDownLeft {...iconProps} />;
    case "other_text":
      return <FileText {...iconProps} />;
    default:
      return <FileText {...iconProps} />;
  }
};

const getLineLabel = (lineType: string) => {
  return lineType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const renderLineItem = (item: LineItem) => {
  const { type, content } = item;
  
  if (type === "line_break") {
    return <div className="h-3" />;
  }
  
  if (type === "thematic_break") {
    return <hr className="my-2 border-gray-300 dark:border-gray-600" />;
  }
  
  if (type === "header_h1" || type === "header_h1_underlined") {
    return (
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
        {content}
      </h1>
    );
  }
  
  if (type === "header_h2" || type === "header_h2_underlined") {
    return (
      <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
        {content}
      </h2>
    );
  }
  
  if (type === "header_h3") {
    return (
      <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">
        {content}
      </h3>
    );
  }
  
  if (type === "header_h4") {
    return (
      <h4 className="text-base font-medium text-gray-800 dark:text-gray-200">
        {content}
      </h4>
    );
  }
  
  if (type === "header_h5") {
    return (
      <h5 className="text-sm font-medium text-gray-800 dark:text-gray-200">
        {content}
      </h5>
    );
  }
  
  if (type === "header_h6") {
    return (
      <h6 className="text-xs font-medium text-gray-800 dark:text-gray-200">
        {content}
      </h6>
    );
  }
  
  if (type === "bullet") {
    return (
      <div className="flex items-start gap-2">
        <span className="text-gray-600 dark:text-gray-400 mt-1">•</span>
        <div 
          className="text-gray-700 dark:text-gray-300"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </div>
    );
  }
  
  if (type === "sub_bullet") {
    return (
      <div className="flex items-start gap-2 ml-4">
        <span className="text-gray-600 dark:text-gray-400 mt-1">◦</span>
        <div 
          className="text-gray-700 dark:text-gray-300"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </div>
    );
  }
  
  if (type === "numbered_list_item") {
    return (
      <div className="text-gray-700 dark:text-gray-300">
        {content}
      </div>
    );
  }
  
  if (type === "check_item_checked") {
    return (
      <div className="flex items-start gap-2">
        <SquareCheckBig
          className="mt-1 h-4 w-4 shrink-0 text-green-600 dark:text-green-400"
          aria-hidden="true"
        />
        <div className="text-gray-700 dark:text-gray-300">
          {content}
        </div>
      </div>
    );
  }
  
  if (type === "check_item_unchecked") {
    return (
      <div className="flex items-start gap-2">
        <Square
          className="mt-1 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
          aria-hidden="true"
        />
        <div className="text-gray-700 dark:text-gray-300">
          {content}
        </div>
      </div>
    );
  }
  
  if (type === "quote") {
    return (
      <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-600 dark:text-gray-400">
        {content}
      </blockquote>
    );
  }
  
  if (type === "bold_text") {
    return (
      <div className="font-bold text-gray-800 dark:text-gray-200">
        {content}
      </div>
    );
  }
  
  if (type === "italic_text") {
    return (
      <div className="italic text-gray-700 dark:text-gray-300">
        {content}
      </div>
    );
  }
  
  if (type === "link") {
    return (
      <a href={addUtmSource(content)} className="text-blue-600 dark:text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }
  
  if (type === "image") {
    return (
      <div className="text-gray-700 dark:text-gray-300">
        <span className="text-gray-500 dark:text-gray-400">[Image: </span>
        {content}
        <span className="text-gray-500 dark:text-gray-400">]</span>
      </div>
    );
  }
  
  if (type === "reference") {
    return (
      <div className="text-gray-600 dark:text-gray-400 font-mono text-sm">
        {content}
      </div>
    );
  }
  
  if (type === "entry_and_value") {
    return (
      <div 
        className="text-gray-700 dark:text-gray-300"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }
  
  if (type === "paragraph") {
    return (
      <div 
        className="text-gray-700 dark:text-gray-300"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }
  
  return (
    <div className="text-gray-700 dark:text-gray-300">
      {content}
    </div>
  );
};

const LinesViewer = ({ data }: { data: LineItem[] }) => {
  const [selectedLineIndex, setSelectedLineIndex] = useState<number>(0);
  const [copiedData, setCopiedData] = useState<boolean>(false);
  
  const selectedLine = data[selectedLineIndex];
  
  const copyToClipboard = async () => {
    try {
      const textContent = selectedLine.content.replace(/<[^>]*>/g, '');
      await navigator.clipboard.writeText(textContent);
      setCopiedData(true);
      setTimeout(() => setCopiedData(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-full p-4 bg-inherit flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">No lines to display</p>
      </div>
    );
  }
  
  return (
    <div className="w-full h-full p-4 bg-gray-50 dark:bg-gray-900">
      <div className="h-full flex gap-4 max-w-7xl mx-auto">
        {/* Simplified Sidebar */}
        <div className="w-16 flex-shrink-0 bg-textured border-border rounded-lg overflow-hidden shadow-sm">
          <div className="p-2 border-b border-border bg-gray-50 dark:bg-gray-900">
            <p className="text-xs text-center text-gray-500 dark:text-gray-400">{data.length}</p>
          </div>
          
          <div className="overflow-y-auto" style={{ height: 'calc(100% - 40px)' }}>
            {data.map((line, index) => {
              return (
                <button
                  key={index}
                  data-line={index}
                  onClick={() => {
                    setSelectedLineIndex(index);
                    // Scroll to the line in the main content
                    const element = document.getElementById(`line-${index}`);
                    if (element) {
                      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }}
                  className={`w-full p-2 text-left border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    selectedLineIndex === index 
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-r-2 border-r-blue-500' 
                      : ''
                  }`}
                  title={`${getLineLabel(line.type)} (Line ${index + 1})`}
                >
                  <div className="flex flex-col items-center gap-1">
                    {getLineIcon(line.type)}
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {index + 1}
                    </span>
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
              <div>
                <h3 className="font-semibold text-gray-800 dark:text-gray-200">
                  Document Content
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {data.length} lines total
                </p>
              </div>
            </div>
          </div>
          
          {/* All Content */}
          <div className="p-6 overflow-y-auto" style={{ height: 'calc(100% - 90px)' }}>
            <div className="max-w-4xl space-y-4">
              {data.map((line, index) => (
                <div
                  key={index}
                  id={`line-${index}`}
                  onClick={() => {
                    setSelectedLineIndex(index);
                    // Scroll sidebar to show selected item
                    const sidebarElement = document.querySelector(`button[data-line="${index}"]`);
                    if (sidebarElement) {
                      sidebarElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }}
                  className={`transition-all duration-200 rounded-lg p-3 -m-3 cursor-pointer ${
                    selectedLineIndex === index 
                      ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-200 dark:ring-blue-800' 
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  {/* Line Header */}
                  <div className="flex items-center gap-2 mb-2 opacity-75">
                    {getLineIcon(line.type)}
                    <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded font-mono">
                      {index + 1}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {getLineLabel(line.type)}
                    </span>
                  </div>
                  
                  {/* Line Content */}
                  <div>
                    {renderLineItem(line)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


export default LinesViewer;
