"use client";

/**
 * ToolTabBodies — shared per-entry tab body components.
 *
 * These render a single ToolLifecycleEntry without any outer chrome —
 * no entry selector strip, no tabs. Outer shells (ToolUpdatesOverlay,
 * ToolCallWindowPanel) compose them with their own navigation.
 *
 *   InputView      — Tool input parameters + raw input JSON.
 *   OutputView     — Generic output for tools without custom renderers.
 *   ErrorView      — Error state with message + type.
 *   RawDataView    — Full lifecycle entry + events JSON.
 *   EntryResultsBody — switch: error → ErrorView; custom renderer → it;
 *                      result present → OutputView; else placeholder.
 *   CustomOverlayBody — wraps a ToolOverlayTabSpec.Component with the
 *                       standard ToolRendererProps.
 *
 *   CopyButton     — small clipboard helper used by Input/Raw views.
 */

import React, { useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  FileCode2,
  MessageSquare,
  Settings2,
  WrapText,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

import { getOverlayRenderer, hasCustomRenderer } from "../registry/registry";
import type { ToolOverlayTabSpec, ToolRendererProps } from "../types";
import { resultAsString } from "../renderers/_shared";

// ─── Copy button ──────────────────────────────────────────────────────────────

export const CopyButton: React.FC<{ text: string; className?: string }> = ({
  text,
  className,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
        copied
          ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
          : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground",
        className,
      )}
      title={copied ? "Copied!" : "Copy to clipboard"}
    >
      {copied ? (
        <Check className="w-3.5 h-3.5" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
};

// ─── Input view ───────────────────────────────────────────────────────────────

export const InputView: React.FC<{ entry: ToolLifecycleEntry }> = ({
  entry,
}) => {
  const [wordWrap, setWordWrap] = useState(false);
  const args = entry.arguments ?? {};
  const argEntries = Object.entries(args);
  const fullInputJson = JSON.stringify(
    { name: entry.toolName, arguments: args, callId: entry.callId },
    null,
    2,
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30 flex-shrink-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Settings2 className="w-3.5 h-3.5" />
          <span>Tool input</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {argEntries.length} {argEntries.length === 1 ? "param" : "params"}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setWordWrap((w) => !w)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
              wordWrap
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground",
            )}
            title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
          >
            <WrapText className="w-3.5 h-3.5" />
            <span>Wrap</span>
          </button>
          <CopyButton text={fullInputJson} />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {entry.latestMessage && (
          <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <MessageSquare className="w-4 h-4 mt-0.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <p className="text-sm text-blue-900 dark:text-blue-100">
              {entry.latestMessage}
            </p>
          </div>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Parameters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {argEntries.length > 0 ? (
              argEntries.map(([key, value]) => (
                <div
                  key={key}
                  className="border-l-4 border-blue-400 dark:border-blue-600 pl-4 py-2"
                >
                  <div className="font-semibold text-sm text-foreground mb-1 font-mono">
                    {key}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {typeof value === "string" ? (
                      <div
                        className={cn(
                          "bg-muted p-3 rounded",
                          wordWrap
                            ? "whitespace-pre-wrap break-words"
                            : "overflow-auto",
                        )}
                      >
                        {value}
                      </div>
                    ) : typeof value === "number" ||
                      typeof value === "boolean" ? (
                      <div className="bg-muted p-3 rounded font-mono">
                        {String(value)}
                      </div>
                    ) : (
                      <pre
                        className={cn(
                          "text-xs bg-muted p-3 rounded max-h-40",
                          wordWrap
                            ? "whitespace-pre-wrap break-words overflow-y-auto"
                            : "overflow-auto",
                        )}
                      >
                        {JSON.stringify(value, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No parameters
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-2">
              <span>Raw Input</span>
              <Badge variant="outline" className="text-xs">
                Reference
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre
              className={cn(
                "text-xs bg-muted p-4 rounded max-h-60",
                wordWrap
                  ? "whitespace-pre-wrap break-words overflow-y-auto"
                  : "overflow-auto",
              )}
            >
              {fullInputJson}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// ─── Output view (default for tools without a custom renderer) ────────────────

export const OutputView: React.FC<{ entry: ToolLifecycleEntry }> = ({
  entry,
}) => {
  const textContent = resultAsString(entry);
  const isJson =
    entry.result != null &&
    typeof entry.result === "object" &&
    !Array.isArray(entry.result);

  if (entry.result == null) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p className="text-sm">No result available yet.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {entry.latestMessage && (
        <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <MessageSquare className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-400 flex-shrink-0" />
          <p className="text-sm text-green-900 dark:text-green-100">
            {entry.latestMessage}
          </p>
        </div>
      )}

      {textContent && !isJson ? (
        <div className="bg-card p-4 rounded-lg border overflow-auto max-h-[75dvh]">
          <div className="prose dark:prose-invert max-w-none text-sm whitespace-pre-wrap">
            {textContent}
          </div>
        </div>
      ) : (
        <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-[75dvh]">
          {JSON.stringify(entry.result, null, 2)}
        </pre>
      )}
    </div>
  );
};

// ─── Error view ───────────────────────────────────────────────────────────────

export const ErrorView: React.FC<{ entry: ToolLifecycleEntry }> = ({
  entry,
}) => (
  <div className="p-4">
    <Card className="border-red-300 dark:border-red-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Badge className="bg-red-500 dark:bg-red-600">
            <AlertCircle className="w-3 h-3 mr-1" />
            Error
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {entry.latestMessage && (
          <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
            <MessageSquare className="w-4 h-4 mt-0.5 text-red-600 dark:text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-900 dark:text-red-100">
              {entry.latestMessage}
            </p>
          </div>
        )}
        {entry.errorMessage && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-900 dark:text-red-100 font-mono">
              {entry.errorType ? `[${entry.errorType}] ` : ""}
              {entry.errorMessage}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  </div>
);

// ─── Raw data view ────────────────────────────────────────────────────────────

export const RawDataView: React.FC<{ entry: ToolLifecycleEntry }> = ({
  entry,
}) => {
  console.log(
    "[DIAG-4 RawDataView] callId=%s result type=%s result=%o",
    entry.callId,
    typeof entry.result,
    entry.result,
  );
  const [wordWrap, setWordWrap] = useState(false);
  const displayText = JSON.stringify({ entry, events: entry.events }, null, 2);
  console.log("[TOOL UPDATES OVERLAY] RawDataView entry:", entry);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30 flex-shrink-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileCode2 className="w-3.5 h-3.5" />
          <span>Complete tool data</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {entry.events.length}{" "}
            {entry.events.length === 1 ? "event" : "events"}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setWordWrap((w) => !w)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
              wordWrap
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground",
            )}
            title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
          >
            <WrapText className="w-3.5 h-3.5" />
            <span>Wrap</span>
          </button>
          <CopyButton text={displayText} />
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <pre
          className={cn(
            "p-4 text-xs text-foreground font-mono leading-relaxed",
            wordWrap ? "whitespace-pre-wrap break-words" : "",
          )}
        >
          {displayText}
        </pre>
      </div>
    </div>
  );
};

// ─── EntryResultsBody — generic "Results" body ────────────────────────────────
//
// Replicates the renderBody() switch from ToolUpdatesOverlay: error →
// ErrorView; tool with custom OverlayComponent → that renderer; else fall
// back to OutputView. Used when the tool does NOT register OverlayTabs.

export const EntryResultsBody: React.FC<{ entry: ToolLifecycleEntry | null }> =
  ({ entry }) => {
    if (!entry) {
      return (
        <div className="p-8 text-center text-muted-foreground">
          <p className="text-sm">No tool data available</p>
        </div>
      );
    }

    if (entry.status === "error") return <ErrorView entry={entry} />;

    if (hasCustomRenderer(entry.toolName)) {
      const OverlayRenderer = getOverlayRenderer(entry.toolName);
      return (
        <OverlayRenderer
          entry={entry}
          events={entry.events}
          toolGroupId={entry.callId}
          isPersisted={false}
        />
      );
    }

    if (entry.result != null) return <OutputView entry={entry} />;

    return (
      <div className="p-8 text-center text-muted-foreground">
        <p className="text-sm">Results not yet available</p>
      </div>
    );
  };

// ─── CustomOverlayBody — wraps a ToolOverlayTabSpec.Component ─────────────────

export const CustomOverlayBody: React.FC<{
  entry: ToolLifecycleEntry;
  Component: ToolOverlayTabSpec["Component"] | React.ComponentType<ToolRendererProps>;
}> = ({ entry, Component }) => (
  <div className="flex flex-col h-full">
    <div className="flex-1 overflow-auto">
      <Component
        entry={entry}
        events={entry.events}
        toolGroupId={entry.callId}
        isPersisted={false}
      />
    </div>
  </div>
);
