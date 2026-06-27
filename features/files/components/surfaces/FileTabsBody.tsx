/**
 * features/files/components/surfaces/FileTabsBody.tsx
 *
 * Shared tab strip + body region for any file viewer surface. Used by:
 *   - `PreviewPane` (the side-panel viewer mounted inside PageShell)
 *   - `SingleFileShell` (the dedicated full-page viewer at `/files/f/<id>`)
 *
 * What lives here:
 *   - The 7 tab buttons (Preview / Edit / Knowledge / Analysis / Share / Info / Versions)
 *   - The always-mounted tab bodies (each previewer keeps its fetched bytes
 *     and Monaco model alive even when its tab is hidden — switching to
 *     Versions and back to Preview doesn't re-download the PDF).
 *   - `?tab=…` deep-link parsing + `cloud-files:open-preview-tab` event
 *     wiring so the URL and external triggers can drive tab selection.
 *
 * What does NOT live here:
 *   - The header bar (filename, action buttons, breadcrumb) — each shell
 *     owns its own chrome. Compact side panel vs full-page page chrome
 *     are different surfaces with different ergonomics.
 *   - The per-tab control rail — that's a SingleFileShell concept; the
 *     side panel doesn't have the room.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Atom,
  Edit3,
  FileSearch,
  Gem,
  History,
  Info,
  Share2,
} from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { selectFileById } from "@/features/files/redux/selectors";
import { FilePreview } from "@/features/files/components/core/FilePreview/FilePreview";
import { FileVersionsList } from "@/features/files/components/core/FileVersions/FileVersionsList";
import { CloudFileInlineEditor } from "@/features/files/components/core/FileEditor/CloudFileInlineEditor";
import { getPreviewCapability } from "@/features/files/utils/preview-capabilities";
import { PreviewErrorBoundary } from "./PreviewErrorBoundary";
import { FileInfoTab } from "./FileInfoTab";
import { DocumentTab } from "./DocumentTab";
import { FileShareTab } from "./FileShareTab";
import { AnalysisTab } from "@/features/file-analysis/tab/AnalysisTab";
import { ImageEditTab } from "./single-file/ImageEditTab";
import { PdfEditTab } from "./single-file/PdfEditTab";

export type FileTab =
  | "preview"
  | "edit"
  | "document"
  | "analysis"
  | "share"
  | "versions"
  | "info";

const ALL_TABS: readonly FileTab[] = [
  "preview",
  "edit",
  "document",
  "analysis",
  "share",
  "info",
  "versions",
];

function isFileTab(value: string | null): value is FileTab {
  if (!value) return false;
  return (ALL_TABS as readonly string[]).includes(value);
}

export interface FileTabsBodyProps {
  fileId: string;
  /**
   * Controlled active tab. When provided, the parent owns the selection
   * (used by SingleFileShell so the URL `?tab=` can be authoritative).
   * When omitted, this component keeps internal state and reads the
   * initial value from `?tab=`.
   */
  activeTab?: FileTab;
  onTabChange?: (tab: FileTab) => void;
  /**
   * Initial tab when the component owns its own state. Falls through to
   * `?tab=` and finally to `"preview"`. Ignored in controlled mode.
   */
  initialTab?: FileTab;
  /** Visual size of the tab strip. */
  density?: "compact" | "comfortable";
  className?: string;
}

export function FileTabsBody({
  fileId,
  activeTab: controlledTab,
  onTabChange,
  initialTab,
  density = "compact",
  className,
}: FileTabsBodyProps) {
  const searchParams = useSearchParams();

  // Citation deep-links: a search hit or chat reference can route to
  // `/files/f/<id>?tab=document&page=12&chunk=<chunk_id>`. We read the
  // params on mount and forward them into <DocumentTab/>.
  const deepLink = useMemo(() => {
    if (!searchParams) return { tab: null, page: undefined, chunk: undefined };
    const tabRaw = searchParams.get("tab");
    const tab: FileTab | null = isFileTab(tabRaw) ? tabRaw : null;
    const pageRaw = searchParams.get("page");
    const page =
      pageRaw && Number.isFinite(Number.parseInt(pageRaw, 10))
        ? Math.max(1, Number.parseInt(pageRaw, 10))
        : undefined;
    const chunk = searchParams.get("chunk") ?? undefined;
    return { tab, page, chunk };
  }, [searchParams]);

  const isControlled = controlledTab !== undefined;
  const [internalTab, setInternalTab] = useState<FileTab>(
    initialTab ?? deepLink.tab ?? "preview",
  );
  const activeTab = isControlled ? controlledTab : internalTab;

  const setActiveTab = (next: FileTab) => {
    if (!isControlled) setInternalTab(next);
    onTabChange?.(next);
  };

  // ── Lazy-mount-then-keep-alive ─────────────────────────────────────────────
  //
  // Tab bodies stay mounted once visited (so switching Versions → Preview
  // doesn't re-download a 10 MB PDF), but a tab the user has NEVER opened is
  // not mounted at all. This is the difference between "keep the blob alive"
  // (correct, post-visit) and "fetch every tab's data on first click"
  // (the bug): mounting Analysis + Knowledge + Info eagerly fired
  // `/files/{id}/analysis`, `/annotations`, and `/rag-status` on a plain
  // preview click — three server round-trips for tabs the user never saw.
  //
  // `mountedTabs` grows monotonically: it starts with whatever tab is active
  // on first paint (honours `?tab=` deep links + the active-tab change effect
  // below) and never shrinks, so the keep-alive guarantee holds.
  const [mountedTabs, setMountedTabs] = useState<ReadonlySet<FileTab>>(
    () => new Set<FileTab>([activeTab]),
  );
  useEffect(() => {
    setMountedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);
  const isMounted = (tab: FileTab) => mountedTabs.has(tab);

  // Honour `?tab=` on remount (file id change or first paint with deep link).
  // Controlled mode skips this — the parent owns the URL contract.
  useEffect(() => {
    if (isControlled) return;
    setInternalTab(initialTab ?? deepLink.tab ?? "preview");
  }, [fileId, deepLink.tab, initialTab, isControlled]);

  // Listen for "open preview tab" hints from context menus, the lineage chip,
  // and citation links elsewhere in the app. CustomEvent over Redux because
  // the hint is transient — once handled it's gone; no flag to clear.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ fileId?: string; tab?: FileTab }>)
        .detail;
      if (!detail || detail.fileId !== fileId) return;
      if (isFileTab(detail.tab ?? null)) {
        setActiveTab(detail.tab as FileTab);
      }
    };
    window.addEventListener("cloud-files:open-preview-tab", handler);
    return () =>
      window.removeEventListener("cloud-files:open-preview-tab", handler);
    // setActiveTab closes over `isControlled` + `onTabChange` but those are
    // stable for the lifetime of a render pass, and we re-bind on fileId
    // change which is what matters semantically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {/* Tabs strip — `compact` is the default (PreviewPane sizing);
       * `comfortable` adds a hair more padding for the dedicated shell. */}
      <div
        className="flex items-center gap-0 border-b border-border bg-card shrink-0"
        role="tablist"
        aria-label="File tabs"
      >
        <TabButton
          icon={<Gem className="h-3.5 w-3.5" />}
          label="Preview"
          active={activeTab === "preview"}
          onClick={() => setActiveTab("preview")}
          density={density}
        />
        <TabButton
          icon={<Edit3 className="h-3.5 w-3.5" />}
          label="Edit"
          active={activeTab === "edit"}
          onClick={() => setActiveTab("edit")}
          density={density}
        />
        <TabButton
          icon={<FileSearch className="h-3.5 w-3.5" />}
          label="Knowledge"
          active={activeTab === "document"}
          onClick={() => setActiveTab("document")}
          density={density}
          title={`Knowledge index view (RAG: pages, cleaned text, ${RAG_VOCAB.segmentsShort.toLowerCase()}, lineage)`}
        />
        <TabButton
          icon={<Atom className="h-3.5 w-3.5" />}
          label="Analysis"
          active={activeTab === "analysis"}
          onClick={() => setActiveTab("analysis")}
          density={density}
          title="AI-powered analysis of this file"
        />
        <TabButton
          icon={<Share2 className="h-3.5 w-3.5" />}
          label="Share"
          active={activeTab === "share"}
          onClick={() => setActiveTab("share")}
          density={density}
          title="Visibility, share links, people & groups"
        />
        <TabButton
          icon={<Info className="h-3.5 w-3.5" />}
          label="Info"
          active={activeTab === "info"}
          onClick={() => setActiveTab("info")}
          density={density}
        />
        <TabButton
          icon={<History className="h-3.5 w-3.5" />}
          label="Versions"
          active={activeTab === "versions"}
          onClick={() => setActiveTab("versions")}
          density={density}
        />
      </div>

      {/* Body — a tab mounts on FIRST activation and then stays mounted
       * (only its visibility toggles thereafter). See the
       * lazy-mount-then-keep-alive note above.
       *
       * Keep-alive (post-visit): every fetch-based previewer (PDF, Markdown,
       * Code, Text, Data) goes through `useFileBlob`, which fetches the bytes
       * and revokes the blob URL on unmount. Once a tab has been opened we
       * keep it mounted with `hidden` so switching Versions → Preview doesn't
       * lose a 10 MB PDF download and re-fetch on return.
       *
       * Lazy (pre-visit): a tab the user has never opened is not rendered, so
       * its data fetch never fires. This is what stops a plain preview click
       * from hitting `/analysis`, `/annotations`, and `/rag-status`.
       *
       * Each tab has its own error boundary so a crash in one doesn't
       * blank the other.
       */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div
          className="absolute inset-0 overflow-hidden"
          hidden={activeTab !== "preview"}
          aria-hidden={activeTab !== "preview"}
        >
          {isMounted("preview") ? (
            <PreviewErrorBoundary fileId={fileId}>
              <FilePreview fileId={fileId} className="h-full w-full" />
            </PreviewErrorBoundary>
          ) : null}
        </div>
        <div
          className="absolute inset-0 overflow-hidden"
          hidden={activeTab !== "edit"}
          aria-hidden={activeTab !== "edit"}
        >
          {isMounted("edit") ? (
            <PreviewErrorBoundary fileId={fileId}>
              <EditTabContent fileId={fileId} />
            </PreviewErrorBoundary>
          ) : null}
        </div>
        <div
          className="absolute inset-0 overflow-hidden"
          hidden={activeTab !== "document"}
          aria-hidden={activeTab !== "document"}
        >
          {isMounted("document") ? (
            <PreviewErrorBoundary fileId={fileId}>
              <DocumentTab
                fileId={fileId}
                active={activeTab === "document"}
                initialPage={deepLink.page}
                initialChunkId={deepLink.chunk}
                className="h-full w-full"
              />
            </PreviewErrorBoundary>
          ) : null}
        </div>
        <div
          className="absolute inset-0 overflow-hidden"
          hidden={activeTab !== "analysis"}
          aria-hidden={activeTab !== "analysis"}
        >
          {isMounted("analysis") ? (
            <PreviewErrorBoundary fileId={fileId}>
              <AnalysisTab fileId={fileId} className="h-full w-full" />
            </PreviewErrorBoundary>
          ) : null}
        </div>
        <div
          className="absolute inset-0 overflow-hidden"
          hidden={activeTab !== "share"}
          aria-hidden={activeTab !== "share"}
        >
          {isMounted("share") ? (
            <PreviewErrorBoundary fileId={fileId}>
              <FileShareTab fileId={fileId} className="h-full w-full" />
            </PreviewErrorBoundary>
          ) : null}
        </div>
        <div
          className="absolute inset-0 overflow-hidden"
          hidden={activeTab !== "info"}
          aria-hidden={activeTab !== "info"}
        >
          {isMounted("info") ? (
            <FileInfoTab fileId={fileId} className="h-full w-full" />
          ) : null}
        </div>
        <div
          className="absolute inset-0 overflow-hidden"
          hidden={activeTab !== "versions"}
          aria-hidden={activeTab !== "versions"}
        >
          {isMounted("versions") ? (
            <FileVersionsList fileId={fileId} className="h-full w-full" />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit tab — dispatches on the file's `previewKind`. Text-shaped kinds
// (text / code / markdown / data) mount the inline Monaco editor; non-text
// kinds (image / video / audio / pdf / generic) show a "Coming soon" hint
// so the affordance is always visible but doesn't lie about capability.
// ---------------------------------------------------------------------------

interface EditTabContentProps {
  fileId: string;
}

function EditTabContent({ fileId }: EditTabContentProps) {
  const file = useAppSelector((s) => selectFileById(s, fileId));
  if (!file) return null;

  // Virtual sources (Notes, Code Snippets, Agent Apps, …) own their own
  // edit experience inside the Preview tab via `inlinePreview` — the Edit
  // tab here is for real cloud-files only. Surface a friendly hint.
  if (file.source.kind === "virtual") {
    return (
      <ComingSoon
        title="Editing handled in Preview"
        description="This source provides its own inline editor in the Preview tab. Switch back there to edit."
      />
    );
  }

  const capability = getPreviewCapability(
    file.fileName,
    file.mimeType,
    file.fileSize,
  );

  switch (capability.previewKind) {
    case "text":
    case "code":
    case "markdown":
    case "data":
    // SVG and HTML are markup — Monaco edits them directly via xml/html in
    // CloudFileInlineEditor's LANGUAGE_BY_EXT. The Preview tab's SvgPreview /
    // HtmlPreview offer rendered (and source) views; this Edit tab is where
    // the user actually mutates the markup and re-uploads.
    case "svg":
    case "html":
      // `data` covers JSON / CSV / XLSX. JSON is editable as text; CSV/XLSX
      // would benefit from a dedicated grid editor — Monaco still works as
      // a fallback for now (raw CSV editing is fine).
      return (
        <CloudFileInlineEditor fileId={fileId} className="h-full w-full" />
      );

    case "pdf":
      // Annotation-first PDF editing — draw rectangles to label / extract /
      // promote-to-entity, plus the action panels from the Analysis Studio
      // (Pages / Doc Ops / Notes / Findings / Redact / Search). Content
      // tabs (Outline / Text / PII / Tables / Images / Regions / Dupes /
      // Classify / Info) live in the Analysis tab next door — Edit is for
      // mutating, Analysis is for reading.
      return <PdfEditTab fileId={fileId} className="h-full w-full" />;

    case "image":
      // Image Studio's Edit mode (Filerobot 5.0.1 — crop / rotate / flip /
      // resize / fine-tune / filters / annotate / watermark) plus the AI
      // toolbar (Remove BG / Upscale / AI edit). Saves land in the source
      // file's parent folder.
      return <ImageEditTab fileId={fileId} className="h-full w-full" />;

    case "audio":
    case "video":
      return (
        <ComingSoon
          title={`${capability.previewKind === "audio" ? "Audio" : "Video"} editing — coming soon`}
          description="Trim and clip tools will live here. For now, download to edit externally."
        />
      );

    case "spreadsheet":
      return (
        <ComingSoon
          title="Spreadsheet editing — coming soon"
          description="A grid-based editor will land here. The Preview tab already supports sort + filter for read-only browsing."
        />
      );

    case "generic":
    default:
      return (
        <ComingSoon
          title="Editing not available"
          description="This file type doesn't have an editor yet. You can still rename, move, share, or download it from the action bar."
        />
      );
  }
}

function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted/10 p-6">
      <div className="max-w-sm space-y-2 text-center">
        <Edit3
          className="mx-auto h-8 w-8 text-muted-foreground"
          aria-hidden="true"
        />
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function TabButton({
  icon,
  label,
  active,
  onClick,
  title,
  density,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  title?: string;
  density: "compact" | "comfortable";
}) {
  const button = (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 border-b-2 text-xs font-medium transition-colors",
        density === "compact" ? "px-3 py-1.5" : "px-4 py-2",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
  if (!title) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {title}
      </TooltipContent>
    </Tooltip>
  );
}
