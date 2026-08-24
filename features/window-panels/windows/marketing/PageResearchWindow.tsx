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
 * `runPipeline` — with the page's own values carried in: the topic is named
 * after the page and the first keyword IS the page's target query.
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

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiveRunWindowController } from "@/features/overlays/openers/liveRunWindow";
import { useContainerLinks } from "@/features/scopes/hooks/useContainerLinks";
import { useResearchApi } from "@/features/research/hooks/useResearchApi";
import { useResearchStream } from "@/features/research/hooks/useResearchStream";
import { addKeywords, createTopic } from "@/features/research/service";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

/** Arman's ceiling: one keyword, optionally a second. Never a third. */
export const PAGE_RESEARCH_MAX_KEYWORDS = 2;

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
  | { status: "done"; topicId: string };

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

  const api = useResearchApi();
  const stream = useResearchStream();
  const abortRef = useRef<AbortController | null>(null);
  const links = useContainerLinks({
    containerType: "plan_node",
    containerId: nodeId,
    orgId: organizationId,
  });

  const cleanKeywords = useMemo(
    () =>
      keywords
        .map((keyword) => keyword.trim())
        .filter((keyword, index, all) => keyword && all.indexOf(keyword) === index),
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
      const attached = await links.attach("research_topic", topic.id, name.trim());
      if (!attached.ok) {
        toast.error(
          `Research started, but attaching it to this page failed: ${attached.error}`,
        );
      }

      setPhase({ status: "running", topicId: topic.id });
      const controller = new AbortController();
      abortRef.current = controller;
      const response = await api.runPipeline(
        topic.id,
        topic.organization_id,
        controller.signal,
      );
      await stream.startStream(response, undefined, {
        abortController: controller,
      });
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

  const topicId = phase.status === "running" || phase.status === "done" ? phase.topicId : null;
  const latest = stream.messages.at(-1)?.message ?? null;

  return (
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
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <p className="text-xs text-muted-foreground">
          A small, focused research project for this one page. Its report is
          attached to the page and every agent that runs here reads it — on top
          of the site&apos;s own research, which is always included.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="page-research-name" className="text-xs">
            Topic name
          </Label>
          <Input
            id="page-research-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={phase.status !== "form"}
            placeholder="Page research"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">
            Keywords
            <span className="ml-1.5 font-normal text-muted-foreground">
              {primaryKeyword
                ? "the page's target query, plus at most one more"
                : `at most ${PAGE_RESEARCH_MAX_KEYWORDS}`}
            </span>
          </Label>
          {keywords.map((keyword, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <Input
                value={keyword}
                onChange={(event) => setKeywordAt(index, event.target.value)}
                disabled={phase.status !== "form"}
                placeholder={
                  index === 0 ? "What this page targets" : "One more angle"
                }
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

        {phase.status === "form" ? (
          <div className="mt-auto flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" disabled={!canStart} onClick={() => void start()}>
              Start research
            </Button>
          </div>
        ) : (
          <div className="mt-auto space-y-2 pt-2">
            <div className="flex items-center gap-2 text-sm text-foreground">
              {phase.status === "done" && !stream.isStreaming ? null : (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              <span>
                {phase.status === "starting"
                  ? "Creating the topic…"
                  : (latest ??
                    (stream.isStreaming
                      ? "Researching…"
                      : "Research finished."))}
              </span>
            </div>
            {stream.error ? (
              <p className="text-xs text-destructive">{stream.error}</p>
            ) : null}
            {topicId ? (
              <p className="text-xs text-muted-foreground">
                Attached to this page.{" "}
                <Link
                  href={`/research/topics/${topicId}`}
                  className="inline-flex items-center gap-0.5 font-medium text-foreground underline underline-offset-2"
                >
                  Open the research topic
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </p>
            ) : null}
          </div>
        )}
      </div>

      {/* The model's own output renders in the ONE canonical live-run window,
          bound to the adopted request id — this panel never renders a stream. */}
      {topicId && (stream.isStreaming || stream.requestId) ? (
        <LiveRunWindowController
          instanceId={`page-research:${nodeId}`}
          requestId={stream.requestId}
          pending={!stream.requestId}
          label="Researching this page"
        />
      ) : null}
    </WindowPanel>
  );
}
