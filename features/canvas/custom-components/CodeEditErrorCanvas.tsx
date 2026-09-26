'use client';

import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Copy, Check, X } from 'lucide-react';
import { useState } from 'react';
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface CodeEditErrorCanvasProps {
  errors: string[];
  warnings: string[];
  rawResponse: string;
  onClose: () => void;
}

/**
 * CodeEditErrorCanvas - Shows code edit errors in the canvas panel
 * 
 * Displays validation errors when AI-generated edits don't match the current code.
 */
export function CodeEditErrorCanvas({
  errors,
  warnings,
  rawResponse,
  onClose,
}: CodeEditErrorCanvasProps) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyResponse = async () => {
    try {
      await navigator.clipboard.writeText(rawResponse);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-destructive/10 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-destructive" />
            <h3 className="text-sm font-semibold text-destructive">Code Edit Error</h3>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="text-sm">
            The AI provided code edits, but some patterns don't match the current code.
            This usually means the AI is trying to edit code that doesn't exist or has changed.
            <br /><br />
            You can continue the conversation to clarify or try again.
          </AlertDescription>
        </Alert>

        {warnings.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Warnings ({warnings.length})
            </h4>
            <div className="space-y-1">
              {warnings.map((warning, i) => (
                <Alert key={i} className="py-2">
                  <AlertDescription className="text-xs">{warning}</AlertDescription>
                </Alert>
              ))}
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-destructive uppercase tracking-wide">
              Errors ({errors.length})
            </h4>
            <div className="space-y-2">
              {errors.map((error, i) => (
                <div key={i} className="border border-destructive/30 rounded p-3 bg-destructive/5">
                  <pre className="text-[10px] whitespace-pre-wrap font-mono text-destructive/80">
                    {error}
                  </pre>
                  <ErrorAlchemyMenu error={error} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Raw AI Response
            </h4>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={handleCopyResponse}
            >
              {isCopied ? (
                <>
                  <Check className="w-3 h-3 mr-1 text-green-600" />
                  <span className="text-[10px]">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 mr-1" />
                  <span className="text-[10px]">Copy</span>
                </>
              )}
            </Button>
          </div>
          <div className="border rounded p-3 bg-muted/50 max-h-[300px] overflow-auto">
            <pre className="text-[10px] whitespace-pre-wrap font-mono">{rawResponse}</pre>
          </div>
        </div>
      </div>

      {/* Footer - VS Code style tiny button */}
      <div className="px-2 py-1 border-t bg-muted/20 shrink-0">
        <div className="flex items-center justify-end">
          <button
            onClick={onClose}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors border border-border bg-background hover:bg-muted"
          >
            <X className="w-3 h-3" />
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

