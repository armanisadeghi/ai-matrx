"use client";

/**
 * Deep-research overlay tabs.
 *
 * Exposes three components — Report, Sources, Full Text — plus a
 * `deepResearchOverlayTabs` array that the tool registry hands to
 * `ToolUpdatesOverlay`. When this tool is opened in the overlay, these
 * tabs replace the default "Results" tab and sit alongside the standard
 * "Input" and "Raw" admin tabs:
 *
 *     [ Report | Sources | Full Text | Input | Raw ]
 *
 * Each tab parses the raw output via the per-entry cache in `parser.ts`
 * so the parse work happens exactly once per entry, regardless of how
 * many tabs are mounted.
 */

import React, { useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Link2,
} from "lucide-react";

import MarkdownStream from "@/components/MarkdownStream";
import { RichDocument } from "@/features/rich-document/RichDocument";
import type { ContentSource } from "@/features/rich-document/types";

import type { ToolOverlayTabSpec, ToolRendererProps } from "../../types";
import {
  type ParsedResearch,
  type ReadResult,
  type UnreadResult,
  getDomain,
  getFaviconUrl,
  parseResearchEntry,
} from "./parser";

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

const COLLAPSED_CHAR_LIMIT = 500;

const CollapsibleText: React.FC<{ text: string }> = ({ text }) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > COLLAPSED_CHAR_LIMIT;

  return (
    <div>
      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
        {expanded || !isLong
          ? text
          : text.slice(0, COLLAPSED_CHAR_LIMIT) + "..."}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              Show full content ({Math.round(text.length / 1000)}k chars)
            </>
          )}
        </button>
      )}
    </div>
  );
};

const EmptyState: React.FC<{ icon: React.ReactNode; message: string }> = ({
  icon,
  message,
}) => (
  <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">
    <div className="text-center">
      <div className="mx-auto mb-3 opacity-50">{icon}</div>
      <p className="text-sm">{message}</p>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Report (curated markdown report)
// ─────────────────────────────────────────────────────────────────────────────

export const DeepResearchReportTab: React.FC<ToolRendererProps> = ({
  entry,
}) => {
  const parsed = parseResearchEntry(entry);

  if (!parsed?.curatedReport) {
    return (
      <EmptyState
        icon={<FileText className="w-12 h-12" />}
        message="No curated report available"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 overflow-hidden">
        {parsed.queries.length > 0 && (
          <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide mb-1">
              Queries
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {parsed.queries.join(" · ")}
            </p>
          </div>
        )}
        <div className="p-5">
          <RichDocument
            content={parsed.curatedReport}
            source={{ type: "raw" } as ContentSource}
            actionsVariant="mini-bar"
            actionsClassName="mt-2"
            actions={{ exclude: ["announcements", "preferences"] }}
            hideCopyButton
            contentClassName="text-sm"
          />
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Sources (per-result cards + additional links)
// ─────────────────────────────────────────────────────────────────────────────

const SourceCard: React.FC<{
  result: ReadResult;
  index: number;
  copiedIndex: number | null;
  onCopy: (result: ReadResult, index: number) => void;
}> = ({ result, index, copiedIndex, onCopy }) => (
  <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600 transition-colors overflow-hidden">
    <div className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700">
      <div className="flex-shrink-0 w-4 h-4 relative">
        <img
          src={getFaviconUrl(result.url)}
          alt=""
          className="w-4 h-4 rounded"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
            const sibling = (e.target as HTMLImageElement).nextElementSibling;
            if (sibling) sibling.classList.remove("hidden");
          }}
        />
        <Globe className="w-4 h-4 text-slate-400 dark:text-slate-500 hidden" />
      </div>
      <a
        href={result.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-violet-600 dark:hover:text-violet-400 truncate"
        title={result.url}
      >
        {getDomain(result.url)}
      </a>
      {result.readAt && (
        <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 ml-auto flex-shrink-0">
          <Clock className="w-3 h-3" />
          {result.readAt.replace(/,?\s*at\s*/i, " ")}
        </span>
      )}
      <button
        onClick={() => onCopy(result, index)}
        className="flex-shrink-0 p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        title="Copy this source"
      >
        {copiedIndex === index ? (
          <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
        ) : (
          <Copy className="w-4 h-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
        )}
      </button>
    </div>

    <div className="p-5 space-y-3">
      <a
        href={result.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-base font-semibold text-slate-900 dark:text-slate-100 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
      >
        {result.title || getDomain(result.url)}
      </a>

      {result.text && <CollapsibleText text={result.text} />}

      <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
        >
          Read original article
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  </div>
);

const UnreadList: React.FC<{ results: UnreadResult[] }> = ({ results }) => (
  <div className="space-y-3">
    <div className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 pt-2">
      <Link2 className="w-4 h-4" />
      <span>Additional Sources ({results.length})</span>
    </div>
    <div className="space-y-2">
      {results.map((result, index) => (
        <a
          key={index}
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors group"
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-5 h-5 relative mt-0.5">
              <img
                src={getFaviconUrl(result.url)}
                alt=""
                className="w-5 h-5 rounded"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                  const sibling = (e.target as HTMLImageElement)
                    .nextElementSibling;
                  if (sibling) sibling.classList.remove("hidden");
                }}
              />
              <Globe className="w-5 h-5 text-slate-400 dark:text-slate-500 hidden" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200 group-hover:text-violet-700 dark:group-hover:text-violet-300 line-clamp-1 transition-colors">
                {result.title}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                <span className="truncate">{getDomain(result.url)}</span>
                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              {result.snippet && (
                <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mt-1.5">
                  {result.snippet}
                </p>
              )}
            </div>
          </div>
        </a>
      ))}
    </div>
  </div>
);

export const DeepResearchSourcesTab: React.FC<ToolRendererProps> = ({
  entry,
}) => {
  const parsed = parseResearchEntry(entry);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = async (result: ReadResult, index: number) => {
    try {
      const text = `${result.title}\n${result.url}\n\n${result.text}`;
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const readResults = parsed?.readResults ?? [];
  const unreadResults = parsed?.unreadResults ?? [];

  if (readResults.length === 0 && unreadResults.length === 0) {
    return (
      <EmptyState
        icon={<Link2 className="w-12 h-12" />}
        message="No sources available"
      />
    );
  }

  return (
    <div className="space-y-3">
      {readResults.map((result, index) => (
        <SourceCard
          key={index}
          result={result}
          index={index}
          copiedIndex={copiedIndex}
          onCopy={handleCopy}
        />
      ))}
      {unreadResults.length > 0 && <UnreadList results={unreadResults} />}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Full Text (synthesized full-text dump + Copy All)
// ─────────────────────────────────────────────────────────────────────────────

function buildFullText(parsed: ParsedResearch): string {
  let text = "";

  if (parsed.queries.length > 0) {
    text += `RESEARCH QUERIES\n${"=".repeat(80)}\n`;
    parsed.queries.forEach((q, i) => {
      text += `${i + 1}. ${q}\n`;
    });
    text += "\n";
  } else if (parsed.introSummary) {
    text += `RESEARCH SUMMARY\n${"=".repeat(80)}\n${parsed.introSummary}\n\n`;
  }

  if (parsed.curatedReport) {
    text += `CURATED REPORT\n${"=".repeat(80)}\n\n${parsed.curatedReport}\n\n`;
  }

  if (parsed.readResults.length > 0) {
    text += `SEARCH RESULTS (${parsed.readResults.length})\n${"=".repeat(80)}\n\n`;
    parsed.readResults.forEach((r, i) => {
      text += `${i + 1}. ${r.title}\n`;
      text += `   URL: ${r.url}\n`;
      if (r.readAt) text += `   Retrieved: ${r.readAt}\n`;
      if (r.text) text += `\n${r.text}\n`;
      text += `\n${"-".repeat(80)}\n\n`;
    });
  }

  return text;
}

export const DeepResearchFullTextTab: React.FC<ToolRendererProps> = ({
  entry,
}) => {
  const parsed = parseResearchEntry(entry);
  const fullText = useMemo(
    () => (parsed ? buildFullText(parsed) : ""),
    [parsed],
  );
  const [copyAllSuccess, setCopyAllSuccess] = useState(false);

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopyAllSuccess(true);
      setTimeout(() => setCopyAllSuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (!fullText.trim()) {
    return (
      <EmptyState
        icon={<BookOpen className="w-12 h-12" />}
        message="No research data available"
      />
    );
  }

  return (
    <div className="relative rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 overflow-hidden">
      <button
        type="button"
        onClick={handleCopyAll}
        aria-label={copyAllSuccess ? "Copied" : "Copy all"}
        title={copyAllSuccess ? "Copied" : "Copy all"}
        className={`absolute top-2 right-2 z-10 inline-flex items-center justify-center w-7 h-7 rounded-md border border-slate-200 dark:border-slate-700 backdrop-blur-sm shadow-sm transition-colors ${
          copyAllSuccess
            ? "bg-green-100/90 dark:bg-green-900/40 text-green-700 dark:text-green-300"
            : "bg-white/80 dark:bg-slate-900/70 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        }`}
      >
        {copyAllSuccess ? (
          <Check className="w-3.5 h-3.5" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
      <div className="p-5">
        <MarkdownStream content={fullText} hideCopyButton className="text-sm" />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Registry contribution — these tabs replace the default "Results" tab
// when wired into a tool's `OverlayTabs` field.
// ─────────────────────────────────────────────────────────────────────────────

export const deepResearchOverlayTabs: ToolOverlayTabSpec[] = [
  {
    id: "report",
    label: "Report",
    Component: DeepResearchReportTab,
  },
  {
    id: "sources",
    label: "Sources",
    Component: DeepResearchSourcesTab,
  },
  {
    id: "fulltext",
    label: "Full Text",
    Component: DeepResearchFullTextTab,
  },
];
