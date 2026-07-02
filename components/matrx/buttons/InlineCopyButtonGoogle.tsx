'use client';
import { useState } from 'react';
import { Copy, CheckCircle2, FileText, FileType2 } from 'lucide-react';
import { FcGoogle } from "react-icons/fc";

interface InlineCopyButtonProps {
  content: string | object;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showTooltip?: boolean;
  tooltipText?: string;
  successDuration?: number;
  formatJson?: boolean;
  isMarkdown?: boolean;
  googleDocsFormat?: boolean;
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

// Utility function to convert markdown to Google Docs-friendly HTML
const markdownToGoogleDocsHTML = (markdown: string): string => {
  if (!markdown) return '';
  
  // Add a wrapper with explicit color style to ensure black text
  const startWrapper = '<div style="color: #000000; font-family: Arial, sans-serif;">';
  const endWrapper = '</div>';
  
  // Handle horizontal rules (must be processed first before headings and lists)
  let html = markdown.replace(/^[\-]{3,}$/gm, '<hr style="border: none; border-top: 1px solid #cccccc; margin: 15px 0;">');
  
  // Handle headings
  html = html
    .replace(/^# (.+)$/gm, '<h1 style="color: #000000; font-size: 24px; font-weight: bold;">$1</h1>')
    .replace(/^## (.+)$/gm, '<h2 style="color: #000000; font-size: 20px; font-weight: bold;">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 style="color: #000000; font-size: 16px; font-weight: bold;">$1</h3>')
    .replace(/^#### (.+)$/gm, '<h4 style="color: #000000; font-size: 14px; font-weight: bold;">$1</h4>');
  
  // Handle basic formatting
  html = html
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color: #000000;">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em style="color: #000000;">$1</em>')
    .replace(/\_\_(.+?)\_\_/g, '<strong style="color: #000000;">$1</strong>')
    .replace(/\_(.+?)\_/g, '<em style="color: #000000;">$1</em>');
  
  // Handle bullet lists - improved with list markers
  const bulletListRegex = /^[ \t]*[\*\-\+] (.+)$/gm;
  if (bulletListRegex.test(html)) {
    html = html.replace(bulletListRegex, '<li style="color: #000000;">$1</li>');
    
    // Properly close list tags (this is critical for fixing the indentation issues)
    // First, find all adjacent list items
    let lastIndex = 0;
    let inList = false;
    let processedHtml = '';
    const lines = html.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('<li style="color: #000000;">')) {
        if (!inList) {
          // Start a new list
          processedHtml += '<ul style="color: #000000; margin-top: 8px; margin-bottom: 8px;">\n';
          inList = true;
        }
        processedHtml += line + '\n';
      } else {
        if (inList) {
          // Close the list before adding non-list content
          processedHtml += '</ul>\n';
          inList = false;
        }
        processedHtml += line + '\n';
      }
    }
    
    // Make sure to close any open list at the end
    if (inList) {
      processedHtml += '</ul>\n';
    }
    
    html = processedHtml;
  }
  
  // Handle numbered lists with proper list closing
  const numberedListRegex = /^[ \t]*\d+\. (.+)$/gm;
  if (numberedListRegex.test(html)) {
    html = html.replace(numberedListRegex, '<li style="color: #000000;">$1</li>');
    
    // Similar approach to bullet lists for proper closing of tags
    let lastIndex = 0;
    let inList = false;
    let processedHtml = '';
    const lines = html.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Only match lines that have a list item but aren't already inside a ul
      if (line.includes('<li style="color: #000000;">') && !line.includes('<ul')) {
        if (!inList) {
          // Start a new list
          processedHtml += '<ol style="color: #000000; margin-top: 8px; margin-bottom: 8px;">\n';
          inList = true;
        }
        processedHtml += line + '\n';
      } else {
        if (inList) {
          // Close the list before adding non-list content
          processedHtml += '</ol>\n';
          inList = false;
        }
        processedHtml += line + '\n';
      }
    }
    
    // Make sure to close any open list at the end
    if (inList) {
      processedHtml += '</ol>\n';
    }
    
    html = processedHtml;
  }
  
  // Handle links
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" style="color: #1155cc; text-decoration: underline;">$1</a>');
  
  // Handle blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote style="color: #000000; border-left: 3px solid #ccc; padding-left: 10px; margin-left: 10px;">$1</blockquote>');
  
  // Handle code blocks
  html = html.replace(/```([^`]+)```/gs, '<pre style="color: #000000; background-color: #f5f5f5; padding: 10px; border-radius: 4px; font-family: monospace;"><code style="color: #000000;">$1</code></pre>');
  
  // Handle inline code
  html = html.replace(/`([^`]+)`/g, '<code style="color: #000000; background-color: #f5f5f5; padding: 2px 4px; border-radius: 3px; font-family: monospace;">$1</code>');
  
  // Handle paragraphs (for text not already in tags)
  html = html.replace(/^([^<\n].+)$/gm, '<p style="color: #000000; margin: 8px 0;">$1</p>');
  
  // Clean up multiple paragraph tags
  html = html.replace(/<\/p>\s*<p style="color: #000000; margin: 8px 0;">/g, '</p><p style="color: #000000; margin: 8px 0;">');
  
  // Wrap the entire content to ensure all text has black color
  return startWrapper + html + endWrapper;
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
  isMarkdown = false,
  googleDocsFormat = false,
  onCopySuccess,
  onCopyError
}: InlineCopyButtonProps) => {
  const [copied, setCopied] = useState(false);
  const [showTooltipState, setShowTooltipState] = useState(false);

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
    'bottom-left': 'absolute bottom-1 left-1'
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
      
      // Check if we need to handle this as markdown with Google Docs formatting
      if (isMarkdown && googleDocsFormat && typeof textToCopy === 'string') {
        // Convert markdown to HTML for Google Docs
        const htmlContent = markdownToGoogleDocsHTML(textToCopy);
        
        // Create clipboard item with both HTML and plain text formats
        const clipboardItem = new ClipboardItem({
          'text/html': new Blob([htmlContent], { type: 'text/html' }),
          'text/plain': new Blob([textToCopy], { type: 'text/plain' }) // Fallback to plain markdown
        });
        
        await navigator.clipboard.write([clipboardItem]);
      } else {
        // Use the ClipboardItem API with plain text format to ensure no styling is copied
        const clipboardItem = new ClipboardItem({
          'text/plain': new Blob([textToCopy], { type: 'text/plain' })
        });
        
        await navigator.clipboard.write([clipboardItem]);
      }
      
      setCopied(true);
      onCopySuccess?.();
      
      setTimeout(() => {
        setCopied(false);
      }, successDuration);
    } catch (err) {
      console.error("Primary copy method failed:", err);
      
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

  const handleMouseEnter = () => {
    if (showTooltip) {
      setShowTooltipState(true);
    }
  };

  const handleMouseLeave = () => {
    setShowTooltipState(false);
  };

  const [showFormatOptions, setShowFormatOptions] = useState(false);
  
  const handleButtonClick = (e: React.MouseEvent) => {
    // If it's a markdown content and we support Google Docs format
    if (isMarkdown) {
      setShowFormatOptions(!showFormatOptions);
    } else {
      // For non-markdown content, just copy normally
      handleCopy(e);
    }
  };
  
  const handleRegularCopy = (e: React.MouseEvent) => {
    // Set Google Docs format to false temporarily for the copy operation
    const temp = googleDocsFormat;
    googleDocsFormat = false;
    handleCopy(e);
    googleDocsFormat = temp;
    setShowFormatOptions(false);
  };
  
  const handleGoogleDocsCopy = (e: React.MouseEvent) => {
    // Force Google Docs format for this copy operation
    const temp = googleDocsFormat;
    googleDocsFormat = true;
    handleCopy(e);
    googleDocsFormat = temp;
    setShowFormatOptions(false);
  };
  
  return (
    <div 
      className={`${positionClasses[position]} ${className} inline-flex z-10`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
        <button
          onClick={handleButtonClick}
          className="bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 p-1 rounded-md transition-colors duration-200 z-10"
          aria-label={tooltipText}
        >
          {copied ? (
            <CheckCircle2 className={`${sizeClasses[size]} text-green-500`} />
          ) : (
            <Copy className={`${sizeClasses[size]} text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200`} />
          )}
        </button>
        
        {showTooltipState && !copied && !showFormatOptions && (
          <div className="absolute top-full mt-1 right-0 bg-gray-800 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-20">
            {tooltipText}
          </div>
        )}
        
        {copied && showTooltip && (
          <div className="absolute top-full mt-1 right-0 bg-green-600 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-20">
            Copied!
          </div>
        )}
        
        {/* Format options popup for markdown content */}
        {showFormatOptions && isMarkdown && (
        <div className="absolute top-full mt-1 min-w-48 right-0 bg-textured border-border rounded shadow-lg z-30">
          <button 
            onClick={handleRegularCopy}
            className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center"
          >
            <FileText className="h-4 w-4 mr-2" />
            Plain Text
          </button>
          <button 
            onClick={handleGoogleDocsCopy}
            className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center"
          >
            <FcGoogle className="h-4 w-4 mr-2" />
            Google Docs
          </button>
        </div>
      )}
    </div>
  );
};

export default InlineCopyButton;