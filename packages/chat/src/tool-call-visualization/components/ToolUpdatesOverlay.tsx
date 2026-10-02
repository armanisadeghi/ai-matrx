"use client";

/**
 * ToolUpdatesOverlay (canonical, v3 contract)
 *
 * Top-level tab structure:
 *
 *   • Default (no custom contributions or multi-tool group):
 *       [ Results | Input | Raw ]
 *
 *   • Single-tool with `OverlayTabs` registered in the tool registry:
 *       [ ...OverlayTabs | Input | Raw ]   (the tool's tabs REPLACE "Results")
 *
 *   • Single-tool with only `OverlayComponent` (no OverlayTabs):
 *       [ Results=OverlayComponent | Input | Raw ]
 *
 *   • Single-tool in error state — always falls back to:
 *       [ Results (ErrorView) | Input | Raw ]
 *
 * For tool groups with multiple entries (rare), an inline entry selector
 * strip inside each tab lets the user pick which tool's data to inspect.
 *
 * This shell deliberately renders no heavy header / gradient / per-tool
 * outer tab — the FullScreenOverlay's own tab bar is the only outer chrome.
 */

import React, { useMemo, useState } from "react";

import FullScreenOverlay, {
  type TabDefinition,
} from "@/components/official/FullScreenOverlay";
import { cn } from "@/lib/utils";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

import { getOverlayTabs, getToolDisplayName } from "../registry/registry";
import type { ToolOverlayTabSpec } from "../types";
import {
  CustomOverlayBody,
  EntryResultsBody,
  InputView,
  RawDataView,
} from "./ToolTabBodies";
import {
  buildToolEntriesSummary,
  entryHasError,
  toolEntriesSummaryToHuman,
} from "../utils/toolEntryBundle";

// ─── Multi-tool entry selector (only rendered when entries.length > 1) ────────

const EntrySelector: React.FC<{
  entries: ToolLifecycleEntry[];
  selectedCallId: string;
  onSelect: (callId: string) => void;
}> = ({ entries, selectedCallId, onSelect }) => {
  if (entries.length <= 1) return null;
  return (
    <div className="flex flex-shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border bg-muted/40 px-3 py-1.5 scrollbar-none">
      <span className="mr-1 flex-shrink-0 text-xs text-muted-foreground">
        Tool
      </span>
      {entries.map((entry, idx) => {
        const label = getToolDisplayName(entry.toolName);
        const isActive = entry.callId === selectedCallId;
        return (
          <button
            key={entry.callId}
            onClick={() => onSelect(entry.callId)}
            className={cn(
              "flex-shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <span className="mr-1 opacity-60">{idx + 1}.</span>
            {label}
          </button>
        );
      })}
      <div className="ml-auto flex-shrink-0">
        <CopyButtons
          label={`All ${entries.length} tools`}
          size="sm"
          human={() => toolEntriesSummaryToHuman(entries)}
          agent={() => ({
            kind: "tool-results",
            location: "AI Matrx — Tool updates overlay",
            description: "Every tool call in this group.",
            data: buildToolEntriesSummary(entries),
            attributes: { count: String(entries.length) },
          })}
        />
      </div>
    </div>
  );
};

// ─── Tab content shells (render selected entry inside the active top tab) ─────

const ResultsTabContent: React.FC<{
  entries: ToolLifecycleEntry[];
  selectedCallId: string;
  onSelect: (callId: string) => void;
}> = ({ entries, selectedCallId, onSelect }) => {
  const entry =
    entries.find((e) => e.callId === selectedCallId) ?? entries[0] ?? null;

  return (
    <div className="flex flex-col h-full">
      <EntrySelector
        entries={entries}
        selectedCallId={entry?.callId ?? ""}
        onSelect={onSelect}
      />
      <div className="flex-1 overflow-auto">
        <EntryResultsBody entry={entry} />
      </div>
    </div>
  );
};

const InputTabContent: React.FC<{
  entries: ToolLifecycleEntry[];
  selectedCallId: string;
  onSelect: (callId: string) => void;
}> = ({ entries, selectedCallId, onSelect }) => {
  const entry =
    entries.find((e) => e.callId === selectedCallId) ?? entries[0] ?? null;

  return (
    <div className="flex flex-col h-full">
      <EntrySelector
        entries={entries}
        selectedCallId={entry?.callId ?? ""}
        onSelect={onSelect}
      />
      <div className="flex-1 overflow-hidden">
        {entry ? (
          <InputView entry={entry} />
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-sm">No tool data available</p>
          </div>
        )}
      </div>
    </div>
  );
};

const RawTabContent: React.FC<{
  entries: ToolLifecycleEntry[];
  selectedCallId: string;
  onSelect: (callId: string) => void;
}> = ({ entries, selectedCallId, onSelect }) => {
  const entry =
    entries.find((e) => e.callId === selectedCallId) ?? entries[0] ?? null;

  return (
    <div className="flex flex-col h-full">
      <EntrySelector
        entries={entries}
        selectedCallId={entry?.callId ?? ""}
        onSelect={onSelect}
      />
      <div className="flex-1 overflow-hidden">
        {entry ? (
          <RawDataView entry={entry} />
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-sm">No tool data available</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main overlay ─────────────────────────────────────────────────────────────

export interface ToolUpdatesOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  entries: ToolLifecycleEntry[];
  /**
   * Optional initial focus. Accepts any of:
   *   - "input" | "raw"             → admin tabs (always present)
   *   - "results"                   → default Results tab (when no
   *                                    OverlayTabs are registered)
   *   - any custom tab id           → e.g. "report", "sources", "fulltext"
   *                                    when the tool registers OverlayTabs
   *   - "tool-group-{callId}"       → legacy contract; selects that entry
   *                                    and opens the first tab.
   */
  initialTab?: string;
}

export const ToolUpdatesOverlay: React.FC<ToolUpdatesOverlayProps> = ({
  isOpen,
  onClose,
  entries,
  initialTab,
}) => {
  const requestedCallId = useMemo(() => {
    if (!initialTab) return null;
    const m = initialTab.match(/^tool-group-(.+)$/);
    if (m && entries.some((e) => e.callId === m[1])) return m[1];
    return null;
  }, [initialTab, entries]);

  const initialCallId =
    requestedCallId ?? entries[entries.length - 1]?.callId ?? "";

  const [userSelectedCallId, setUserSelectedCallId] = useState<string | null>(
    null,
  );
  const [boundInitialCallId, setBoundInitialCallId] = useState(initialCallId);
  if (isOpen && initialCallId !== boundInitialCallId) {
    setBoundInitialCallId(initialCallId);
    setUserSelectedCallId(null);
  }

  const selectedCallId = useMemo(() => {
    if (
      userSelectedCallId &&
      entries.some((e) => e.callId === userSelectedCallId)
    ) {
      return userSelectedCallId;
    }
    return initialCallId;
  }, [entries, userSelectedCallId, initialCallId]);

  const selectedEntry = useMemo(
    () =>
      entries.find((e) => e.callId === selectedCallId) ?? entries[0] ?? null,
    [entries, selectedCallId],
  );

  // Custom OverlayTabs are only expanded when:
  //   1. The group contains exactly one entry.
  //   2. That entry is not in error state.
  //   3. The tool's registry record provides OverlayTabs.
  const customOverlayTabs: ToolOverlayTabSpec[] | null = useMemo(() => {
    if (entries.length !== 1) return null;
    if (!selectedEntry) return null;
    if (entryHasError(selectedEntry)) return null;
    return getOverlayTabs(selectedEntry.toolName);
  }, [entries.length, selectedEntry]);

  const tabs: TabDefinition[] = useMemo(() => {
    const adminTabs: TabDefinition[] = [
      {
        id: "input",
        label: "Input",
        content: (
          <InputTabContent
            entries={entries}
            selectedCallId={selectedCallId}
            onSelect={setUserSelectedCallId}
          />
        ),
      },
      {
        id: "raw",
        label: "Raw",
        content: (
          <RawTabContent
            entries={entries}
            selectedCallId={selectedCallId}
            onSelect={setUserSelectedCallId}
          />
        ),
      },
    ];

    if (customOverlayTabs && selectedEntry) {
      const customTabDefs: TabDefinition[] = customOverlayTabs.map((spec) => ({
        id: spec.id,
        label: spec.label,
        content: (
          <CustomOverlayBody entry={selectedEntry} Component={spec.Component} />
        ),
      }));
      return [...customTabDefs, ...adminTabs];
    }

    return [
      {
        id: "results",
        label: "Results",
        content: (
          <ResultsTabContent
            entries={entries}
            selectedCallId={selectedCallId}
            onSelect={setUserSelectedCallId}
          />
        ),
      },
      ...adminTabs,
    ];
  }, [entries, selectedCallId, customOverlayTabs, selectedEntry]);

  const resolvedTopTab = useMemo(() => {
    if (
      initialTab &&
      !initialTab.startsWith("tool-group-") &&
      tabs.some((t) => t.id === initialTab)
    ) {
      return initialTab;
    }
    return tabs[0]?.id ?? "results";
  }, [initialTab, tabs]);

  const title = useMemo(() => {
    if (entries.length === 0) return "Tool";
    if (entries.length > 1) return `${entries.length} Tools`;
    return getToolDisplayName(entries[0].toolName);
  }, [entries]);

  return (
    <FullScreenOverlay
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description="Tool results, input, and raw data"
      tabs={tabs}
      initialTab={resolvedTopTab}
      width="95vw"
      height="95dvh"
    />
  );
};

export default ToolUpdatesOverlay;
