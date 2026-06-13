"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileJson,
  Info,
  Upload,
  Loader2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useAppDispatch } from "@/lib/redux/hooks";
import { createAgent } from "@/features/agents/redux/agent-definition/thunks";
import { useRouter } from "next/navigation";
import { ToolsService } from "@/utils/supabase/tools-service";
import { IMPORT_SOURCES, buildToolIndex } from "./import-types";
import type { ConversionResult, ToolIndex } from "./import-types";
import { converterRegistry } from "./agent-import-converters";
import {
  analyzeImportPaste,
  blockedOnlyByQuickFixes,
  issuesForDisplay,
  type ImportAnalysisResult,
  type ImportValidationIssue,
} from "./agent-import-validation";
import { ImportQuickFixes } from "./ImportQuickFixes";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";

// ─── Types ────────────────────────────────────────────────────────────────────

type PanelState = "paste" | "preview" | "success" | "error";

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const CATEGORIES = ["Matrx System", "Playground", "Frameworks"] as const;

function ImportSidebar({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="px-2 py-1.5 border-b border-border shrink-0">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Import Source
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {CATEGORIES.map((cat) => {
          const items = IMPORT_SOURCES.filter((s) => s.category === cat);
          return (
            <div key={cat} className="mb-1">
              <div className="px-2 pt-2 pb-0.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                {cat}
              </div>
              {items.map((source) => {
                const isActive = source.id === selectedId;
                const isCS = source.status === "coming-soon";
                return (
                  <button
                    key={source.id}
                    onClick={() => onSelect(source.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1 text-[12px] rounded-sm text-left transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-foreground hover:bg-muted",
                    )}
                  >
                    <span className="flex-1 truncate">{source.label}</span>
                    {isCS && (
                      <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted border border-border px-1 rounded">
                        Soon
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Inline alert ─────────────────────────────────────────────────────────────

function Alert({
  variant,
  children,
}: {
  variant: "warning" | "error" | "success";
  children: React.ReactNode;
}) {
  const styles = {
    warning:
      "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800 text-yellow-900 dark:text-yellow-200",
    error:
      "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200",
    success:
      "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-900 dark:text-green-200",
  };
  const Icon = {
    warning: AlertTriangle,
    error: XCircle,
    success: CheckCircle2,
  }[variant];
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
        styles[variant],
      )}
    >
      <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// ─── Live validation panel ────────────────────────────────────────────────────

function IssueRow({ issue }: { issue: ImportValidationIssue }) {
  const Icon =
    issue.severity === "error"
      ? XCircle
      : issue.severity === "warning"
        ? AlertTriangle
        : Info;
  const tone =
    issue.severity === "error"
      ? "text-red-700 dark:text-red-300"
      : issue.severity === "warning"
        ? "text-yellow-800 dark:text-yellow-200"
        : "text-muted-foreground";

  return (
    <li className={cn("flex items-start gap-2 text-xs leading-snug", tone)}>
      <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {issue.path && (
          <span className="font-mono text-[10px] opacity-80 mr-1.5">
            {issue.path}
          </span>
        )}
        <span>{issue.message}</span>
        {issue.fix && (
          <p className="mt-0.5 text-[11px] opacity-80">{issue.fix}</p>
        )}
      </div>
    </li>
  );
}

function ImportAnalysisPanel({
  analysis,
  pastedText,
  onPatchedText,
}: {
  analysis: ImportAnalysisResult;
  pastedText: string;
  onPatchedText: (next: string) => void;
}) {
  if (analysis.status === "empty" || analysis.status === "incomplete") {
    return null;
  }

  if (analysis.status === "malformed") {
    return <Alert variant="error">{analysis.error}</Alert>;
  }

  const errors = issuesForDisplay(analysis.issues).filter(
    (i) => i.severity === "error",
  );
  const warnings = issuesForDisplay(analysis.issues).filter(
    (i) => i.severity === "warning",
  );
  const infos = issuesForDisplay(analysis.issues).filter(
    (i) => i.severity === "info",
  );
  const quickFixOnly = blockedOnlyByQuickFixes(
    analysis.issues,
    analysis.canConvert,
  );
  const hasIssueList = errors.length + warnings.length + infos.length > 0;

  if (analysis.issues.length === 0) {
    return (
      <Alert variant="success">Structure looks good — ready to convert.</Alert>
    );
  }

  if (quickFixOnly && !hasIssueList) {
    return (
      <ImportQuickFixes
        pastedText={pastedText}
        onPatchedText={onPatchedText}
        analysis={analysis}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 shrink-0 max-h-[45%] overflow-y-auto">
      <ImportQuickFixes
        pastedText={pastedText}
        onPatchedText={onPatchedText}
        analysis={analysis}
      />

      {hasIssueList && (
        <div className="rounded-md border border-border bg-muted/30 p-2.5 space-y-2">
          {analysis.canConvert ? (
            <p className="text-xs text-green-700 dark:text-green-300 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Ready to convert — review warnings below if any.
            </p>
          ) : errors.length > 0 ? (
            <p className="text-xs text-red-700 dark:text-red-300 font-medium flex items-center gap-1.5">
              <XCircle className="h-3.5 w-3.5 shrink-0" />
              Fix {errors.length} error{errors.length === 1 ? "" : "s"} before
              converting.
            </p>
          ) : null}

          {errors.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700/80 dark:text-red-300/80 mb-1">
                Errors
              </p>
              <ul className="space-y-1.5">
                {errors.map((issue, i) => (
                  <IssueRow key={`e-${i}`} issue={issue} />
                ))}
              </ul>
            </div>
          )}

          {warnings.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-yellow-800/80 dark:text-yellow-200/80 mb-1">
                Warnings
              </p>
              <ul className="space-y-1.5">
                {warnings.map((issue, i) => (
                  <IssueRow key={`w-${i}`} issue={issue} />
                ))}
              </ul>
            </div>
          )}

          {infos.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Notes
              </p>
              <ul className="space-y-1.5">
                {infos.map((issue, i) => (
                  <IssueRow key={`i-${i}`} issue={issue} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Paste state ──────────────────────────────────────────────────────────────

function PasteBody({
  sourceId,
  sourceLabel,
  isComingSoon,
  pastedText,
  onPastedTextChange,
  onConvert,
  isConverting,
  analysis,
}: {
  sourceId: string;
  sourceLabel: string;
  isComingSoon: boolean;
  pastedText: string;
  onPastedTextChange: (v: string) => void;
  onConvert: () => void;
  isConverting: boolean;
  analysis: ImportAnalysisResult;
}) {
  if (isComingSoon) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8 py-12 text-muted-foreground gap-3">
        <Clock className="w-10 h-10 opacity-20" />
        <div>
          <p className="text-sm font-medium">Coming Soon</p>
          <p className="text-xs opacity-60 mt-1">
            Converter for <strong>{sourceLabel}</strong> is in development.
          </p>
          <p className="text-xs opacity-60 mt-2">
            In the meantime, paste your config as <strong>Agent JSON</strong> to
            import.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 p-4">
      <div className="flex items-center gap-2 shrink-0">
        <FileJson className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">Paste {sourceLabel}</span>
      </div>
      <p className="text-xs text-muted-foreground shrink-0">
        Paste a JSON object below. Issues are checked as you paste — fix errors
        before converting. Matrx accepts snake_case, camelCase, and minor syntax
        fixes automatically.
      </p>

      <Textarea
        wrapperClassName="flex-1 min-h-0 flex flex-col"
        className="flex-1 min-h-0 font-mono text-xs resize-none"
        placeholder={`Paste your ${sourceLabel} here…`}
        value={pastedText}
        onChange={(e) => onPastedTextChange(e.target.value)}
        disabled={isConverting}
        autoFocus
      />

      <ImportAnalysisPanel
        analysis={analysis}
        pastedText={pastedText}
        onPatchedText={onPastedTextChange}
      />

      <div className="flex justify-end shrink-0 pt-1 border-t border-border">
        <Button
          variant="default"
          size="sm"
          onClick={onConvert}
          disabled={
            !pastedText.trim() ||
            isConverting ||
            (analysis.status === "analyzed" && !analysis.canConvert) ||
            analysis.status === "malformed"
          }
        >
          {isConverting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Converting…
            </>
          ) : (
            <>
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              Convert
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Preview state ────────────────────────────────────────────────────────────

function PreviewBody({
  partial,
  warnings,
  onBack,
  onImport,
  isImporting,
}: {
  partial: Omit<Partial<AgentDefinition>, "id">;
  warnings: string[];
  onBack: () => void;
  onImport: () => void;
  isImporting: boolean;
}) {
  const previewJson = JSON.stringify(partial, null, 2);

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 p-4">
      {warnings.length > 0 && (
        <div className="flex flex-col gap-1.5 shrink-0">
          {warnings.map((w, i) => (
            <Alert key={i} variant="warning">
              {w}
            </Alert>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto rounded-md border border-border bg-muted/40 p-3">
        <pre className="text-xs font-mono whitespace-pre-wrap break-words text-foreground">
          {previewJson}
        </pre>
      </div>

      <div className="flex items-center justify-between shrink-0 pt-1 border-t border-border">
        <Button variant="outline" onClick={onBack} disabled={isImporting}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
          Back
        </Button>
        <Button onClick={onImport} disabled={isImporting}>
          {isImporting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Importing…
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
              Import Agent
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Error state ──────────────────────────────────────────────────────────────

function ErrorBody({
  error,
  warnings,
  issues,
  onBack,
}: {
  error: string;
  warnings: string[];
  issues?: ImportValidationIssue[];
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col h-full min-h-0 gap-3 p-4">
      <Alert variant="error">{error}</Alert>
      {issues && issues.length > 0 ? (
        <div className="flex flex-col gap-1.5 max-h-[50%] overflow-y-auto rounded-md border border-border bg-muted/30 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Issues
          </p>
          <ul className="space-y-1.5">
            {issues.map((issue, i) => (
              <IssueRow key={i} issue={issue} />
            ))}
          </ul>
        </div>
      ) : (
        warnings.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {warnings.map((w, i) => (
              <Alert key={i} variant="warning">
                {w}
              </Alert>
            ))}
          </div>
        )
      )}
      <div className="flex mt-auto pt-2 border-t border-border">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
          Back
        </Button>
      </div>
    </div>
  );
}

// ─── Success state ────────────────────────────────────────────────────────────

function SuccessBody({
  agentId,
  agentName,
  onNavigate,
  onClose,
}: {
  agentId: string;
  agentName: string;
  onNavigate: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 py-12 gap-4">
      <CheckCircle2 className="w-12 h-12 text-green-500" />
      <div>
        <p className="text-sm font-semibold">Agent imported successfully</p>
        <p className="text-xs text-muted-foreground mt-1 font-mono break-all">
          {agentId}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          <strong>{agentName}</strong> is ready to edit in the builder.
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button onClick={onNavigate}>
          <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
          Open in Builder
        </Button>
      </div>
    </div>
  );
}

// ─── Main window ──────────────────────────────────────────────────────────────

interface AgentImportWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AgentImportWindow({
  isOpen,
  onClose,
}: AgentImportWindowProps) {
  if (!isOpen) return null;
  return <AgentImportWindowInner onClose={onClose} />;
}

function AgentImportWindowInner({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const router = useRouter();

  // ── Source selection
  const [selectedSourceId, setSelectedSourceId] = useState("agent-json");

  // ── Paste area (persisted)
  const [pastedText, setPastedText] = useState("");

  // ── Panel state machine
  const [panelState, setPanelState] = useState<PanelState>("paste");

  // ── Conversion result
  const [conversionResult, setConversionResult] =
    useState<ConversionResult | null>(null);

  // ── Import result
  const [importedAgentId, setImportedAgentId] = useState<string | null>(null);
  const [importedAgentName, setImportedAgentName] = useState<string>("");

  // ── Loading states
  const [isConverting, setIsConverting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // ── Tool index (fetched once on mount — state so analysis re-runs when ready)
  const [toolIndex, setToolIndex] = useState<ToolIndex>(() => new Map());
  useEffect(() => {
    const svc = new ToolsService();
    svc
      .fetchTools()
      .then((tools) => {
        setToolIndex(buildToolIndex(tools));
      })
      .catch(() => {
        // Non-fatal — converter will fall back to warning for unresolved tools
      });
  }, []);

  const pasteAnalysis = analyzeImportPaste(
    selectedSourceId,
    pastedText,
    toolIndex,
  );

  // ── Source metadata
  const source = IMPORT_SOURCES.find((s) => s.id === selectedSourceId);
  const isComingSoon = source?.status === "coming-soon";
  const sourceLabel = source?.label ?? selectedSourceId;

  // Reset to paste state when source changes
  const handleSourceSelect = useCallback((id: string) => {
    setSelectedSourceId(id);
    setPanelState("paste");
    setConversionResult(null);
  }, []);

  // ── Convert
  const handleConvert = useCallback(async () => {
    const converter = converterRegistry.get(selectedSourceId);
    if (!converter) return;

    setIsConverting(true);
    try {
      const result = await converter.convert(pastedText, toolIndex);
      setConversionResult(result);
      if (result.success) {
        setPanelState("preview");
      } else {
        setPanelState("error");
      }
    } finally {
      setIsConverting(false);
    }
  }, [selectedSourceId, pastedText, toolIndex]);

  // ── Import (create agent)
  const handleImport = useCallback(async () => {
    if (!conversionResult?.success) return;

    setIsImporting(true);
    try {
      const resultAction = await dispatch(
        createAgent(conversionResult.partial),
      );
      if (createAgent.fulfilled.match(resultAction)) {
        const newId = resultAction.payload as string;
        setImportedAgentId(newId);
        setImportedAgentName(
          (conversionResult.partial.name as string | undefined) ??
            "Imported Agent",
        );
        setPanelState("success");
      } else {
        const errorMsg =
          typeof resultAction.payload === "string"
            ? resultAction.payload
            : "Import failed. Your data was not lost — it is still in the paste area.";
        setConversionResult({
          success: false,
          error: errorMsg,
          warnings: conversionResult.warnings ?? [],
        });
        setPanelState("error");
      }
    } finally {
      setIsImporting(false);
    }
  }, [conversionResult, dispatch]);

  // ── Navigate to builder
  const handleNavigate = useCallback(() => {
    if (importedAgentId) {
      router.push(`/agents/${importedAgentId}/build`);
      onClose();
    }
  }, [importedAgentId, router, onClose]);

  // ── Session data persistence
  const collectData = useCallback(
    () => ({
      selectedSource: selectedSourceId,
      pastedText,
    }),
    [selectedSourceId, pastedText],
  );

  // ── Body rendering
  const renderBody = () => {
    if (panelState === "success" && importedAgentId) {
      return (
        <SuccessBody
          agentId={importedAgentId}
          agentName={importedAgentName}
          onNavigate={handleNavigate}
          onClose={onClose}
        />
      );
    }

    const failedResult =
      panelState === "error" && conversionResult && !conversionResult.success
        ? (conversionResult as Extract<
            typeof conversionResult,
            { success: false }
          >)
        : null;
    if (failedResult) {
      return (
        <ErrorBody
          error={failedResult.error}
          warnings={failedResult.warnings}
          issues={failedResult.issues}
          onBack={() => setPanelState("paste")}
        />
      );
    }

    if (panelState === "preview" && conversionResult?.success) {
      return (
        <PreviewBody
          partial={conversionResult.partial}
          warnings={conversionResult.warnings}
          onBack={() => setPanelState("paste")}
          onImport={handleImport}
          isImporting={isImporting}
        />
      );
    }

    // Default: paste
    return (
      <PasteBody
        sourceId={selectedSourceId}
        sourceLabel={sourceLabel}
        isComingSoon={isComingSoon}
        pastedText={pastedText}
        onPastedTextChange={setPastedText}
        onConvert={handleConvert}
        isConverting={isConverting}
        analysis={pasteAnalysis}
      />
    );
  };

  return (
    <WindowPanel
      id="agent-import-window"
      title="Import Agent"
      onClose={onClose}
      width={860}
      height={600}
      minWidth={520}
      minHeight={400}
      overlayId="agentImportWindow"
      onCollectData={collectData}
      sidebar={
        <ImportSidebar
          selectedId={selectedSourceId}
          onSelect={handleSourceSelect}
        />
      }
      sidebarDefaultSize={200}
      sidebarMinSize={160}
      defaultSidebarOpen
    >
      {renderBody()}
    </WindowPanel>
  );
}
