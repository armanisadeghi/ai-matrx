"use client";

/**
 * ToolTabBodies — shared per-entry tab body components.
 *
 * These render a single ToolLifecycleEntry without any outer chrome —
 * no entry selector strip, no tabs. Outer shells (ToolUpdatesOverlay,
 * ToolCallWindowPanel) compose them with their own navigation.
 *
 *   InputView      — Tool input parameters, each value via <ResultValue full>.
 *   OutputView     — The "Pretty" results tab: <ResultValue density="full">.
 *   ErrorView      — Structured error via <ToolErrorCard>.
 *   RawDataView    — The "Raw I/O" tab: arguments + result + events as a JSON
 *                    tree (always present, for engineers).
 *   EntryResultsBody — switch: error → ErrorView; custom renderer → it;
 *                      result present → OutputView; else EmptyResult.
 *   CustomOverlayBody — wraps a ToolOverlayTabSpec.Component with the
 *                       standard ToolRendererProps.
 *
 *   CopyButton     — kept for backward-compat; thin clipboard helper.
 *
 * All colours are semantic tokens / Badge variants — no literal palette colours.
 */

import React, { useState } from "react";
import { Check, Copy, FileCode2, Settings2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

import { getOverlayRenderer, hasCustomRenderer } from "../registry/registry";
import type { ToolOverlayTabSpec, ToolRendererProps } from "../types";
import { ResultValue } from "../result-fields/ResultValue";
import { ResultJson } from "../result-fields/ResultJson";
import { EmptyResult } from "../result-fields/EmptyResult";
import { ToolErrorCard } from "../result-fields/ToolErrorCard";
import { humanizeKey } from "../result-fields/shape";

// ─── Copy payload helpers ──────────────────────────────────────────────────

function resultToHuman(result: unknown): string {
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function buildAgentInput(entry: ToolLifecycleEntry, description: string, data: unknown) {
  return {
    kind: "tool-result",
    location: "AI Matrx — Tool call result",
    description,
    data,
    attributes: { tool: entry.toolName, status: entry.status },
  };
}

// ─── Copy button (backward-compat shim) ─────────────────────────────────────
//
// Retained because external code may still import it. New surfaces should use
// <CopyButtons> from @/components/agent-copy.

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

export const InputView: React.FC<{ entry: ToolLifecycleEntry }> = ({ entry }) => {
  const args = entry.arguments ?? {};
  const argEntries = Object.entries(args);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Settings2 className="h-3.5 w-3.5" />
          <span>Tool input</span>
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {argEntries.length} {argEntries.length === 1 ? "param" : "params"}
          </Badge>
        </div>
        <CopyButtons
          label="Input"
          size="sm"
          human={() => JSON.stringify(args, null, 2)}
          agent={() =>
            buildAgentInput(entry, `Input parameters for the "${entry.toolName}" tool call.`, {
              tool: entry.toolName,
              callId: entry.callId,
              arguments: args,
            })
          }
        />
      </div>

      <div className="flex-1 space-y-3 overflow-auto p-4">
        {argEntries.length > 0 ? (
          argEntries.map(([key, value]) => (
            <div key={key} className="rounded-md border border-border bg-card p-3">
              <div className="mb-1.5 font-mono text-xs font-semibold text-muted-foreground">
                {humanizeKey(key)}
              </div>
              <ResultValue value={value} density="full" />
            </div>
          ))
        ) : (
          <EmptyResult density="full" message="No input parameters" />
        )}
      </div>
    </div>
  );
};

// ─── Output view (the "Pretty" results tab) ─────────────────────────────────

export const OutputView: React.FC<{ entry: ToolLifecycleEntry }> = ({ entry }) => {
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
            buildAgentInput(entry, `Result of the "${entry.toolName}" tool call.`, {
              tool: entry.toolName,
              callId: entry.callId,
              result: entry.result,
            })
          }
        />
      </div>
      <ResultValue value={entry.result} density="full" />
    </div>
  );
};

// ─── Error view ─────────────────────────────────────────────────────────────

export const ErrorView: React.FC<{ entry: ToolLifecycleEntry }> = ({ entry }) => (
  <div className="p-4">
    <ToolErrorCard entry={entry} toolGroupId={entry.callId} />
  </div>
);

// ─── Raw data view (the "Raw" tab — verbatim, for engineers) ─────────────────
//
// Four clearly-labeled sections, top to bottom, each rendered with the canonical
// JsonInspector WITHOUT any interpretation or reshaping:
//   1. Tool   — metadata about WHICH tool ran.
//   2. Input  — entry.arguments exactly as-is (verbatim model-produced input).
//   3. Result — entry.result exactly as-is (verbatim).
//   4. Error  — ONLY on error: the full detail (message text + complete event log).
// This is THE place where everything about an error lives.

const RAW_SECTION_HEADING_CLS =
  "text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5";

export const RawDataView: React.FC<{ entry: ToolLifecycleEntry }> = ({ entry }) => {
  const toolMeta = {
    toolName: entry.toolName,
    displayName: entry.displayName,
    callId: entry.callId,
    status: entry.status,
    startedAt: entry.startedAt,
    completedAt: entry.completedAt,
    isDelegated: entry.isDelegated,
    errorType: entry.errorType,
  };

  const errorDetail = {
    errorType: entry.errorType,
    errorMessage: entry.errorMessage,
    events: entry.events,
  };

  const hasError = entry.status === "error" || Boolean(entry.errorMessage);

  const bundle = {
    tool: toolMeta,
    input: entry.arguments,
    result: entry.result,
    error: hasError ? errorDetail : null,
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileCode2 className="h-3.5 w-3.5" />
          <span>Raw</span>
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {entry.events.length} {entry.events.length === 1 ? "event" : "events"}
          </Badge>
        </div>
        <CopyButtons
          label="Raw data"
          size="sm"
          human={() => JSON.stringify(bundle, null, 2)}
          agent={() =>
            buildAgentInput(entry, `Raw tool/input/result/error for the "${entry.toolName}" tool call.`, {
              callId: entry.callId,
              ...bundle,
            })
          }
        />
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-4">
        <section>
          <h3 className={RAW_SECTION_HEADING_CLS}>Tool</h3>
          <ResultJson data={toolMeta} />
        </section>

        <section>
          <h3 className={RAW_SECTION_HEADING_CLS}>Input</h3>
          <ResultJson data={entry.arguments} />
        </section>

        <section>
          <h3 className={RAW_SECTION_HEADING_CLS}>Result</h3>
          <ResultJson data={entry.result ?? null} />
        </section>

        {hasError && (
          <section>
            <h3 className={RAW_SECTION_HEADING_CLS}>Error</h3>
            {entry.errorMessage && (
              <div className="mb-2 rounded-md border border-destructive/30 p-3 text-sm text-foreground whitespace-pre-wrap">
                {entry.errorMessage}
              </div>
            )}
            <ResultJson data={errorDetail} />
          </section>
        )}
      </div>
    </div>
  );
};

// ─── EntryResultsBody — generic "Results" body ──────────────────────────────
//
// error → ErrorView; tool with custom OverlayComponent → that renderer; else
// OutputView. Used when the tool does NOT register OverlayTabs.

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
