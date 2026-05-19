"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Code, FileText, Database, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks';
import { startPromptInstance } from '@/lib/redux/prompt-execution/thunks/startInstanceThunk';
import { executeMessage } from '@/lib/redux/prompt-execution/thunks/executeMessageThunk';
import { selectPrimaryResponseTextByTaskId, selectPrimaryResponseEndedByTaskId } from '@/lib/redux/socket-io/selectors/socket-response-selectors';
import { RichDocument } from '@/features/rich-document/RichDocument';
import type { ContentSource } from '@/features/rich-document/types';
import type { PromptExecutionConfig } from '@/features/prompt-builtins/types/execution-modes';

interface PromptExecutionTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  testType: 'direct' | 'inline' | 'background';
  promptId: string;
  promptSource?: 'prompts' | 'prompt_builtins';
  executionConfig: PromptExecutionConfig;
  variables?: Record<string, string>;
  resources?: any[];
  initialMessage?: string;
}

/**
 * PromptExecutionTestModal - Testing interface for non-UI execution modes
 * 
 * Provides realistic testing scenarios for:
 * - Direct: Shows result retrieval for programmatic use
 * - Inline: Simulates text editor with inline overlay
 * - Background: Demonstrates task completion with data storage
 */
export default function PromptExecutionTestModal({
  isOpen,
  onClose,
  testType,
  promptId,
  promptSource = 'prompts',
  executionConfig,
  variables = {},
  resources = [],
  initialMessage = '',
}: PromptExecutionTestModalProps) {
  const dispatch = useAppDispatch();

  // Direct mode state
  const [directResult, setDirectResult] = useState<string>('');
  const [directLoading, setDirectLoading] = useState(false);
  const [directMetadata, setDirectMetadata] = useState<any>(null);
  const [directTaskId, setDirectTaskId] = useState<string | null>(null);

  // Stream direct result in real-time
  const directStreamingText = useAppSelector(state =>
    directTaskId ? selectPrimaryResponseTextByTaskId(directTaskId)(state) : ''
  );
  const directStreamEnded = useAppSelector(state =>
    directTaskId ? selectPrimaryResponseEndedByTaskId(directTaskId)(state) : true
  );

  // Update final result when streaming ends
  useEffect(() => {
    if (directTaskId && directStreamEnded && directStreamingText) {
      setDirectResult(directStreamingText);
      setDirectLoading(false);
      setDirectTaskId(null);
    }
  }, [directTaskId, directStreamEnded, directStreamingText]);

  // Inline mode state
  const [editorText, setEditorText] = useState('Select some text in this editor and click "Run Inline Prompt" to see the inline overlay appear with the AI result.\n\nYou can then replace, insert before, or insert after the selected text.');
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null);
  const [inlineResult, setInlineResult] = useState<string>('');
  const [showInlineOverlay, setShowInlineOverlay] = useState(false);
  const [inlineLoading, setInlineLoading] = useState(false);

  // Background mode state
  const [backgroundTasks, setBackgroundTasks] = useState<Array<{ id: string; name: string; result: string; timestamp: string }>>([]);
  const [backgroundLoading, setBackgroundLoading] = useState(false);

  const handleDirectExecution = async () => {
    setDirectLoading(true);
    setDirectResult('');
    setDirectMetadata(null);
    setDirectTaskId(null);

    try {
      // ⭐ Use unified Redux system with resources
      const runId = await dispatch(startPromptInstance({
        promptId,
        promptSource,
        executionConfig: {
          ...executionConfig,
          track_in_runs: false, // Don't track test executions
          use_pre_execution_input: false,
        },
        variables: variables || {},
        resources: resources || [],
        initialMessage: initialMessage || '',
      })).unwrap();

      // Execute via unified system
      const taskId = await dispatch(executeMessage({ runId })).unwrap();

      // Set taskId for real-time streaming
      setDirectTaskId(taskId);
      setDirectMetadata({ runId }); // Store runId for reference
    } catch (error: any) {
      setDirectResult(`Error: ${error.message}`);
      setDirectLoading(false);
    }
  };

  const handleInlineExecution = async () => {
    const textarea = document.querySelector<HTMLTextAreaElement>('#inline-editor');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start === end) {
      toast.warning('Please select some text first!');
      return;
    }

    setSelectedRange({ start, end });
    setInlineLoading(true);
    setShowInlineOverlay(true);

    try {
      const selectedText = editorText.substring(start, end);

      // ⭐ Use unified Redux system with resources
      const runId = await dispatch(startPromptInstance({
        promptId,
        promptSource,
        executionConfig: {
          ...executionConfig,
          track_in_runs: false,
          use_pre_execution_input: false,
        },
        variables: { ...variables, selected_text: selectedText },
        resources: resources || [],
        initialMessage: selectedText,
      })).unwrap();

      const taskId = await dispatch(executeMessage({ runId })).unwrap();

      // Wait for completion via selector
      // Note: In a real scenario, we'd use a proper async selector or callback
      // For testing, we'll poll the state
      let attempts = 0;
      const maxAttempts = 300; // 30 seconds

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const currentState = (window as any).__REDUX_STORE__?.getState();
        if (currentState) {
          const isEnded = selectPrimaryResponseEndedByTaskId(taskId)(currentState);
          if (isEnded) {
            const response = selectPrimaryResponseTextByTaskId(taskId)(currentState);
            setInlineResult(response || '');
            break;
          }
        }
        attempts++;
      }
    } catch (error: any) {
      setInlineResult(`Error: ${error.message}`);
    } finally {
      setInlineLoading(false);
    }
  };

  const handleInlineReplace = () => {
    if (!selectedRange) return;

    const before = editorText.substring(0, selectedRange.start);
    const after = editorText.substring(selectedRange.end);
    setEditorText(before + inlineResult + after);
    setShowInlineOverlay(false);
    setSelectedRange(null);
  };

  const handleInlineInsertBefore = () => {
    if (!selectedRange) return;

    const before = editorText.substring(0, selectedRange.start);
    const selected = editorText.substring(selectedRange.start, selectedRange.end);
    const after = editorText.substring(selectedRange.end);
    setEditorText(before + inlineResult + '\n\n' + selected + after);
    setShowInlineOverlay(false);
    setSelectedRange(null);
  };

  const handleInlineInsertAfter = () => {
    if (!selectedRange) return;

    const before = editorText.substring(0, selectedRange.start);
    const selected = editorText.substring(selectedRange.start, selectedRange.end);
    const after = editorText.substring(selectedRange.end);
    setEditorText(before + selected + '\n\n' + inlineResult + after);
    setShowInlineOverlay(false);
    setSelectedRange(null);
  };

  const handleBackgroundExecution = async () => {
    setBackgroundLoading(true);

    try {
      // ⭐ Use unified Redux system with resources
      const runId = await dispatch(startPromptInstance({
        promptId,
        promptSource,
        executionConfig: {
          ...executionConfig,
          track_in_runs: false,
          use_pre_execution_input: false,
        },
        variables: variables || {},
        resources: resources || [],
        initialMessage: initialMessage || '',
      })).unwrap();

      const taskId = await dispatch(executeMessage({ runId })).unwrap();

      // Wait for completion
      let attempts = 0;
      const maxAttempts = 300;
      let response = '';

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const currentState = (window as any).__REDUX_STORE__?.getState();
        if (currentState) {
          const isEnded = selectPrimaryResponseEndedByTaskId(taskId)(currentState);
          if (isEnded) {
            response = selectPrimaryResponseTextByTaskId(taskId)(currentState) || '';
            break;
          }
        }
        attempts++;
      }

      // Simulate storing in database/state
      const newTask = {
        id: taskId,
        name: `Prompt ${promptId}`,
        result: response,
        timestamp: new Date().toLocaleString(),
      };

      setBackgroundTasks(prev => [newTask, ...prev]);
    } catch (error: any) {
      console.error('Background task failed:', error);
    } finally {
      setBackgroundLoading(false);
    }
  };

  const renderDirectMode = () => (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg border border-border">
        <Code className="w-5 h-5 text-primary mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold mb-1">Direct Mode Testing</h4>
          <p className="text-xs text-muted-foreground mb-3">
            Execute the prompt and retrieve the result programmatically. Watch the response stream in real-time to prove direct execution works.
          </p>
          <Button onClick={handleDirectExecution} disabled={directLoading} size="sm">
            {directLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Executing...
              </>
            ) : (
              'Execute Prompt'
            )}
          </Button>
        </div>
      </div>

      {(directLoading || directResult) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              {directLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  Streaming Response...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-green-500" />
                  Result Retrieved
                </>
              )}
            </h4>
            {directMetadata && (
              <span className="text-xs text-muted-foreground">
                {directMetadata.duration}ms • {directMetadata.tokens} tokens
              </span>
            )}
          </div>
          <div className="p-4 bg-card border border-border rounded-lg max-h-[300px] overflow-y-auto">
            {(directResult || directStreamingText) ? (
              <RichDocument
                content={directResult || directStreamingText}
                source={{ type: "raw" } as ContentSource}
                actionsVariant="mini-bar"
                actionsClassName="mt-1.5"
                actions={{ exclude: ["announcements", "preferences"] }}
                hideCopyButton
              />
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Waiting for response...</span>
              </div>
            )}
          </div>
          {!directLoading && (
            <p className="text-xs text-muted-foreground italic">
              ✓ This result can now be used programmatically (saved to database, passed to another function, etc.)
            </p>
          )}
        </div>
      )}
    </div>
  );

  const renderInlineMode = () => (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg border border-border">
        <FileText className="w-5 h-5 text-primary mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold mb-1">Inline Mode Testing</h4>
          <p className="text-xs text-muted-foreground mb-3">
            Select text in the editor below and run the prompt. The inline overlay will appear with options to replace, insert before, or insert after.
          </p>
          <Button onClick={handleInlineExecution} disabled={inlineLoading} size="sm">
            {inlineLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              'Run Inline Prompt'
            )}
          </Button>
        </div>
      </div>

      <div className="relative">
        <Textarea
          id="inline-editor"
          value={editorText}
          onChange={(e) => setEditorText(e.target.value)}
          className="min-h-[200px] font-mono text-sm"
          placeholder="Type some text here..."
        />

        {showInlineOverlay && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-lg shadow-xl max-w-lg w-full p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">AI Result</h4>
                {inlineLoading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
              </div>

              {inlineResult && (
                <>
                  <div className="max-h-[150px] overflow-y-auto text-sm p-2 bg-muted rounded">
                    <RichDocument
                      content={inlineResult}
                      source={{ type: "raw" } as ContentSource}
                      actionsVariant="mini-bar"
                      actionsClassName="mt-1"
                      actions={{ exclude: ["announcements", "preferences"] }}
                      hideCopyButton
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Button onClick={handleInlineReplace} size="sm" variant="default">
                      Replace
                    </Button>
                    <Button onClick={handleInlineInsertBefore} size="sm" variant="outline">
                      Insert Before
                    </Button>
                    <Button onClick={handleInlineInsertAfter} size="sm" variant="outline">
                      Insert After
                    </Button>
                    <Button onClick={() => { setShowInlineOverlay(false); setSelectedRange(null); }} size="sm" variant="ghost">
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderBackgroundMode = () => (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg border border-border">
        <Database className="w-5 h-5 text-primary mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold mb-1">Background Mode Testing</h4>
          <p className="text-xs text-muted-foreground mb-3">
            Execute prompts silently in the background and store results. Perfect for automated tasks, scheduled jobs, or batch processing.
          </p>
          <Button onClick={handleBackgroundExecution} disabled={backgroundLoading} size="sm">
            {backgroundLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running in background...
              </>
            ) : (
              'Run Background Task'
            )}
          </Button>
        </div>
      </div>

      {backgroundTasks.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Completed Background Tasks</h4>
          <div className="space-y-2 max-h-[400px] overflow-y-auto border border-border rounded-lg p-2 bg-muted/30">
            {backgroundTasks.map((task) => (
              <div key={task.id} className="p-3 bg-card border border-border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium">{task.name}</span>
                  <span className="text-xs text-muted-foreground">{task.timestamp}</span>
                </div>
                <div className="text-xs p-2 bg-muted rounded max-h-[100px] overflow-y-auto">
                  <RichDocument
                    content={task.result}
                    source={{ type: "raw" } as ContentSource}
                    actionsVariant="hover-menu"
                    actions={{ exclude: ["announcements", "preferences"] }}
                    hideCopyButton
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2 italic">
                  ✓ Task completed and stored (ID: {task.id.substring(0, 8)}...)
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Testing: {testType === 'direct' ? 'Direct Execution' : testType === 'inline' ? 'Inline Overlay' : 'Background Tasks'}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          {testType === 'direct' && renderDirectMode()}
          {testType === 'inline' && renderInlineMode()}
          {testType === 'background' && renderBackgroundMode()}
        </div>
      </DialogContent>
    </Dialog>
  );
}

