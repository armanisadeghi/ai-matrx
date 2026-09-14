"use client";

/**
 * OFFERINGS — what this brand sells, and what THIS site offers of it.
 *
 * On the canonical model of the brand-offerings cutover
 * (docs/db_rebuild/proposals/brand-offerings-cutover.md):
 *   D1  the brand owns its offerings (`web.brand_offering`)
 *   D2  a site offers only what it explicitly selects (`web.site_offering`)
 *   D3  the parent-child tree is the brand's catalog, never distribution
 *   D6  platform suggestions appear only inside Add offering, copied on adopt
 *   D9  worth is this site's own ruling, in points
 *
 * Arranged as the argument it makes: the strip says how much of this site's
 * demand already lands on something it sells (every number filters the table
 * or opens its list); the table is where the site chooses and rules; the two
 * keyword tables below are the work still owed.
 *
 * Data: ./data.ts only (every read and write is in THE CONTRACT,
 * features/marketing/FEATURE.md § Canonical offering writers).
 */

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeDollarSign,
  CircleDollarSign,
  CircleHelp,
  GitBranchPlus,
  MousePointerClick,
  PanelTop,
  Pencil,
  Store,
  UserCheck,
} from "lucide-react";
import type { CellEditsMap } from "@ai-matrx/design-system/data-table/types";
import { commitUrlParams, useUrlSearchParams } from "@ai-matrx/kit/url-state";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/styles/themes/utils";
import { TableLoadingComponent } from "@/components/matrx/LoadingComponents";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { useOpenGscDrilldownWindow } from "@/features/overlays/openers/gscDrilldownWindow";
import { formatCount } from "@/features/marketing/search-console/types";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { fetchFeatureKnobValues } from "@/features/admin/limits/service";
import { getValueVocabulary } from "../data";
import { buildBandMeta, reviewWindow } from "../lib";
import { ApprovalQueue } from "../approvals/ApprovalQueue";
// The two keyword tables and the placement strip are already the canonical
// keyword table over this site's own placements; they move beside this file
// when the legacy topics folder is retired.
import { ProposedQueue } from "../topics/ProposedQueue";
import { UnplacedQueue } from "../topics/UnplacedQueue";
import { TopicPlacementStrip } from "../topics/TopicPlacementStrip";
import { getTopicPlacementStatus } from "../topics/data";
import {
  adoptOfferingTemplate,
  getOfferingStats,
  listBrandOfferingCatalog,
  moveBrandOffering,
  removeSiteOffering,
  saveSiteOffering,
  setOfferingWorth,
  setSiteOfferingAvailability,
  type AvailabilityChange,
  type CatalogOffering,
} from "./data";
import {
  buildCatalogTree,
  forbiddenParents,
  lineageOf,
  resolveOfferingLink,
  tallyByOffering,
  type CatalogNode,
  type CatalogRow,
} from "./catalog-tree";
import {
  CATALOG_TABLE_ID,
  OfferingCatalogTable,
  type CatalogRowActions,
} from "./OfferingCatalogTable";
import { AddOfferingDialog, type AddOfferingChoice } from "./AddOfferingDialog";
import { OfferingEditDialog, type OfferingEditDraft } from "./OfferingEditDialog";
import { OfferingWorthDialog, type OfferingWorthValues } from "./OfferingWorthDialog";
import { StopOfferingDialog } from "./StopOfferingDialog";
import { RemoveOfferingDialog } from "./RemoveOfferingDialog";
import { LEAD_QUALITY_OPTIONS, OFFERING_KIND_META, OFFERING_MATCH_OPTIONS } from "./vocabulary";

const OFFERINGS_KEY = ["seo", "offerings"] as const;

type StripTarget = "offered" | "not-offered" | "valued" | "placed" | "clicks" | "proposals" | "unplaced";

function parseStripTarget(value: string | null): StripTarget | null {
  switch (value) {
    case "offered":
    case "not-offered":
    case "valued":
    case "placed":
    case "clicks":
    case "proposals":
    case "unplaced":
      return value;
    default:
      return null;
  }
}

export function OfferingsWorkbench() {
  const { site, brandId } = useMarketingSite();
  const siteId = site.id;
  const organizationId = site.organization_id;
  const searchParams = useUrlSearchParams();
  const queryClient = useQueryClient();
  const openDrilldown = useOpenGscDrilldownWindow();
  const window28 = reviewWindow();

  /**
   * `?offering=<id>[&worth=1]` is the door every value receipt opens. A saved
   * link from before the cutover says `?topic=<id>`; a product/service topic id
   * is its suggestion's id, so it lands on the brand's copy of it.
   */
  const focusId = searchParams.get("offering") ?? searchParams.get("topic");
  const focusWorth = searchParams.get("worth") === "1";
  const activeStrip = parseStripTarget(searchParams.get("offerings-focus"));

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [editDraft, setEditDraft] = useState<OfferingEditDraft | null>(null);
  const [worthNode, setWorthNode] = useState<CatalogNode | null>(null);
  const [stopping, setStopping] = useState<{ id: string; name: string }[] | null>(null);
  const [removing, setRemoving] = useState<CatalogOffering | null>(null);
  const contextNodeRef = useRef<CatalogNode | null>(null);
  const tableSectionRef = useRef<HTMLDivElement | null>(null);
  const proposalSectionRef = useRef<HTMLDivElement | null>(null);
  const unplacedSectionRef = useRef<HTMLDivElement | null>(null);

  // ── Reads ─────────────────────────────────────────────────────────────────
  const catalog = useQuery({
    queryKey: [...OFFERINGS_KEY, "catalog", siteId],
    queryFn: ({ signal }) => listBrandOfferingCatalog(siteId, signal),
  });
  const stats = useQuery({
    queryKey: [...OFFERINGS_KEY, "stats", siteId, window28.start, window28.end],
    queryFn: ({ signal }) => getOfferingStats(siteId, window28.start, window28.end, signal),
  });
  const vocab = useQuery({
    queryKey: ["seo", "value", "vocab", siteId, "value_band"],
    queryFn: ({ signal }) => getValueVocabulary(siteId, "value_band", signal),
  });
  const placementKnobs = useQuery({
    queryKey: ["marketing", "gsc", "placement-knobs"],
    queryFn: () => fetchFeatureKnobValues("seo.topic_placement"),
    staleTime: 5 * 60 * 1000,
  });
  const minPlacementImpressions = Number(placementKnobs.data?.min_impressions ?? 0);
  const placementStatus = useQuery({
    queryKey: [...OFFERINGS_KEY, "placement-status", siteId, minPlacementImpressions],
    queryFn: ({ signal }) => getTopicPlacementStatus(siteId, minPlacementImpressions, signal),
    enabled: placementKnobs.isSuccess,
    staleTime: 30 * 1000,
  });

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: OFFERINGS_KEY }),
    queryClient.invalidateQueries({ queryKey: ["seo", "keyword-offerings"] }),
    queryClient.invalidateQueries({ queryKey: ["marketing", "gsc"] }),
  ]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const offerings = catalog.data ?? [];
  const tree = buildCatalogTree(offerings, tallyByOffering(stats.data ?? []));
  const metas = buildBandMeta(vocab.data ?? []);
  const offeredCount = offerings.filter((offering) => offering.available).length;
  const valuedCount = offerings.filter((offering) => offering.worthPoints !== null).length;
  const placedKeywords = [...tree.byId.values()].reduce((sum, node) => sum + node.own.keywords, 0);
  const placedClicks = [...tree.byId.values()].reduce((sum, node) => sum + node.own.clicks, 0);

  // Land ON the linked offering once the catalog has loaded.
  const focusedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId || catalog.isPending) return;
    if (focusedRef.current === focusId) return;
    const target = resolveOfferingLink(offerings, focusId);
    focusedRef.current = focusId;
    if (!target) {
      toast.error("That offering is not in this brand", {
        description: "The link points at an offering this brand does not have. Showing every offering instead.",
      });
      return;
    }
    const node = tree.byId.get(target.id);
    const ancestors = lineageOf(tree, target.id).map((offering) => offering.id);
    let scrollFrame = 0;
    const frame = requestAnimationFrame(() => {
      setCollapsed((current) => {
        const next = new Set(current);
        for (const id of ancestors) next.delete(id);
        return next;
      });
      setSelectedId(target.id);
      if (focusWorth && node && target.available) setWorthNode(node);
      scrollFrame = requestAnimationFrame(() => {
        document.querySelector(`[data-row-id="${target.id}"]`)?.scrollIntoView({ block: "center" });
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(scrollFrame);
    };
  }, [focusId, focusWorth, catalog.isPending, offerings, tree]);

  useEffect(() => {
    const target =
      activeStrip === "proposals"
        ? proposalSectionRef.current
        : activeStrip === "unplaced"
          ? unplacedSectionRef.current
          : activeStrip
            ? tableSectionRef.current
            : null;
    if (!target) return;
    const frame = window.requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [activeStrip]);

  const selectStrip = (target: StripTarget) => {
    const filters =
      target === "offered"
        ? { offeredHere: { kind: "select", value: "yes" } }
        : target === "not-offered"
          ? { offeredHere: { kind: "select", value: "no" } }
          : target === "valued"
            ? { worthPoints: { kind: "number", min: -1_000_000_000 } }
            : target === "placed"
              ? { keywordsBranch: { kind: "number", min: 1 } }
              : target === "clicks"
                ? { clicks: { kind: "number", min: 1 } }
                : null;
    commitUrlParams(
      {
        "offerings-focus": target,
        ...(filters ? { [`table.${CATALOG_TABLE_ID}.f`]: JSON.stringify(filters) } : {}),
      },
      "push",
    );
  };

  // ── Writes ────────────────────────────────────────────────────────────────
  const failed = (action: string) => (error: unknown) =>
    toast.error(`Could not ${action}`, { description: extractErrorMessage(error) });

  const availability = useMutation({
    mutationFn: (input: { ids: string[]; offered: boolean; reason: string | null }) =>
      setSiteOfferingAvailability({
        organizationId,
        siteId,
        offeringIds: input.ids,
        available: input.offered,
        reason: input.reason,
      }),
    onSuccess: (changes, input) => {
      setStopping(null);
      setSelectedIds([]);
      void refresh();
      toast.success(availabilityReceipt(changes, input.offered));
    },
    onError: failed("change what this site offers"),
  });

  const move = useMutation({
    mutationFn: (input: { offeringId: string; parentId: string | null; siblingOrder: string[] }) =>
      moveBrandOffering({ organizationId, siteId, ...input }),
    onSuccess: () => {
      void refresh();
      toast.success("Offering moved", { description: "Its whole branch moved with it, in this brand's catalog." });
    },
    onError: failed("move that offering"),
  });

  const save = useMutation({
    mutationFn: (draft: OfferingEditDraft) =>
      saveSiteOffering({
        organizationId,
        siteId,
        offeringId: draft.offeringId,
        name: draft.name,
        kind: draft.kind,
        description: draft.description,
        parentId: draft.parentId,
      }),
    onSuccess: (id, draft) => {
      setEditDraft(null);
      setSelectedId(id);
      void refresh();
      toast.success(draft.offeringId ? "Offering saved" : `“${draft.name}” added and offered here`);
    },
    onError: failed("save that offering"),
  });

  const worth = useMutation({
    mutationFn: (input: { offeringId: string; values: OfferingWorthValues | null }) =>
      setOfferingWorth({
        organizationId,
        siteId,
        offeringId: input.offeringId,
        worthPoints: input.values?.worthPoints ?? null,
        leadQuality: input.values?.leadQuality ?? null,
        offeringMatch: input.values?.offeringMatch ?? null,
        notes: input.values?.notes ?? null,
        clear: input.values === null,
      }),
    onSuccess: (_id, input) => {
      setWorthNode(null);
      void refresh();
      toast.success(input.values ? "Worth saved" : "Ruling removed", {
        description: input.values
          ? "Every keyword on this offering, and beneath it without a ruling, is valued from it."
          : "Its keywords now take the nearest ruling above it, or the baseline.",
      });
    },
    onError: failed("save that offering's worth"),
  });

  const add = useMutation({
    mutationFn: async (choice: AddOfferingChoice): Promise<string> => {
      const id =
        choice.mode === "template"
          ? await adoptOfferingTemplate({ organizationId, siteId, templateId: choice.templateId })
          : choice.mode === "custom"
            ? await saveSiteOffering({ organizationId, siteId, name: choice.name, kind: choice.kind })
            : choice.offeringId;
      // Offering it here (for an offering the brand already had) and keeping the
      // person's reason both go through THE availability writer.
      if (choice.mode === "existing" || choice.reason.trim()) {
        await setSiteOfferingAvailability({
          organizationId,
          siteId,
          offeringIds: [id],
          available: true,
          reason: choice.reason,
        });
      }
      return id;
    },
    onSuccess: (id, choice) => {
      setAdding(false);
      setSelectedId(id);
      focusedRef.current = null;
      void refresh();
      toast.success(
        choice.mode === "template"
          ? `Copied “${choice.name}” into this brand and offered it here`
          : choice.mode === "custom"
            ? `“${choice.name}” added to this brand and offered here`
            : `“${choice.name}” is offered on this site again`,
        { description: "Set what it's worth here from its row." },
      );
    },
    onError: failed("add that offering"),
  });

  const remove = useMutation({
    mutationFn: (input: { offeringId: string; replacementOfferingId: string | null }) =>
      removeSiteOffering({ organizationId, siteId, ...input }),
    onSuccess: (result) => {
      const name = removing?.name ?? "The offering";
      setRemoving(null);
      setSelectedId(null);
      void refresh();
      toast.success(`${name} removed from this brand`, {
        description:
          result.keywordsReassigned > 0
            ? `${formatCount(result.keywordsReassigned)} keyword placements moved to the offering you chose.`
            : "Its keywords on this site are unplaced.",
      });
    },
    onError: failed("remove that offering"),
  });

  const busy =
    availability.isPending || move.isPending || save.isPending || worth.isPending || add.isPending || remove.isPending;

  // ── Actions ───────────────────────────────────────────────────────────────
  const nearestRuledAncestor = (node: CatalogNode): CatalogNode | null => {
    const chain = lineageOf(tree, node.offering.id).slice(0, -1).reverse();
    const ruled = chain.find((offering) => offering.worthPoints !== null);
    return ruled ? (tree.byId.get(ruled.id) ?? null) : null;
  };

  const actions: CatalogRowActions = {
    onToggleOffered: (node, offered) => {
      if (offered) {
        availability.mutate({ ids: [node.offering.id], offered: true, reason: null });
      } else {
        setStopping([{ id: node.offering.id, name: node.offering.name }]);
      }
    },
    onBulkAvailability: (ids, offered) => {
      if (offered) {
        const toOffer = ids.filter((id) => tree.byId.get(id)?.offering.available === false);
        if (toOffer.length === 0) {
          toast.info("This site already offers every selected offering.");
          return;
        }
        availability.mutate({ ids: toOffer, offered: true, reason: null });
        return;
      }
      const toStop = ids
        .map((id) => tree.byId.get(id)?.offering)
        .filter((offering): offering is CatalogOffering => Boolean(offering?.available))
        .map((offering) => ({ id: offering.id, name: offering.name }));
      if (toStop.length === 0) {
        toast.info("None of the selected offerings is offered on this site.");
        return;
      }
      setStopping(toStop);
    },
    onSetWorth: (node) => {
      if (!node.offering.available) {
        toast.info(`Offer “${node.offering.name}” on this site first`, {
          description: "A site values only what it offers.",
        });
        return;
      }
      setWorthNode(node);
    },
    onEdit: (node) =>
      setEditDraft({
        offeringId: node.offering.id,
        name: node.offering.name,
        kind: node.offering.kind,
        description: node.offering.description ?? "",
        parentId: node.offering.parentId,
      }),
    onAddChild: (node) =>
      setEditDraft({ offeringId: null, name: "", kind: node.offering.kind, description: "", parentId: node.offering.id }),
    onViewKeywords: (node) =>
      openDrilldown({
        siteId,
        siteName: site.domain,
        dimension: "query",
        filters: { offering: node.offering.id },
        title: `Keywords in ${node.offering.name}`,
      }),
    onRemove: (node) => setRemoving(node.offering),
    onMove: (node, parentId, siblingOrder) =>
      move.mutate({ offeringId: node.offering.id, parentId, siblingOrder }),
  };

  const saveTableEdits = async (edits: CellEditsMap, tableRows: CatalogRow[]) => {
    const rowsById = new Map(tableRows.map((row) => [row.id, row]));
    const kinds = new Set<string>(OFFERING_KIND_META.map((entry) => entry.value));
    const matches = new Set<string>(OFFERING_MATCH_OPTIONS.map((entry) => entry.value));
    const leads = new Set<string>(LEAD_QUALITY_OPTIONS.map((entry) => entry.value));
    for (const [rowId, fields] of Object.entries(edits)) {
      const row = rowsById.get(rowId);
      const node = tree.byId.get(rowId);
      if (!row || !node) throw new Error("That offering is no longer in this brand.");
      const o = node.offering;

      if (Object.hasOwn(fields, "name") || Object.hasOwn(fields, "kind")) {
        const name = Object.hasOwn(fields, "name") ? fields.name : o.name;
        const kind = Object.hasOwn(fields, "kind") ? fields.kind : o.kind;
        if (typeof name !== "string" || !name.trim()) throw new Error("Every offering needs a name.");
        if (typeof kind !== "string" || !kinds.has(kind)) throw new Error("An offering is a product or a service.");
        await saveSiteOffering({
          organizationId,
          siteId,
          offeringId: o.id,
          name: name.trim(),
          kind: kind === "product" ? "product" : "service",
          description: o.description,
          parentId: o.parentId,
        });
      }

      const changesWorth = Object.hasOwn(fields, "worthPoints");
      const changesMatch = Object.hasOwn(fields, "offeringMatch");
      const changesLead = Object.hasOwn(fields, "leadQuality");
      if (changesWorth || changesMatch || changesLead) {
        if (!o.available) {
          throw new Error(`Offer “${o.name}” on this site before valuing it here.`);
        }
        const points = changesWorth ? fields.worthPoints : o.worthPoints;
        if (points === null || points === undefined || points === "") {
          throw new Error(
            `Set the points for “${o.name}” first — a lead quality or match is part of this site's worth ruling.`,
          );
        }
        if (typeof points !== "number" || !Number.isFinite(points)) {
          throw new Error("Worth is a number of points, and may be negative.");
        }
        const match = changesMatch ? fields.offeringMatch : o.offeringMatch;
        const lead = changesLead ? fields.leadQuality : o.leadQuality;
        if (match !== null && (typeof match !== "string" || !matches.has(match))) {
          throw new Error("Choose one of the listed answers for “Do you do this?”.");
        }
        if (lead !== null && (typeof lead !== "string" || !leads.has(lead))) {
          throw new Error("Choose one of the listed lead qualities.");
        }
        await setOfferingWorth({
          organizationId,
          siteId,
          offeringId: o.id,
          worthPoints: points,
          offeringMatch: match,
          leadQuality: lead,
          notes: o.worthNotes,
        });
      }
    }
    await refresh();
  };

  const runContextAction = (action: "onSetWorth" | "onEdit" | "onAddChild" | "onViewKeywords") => {
    const node = contextNodeRef.current;
    if (node) actions[action](node);
  };

  const loading = catalog.isPending || stats.isPending;
  const error = catalog.error ?? stats.error;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain bg-textured p-3">
      <OfferingStrip
        loading={loading}
        total={offerings.length}
        offered={offeredCount}
        valued={valuedCount}
        placedKeywords={placedKeywords}
        placedClicks={placedClicks}
        proposals={placementStatus.data?.proposals_pending ?? null}
        unplaced={
          placementStatus.data
            ? Math.max(placementStatus.data.queue_pending - placementStatus.data.queue_deferred, 0)
            : null
        }
        windowLabel={`${window28.start} → ${window28.end}`}
        active={activeStrip}
        onSelect={selectStrip}
      />

      <div ref={tableSectionRef} className="scroll-mt-3">
        {loading ? (
          <TableLoadingComponent />
        ) : error ? (
          <InlineQueryError
            what="this brand's offerings"
            error={error}
            onRetry={() => {
              void catalog.refetch();
              void stats.refetch();
            }}
          />
        ) : (
          <OfferingCatalogTable
            tree={tree}
            metas={metas}
            collapsed={collapsed}
            selectedId={selectedId}
            selectedIds={selectedIds}
            busy={busy}
            actions={actions}
            onToggle={(id) =>
              setCollapsed((current) => {
                const next = new Set(current);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onSelect={(id) => setSelectedId(id === selectedId ? null : id)}
            onSelectedIdsChange={setSelectedIds}
            onAdd={() => setAdding(true)}
            onSaveEdits={saveTableEdits}
            wrapTable={(table) => (
              <NonEditableContextMenu
                sourceFeature="marketing"
                menuVersion={1}
                contextData={{ content: "" }}
                resolveContextOnOpen={(target) => {
                  const id = target?.closest("[data-row-id]")?.getAttribute("data-row-id");
                  const node = id ? (tree.byId.get(id) ?? null) : null;
                  contextNodeRef.current = node;
                  if (!node) return null;
                  setSelectedId(node.offering.id);
                  return {
                    content: [
                      node.offering.name,
                      node.offering.available ? "offered on this site" : "not offered on this site",
                      `${node.subtree.keywords.toLocaleString()} keywords`,
                      `${node.subtree.clicks.toLocaleString()} clicks`,
                      node.effectivePoints === null ? "no worth ruling" : `worth ${node.effectivePoints} points`,
                    ].join(" · "),
                    offering_id: node.offering.id,
                    offering_name: node.offering.name,
                    offered_here: node.offering.available,
                    keyword_count: node.subtree.keywords,
                    clicks: node.subtree.clicks,
                  };
                }}
                extraSections={[
                  {
                    id: "offering-actions",
                    label: "Offering",
                    items: [
                      {
                        kind: "item",
                        id: "offering-view-keywords",
                        label: "See keywords in this branch",
                        icon: PanelTop,
                        onSelect: () => runContextAction("onViewKeywords"),
                      },
                      {
                        kind: "item",
                        id: "offering-set-worth",
                        label: "Set what it's worth here…",
                        icon: CircleDollarSign,
                        onSelect: () => runContextAction("onSetWorth"),
                      },
                      {
                        kind: "item",
                        id: "offering-edit",
                        label: "Edit name, kind or place…",
                        icon: Pencil,
                        onSelect: () => runContextAction("onEdit"),
                      },
                      {
                        kind: "item",
                        id: "offering-add-child",
                        label: "Add an offering beneath this…",
                        icon: GitBranchPlus,
                        onSelect: () => runContextAction("onAddChild"),
                      },
                    ],
                  },
                ]}
              >
                {table}
              </NonEditableContextMenu>
            )}
          />
        )}
      </div>

      {tree.orphaned.length > 0 ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-warning">
          {tree.orphaned.length} offering{tree.orphaned.length === 1 ? "" : "s"} point at a parent that is no
          longer in this brand; they are drawn at the top level so nothing is hidden. Move them where they
          belong.
        </p>
      ) : null}

      {placementStatus.error ? (
        <InlineQueryError
          what="the keyword placement status"
          error={placementStatus.error}
          onRetry={() => void placementStatus.refetch()}
        />
      ) : placementStatus.data ? (
        <TopicPlacementStrip
          siteId={siteId}
          siteName={site.domain}
          status={placementStatus.data}
          minImpressions={minPlacementImpressions}
          onPassFinished={() => void refresh()}
        />
      ) : null}

      <ApprovalQueue
        scope={{ siteId, brandId, organizationId, siteLabel: site.domain }}
        kinds={["placement_drift"]}
        title="Placements the assigner moved"
        defaultExpanded
      />

      <div ref={proposalSectionRef} className="scroll-mt-3">
        <ProposedQueue siteId={siteId} siteDomain={site.domain} brandId={brandId} onChanged={() => void refresh()} />
      </div>

      <div ref={unplacedSectionRef} className="scroll-mt-3">
        <UnplacedQueue siteId={siteId} siteDomain={site.domain} brandId={brandId} onChanged={() => void refresh()} />
      </div>

      {adding ? (
        <AddOfferingDialog
          siteId={siteId}
          catalog={offerings}
          busy={add.isPending}
          onCancel={() => setAdding(false)}
          onChoose={(choice) => add.mutate(choice)}
        />
      ) : null}

      {editDraft ? (
        <OfferingEditDialog
          draft={editDraft}
          catalog={offerings}
          forbiddenParentIds={
            editDraft.offeringId ? forbiddenParents(tree, editDraft.offeringId) : new Set<string>()
          }
          busy={save.isPending}
          onCancel={() => setEditDraft(null)}
          onSave={(values) => save.mutate(values)}
        />
      ) : null}

      {worthNode ? (
        <OfferingWorthDialog
          node={worthNode}
          inheritedFrom={nearestRuledAncestor(worthNode)}
          busy={worth.isPending}
          onCancel={() => setWorthNode(null)}
          onSave={(values) => worth.mutate({ offeringId: worthNode.offering.id, values })}
          onClear={() => worth.mutate({ offeringId: worthNode.offering.id, values: null })}
        />
      ) : null}

      {stopping ? (
        <StopOfferingDialog
          siteId={siteId}
          offerings={stopping}
          busy={availability.isPending}
          onCancel={() => setStopping(null)}
          onConfirm={(reason) =>
            availability.mutate({ ids: stopping.map((entry) => entry.id), offered: false, reason })
          }
        />
      ) : null}

      {removing ? (
        <RemoveOfferingDialog
          siteId={siteId}
          offering={removing}
          replacements={offerings.filter((offering) => offering.available)}
          busy={remove.isPending}
          onCancel={() => setRemoving(null)}
          onRemove={(replacementOfferingId) =>
            remove.mutate({ offeringId: removing.id, replacementOfferingId })
          }
        />
      ) : null}
    </div>
  );
}

function availabilityReceipt(changes: AvailabilityChange[], offered: boolean): string {
  const changed = changes.filter((change) => change.changed).length;
  if (offered) {
    const restored = changes.reduce((sum, change) => sum + change.placementsRestored, 0);
    const worthBack = changes.reduce((sum, change) => sum + change.worthRestored, 0);
    return (
      `${formatCount(changed)} offering${changed === 1 ? "" : "s"} now offered on this site` +
      (restored > 0 ? ` · ${formatCount(restored)} keyword placements restored` : "") +
      (worthBack > 0 ? ` · ${formatCount(worthBack)} worth ruling${worthBack === 1 ? "" : "s"} restored` : "")
    );
  }
  const removed = changes.reduce((sum, change) => sum + change.placementsRemoved, 0);
  return (
    `${formatCount(changed)} offering${changed === 1 ? "" : "s"} no longer offered on this site` +
    (removed > 0 ? ` · ${formatCount(removed)} keyword placements set aside until it is offered again` : "")
  );
}

function OfferingStrip({
  loading,
  total,
  offered,
  valued,
  placedKeywords,
  placedClicks,
  proposals,
  unplaced,
  windowLabel,
  active,
  onSelect,
}: {
  loading: boolean;
  total: number;
  offered: number;
  valued: number;
  placedKeywords: number;
  placedClicks: number;
  proposals: number | null;
  unplaced: number | null;
  windowLabel: string;
  active: StripTarget | null;
  onSelect: (target: StripTarget) => void;
}) {
  const cards: {
    key: StripTarget;
    label: string;
    value: string;
    detail: string;
    icon: typeof Store;
    tone?: string;
  }[] = [
    {
      key: "offered",
      label: "Offered here",
      value: loading ? "…" : `${formatCount(offered)} of ${formatCount(total)}`,
      detail: "Show what this site offers",
      icon: Store,
      tone: "text-success",
    },
    {
      key: "not-offered",
      label: "Not offered here",
      value: loading ? "…" : formatCount(total - offered),
      detail: "Show the brand's other offerings",
      icon: CircleHelp,
    },
    {
      key: "valued",
      label: "Worth set here",
      value: loading ? "…" : formatCount(valued),
      detail: "Show offerings with this site's ruling",
      icon: BadgeDollarSign,
    },
    {
      key: "placed",
      label: "Keywords placed",
      value: loading ? "…" : formatCount(placedKeywords),
      detail: "Show offerings that have keywords",
      icon: PanelTop,
    },
    {
      key: "clicks",
      label: "Clicks on offerings",
      value: loading ? "…" : formatCount(placedClicks),
      detail: windowLabel,
      icon: MousePointerClick,
    },
    ...(proposals !== null && proposals > 0
      ? [
          {
            key: "proposals" as const,
            label: "Needs confirmation",
            value: formatCount(proposals),
            detail: "Open the unsure placements",
            icon: UserCheck,
          },
        ]
      : []),
    ...(unplaced !== null && unplaced > 0
      ? [
          {
            key: "unplaced" as const,
            label: "Not placed yet",
            value: formatCount(unplaced),
            detail: "Open the keywords still owed an offering",
            icon: CircleHelp,
            tone: "text-warning",
          },
        ]
      : []),
  ];

  return (
    <section className="shrink-0 rounded-lg border border-border bg-card p-2">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-7">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              type="button"
              key={card.key}
              onClick={() => onSelect(card.key)}
              aria-pressed={active === card.key}
              title={card.detail}
              className={cn(
                "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 rounded-md border border-border bg-background px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active === card.key && "ring-2 ring-ring",
              )}
            >
              <span className="truncate text-[11px] font-medium text-foreground">{card.label}</span>
              <span className={cn("text-sm font-semibold tabular-nums text-foreground", card.tone)}>
                {card.value}
              </span>
              <span className="col-span-2 flex min-w-0 items-center gap-1">
                <Icon className={cn("h-3 w-3 shrink-0 text-muted-foreground", card.tone)} />
                <span className="truncate text-[10px] text-muted-foreground">{card.detail}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
