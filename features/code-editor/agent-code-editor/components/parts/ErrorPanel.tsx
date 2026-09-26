"use client";

/**
 * ErrorPanel — two-column error display: formatted error + raw AI response
 * with a copy button. Extracted from AICodeEditor.tsx:350-401.
 */

import React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, Copy, Check } from "lucide-react";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface ErrorPanelProps {
  errorMessage: string;
  rawAIResponse: string;
  isCopied: boolean;
  onCopyResponse: () => void;
  /** Top-line summary. Defaults to "Failed to process AI response". */
  summary?: string;
}

export function ErrorPanel({
  errorMessage,
  rawAIResponse,
  isCopied,
  onCopyResponse,
  summary = "Failed to process AI response",
}: ErrorPanelProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 gap-2">
      <Alert variant="destructive" className="shrink-0 py-2">
        <AlertCircle className="w-3.5 h-3.5" />
        <AlertDescription className="text-xs font-medium">
          {summary}
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 flex-1 min-h-0">
        <div className="border rounded p-2 overflow-auto bg-destructive/5">
          <div className="mb-1 flex items-center gap-1">
            <h4 className="flex-1 font-semibold text-destructive text-xs">
              Error Details
            </h4>
            <ErrorAlchemyMenu
              input={{
                title: summary,
                message: errorMessage,
                operation: "Apply the AI's code edit",
                details: rawAIResponse ? { raw_ai_response: rawAIResponse.slice(0, 4000) } : undefined,
              }}
            />
          </div>
          <pre className="text-[10px] whitespace-pre-wrap font-mono text-destructive/80">
            {errorMessage}
          </pre>
        </div>

        <div className="border rounded flex flex-col overflow-hidden">
          <div className="px-2 py-1 bg-muted/50 border-b flex items-center justify-between shrink-0">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Raw AI Response
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5"
              onClick={onCopyResponse}
              disabled={!rawAIResponse}
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
          <div className="flex-1 overflow-auto p-2 bg-background">
            <pre className="text-[10px] whitespace-pre-wrap font-mono">
              {rawAIResponse}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
