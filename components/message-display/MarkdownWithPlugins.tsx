"use client";

import React from 'react';
import MarkdownCore from '@ai-matrx/rich-content/markdown-core/MarkdownCore';
import type { Components } from 'react-markdown';
import {
  guardMarkdownDelimiters,
  reportDelimiterViolations,
} from '@ai-matrx/content-ir/source';
import { captureError } from '@/lib/diagnostics/errorCaptureStore';
import { KindTextGate } from '@ai-matrx/rich-content/display/chat-markdown/KindTextGate';

export interface MarkdownWithPluginsProps {
  content: string;
  components: Components;
  /** A deliberate source view — `__kind` text is drawn as written. Default false. */
  showSource?: boolean;
}

/**
 * Text carrying a `__kind` key is handed to the canonical pipeline
 * (`KindTextGate`) — this leaf never draws a kind as a JSON code card.
 */
const MarkdownWithPlugins = (props: MarkdownWithPluginsProps) => (
  <KindTextGate
    component="MarkdownWithPlugins"
    content={props.content}
    imagePolicy="inherit"
    showSource={props.showSource}
  >
    <MarkdownWithPluginsBody content={props.content} components={props.components} />
  </KindTextGate>
);

const MarkdownWithPluginsBody = ({ content, components }: MarkdownWithPluginsProps) => {
  // A stray `$$` or unclosed `[` swallows prose into one node — guard it
  // before the pipeline sees it (lib/markdown/delimiter-guard.ts).
  const { text: guarded, violations } = guardMarkdownDelimiters(content);
  const signature = violations.map((v) => `${v.reason}@${v.index}`).join('|');
  React.useEffect(() => {
    if (!signature) return;
    reportDelimiterViolations(violations, {
      renderPath: 'MarkdownWithPlugins',
      capture: captureError,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signature is the stable identity of `violations`
  }, [signature]);

  return (
    <MarkdownCore preset="message" components={components}>
      {guarded}
    </MarkdownCore>
  );
};

export default MarkdownWithPlugins;
