"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  AlignLeft,
  BookOpenText,
  CheckCircle2,
  FileScan,
  FileText,
  ImageIcon,
  Layers3,
  Loader2,
  MessagesSquare,
  ScanText,
  Table2,
} from "lucide-react";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import {
  RagAiCopyButton,
  RagContentActions,
} from "@/features/rag/components/search/RagContentActions";
import {
  withRagAiSections,
  type RagAiCopyBundle,
  type RagAiCopySection,
  type RagAiSectionKey,
} from "@/features/rag/components/search/ragAiCopy";
import { InlineMediaRef } from "@/features/files";
import { SelectedPdfPages } from "@/features/rag/components/search/SelectedPdfPages";
import {
  fetchDerivativeChunks,
  fetchDerivations,
  type DerivativeChunkRow,
} from "@/features/rag/api/derivations";
import {
  usePageBundle,
  type PageBundle,
} from "@/features/rag/components/source-inspector/usePageBundle";
import { usePdfSurfaceLinks } from "@/features/pdf/hooks/usePdfSurfaceLinks";
import { useOpenFilePreviewWindow } from "@/features/overlays/openers/filePreviewWindow";
import { listResultsForFilePage } from "@/features/page-extraction/api/runs";
import type { PageExtractionResult } from "@/features/page-extraction/types";
import { cn } from "@/lib/utils";
import type {
  RagReferenceAvailability,
  RagReferenceKind,
  RagReferenceRequest,
} from "@/features/rag/components/hit-card/referenceTypes";

interface DerivativePageGroup {
  key: string;
  label: string;
  description: string;
  chunks: DerivativeChunkRow[];
  total: number;
}

interface LoadedReferences {
  groups: DerivativePageGroup[];
  extractionRows: PageExtractionResult[];
  extractionTotal: number;
  partialFailures: number;
}

const CUSTOM_DERIVATION_KEYS = new Set([
  "synthetic_qa",
  "section_summary",
  "agent_extract",
  "agent_summary",
  "agent_structured_json",
]);

function visibleDerivativeChunks(group: DerivativePageGroup) {
  return group.chunks.slice(0, group.key === "table_row" ? 25 : 12);
}

function derivativeGroupData(group: DerivativePageGroup) {
  return {
    kind: group.key,
    label: group.label,
    description: group.description,
    shown: visibleDerivativeChunks(group).length,
    total: group.total,
    chunks: visibleDerivativeChunks(group).map((chunk) => ({
      id: chunk.id,
      chunk_index: chunk.chunk_index,
      chunk_kind: chunk.chunk_kind,
      parent_chunk_id: chunk.parent_chunk_id,
      page_numbers: chunk.page_numbers,
      token_count: chunk.token_count,
      content_text: chunk.content_text,
      metadata: chunk.metadata,
    })),
  };
}

function derivativeGroupText(group: DerivativePageGroup): string {
  if (group.key === "table_row") return tableGroupToTsv(group);
  return visibleDerivativeChunks(group)
    .map((chunk) => chunk.content_text)
    .join("\n\n");
}

function tableGroupToTsv(group: DerivativePageGroup): string {
  const rows = visibleDerivativeChunks(group).map((chunk) => {
    const metadata = chunk.metadata ?? {};
    const header = Array.isArray(metadata.header)
      ? metadata.header.map((value) => String(value ?? ""))
      : [];
    const cells = Array.isArray(metadata.cells)
      ? metadata.cells.map((value) => String(value ?? ""))
      : [];
    return { header, cells, fallback: chunk.content_text };
  });
  const header = rows.find((row) => row.header.length)?.header ?? [];
  const lines = header.length ? [header.join("\t")] : [];
  for (const row of rows) {
    lines.push((row.cells.length ? row.cells : [row.fallback]).join("\t"));
  }
  return lines.join("\n");
}

function extractionRowsData(rows: PageExtractionResult[], total: number) {
  const visible = rows.slice(0, 12);
  return {
    shown: visible.length,
    total,
    rows: visible.map((row) => ({
      id: row.id,
      run_id: row.run_id,
      page_run_id: row.page_run_id,
      job_id: row.job_id,
      file_id: row.file_id,
      source_pages: row.source_pages,
      canonical_page: row.canonical_page,
      payload: row.payload,
    })),
  };
}

function extractionRowsText(rows: PageExtractionResult[]): string {
  return JSON.stringify(
    rows.slice(0, 12).map((row) => row.payload),
    null,
    2,
  );
}

function verificationData(page: PageBundle) {
  return {
    verified_at: page.verifiedAt,
    flags: page.verificationFlags,
    extraction_method: page.extractionMethod,
    extraction_confidence: page.extractionConfidence,
    used_ocr: page.usedOcr,
  };
}

function verificationText(page: PageBundle): string {
  return [
    `Verified: ${page.verifiedAt ?? "not verified"}`,
    `Method: ${page.extractionMethod ?? (page.usedOcr ? "OCR" : "Text extraction")}`,
    `Used OCR: ${page.usedOcr ? "yes" : "no"}`,
    page.extractionConfidence != null
      ? `Confidence: ${page.extractionConfidence.toFixed(2)}`
      : null,
    `Flags: ${page.verificationFlags.length ? page.verificationFlags.join(", ") : "none"}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

const referenceCache = new Map<string, Promise<LoadedReferences>>();

const DERIVATION_META: Record<string, { label: string; description: string }> =
  {
    table_row: {
      label: "Tables",
      description: "Rows reconstructed from tables on this page",
    },
    synthetic_qa: {
      label: "Q&A",
      description: "Synthetic questions and answers anchored here",
    },
    page_image_caption: {
      label: "Image analysis",
      description: "Vision descriptions of figures on this page",
    },
    section_summary: {
      label: "Section summary",
      description: "Higher-level summary linked to this page",
    },
    chunked_coarse: {
      label: "Coarse context",
      description: "Broader context window containing this page",
    },
    chunked_fine: {
      label: "Fine passages",
      description: "Smaller passages derived from this page",
    },
    chunked_normal: {
      label: "Related passages",
      description: "Alternate passages derived from this page",
    },
    agent_extract: {
      label: "Agent analysis",
      description: "Agent-produced content anchored to this page",
    },
    agent_summary: {
      label: "Agent summary",
      description: "Agent-produced summary anchored to this page",
    },
    agent_structured_json: {
      label: "Structured analysis",
      description: "Structured agent output anchored to this page",
    },
  };

/**
 * The first available entry becomes the right-hand preview automatically.
 * Reorder this one list to change both the toolbar order and default preview.
 * Clean text intentionally precedes generic enrichments as the final fallback.
 */
export const REFERENCE_PREVIEW_PRIORITY = [
  "physical_pdf",
  "table_row",
  "page_image",
  "page_image_caption",
  "chunked_fine",
  "clean",
  "synthetic_qa",
  "custom-extractions",
  "section_summary",
  "agent_extract",
  "agent_structured_json",
  "agent_summary",
  "chunked_coarse",
  "chunked_normal",
  "raw",
  "verification",
] as const;

const HEADER_REFERENCE_PREVIEW_KEYS: Record<
  RagReferenceKind,
  readonly string[]
> = {
  document: ["physical_pdf"],
  clean: ["clean"],
  image: ["page_image", "page_image_caption"],
  table: ["table_row"],
  custom: [
    "custom-extractions",
    "agent_extract",
    "agent_structured_json",
    "agent_summary",
    "synthetic_qa",
    "section_summary",
  ],
};

function previewKeyForHeaderRequest(
  kind: RagReferenceKind,
  options: readonly PreviewOption[],
): string | null {
  const available = new Set(options.map((option) => option.key));
  return (
    HEADER_REFERENCE_PREVIEW_KEYS[kind].find((key) => available.has(key)) ??
    null
  );
}

interface PreviewOption {
  key: string;
  label: string;
  detail: string;
  icon: typeof FileText;
}

function previewPriority(key: string) {
  const position = REFERENCE_PREVIEW_PRIORITY.indexOf(
    key as (typeof REFERENCE_PREVIEW_PRIORITY)[number],
  );
  return position === -1 ? REFERENCE_PREVIEW_PRIORITY.length : position;
}

function iconForDerivation(kind: string) {
  switch (kind) {
    case "table_row":
      return Table2;
    case "synthetic_qa":
      return MessagesSquare;
    case "page_image_caption":
      return ImageIcon;
    case "section_summary":
    case "agent_summary":
      return FileText;
    case "chunked_coarse":
    case "chunked_fine":
    case "chunked_normal":
      return Layers3;
    default:
      return ScanText;
  }
}

async function loadReferences(
  processedDocumentId: string,
  fileId: string | null,
  pageNumber: number,
): Promise<LoadedReferences> {
  const rollup = await fetchDerivations(processedDocumentId);
  const relevant = rollup.derivations.filter(
    (entry) => entry.chunk_count > 0 && DERIVATION_META[entry.derivation_kind],
  );

  const [derivativeSettled, extractionSettled] = await Promise.all([
    Promise.allSettled(
      relevant.map(async (entry) => ({
        entry,
        response: await fetchDerivativeChunks(entry.derivative_id, {
          limit: 100,
          pageNumber,
        }),
      })),
    ),
    fileId
      ? listResultsForFilePage(fileId, pageNumber, 50).then(
          (value) => ({ status: "fulfilled" as const, value }),
          (reason: unknown) => ({ status: "rejected" as const, reason }),
        )
      : Promise.resolve({
          status: "fulfilled" as const,
          value: { results: [], total: 0 },
        }),
  ]);

  const groups: DerivativePageGroup[] = [];
  let partialFailures = 0;
  for (const result of derivativeSettled) {
    if (result.status === "rejected") {
      partialFailures += 1;
      continue;
    }
    const { entry, response } = result.value;
    if (response.total === 0) continue;
    const meta = DERIVATION_META[entry.derivation_kind];
    groups.push({
      key: entry.derivation_kind,
      label: meta.label,
      description: meta.description,
      chunks: response.chunks,
      total: response.total,
    });
  }

  if (extractionSettled.status === "rejected") partialFailures += 1;
  return {
    groups,
    extractionRows:
      extractionSettled.status === "fulfilled"
        ? extractionSettled.value.results
        : [],
    extractionTotal:
      extractionSettled.status === "fulfilled"
        ? extractionSettled.value.total
        : 0,
    partialFailures,
  };
}

function getCachedReferences(
  processedDocumentId: string,
  fileId: string | null,
  pageNumber: number,
) {
  const key = `${processedDocumentId}|${fileId ?? ""}|${pageNumber}`;
  let pending = referenceCache.get(key);
  if (!pending) {
    pending = loadReferences(processedDocumentId, fileId, pageNumber).catch(
      (error) => {
        referenceCache.delete(key);
        throw error;
      },
    );
    referenceCache.set(key, pending);
  }
  return pending;
}

export function RagPageReferences({
  sourceKind,
  sourceId,
  pageNumber,
  pageNumbers,
  onOpenPdf,
  resourceRequest,
  onAvailabilityChange,
  aiBundle,
  children,
}: {
  sourceKind: string;
  sourceId: string;
  pageNumber: number | null;
  pageNumbers: number[] | null;
  onOpenPdf: () => void;
  resourceRequest?: RagReferenceRequest | null;
  onAvailabilityChange?: (availability: RagReferenceAvailability) => void;
  aiBundle: RagAiCopyBundle;
  children: ReactNode;
}) {
  const isCldFile = sourceKind === "cld_file";
  const isLibrary = sourceKind === "library_doc";
  const { ids, loading: identityLoading } = usePdfSurfaceLinks(
    isCldFile
      ? { fileId: sourceId }
      : isLibrary
        ? { processedDocumentId: sourceId }
        : {},
  );
  const openFilePreview = useOpenFilePreviewWindow();
  const handleOpenPdf = () => {
    if (!ids.fileId) {
      onOpenPdf();
      return;
    }
    openFilePreview({ fileId: ids.fileId, pageNumber });
  };
  const {
    page,
    loading: pageLoading,
    error: pageError,
  } = usePageBundle({
    processedDocumentId: ids.processedDocumentId,
    pageNumber,
    enabled: Boolean(ids.processedDocumentId && pageNumber != null),
  });
  const [loaded, setLoaded] = useState<LoadedReferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestedPreview, setRequestedPreview] = useState<string | null>(null);
  const [observedRequestNonce, setObservedRequestNonce] = useState(0);
  const selectedSourcePages = Array.from(
    new Set(
      (pageNumbers?.length
        ? pageNumbers
        : pageNumber != null
          ? [pageNumber]
          : []
      )
        .filter((value) => Number.isInteger(value) && value > 0)
        .slice(0, 10),
    ),
  );

  useEffect(() => {
    const processedDocumentId = ids.processedDocumentId;
    if (!processedDocumentId || pageNumber == null) return undefined;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      void getCachedReferences(processedDocumentId, ids.fileId, pageNumber)
        .then((value) => {
          if (!cancelled) setLoaded(value);
        })
        .catch((reason: unknown) => {
          if (!cancelled) {
            setError(
              reason instanceof Error
                ? reason.message
                : "Could not load page references",
            );
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [ids.processedDocumentId, ids.fileId, pageNumber]);

  const busy = identityLoading || pageLoading || loading;
  const groups = loaded?.groups ?? [];
  const hasAnyEnrichment =
    Boolean(page?.rawText || page?.cleanedText || page?.imageCldFileId) ||
    Boolean(page?.verifiedAt) ||
    groups.length > 0 ||
    Boolean(loaded?.extractionTotal);
  const previewOptions: PreviewOption[] = [
    ...(ids.fileId && selectedSourcePages.length
      ? [
          {
            key: "physical_pdf",
            label:
              selectedSourcePages.length === 1
                ? "Physical PDF page"
                : "Physical PDF pages",
            detail: selectedSourcePages.join(", "),
            icon: FileScan,
          },
        ]
      : []),
    ...(page?.imageCldFileId
      ? [
          {
            key: "page_image",
            label: "Page image",
            detail: "Rendered page",
            icon: ImageIcon,
          },
        ]
      : []),
    ...(page?.cleanedText
      ? [
          {
            key: "clean",
            label: "Clean text",
            detail: `${page.cleanedCharCount.toLocaleString()} chars`,
            icon: BookOpenText,
          },
        ]
      : []),
    ...(page?.rawText
      ? [
          {
            key: "raw",
            label: "Raw text",
            detail: `${page.rawCharCount.toLocaleString()} chars`,
            icon: AlignLeft,
          },
        ]
      : []),
    ...(page?.verifiedAt
      ? [
          {
            key: "verification",
            label: "Verified",
            detail: page.verificationFlags.length
              ? `${page.verificationFlags.length} flags`
              : "No flags",
            icon: CheckCircle2,
          },
        ]
      : []),
    ...groups.map((group) => ({
      key: group.key,
      label: group.label,
      detail: `${group.total.toLocaleString()} on page`,
      icon: iconForDerivation(group.key),
    })),
    ...(loaded?.extractionTotal
      ? [
          {
            key: "custom-extractions",
            label: "Custom extractions",
            detail: `${loaded.extractionTotal.toLocaleString()} rows`,
            icon: ScanText,
          },
        ]
      : []),
  ].sort(
    (left, right) => previewPriority(left.key) - previewPriority(right.key),
  );
  const pageImageId = page?.imageCldFileId ?? null;
  const groupKeys = new Set(groups.map((group) => group.key));
  const documentAvailable = Boolean(ids.fileId);
  const cleanAvailable = Boolean(page?.cleanedText);
  const imageAvailable =
    Boolean(pageImageId) || groupKeys.has("page_image_caption");
  const tableAvailable = groupKeys.has("table_row");
  const customAvailable =
    Boolean(loaded?.extractionTotal) ||
    HEADER_REFERENCE_PREVIEW_KEYS.custom.some((key) => groupKeys.has(key));

  useEffect(() => {
    onAvailabilityChange?.({
      document: documentAvailable,
      clean: cleanAvailable,
      image: imageAvailable,
      table: tableAvailable,
      custom: customAvailable,
    });
  }, [
    onAvailabilityChange,
    documentAvailable,
    cleanAvailable,
    imageAvailable,
    tableAvailable,
    customAvailable,
  ]);

  const headerRequestedPreview =
    resourceRequest && resourceRequest.nonce !== observedRequestNonce
      ? previewKeyForHeaderRequest(resourceRequest.kind, previewOptions)
      : null;
  const selectedPreview =
    previewOptions.find((option) => option.key === headerRequestedPreview) ??
    previewOptions.find((option) => option.key === requestedPreview) ??
    previewOptions[0] ??
    null;
  const selectedGroup = groups.find(
    (group) => group.key === selectedPreview?.key,
  );
  const SelectedPreviewIcon = selectedPreview?.icon ?? FileScan;

  const tableGroups = groups.filter((group) => group.key === "table_row");
  const imageGroups = groups.filter(
    (group) => group.key === "page_image_caption",
  );
  const customGroups = groups.filter((group) =>
    CUSTOM_DERIVATION_KEYS.has(group.key),
  );
  const derivedGroups = groups.filter(
    (group) =>
      group.key !== "table_row" &&
      group.key !== "page_image_caption" &&
      !CUSTOM_DERIVATION_KEYS.has(group.key),
  );
  const extraSections: RagAiCopySection[] = [];
  if (ids.fileId && selectedSourcePages.length) {
    extraSections.push({
      key: "document",
      label: "Physical document",
      description: "Source file reference and exact page selection.",
      humanText: `File ID: ${ids.fileId}\nSource pages: ${selectedSourcePages.join(", ")}`,
      data: {
        file_id: ids.fileId,
        source_pages: selectedSourcePages,
      },
      count: selectedSourcePages.length,
      total: selectedSourcePages.length,
    });
  }
  if (page?.cleanedText) {
    extraSections.push({
      key: "clean",
      label: "Clean text",
      description: "Cleaned page text shown in the page reference preview.",
      humanText: page.cleanedText,
      data: {
        text: page.cleanedText,
        char_count: page.cleanedCharCount,
        section_kind: page.sectionKind,
        section_title: page.sectionTitle,
      },
    });
  }
  if (page?.rawText) {
    extraSections.push({
      key: "raw",
      label: "Raw text",
      description: "Raw extracted or OCR page text before cleanup.",
      humanText: page.rawText,
      data: { text: page.rawText, char_count: page.rawCharCount },
    });
  }
  if (tableGroups.length) {
    extraSections.push({
      key: "tables",
      label: "Tables",
      description: "Structured table rows currently loaded for this page.",
      humanText: tableGroups.map(tableGroupToTsv).join("\n\n"),
      data: tableGroups.map(derivativeGroupData),
      count: tableGroups.reduce(
        (sum, group) => sum + visibleDerivativeChunks(group).length,
        0,
      ),
      total: tableGroups.reduce((sum, group) => sum + group.total, 0),
    });
  }
  if (pageImageId || imageGroups.length) {
    const imageReference = pageImageId
      ? `Image file ID: ${pageImageId}${pageNumber != null ? `\nPage: ${pageNumber}` : ""}`
      : "";
    extraSections.push({
      key: "images",
      label: "Images + image analysis",
      description:
        "Rendered-page image references and vision-derived descriptions.",
      humanText: [imageReference, ...imageGroups.map(derivativeGroupText)]
        .filter(Boolean)
        .join("\n\n"),
      data: {
        page_image: pageImageId
          ? { file_id: pageImageId, page_number: pageNumber }
          : null,
        analysis: imageGroups.map(derivativeGroupData),
      },
      count: imageGroups.reduce(
        (sum, group) => sum + visibleDerivativeChunks(group).length,
        pageImageId ? 1 : 0,
      ),
      total: imageGroups.reduce(
        (sum, group) => sum + group.total,
        pageImageId ? 1 : 0,
      ),
    });
  }
  if (customGroups.length || loaded?.extractionRows.length) {
    const extractionText = loaded?.extractionRows.length
      ? extractionRowsText(loaded.extractionRows)
      : "";
    extraSections.push({
      key: "custom",
      label: "Custom content",
      description:
        "User/agent-generated extractions, Q&A, summaries, and structured output.",
      humanText: [extractionText, ...customGroups.map(derivativeGroupText)]
        .filter(Boolean)
        .join("\n\n"),
      data: {
        extractions: loaded
          ? extractionRowsData(loaded.extractionRows, loaded.extractionTotal)
          : null,
        derivations: customGroups.map(derivativeGroupData),
      },
      count:
        (loaded?.extractionRows.slice(0, 12).length ?? 0) +
        customGroups.reduce(
          (sum, group) => sum + visibleDerivativeChunks(group).length,
          0,
        ),
      total:
        (loaded?.extractionTotal ?? 0) +
        customGroups.reduce((sum, group) => sum + group.total, 0),
    });
  }
  if (derivedGroups.length) {
    extraSections.push({
      key: "derived",
      label: "Related derived content",
      description:
        "Fine, coarse, and alternate passages derived from this page.",
      humanText: derivedGroups.map(derivativeGroupText).join("\n\n"),
      data: derivedGroups.map(derivativeGroupData),
      count: derivedGroups.reduce(
        (sum, group) => sum + visibleDerivativeChunks(group).length,
        0,
      ),
      total: derivedGroups.reduce((sum, group) => sum + group.total, 0),
    });
  }
  if (page?.verifiedAt) {
    extraSections.push({
      key: "verification",
      label: "Verification",
      description:
        "Extraction method, confidence, OCR status, and verification flags.",
      humanText: verificationText(page),
      data: verificationData(page),
    });
  }
  const pageAiBundle = withRagAiSections(
    {
      ...aiBundle,
      source: {
        ...aiBundle.source,
        fileId: ids.fileId ?? aiBundle.source.fileId,
        processedDocumentId:
          ids.processedDocumentId ?? aiBundle.source.processedDocumentId,
      },
    },
    extraSections,
  );
  let selectedCopySection: RagAiSectionKey | null = null;
  if (selectedPreview?.key === "physical_pdf") selectedCopySection = "document";
  else if (
    selectedPreview?.key === "page_image" ||
    selectedPreview?.key === "page_image_caption"
  )
    selectedCopySection = "images";
  else if (selectedPreview?.key === "clean") selectedCopySection = "clean";
  else if (selectedPreview?.key === "raw") selectedCopySection = "raw";
  else if (selectedPreview?.key === "verification")
    selectedCopySection = "verification";
  else if (selectedPreview?.key === "table_row") selectedCopySection = "tables";
  else if (selectedPreview?.key === "custom-extractions")
    selectedCopySection = "custom";
  else if (selectedPreview && CUSTOM_DERIVATION_KEYS.has(selectedPreview.key))
    selectedCopySection = "custom";
  else if (selectedGroup) selectedCopySection = "derived";
  const selectedCopy = selectedCopySection
    ? pageAiBundle.sections[selectedCopySection]
    : null;

  if (!isCldFile && !isLibrary) return null;

  return (
    <div className="border-t border-border bg-muted/10">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/25 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <FileScan className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">
            {pageNumber != null
              ? `Page ${pageNumber} references`
              : "Document references"}
          </span>
          <RagAiCopyButton
            label={
              pageNumber != null
                ? `page ${pageNumber} references`
                : "document references"
            }
            bundle={pageAiBundle}
          />
        </div>
        {busy ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Resolving page assets…
          </span>
        ) : null}
        {page?.sectionTitle ? (
          <span className="truncate text-[10px] text-muted-foreground">
            {page.sectionTitle}
          </span>
        ) : null}
        {loaded?.partialFailures ? (
          <span className="text-[10px] text-amber-700 dark:text-amber-400">
            {loaded.partialFailures} reference source
            {loaded.partialFailures === 1 ? "" : "s"} unavailable
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap justify-end gap-1.5">
          <ResourceButton
            label="Full PDF"
            detail={
              pageNumber != null ? `Open at page ${pageNumber}` : "Open source"
            }
            icon={FileText}
            onClick={handleOpenPdf}
          />
          {previewOptions.map((option) => (
            <ResourceButton
              key={option.key}
              label={option.label}
              detail={option.detail}
              icon={option.icon}
              active={selectedPreview?.key === option.key}
              onClick={() => {
                setRequestedPreview(option.key);
                setObservedRequestNonce(resourceRequest?.nonce ?? 0);
              }}
            />
          ))}
        </div>
      </div>
      <div className="grid min-w-0 md:grid-cols-2 md:divide-x md:divide-border">
        <section className="min-w-0 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Retrieved chunk
            </span>
            <RagContentActions
              humanText={aiBundle.sections.retrieved?.humanText ?? ""}
              label="retrieved chunk"
              bundle={pageAiBundle}
              initialSections={["retrieved"]}
            />
          </div>
          {children}
        </section>
        <section className="min-w-0 border-t border-border bg-background md:border-t-0">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            {selectedPreview ? (
              <>
                <SelectedPreviewIcon className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">
                  {selectedPreview.label}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {selectedPreview.detail}
                </span>
                {selectedCopy ? (
                  <RagContentActions
                    humanText={selectedCopy.humanText}
                    label={selectedPreview.label.toLowerCase()}
                    bundle={pageAiBundle}
                    initialSections={[selectedCopy.key]}
                    className="ml-auto"
                  />
                ) : null}
              </>
            ) : (
              <span className="text-xs font-semibold text-foreground">
                Page reference preview
              </span>
            )}
          </div>
          <div className="max-h-[34rem] min-h-44 overflow-auto p-3">
            {busy && !selectedPreview ? (
              <div className="flex h-36 items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Choosing the best page reference…
              </div>
            ) : null}
            {selectedPreview?.key === "physical_pdf" && ids.fileId ? (
              <div className="h-[32rem] overflow-hidden rounded-lg border border-border bg-muted/20">
                <SelectedPdfPages
                  fileId={ids.fileId}
                  sourcePages={selectedSourcePages}
                />
              </div>
            ) : null}
            {selectedPreview?.key === "page_image" && pageImageId ? (
              <PageImagePreview fileId={pageImageId} pageNumber={pageNumber} />
            ) : null}
            {selectedPreview?.key === "clean" && page?.cleanedText ? (
              <BasicMarkdownContent content={page.cleanedText} />
            ) : null}
            {selectedPreview?.key === "raw" && page?.rawText ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
                {page.rawText}
              </pre>
            ) : null}
            {selectedPreview?.key === "verification" && page?.verifiedAt ? (
              <VerificationDetail
                verifiedAt={page.verifiedAt}
                flags={page.verificationFlags}
                method={page.extractionMethod}
                confidence={page.extractionConfidence}
                usedOcr={page.usedOcr}
              />
            ) : null}
            {selectedGroup ? <DerivativeDetail group={selectedGroup} /> : null}
            {selectedPreview?.key === "custom-extractions" && loaded ? (
              <ExtractionDetail
                rows={loaded.extractionRows}
                total={loaded.extractionTotal}
              />
            ) : null}
            {pageNumber == null ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                This result has no page provenance, so page-specific enriched
                assets cannot be resolved without guessing. The PDF source is
                still available on demand.
              </p>
            ) : null}
            {pageNumber != null &&
            !busy &&
            !error &&
            !pageError &&
            !hasAnyEnrichment ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                No enriched page assets have been produced yet. The PDF page
                remains available on demand.
              </p>
            ) : null}
            {error || pageError ? (
              <p className="text-xs text-destructive">{error ?? pageError}</p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function PageImagePreview({
  fileId,
  pageNumber,
}: {
  fileId: string;
  pageNumber: number | null;
}) {
  return (
    <div className="flex justify-center rounded-lg bg-muted/20 p-2">
      <InlineMediaRef
        ref={fileId}
        alt={
          pageNumber != null ? `Rendered page ${pageNumber}` : "Rendered page"
        }
        size={{ width: 700, height: 900 }}
        fit="contain"
        rounded="md"
        border="subtle"
      />
    </div>
  );
}

function ResourceButton({
  label,
  detail,
  icon: Icon,
  active = false,
  onClick,
}: {
  label: string;
  detail: string;
  icon: typeof FileText;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active || undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-left transition-colors",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-card text-foreground hover:bg-muted",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="text-[11px] font-medium">{label}</span>
      <span className="text-[10px] text-muted-foreground">{detail}</span>
    </button>
  );
}

function DerivativeDetail({ group }: { group: DerivativePageGroup }) {
  if (group.key === "table_row") {
    return <TableRowsPreview chunks={group.chunks} total={group.total} />;
  }
  return (
    <div className="space-y-2">
      <div>
        <div className="text-xs font-semibold text-foreground">
          {group.label}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {group.description} · showing {group.chunks.length} of {group.total}
        </div>
      </div>
      {group.chunks.slice(0, 12).map((chunk) => (
        <div
          key={chunk.id}
          className="rounded-md border border-border/70 bg-muted/10 px-2.5 py-2 text-xs leading-relaxed"
        >
          <BasicMarkdownContent content={chunk.content_text} />
        </div>
      ))}
      {group.total > 12 ? (
        <p className="text-[10px] text-muted-foreground">
          Showing the first 12 references for this page.
        </p>
      ) : null}
    </div>
  );
}

function TableRowsPreview({
  chunks,
  total,
}: {
  chunks: DerivativeChunkRow[];
  total: number;
}) {
  const rows = chunks.slice(0, 25).map((chunk) => {
    const metadata = chunk.metadata ?? {};
    const header = Array.isArray(metadata.header)
      ? metadata.header.map((value) => String(value ?? ""))
      : [];
    const cells = Array.isArray(metadata.cells)
      ? metadata.cells.map((value) => String(value ?? ""))
      : [];
    return { id: chunk.id, header, cells, fallback: chunk.content_text };
  });
  const header = rows.find((row) => row.header.length)?.header ?? [];

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-foreground">
        Table rows on this page
      </div>
      {header.length ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-muted/50">
              <tr>
                {header.map((cell, index) => (
                  <th
                    key={index}
                    className="border-b border-r border-border px-2 py-1.5 text-left font-semibold last:border-r-0"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="even:bg-muted/20">
                  {(row.cells.length ? row.cells : [row.fallback]).map(
                    (cell, index) => (
                      <td
                        key={index}
                        className="border-b border-r border-border/70 px-2 py-1 align-top last:border-r-0"
                      >
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row) => (
            <div key={row.id} className="rounded-md bg-muted/30 p-2 text-xs">
              {row.fallback}
            </div>
          ))}
        </div>
      )}
      {total > rows.length ? (
        <p className="text-[10px] text-muted-foreground">
          Showing {rows.length} of {total} rows on this page.
        </p>
      ) : null}
    </div>
  );
}

function ExtractionDetail({
  rows,
  total,
}: {
  rows: PageExtractionResult[];
  total: number;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-foreground">
        Custom extraction rows
      </div>
      {rows.slice(0, 12).map((row) => (
        <pre
          key={row.id}
          className="whitespace-pre-wrap break-words rounded-md border border-border/70 bg-muted/20 p-2 font-mono text-[11px] leading-relaxed"
        >
          {JSON.stringify(row.payload, null, 2)}
        </pre>
      ))}
      {total > 12 ? (
        <p className="text-[10px] text-muted-foreground">
          Showing the first 12 of {total} rows for this page.
        </p>
      ) : null}
    </div>
  );
}

function VerificationDetail({
  verifiedAt,
  flags,
  method,
  confidence,
  usedOcr,
}: {
  verifiedAt: string;
  flags: string[];
  method: string | null;
  confidence: number | null;
  usedOcr: boolean;
}) {
  return (
    <div className="space-y-1 text-xs">
      <div className="font-semibold text-foreground">Page verification</div>
      <div className="text-muted-foreground">
        Verified {new Date(verifiedAt).toLocaleString()}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded bg-muted px-1.5 py-0.5">
          {method ?? (usedOcr ? "OCR" : "Text extraction")}
        </span>
        {confidence != null ? (
          <span className="rounded bg-muted px-1.5 py-0.5">
            confidence {confidence.toFixed(2)}
          </span>
        ) : null}
        {flags.length === 0 ? (
          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">
            no flags
          </span>
        ) : (
          flags.map((flag) => (
            <span
              key={flag}
              className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-300"
            >
              {flag.replaceAll("_", " ")}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
