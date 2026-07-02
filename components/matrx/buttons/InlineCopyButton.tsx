'use client';
import { useState } from 'react';
import { Copy, CheckCircle2 } from 'lucide-react';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/components/ui/tooltip";

interface InlineCopyButtonProps {
  content: string | object;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'center-right' | 'center-left';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showTooltip?: boolean;
  tooltipText?: string;
  successDuration?: number;
  formatJson?: boolean;
  onCopySuccess?: () => void;
  onCopyError?: (error: unknown) => void;
}

// Utility function for formatting JSON
const formatJsonForClipboard = (data: unknown): string => {
  const cleanObject = (obj: unknown): unknown => {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(cleanObject);
    }

    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        try {
          // Try to parse stringified JSON and recurse
          const parsed = JSON.parse(value);
          cleaned[key] = cleanObject(parsed);
        } catch {
          // If it's not valid JSON, keep it as a string
          cleaned[key] = value;
        }
      } else {
        cleaned[key] = cleanObject(value);
      }
    }
    return cleaned;
  };
  // Clean the data first, then stringify without extra escapes
  const cleanedData = cleanObject(data);
  return JSON.stringify(cleanedData, null, 2);
};

export const InlineCopyButton = ({
  content,
  position = 'top-right',
  size = 'sm',
  className = '',
  showTooltip = true,
  tooltipText = 'Copy to clipboard',
  successDuration = 2000,
  formatJson = true,
  onCopySuccess,
  onCopyError
}: InlineCopyButtonProps) => {
  const [copied, setCopied] = useState(false);
  
  // Size mapping
  const sizeClasses = {
    xs: 'h-4 w-4',
    sm: 'h-5 w-5',
    md: 'h-6 w-6',
    lg: 'h-7 w-7',
    xl: 'h-8 w-8'
  };
  
  // Position mapping
  const positionClasses = {
    'top-right': 'absolute top-1 right-1',
    'top-left': 'absolute top-1 left-1',
    'bottom-right': 'absolute bottom-1 right-1',
    'bottom-left': 'absolute bottom-1 left-1',
    'center-right': 'absolute top-1/2 right-1 -translate-y-1/2',
    'center-left': 'absolute top-1/2 left-1 -translate-y-1/2'
  };
  
  // Determine the appropriate tooltip side based on button position
  const getTooltipSide = () => {
    switch (position) {
      case 'top-right':
      case 'top-left':
        return 'top';
      case 'bottom-right':
      case 'bottom-left':
        return 'bottom';
      case 'center-right':
        return 'left';
      case 'center-left':
        return 'right';
      default:
        return 'top';
    }
  };
  
  // Determine the tooltip alignment
  const getTooltipAlign = () => {
    if (position.includes('left')) {
      return 'start';
    } else if (position.includes('right')) {
      return 'end';
    }
    return 'center';
  };
  
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event from bubbling up
    
    try {
      // Process content based on type and formatting option
      let textToCopy: string;
      
      if (typeof content === 'object' && content !== null && formatJson) {
        textToCopy = formatJsonForClipboard(content);
      } else if (typeof content === 'string' && formatJson) {
        try {
          // Check if the string is JSON and format it
          const parsed = JSON.parse(content);
          textToCopy = formatJsonForClipboard(parsed);
        } catch {
          // Not valid JSON, use as is
          textToCopy = content;
        }
      } else {
        // Use string conversion for non-JSON or when formatting is disabled
        textToCopy = typeof content === 'string' ? content : JSON.stringify(content);
      }
      
      // Use the ClipboardItem API with plain text format to ensure no styling is copied
      const clipboardItem = new ClipboardItem({
        'text/plain': new Blob([textToCopy], { type: 'text/plain' })
      });
      
      await navigator.clipboard.write([clipboardItem]);
      setCopied(true);
      onCopySuccess?.();
      
      setTimeout(() => {
        setCopied(false);
      }, successDuration);
    } catch (err) {
      // Fall back to the older writeText method if ClipboardItem is not supported
      try {
        const textToCopy = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        await navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        onCopySuccess?.();
        
        setTimeout(() => {
          setCopied(false);
        }, successDuration);
      } catch (fallbackErr) {
        console.error("Failed to copy:", fallbackErr);
        onCopyError?.(fallbackErr);
      }
    }
  };
  
  // Button content
  const buttonContent = (
    <button
      onClick={handleCopy}
      className="bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 p-1 rounded-md transition-colors duration-200 z-10"
      aria-label={tooltipText}
    >
      {copied ? (
        <CheckCircle2 className={`${sizeClasses[size]} text-green-500`} />
      ) : (
        <Copy className={`${sizeClasses[size]} text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200`} />
      )}
    </button>
  );
  
  // If tooltips aren't needed, just return the button
  if (!showTooltip) {
    return (
      <div className={`${positionClasses[position]} ${className} inline-flex z-10`}>
        {buttonContent}
      </div>
    );
  }
  
  // The current tooltip text based on copied state
  const currentTooltipText = copied ? "Copied!" : tooltipText;
  
  return (
    <div className={`${positionClasses[position]} ${className} inline-flex z-10`}>
      <TooltipProvider>
        <Tooltip open={showTooltip ? undefined : false} delayDuration={300}>
          <TooltipTrigger asChild>
            {buttonContent}
          </TooltipTrigger>
          <TooltipContent 
            className={copied ? "bg-green-600 text-white" : ""}
            side={getTooltipSide()}
            sideOffset={5}
            align={getTooltipAlign()}
          >
            {currentTooltipText}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

export default InlineCopyButton;