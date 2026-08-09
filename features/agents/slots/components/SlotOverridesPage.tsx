"use client";

/**
 * /agents/slots — the user/org-facing agent-slot override surface.
 *
 * Browse every live slot ("which agent runs this step"), see the resolved
 * agent with provenance (system default vs org vs your override — user wins),
 * and create/edit/delete agent.slot_binding rows: swap the agent, or
 * settings-only (model / thinking level).
 *
 * Generalizes research's /research/topics/[id]/agents pattern onto the
 * platform-wide slot system. Cross-repo system-of-record:
 * common-docs/systems/agent-slots/FEATURE.md.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  ChevronDown,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Building2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { fetchAgentsListFull } from "@/features/agents/redux/agent-definition/thunks";
import { useUserOrganizations } from "@/features/organizations/hooks";
import {
  fetchSlotOverridesData,
  type SlotBindingRow,
  type SlotDefinitionRow,
  type SlotOverridesData,
} from "../overrides";
import { SlotOverridePanel } from "./SlotOverridePanel";

interface SlotView {
  slot: SlotDefinitionRow;
  domain: string;
  /** Null only when the slot has no (readable) default agent. */
  defaultAgentId: string | null;
  defaultAgentName: string;
  myBinding: SlotBindingRow | null;
  /** Org bindings on orgs the user belongs to, keyed by org id. */
  orgBindings: Record<string, SlotBindingRow>;
  /** The layer that decides the agent for THIS user (user > org > system). */
  provenance: "user" | "org" | "system";
  /** Agent (id + name) after applying that layer. */
  resolvedAgentId: string | null;
  resolvedAgentName: string;
  settingsOnly: boolean;
}

function slotDomain(slotKey: string): string {
  const dot = slotKey.indexOf(".");
  return dot > 0 ? slotKey.slice(0, dot) : slotKey;
}

export function SlotOverridesPage() {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const { organizations, loading: orgsLoading } = useUserOrganizations();

  const [data, setData] = useState<SlotOverridesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openSlotId, setOpenSlotId] = useState<string | null>(null);

  // Every setState lives in an async callback — never synchronously in the
  // effect (react-hooks/set-state-in-effect).
  const load = useCallback(() => {
    fetchSlotOverridesData()
      .then((next) => {
        setData(next);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        const message = (err as { message?: string } | null)?.message ?? "unknown error";
        setLoadError(message);
        toast.error(`Couldn't load agent slots: ${message}`);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    // Canonical agent listing for the override picker (owned + shared + builtins).
    void dispatch(fetchAgentsListFull());
  }, [dispatch, load]);

  const orgNamesById = useMemo(() => {
    const out: Record<string, string> = {};
    for (const org of organizations) out[org.id] = org.name;
    return out;
  }, [organizations]);

  const adminOrgs = useMemo(
    () => organizations.filter((o) => o.role === "admin" || o.role === "owner"),
    [organizations],
  );

  const views = useMemo<SlotView[]>(() => {
    if (!data || !userId) return [];
    const myOrgIds = new Set(organizations.map((o) => o.id));
    return data.slots.map((slot) => {
      const bindings = data.bindings.filter((b) => b.slot_id === slot.id && b.is_enabled);
      const myBinding =
        data.bindings.find(
          (b) =>
            b.slot_id === slot.id && b.principal_type === "user" && b.subject_user_id === userId,
        ) ?? null;
      const orgBindings: Record<string, SlotBindingRow> = {};
      for (const b of bindings) {
        if (b.principal_type === "org" && myOrgIds.has(b.organization_id)) {
          orgBindings[b.organization_id] = b;
        }
      }

      const defaultAgentId = slot.default_agent_version_id
        ? (data.versionAgentIds[slot.default_agent_version_id] ?? null)
        : slot.default_agent_id;
      const defaultAgentName = defaultAgentId
        ? (data.agentsById[defaultAgentId]?.name ?? "(unknown agent)")
        : "(no default agent)";

      // Mirror the runtime precedence for display: system → org → user, agent
      // set by the LAST layer that names one (settings-only layers don't move it).
      let provenance: SlotView["provenance"] = "system";
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

      return {
        slot,
        domain: slotDomain(slot.slot_key),
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
      };
    });
  }, [data, organizations, userId]);

  const domains = useMemo(() => {
    const grouped = new Map<string, SlotView[]>();
    for (const view of views) {
      const list = grouped.get(view.domain) ?? [];
      list.push(view);
      grouped.set(view.domain, list);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [views]);

  if (loading || (!data && !loadError)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-destructive">Couldn't load agent slots: {loadError}</p>
        <Button variant="outline" size="sm" onClick={() => load()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-[calc(var(--shell-header-h)+0.75rem)]">
        <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
          Every step below runs a system-provided agent. Swap in one of your own agents, or keep
          the system agent and override its settings. Your override wins over your organization's;
          both win over the system default.
        </p>

        {domains.length === 0 ? (
          <p className="rounded-lg border border-border/60 bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            No agent slots are live yet.
          </p>
        ) : null}

        {domains.map(([domain, domainViews]) => (
          <section key={domain} className="mb-6">
            <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {domain.replace(/_/g, " ")}
            </h2>
            <div className="space-y-2">
              {domainViews.map((view) => (
                <SlotCard
                  key={view.slot.id}
                  view={view}
                  data={data}
                  userId={userId}
                  orgNamesById={orgNamesById}
                  canEditAnyOrg={adminOrgs.length > 0}
                  open={openSlotId === view.slot.id}
                  onToggle={() =>
                    setOpenSlotId((prev) => (prev === view.slot.id ? null : view.slot.id))
                  }
                  onChanged={() => load()}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ProvenancePill({ view }: { view: SlotView }) {
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

function SlotCard({
  view,
  data,
  userId,
  orgNamesById,
  canEditAnyOrg,
  open,
  onToggle,
  onChanged,
}: {
  view: SlotView;
  data: SlotOverridesData;
  userId: string | null;
  orgNamesById: Record<string, string>;
  canEditAnyOrg: boolean;
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const { slot } = view;
  const disabled = !slot.is_enabled;
  const slotBindings = data.bindings.filter((b) => b.slot_id === slot.id);

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
              {slot.label}
            </h3>
            <ProvenancePill view={view} />
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
          {slot.description ? (
            <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
              {slot.description}
            </p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/80">
            <code className="font-mono">{slot.slot_key}</code>
            <span className="inline-flex min-w-0 items-center gap-1">
              <ArrowDownUp className="h-2.5 w-2.5 shrink-0" />
              runs{" "}
              {view.resolvedAgentId ? (
                <EntityRef
                  token="agent"
                  id={view.resolvedAgentId}
                  name={view.resolvedAgentName}
                  showIcon={false}
                  className="font-medium text-foreground/80"
                />
              ) : (
                <span className="font-medium text-foreground/80">{view.resolvedAgentName}</span>
              )}
              {view.provenance !== "system" ? (
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
            {slot.input_kind || slot.output_kind ? (
              <span className="font-mono text-muted-foreground/60">
                {slot.input_kind ?? "text"} → {slot.output_kind ?? "text"}
              </span>
            ) : null}
          </div>
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
          {/* Org overrides the user can SEE but not edit (member, not admin).
              Every org and agent named here is a door (THE DOOR LAW). */}
          {Object.keys(view.orgBindings).length > 0 && !canEditAnyOrg ? (
            <p className="mb-3 text-[11.5px] text-muted-foreground">
              {Object.entries(view.orgBindings).map(([orgId, b], i) => (
                <span key={orgId} className="inline-flex flex-wrap items-center gap-1">
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
                      name={data.agentsById[b.agent_id]?.name ?? "a custom agent"}
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

          <SlotOverridePanel
            key={slot.id}
            slot={slot}
            bindings={slotBindings}
            agentsById={data.agentsById}
            onChanged={onChanged}
          />
        </div>
      ) : null}
    </article>
  );
}
