"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  FileText,
  Loader2,
  PanelRight,
  ScanSearch,
  Table2,
  TriangleAlert,
} from "lucide-react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { MatrxUuidCell } from "@/components/official/matrx-data-table/MatrxUuidCell";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import { createJob } from "@/features/page-extraction/api/jobs";
import { useExtractionStream } from "@/features/page-extraction/hooks/useExtractionStream";
import { selectActiveRunByJob } from "@/features/page-extraction/redux/selectors";
import type {
  ExtraExtractionInput,
  PageExtractionJobInsert,
} from "@/features/page-extraction/types";
import { SelectedPdfPages } from "@/features/rag/components/search/SelectedPdfPages";
import { RagContentActions } from "@/features/rag/components/search/RagContentActions";
import { createRagAiCopyBundle } from "@/features/rag/components/search/ragAiCopy";
import { hitViewFromSearchHit } from "@/features/rag/components/hit-card/adapters";
import type { RagSearchHit } from "@/features/rag/api/search";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type RepairKind = "table" | "text" | "missing_context" | "other";

const REPAIR_KINDS: Array<{
  value: RepairKind;
  label: string;
  icon: typeof Table2;
  instructions: string;
}> = [
  {
    value: "table",
    label: "Repair a table",
    icon: Table2,
    instructions:
      "Review the attached native PDF pages directly. Reconstruct every relevant table faithfully as valid Markdown tables. Preserve headings, row and column relationships, units, footnotes, symbols, and page provenance. Do not rely on the OCR text when it conflicts with the PDF.",
  },
  {
    value: "text",
    label: "Correct text",
    icon: FileCheck2,
    instructions:
      "Review the attached native PDF pages directly and produce corrected, well-structured text for the material represented by this RAG result. Preserve headings, lists, footnotes, and page provenance. Do not invent missing content.",
  },
  {
    value: "missing_context",
    label: "Restore context",
    icon: FileText,
    instructions:
      "Review the attached native PDF pages directly and create a self-contained replacement that restores the context missing from the retrieved chunk. Include the necessary preceding and following material, while staying faithful to the source and identifying the source pages used.",
  },
  {
    value: "other",
    label: "Custom repair",
    icon: FileCheck2,
    instructions:
      "Review the attached native PDF pages directly and create a faithful, structured correction for this RAG result. State the source pages used and do not infer facts that are not visible in the PDF.",
  },
];

function isDocumentVariable(variable: VariableDefinition): boolean {
  return variable.customComponent?.type === "document";
}

function buildRepairWiring(
  variables: VariableDefinition[],
  instructions: string,
): {
  mapping: Record<string, string>;
  extraInputs: ExtraExtractionInput[];
  documentVariable: VariableDefinition | null;
} {
  const mapping: Record<string, string> = {};
  const extraInputs: ExtraExtractionInput[] = [];
  const documentVariable = variables.find(isDocumentVariable) ?? null;
  if (documentVariable) mapping.pdf_page = documentVariable.name;

  let instructionsAssigned = false;
  for (const variable of variables) {
    if (variable === documentVariable) continue;
    const name = variable.name.trim();
    const normalized = name.toLowerCase();
    if (!name) continue;
    if (/^pages?$|page_?numbers?|pg_?num/.test(normalized)) {
      mapping.page_numbers = name;
    } else if (/file_?name|filename/.test(normalized)) {
      mapping.filename = name;
    } else if (
      variable.customComponent?.type === "textarea" ||
      /instruction|request|task|prompt|goal/.test(normalized) ||
      (variable.required && !variable.customComponent?.type)
    ) {
      mapping[name] = name;
      extraInputs.push({ name, value: instructions });
      instructionsAssigned = true;
    }
  }

  if (!instructionsAssigned) {
    const fallback = variables.find(
      (variable) =>
        variable !== documentVariable &&
        (!variable.customComponent ||
          variable.customComponent.type === "textarea"),
    );
    if (fallback) {
      mapping[fallback.name] = fallback.name;
      extraInputs.push({ name: fallback.name, value: instructions });
    }
  }
  return { mapping, extraInputs, documentVariable };
}

function PaneTitle({
  icon: Icon,
  eyebrow,
  title,
  trailing,
}: {
  icon: typeof FileText;
  eyebrow: string;
  title: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-14 shrink-0 items-center gap-2 px-3 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {eyebrow}
        </p>
        <p className="truncate text-sm font-semibold">{title}</p>
      </div>
      {trailing}
    </div>
  );
}

function PaneBody({
  scrollable,
  className,
  children,
}: {
  scrollable: boolean;
  className: string;
  children: React.ReactNode;
}) {
  const content = <div className={className}>{children}</div>;
  return scrollable ? (
    <ScrollArea className="min-h-0 flex-1">{content}</ScrollArea>
  ) : (
    content
  );
}

function RetrievedPane({
  hit,
  sourceName,
  scrollable = true,
}: {
  hit: RagSearchHit;
  sourceName: string;
  scrollable?: boolean;
}) {
  const view = hitViewFromSearchHit(hit, { name: sourceName });
  const hitPages: number[] = view.pageNumbers?.length
    ? view.pageNumbers
    : view.pageNumber != null
      ? [view.pageNumber]
      : [];
  const href = `/files/f/${encodeURIComponent(hit.source_id)}?tab=document&chunk=${encodeURIComponent(hit.chunk_id)}${view.pageNumber ? `&page=${view.pageNumber}` : ""}`;
  const aiBundle = createRagAiCopyBundle(view, sourceName, "File", href);
  return (
    <div className="flex h-full min-h-0 flex-col bg-card/40">
      <PaneTitle
        icon={ScanSearch}
        eyebrow="Agent view"
        title="Retrieved content"
      />
      <PaneBody scrollable={scrollable} className="space-y-4 px-3 pb-4">
        <div className="rounded-lg border border-border/70 bg-background/70 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium" title={sourceName}>
                {sourceName}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {hit.chunk_kind.replaceAll("_", " ")} · hit page
                {hitPages.length === 1 ? "" : "s"} {hitPages.join(", ")}
              </p>
            </div>
            <RagContentActions
              humanText={hit.snippet}
              label="retrieved RAG content"
              bundle={aiBundle}
              initialSections={["retrieved"]}
            />
          </div>
          <div className="mt-3 space-y-1.5 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0">Source</span>
              <MatrxUuidCell value={hit.source_id} label="RAG source ID" />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0">Result</span>
              <MatrxUuidCell value={hit.chunk_id} label="RAG result chunk ID" />
            </div>
          </div>
        </div>
        <div className="select-text whitespace-pre-wrap break-words rounded-lg border border-border/70 bg-background p-3 text-sm leading-relaxed">
          {hit.snippet}
        </div>
        <div className="rounded-lg bg-amber-500/8 p-3 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
          This is what retrieval supplied to the agent. Compare it with the
          physical pages before creating a correction.
        </div>
      </PaneBody>
    </div>
  );
}

function RepairPane({
  hit,
  fileId,
  sourceName,
  reviewPages,
  scrollable = true,
}: {
  hit: RagSearchHit;
  fileId: string;
  sourceName: string;
  reviewPages: number[];
  scrollable?: boolean;
}) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const organizationId = useAppSelector(selectEffectiveOrganizationId);
  const [repairKind, setRepairKind] = useState<RepairKind>("table");
  const [instructions, setInstructions] = useState(
    REPAIR_KINDS[0].instructions,
  );
  const [agentId, setAgentId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const agent = useAppSelector((state) =>
    agentId ? selectAgentById(state, agentId) : undefined,
  );
  const activeRun = useAppSelector((state) =>
    selectActiveRunByJob(state, jobId),
  );
  const extraction = useExtractionStream();
  const variables = agent?.variableDefinitions ?? [];
  const wiring = buildRepairWiring(variables, instructions);
  const rawOutput = activeRun
    ? Object.values(activeRun.pageRuns)
        .sort((a, b) => a.chunkIndex - b.chunkIndex)
        .map((pageRun) => pageRun.rawResponse ?? pageRun.streamingText)
        .filter(Boolean)
        .join("\n\n")
    : "";

  const selectAgent = async (nextAgentId: string) => {
    setAgentId(nextAgentId);
    setJobId(null);
    try {
      await dispatch(fetchAgentExecutionMinimal(nextAgentId)).unwrap();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load that agent",
      );
    }
  };

  const runRepair = async () => {
    if (!agentId || !agent || !wiring.documentVariable || !userId) return;
    setLaunching(true);
    try {
      const orgId = await ensureOrgId(organizationId);
      const insert: PageExtractionJobInsert = {
        file_id: fileId,
        processed_document_id: hit.processed_document_id ?? null,
        name: `RAG repair · ${sourceName} · pages ${reviewPages.join("-")}`,
        description: `Targeted ${repairKind} repair for RAG chunk ${hit.chunk_id}. Native PDF pages: ${reviewPages.join(", ")}.`,
        agent_id: agentId,
        shortcut_id: null,
        variable_mapping: wiring.mapping,
        output_schema: { kind: "text" },
        chunk_size: reviewPages.length,
        chunk_overlap: 0,
        scope_pages: reviewPages,
        source_variations: ["pdf_page"],
        chunking_strategy: "pages",
        is_saved: true,
        archived_at: null,
        attach_combined_pdf: true,
        kind: "extraction",
        validates_job_id: null,
        extra_inputs: wiring.extraInputs,
        model_overrides: null,
        max_concurrent: 1,
        rag_boost: 100,
        column_order: [],
        owner_id: userId,
        organization_id: orgId,
        project_id: null,
      };
      const job = await createJob(insert);
      setJobId(job.id);
      const result = await extraction.start(fileId, {
        job_id: job.id,
        scope_pages: reviewPages,
        chunk_size: reviewPages.length,
        max_concurrent: 1,
      });
      if (result.runId) {
        toast.success(
          "Correction generated and added to the extraction review queue",
        );
      } else if (!extraction.error) {
        toast.error("The repair run ended without a run ID");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Repair run failed");
    } finally {
      setLaunching(false);
    }
  };

  const incompatible = Boolean(agentId && agent && !wiring.documentVariable);
  const busy = launching || extraction.running;

  return (
    <div className="flex h-full min-h-0 flex-col bg-card/40">
      <PaneTitle
        icon={FileCheck2}
        eyebrow="Take action"
        title="Review & repair"
      />
      <PaneBody scrollable={scrollable} className="space-y-4 px-3 pb-5">
        <section className="space-y-2">
          <p className="text-xs font-medium">1. What needs attention?</p>
          <div className="grid grid-cols-2 gap-1.5">
            {REPAIR_KINDS.map((option) => {
              const Icon = option.icon;
              const active = repairKind === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setRepairKind(option.value);
                    setInstructions(option.instructions);
                  }}
                  className={cn(
                    "flex min-h-16 flex-col items-start justify-center gap-1 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors",
                    active
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border/70 bg-background/60 hover:bg-muted/50",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium">2. Direct the repair</p>
            <Badge variant="outline" className="text-[10px] font-normal">
              pages {reviewPages.join(", ")}
            </Badge>
          </div>
          <Textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            className="min-h-32 resize-y text-xs leading-relaxed"
            aria-label="Repair instructions"
          />
        </section>

        <section className="space-y-2">
          <p className="text-xs font-medium">3. Choose a PDF-capable agent</p>
          <AgentListDropdown
            onSelect={(next) => void selectAgent(next)}
            label={agent?.name ?? "Select an agent"}
            className="w-full"
          />
          {agentId && !agent ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading agent
              inputs…
            </p>
          ) : null}
          {wiring.documentVariable ? (
            <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" /> Native PDF pages will be
              attached to <strong>{wiring.documentVariable.name}</strong>.
            </p>
          ) : null}
          {incompatible ? (
            <div className="flex gap-2 rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-200">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                This agent has no Document input, so it cannot inspect the
                native PDF. Choose an agent with a document variable.
              </p>
            </div>
          ) : null}
        </section>

        <Button
          type="button"
          className="w-full gap-2"
          disabled={
            busy ||
            !agent ||
            !wiring.documentVariable ||
            !instructions.trim() ||
            !userId
          }
          onClick={() => void runRepair()}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileCheck2 className="h-4 w-4" />
          )}
          {busy ? "Reviewing physical pages…" : "Generate correction"}
        </Button>

        {activeRun ? (
          <section className="space-y-2 rounded-lg border border-border/70 bg-background/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold">Agent output</p>
              <Badge
                variant={
                  activeRun.status === "failed" ? "destructive" : "secondary"
                }
                className="text-[10px]"
              >
                {activeRun.status}
              </Badge>
            </div>
            {rawOutput ? (
              <div className="max-h-72 overflow-y-auto select-text text-xs">
                <BasicMarkdownContent content={rawOutput} />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                The agent is reading the selected native PDF pages.
              </p>
            )}
            {jobId && activeRun.status === "completed" ? (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="w-full gap-1.5"
              >
                <Link href={`/knowledge/extractions/${jobId}`} target="_blank">
                  Review, edit, and manage output
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : null}
          </section>
        ) : null}

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          This creates a durable page-extraction dataset anchored to the
          physical source pages. The existing extraction pipeline indexes
          completed output for RAG; use the review workspace to edit or manage
          it.
        </p>
      </PaneBody>
    </div>
  );
}

export function RagReviewRepairWorkspace({
  hit,
  sourceName,
  reviewPages,
  onClose,
  onOpenSource,
}: {
  hit: RagSearchHit;
  sourceName: string;
  reviewPages: number[];
  onClose: () => void;
  onOpenSource: () => void;
}) {
  const isMobile = useIsMobile();
  const fileId = hit.source_ref?.file_id ?? hit.source_id;

  const toolbar = (
    <div className="flex shrink-0 items-center gap-2 border-b border-border/70 px-2 py-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2"
        onClick={onClose}
      >
        <ArrowLeft className="h-4 w-4" />
        Results
      </Button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{sourceName}</p>
        <p className="truncate text-[10px] text-muted-foreground">
          Review packet · physical pages {reviewPages.join(", ")}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 px-2"
        onClick={onOpenSource}
        aria-label="Open the full source document"
        title="Open the full source document"
      >
        <PanelRight className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Full document</span>
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        {toolbar}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe">
          <section className="h-[70dvh] min-h-[32rem] border-b border-border/70">
            <PaneTitle
              icon={FileText}
              eyebrow="Source of truth"
              title="Physical PDF"
            />
            <div className="h-[calc(100%-3.5rem)] min-h-0">
              <SelectedPdfPages
                fileId={fileId}
                sourcePages={reviewPages}
                showPagePicker
              />
            </div>
          </section>
          <section className="min-h-[32rem] border-b border-border/70">
            <RetrievedPane
              hit={hit}
              sourceName={sourceName}
              scrollable={false}
            />
          </section>
          <section className="min-h-[44rem]">
            <RepairPane
              hit={hit}
              fileId={fileId}
              sourceName={sourceName}
              reviewPages={reviewPages}
              scrollable={false}
            />
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {toolbar}
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup
          id="rag-review-repair-workspace"
          orientation="horizontal"
          className="h-full w-full"
        >
          <ResizablePanel id="retrieved" defaultSize="27%" minSize="8%">
            <RetrievedPane hit={hit} sourceName={sourceName} />
          </ResizablePanel>
          <ResizableHandle id="rag-review-left-handle" withHandle />
          <ResizablePanel id="physical-pdf" defaultSize="46%" minSize="25%">
            <div className="flex h-full min-h-0 flex-col bg-muted/10">
              <PaneTitle
                icon={FileText}
                eyebrow="Source of truth"
                title="Physical PDF"
              />
              <div className="min-h-0 flex-1">
                <SelectedPdfPages
                  fileId={fileId}
                  sourcePages={reviewPages}
                  showPagePicker
                />
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle id="rag-review-right-handle" withHandle />
          <ResizablePanel id="repair" defaultSize="27%" minSize="8%">
            <RepairPane
              hit={hit}
              fileId={fileId}
              sourceName={sourceName}
              reviewPages={reviewPages}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
