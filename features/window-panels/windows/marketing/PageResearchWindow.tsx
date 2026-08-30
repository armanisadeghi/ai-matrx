"use client";

/**
 * PageResearchWindow — "Run research for this page", as a compact window.
 *
 * Arman's per-page research direction (2026-08-24,
 * `common-docs/projects/content-engine/STATE.md` §2.14):
 *
 * > "So the option needs to be to attach it to any research report or to
 * > trigger a new one… we do need a window panel style UI… take the
 * > initialization of the research system, the first few pages, and convert
 * > that into a window panel."
 *
 * > "When you're doing research for a page, this is not gonna be some huge
 * > research project. So, typically, what we would do is limit it to one
 * > keyword, maybe let the user add a second one. And, ideally, the keyword
 * > that gets added should be the keyword that's being targeted for the page.
 * > So this is where you start to earn your wage is that you're now passing
 * > values that mean something from one step to the next."
 *
 * So this is NOT a fork of `ResearchInitForm` (the full wizard: templates,
 * projects, AI suggestion, tags, quotas). It is a launcher over the SAME
 * service functions the wizard calls — `createTopic` → `addKeywords` →
 * `runPipeline` → `generateDocument` — with the page's own values carried in:
 * the topic is named after the page and the first keyword IS the page's target
 * query. Document assembly is part of the job, not a follow-up: the server
 * grounds agents on the final `rs_document`, so a topic that stopped after the
 * pipeline would be an attachment that grounds nothing.
 *
 * On success the new topic is ATTACHED to the plan node through the one
 * association write path (`useContainerLinks.attach`), so it appears in the
 * node panel's Research lineage list immediately and the server-side
 * `combined_research_report` (aidream `content_plan/research_context.py`)
 * feeds it to every agent that runs on this page.
 *
 * The run itself streams into the canonical floating LiveRunWindow bound to
 * the adopted `requestId` — never a bespoke renderer, never a bare spinner.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2, Plus, X } from "lucide-react";

import { ProInput } from "@/components/official/ProInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { LiveRunWindowController } from "@/features/overlays/openers/liveRunWindow";
import { useContainerLinks } from "@/features/scopes/hooks/useContainerLinks";
import { useResearchApi } from "@/features/research/hooks/useResearchApi";
import { useResearchStream } from "@/features/research/hooks/useResearchStream";
import { addKeywords, createTopic } from "@/features/research/service";
import {
  PAGE_RESEARCH_SURFACE_NAME,
  createPageResearchScope,
  pageResearchManifest,
  type PageResearchAttachmentStatus,
  type PageResearchDraftSummary,
  type PageResearchOrganizationSource,
  type PageResearchPageContext,
  type PageResearchRunSummary,
} from "@/features/surfaces/manifests/page-research.manifest";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { surfaceValueLabels } from "@/features/surfaces/utils/surface-display";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

/** Arman's ceiling: one keyword, optionally a second. Never a third. */
export const PAGE_RESEARCH_MAX_KEYWORDS = 2;

const V = surfaceValueLabels(pageResearchManifest);

export interface PageResearchWindowProps {
  isOpen: boolean;
  onClose: () => void;
  /** The plan node this research is FOR — the attach target. */
  nodeId: string;
  /** The node's site, for the topic description (which page, which site). */
  siteId?: string;
  /** The page's label — seeds the topic name. */
  pageLabel?: string;
  /** The page's target query — seeds keyword #1. */
  primaryKeyword?: string;
  /** The node's org (tenancy for the topic + the edge). */
  orgId?: string;
}

export function pageResearchTopicName(pageLabel: string | undefined): string {
  const label = (pageLabel ?? "").trim();
  return label ? `${label} — page research` : "Page research";
}

export default function PageResearchWindow(props: PageResearchWindowProps) {
  if (!props.isOpen) return null;
  return <PageResearchWindowInner {...props} />;
}

type Phase =
  | { status: "form" }
  | { status: "starting" }
  | { status: "running"; topicId: string }
  | { status: "assembling"; topicId: string }
  | { status: "done"; topicId: string };

type ActiveEditor = { kind: "topic_name" } | { kind: "keyword"; index: number };

function PageResearchWindowInner({
  onClose,
  nodeId,
  siteId,
  pageLabel,
  primaryKeyword,
  orgId,
}: PageResearchWindowProps) {
  const activeOrgId = useAppSelector(selectEffectiveOrganizationId);
  // The PAGE's org owns this research, not whatever org the viewer happens to
  // have active — a page and its research must land in the same tenancy.
  const organizationId = orgId ?? activeOrgId ?? null;

  const [name, setName] = useState(() => pageResearchTopicName(pageLabel));
  const [keywords, setKeywords] = useState<string[]>(() =>
    (primaryKeyword ?? "").trim() ? [(primaryKeyword ?? "").trim()] : [""],
  );
  const [phase, setPhase] = useState<Phase>({ status: "form" });
  const [attachment, setAttachment] = useState<{
    status: PageResearchAttachmentStatus;
    error: string | null;
  }>({ status: "not_started", error: null });
  const activeEditorRef = useRef<ActiveEditor>({ kind: "topic_name" });

  const api = useResearchApi();
  const stream = useResearchStream();
  const links = useContainerLinks({
    containerType: "plan_node",
    containerId: nodeId,
    orgId: organizationId,
  });

  const cleanKeywords = useMemo(
    () =>
      keywords
        .map((keyword) => keyword.trim())
        .filter(
          (keyword, index, all) => keyword && all.indexOf(keyword) === index,
        ),
    [keywords],
  );
  const canStart =
    phase.status === "form" &&
    Boolean(organizationId) &&
    name.trim().length > 0 &&
    cleanKeywords.length > 0;

  const setKeywordAt = useCallback((index: number, value: string) => {
    setKeywords((prev) => prev.map((k, i) => (i === index ? value : k)));
  }, []);

  const start = useCallback(async () => {
    if (!organizationId) {
      toast.error("No organization for this page — cannot start research.");
      return;
    }
    setAttachment({ status: "not_started", error: null });
    setPhase({ status: "starting" });
    let topicId: string | null = null;
    try {
      const { topic } = await createTopic(organizationId, {
        name: name.trim(),
        description: `Research for the planned page “${(pageLabel ?? "").trim() || "(untitled)"}”${
          siteId ? ` on site ${siteId}` : ""
        }.`,
      });
      topicId = topic.id;
      await addKeywords(topic.id, { keywords: cleanKeywords });

      // ATTACH FIRST, run second. The topic row and its edge are the durable
      // result of this window; the run is the paid work on top. A run that
      // dies still leaves the page pointing at real research.
      setAttachment({ status: "attaching", error: null });
      const attached = await links.attach(
        "research_topic",
        topic.id,
        name.trim(),
      );
      if (!attached.ok) {
        const attachmentError =
          attached.error ??
          "The association write did not return an error message.";
        setAttachment({ status: "failed", error: attachmentError });
        toast.error(
          `Research started, but attaching it to this page failed: ${attachmentError}`,
        );
      } else {
        setAttachment({ status: "attached", error: null });
      }

      setPhase({ status: "running", topicId: topic.id });
      const controller = new AbortController();
      const response = await api.runPipeline(
        topic.id,
        topic.organization_id,
        controller.signal,
      );
      await stream.startStream(response, undefined, {
        abortController: controller,
      });

      // ASSEMBLY IS PART OF THE JOB, not a follow-up the user must discover.
      // `runPipeline` only searches / scrapes / analyzes; the server's
      // `_load_research_report` reads the final `rs_document`, so a topic that
      // stops before assembly grounds NOTHING and the attachment is a lie.
      setPhase({ status: "assembling", topicId: topic.id });
      await stream.startStream(await api.generateDocument(topic.id));
      setPhase({ status: "done", topicId: topic.id });
    } catch (error) {
      const message = extractErrorMessage(error);
      toast.error(`Page research failed: ${message}`);
      // The topic exists and is attached — the user keeps it and can re-run
      // from the research page rather than losing the work.
      setPhase(topicId ? { status: "done", topicId } : { status: "form" });
    }
  }, [
    api,
    cleanKeywords,
    links,
    name,
    organizationId,
    pageLabel,
    siteId,
    stream,
  ]);

  const collectData = useCallback(
    (): Record<string, unknown> => ({
      nodeId,
      siteId: siteId ?? "",
      pageLabel: pageLabel ?? "",
      primaryKeyword: primaryKeyword ?? "",
      orgId: orgId ?? "",
    }),
    [nodeId, siteId, pageLabel, primaryKeyword, orgId],
  );

  const topicId =
    phase.status === "form" || phase.status === "starting"
      ? null
      : phase.topicId;
  const latest = stream.messages.at(-1)?.message ?? null;

  const organizationSource: PageResearchOrganizationSource = orgId
    ? "page"
    : activeOrgId
      ? "active"
      : "missing";
  const pageContext: PageResearchPageContext = {
    node_id: nodeId,
    site_id: siteId ?? "",
    page_label: pageLabel ?? "",
    primary_keyword: primaryKeyword ?? "",
    page_organization_id: orgId ?? "",
    active_organization_id: activeOrgId ?? "",
    organization_id: organizationId ?? "",
    organization_source: organizationSource,
  };
  const draftSummary: PageResearchDraftSummary = {
    topic_name: name,
    keywords: [...keywords],
    clean_keywords: [...cleanKeywords],
    max_keywords: PAGE_RESEARCH_MAX_KEYWORDS,
    can_start: canStart,
  };
  const runSummary: PageResearchRunSummary = {
    research_phase: phase.status,
    topic_id: topicId,
    attachment_status: attachment.status,
    attachment_error: attachment.error,
    is_streaming: stream.isStreaming,
    stream_request_id: stream.requestId ?? null,
    latest_stream_message: latest,
    stream_error: stream.error ?? null,
  };

  const buildScope = (
    content: string = [name, ...cleanKeywords].join("\n"),
    extraContext: Record<string, unknown> = {},
  ) =>
    createPageResearchScope({
      ...pageContext,
      page_context: pageContext,
      ...draftSummary,
      draft_summary: draftSummary,
      research_phase: phase.status,
      ...(topicId ? { topic_id: topicId } : {}),
      attachment_status: attachment.status,
      ...(attachment.error ? { attachment_error: attachment.error } : {}),
      is_streaming: stream.isStreaming,
      ...(stream.requestId ? { stream_request_id: stream.requestId } : {}),
      ...(latest ? { latest_stream_message: latest } : {}),
      ...(stream.error ? { stream_error: stream.error } : {}),
      run_summary: runSummary,
      content,
      context: {
        page_context: pageContext,
        draft_summary: draftSummary,
        run_summary: runSummary,
        ...extraContext,
      },
    });

  const getScope = () => buildScope();

  const activeEditorContent = (): string => {
    const editor = activeEditorRef.current;
    return editor.kind === "topic_name" ? name : (keywords[editor.index] ?? "");
  };

  const getEditorScope = () => {
    const editor = activeEditorRef.current;
    return buildScope(activeEditorContent(), {
      active_editor:
        editor.kind === "topic_name"
          ? { value: "topic_name" }
          : { value: "keywords", index: editor.index },
    });
  };

  const resolveEditorContext = (target: HTMLElement | null) => {
    const field = target?.closest<HTMLElement>("[data-page-research-field]");
    if (field?.dataset.pageResearchField === "keyword") {
      const index = Number(field.dataset.keywordIndex);
      if (Number.isInteger(index) && index >= 0 && index < keywords.length) {
        activeEditorRef.current = { kind: "keyword", index };
      }
    } else {
      activeEditorRef.current = { kind: "topic_name" };
    }
    const editor = activeEditorRef.current;
    return {
      content: activeEditorContent(),
      context: {
        page_context: pageContext,
        draft_summary: draftSummary,
        run_summary: runSummary,
        active_editor:
          editor.kind === "topic_name"
            ? { value: "topic_name" }
            : { value: "keywords", index: editor.index },
      },
    };
  };

  const replaceActiveEditorText = (value: string) => {
    const editor = activeEditorRef.current;
    if (editor.kind === "topic_name") {
      setName(value);
      return;
    }
    setKeywordAt(editor.index, value);
  };

  const assertDraftIsOpen = () => {
    if (phase.status !== "form") {
      throw new Error(
        "The page-research draft is locked after Start research is pressed",
      );
    }
  };

  const windowBody = (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
      data-surface-value="content"
    >
      <div
        className="rounded-md border border-border/70 bg-muted/30 px-2.5 py-2"
        data-surface-value="page_context"
      >
        <p className="truncate text-xs font-medium text-foreground">
          <span data-surface-value="node_id" title={"Plan node " + nodeId}>
            <span data-surface-value="page_label">
              {pageLabel?.trim() || "Untitled planned page"}
            </span>
          </span>
        </p>
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span data-surface-value="site_id" title={siteId || "No site ID"}>
            {siteId ? "Site linked" : "No site link"}
          </span>
          <span data-surface-value="organization_source">
            <span
              data-surface-value="organization_id"
              title={organizationId ?? "No research organization"}
            >
              <span data-surface-value="page_organization_id">
                <span data-surface-value="active_organization_id">
                  {organizationSource === "page"
                    ? "Page organization"
                    : organizationSource === "active"
                      ? "Active organization fallback"
                      : "Organization required"}
                </span>
              </span>
            </span>
          </span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground" data-surface-value="context">
        A small, focused research project for this one page. Its report is
        attached to the page and every agent that runs here reads it — on top of
        the site&apos;s own research, which is always included.
      </p>

      <div className="space-y-3" data-surface-value="draft_summary">
        <div
          className="space-y-1.5"
          data-page-research-field="topic_name"
          data-surface-value="topic_name"
        >
          <Label htmlFor="page-research-name" className="text-xs">
            {V.topic_name}
          </Label>
          <ProInput
            id="page-research-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={phase.status !== "form"}
            placeholder="Page research"
            wrapperClassName="w-full"
          />
        </div>

        <div className="space-y-1.5" data-surface-value="keywords">
          <Label className="text-xs">
            {V.keywords}
            <span
              className="ml-1.5 font-normal text-muted-foreground"
              data-surface-value="max_keywords"
            >
              {primaryKeyword
                ? "the page's target query, plus at most one more"
                : "at most " + PAGE_RESEARCH_MAX_KEYWORDS}
            </span>
          </Label>
          <span
            className="sr-only"
            data-surface-value="primary_keyword"
            title={primaryKeyword ?? ""}
          >
            {V.primary_keyword}
          </span>
          {keywords.map((keyword, index) => (
            <div
              key={index}
              className="flex items-center gap-1.5"
              data-page-research-field="keyword"
              data-keyword-index={index}
            >
              <ProInput
                value={keyword}
                onChange={(event) => setKeywordAt(index, event.target.value)}
                disabled={phase.status !== "form"}
                placeholder={
                  index === 0 ? "What this page targets" : "One more angle"
                }
                enableCleanup={false}
                enableVoice={false}
                auxiliaryControlsLabel={"keyword " + (index + 1)}
                wrapperClassName="min-w-0 flex-1"
              />
              {index > 0 && phase.status === "form" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove keyword"
                  onClick={() =>
                    setKeywords((prev) => prev.filter((_, i) => i !== index))
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          ))}
          <p
            className="text-[11px] text-muted-foreground"
            data-surface-value="clean_keywords"
          >
            {cleanKeywords.length} runnable{" "}
            {cleanKeywords.length === 1 ? "keyword" : "keywords"}
          </p>
          {phase.status === "form" &&
          keywords.length < PAGE_RESEARCH_MAX_KEYWORDS ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setKeywords((prev) => [...prev, ""])}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add a second keyword
            </Button>
          ) : null}
        </div>
      </div>

      {phase.status === "form" ? (
        <div className="mt-auto flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!canStart}
            onClick={() => void start()}
            data-surface-value="can_start"
          >
            Start research
          </Button>
        </div>
      ) : (
        <div
          className="mt-auto space-y-2 pt-2"
          data-surface-value="run_summary"
        >
          <div
            className="flex items-center gap-2 text-sm text-foreground"
            data-surface-value="is_streaming"
          >
            {phase.status === "done" && !stream.isStreaming ? null : (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            <span data-surface-value="research_phase">
              <span data-surface-value="latest_stream_message">
                {phase.status === "starting"
                  ? "Creating the topic…"
                  : phase.status === "assembling"
                    ? (latest ?? "Assembling the research report…")
                    : (latest ??
                      (stream.isStreaming
                        ? "Researching…"
                        : "Research finished."))}
              </span>
            </span>
          </div>
          {stream.error ? (
            <p
              className="text-xs text-destructive"
              data-surface-value="stream_error"
            >
              {stream.error}
            </p>
          ) : null}
          {topicId ? (
            <p className="text-xs text-muted-foreground">
              <span data-surface-value="attachment_status">
                {attachment.status === "attached"
                  ? "Attached to this page."
                  : attachment.status === "failed"
                    ? "Topic created, but the page attachment failed."
                    : "Attaching to this page…"}{" "}
              </span>
              {attachment.error ? (
                <span
                  className="text-destructive"
                  data-surface-value="attachment_error"
                >
                  {attachment.error}{" "}
                </span>
              ) : null}
              <Link
                href={"/research/topics/" + topicId}
                className="inline-flex items-center gap-0.5 font-medium text-foreground underline underline-offset-2"
                data-surface-value="topic_id"
              >
                Open the research topic
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </p>
          ) : null}
        </div>
      )}
    </div>
  );

  const menuBody =
    phase.status === "form" ? (
      <EditableContextMenu
        sourceFeature="research"
        surfaceName={PAGE_RESEARCH_SURFACE_NAME}
        menuVersion={1}
        getApplicationScope={getEditorScope}
        resolveContextOnOpen={resolveEditorContext}
        onTextReplace={replaceActiveEditorText}
        contentSource={{ type: "raw" }}
      >
        {windowBody}
      </EditableContextMenu>
    ) : (
      <NonEditableContextMenu
        sourceFeature="research"
        surfaceName={PAGE_RESEARCH_SURFACE_NAME}
        menuVersion={1}
        getApplicationScope={getScope}
        contentSource={{ type: "raw" }}
      >
        {windowBody}
      </NonEditableContextMenu>
    );

  return (
    <SurfaceRuntimeProvider
      surfaceName={PAGE_RESEARCH_SURFACE_NAME}
      getScope={getScope}
      isEditable={phase.status === "form"}
      getWriteHandlers={() => ({
        topic_name: (value) => {
          assertDraftIsOpen();
          setName(expectNonEmptyString(value, "Topic name"));
        },
        keywords: (value) => {
          assertDraftIsOpen();
          setKeywords(expectKeywordDraft(value));
        },
      })}
    >
      <WindowPanel
        id="page-research-window"
        overlayId="pageResearchWindow"
        title="Research for this page"
        onClose={onClose}
        width={520}
        height={480}
        minWidth={360}
        minHeight={320}
        position="center"
        onCollectData={collectData}
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {menuBody}

        {/* The model's own output renders in the ONE canonical live-run window,
            bound to the adopted request id — this panel never renders a stream. */}
        {topicId && (stream.isStreaming || stream.requestId) ? (
          <div data-surface-value="stream_request_id">
            <LiveRunWindowController
              instanceId={"page-research:" + nodeId}
              requestId={stream.requestId}
              pending={!stream.requestId}
              label={
                phase.status === "assembling"
                  ? "Assembling the research report"
                  : "Researching this page"
              }
            />
          </div>
        ) : null}
      </WindowPanel>
    </SurfaceRuntimeProvider>
  );
}

function expectNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(label + " must be a non-empty string");
  }
  return value.trim();
}

function expectKeywordDraft(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    throw new Error("Research keywords must contain one or two strings");
  }
  const keywords = value.map((entry) =>
    expectNonEmptyString(entry, "Each research keyword"),
  );
  if (new Set(keywords).size !== keywords.length) {
    throw new Error("Research keywords must be unique");
  }
  return keywords;
}
