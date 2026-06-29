"use client";
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  lazy,
  Suspense,
  Component,
  ErrorInfo,
  ReactNode,
} from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { MarkdownCopyButton } from "@/components/matrx/buttons/MarkdownCopyButton";
import FullScreenOverlay, {
  TabDefinition,
} from "@/components/official/FullScreenOverlay";
import ProcessorExtractor from "@/components/official/processor-extractor/ProcessorExtractor";
import SectionViewer from "./analyzer/analyzer-options/SectionViewer";
import SectionViewerWithSidebar from "./analyzer/analyzer-options/SectionViewerWithSidebar";
import SectionsViewer from "./analyzer/analyzer-options/sections-viewer";
import LinesViewer, {
  type LineItem,
} from "./analyzer/analyzer-options/lines-viewer";
import SectionViewerV2 from "./analyzer/analyzer-options/section-viewer-V2";
import MarkdownStream from "@/components/MarkdownStream";
import TuiEditorContent, {
  type TuiEditorContentRef,
} from "./tui/TuiEditorContent";
import { MatrxSplit } from "@/components/matrx/MatrxSplit";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  AlertTriangle,
  ChevronDown,
  FlaskConical,
  ShieldAlert,
  ChevronRight,
  Copy,
  Check,
  FileCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const MarkdownAnalyzer = lazy(() => import("./analyzer/MarkdownAnalyzer"));

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId =
  | "write"
  | "matrx_split"
  | "markdown"
  | "wysiwyg"
  | "preview"
  | "analysis"
  | "metadata"
  | "config"
  | "classified_output"
  | "classified_analyzer"
  | "classified_analyzer_sidebar"
  | "section_viewer_v2"
  | "lines_viewer"
  | "sections_viewer"
  | "headers_viewer"
  | "section_texts_viewer";

const ALL_TAB_IDS: TabId[] = [
  "write",
  "matrx_split",
  "markdown",
  "wysiwyg",
  "preview",
  "analysis",
  "metadata",
  "config",
  "classified_output",
  "classified_analyzer",
  "classified_analyzer_sidebar",
  "section_viewer_v2",
  "lines_viewer",
  "sections_viewer",
  "headers_viewer",
  "section_texts_viewer",
];

const TAB_LABELS: Record<TabId, string> = {
  write: "Plain Text Editor",
  matrx_split: "Matrx Split",
  markdown: "Split View Editor",
  wysiwyg: "Rich Text Editor",
  preview: "Preview",
  analysis: "Analysis",
  metadata: "Metadata",
  config: "Config",
  classified_output: "Classified Output",
  classified_analyzer: "Classified Analyzer",
  classified_analyzer_sidebar: "Classified Analyzer Sidebar",
  section_viewer_v2: "Section Viewer V2",
  lines_viewer: "Lines Viewer",
  sections_viewer: "Sections Viewer",
  headers_viewer: "Headers Viewer",
  section_texts_viewer: "Section Texts Viewer",
};

interface FullScreenMarkdownEditorProps {
  isOpen: boolean;
  initialContent: string;
  onSave?: (newContent: string) => void;
  onCancel?: () => void;
  /** Called on every content change. Use this to sync edits to an external
   *  store (e.g. Redux overlayDataSlice) so content survives close/reopen. */
  onChange?: (newContent: string) => void;
  analysisData?: Record<string, unknown>;
  messageId?: string;
  title?: string;
  description?: string;
  showCopyButton?: boolean;
  showSaveButton?: boolean;
  showCancelButton?: boolean;
  tabs?: TabId[];
  initialTab?: TabId;
}

// ─── Copy Helpers ─────────────────────────────────────────────────────────────

function useCopyButton() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);
  return { copied, copy };
}

function CopyIconButton({
  text,
  label,
  icon: Icon = Copy,
}: {
  text: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const { copied, copy } = useCopyButton();
  return (
    <button
      onClick={() => copy(text)}
      title={label}
      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium border border-border bg-card hover:bg-accent transition-colors text-foreground"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Icon className="h-3.5 w-3.5" />
      )}
      {copied ? "Copied!" : label}
    </button>
  );
}

// Serialise data safely for diagnostic reports — truncates very large objects
function safeSerialise(value: unknown, maxLen = 4000): string {
  try {
    const s = JSON.stringify(value, null, 2);
    if (s.length > maxLen)
      return s.slice(0, maxLen) + `\n... [truncated at ${maxLen} chars]`;
    return s;
  } catch {
    return String(value);
  }
}

// ─── Error Boundary ───────────────────────────────────────────────────────────

interface DiagnosticContext {
  messageId?: string;
  analysisData?: Record<string, unknown>;
  markdownContent?: string;
  route: string;
  capturedAt: string;
}

interface TabErrorBoundaryProps {
  tabId: string;
  tabLabel: string;
  isAdmin: boolean;
  context: DiagnosticContext;
  children: ReactNode;
}

interface TabErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

class TabErrorBoundary extends Component<
  TabErrorBoundaryProps,
  TabErrorBoundaryState
> {
  constructor(props: TabErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(
    error: Error,
  ): Partial<TabErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error(
      `[FullScreenMarkdownEditor] Tab "${this.props.tabId}" crashed:`,
      error,
      errorInfo,
    );
  }

  override render() {
    if (!this.state.hasError) return this.props.children;

    const { tabLabel, tabId, isAdmin, context } = this.props;
    const { error, errorInfo, showDetails } = this.state;

    return (
      <TabErrorFallback
        tabId={tabId}
        tabLabel={tabLabel}
        isAdmin={isAdmin}
        context={context}
        error={error}
        errorInfo={errorInfo}
        showDetails={showDetails}
        onToggleDetails={() =>
          this.setState((s) => ({ showDetails: !s.showDetails }))
        }
        onRetry={() =>
          this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
            showDetails: false,
          })
        }
      />
    );
  }
}

// ─── Tab Classification ───────────────────────────────────────────────────────
//
// IMPORTANT DISTINCTION — two fundamentally different kinds of tabs:
//
//   MARKDOWN-ONLY tabs: operate purely on the markdown text content.
//   They must never fail — if they crash it is always a code bug.
//   IDs: write, matrx_split, markdown, wysiwyg, preview
//
//   DATA-DEPENDENT tabs: require pre-processed analysisData fields
//   (produced by the server-side markdown analyser). If analysisData is
//   absent or the required field is missing/wrong-type, these tabs will
//   always show "No data available" — that is EXPECTED, not a bug.
//   IDs: analysis, metadata, config, classified_output, classified_analyzer,
//        classified_analyzer_sidebar, section_viewer_v2, lines_viewer,
//        sections_viewer, headers_viewer, section_texts_viewer
//
// The error boundary wraps both kinds. When a DATA-DEPENDENT tab shows
// "No data available" it is surfacing the UnavailableDataNotice — that is
// NOT an error boundary catch. Only use the crash report when the error
// boundary actually fires (the component itself throws).

const MARKDOWN_ONLY_TABS = new Set<TabId>([
  "write",
  "matrx_split",
  "markdown",
  "wysiwyg",
  "preview",
]);

const DATA_DEPENDENT_REQUIRED_KEYS: Partial<Record<TabId, string>> = {
  config: "config",
  classified_output: "classified_output",
  classified_analyzer: "classified_output",
  classified_analyzer_sidebar: "classified_output",
  section_viewer_v2: "classified_output",
  lines_viewer: "lines",
  sections_viewer: "sections",
  headers_viewer: "sections_by_header",
  section_texts_viewer: "section_texts",
};

function getRelevantAnalysisKey(tabId: string): string | null {
  return DATA_DEPENDENT_REQUIRED_KEYS[tabId as TabId] ?? null;
}

// ─── Diagnostic Report Builder ────────────────────────────────────────────────

function buildCrashReport(opts: {
  type: "crash" | "no-data";
  tabId: string;
  tabLabel: string;
  reason?: string;
  context: DiagnosticContext;
  error?: Error | null;
  errorInfo?: ErrorInfo | null;
  includeMarkdown: boolean;
}): string {
  const {
    type,
    tabId,
    tabLabel,
    reason,
    context,
    error,
    errorInfo,
    includeMarkdown,
  } = opts;
  const lines: string[] = [];
  const isMarkdownOnly = MARKDOWN_ONLY_TABS.has(tabId as TabId);
  const noAnalysisData = !context.analysisData;
  // no-data on a data-dependent tab with no analysisData is always expected behaviour
  const isExpectedNoData = type === "no-data" && noAnalysisData;

  lines.push("# AGENT — FullScreenMarkdownEditor Diagnostic Report");
  lines.push("");
  lines.push(
    "> This report was generated automatically. Paste it into a new conversation.",
  );
  lines.push(
    "> The agent receiving this does not need extra context — everything needed is below.",
  );
  lines.push("");

  // ── Severity banner ──────────────────────────────────────────────────────
  if (type === "crash" && isMarkdownOnly) {
    lines.push("## ⚠ Severity: BUG — must fix");
    lines.push(
      `This tab (\`${tabId}\`) is **markdown-only** — it works purely from text content`,
    );
    lines.push(
      "and has no dependency on analysisData. A crash here is always a code defect.",
    );
    lines.push("It should never show an error under any circumstances.");
  } else if (type === "crash" && !isMarkdownOnly) {
    lines.push("## ⚠ Severity: BUG — likely fix needed");
    lines.push(
      `This tab (\`${tabId}\`) is **data-dependent**. It crashed (threw a React error)`,
    );
    lines.push(
      "rather than gracefully showing the 'no data' fallback. The crash itself is the bug —",
    );
    lines.push(
      "even with bad/missing data, the tab should degrade gracefully, not throw.",
    );
  } else if (isExpectedNoData) {
    lines.push("## ℹ Severity: Expected behaviour — no code bug");
    lines.push(
      `This tab (\`${tabId}\`) is **data-dependent** and no \`analysisData\` prop was passed.`,
    );
    lines.push(
      "This is normal when the component is opened from a context that does not supply",
    );
    lines.push(
      "analysisData (e.g. a plain prompt editor). The tab correctly shows 'no data'.",
    );
    lines.push("");
    lines.push(
      "**If this was opened via the Admin Dev Tabs dropdown:** that is intentional —",
    );
    lines.push(
      "you were force-testing a tab that has no data in this context. No fix needed.",
    );
    lines.push("");
    lines.push(
      "**If you expected this tab to have data:** trace who renders `FullScreenMarkdownEditor`",
    );
    lines.push(
      `at route \`${context.route}\` and check whether it passes the \`analysisData\` prop.`,
    );
  } else {
    lines.push("## ⚠ Severity: Data missing — investigation needed");
    lines.push(
      `This tab (\`${tabId}\`) is **data-dependent** and \`analysisData\` was provided`,
    );
    lines.push("but the required field was absent or had the wrong shape.");
  }
  lines.push("");

  // ── What Happened ─────────────────────────────────────────────────────────
  lines.push("## What Happened");
  if (type === "crash") {
    lines.push(
      `The tab **"${tabLabel}"** (id: \`${tabId}\`) threw an unhandled React render error`,
    );
    lines.push(
      "and was caught by its error boundary in `FullScreenMarkdownEditor`.",
    );
  } else {
    lines.push(
      `The tab **"${tabLabel}"** (id: \`${tabId}\`) could not render because`,
    );
    lines.push("the required data was missing or had the wrong shape.");
    if (reason) lines.push(`**Reason:** ${reason}`);
  }
  lines.push("");

  // ── Location ──────────────────────────────────────────────────────────────
  lines.push("## Location");
  lines.push("- **Component:** `FullScreenMarkdownEditor`");
  lines.push(
    "- **File:** `components/mardown-display/chat-markdown/FullScreenMarkdownEditor.tsx`",
  );
  lines.push(`- **Tab ID:** \`${tabId}\``);
  lines.push(`- **Tab Label:** ${tabLabel}`);
  lines.push(
    `- **Tab Type:** ${isMarkdownOnly ? "markdown-only (no data dependency)" : "data-dependent (requires analysisData)"}`,
  );
  lines.push(`- **Route (window.location):** \`${context.route}\``);
  lines.push(`- **Message ID:** \`${context.messageId ?? "not provided"}\``);
  lines.push(`- **Captured At:** ${context.capturedAt}`);
  lines.push("");

  // ── Error details (crash only) ────────────────────────────────────────────
  if (type === "crash" && error) {
    lines.push("## Error");
    lines.push(`\`\`\`\n${error.name}: ${error.message}\n\`\`\``);
    lines.push("");

    if (error.stack) {
      lines.push("## JS Stack Trace");
      lines.push(`\`\`\`\n${error.stack}\n\`\`\``);
      lines.push("");
    }

    if (errorInfo?.componentStack) {
      lines.push("## React Component Stack");
      lines.push(
        "This is the React render tree at the point of failure — use this to find which component threw.",
      );
      lines.push(`\`\`\`\n${errorInfo.componentStack.trim()}\n\`\`\``);
      lines.push("");
    }

    const digest = (errorInfo as ErrorInfo & { digest?: string })?.digest;
    if (digest) {
      lines.push("## Next.js Error Digest");
      lines.push(`\`${digest}\``);
      lines.push("");
    }
  }

  // ── analysisData ──────────────────────────────────────────────────────────
  if (context.analysisData) {
    lines.push("## analysisData — Top-level Keys Present");
    const keys = Object.keys(context.analysisData);
    lines.push(`\`\`\`json\n${JSON.stringify(keys, null, 2)}\n\`\`\``);
    lines.push("");

    const relevantKey = getRelevantAnalysisKey(tabId);
    if (relevantKey) {
      if (relevantKey in context.analysisData) {
        const value = context.analysisData[relevantKey];
        lines.push(`## analysisData.${relevantKey} (what this tab reads)`);
        lines.push(
          `Type: \`${Array.isArray(value) ? `array[${(value as unknown[]).length}]` : typeof value}\``,
        );
        lines.push(`\`\`\`json\n${safeSerialise(value, 2000)}\n\`\`\``);
        lines.push("");
      } else {
        lines.push(`## analysisData.${relevantKey} (what this tab reads)`);
        lines.push(
          `**This key is NOT present on the analysisData object.** That is the root cause.`,
        );
        lines.push("");
      }
    }

    lines.push("## Full analysisData Snapshot");
    lines.push(
      `\`\`\`json\n${safeSerialise(context.analysisData, 3000)}\n\`\`\``,
    );
    lines.push("");
  } else {
    lines.push("## analysisData");
    lines.push(
      "**Not provided** — the `analysisData` prop was not passed to `FullScreenMarkdownEditor` at this call site.",
    );
    lines.push(
      `Check the component usage at route \`${context.route}\` to confirm.`,
    );
    lines.push("");
  }

  // ── Markdown content ──────────────────────────────────────────────────────
  if (includeMarkdown && context.markdownContent) {
    lines.push("## Markdown Content (the text being displayed/edited)");
    lines.push(`\`\`\`markdown\n${context.markdownContent}\n\`\`\``);
    lines.push("");
  }

  // ── What To Do ────────────────────────────────────────────────────────────
  lines.push("## What To Do");
  if (type === "crash" && isMarkdownOnly) {
    lines.push(
      "This is a real bug. Markdown-only tabs have no data dependency and must never crash.",
    );
    lines.push(
      "1. Read the React Component Stack to identify which child component threw.",
    );
    lines.push("2. Check the JS Stack Trace for the exact line number.");
    lines.push(
      "3. Fix the crash in the identified component. Do not add a data guard — the data is not the issue.",
    );
  } else if (type === "crash") {
    lines.push(
      "This tab crashed instead of gracefully degrading. The crash itself is the bug.",
    );
    lines.push(
      "1. Read the React Component Stack to find the throwing component.",
    );
    lines.push("2. Check the JS Stack Trace for the exact line.");
    lines.push(
      "3. Add null/type guards inside the identified component so it degrades gracefully",
    );
    lines.push("   when its expected data is absent, rather than throwing.");
    lines.push(
      "4. If the data shape is wrong, also trace the data producer and fix it.",
    );
  } else if (isExpectedNoData) {
    lines.push("No code fix is required for this specific case.");
    lines.push(
      "- If you want this tab to show data in this context, find the `FullScreenMarkdownEditor`",
    );
    lines.push(
      `  usage at \`${context.route}\` and pass the \`analysisData\` prop.`,
    );
    lines.push(
      "- If you only want to expose this tab when data is available, restrict the `tabs` prop",
    );
    lines.push(
      "  to exclude data-dependent tabs when analysisData is not provided.",
    );
  } else {
    lines.push(
      "analysisData was provided but the required field was missing or malformed.",
    );
    lines.push(
      "1. Check the analysisData snapshot above — confirm whether the key exists and its type.",
    );
    lines.push(
      "2. Trace where analysisData is produced (the server-side markdown analyser) and why",
    );
    lines.push("   the expected field is absent or has the wrong shape.");
    lines.push(
      "3. Fix the data producer, or add a transform/fallback in `FullScreenMarkdownEditor`.",
    );
  }

  return lines.join("\n");
}

// ─── Error Fallback UI ────────────────────────────────────────────────────────

interface TabErrorFallbackProps {
  tabId: string;
  tabLabel: string;
  isAdmin: boolean;
  context: DiagnosticContext;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
  onToggleDetails: () => void;
  onRetry: () => void;
}

function TabErrorFallback({
  tabId,
  tabLabel,
  isAdmin,
  context,
  error,
  errorInfo,
  showDetails,
  onToggleDetails,
  onRetry,
}: TabErrorFallbackProps) {
  const reportBase = buildCrashReport({
    type: "crash",
    tabId,
    tabLabel,
    context,
    error,
    errorInfo,
    includeMarkdown: false,
  });
  const reportFull = buildCrashReport({
    type: "crash",
    tabId,
    tabLabel,
    context,
    error,
    errorInfo,
    includeMarkdown: true,
  });

  return (
    <div className="w-full h-full flex flex-col overflow-auto bg-textured">
      {/* ── User-facing section ── */}
      <div className="flex flex-col items-center justify-center px-4 py-10 gap-6 flex-shrink-0">
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-full bg-amber-100 dark:bg-amber-950 p-5 shadow-md">
            <AlertTriangle
              className="h-10 w-10 text-amber-500 dark:text-amber-400"
              strokeWidth={1.5}
            />
          </div>
          <div className="text-center space-y-1.5">
            <h2 className="text-xl font-semibold text-foreground tracking-tight">
              This view is unavailable
            </h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              The{" "}
              <span className="font-medium text-foreground">{tabLabel}</span>{" "}
              tab encountered an unexpected error and could not be displayed.
              Other tabs are unaffected.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="rounded-full px-6 text-sm shadow-sm"
        >
          Try again
        </Button>
      </div>

      {/* ── Admin-only debug panel ── */}
      {isAdmin && (
        <div className="mx-4 mb-6 rounded-2xl border-2 border-primary/30 overflow-hidden shadow-md flex-shrink-0">
          {/* Header — always visible, clearly marked */}
          <div className="bg-primary/10 border-b border-primary/20 px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldAlert className="h-5 w-5 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-primary leading-tight">
                  Admin Debug Panel —{" "}
                  <span className="font-normal">Only you can see this</span>
                </p>
                <p className="text-xs text-primary/70 leading-tight">
                  {MARKDOWN_ONLY_TABS.has(tabId as TabId)
                    ? "⚠ This is a markdown-only tab — crashes here are always real bugs"
                    : "This is a data-dependent tab — may show no-data when analysisData is absent"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <CopyIconButton text={reportBase} label="Copy report" />
              <CopyIconButton
                text={reportFull}
                label="Copy with content"
                icon={FileCode}
              />
              <button
                onClick={onToggleDetails}
                className="ml-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary/80 hover:bg-primary/10 transition-colors"
              >
                {showDetails ? "Collapse" : "Expand"}
                {showDetails ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {showDetails && (
            <div className="bg-card px-4 py-4 space-y-5 text-sm">
              {/* Context row */}
              <AdminSection label="Context">
                <AdminKV label="Tab" value={`${tabLabel} (${tabId})`} />
                <AdminKV label="Route" value={context.route} mono />
                <AdminKV
                  label="Message ID"
                  value={context.messageId ?? "not provided"}
                  mono
                />
                <AdminKV label="Captured at" value={context.capturedAt} mono />
              </AdminSection>

              {/* Error */}
              {error && (
                <AdminSection label="Error">
                  <div className="rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2">
                    <p className="font-mono text-sm text-destructive break-all">
                      {error.name}: {error.message}
                    </p>
                  </div>
                </AdminSection>
              )}

              {/* JS stack */}
              {error?.stack && (
                <AdminSection label="JS Stack Trace">
                  <AdminCodeBlock content={error.stack} maxH="max-h-56" />
                </AdminSection>
              )}

              {/* React component stack */}
              {errorInfo?.componentStack && (
                <AdminSection
                  label="React Component Stack"
                  hint="The render tree at point of failure — find the throwing component here"
                >
                  <AdminCodeBlock
                    content={errorInfo.componentStack.trim()}
                    maxH="max-h-56"
                  />
                </AdminSection>
              )}

              {/* analysisData keys */}
              {context.analysisData && (
                <AdminSection label="analysisData — Top-level Keys">
                  <div className="flex flex-wrap gap-1.5">
                    {Object.keys(context.analysisData).map((k) => {
                      const relevant = getRelevantAnalysisKey(tabId) === k;
                      return (
                        <span
                          key={k}
                          className={cn(
                            "inline-block rounded-full px-2.5 py-0.5 text-xs font-mono border",
                            relevant
                              ? "bg-primary/15 border-primary/40 text-primary font-semibold"
                              : "bg-muted border-border text-muted-foreground",
                          )}
                        >
                          {k}
                          {relevant && " ← this tab reads this"}
                        </span>
                      );
                    })}
                  </div>
                </AdminSection>
              )}

              {/* Relevant sub-key */}
              {(() => {
                const key = getRelevantAnalysisKey(tabId);
                if (!key) return null;
                const value = context.analysisData?.[key];
                return (
                  <AdminSection
                    label={`analysisData.${key} (what this tab reads)`}
                    hint={
                      value === undefined
                        ? "⚠ Key is missing from analysisData"
                        : undefined
                    }
                  >
                    {value === undefined ? (
                      <p className="text-xs text-destructive font-mono">
                        undefined — key not present
                      </p>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground mb-1.5">
                          Type:{" "}
                          <span className="font-mono text-foreground">
                            {Array.isArray(value)
                              ? `array[${(value as unknown[]).length}]`
                              : typeof value}
                          </span>
                        </p>
                        <AdminCodeBlock
                          content={safeSerialise(value, 2000)}
                          maxH="max-h-48"
                        />
                      </>
                    )}
                  </AdminSection>
                );
              })()}

              {/* Digest */}
              {(errorInfo as ErrorInfo & { digest?: string })?.digest && (
                <AdminSection label="Next.js Error Digest">
                  <p className="font-mono text-xs text-foreground">
                    {(errorInfo as ErrorInfo & { digest?: string }).digest}
                  </p>
                </AdminSection>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Admin Sub-Components ─────────────────────────────────────────────────────

function AdminSection({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {hint && <p className="text-xs text-amber-500 font-medium">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function AdminKV({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-muted-foreground w-24 flex-shrink-0">{label}</span>
      <span className={cn("text-foreground break-all", mono && "font-mono")}>
        {value}
      </span>
    </div>
  );
}

function AdminCodeBlock({
  content,
  maxH = "max-h-48",
}: {
  content: string;
  maxH?: string;
}) {
  return (
    <pre
      className={cn(
        "rounded-lg bg-muted border border-border px-3 py-2 text-xs font-mono text-foreground overflow-auto whitespace-pre-wrap break-all",
        maxH,
      )}
    >
      {content}
    </pre>
  );
}

// ─── Admin Tab Opener ─────────────────────────────────────────────────────────

interface AdminTabOpenerProps {
  activeTabIds: Set<TabId>;
  onOpenTab: (tabId: TabId) => void;
  compact?: boolean;
}

function AdminTabOpener({
  activeTabIds,
  onOpenTab,
  compact = false,
}: AdminTabOpenerProps) {
  const unavailableTabs = ALL_TAB_IDS.filter((id) => !activeTabIds.has(id));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={compact ? "icon" : "sm"}
          aria-label="Dev Tabs"
          title="Dev Tabs"
          className={cn(
            "border-primary/40 text-primary hover:bg-primary/10 hover:text-primary",
            compact
              ? "h-9 w-9 rounded-full"
              : "h-7 rounded-full px-3 text-xs gap-1.5",
          )}
        >
          <FlaskConical className={cn(compact ? "h-4 w-4" : "h-3.5 w-3.5")} />
          {!compact && (
            <>
              Dev Tabs
              <ChevronDown className="h-3 w-3 opacity-60" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs flex items-center gap-1.5 text-primary">
          <ShieldAlert className="h-3.5 w-3.5" />
          Admin — Force Open Tab
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <div className="px-2 py-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
            Markdown-only
          </div>
          {ALL_TAB_IDS.filter((id) => MARKDOWN_ONLY_TABS.has(id)).map((id) => {
            const isActive = activeTabIds.has(id);
            return (
              <DropdownMenuItem
                key={id}
                onClick={() => onOpenTab(id)}
                className={cn(
                  "text-xs cursor-pointer",
                  isActive && "text-muted-foreground",
                )}
              >
                <span className={cn("flex-1", isActive && "opacity-60")}>
                  {TAB_LABELS[id]}
                </span>
                {isActive && (
                  <span className="ml-2 text-[10px] rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
                    active
                  </span>
                )}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <div className="px-2 py-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
            Needs analysisData
          </div>
          {ALL_TAB_IDS.filter((id) => !MARKDOWN_ONLY_TABS.has(id)).map((id) => {
            const isActive = activeTabIds.has(id);
            return (
              <DropdownMenuItem
                key={id}
                onClick={() => onOpenTab(id)}
                className={cn(
                  "text-xs cursor-pointer",
                  isActive && "text-muted-foreground",
                )}
              >
                <span className={cn("flex-1", isActive && "opacity-60")}>
                  {TAB_LABELS[id]}
                </span>
                {isActive && (
                  <span className="ml-2 text-[10px] rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
                    active
                  </span>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const FullScreenMarkdownEditor: React.FC<FullScreenMarkdownEditorProps> = ({
  isOpen,
  initialContent,
  onSave,
  onCancel,
  onChange,
  analysisData,
  messageId,
  title = "Edit Content",
  description = "A dialog for editing content with options to write in markdown, use a rich text editor, preview the content, analyze it, or view metadata.",
  showCopyButton = true,
  showSaveButton = true,
  showCancelButton = true,
  tabs = ALL_TAB_IDS,
  initialTab = "write",
}) => {
  const [editedContent, setEditedContent] = useState(initialContent ?? "");
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [forcedTabs, setForcedTabs] = useState<TabId[]>([]);
  const [capturedAt] = useState(() => new Date().toISOString());
  const tuiEditorRef = useRef<TuiEditorContentRef>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const mode = useAppSelector((s) => s.theme.mode);
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const isMobile = useIsMobile();
  const route =
    typeof window !== "undefined" ? window.location.href : "unknown";

  // Update the edited content whenever initialContent changes or editor is opened
  useEffect(() => {
    if (isOpen) {
      setEditedContent(initialContent ?? "");
    }
  }, [isOpen, initialContent]);

  // Reset forced tabs when closed
  useEffect(() => {
    if (!isOpen) {
      setForcedTabs([]);
    }
  }, [isOpen]);

  const handleTabChange = (newTab: string) => {
    setActiveTab(newTab);
  };

  // Central content setter — always fires the optional onChange so external
  // stores (e.g. overlayDataSlice) can track in-progress edits without waiting
  // for an explicit save.
  const handleContentChange = useCallback((newContent: string) => {
    setEditedContent(newContent);
    onChangeRef.current?.(newContent);
  }, []);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (activeTab === "write") {
      handleContentChange(e.target.value);
    }
  };

  const handleSave = () => {
    if (onSave) {
      onSave(editedContent);
    }
  };

  const handleForceOpenTab = useCallback((tabId: TabId) => {
    setForcedTabs((prev) => (prev.includes(tabId) ? prev : [...prev, tabId]));
    setActiveTab(tabId);
  }, []);

  // Merge prop tabs + admin-forced tabs (preserving order)
  const safeTabs = Array.isArray(tabs) ? tabs : ALL_TAB_IDS;
  const effectiveTabs = [...new Set([...safeTabs, ...forcedTabs])] as TabId[];
  const activeTabIds = new Set<TabId>(effectiveTabs);

  // Diagnostic context passed into every error boundary
  const diagnosticContext: DiagnosticContext = {
    messageId,
    analysisData,
    markdownContent: editedContent,
    route,
    capturedAt,
  };

  // Helper: wrap content in error boundary
  const wrapInBoundary = (tabId: TabId, content: ReactNode): ReactNode => (
    <TabErrorBoundary
      tabId={tabId}
      tabLabel={TAB_LABELS[tabId]}
      isAdmin={isAdmin}
      context={diagnosticContext}
    >
      {content}
    </TabErrorBoundary>
  );

  // ── Build tab definitions ────────────────────────────────────────────────
  const tabDefinitions: TabDefinition[] = [];

  if (effectiveTabs.includes("write")) {
    tabDefinitions.push({
      id: "write",
      label: TAB_LABELS.write,
      content: wrapInBoundary(
        "write",
        <textarea
          className="w-full h-full p-4 outline-none resize-none border-none bg-textured text-foreground text-base font-mono"
          value={editedContent}
          onChange={handleTextareaChange}
          placeholder="Start writing markdown..."
          aria-label="Markdown Editor"
        />,
      ),
      className: "p-0",
    });
  }

  if (effectiveTabs.includes("matrx_split")) {
    tabDefinitions.push({
      id: "matrx_split",
      label: TAB_LABELS.matrx_split,
      content: wrapInBoundary(
        "matrx_split",
        <MatrxSplit
          value={editedContent}
          onChange={handleContentChange}
          placeholder="Start writing markdown..."
          textareaClassName="text-base font-mono"
          analysisData={analysisData}
          messageId={messageId}
          allowFullScreenEditor={false}
        />,
      ),
      className: "overflow-hidden p-0",
    });
  }

  if (effectiveTabs.includes("markdown")) {
    tabDefinitions.push({
      id: "markdown",
      label: TAB_LABELS.markdown,
      content: wrapInBoundary(
        "markdown",
        <TuiEditorContent
          ref={tuiEditorRef}
          content={editedContent}
          onChange={handleContentChange}
          isActive={activeTab === "markdown"}
          editMode="markdown"
        />,
      ),
      className: "overflow-hidden p-0 bg-textured",
    });
  }

  if (effectiveTabs.includes("wysiwyg")) {
    tabDefinitions.push({
      id: "wysiwyg",
      label: TAB_LABELS.wysiwyg,
      content: wrapInBoundary(
        "wysiwyg",
        <TuiEditorContent
          ref={tuiEditorRef}
          content={editedContent}
          onChange={handleContentChange}
          isActive={activeTab === "wysiwyg"}
          editMode="wysiwyg"
        />,
      ),
      className: "overflow-hidden p-0 bg-textured",
    });
  }

  if (effectiveTabs.includes("preview")) {
    tabDefinitions.push({
      id: "preview",
      label: TAB_LABELS.preview,
      content: wrapInBoundary(
        "preview",
        <div className="w-full h-full overflow-auto bg-textured">
          <div className="flex justify-center min-h-full">
            <div
              className={cn(
                "w-full min-h-full",
                isMobile
                  ? "px-2 py-2"
                  : "max-w-[750px] p-6 border-x-3 border-gray-500 dark:border-gray-500 shadow-sm",
              )}
            >
              <MarkdownStream
                content={editedContent}
                isStreamActive={false}
                analysisData={analysisData}
                messageId={messageId}
                allowFullScreenEditor={false}
              />
            </div>
          </div>
        </div>,
      ),
      className: "p-0",
    });
  }

  if (effectiveTabs.includes("analysis")) {
    tabDefinitions.push({
      id: "analysis",
      label: TAB_LABELS.analysis,
      content: wrapInBoundary(
        "analysis",
        <Suspense fallback={<SuspenseLoader />}>
          <MarkdownAnalyzer messageId={messageId} />
        </Suspense>,
      ),
      className: "p-4",
    });
  }

  if (effectiveTabs.includes("metadata")) {
    tabDefinitions.push({
      id: "metadata",
      label: TAB_LABELS.metadata,
      content: wrapInBoundary(
        "metadata",
        <ProcessorExtractor
          jsonData={analysisData}
          configKey={messageId ? `metadata-${messageId}` : "metadata"}
        />,
      ),
      className: "p-0",
    });
  }

  if (effectiveTabs.includes("config")) {
    const hasConfig =
      Boolean(analysisData?.config) || forcedTabs.includes("config");
    tabDefinitions.push({
      id: "config",
      label: TAB_LABELS.config,
      content: wrapInBoundary(
        "config",
        hasConfig ? (
          <ProcessorExtractor
            jsonData={analysisData?.config as Record<string, unknown>}
            configKey={messageId ? `config-${messageId}` : "config"}
          />
        ) : (
          <UnavailableDataNotice
            tabId="config"
            tabLabel={TAB_LABELS.config}
            reason="No config data available in analysisData."
            isAdmin={isAdmin}
            context={diagnosticContext}
          />
        ),
      ),
      className: "p-0",
    });
  }

  if (effectiveTabs.includes("classified_output")) {
    const hasData =
      Boolean(analysisData?.classified_output) ||
      forcedTabs.includes("classified_output");
    tabDefinitions.push({
      id: "classified_output",
      label: TAB_LABELS.classified_output,
      content: wrapInBoundary(
        "classified_output",
        hasData ? (
          <ProcessorExtractor
            jsonData={
              analysisData?.classified_output as Record<string, unknown>
            }
            configKey={
              messageId ? `classified_output-${messageId}` : "classified_output"
            }
          />
        ) : (
          <UnavailableDataNotice
            tabId="classified_output"
            tabLabel={TAB_LABELS.classified_output}
            reason="No classified_output data in analysisData."
            isAdmin={isAdmin}
            context={diagnosticContext}
          />
        ),
      ),
      className: "p-0",
    });
  }

  if (effectiveTabs.includes("classified_analyzer")) {
    const hasData =
      Array.isArray(analysisData?.classified_output) ||
      forcedTabs.includes("classified_analyzer");
    tabDefinitions.push({
      id: "classified_analyzer",
      label: TAB_LABELS.classified_analyzer,
      content: wrapInBoundary(
        "classified_analyzer",
        hasData && Array.isArray(analysisData?.classified_output) ? (
          <SectionViewer data={analysisData.classified_output as unknown[]} />
        ) : (
          <UnavailableDataNotice
            tabId="classified_analyzer"
            tabLabel={TAB_LABELS.classified_analyzer}
            reason="analysisData.classified_output is not an array."
            isAdmin={isAdmin}
            context={diagnosticContext}
          />
        ),
      ),
      className: "p-0",
    });
  }

  if (effectiveTabs.includes("classified_analyzer_sidebar")) {
    const hasData =
      Array.isArray(analysisData?.classified_output) ||
      forcedTabs.includes("classified_analyzer_sidebar");
    tabDefinitions.push({
      id: "classified_analyzer_sidebar",
      label: TAB_LABELS.classified_analyzer_sidebar,
      content: wrapInBoundary(
        "classified_analyzer_sidebar",
        hasData && Array.isArray(analysisData?.classified_output) ? (
          <SectionViewerWithSidebar
            data={analysisData.classified_output as unknown[]}
          />
        ) : (
          <UnavailableDataNotice
            tabId="classified_analyzer_sidebar"
            tabLabel={TAB_LABELS.classified_analyzer_sidebar}
            reason="analysisData.classified_output is not an array."
            isAdmin={isAdmin}
            context={diagnosticContext}
          />
        ),
      ),
      className: "p-0",
    });
  }

  if (effectiveTabs.includes("section_viewer_v2")) {
    const hasData =
      Array.isArray(analysisData?.classified_output) ||
      forcedTabs.includes("section_viewer_v2");
    tabDefinitions.push({
      id: "section_viewer_v2",
      label: TAB_LABELS.section_viewer_v2,
      content: wrapInBoundary(
        "section_viewer_v2",
        hasData && Array.isArray(analysisData?.classified_output) ? (
          <SectionViewerV2 data={analysisData.classified_output as unknown[]} />
        ) : (
          <UnavailableDataNotice
            tabId="section_viewer_v2"
            tabLabel={TAB_LABELS.section_viewer_v2}
            reason="analysisData.classified_output is not an array."
            isAdmin={isAdmin}
            context={diagnosticContext}
          />
        ),
      ),
      className: "p-0",
    });
  }

  if (effectiveTabs.includes("lines_viewer")) {
    const hasData =
      Array.isArray(analysisData?.lines) || forcedTabs.includes("lines_viewer");
    tabDefinitions.push({
      id: "lines_viewer",
      label: TAB_LABELS.lines_viewer,
      content: wrapInBoundary(
        "lines_viewer",
        hasData && Array.isArray(analysisData?.lines) ? (
          <LinesViewer data={analysisData.lines as LineItem[]} />
        ) : (
          <UnavailableDataNotice
            tabId="lines_viewer"
            tabLabel={TAB_LABELS.lines_viewer}
            reason="analysisData.lines is not an array."
            isAdmin={isAdmin}
            context={diagnosticContext}
          />
        ),
      ),
      className: "p-0",
    });
  }

  if (effectiveTabs.includes("sections_viewer")) {
    const hasData =
      Array.isArray(analysisData?.sections) ||
      forcedTabs.includes("sections_viewer");
    tabDefinitions.push({
      id: "sections_viewer",
      label: TAB_LABELS.sections_viewer,
      content: wrapInBoundary(
        "sections_viewer",
        hasData && Array.isArray(analysisData?.sections) ? (
          <SectionViewerWithSidebar data={analysisData.sections as unknown[]} />
        ) : (
          <UnavailableDataNotice
            tabId="sections_viewer"
            tabLabel={TAB_LABELS.sections_viewer}
            reason="analysisData.sections is not an array."
            isAdmin={isAdmin}
            context={diagnosticContext}
          />
        ),
      ),
      className: "p-0",
    });
  }

  if (effectiveTabs.includes("headers_viewer")) {
    const hasData =
      Array.isArray(analysisData?.sections_by_header) ||
      forcedTabs.includes("headers_viewer");
    tabDefinitions.push({
      id: "headers_viewer",
      label: TAB_LABELS.headers_viewer,
      content: wrapInBoundary(
        "headers_viewer",
        hasData && Array.isArray(analysisData?.sections_by_header) ? (
          <SectionViewerWithSidebar
            data={analysisData.sections_by_header as unknown[]}
          />
        ) : (
          <UnavailableDataNotice
            tabId="headers_viewer"
            tabLabel={TAB_LABELS.headers_viewer}
            reason="analysisData.sections_by_header is not an array."
            isAdmin={isAdmin}
            context={diagnosticContext}
          />
        ),
      ),
      className: "p-0",
    });
  }

  if (effectiveTabs.includes("section_texts_viewer")) {
    const hasData =
      Array.isArray(analysisData?.section_texts) ||
      forcedTabs.includes("section_texts_viewer");
    tabDefinitions.push({
      id: "section_texts_viewer",
      label: TAB_LABELS.section_texts_viewer,
      content: wrapInBoundary(
        "section_texts_viewer",
        hasData && Array.isArray(analysisData?.section_texts) ? (
          <SectionsViewer data={analysisData.section_texts as unknown[]} />
        ) : (
          <UnavailableDataNotice
            tabId="section_texts_viewer"
            tabLabel={TAB_LABELS.section_texts_viewer}
            reason="analysisData.section_texts is not an array."
            isAdmin={isAdmin}
            context={diagnosticContext}
          />
        ),
      ),
      className: "p-0",
    });
  }

  // ── Buttons ───────────────────────────────────────────────────────────────
  const additionalButtons = (
    <>
      {isAdmin && (
        <AdminTabOpener
          activeTabIds={activeTabIds}
          onOpenTab={handleForceOpenTab}
          compact={isMobile}
        />
      )}
      {showCopyButton && (
        <MarkdownCopyButton
          markdownContent={editedContent}
          className="bg-inherit text-inherit"
          iconOnly={isMobile}
        />
      )}
    </>
  );

  return (
    <FullScreenOverlay
      isOpen={isOpen}
      onClose={() => onCancel?.()}
      title={title}
      description={description}
      tabs={tabDefinitions}
      initialTab={activeTab}
      onTabChange={handleTabChange}
      showSaveButton={showSaveButton}
      onSave={handleSave}
      showCancelButton={showCancelButton}
      onCancel={onCancel}
      additionalButtons={additionalButtons}
    />
  );
};

export default FullScreenMarkdownEditor;

// ─── Unavailable Data Notice ──────────────────────────────────────────────────

interface UnavailableDataNoticeProps {
  tabId: TabId;
  tabLabel: string;
  reason: string;
  isAdmin: boolean;
  context: DiagnosticContext;
}

function UnavailableDataNotice({
  tabId,
  tabLabel,
  reason,
  isAdmin,
  context,
}: UnavailableDataNoticeProps) {
  const [showDetails, setShowDetails] = useState(false);

  const reportBase = buildCrashReport({
    type: "no-data",
    tabId,
    tabLabel,
    reason,
    context,
    includeMarkdown: false,
  });
  const reportFull = buildCrashReport({
    type: "no-data",
    tabId,
    tabLabel,
    reason,
    context,
    includeMarkdown: true,
  });

  return (
    <div className="w-full h-full flex flex-col overflow-auto bg-textured">
      {/* ── User-facing section ── */}
      <div className="flex flex-col items-center justify-center px-4 py-10 gap-4 flex-shrink-0">
        <div className="rounded-full bg-muted p-4 shadow-sm">
          <AlertTriangle
            className="h-8 w-8 text-muted-foreground"
            strokeWidth={1.5}
          />
        </div>
        <div className="text-center space-y-1.5 max-w-sm">
          <h3 className="text-base font-semibold text-foreground">
            This view has no content to display
          </h3>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{tabLabel}</span>{" "}
            requires pre-processed data that is not available for this message.
            This is normal for messages that haven&apos;t been through the
            analysis pipeline.
          </p>
        </div>
      </div>

      {/* ── Admin-only debug panel ── */}
      {isAdmin && (
        <div className="mx-4 mb-6 rounded-2xl border-2 border-primary/30 overflow-hidden shadow-md flex-shrink-0">
          <div className="bg-primary/10 border-b border-primary/20 px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldAlert className="h-5 w-5 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-primary leading-tight">
                  Admin Debug Panel —{" "}
                  <span className="font-normal">Only you can see this</span>
                </p>
                <p className="text-xs text-primary/70 leading-tight">
                  {context.analysisData
                    ? "analysisData provided but required field missing or wrong type"
                    : "ℹ Expected — no analysisData prop passed at this call site"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <CopyIconButton text={reportBase} label="Copy report" />
              <CopyIconButton
                text={reportFull}
                label="Copy with content"
                icon={FileCode}
              />
              <button
                onClick={() => setShowDetails((v) => !v)}
                className="ml-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary/80 hover:bg-primary/10 transition-colors"
              >
                {showDetails ? "Collapse" : "Expand"}
                {showDetails ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {showDetails && (
            <div className="bg-card px-4 py-4 space-y-5 text-sm">
              <AdminSection label="Context">
                <AdminKV label="Tab" value={`${tabLabel} (${tabId})`} />
                <AdminKV label="Route" value={context.route} mono />
                <AdminKV
                  label="Message ID"
                  value={context.messageId ?? "not provided"}
                  mono
                />
                <AdminKV label="Captured at" value={context.capturedAt} mono />
              </AdminSection>

              <AdminSection label="Root Cause">
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 px-3 py-2">
                  <p className="font-mono text-xs text-amber-800 dark:text-amber-300">
                    {reason}
                  </p>
                </div>
              </AdminSection>

              {context.analysisData && (
                <AdminSection label="analysisData — Top-level Keys">
                  <div className="flex flex-wrap gap-1.5">
                    {Object.keys(context.analysisData).map((k) => {
                      const relevant = getRelevantAnalysisKey(tabId) === k;
                      return (
                        <span
                          key={k}
                          className={cn(
                            "inline-block rounded-full px-2.5 py-0.5 text-xs font-mono border",
                            relevant
                              ? "bg-primary/15 border-primary/40 text-primary font-semibold"
                              : "bg-muted border-border text-muted-foreground",
                          )}
                        >
                          {k}
                          {relevant && " ← this tab reads this"}
                        </span>
                      );
                    })}
                  </div>
                </AdminSection>
              )}

              {(() => {
                const key = getRelevantAnalysisKey(tabId);
                if (!key) return null;
                const value = context.analysisData?.[key];
                return (
                  <AdminSection
                    label={`analysisData.${key} (what this tab reads)`}
                    hint={value === undefined ? "⚠ Key is missing" : undefined}
                  >
                    {value === undefined ? (
                      <p className="text-xs text-destructive font-mono">
                        undefined — key not present on analysisData
                      </p>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground mb-1.5">
                          Type:{" "}
                          <span className="font-mono text-foreground">
                            {Array.isArray(value)
                              ? `array[${(value as unknown[]).length}]`
                              : typeof value}
                          </span>
                        </p>
                        <AdminCodeBlock
                          content={safeSerialise(value, 2000)}
                          maxH="max-h-48"
                        />
                      </>
                    )}
                  </AdminSection>
                );
              })()}

              {!context.analysisData && (
                <AdminSection label="analysisData">
                  <p className="text-xs text-destructive font-mono">
                    Not provided — component received no analysisData prop
                  </p>
                </AdminSection>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
