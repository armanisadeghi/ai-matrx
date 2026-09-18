"use client";

// features/marketing/seo/topical-map/views/GraphViewImpl.tsx
//
// THE MAP DRAWING — and the ONLY module in this feature allowed to import React
// Flow. It is reached exclusively through `GraphView.tsx`'s
// next/dynamic({ ssr: false }) front door (CONTRACTS §0: one dynamic edge in
// this feature, and this is it), so the canvas engine never lands in a route or
// server chunk. See the code-splitting skill + `reactFlowStaticImportBan` in
// eslint.config.mjs.
//
// What lives here and what deliberately does not:
//   - HERE: the canvas engine, the node/edge wiring, the store reads, the
//     reconcile, the drag persistence, the zoom-driven label floor.
//   - `graph/model.ts`, `graph/bands.ts`, `graph/facetAxis.ts`, `graph/layout.ts`,
//     `graph/encoding.ts`: pure, tested, no React and no xy-flow.
//   - `graph/nodes.tsx`, `graph/GraphLegend.tsx`, `graph/GraphToolbar.tsx`: the
//     appearance, as plain components. This file wraps them in `Handle`s and
//     `Panel`s so that none of them has to import the engine — one gated module
//     per surface is the whole point of the ban.
//
// Champions: Miro / FigJam for the zoom bands (what a node shows depends on how
// many are on screen), Semrush / Surfer for a topical map that answers "where
// are my pages going" and not only "what is this map".

import { createContext, useContext, useEffect, useRef, useState } from "react";
// eslint-disable-next-line no-restricted-syntax -- The ONE sanctioned React Flow import; this module is loaded only via the GraphView next/dynamic({ ssr:false }) wrapper (code-splitting skill + reactFlowStaticImportBan).
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useStore,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./graph/topical-map-graph.css";
import { useRouter } from "next/navigation";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";

import type { MapViewProps } from "../components/TopicalMapWorkspaceBody";
import {
  TopicalMapEmpty,
  TopicalMapFailed,
  TopicalMapLoading,
} from "../components/TopicalMapStates";
import { topicalMapErrorText } from "../errors";
import { useMapGraph, usePageIntents, useSetMapTopicLayout } from "../hooks";
import { useTopicalMapKnobs } from "../knobs";
import { useMapLinks } from "../links";
import { useOpenTopicPanel } from "@/features/overlays/openers/topicalMapTopicPanel";
import {
  selectMapFilters,
  selectMapGraph,
  selectMapGroupBy,
  selectMapSelectedSlug,
} from "../redux/selectors";
import {
  selectTopic,
  setFilters,
  setGraphEncodingMode,
  setGraphFocus,
  setGroupBy,
  setView,
} from "../redux/slice";
import type { PageIntentItem } from "../types";
import { bandFor, GRAPH_BAND_GEOMETRY, sizeScale, type GraphBand } from "./graph/bands";
import {
  dominantToneOf,
  resolveEncoding,
  sizeValueOf,
  tallyTones,
  type ConvergenceRow,
  type GraphEncodingMode,
} from "./graph/encoding";
import {
  buildFacetAxis,
  facetAxisPositions,
  FACET_AXIS_LAYOUT,
  FACET_AXIS_MORE_ID,
  FACET_AXIS_REVEAL_STEP,
} from "./graph/facetAxis";
import { GraphLegend } from "./graph/GraphLegend";
import { GraphToolbar } from "./graph/GraphToolbar";
import { autoArrangeTopics, layoutTopics, topLeftOf } from "./graph/layout";
import {
  ALL_FACET_VALUE_ID,
  buildGraphModel,
  isBranch,
  visibleTopicIds,
  visibleTopics,
  visibleTreeEdges,
} from "./graph/model";
import { reconcilePosition } from "./graph/reconcile";
import {
  FacetMoreBody,
  FacetValueBody,
  TopicBody,
  type FacetValueNodeBodyData,
  type TopicNodeBodyData,
} from "./graph/nodes";

/**
 * 🚨 THE ONE CONSTANT IN THIS LANE, and deliberately not a knob: text rendered
 * smaller than 9 CSS pixels cannot be read by a person with ordinary sight. It
 * is a LEGIBILITY FLOOR, not a taste — an organization that "prefers" 6px
 * labels is choosing a drawing whose labels are decoration. Below the floor the
 * label is ABSENT (and comes back on hover and on selection in the shape band),
 * never drawn as an unreadable smear.
 *
 * Filed with the coordinator as a request for `graph_label_min_px` if it ever
 * turns out to be a matter of taste after all.
 */
const GRAPH_LABEL_MIN_PX = 9;

/** `seo.list_page_intents` clamps to 1..1000; the convergence rollup takes the lot. */
const PAGE_INTENT_LIMIT = 1000;

/**
 * Whether a label is currently large enough to read. Provided by the canvas
 * (which is the only thing that knows the live zoom) and consumed by the node
 * bodies. It is CONTEXT rather than node `data` on purpose: pushing a value
 * that changes on every zoom frame through `data` would churn the sig-keyed
 * reconcile and rebuild the whole graph while the person is pinching.
 */
const LabelVisibilityContext = createContext(true);

interface TopicFlowData extends Record<string, unknown> {
  band: GraphBand;
  body: TopicNodeBodyData;
}
interface FacetFlowData extends Record<string, unknown> {
  body: FacetValueNodeBodyData;
}
interface FacetMoreFlowData extends Record<string, unknown> {
  remaining: number;
  onReveal: () => void;
}

const HANDLE_CLASS = "!h-2 !w-2 !border-0 !bg-transparent";

function TopicFlowNode({ data, selected }: NodeProps) {
  // MATRX-EXCEPTION: React Flow types `NodeProps.data` as its generic node-data
  // bag (`Record<string, unknown>`), which has no structural overlap with our
  // concrete data, so the two-step cast is required. The shape is set by this
  // file's own node builder below.
  const flow = data as unknown as TopicFlowData;
  const showLabel = useContext(LabelVisibilityContext);
  return (
    <>
      <Handle id="tree" type="target" position={Position.Top} className={HANDLE_CLASS} />
      <Handle id="facet" type="target" position={Position.Left} className={HANDLE_CLASS} />
      <TopicBody
        band={flow.band}
        data={{ ...flow.body, showLabel, selected: selected || flow.body.selected }}
      />
      <Handle type="source" position={Position.Bottom} className={HANDLE_CLASS} />
    </>
  );
}

function FacetFlowNode({ data }: NodeProps) {
  // MATRX-EXCEPTION: same React Flow generic-data-bag cast as TopicFlowNode.
  const flow = data as unknown as FacetFlowData;
  return (
    <>
      <FacetValueBody data={flow.body} />
      <Handle type="source" position={Position.Right} className={HANDLE_CLASS} />
    </>
  );
}

function FacetMoreFlowNode({ data }: NodeProps) {
  // MATRX-EXCEPTION: same React Flow generic-data-bag cast as TopicFlowNode.
  const flow = data as unknown as FacetMoreFlowData;
  return <FacetMoreBody remaining={flow.remaining} onReveal={flow.onReveal} />;
}

const nodeTypes: NodeTypes = {
  topic: TopicFlowNode,
  facetValue: FacetFlowNode,
  facetMore: FacetMoreFlowNode,
};

/**
 * The convergence rollup: which pages have been counted so far, how many there
 * are in total, and which page of the list is being asked for next.
 *
 * It is ONE state object rather than four so that resetting it is one
 * assignment — a reset that leaves the offset behind would ask the new map for
 * page 4,000 of a list that has 12 rows.
 */
interface ConvergenceRollup {
  /** map | site | mode. A change here means "start again". */
  key: string;
  /** The `offset` the current `usePageIntents` call is asking for. */
  offset: number;
  /** `seo.list_page_intents`' own count of the matched set. Null until one lands. */
  total: number | null;
  /** offset → that page's rows. Keyed so a page can never be counted twice. */
  pages: Record<number, ConvergenceRow[]>;
}

function emptyRollup(key: string): ConvergenceRollup {
  return { key, offset: 0, total: null, pages: {} };
}

function countRollupRows(pages: Record<number, ConvergenceRow[]>): number {
  return Object.values(pages).reduce((sum, rows) => sum + rows.length, 0);
}

/** One listed page, as the convergence rollup needs it (round 22 shapes intact). */
function convergenceRowOf(item: PageIntentItem): ConvergenceRow {
  return {
    pageId: item.page.id,
    currentTopicSlugs: item.current_topics.map((topic) => topic.slug),
    intent: item.intent
      ? {
          disposition: item.intent.disposition,
          state: item.intent.state,
          // 🚨 ROUND 22: the key is OMITTED while the intent's topic is not
          // live. Null here means "the decision stands, the destination left".
          topicSlug: item.intent.topic?.slug ?? null,
        }
      : null,
  };
}

function GraphCanvas({ mapId, siteId, host, readOnly }: MapViewProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const links = useMapLinks();
  const { fitView } = useReactFlow();
  const openTopicPanel = useOpenTopicPanel();

  const groupBy = useAppSelector(selectMapGroupBy(mapId));
  const graph = useAppSelector(selectMapGraph(mapId));
  const selectedSlug = useAppSelector(selectMapSelectedSlug(mapId));
  const filters = useAppSelector(selectMapFilters(mapId));

  const { knobs, loading: knobsLoading, error: knobsError } = useTopicalMapKnobs();
  const query = useMapGraph(mapId, groupBy, siteId);
  const setLayout = useSetMapTopicLayout(mapId);

  const [revealedValues, setRevealedValues] = useState(FACET_AXIS_REVEAL_STEP);

  /**
   * The topics THIS SESSION dragged and the server accepted.
   *
   * 🚨 A DRAG THAT LANDED IS A PLACEMENT, even though the graph query does not
   * know it yet: `useSetMapTopicLayout` invalidates `topicRows`, not
   * `topicalMapKeys.graph(...)`, so `query.data` keeps `auto_layout: true` and
   * the topic's OLD position until something else refetches the graph. Without
   * this set, the next recompute — a band change, a regroup, an auto-arrange —
   * walks the node back to where the server last saw it, in front of the person
   * who just moved it. A ref rather than state on purpose: it changes nothing on
   * the screen by itself and must not re-render the canvas mid-drag.
   *
   * Filed with the coordinator: `useSetMapTopicLayout` should also invalidate
   * the graph key on success. When it does, this becomes belt-and-braces rather
   * than the only guard — it stays correct either way.
   */
  const draggedTopicIds = useRef<Set<string>>(new Set());

  // ── The convergence rollup ───────────────────────────────────────────────
  //
  // `seo.list_page_intents` is paged (1..1000 a call) and a map can hold
  // thousands of pages, so the rollup walks the offsets. The pages are kept
  // HERE rather than read back out of the slice because the slice holds the
  // workspace's listed pages — which the pages workspace also writes — and a
  // colour must describe the set this drawing actually counted.
  const mode: GraphEncodingMode = graph.encodingMode;
  const isConvergence = mode === "convergence";
  // The identity of one rollup. A different map, a different site, or leaving
  // the mode is a DIFFERENT rollup — never one map coloured by another's pages.
  const rollupKey = `${mapId}|${siteId ?? ""}|${isConvergence ? "on" : "off"}`;
  const [rollup, setRollup] = useState<ConvergenceRollup>(() => emptyRollup(rollupKey));
  const intents = usePageIntents(
    mapId,
    { siteId, limit: PAGE_INTENT_LIMIT, offset: rollup.offset },
    isConvergence,
  );

  // The accumulator is ADJUSTED DURING RENDER, not in an effect. React
  // documents this for state derived from something that arrived from outside
  // ("You Might Not Need an Effect"): the component re-runs immediately with the
  // new state, before the browser paints, so there is no flash of a stale
  // rollup and no cascading-render warning.
  //
  // `isPlaceholderData` is the guard that makes the reset real: `usePageIntents`
  // keeps the previous map's answer on screen while the new one loads, and
  // accumulating THAT would colour this map with another's pages.
  const landed =
    isConvergence && !intents.isPlaceholderData && intents.data ? intents.data : null;
  let nextRollup = rollup;
  if (rollup.key !== rollupKey) {
    nextRollup = emptyRollup(rollupKey);
  } else if (landed && landed.offset === rollup.offset && !rollup.pages[landed.offset]) {
    const pages = { ...rollup.pages, [landed.offset]: landed.items.map(convergenceRowOf) };
    const loaded = countRollupRows(pages);
    nextRollup = {
      key: rollupKey,
      total: landed.total,
      pages,
      // Walk to the next page only while there is one. `total` is the server's
      // own count of the matched set, not the count of what has arrived.
      offset: loaded < landed.total ? landed.offset + PAGE_INTENT_LIMIT : rollup.offset,
    };
  }
  if (nextRollup !== rollup) setRollup(nextRollup);

  const intentRows: ConvergenceRow[] = Object.values(nextRollup.pages).flat();
  const intentTotal = nextRollup.total;
  const rollupComplete = intentTotal !== null && intentRows.length >= intentTotal;

  // ── The drawing ──────────────────────────────────────────────────────────

  const model = buildGraphModel(query.data);
  const visibleIds = visibleTopicIds(model, graph.focusSlug);
  const topics = visibleTopics(model, visibleIds);
  const treeEdges = visibleTreeEdges(model, visibleIds);
  // `card` while the knobs are still loading is a placeholder for ONE render
  // pass — the drawing itself is not rendered until they land (below), and the
  // hooks above must keep running unconditionally.
  const band: GraphBand = knobs ? bandFor(topics.length, knobs) : "card";
  const geometry = GRAPH_BAND_GEOMETRY[band];
  // The axis is built BEFORE the encoding because the hue legend line names the
  // facet and the number of values on the column — a legend that cannot say
  // where to look is a legend nobody can read.
  const axis = buildFacetAxis(model, visibleIds, revealedValues);
  const encoding = resolveEncoding(knobs?.graph_encoding ?? null, mode, {
    facetLabel: axis.facet,
    valueCount: axis.values.length,
  });

  const positions = layoutTopics({
    topics,
    treeEdges,
    width: geometry.width,
    height: geometry.height,
    nodeSep: geometry.nodeSep,
    rankSep: geometry.rankSep,
    autoLayout: knobs?.graph_auto_layout ?? true,
  });
  const corner = topLeftOf(positions.values());
  const axisPositions = facetAxisPositions(axis, {
    ...FACET_AXIS_LAYOUT,
    topicsLeft: corner.x,
    topicsTop: corner.y,
  });

  const tally = isConvergence ? tallyTones(intentRows) : null;
  const sizeMax = topics.reduce(
    (max, topic) => Math.max(max, sizeValueOf(encoding.size, topic.data)),
    0,
  );

  // The slug the synthetic "no value for this facet" bucket goes by. The axis
  // pill paints itself with `hueBar(value.slug)`, so a topic with no value must
  // hash the SAME string or the legend's "match the bar in the column on the
  // left" would be false for exactly the topics that need it most.
  const allFacetValueSlug =
    model.facetValues.find((value) => value.id === ALL_FACET_VALUE_ID)?.data.slug ??
    ALL_FACET_VALUE_ID;

  const toneColorFor = (slug: string, pageCount: number, plannedCount: number): string | null => {
    if (!tally || !knobs) return null;
    const tone = dominantToneOf(
      { slug, page_count: pageCount, planned_count: plannedCount },
      tally,
    );
    return tone ? knobs.intent_colors[tone] : null;
  };

  const openOutlineFilteredTo = (facet: string, valueSlug: string) => {
    dispatch(
      setFilters({ mapId, filters: { facets: { ...filters.facets, [facet]: valueSlug } } }),
    );
    dispatch(setView({ mapId, view: "outline" }));
    // On the page host the views are ROUTES, so the dispatch alone would change
    // the store and leave the person looking at the graph. The link comes from
    // `links.tsx`; a map URL is never hand-built.
    if (host === "page") router.push(links.mapView(mapId, "outline", siteId));
  };

  const buildFlowNodes = (previous: Node[]): Node[] => {
    const previousById = new Map(previous.map((node) => [node.id, node]));
    const topicNodes: Node[] = topics.map((topic) => {
      const kept = previousById.get(topic.id);
      const data = topic.data;
      const color = toneColorFor(data.slug, data.page_count, data.planned_count);
      const body: TopicNodeBodyData = {
        slug: data.slug,
        name: data.name,
        status: data.status,
        depth: data.depth,
        pageCount: data.page_count,
        plannedCount: data.planned_count,
        keywordCount: data.keyword_count,
        fillTone: encoding.fill === "status" ? "status" : null,
        convergenceColor: color,
        ringTier: encoding.ring === "tier" ? data.depth : null,
        hueKey:
          encoding.hue === "grouped_facet" && model.groupBy
            ? (data.facets[model.groupBy] ?? allFacetValueSlug)
            : null,
        scale:
          encoding.size === "none"
            ? 1
            : sizeScale(sizeValueOf(encoding.size, data), sizeMax),
        selected: selectedSlug === data.slug,
        // Filled from the zoom context inside the node component.
        showLabel: true,
      };
      // MATRX-EXCEPTION: React Flow's generic node-data bag again — the band on
      // the kept node is the one this file wrote there on the previous build.
      const keptBand = kept ? (kept.data as unknown as TopicFlowData).band : null;
      return {
        id: topic.id,
        type: "topic",
        // WHICH POSITION SURVIVES A REBUILD — the rule, and why, is
        // `graph/reconcile.ts`. A stored layout or a drag this session is the
        // person's own placement and is kept in every band; anything else is
        // kept only while the geometry it was computed in is still on screen.
        position: reconcilePosition({
          kept: kept ? { position: kept.position, band: keptBand ?? null } : null,
          band,
          computed: positions.get(topic.id) ?? topic.position,
          placed: data.auto_layout === false || draggedTopicIds.current.has(topic.id),
        }),
        zIndex: kept?.zIndex,
        draggable: !readOnly,
        data: { band, body } as unknown as Record<string, unknown>,
      };
    });

    const facetNodes: Node[] = axis.values.map((value) => ({
      id: value.id,
      type: "facetValue",
      // 🚨 A FACET POSITION IS COMPUTED EVERY RENDER AND NEVER PERSISTED — it
      // is not `kept?.position`, because a facet value has no `layout` column
      // and dragging one would mean nothing.
      position: axisPositions.get(value.id) ?? { x: corner.x, y: corner.y },
      draggable: false,
      data: {
        body: {
          value,
          facetLabel: axis.facet ?? "grouped",
          onFilter: () => openOutlineFilteredTo(value.facet, value.slug),
        },
      } as unknown as Record<string, unknown>,
    }));

    if (axis.hiddenCount > 0) {
      facetNodes.push({
        id: FACET_AXIS_MORE_ID,
        type: "facetMore",
        position: axisPositions.get(FACET_AXIS_MORE_ID) ?? { x: corner.x, y: corner.y },
        draggable: false,
        data: {
          remaining: axis.hiddenCount,
          onReveal: () => setRevealedValues((count) => count + FACET_AXIS_REVEAL_STEP),
        } as unknown as Record<string, unknown>,
      });
    }

    return [...facetNodes, ...topicNodes];
  };

  const buildFlowEdges = (): Edge[] => {
    const shownValueIds = new Set(axis.values.map((value) => value.id));
    const tree: Edge[] = treeEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      targetHandle: "tree",
      type: "smoothstep",
    }));
    // An edge to a value the cap is holding back is NOT DRAWN — a line into
    // nothing is worse than no line. The "+N more" node is what says they exist.
    const facet: Edge[] = model.facetEdges
      .filter((edge) => visibleIds.has(edge.target) && shownValueIds.has(edge.source))
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        targetHandle: "facet",
        type: "smoothstep",
        className: "topical-map-facet-edge",
      }));
    return [...tree, ...facet];
  };

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const zSeq = useRef(1);

  // The content signature the reconcile is keyed on — NOT every render, and
  // NOT the query object's identity. Same shape as the orchestra canvas: a
  // drag must never rebuild the whole graph.
  const signature = [
    band,
    graph.focusSlug ?? "",
    selectedSlug ?? "",
    model.groupBy ?? "",
    mode,
    encoding.size,
    encoding.fill,
    encoding.ring,
    encoding.hue,
    axis.values.length,
    axis.hiddenCount,
    readOnly ? "ro" : "rw",
    topics
      .map((topic) => {
        const data = topic.data;
        const color = toneColorFor(data.slug, data.page_count, data.planned_count) ?? "";
        return `${topic.id}:${data.name}:${data.status}:${data.page_count}:${data.planned_count}:${data.keyword_count}:${color}`;
      })
      .join("|"),
  ].join("#");

  useEffect(() => {
    setNodes((current) => buildFlowNodes(current));
    setEdges(buildFlowEdges());
    // Keyed on the content signature — see the comment above `signature`.
  }, [signature]);

  // Re-frame after a focus change: the person clicked into a branch and the
  // drawing must show that branch, not the corner of the old one. Two frames,
  // so the new positions have painted before the fit is measured.
  const focusSlug = graph.focusSlug;
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => fitView({ padding: 0.2, duration: 300 }));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [focusSlug, band, fitView]);

  // THE LEGIBILITY FLOOR. The live zoom lives in the flow store; the selector
  // returns a BOOLEAN, so this only re-renders when a label crosses the floor
  // rather than on every frame of a pinch.
  const labelsVisible = useStore(
    (state) => state.transform[2] * geometry.fontPx >= GRAPH_LABEL_MIN_PX,
  );

  const bringToFront = (id: string) => {
    zSeq.current += 1;
    const z = zSeq.current;
    setNodes((current) => current.map((node) => (node.id === id ? { ...node, zIndex: z } : node)));
  };

  // ── Honest states, in the order a person meets them ──────────────────────

  if (knobsLoading) return <TopicalMapLoading what="this map drawing's settings" />;
  if (knobsError || !knobs) {
    return <TopicalMapFailed what="the map drawing's settings" error={knobsError} />;
  }
  if (query.isPending) return <TopicalMapLoading what="the map drawing" />;
  if (query.isError) return <TopicalMapFailed what="the map drawing" error={query.error} />;
  if (model.topics.length === 0) {
    return (
      <TopicalMapEmpty
        title="There is nothing to draw yet"
        detail="This map has no live or proposed topics, so the drawing has no shape to show. Retired and rejected topics are deliberately never drawn — they are in the history screen."
        action={
          <p className="text-sm text-muted-foreground">
            Add a topic, or run the map builder, and the drawing appears here.
          </p>
        }
      />
    );
  }

  return (
    <div className="min-h-0 flex-1">
      <LabelVisibilityContext.Provider value={labelsVisible}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStart={(_event, node) => bringToFront(node.id)}
          onNodeClick={(_event, node) => {
            bringToFront(node.id);
            const topic = model.topicById.get(node.id);
            if (!topic) return;
            dispatch(selectTopic({ mapId, slug: topic.data.slug }));
            // 🚨 ONLY A BRANCH RE-FRAMES THE DRAWING (vision §2.2). Focusing a
            // LEAF draws one card in an empty canvas and takes the person's
            // place away for nothing — a leaf has no inside to show. Selecting
            // it and opening its panel is what the click was actually asking
            // for, and both still happen.
            if (isBranch(model, node.id)) {
              dispatch(setGraphFocus({ mapId, slug: topic.data.slug }));
            }
            openTopicPanel({ mapId, slug: topic.data.slug, siteId });
          }}
          onNodeDragStop={(_event, node) => {
            if (readOnly) return;
            const topic = model.topicById.get(node.id);
            if (!topic) return;
            setLayout.mutate(
              {
                topicId: topic.id,
                slug: topic.data.slug,
                layout: { x: node.position.x, y: node.position.y },
              },
              {
                // The write landed: this topic is PLACED for the rest of the
                // session, whatever the graph query still says about it.
                onSuccess: () => {
                  draggedTopicIds.current.add(topic.id);
                },
                // The hook has already rolled the optimistic move back; the
                // person is owed the database's OWN sentence for why.
                onError: (error) => toast.error(topicalMapErrorText(error)),
              },
            );
          }}
          nodesDraggable={!readOnly}
          nodesConnectable={false}
          edgesFocusable={false}
          deleteKeyCode={null}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          className="topical-map-graph bg-textured"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="opacity-50" />
          <Controls showInteractive={false} className="!shadow-md" />
          <MiniMap pannable zoomable ariaLabel="A small map of the whole drawing" />
          <Panel position="top-left" className="!right-0 flex flex-wrap items-start justify-between gap-2">
            <GraphToolbar
              mapId={mapId}
              focusSlug={graph.focusSlug}
              focusName={
                graph.focusSlug
                  ? (model.topicBySlug.get(graph.focusSlug)?.data.name ?? null)
                  : null
              }
              onClearFocus={() => dispatch(setGraphFocus({ mapId, slug: null }))}
              groupBy={groupBy}
              onGroupByChange={(next) => dispatch(setGroupBy({ mapId, groupBy: next }))}
              onAutoArrange={() => {
                // VIEW STATE ONLY — fifty layout writes because somebody wanted
                // to see the tree straightened is not an arrangement anybody
                // asked to keep.
                const arranged = autoArrangeTopics({
                  topics,
                  treeEdges,
                  width: geometry.width,
                  height: geometry.height,
                  nodeSep: geometry.nodeSep,
                  rankSep: geometry.rankSep,
                  autoLayout: true,
                });
                setNodes((current) =>
                  current.map((node) => {
                    const next = arranged.get(node.id);
                    return next ? { ...node, position: next } : node;
                  }),
                );
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => fitView({ padding: 0.2, duration: 300 })),
                );
              }}
              band={band}
              visibleCount={topics.length}
              readOnly={readOnly}
            />
            <GraphLegend
              encoding={encoding}
              mode={mode}
              onModeChange={(mode) => dispatch(setGraphEncodingMode({ mapId, mode }))}
              colors={knobs.intent_colors}
              progress={{
                loaded: intentRows.length,
                total: intentTotal,
                complete: rollupComplete,
              }}
              skipped={{ nodes: model.skippedNodes, edges: model.skippedEdges }}
            />
          </Panel>
          {intents.isError ? (
            <Panel position="bottom-center">
              <div className="max-w-[420px]">
                <TopicalMapFailed what="the pages this map covers" error={intents.error} />
              </div>
            </Panel>
          ) : null}
        </ReactFlow>
      </LabelVisibilityContext.Provider>
    </div>
  );
}

export default function GraphViewImpl(props: MapViewProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}
