import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cleanJson } from '@/utils/json/json-cleaner-utility';
import { cn } from '@/lib/utils';

interface JsonDisplayProps {
  data: unknown;
  className?: string;
  indentLevel?: number;
  maxHeight?: string;
}

const JsonDisplay: React.FC<JsonDisplayProps> = ({
  data,
  className,
  indentLevel = 2,
  maxHeight,
}) => {
  const [copied, setCopied] = useState(false);
  
  const cleanedData = cleanJson(data);
  
  const formattedJson = JSON.stringify(cleanedData, null, indentLevel);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(formattedJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      className={cn(
        "relative w-full h-full",
        "border rounded p-2",
        "bg-textured",
        "text-gray-900 dark:text-gray-100",
        "border-gray-300 dark:border-gray-700",
        className
      )}
      style={{
        resize: 'both',
        overflow: 'auto',
        maxHeight
      }}
    >
      <button
        onClick={handleCopy}
        className="absolute top-1 right-1 p-1 rounded
                  bg-textured
                  text-gray-900 dark:text-gray-100
                  hover:bg-gray-100 dark:hover:bg-gray-700"
        title="Copy to clipboard"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
      <pre className="text-xs leading-tight whitespace-pre-wrap font-mono">
        {formattedJson}
      </pre>
    </div>
  );
};

export default JsonDisplay;