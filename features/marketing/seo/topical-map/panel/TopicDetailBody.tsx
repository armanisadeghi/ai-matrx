"use client";

/**
 * THE ONE body of the topic detail panel (CONTRACTS.md §5, vision §2.3).
 *
 * Every host renders THIS: the floating window, the drawer, the peek, and the
 * canvas. There is no second copy anywhere — a panel wraps the canonical
 * component, it never grows a bespoke body (CLAUDE.md § A WINDOW PANEL WRAPS
 * THE CANONICAL COMPONENT). The champion is Linear's issue panel: the most
 * important thing first, every property a door, dense and quiet.
 *
 * ORDER (the vision's): identity (name · status · description · place in the
 * tree · counts) → facets, own and inherited → pages, with where each is going
 * → planned pages → keywords → everything else attached, grouped by whatever
 * kind the function returned → history. Above the sections: the topic agent's
 * two doors and the Change menu (retire / reject / move / merge / split, every
 * one rehearsed through `seo.map_dry_run` before it runs).
 *
 * READ-ONLY (a record-only grantee, the peek, a canvas viewer): every write
 * control is ABSENT, not disabled — the panel is the same document without
 * pens. Nothing is hidden that could be read.
 *
 * SELF-LOADING: the panel reads the slice, and loads the tree itself when no
 * workspace has (`useTopicPanelData`). The two "not here" cases stay two
 * different sentences: the map's rows are not loaded, or the map has no such
 * topic (a rejected/retired slug answers like an invented one, on purpose).
 *
 * SURFACE VALUES (R18): the topic agent reads this surface's live scope. When
 * a workspace is open behind the panel its provider is live and richer, so the
 * panel registers nothing; with no runtime for this surface (a peek on `/chat`,
 * the window over another page) the panel mounts the provider itself with what
 * it knows — the map, the selected slug, this topic — so "Ask about this
 * topic" still opens with real values. Never `setContextEntries`, never
 * `user_input`.
 */

import { useRef, useState } from "react";

import { ClipboardFallbackDialog } from "@/components/dialogs/clipboard-fallback/ClipboardFallbackDialog";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { useOpenTopicPanel } from "@/features/overlays/openers/topicalMapTopicPanel";
import { createMarketingTopicalMapScope } from "@/features/surfaces/manifests/marketing-topical-map.manifest";
import {
  SurfaceRuntimeProvider,
  getSurfaceRuntimeForName,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useClippedContentGuard } from "@/lib/layout/useClippedContentGuard";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";

import { TopicalMapFailed } from "../components/TopicalMapStates";
import type { MapHost } from "../components/TopicalMapWorkspaceBody";
import { topicalMapErrorText } from "../errors";
import { useMapLinks } from "../links";
import { selectMapLoadedAt, selectMapTopic, selectMapTopicPath } from "../redux/selectors";
import { revealTopic, selectTopic } from "../redux/slice";
import { buildTopicMenuSection } from "../ui/topicMenuSection";
import { SPECIAL_KINDS, splitAssociations } from "./associationGroups";
import { PanelSection } from "./PanelSection";
import { AssociationsSection } from "./sections/AssociationsSection";
import { FacetsSection } from "./sections/FacetsSection";
import { HistorySection } from "./sections/HistorySection";
import { IdentitySection } from "./sections/IdentitySection";
import { KeywordsSection } from "./sections/KeywordsSection";
import { PagesSection } from "./sections/PagesSection";
import { PlannedPagesSection } from "./sections/PlannedPagesSection";
import { TopicAgentControls } from "./sections/TopicAgentControls";
import { TopicChanges, type TopicChangeKind } from "./sections/TopicChanges";
import { TOPICAL_MAP_SURFACE_NAME } from "./topicCuration";
import { useTopicPanelData } from "./useTopicPanelData";

export interface TopicDetailBodyProps {
  mapId: string;
  slug: string;
  siteId: string | null;
  host: MapHost;
  readOnly?: boolean;
  /** The host's close — a retired, rejected or merged topic closes its own panel. */
  onClose?: () => void;
}

export function TopicDetailBody({
  mapId,
  slug,
  siteId,
  host,
  readOnly = false,
  onClose,
}: TopicDetailBodyProps) {
  // Decided once per mount: is a workspace already emitting this surface? If
  // so its scope is the richer one and the panel registers nothing (a second
  // provider at the same depth would shadow it — the registry breaks ties by
  // recency). If not, the panel is the surface for the agent's purposes.
  const [ownsRuntime] = useState(
    () => getSurfaceRuntimeForName(TOPICAL_MAP_SURFACE_NAME) === null,
  );
  const topic = useAppSelector(selectMapTopic(mapId, slug));
  const path = useAppSelector(selectMapTopicPath(mapId, slug));

  const getScope = () =>
    createMarketingTopicalMapScope({
      map_id: mapId,
      ...(siteId ? { site_id: siteId } : {}),
      selected_topic_slug: slug,
      ...(topic
        ? {
            visible_topics: [
              {
                slug: topic.slug,
                name: topic.name,
                depth: topic.depth,
                ...(topic.status ? { status: topic.status } : {}),
                ...(topic.description ? { description: topic.description } : {}),
                path: [...path],
              },
            ],
          }
        : {}),
    });

  const body = (
    <TopicDetailBodyInner
      mapId={mapId}
      slug={slug}
      siteId={siteId}
      host={host}
      readOnly={readOnly}
      onClose={onClose}
    />
  );

  return ownsRuntime ? (
    <SurfaceRuntimeProvider surfaceName={TOPICAL_MAP_SURFACE_NAME} getScope={getScope}>
      {body}
    </SurfaceRuntimeProvider>
  ) : (
    body
  );
}

function TopicDetailBodyInner({
  mapId,
  slug,
  siteId,
  host,
  readOnly,
  onClose,
}: Required<Pick<TopicDetailBodyProps, "mapId" | "slug" | "siteId" | "host" | "readOnly">> &
  Pick<TopicDetailBodyProps, "onClose">) {
  const dispatch = useAppDispatch();
  const links = useMapLinks();
  const openPanel = useOpenTopicPanel();
  const topic = useAppSelector(selectMapTopic(mapId, slug));
  const loadedAt = useAppSelector(selectMapLoadedAt(mapId));
  const data = useTopicPanelData(mapId, slug, siteId);
  const scrollRef = useRef<HTMLDivElement>(null);
  useClippedContentGuard(scrollRef, { label: "topical-map topic panel" });
  const [requestedChange, setRequestedChange] = useState<TopicChangeKind | null>(null);
  const [clipboardFallback, setClipboardFallback] = useState<string | null>(null);

  if (!topic) {
    if (data.treeSelfLoading) {
      return (
        <div className="p-4">
          <SuspenseLoader centered={false} message="Loading this map's topics…" />
        </div>
      );
    }
    if (data.tree.isError) {
      return (
        <div className="p-4">
          <TopicalMapFailed what="this map's topics" error={data.tree.error} />
        </div>
      );
    }
    /**
     * An unknown slug is exactly what `seo.*` answers `P0002` for, and the two
     * cases a reader needs told apart are "this map is not open here" and
     * "this map has no such topic" — two different sentences, the same shape
     * every other refusal in this feature uses.
     */
    const error = new Error(
      loadedAt
        ? `This map has no topic "${slug}". A rejected or retired topic answers exactly like an invented one, on purpose — look on the map's History screen.`
        : `This map's topics are not loaded here yet, so "${slug}" cannot be shown. Open the map's workspace and try again.`,
    );
    return (
      <div className="p-4">
        <TopicalMapFailed what="this topic" error={error} />
      </div>
    );
  }

  const knobs = data.knobs.knobs;
  const organizationId = data.map.data?.organization_id ?? null;
  const brandId = data.map.data?.brand_id ?? null;
  const split = splitAssociations(data.associationRows);
  const attachedKeys = new Set<string>();
  for (const row of data.associationRows) {
    if (!("hidden" in row.item)) attachedKeys.add(`${row.association.kind}:${row.item.id}`);
  }

  /** A crumb, a sibling, a merge target: re-target THIS panel to that topic. */
  function goTo(nextSlug: string): void {
    dispatch(selectTopic({ mapId, slug: nextSlug }));
    dispatch(revealTopic({ mapId, slug: nextSlug }));
    // A window/drawer is one panel per (map, topic): open the other topic's
    // panel beside this one; a peek just selects (its frame is the peek's).
    if (host !== "peek") openPanel({ mapId, slug: nextSlug, siteId });
  }

  async function copySlug(): Promise<void> {
    try {
      await navigator.clipboard.writeText(slug);
    } catch {
      setClipboardFallback(slug);
    }
  }

  function refetchAssociations(): void {
    void data.associations.refetch();
  }

  const menuSections = [
    buildTopicMenuSection({
      mapId,
      slug,
      label: topic.name,
      links,
      actions: readOnly
        ? { onCopySlug: () => void copySlug() }
        : {
            onCopySlug: () => void copySlug(),
            onMove: () => setRequestedChange("move"),
            onRetire: () => setRequestedChange("retire"),
            onReject: () => setRequestedChange("reject"),
          },
    }),
  ];

  return (
    <NonEditableContextMenu
      sourceFeature="marketing"
      surfaceName={TOPICAL_MAP_SURFACE_NAME}
      enableFloatingIcon={false}
      contextData={{ map_id: mapId, topic_slug: slug, content: topic.description ?? topic.name }}
      extraSections={menuSections}
    >
      <div
        ref={scrollRef}
        className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
        data-topic-panel={slug}
        data-host={host}
        data-read-only={readOnly ? "true" : "false"}
      >
        <IdentitySection
          mapId={mapId}
          slug={slug}
          topic={topic}
          readOnly={readOnly}
          onNavigate={goTo}
          descriptionMaxChars={knobs?.topic_description_max_chars}
        />

        {readOnly ? null : (
          <div className="flex flex-wrap items-start justify-between gap-2">
            {knobs ? (
              <TopicAgentControls
                changeMode={knobs.topic_agent_change_mode}
                regenerationMode={knobs.description_regeneration_mode}
              />
            ) : data.knobs.error ? (
              <p role="alert" className="text-xs text-destructive">
                {topicalMapErrorText(data.knobs.error)}
              </p>
            ) : (
              <SuspenseLoader centered={false} message="Loading this organization's map settings…" />
            )}
            <TopicChanges
              mapId={mapId}
              slug={slug}
              topic={topic}
              requested={requestedChange}
              onRequestHandled={() => setRequestedChange(null)}
              onTopicGone={() => onClose?.()}
            />
          </div>
        )}

        <FacetsSection
          mapId={mapId}
          slug={slug}
          organizationId={organizationId}
          brandId={brandId}
          readOnly={readOnly}
        />

        {data.associations.isPending ? (
          <PanelSection title="Attachments">
            <SuspenseLoader centered={false} message="Loading what is attached to this topic…" />
          </PanelSection>
        ) : data.associations.isError ? (
          <PanelSection title="Attachments">
            <TopicalMapFailed what="this topic's attachments" error={data.associations.error} />
          </PanelSection>
        ) : (
          <>
            {knobs ? (
              <PagesSection
                mapId={mapId}
                slug={slug}
                siteId={siteId}
                pages={split.pages}
                intentColors={knobs.intent_colors}
              />
            ) : (
              <PanelSection title="Pages" count={split.pages.length}>
                <SuspenseLoader centered={false} message="Loading the intent colours…" />
              </PanelSection>
            )}
            <PlannedPagesSection
              mapId={mapId}
              topicName={topic.name}
              topicId={data.topicRow?.id ?? null}
              organizationId={organizationId}
              siteId={siteId}
              planned={split.planned}
              readOnly={readOnly}
              onMade={refetchAssociations}
            />
            <KeywordsSection slug={slug} siteId={siteId} keywords={split.keywords} />
            <AssociationsSection
              topicName={topic.name}
              topicId={data.topicRow?.id ?? null}
              organizationId={organizationId}
              groups={split.generic}
              attachedKeys={attachedKeys}
              readOnly={readOnly}
              onChanged={refetchAssociations}
            />
          </>
        )}

        <HistorySection mapId={mapId} slug={slug} />

        {data.topicRows.isError && !readOnly ? (
          <p role="alert" className="text-xs text-destructive">
            {topicalMapErrorText(data.topicRows.error)} — attach and &ldquo;make a page&rdquo;
            need the topic&rsquo;s id, so they are absent until this read succeeds.
          </p>
        ) : null}
      </div>

      <ClipboardFallbackDialog
        open={clipboardFallback !== null}
        onOpenChange={(open) => (open ? undefined : setClipboardFallback(null))}
        url={clipboardFallback ?? ""}
        title="Copy the slug"
      />
      {/* SPECIAL_KINDS is the panel's only knowledge of kinds; it exists so the
          four named sections and the generic one never show the same row twice. */}
      <span hidden data-special-kinds={[...SPECIAL_KINDS].join(",")} />
    </NonEditableContextMenu>
  );
}
