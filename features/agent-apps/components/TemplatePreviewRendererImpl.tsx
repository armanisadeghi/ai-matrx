"use client";

/**
 * TemplatePreviewRenderer — static, mock-data preview of a display-mode
 * template. Used by /agent-apps/templates/[mode] to let the user see each
 * UI pattern in action before they pick one.
 *
 * No DB or backend dependency: streaming is simulated via setTimeout. The
 * component contract matches what the real renderer hands to the user's
 * Babel-mounted TSX, so a template that works here will work in production.
 *
 * Ported verbatim from `features/prompt-apps/components/TemplatePreviewRenderer.tsx`
 * with imports retargeted to agent-apps.
 */

import React, { useState, useMemo, useCallback, useRef } from "react";
import { transform } from "@babel/standalone";
import { AlertCircle } from "lucide-react";
import {
  buildComponentScope,
  getDefaultImportsForNewApps,
  getScopeFunctionParameters,
  patchScopeForMissingIdentifiers,
} from "../utils/allowed-imports";
import { AgentAppErrorBoundary } from "./AgentAppErrorBoundary";
import type { AppDisplayMode } from "../types";

interface TemplatePreviewRendererProps {
  templateCode: string;
  displayMode: AppDisplayMode;
  appName: string;
  appTagline: string;
}

const MOCK_RESPONSES = [
  `## Here's a thoughtful response

This is a **simulated AI response** rendered in the template preview. In production, this would be a real streamed response from the agent backend.

### Key Points
- The template handles streaming content display
- Follow-up messages route through the conversation API
- The UI adapts based on the display mode

The response demonstrates how markdown rendering works within each template layout. You can see how the template handles long-form content with proper formatting, including:

1. **Headers** at multiple levels
2. **Lists** both ordered and unordered
3. **Bold** and *italic* text
4. \`Inline code\` snippets

> This blockquote shows how quoted content appears in the template.

Feel free to send follow-up messages to see how the chat continuation works!`,

  `Great follow-up question! Here's another simulated response.

This demonstrates the **conversation continuation** flow. In production:
- The renderer detects an existing \`conversationId\`
- Routes to \`/ai/conversations/{id}\` instead of \`/ai/agents/{id}\`
- Streams the response back in NDJSON format

The template tracks message history locally while the backend handles the actual conversation state.`,

  `Here's a third response to show multiple turns working correctly.

Each message gets its own entry in the local messages array, and the template handles:
- Scroll-to-bottom on new messages
- Streaming indicators during generation
- Error states if something goes wrong
- Rate limit warnings for guest users`,
];

export function TemplatePreviewRenderer({
  templateCode,
  displayMode,
  appName,
  appTagline,
}: TemplatePreviewRendererProps) {
  const [response, setResponse] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const responseIndexRef = useRef(0);

  const resetConversation = useCallback(() => {
    setConversationId(null);
    setResponse("");
    setIsStreaming(false);
    setIsExecuting(false);
    setError(null);
    responseIndexRef.current = 0;
  }, []);

  const handleExecute = useCallback(
    async (
      _variables: Record<string, unknown>,
      _userInput?: string,
    ): Promise<void> => {
      setIsExecuting(true);
      setIsStreaming(true);
      setError(null);
      setResponse("");

      const mockResponse =
        MOCK_RESPONSES[responseIndexRef.current % MOCK_RESPONSES.length];
      responseIndexRef.current++;

      const words = mockResponse.split(" ");
      let accumulated = "";

      for (let i = 0; i < words.length; i++) {
        accumulated += (i === 0 ? "" : " ") + words[i];
        setResponse(accumulated);
        await new Promise((r) => setTimeout(r, 15 + Math.random() * 25));
      }

      if (!conversationId) {
        setConversationId("mock-conversation-" + Date.now());
      }

      setIsStreaming(false);
      setIsExecuting(false);
    },
    [conversationId],
  );

  const CustomComponent = useMemo(() => {
    if (!templateCode) return null;

    try {
      const processedCode = templateCode.replace(
        /import\s+.*?from\s+['"].*?['"];?\s*/g,
        "",
      );

      const babelResult = transform(processedCode, {
        presets: ["react", "typescript"],
        filename: "component.tsx",
      });

      let transformed = babelResult.code || "";
      transformed = transformed.replace(/export\s+default\s+/g, "return ");

      const scope = buildComponentScope(getDefaultImportsForNewApps());
      if (transformed) {
        patchScopeForMissingIdentifiers(transformed, scope);
      }

      const { paramNames, paramValues } = getScopeFunctionParameters(scope);
      const componentFactory = new Function(...paramNames, transformed);
      return componentFactory(...paramValues);
    } catch (err) {
      console.error("Failed to transform template:", err);
      return null;
    }
  }, [templateCode]);

  if (!CustomComponent) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="p-6 bg-destructive/10 border border-destructive/20 rounded-lg max-w-md">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-destructive">Template Error</p>
              <p className="text-sm text-destructive/80 mt-1">
                Failed to compile the {displayMode} template. Check the console
                for details.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AgentAppErrorBoundary appName={appName}>
      <CustomComponent
        onExecute={handleExecute}
        response={response}
        streamEvents={[]}
        isStreaming={isStreaming}
        isExecuting={isExecuting}
        error={error}
        rateLimitInfo={null}
        appName={appName}
        appTagline={appTagline}
        conversationId={conversationId}
        onResetConversation={resetConversation}
      />
    </AgentAppErrorBoundary>
  );
}
