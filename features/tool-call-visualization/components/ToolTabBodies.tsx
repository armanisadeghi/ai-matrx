"use client";

/**
 * ToolTabBodies — shared per-entry tab body components.
 *
 * These render a single ToolLifecycleEntry without any outer chrome —
 * no entry selector strip, no tabs. Outer shells (ToolUpdatesOverlay,
 * ToolCallWindowPanel) compose them with their own navigation.
 *
 *   InputView      — dense KeyValueGrid of arguments (no card nesting).
 *   OutputView     — The "Pretty" results tab: <ResultValue density="full">.
 *   ErrorView      — Full error story for the Results tab (not the calm
 *                    inline one-liner — that stays on ToolErrorCard).
 *   RawDataView    — Single non-repetitive JSON: { tool, input, result, error? }.
 *   EntryResultsBody — switch: error → ErrorView; custom renderer → it;
 *                      result present → OutputView; else EmptyResult.
 *   CustomOverlayBody — wraps a ToolOverlayTabSpec.Component.
 *
 *   CopyButton     — kept for backward-compat; thin clipboard helper.
 */

import React, { useState } from "react";
import { Check, CircleAlert, Copy, FileCode2, Settings2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

import { getOverlayRenderer, hasCustomRenderer } from "../registry/registry";
import type { ToolOverlayTabSpec, ToolRendererProps } from "../types";
import { ResultValue } from "../result-fields/ResultValue";
import { EmptyResult } from "../result-fields/EmptyResult";
import { toolErrorLabel } from "../result-fields/ToolErrorCard";
import { KeyValueGrid } from "../result-fields/KeyValueGrid";
import {
  buildToolEntryBundle,
  toolEntryBundleToHuman,
} from "../utils/toolEntryBundle";

// ─── Copy payload helpers ──────────────────────────────────────────────────

function resultToHuman(result: unknown): string {
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function buildAgentInput(
  entry: ToolLifecycleEntry,
  description: string,
  data: unknown,
) {
  return {
    kind: "tool-result",
    location: "AI Matrx — Tool call result",
    description,
    data,
    attributes: { tool: entry.toolName, status: entry.status },
  };
}

// ─── Copy button (backward-compat shim) ─────────────────────────────────────

export const CopyButton: React.FC<{ text: string; className?: string }> = ({
  text,
  className,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all",
        copied
          ? "bg-accent text-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
        className,
      )}
      title={copied ? "Copied!" : "Copy to clipboard"}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
};

// ─── Input view ─────────────────────────────────────────────────────────────
// Dense definition list via KeyValueGrid — no per-param cards, no giant fonts.

export const InputView: React.FC<{ entry: ToolLifecycleEntry }> = ({
  entry,
}) => {
  const args = entry.arguments ?? {};
  const argCount = Object.keys(args).length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Settings2 className="h-3.5 w-3.5" />
          <span>Tool input</span>
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {argCount} {argCount === 1 ? "param" : "params"}
          </Badge>
        </div>
        <CopyButtons
          label="Input"
          size="sm"
          human={() => JSON.stringify(args, null, 2)}
          agent={() =>
            buildAgentInput(
              entry,
              `Input parameters for the "${entry.toolName}" tool call.`,
              {
                tool: entry.toolName,
                callId: entry.callId,
                arguments: args,
              },
            )
          }
        />
      </div>

      <div className="flex-1 overflow-auto px-3 py-2.5">
        {argCount > 0 ? (
          <KeyValueGrid value={args} density="full" />
        ) : (
          <EmptyResult density="full" message="No input parameters" />
        )}
      </div>
    </div>
  );
};

// ─── Output view (the "Pretty" results tab) ─────────────────────────────────

export const OutputView: React.FC<{ entry: ToolLifecycleEntry }> = ({
  entry,
}) => {
  if (entry.result == null) {
    return (
      <div className="p-4">
        <EmptyResult density="full" message="No result available yet." />
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-end">
        <CopyButtons
          label="Result"
          size="sm"
          human={() => resultToHuman(entry.result)}
          agent={() =>
            buildAgentInput(
              entry,
              `Result of the "${entry.toolName}" tool call.`,
              {
                tool: entry.toolName,
                callId: entry.callId,
                result: entry.result,
              },
            )
          }
        />
      </div>
      <ResultValue value={entry.result} density="full" />
    </div>
  );
};

// ─── Error view (Results tab — full story, not the calm inline card) ────────

export const ErrorView: React.FC<{ entry: ToolLifecycleEntry }> = ({
  entry,
}) => {
  const label = toolErrorLabel(entry);
  const message = entry.errorMessage?.trim() || null;
  const args = entry.arguments ?? {};
  const hasArgs = Object.keys(args).length > 0;
  const bundle = buildToolEntryBundle(entry);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CircleAlert className="h-3.5 w-3.5 text-destructive" />
          <span>Error</span>
          {entry.errorType && (
            <Badge variant="outline" className="px-1.5 py-0 font-mono text-[10px]">
              {entry.errorType}
            </Badge>
          )}
        </div>
        <CopyButtons
          label="Error"
          size="sm"
          human={() => toolEntryBundleToHuman(entry)}
          agent={() =>
            buildAgentInput(
              entry,
              `Error from the "${entry.toolName}" tool call.`,
              bundle,
            )
          }
        />
      </div>

      <div className="flex-1 space-y-4 overflow-auto px-3 py-3">
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {message ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
              {message}
            </p>
          ) : (
            <p className="text-sm italic text-muted-foreground">
              No error message was recorded. Check the Raw tab for events.
            </p>
          )}
        </div>

        {hasArgs && (
          <div className="space-y-1.5 border-t border-border pt-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Input that failed
            </p>
            <KeyValueGrid value={args} density="full" />
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Raw data view — ONE non-repetitive JSON: { tool, input, result, error? }

export const RawDataView: React.FC<{ entry: ToolLifecycleEntry }> = ({
  entry,
}) => {
  const bundle = buildToolEntryBundle(entry);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileCode2 className="h-3.5 w-3.5" />
          <span>All</span>
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            tool · input · result
            {bundle.error ? " · error" : ""}
          </Badge>
        </div>
        <CopyButtons
          label="Raw data"
          size="sm"
          human={() => toolEntryBundleToHuman(entry)}
          agent={() =>
            buildAgentInput(
              entry,
              `Full tool/input/result/error for the "${entry.toolName}" tool call.`,
              bundle,
            )
          }
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-2">
        <div className="h-full min-h-[280px] overflow-hidden rounded-md border border-border bg-card">
          <JsonInspector data={bundle} />
        </div>
      </div>
    </div>
  );
};

// ─── EntryResultsBody — generic "Results" body ──────────────────────────────

export const EntryResultsBody: React.FC<{
  entry: ToolLifecycleEntry | null;
}> = ({ entry }) => {
  if (!entry) {
    return (
      <div className="p-8">
        <EmptyResult density="full" message="No tool data available" />
      </div>
    );
  }

  if (entry.status === "error") return <ErrorView entry={entry} />;

  if (hasCustomRenderer(entry.toolName)) {
    const OverlayRenderer = getOverlayRenderer(entry.toolName);
    return React.createElement(OverlayRenderer, {
      entry,
      events: entry.events,
      toolGroupId: entry.callId,
      isPersisted: false,
    });
  }

  if (entry.result != null) return <OutputView entry={entry} />;

  return (
    <div className="p-8">
      <EmptyResult density="full" message="Results not yet available" />
    </div>
  );
};

// ─── CustomOverlayBody — wraps a ToolOverlayTabSpec.Component ────────────────

export const CustomOverlayBody: React.FC<{
  entry: ToolLifecycleEntry;
  Component:
    | ToolOverlayTabSpec["Component"]
    | React.ComponentType<ToolRendererProps>;
}> = ({ entry, Component }) => (
  <div className="flex h-full flex-col">
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
