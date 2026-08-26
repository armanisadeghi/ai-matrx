"use client";

/**
 * /agents/mandates — the user/org-facing agent-mandate override surface.
 *
 * Browse every live mandate ("which agent runs this step"), see the resolved
 * agent with provenance (system default vs org vs your override — user wins),
 * and create/edit/delete agent.mandate_binding rows: swap the agent, or
 * settings-only (model / thinking level).
 *
 * Generalizes research's /research/topics/[id]/agents pattern onto the
 * platform-wide mandate system. Cross-repo system-of-record:
 * common-docs/systems/mandates/FEATURE.md.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowDownUp,
  Boxes,
  ChevronDown,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Building2,
  Waypoints,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { fetchAgentsListFull } from "@/features/agents/redux/agent-definition/thunks";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { splitMandateKey } from "@/features/agents/mandates/mandate-key";
import {
  fetchMandateOverridesData,
  parseMandateContract,
  type MandateBindingRow,
  type MandateDefinitionRow,
  type MandateOverridesData,
} from "../overrides";
import {
  parseBindingWave1,
  parseMandateWave1,
} from "../provision-shapes";
import { fetchProvisions, type ProvisionOffer } from "../provisions";
import {
  useBindingHealth,
  type BindingVerdict,
  type BoundAgentRef,
} from "../useBindingHealth";
import { MandateOverridePanel } from "./MandateOverridePanel";
import { OverriddenCountBadge } from "./OverriddenCountBadge";
import { MandateResolutionRibbon } from "./MandateResolutionRibbon";

interface MandateView {
  mandate: MandateDefinitionRow;
  domain: string;
  /** Null only when the mandate has no (readable) default agent. */
  defaultAgentId: string | null;
  defaultAgentName: string;
  myBinding: MandateBindingRow | null;
  /** Org bindings on orgs the user belongs to, keyed by org id. */
  orgBindings: Record<string, MandateBindingRow>;
  /** The layer that decides the agent for THIS user (user > org > system). */
  provenance: "user" | "org" | "system";
  /** Agent (id + name) after applying that layer. */
  resolvedAgentId: string | null;
  resolvedAgentName: string;
  settingsOnly: boolean;
  /** The Provision this job's inputs come from — null for legacy mandates. */
  provisionKey: string | null;
  /** Offered values the mandate force-delivers as context (locked). */
  pinnedContext: string[];
  /** The binding that decides for THIS user (user > org), if any. */
  activeBinding: MandateBindingRow | null;
  /** How many offered values that binding consumes. 0 with no binding. */
  consumedCount: number;
}

export function MandateOverridesPage() {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const { organizations, loading: orgsLoading } = useUserOrganizations();

  const [data, setData] = useState<MandateOverridesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openMandateId, setOpenMandateId] = useState<string | null>(null);
  // The card whose "Map inputs" button was pressed — the expanded editor
  // scrolls its Consumed-values section into view and rings it once.
  const [mapIntentId, setMapIntentId] = useState<string | null>(null);
  // provision_key → the call site's full offer. ONE batched read for the whole
  // list (fetchProvisions), never one request per card.
  const [offers, setOffers] = useState<Record<string, ProvisionOffer>>({});
  const [offersLoading, setOffersLoading] = useState(true);
  const [onlyMappable, setOnlyMappable] = useState(false);
  // Seeded from ?feature= so a feature can link its users straight to its own
  // mandates ("Choose the agents behind Podcasts") instead of dropping them at
  // the top of a 39-domain list.
  const searchParams = useSearchParams();
  const initialFeature = searchParams.get("feature");
  const [query, setQuery] = useState(() =>
    initialFeature === null ? "" : initialFeature,
  );

  // Every setState lives in an async callback — never synchronously in the
  // effect (react-hooks/set-state-in-effect).
  const load = useCallback(() => {
    fetchMandateOverridesData()
      .then((next) => {
        setData(next);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        const message =
          (err as { message?: string } | null)?.message ?? "unknown error";
        setLoadError(message);
        toast.error(`Couldn't load mandates: ${message}`);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    // Canonical agent listing for the override picker (owned + shared + builtins).
    void dispatch(fetchAgentsListFull());
  }, [dispatch, load]);

  // ONE batched provision read for the entire list. 227 mandates carry a
  // provision_key — a per-card fetch would be a request storm, so every key on
  // the page is resolved in a single chunked query (5-min cached).
  useEffect(() => {
    if (!data) return;
    const keys = [
      ...new Set(
        data.mandates
          .map((m) => parseMandateWave1(m).provisionKey)
          .filter((k): k is string => k !== null),
      ),
    ];
    let cancelled = false;
    fetchProvisions(keys)
      .then((byKey) => {
        if (cancelled) return;
        setOffers(Object.fromEntries(byKey));
      })
      .catch((err: unknown) => {
        // Never fatal for the page — the cards simply can't summarize the
        // offer, and the editor re-fetches per mandate when opened.
        console.error("[mandates] couldn't load provision offers", err);
      })
      .finally(() => {
        if (!cancelled) setOffersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data]);

  const orgNamesById = useMemo(() => {
    const out: Record<string, string> = {};
    for (const org of organizations) out[org.id] = org.name;
    return out;
  }, [organizations]);

  const adminOrgs = useMemo(
    () => organizations.filter((o) => o.role === "admin" || o.role === "owner"),
    [organizations],
  );

  const views = useMemo<MandateView[]>(() => {
    if (!data || !userId) return [];
    const myOrgIds = new Set(organizations.map((o) => o.id));
    return data.mandates.map((mandate) => {
      const bindings = data.bindings.filter(
        (b) => b.mandate_id === mandate.id && b.is_enabled,
      );
      const myBinding =
        data.bindings.find(
          (b) =>
            b.mandate_id === mandate.id &&
            b.principal_type === "user" &&
            b.subject_user_id === userId,
        ) ?? null;
      const orgBindings: Record<string, MandateBindingRow> = {};
      for (const b of bindings) {
        if (b.principal_type === "org" && myOrgIds.has(b.organization_id)) {
          orgBindings[b.organization_id] = b;
        }
      }

      const defaultAgentId = mandate.default_agent_version_id
        ? (data.versionAgentIds[mandate.default_agent_version_id] ?? null)
        : mandate.default_agent_id;
      const defaultAgentName = defaultAgentId
        ? (data.agentsById[defaultAgentId]?.name ?? "(unknown agent)")
        : "(no default agent)";

      // Mirror the runtime precedence for display: system → org → user, agent
      // set by the LAST layer that names one (settings-only layers don't move it).
      let provenance: MandateView["provenance"] = "system";
      let resolvedAgentId = defaultAgentId;
      const firstOrgSwap = Object.values(orgBindings).find((b) => b.agent_id);
      if (firstOrgSwap?.agent_id) {
        provenance = "org";
        resolvedAgentId = firstOrgSwap.agent_id;
      }
      if (myBinding?.is_enabled && myBinding.agent_id) {
        provenance = "user";
        resolvedAgentId = myBinding.agent_id;
      }
      const settingsOnly =
        provenance === "system" &&
        Boolean(
          (myBinding?.is_enabled && myBinding.config_overrides != null) ||
          Object.values(orgBindings).some((b) => b.config_overrides != null),
        );

      // Wave-2 input model: the mandate's Provision (what the call site
      // OFFERS) and the deciding binding's consumption map (what the bound
      // agent CONSUMES). Unused offered values are normal — never a warning.
      const wave1 = parseMandateWave1(mandate);
      const activeBinding =
        myBinding?.is_enabled === true
          ? myBinding
          : (Object.values(orgBindings)[0] ?? null);
      const consumedCount = Object.keys(
        parseBindingWave1(activeBinding).consumptionMap,
      ).length;

      return {
        mandate,
        domain: splitMandateKey(mandate.mandate_key).feature,
        defaultAgentId,
        defaultAgentName,
        myBinding,
        orgBindings,
        provenance,
        resolvedAgentId,
        resolvedAgentName: resolvedAgentId
          ? (data.agentsById[resolvedAgentId]?.name ?? "(unknown agent)")
          : defaultAgentName,
        settingsOnly,
        provisionKey: wave1.provisionKey,
        pinnedContext: wave1.pinnedContext,
        activeBinding,
        consumedCount,
      };
    });
  }, [data, organizations, userId]);

  // Verify every agent-swapping binding against the mandate's CURRENT contract
  // — the check the server runs on each resolution and this page used to skip,
  // so a binding the server had started dropping still rendered as "Yours".
  const boundRefs = useMemo<BoundAgentRef[]>(() => {
    const out: BoundAgentRef[] = [];
    for (const view of views) {
      if (view.provenance === "system" || !view.resolvedAgentId) continue;
      const offer = view.provisionKey ? (offers[view.provisionKey] ?? null) : null;
      out.push({
        mandateId: view.mandate.id,
        agentId: view.resolvedAgentId,
        contract: parseMandateContract(view.mandate.contract),
        layer: view.provenance,
        provisionKey: view.provisionKey,
        // null while the batched offer read is still in flight — the hook
        // treats that as "checking", never as a finding.
        offeredValueNames: offer ? offer.values.map((v) => v.name) : null,
        consumptionMap: parseBindingWave1(view.activeBinding).consumptionMap,
      });
    }
    return out;
  }, [views, offers]);
  const bindingHealth = useBindingHealth(boundRefs);
  const mappableCount = useMemo(
    () => views.filter((v) => v.provisionKey !== null).length,
    [views],
  );
  const droppedCount = useMemo(
    () =>
      Object.values(bindingHealth).filter((v) => !v.passing && v.kind === "dropped")
        .length,
    [bindingHealth],
  );
  const staleCount = useMemo(
    () =>
      Object.values(bindingHealth).filter(
        (v) => !v.passing && v.kind === "stale_inputs",
      ).length,
    [bindingHealth],
  );

  // Feature filter — 39 domains is a scroll, so a feature can hand its users a
  // deep link straight to its own mandates (/agents/mandates?feature=podcast).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const scoped = onlyMappable ? views.filter((v) => v.provisionKey) : views;
    if (!q) return scoped;
    return scoped.filter(
      (v) =>
        v.domain.toLowerCase().includes(q) ||
        v.mandate.mandate_key.toLowerCase().includes(q) ||
        (typeof v.mandate.label === "string" ? v.mandate.label : "")
          .toLowerCase()
          .includes(q) ||
        (typeof v.mandate.description === "string"
          ? v.mandate.description
          : ""
        )
          .toLowerCase()
          .includes(q) ||
        (v.provisionKey ?? "").toLowerCase().includes(q),
    );
  }, [views, query, onlyMappable]);

  const domains = useMemo(() => {
    const grouped = new Map<string, MandateView[]>();
    for (const view of filtered) {
      const list = grouped.get(view.domain) ?? [];
      list.push(view);
      grouped.set(view.domain, list);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  if (loading || (!data && !loadError)) {
    return (
      <div className="flex h-full items-center justify-center">
        <SuspenseLoader centered={false} message="Loading mandate overrides…" />
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-destructive">
          Couldn't load mandates: {loadError}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => load()}
          className="gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-[calc(var(--shell-header-h)+0.75rem)]">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-muted-foreground">
            Every Mandate below is a named job, fulfilled by default by a
            system agent. Swap in one of your own agents, keep the system agent
            and override its settings, or map which of the values the call site
            offers your agent actually consumes.
          </p>
          <OverriddenCountBadge
            overridden={
              views.filter((v) => v.provenance !== "system" || v.settingsOnly)
                .length
            }
            total={views.length}
          />
        </div>
        {/* The canonical, truthful precedence chain (highest first). */}
        <MandateResolutionRibbon className="mb-4" />

        {/* A binding the server has started dropping is the one thing on this
            page the reader cannot afford to miss — it means a customization
            they made is no longer running. */}
        {droppedCount > 0 ? (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
            <p className="text-sm font-medium text-destructive">
              {droppedCount === 1
                ? "1 of your agents is no longer running its job"
                : `${droppedCount} of your agents are no longer running their jobs`}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              The job changed and now needs something your agent doesn&apos;t
              provide, so the built-in agent is running instead. Open the ones
              marked below to see what&apos;s missing and update your agent.
            </p>
          </div>
        ) : null}
        {staleCount > 0 ? (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              {staleCount === 1
                ? "1 of your agents is missing an input it was set up to receive"
                : `${staleCount} of your agents are missing inputs they were set up to receive`}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Your agent still runs, but the job stopped offering a value your
              mapping sends it. Open the ones marked below and update the input
              map (Map inputs).
            </p>
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by feature, job, or provision — e.g. podcast"
            aria-label="Filter mandates"
            className="h-9 min-w-[14rem] flex-1 rounded-md border border-border bg-background px-3 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none sm:text-sm"
          />
          {/* The door to the input model: without this, a job's offered values
              are invisible until someone happens to expand the right card. */}
          <Button
            type="button"
            variant={onlyMappable ? "default" : "outline"}
            size="sm"
            onClick={() => setOnlyMappable((v) => !v)}
            aria-pressed={onlyMappable}
            className="h-9 gap-1.5 text-[12.5px]"
          >
            <Waypoints className="h-3.5 w-3.5" />
            Mappable inputs
            <span className="opacity-70">({mappableCount})</span>
          </Button>
        </div>

        {domains.length === 0 ? (
          <p className="rounded-lg border border-border/60 bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            {query.trim()
              ? `Nothing matches "${query.trim()}".`
              : "No mandates are live yet."}
          </p>
        ) : null}

        {domains.map(([domain, domainViews]) => (
          <section key={domain} className="mb-6">
            <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {domain.replace(/_/g, " ")}
            </h2>
            <div className="space-y-2">
              {domainViews.map((view) => (
                <MandateCard
                  key={view.mandate.id}
                  view={view}
                  data={data}
                  userId={userId}
                  orgNamesById={orgNamesById}
                  canEditAnyOrg={adminOrgs.length > 0}
                  open={openMandateId === view.mandate.id}
                  onToggle={() => {
                    setMapIntentId(null);
                    setOpenMandateId((prev) =>
                      prev === view.mandate.id ? null : view.mandate.id,
                    );
                  }}
                  onMapInputs={() => {
                    setOpenMandateId(view.mandate.id);
                    setMapIntentId(view.mandate.id);
                  }}
                  offer={
                    view.provisionKey
                      ? (offers[view.provisionKey] ?? null)
                      : null
                  }
                  offersLoading={offersLoading}
                  focusConsumption={mapIntentId === view.mandate.id}
                  onChanged={() => load()}
                  verdict={bindingHealth[view.mandate.id]}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ProvenancePill({ view }: { view: MandateView }) {
  if (view.provenance === "user") {
    return (
      <Badge className="gap-1 border-primary/25 bg-primary/10 text-[10.5px] font-medium text-primary hover:bg-primary/10">
        <KeyRound className="h-2.5 w-2.5" /> Your override
      </Badge>
    );
  }
  if (view.provenance === "org") {
    return (
      <Badge className="gap-1 border-sky-500/30 bg-sky-500/10 text-[10.5px] font-medium text-sky-700 hover:bg-sky-500/10 dark:text-sky-400">
        <Building2 className="h-2.5 w-2.5" /> Org override
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 border-border/70 text-[10.5px] font-medium text-muted-foreground"
    >
      <ShieldCheck className="h-2.5 w-2.5" /> System default
    </Badge>
  );
}

/**
 * The list-level view of a mandate's INPUT model: which Provision feeds it,
 * how big the offer is, how much of it the deciding binding consumes, and the
 * explicit door onto the consumption map.
 *
 * THE CALM RULE (Arman, 2026-08-22): an offered value nothing consumes is
 * NORMAL. Nothing here renders as a warning — a job with zero consumed values
 * reads as "nothing mapped yet", never as a problem.
 */
function ProvisionStrip({
  view,
  offer,
  loading,
  onMapInputs,
}: {
  view: MandateView;
  offer: ProvisionOffer | null;
  loading: boolean;
  onMapInputs: () => void;
}) {
  const offeredCount = offer?.values.length ?? 0;
  const guaranteedCount =
    offer?.values.filter((v) => v.guaranteed).length ?? 0;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <Badge
        variant="outline"
        className="gap-1 border-border/70 font-mono text-[10.5px] font-medium text-muted-foreground"
      >
        <Boxes className="h-2.5 w-2.5" />
        {view.provisionKey}
      </Badge>
      {loading && !offer ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/70">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading what this step offers…
        </span>
      ) : offer ? (
        <>
          <span className="text-[11px] text-muted-foreground">
            {offeredCount} value{offeredCount === 1 ? "" : "s"} offered
            {guaranteedCount > 0 ? ` — ${guaranteedCount} guaranteed` : null}
          </span>
          <span aria-hidden className="text-muted-foreground/40">
            ·
          </span>
          <span
            className={cn(
              "text-[11px]",
              view.consumedCount > 0
                ? "font-medium text-foreground/80"
                : "text-muted-foreground",
            )}
          >
            {view.activeBinding
              ? view.consumedCount > 0
                ? `${view.consumedCount} of ${offeredCount} consumed`
                : "nothing mapped yet"
              : "nothing mapped yet"}
          </span>
          {view.pinnedContext.length > 0 ? (
            <span className="text-[11px] text-muted-foreground/70">
              ({view.pinnedContext.length} always sent as context)
            </span>
          ) : null}
        </>
      ) : (
        <span className="text-[11px] text-muted-foreground/70">
          This step&apos;s offer hasn&apos;t synced yet.
        </span>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onMapInputs();
        }}
        className="h-6 gap-1 px-2 text-[11px]"
      >
        <Waypoints className="h-3 w-3" />
        Map inputs
      </Button>
    </div>
  );
}

function MandateCard({
  view,
  data,
  userId,
  orgNamesById,
  canEditAnyOrg,
  open,
  onToggle,
  onMapInputs,
  offer,
  offersLoading,
  focusConsumption,
  onChanged,
  verdict,
}: {
  view: MandateView;
  data: MandateOverridesData;
  userId: string | null;
  orgNamesById: Record<string, string>;
  canEditAnyOrg: boolean;
  open: boolean;
  onToggle: () => void;
  /** Expand straight onto the consumption map (the explicit door). */
  onMapInputs: () => void;
  /** This mandate's provision offer — null while loading, or when the mandate
   * carries no provision_key. */
  offer: ProvisionOffer | null;
  offersLoading: boolean;
  /** Scroll + ring the Consumed-values section on the expanded editor. */
  focusConsumption: boolean;
  onChanged: () => void;
  /** Undefined when nothing is bound here (the system agent runs). */
  verdict?: BindingVerdict;
}) {
  const { mandate } = view;
  const disabled = !mandate.is_enabled;
  // A binding that fails the contract is DROPPED by resolve_mandate, so the
  // default agent is what actually runs. Render that, not the binding — a row
  // reading "runs <your agent>" when the server refuses to run it is the exact
  // false assurance this check exists to remove.
  // Only a LEGACY-rule failure means the server swapped agents on you; a
  // provision-era stale map means your agent still runs, short an input.
  const dropped = Boolean(verdict && !verdict.passing && verdict.kind === "dropped");
  const stale = Boolean(
    verdict && !verdict.passing && verdict.kind === "stale_inputs",
  );
  const runningAgentId = dropped ? view.defaultAgentId : view.resolvedAgentId;
  const runningAgentName = dropped
    ? view.defaultAgentName
    : view.resolvedAgentName;
  const mandateBindings = data.bindings.filter(
    (b) => b.mandate_id === mandate.id,
  );

  return (
    <article
      className={cn(
        "rounded-xl border border-border/60 bg-card transition-colors",
        open ? "border-border" : "hover:border-border",
        disabled && "opacity-60",
      )}
    >
      {/* A div-with-button-semantics, not a <button>: the agent names inside
          are EntityRef doors (links/buttons), and interactive elements may not
          nest inside a <button>. EntityRef controls stop propagation. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          // Only when the row itself is focused — keydown from a nested door
          // (link/peek) bubbles here and must not also toggle the card.
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-foreground">
              {mandate.label}
            </h3>
            <ProvenancePill view={view} />
            {dropped ? (
              <Badge
                variant="outline"
                className="gap-1 border-destructive/40 bg-destructive/10 text-[10.5px] font-medium text-destructive"
              >
                Not running — built-in agent used
              </Badge>
            ) : null}
            {stale ? (
              <Badge
                variant="outline"
                className="gap-1 border-amber-500/40 bg-amber-500/10 text-[10.5px] font-medium text-amber-700 dark:text-amber-400"
              >
                Input map out of date
              </Badge>
            ) : null}
            {verdict?.unreadable ? (
              <Badge
                variant="outline"
                className="gap-1 border-amber-500/30 bg-amber-500/10 text-[10.5px] font-medium text-amber-700 dark:text-amber-400"
              >
                Agent unreadable
              </Badge>
            ) : null}
            {view.settingsOnly ? (
              <Badge
                variant="outline"
                className="gap-1 border-amber-500/30 bg-amber-500/10 text-[10.5px] font-medium text-amber-700 dark:text-amber-400"
              >
                Settings adjusted
              </Badge>
            ) : null}
            {disabled ? (
              <Badge
                variant="outline"
                className="border-border/70 text-[10.5px] font-medium text-muted-foreground"
              >
                Disabled
              </Badge>
            ) : null}
          </div>
          {mandate.description ? (
            <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
              {mandate.description}
            </p>
          ) : null}
          {stale && verdict ? (
            <p className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">
              This job no longer offers{" "}
              <span className="font-medium">{verdict.missing.join(", ")}</span>,
              but{" "}
              {verdict.layer === "org"
                ? "your organization's input map"
                : "your input map"}{" "}
              still sends {verdict.missing.length === 1 ? "it" : "them"} — your
              agent runs without {verdict.missing.length === 1 ? "that value" : "those values"}.
              Open Map inputs and remove or re-point {verdict.missing.length === 1 ? "it" : "them"}.
            </p>
          ) : null}
          {dropped && verdict?.outputSide ? (
            <p className="mt-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[12px] leading-relaxed text-destructive">
              Whatever reads this job&apos;s result needs{" "}
              <span className="font-medium">{verdict.missing.join(", ")}</span>{" "}
              in the answer, and{" "}
              {verdict.layer === "org"
                ? "your organization's agent"
                : "your agent"}{" "}
              doesn&apos;t produce {verdict.missing.length === 1 ? "it" : "them"}
              {" "}— so the built-in agent is running instead. Give your agent a
              structured output that includes{" "}
              {verdict.missing.length === 1 ? "that field" : "those fields"} and
              it takes over again automatically.
            </p>
          ) : null}
          {dropped && verdict && !verdict.outputSide ? (
            <p className="mt-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[12px] leading-relaxed text-destructive">
              This job now needs{" "}
              <span className="font-medium">{verdict.missing.join(", ")}</span>,
              which{" "}
              {verdict.layer === "org"
                ? "your organization's agent"
                : "your agent"}{" "}
              doesn&apos;t provide — so the built-in agent is running instead.
              Add {verdict.missing.length === 1 ? "it" : "them"} to your agent
              and it takes over again automatically.
            </p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/80">
            <code className="font-mono">{mandate.mandate_key}</code>
            <span className="inline-flex min-w-0 items-center gap-1">
              <ArrowDownUp className="h-2.5 w-2.5 shrink-0" />
              runs{" "}
              {runningAgentId ? (
                <EntityRef
                  token="agent"
                  id={runningAgentId}
                  name={runningAgentName}
                  showIcon={false}
                  className="font-medium text-foreground/80"
                />
              ) : (
                <span className="font-medium text-foreground/80">
                  {runningAgentName}
                </span>
              )}
              {view.provenance !== "system" && !dropped ? (
                <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground/60">
                  (default:{" "}
                  {view.defaultAgentId ? (
                    <EntityRef
                      token="agent"
                      id={view.defaultAgentId}
                      name={view.defaultAgentName}
                      showIcon={false}
                    />
                  ) : (
                    view.defaultAgentName
                  )}
                  )
                </span>
              ) : null}
            </span>
            {mandate.input_kind || mandate.output_kind ? (
              <span className="font-mono text-muted-foreground/60">
                {mandate.input_kind ?? "text"} → {mandate.output_kind ?? "text"}
              </span>
            ) : null}
          </div>
          {/* The input model, at list level. A mandate with no Provision shows
              nothing here — an absent offer is not a deficiency. */}
          {view.provisionKey ? (
            <ProvisionStrip
              view={view}
              offer={offer}
              loading={offersLoading}
              onMapInputs={onMapInputs}
            />
          ) : null}
        </div>
        <ChevronDown
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </div>

      {open && userId ? (
        <div className="border-t border-border/50 px-4 py-3.5">
          {/* Which layer decides the agent for THIS user, in the one truthful
              precedence chain. */}
          <MandateResolutionRibbon
            provenance={view.provenance}
            className="mb-3"
          />

          {/* Org overrides the user can SEE but not edit (member, not admin).
              Every org and agent named here is a door (THE DOOR LAW). */}
          {Object.keys(view.orgBindings).length > 0 && !canEditAnyOrg ? (
            <p className="mb-3 text-[11.5px] text-muted-foreground">
              {Object.entries(view.orgBindings).map(([orgId, b], i) => (
                <span
                  key={orgId}
                  className="inline-flex flex-wrap items-center gap-1"
                >
                  {i > 0 ? <span aria-hidden> · </span> : null}
                  <EntityRef
                    token="organization"
                    id={orgId}
                    name={orgNamesById[orgId] ?? "your organization"}
                    showIcon={false}
                  />{" "}
                  overrides this step (
                  {b.agent_id ? (
                    <EntityRef
                      token="agent"
                      id={b.agent_id}
                      name={
                        data.agentsById[b.agent_id]?.name ?? "a custom agent"
                      }
                      showIcon={false}
                    />
                  ) : (
                    "the default agent with adjusted settings"
                  )}
                  )
                </span>
              ))}
              . Your override below wins over the org's.
            </p>
          ) : null}

          <MandateOverridePanel
            key={mandate.id}
            mandate={mandate}
            bindings={mandateBindings}
            agentsById={data.agentsById}
            focusConsumption={focusConsumption}
            onChanged={onChanged}
          />
        </div>
      ) : null}
    </article>
  );
}
