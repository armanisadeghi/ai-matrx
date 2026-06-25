"use client";

import React, { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, CopyCheck } from "lucide-react";

interface ContextDebugModalProps {
  isOpen: boolean;
  onClose: () => void;
  contextData: {
    // Typed loosely on purpose: `context` (and occasionally `content` /
    // `selection`) can arrive as a structured object — the baseline `context`
    // value is allowed to be a JSON blob, not just a string. `asDisplayString`
    // below renders any shape safely.
    selection: unknown;
    content: unknown;
    context: unknown;
    [key: string]: unknown; // Custom variables
  };
}

/**
 * Render any scope value as a display string — objects become pretty JSON so a
 * non-string value (e.g. a `{language, filePath, …}` context blob) never reaches
 * the DOM as a raw React child and crashes the dialog with "Objects are not
 * valid as a React child". Mirrors the Custom Variables stringify below.
 */
function asDisplayString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export function ContextDebugModal({
  isOpen,
  onClose,
  contextData,
}: ContextDebugModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const standardScopes = {
    selection: asDisplayString(contextData.selection),
    content: asDisplayString(contextData.content),
    context: asDisplayString(contextData.context),
  };

  const customVariables = Object.entries(contextData)
    .filter(
      ([key]) =>
        !["selection", "content", "context", "contextFilter"].includes(key),
    )
    .reduce(
      (acc, [key, value]) => ({ ...acc, [key]: value }),
      {} as Record<string, unknown>,
    );

  const hasCustomVariables = Object.keys(customVariables).length > 0;

  const copyToClipboard = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    });
  }, []);

  const copyAll = useCallback(() => {
    const parts: string[] = [];

    parts.push("=== STANDARD SCOPES ===");
    for (const [key, value] of Object.entries(standardScopes)) {
      parts.push(`\n--- ${key.toUpperCase()} ---`);
      parts.push(value || "(empty)");
    }

    if (hasCustomVariables) {
      parts.push("\n=== CUSTOM VARIABLES ===");
      for (const [key, value] of Object.entries(customVariables)) {
        parts.push(`\n--- ${key} ---`);
        parts.push(
          typeof value === "object"
            ? JSON.stringify(value, null, 2)
            : String(value),
        );
      }
    }

    copyToClipboard(parts.join("\n"), "__all__");
  }, [standardScopes, customVariables, hasCustomVariables, copyToClipboard]);

  const CopyButton = ({ id, text }: { id: string; text: string }) => (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 shrink-0"
      onClick={() => copyToClipboard(text, id)}
      title="Copy"
    >
      {copiedKey === id ? (
        <CopyCheck className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </Button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80dvh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-lg">Context Debug</span>
            <Badge variant="outline" className="text-xs">
              Admin Debug Mode
            </Badge>
            <div className="ml-auto mr-6">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={copyAll}
              >
                {copiedKey === "__all__" ? (
                  <CopyCheck className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copiedKey === "__all__" ? "Copied!" : "Copy All"}
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[60dvh] pr-4">
          <div className="space-y-6">
            {/* Standard Scopes */}
            <div>
              <h3 className="text-sm font-semibold mb-3 text-foreground">
                Standard Scopes
              </h3>
              <div className="space-y-4">
                {Object.entries(standardScopes).map(([key, value]) => (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                        {key}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {typeof value === "string"
                            ? `${value.length} chars`
                            : "empty"}
                        </Badge>
                        <CopyButton id={`scope-${key}`} text={value || ""} />
                      </div>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      {value ? (
                        <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                          {value}
                        </pre>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          Empty
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom Variables */}
            {hasCustomVariables && (
              <div>
                <h3 className="text-sm font-semibold mb-3 text-foreground">
                  Custom Variables
                </h3>
                <div className="space-y-4">
                  {Object.entries(customVariables).map(([key, value]) => {
                    const displayValue =
                      typeof value === "object"
                        ? JSON.stringify(value, null, 2)
                        : String(value);
                    return (
                      <div key={key} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-primary">
                            {key}
                          </span>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {typeof value}
                            </Badge>
                            <CopyButton id={`var-${key}`} text={displayValue} />
                          </div>
                        </div>
                        <div className="p-3 bg-muted rounded-lg">
                          <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                            {displayValue}
                          </pre>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!hasCustomVariables && (
              <div className="p-4 bg-muted/50 rounded-lg text-center">
                <p className="text-sm text-muted-foreground">
                  No custom variables provided
                </p>
              </div>
            )}

            {/* Summary */}
            <div className="pt-4 border-t border-border">
              <h3 className="text-sm font-semibold mb-2 text-foreground">
                Summary
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-muted rounded">
                  <span className="text-muted-foreground">
                    Standard Scopes:
                  </span>
                  <span className="ml-2 font-semibold">3</span>
                </div>
                <div className="p-2 bg-muted rounded">
                  <span className="text-muted-foreground">
                    Custom Variables:
                  </span>
                  <span className="ml-2 font-semibold">
                    {Object.keys(customVariables).length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
