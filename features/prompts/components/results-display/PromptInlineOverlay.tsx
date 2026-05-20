"use client";

import React, { useState, useEffect } from 'react';
import { useAppSelector } from '@/lib/redux/hooks';
import { selectPrimaryResponseTextByTaskId, selectPrimaryResponseEndedByTaskId } from '@/lib/redux/socket-io/selectors/socket-response-selectors';
import { Check, X, CornerDownLeft, ArrowLeftToLine, ArrowRightFromLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RichDocument } from '@/features/rich-document/RichDocument';
import type { ContentSource } from '@/features/rich-document/types';

interface PromptInlineOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  result: string;
  originalText: string;
  promptName: string;
  runId?: string; // ⭐ Execution instance runId
  taskId?: string;
  isStreaming: boolean;
  onReplace?: (text: string) => void;
  onInsertBefore?: (text: string) => void;
  onInsertAfter?: (text: string) => void;
}

/**
 * PromptInlineOverlay - Inline text replacement overlay with diff view
 * 
 * Features:
 * - Shows original text vs AI result with markdown rendering
 * - Replace, Insert Before, Insert After actions
 * - Diff highlighting (future enhancement)
 * - Positioned near text selection
 * - Streaming support
 * - Uses RichDocument (mini-bar actions) for rendering
 */
export default function PromptInlineOverlay({
  isOpen,
  onClose,
  result: initialResult,
  originalText,
  promptName,
  runId,
  taskId,
  isStreaming: initialStreaming,
  onReplace,
  onInsertBefore,
  onInsertAfter,
}: PromptInlineOverlayProps) {
  const [isExiting, setIsExiting] = useState(false);
  
  // Get live streaming result if taskId provided
  const streamingResult = useAppSelector(state => 
    taskId ? selectPrimaryResponseTextByTaskId(taskId)(state) : null
  );
  const hasEnded = useAppSelector(state => 
    taskId ? selectPrimaryResponseEndedByTaskId(taskId)(state) : true
  );
  
  const result = streamingResult || initialResult;
  const isStreaming = taskId ? !hasEnded : initialStreaming;

  const handleAction = (action: () => void) => {
    setIsExiting(true);
    setTimeout(() => {
      action();
      onClose();
    }, 200);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Fade animation for loading state */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes fadeInOut {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
          }
        `
      }} />
      
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[100]"
        onClick={onClose}
      />
      
      {/* Inline Overlay - Compact Style */}
      <div className="fixed z-[101] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl">
        <div className="bg-[#1e1e1e] dark:bg-[#1e1e1e] text-[#d4d4d4] dark:text-[#d4d4d4] rounded-lg shadow-2xl border border-[#3e3e42] dark:border-[#3e3e42] overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 border-b border-[#3e3e42] dark:border-[#3e3e42] flex items-center justify-between">
            <div className="text-xs font-medium text-[#cccccc] dark:text-[#cccccc]">{promptName || 'AI Result'}</div>
            {isStreaming && (
              <div className="text-[10px] text-[#858585] animate-[fadeInOut_2s_ease-in-out_infinite]">
                Thinking...
              </div>
            )}
          </div>
          
          {/* Content - Compact display */}
          <div className="px-3 py-3 max-h-[60vh] overflow-y-auto">
            {isStreaming && !result ? (
              <div className="flex items-start">
                <span className="text-sm text-[#858585] animate-[fadeInOut_2s_ease-in-out_infinite]">
                  Thinking...
                </span>
              </div>
            ) : result ? (
              <div className="text-sm leading-relaxed">
                <RichDocument
                  content={result}
                  source={
                    runId
                      ? ({ type: "prompt-result", executionId: runId } as ContentSource)
                      : ({ type: "raw" } as ContentSource)
                  }
                  actionsVariant="mini-bar"
                  actionsClassName="mt-1.5"
                  actions={{ exclude: ["announcements", "preferences"] }}
                  hideCopyButton
                />
              </div>
            ) : (
              <div className="text-sm text-[#858585] italic">No result</div>
            )}
          </div>

          {/* Actions - compact footer with inline action buttons */}
          <div className="flex items-center gap-1 px-2 py-1 bg-[#252526] dark:bg-[#252526] border-t border-[#3e3e42] dark:border-[#3e3e42]">
            {onReplace && (
              <button
                onClick={() => handleAction(() => onReplace(result))}
                disabled={isStreaming || !result}
                className="p-1.5 text-[#cccccc] hover:bg-[#2a2d2e] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Replace selected text"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            )}
            {onInsertBefore && (
              <button
                onClick={() => handleAction(() => onInsertBefore(result))}
                disabled={isStreaming || !result}
                className="p-1.5 text-[#cccccc] hover:bg-[#2a2d2e] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Insert before"
              >
                <ArrowLeftToLine className="w-3.5 h-3.5" />
              </button>
            )}
            {onInsertAfter && (
              <button
                onClick={() => handleAction(() => onInsertAfter(result))}
                disabled={isStreaming || !result}
                className="p-1.5 text-[#cccccc] hover:bg-[#2a2d2e] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Insert after"
              >
                <ArrowRightFromLine className="w-3.5 h-3.5" />
              </button>
            )}
            
            <div className="flex-1" />
            
            <button
              onClick={onClose}
              className="px-2 py-1 text-xs text-[#cccccc] hover:bg-[#2a2d2e] rounded transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

