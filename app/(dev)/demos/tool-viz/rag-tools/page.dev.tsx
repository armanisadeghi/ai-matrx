"use client";

/**
 * RAG-family tool renderer gallery — the three renderers added 2026-07-17
 * (`rag_list_sources`, `rag_get_chunk`, `document_content`) rendered with
 * REAL payload shapes sampled from `chat.tool_call`, in every representation.
 *
 * Route: /demos/tool-viz/rag-tools   (dev profile only)
 */

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { RagListSourcesInline } from "@/features/tool-call-visualization/renderers/rag-list-sources/RagListSourcesInline";
import { RagChunkInline } from "@/features/tool-call-visualization/renderers/rag-get-chunk/RagChunkInline";
import { DocumentContentInline } from "@/features/tool-call-visualization/renderers/document-content/DocumentContentInline";

function entry(
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
): ToolLifecycleEntry {
  return {
    callId: `demo-${toolName}-${JSON.stringify(args).length}`,
    toolName,
    displayName: toolName,
    status: "completed",
    arguments: args,
    startedAt: new Date(Date.now() - 2000).toISOString(),
    completedAt: new Date().toISOString(),
    latestMessage: null,
    latestData: null,
    result,
    resultPreview: null,
    errorType: null,
    errorMessage: null,
    isDelegated: false,
    events: [],
  };
}

const listSourcesEntry = entry(
  "rag_list_sources",
  { limit: 15 },
  {
    sources: [
      {
        source_kind: "cld_file",
        source_id: "7e523f63-4221-4a1c-965c-04ea233ddd8e",
        chunk_count: 10,
        parent_count: 3,
        short_code: null,
        file_name: null,
        title: null,
        section_histogram: {
          financial_statement: 1,
          legal_correspondence: 1,
          real_estate_document: 1,
        },
        last_updated: "2026-07-13T19:44:10.441807+00:00",
      },
      {
        source_kind: "cld_file",
        source_id: "ab42e32e-4ffc-4719-b76f-a144dbb2c67e",
        chunk_count: 31,
        parent_count: 3,
        short_code: null,
        file_name: "bd5f2dd7b1bd4a42a9e06a1830d20dd0.pdf",
        title: null,
        section_histogram: { "": 1 },
        last_updated: "2026-07-11T22:40:42.855059+00:00",
      },
      {
        source_kind: "cld_file",
        source_id: "5bb2c672-0323-4fee-ab0b-6079e20ce7df",
        chunk_count: 73,
        parent_count: 31,
        short_code: null,
        file_name: null,
        title: null,
        section_histogram: {
          legal_case: 1,
          legal_filing: 1,
          legal_update: 1,
          legal_analysis: 1,
          legal_document: 1,
          work_status_report: 1,
        },
        last_updated: "2026-07-12T01:31:50.432417+00:00",
      },
      {
        source_kind: "note",
        source_id: "f64c4e67-4b4e-4238-9f86-3b01654d5f0c",
        chunk_count: 8,
        parent_count: 3,
        short_code: null,
        file_name: null,
        title: "Case strategy notes",
        section_histogram: { academic_paper: 1, mathematics_problem: 1 },
        last_updated: "2026-07-13T07:51:56.765944+00:00",
      },
    ],
  },
);

const getChunkEntry = entry(
  "rag_get_chunk",
  { chunk_id: "0a1b2c3d-1111-2222-3333-444455556666", include_parent: true },
  {
    chunk_id: "0a1b2c3d-1111-2222-3333-444455556666",
    parent_chunk_id: "9f8e7d6c-aaaa-bbbb-cccc-ddddeeeeffff",
    source_kind: "cld_file",
    source_id: "7e523f63-4221-4a1c-965c-04ea233ddd8e",
    field_id: null,
    chunk_kind: "section",
    content_text:
      "Range of motion of the ankle is measured with a goniometer. Dorsiflexion of 20° and plantar flexion of 40° represent normal values. Mild impairment corresponds to dorsiflexion of 10°; moderate impairment corresponds to dorsiflexion of 5° to less than 10°.\n\nTable 17-11 assigns whole-person impairment percentages to each range: mild 2%, moderate 4%, severe 7%.",
    token_count: 96,
    language: "en",
    metadata: { page_number: 537 },
    processed_document_id: "f3cf55a1-19b1-4d2e-a95c-fb7c449f9eb2",
    primary_page_id: null,
    page_numbers: [537],
    derivation_kind: null,
    parent: {
      chunk_id: "9f8e7d6c-aaaa-bbbb-cccc-ddddeeeeffff",
      chunk_kind: "section_parent",
      content_text:
        "Chapter 17 addresses the lower extremities. Evaluation methods include range of motion, muscle strength, and gait derangement. The ankle section covers dorsiflexion, plantar flexion, inversion, and eversion measurements with their corresponding impairment tables.",
      token_count: 55,
      metadata: {},
    },
  },
);

const docPagesEntry = entry(
  "document_content",
  { document_id: "f3cf55a1-19b1-4d2e-a95c-fb7c449f9eb2", representation: "pages" },
  {
    document_id: "f3cf55a1-19b1-4d2e-a95c-fb7c449f9eb2",
    name: "AMAGuides5thv2.pdf",
    total_pages: 618,
    pages_returned: 400,
    truncated: true,
    pages: [
      {
        page_number: 1,
        section_title: "History and Philosophy of the Guides",
        section_kind: "academic_textbook",
        is_continuation: false,
        clean_chars: 1053,
      },
      {
        page_number: 2,
        section_title: "Impairment, Disability, and Handicap",
        section_kind: "medical_evaluation",
        is_continuation: false,
        clean_chars: 3446,
      },
      {
        page_number: 3,
        section_title: "Guides to the Evaluation of Permanent Impairment",
        section_kind: "academic_paper",
        is_continuation: false,
        clean_chars: 3442,
      },
      {
        page_number: 14,
        section_title: "Physician's Role in Job Responsibilities",
        section_kind: "medical_evaluation",
        is_continuation: true,
        clean_chars: 3861,
      },
      {
        page_number: 15,
        section_title: "ADA Disability Guidelines",
        section_kind: "legal_document",
        is_continuation: false,
        clean_chars: 4402,
      },
    ],
    other_representations: ["clean", "raw", "knowledge_assets", "pdf"],
  },
);

const docCleanEntry = entry(
  "document_content",
  {
    page: 26,
    document_id: "b2b8d995-784f-4d92-b014-dd4a5b9c1c3c",
    representation: "clean",
  },
  {
    document_id: "b2b8d995-784f-4d92-b014-dd4a5b9c1c3c",
    representation: "clean",
    page_range: "26-26",
    text: "FUTURE EARNING CAPACITY (FEC) ADJUSTMENT TABLE\nDirections: To adjust for earning capacity, look up the impairment standard in the top row (bolded numbers), and read down to the entry corresponding to the applicable future earning capacity rank\n\nFEC Rank | 1 | 2 | 3 | 4 | 5\nOne | 1 | 2 | 3 | 4 | 6\nTwo | 1 | 2 | 3 | 5 | 6\nThree | 1 | 2 | 4 | 5 | 6",
    offset: 0,
    chars_returned: 1448,
    total_chars: 1448,
    has_more: false,
    next_offset: null,
    other_representations: ["raw", "pages", "knowledge_assets", "pdf"],
  },
);

const docPdfEntry = entry(
  "document_content",
  {
    page_range: "26-28",
    document_id: "b2b8d995-784f-4d92-b014-dd4a5b9c1c3c",
    representation: "pdf",
  },
  {
    kind: "document_ref",
    media_ref: {
      file_id: "3373af8c-c54c-4714-b082-3a2073fb0b00",
      mime_type: "application/pdf",
    },
    media_type: "application/pdf",
    document_id: "b2b8d995-784f-4d92-b014-dd4a5b9c1c3c",
    representation: "pdf",
    source_pages: [26, 27, 28],
    output_page_map: [
      { output_page: 1, source_page: 26 },
      { output_page: 2, source_page: 27 },
      { output_page: 3, source_page: 28 },
    ],
    pages_capped: false,
    other_representations: ["clean", "raw", "pages", "knowledge_assets"],
  },
);

const errorEntry: ToolLifecycleEntry = {
  ...entry("rag_get_chunk", { chunk_id: "missing" }, null),
  status: "error",
  errorType: "NotFound",
  errorMessage: "chunk missing not found",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default function RagToolsDemoPage() {
  // Gallery-only stubs so the "Open in ▾" menu (window panel + fullscreen)
  // renders here; in chat the shell supplies the real handlers.
  const openOverlay = () => console.log("[rag-tools demo] onOpenOverlay");
  const openWindowPanel = () =>
    console.log("[rag-tools demo] onOpenWindowPanel");
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          RAG-family tool renderers
        </h1>
        <p className="text-sm text-muted-foreground">
          rag_list_sources · rag_get_chunk · document_content — real payload
          shapes, persisted-completed state.
        </p>
      </div>

      <Section title="rag_list_sources">
        <RagListSourcesInline entry={listSourcesEntry} onOpenOverlay={openOverlay} onOpenWindowPanel={openWindowPanel} isPersisted />
      </Section>

      <Section title="rag_get_chunk (with parent context)">
        <RagChunkInline entry={getChunkEntry} onOpenOverlay={openOverlay} onOpenWindowPanel={openWindowPanel} isPersisted />
      </Section>

      <Section title="document_content — pages index">
        <DocumentContentInline entry={docPagesEntry} onOpenOverlay={openOverlay} onOpenWindowPanel={openWindowPanel} isPersisted />
      </Section>

      <Section title="document_content — clean text">
        <DocumentContentInline entry={docCleanEntry} onOpenOverlay={openOverlay} onOpenWindowPanel={openWindowPanel} isPersisted />
      </Section>

      <Section title="document_content — pdf extract">
        <DocumentContentInline entry={docPdfEntry} onOpenOverlay={openOverlay} onOpenWindowPanel={openWindowPanel} isPersisted />
      </Section>

      <Section title="error state">
        <RagChunkInline entry={errorEntry} onOpenOverlay={openOverlay} onOpenWindowPanel={openWindowPanel} isPersisted />
      </Section>
    </div>
  );
}
