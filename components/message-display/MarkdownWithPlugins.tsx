"use client";

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import { Components } from 'react-markdown';
import {
  guardMarkdownDelimiters,
  reportDelimiterViolations,
} from '@/lib/markdown/delimiter-guard';

export interface MarkdownWithPluginsProps {
  content: string;
  components: Components;
}

const MarkdownWithPlugins = ({ content, components }: MarkdownWithPluginsProps) => {
  // A stray `$$` or unclosed `[` swallows prose into one node — guard it
  // before the pipeline sees it (lib/markdown/delimiter-guard.ts).
  const { text: guarded, violations } = guardMarkdownDelimiters(content);
  const signature = violations.map((v) => `${v.reason}@${v.index}`).join('|');
  React.useEffect(() => {
    if (!signature) return;
    reportDelimiterViolations(violations, {
      renderPath: 'MarkdownWithPlugins',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signature is the stable identity of `violations`
  }, [signature]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
      rehypePlugins={[rehypeRaw]}
      components={components}
    >
      {guarded}
    </ReactMarkdown>
  );
};

export default MarkdownWithPlugins; 