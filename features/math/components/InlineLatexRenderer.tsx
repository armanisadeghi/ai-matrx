"use client";
import React, { memo, useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { normalizeLaTeX } from '../utils/latex-normalizer';

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });

interface InlineLatexRendererProps {
  content: string;
  className?: string;
  /**
   * Whether to apply LaTeX normalization (fixes fractions, spacing, escape sequences)
   * Default: true
   */
  normalize?: boolean;
}

/**
 * Error boundary component specifically for LaTeX rendering
 * Catches errors and displays plain text fallback
 */
class LaTeXErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: string },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn('[InlineLatexRenderer] LaTeX rendering failed, showing plain text:', {
      error: error.message,
      content: this.props.fallback.substring(0, 100)
    });
  }

  override render() {
    if (this.state.hasError) {
      return <span>{this.props.fallback}</span>;
    }
    return this.props.children;
  }
}

/**
 * Shared component for rendering inline LaTeX in text content
 * 
 * This is the unified LaTeX renderer used across the application for rendering
 * text that may contain math notation. It handles:
 * - Both inline ($...$) and display ($$...$$) math
 * - Escape sequence corruption from JSON (e.g., \text becoming [TAB]ext)
 * - Common AI formatting mistakes (fractions, spacing, etc.)
 * - **Graceful degradation**: If rendering fails, shows plain text instead of crashing
 * 
 * Used by:
 * - Quiz questions, options, and explanations
 * - Math problem blocks
 * - Any other text that may contain LaTeX notation
 * 
 * @example
 * ```tsx
 * <InlineLatexRenderer content="Water ($\text{H}_2\text{O}$) is essential" />
 * ```
 */
export const InlineLatexRenderer = memo<InlineLatexRendererProps>(({ 
  content, 
  className = '',
  normalize = true 
}) => {
  const [renderError, setRenderError] = useState(false);
  
  // Apply LaTeX normalization to fix common issues
  const processedContent = useMemo(() => {
    try {
      return normalize ? normalizeLaTeX(content) : content;
    } catch (error) {
      console.warn('[InlineLatexRenderer] Normalization failed:', error);
      return content; // Return original content if normalization fails
    }
  }, [content, normalize]);
  
  // Reset error state when content changes
  useEffect(() => {
    setRenderError(false);
  }, [content]);
  
  // If there was a render error, just show plain text
  if (renderError) {
    return <span className={className}>{content}</span>;
  }
  
  try {
    return (
      <LaTeXErrorBoundary fallback={content}>
        <span className={className}>
          <ReactMarkdown
            remarkPlugins={[remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              // Render paragraphs as spans for inline display
              p: ({ children }) => <span>{children}</span>,
              // Remove extra spacing from math elements
              div: ({ children }) => <span>{children}</span>
            }}
          >
            {processedContent}
          </ReactMarkdown>
        </span>
      </LaTeXErrorBoundary>
    );
  } catch (error) {
    // Catch any synchronous errors
    console.warn('[InlineLatexRenderer] Render failed, showing plain text:', error);
    setRenderError(true);
    return <span className={className}>{content}</span>;
  }
});

InlineLatexRenderer.displayName = 'InlineLatexRenderer';

