'use client';

import { ReactNode } from 'react';
import MarkdownCore from '@/components/markdown-core/MarkdownCore';
import type { Components } from 'react-markdown';

interface MarkdownTextDisplayProps {
  content: string | string[];
  className?: string;
  listClassName?: string;
  listItemClassName?: string;
  isCollapsed?: boolean;
}

export default function MarkdownTextDisplay({
  content,
  className = "text-slate-700 dark:text-slate-300",
  listClassName = "list-disc pl-0 space-y-3 mt-2",
  listItemClassName = "",
  isCollapsed = false
}: MarkdownTextDisplayProps): React.ReactNode {
  
  // Custom components for ReactMarkdown
  const customComponents: Components = {
    // Ensure paragraphs in lists display inline
    p: ({ children, ...props }) => <span className="inline" {...props}>{children}</span>
  };
  
  // For a single string
  if (typeof content === 'string') {
    return (
      <div className={`${className} ${isCollapsed ? 'line-clamp-2' : ''}`}>
        <MarkdownCore preset="plain">{content}</MarkdownCore>
      </div>
    );
  }
  
  // For an array of strings
  return (
    <div className={className}>
      <ul className={listClassName}>
        {content.map((item, index) => (
          <li key={index} className={`${listItemClassName} flex items-start`}>
            <span className="inline-block mr-1">•</span>
            <span className="inline-block">
              <MarkdownCore preset="plain" components={customComponents}>
                {item}
              </MarkdownCore>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
} 