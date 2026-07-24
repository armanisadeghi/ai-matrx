"use client";

/**
 * SurfaceHubDetailPage — the user-facing detail hub for one surface (Wave 5).
 *
 * Route: `/surfaces/[...name]` (`matrx-user/` is implied — the hub is the
 * user client only). Panels:
 *
 *   - Scope switcher (Me | each member org) — selects WHICH TIER writes go
 *     to. Reads always show the RESOLVED effective value with its provenance
 *     tier, exactly what launch resolution uses.
 *   - Roles — pick the agent filling each declared role at the selected tier
 *     (position 0; multi-role slots beyond that are managed by the surface's
 *     own UI). Persistence: surface-config.service `setRoleSelection` /
 *     `deleteRolePref` — NOT `useSetting`.
 *   - Dictionary — merged term/pronunciation counts + the canonical
 *     DictionarySelectorWindow for this surface.
 *   - Config — per declared namespace, edit the selected tier's JSON row
 *     (handler-validated on save via `setNamespaceConfig`), with the merged
 *     effective config shown alongside.
 *   - Tools — read-only view of tools force-included on this surface.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookText,
  Bot,
  Building2,
  Loader2,
  User,
  Wrench,
} from "lucide-react";
import { toast } from "@/lib/toast";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { selectAllOrgs } from "@/features/agent-context/redux/organizationsSlice";
import { fetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";
import { useOpenDictionarySelectorWindow } from "@/features/overlays/openers/dictionarySelectorWindow";
import { getManifest } from "@/features/surfaces/manifests/registry";
import { getSurfaceDisplayLabel } from "@/features/surfaces/utils/surface-display";
import { useSurfaceConfig } from "@/features/surfaces/hooks/useSurfaceConfig";
import {
  deleteRolePref,
  setNamespaceConfig,
  setRoleSelection,
  type PrefScopeInput,
  type ResolvedRole,
} from "@/features/surfaces/services/surface-config.service";
import type { DictionaryConfig } from "@/features/surfaces/config/namespace-registry";
import {
  getSurfaceUsage,
  type SurfaceUsage,
} from "@/features/surfaces/services/surfaces.service";
import { Button } from "@/components/ui/button";

const USER_CLIENT_PREFIX = "matrx-user/";

type HubScope =
  | { kind: "me" }
  | { kind: "org"; organizationId: string; label: string };

export function SurfaceHubDetailPage({ segments }: { segments: string[] }) {
  const surfaceName = USER_CLIENT_PREFIX + segments.join("/");
  const router = useRouter();
  const dispatch = useAppDispatch();
  const manifest = getManifest(surfaceName);
  const userId = useAppSelector((s) => s.userAuth?.id ?? null);
  const orgs = useAppSelector(selectAllOrgs);
  const [scope, setScope] = useState<HubScope>({ kind: "me" });

  const { status, error, resolved, roles, getNamespace, refresh } =
    useSurfaceConfig(surfaceName);

  useEffect(() => {
    if (orgs.length === 0) void dispatch(fetchFullContext());
  }, [dispatch, orgs.length]);

  // Org-tier writes require org admin (RLS: `is_org_admin` = role owner|admin
  // on ui_surface_agent_pref / ui_surface_config). Only offer write scopes the
  // user can actually write — a member-org pill would 42501 on every save.
  const realOrgs = orgs.filter(
    (o) => !o.is_personal && (o.role === "owner" || o.role === "admin"),
  );
  const memberOnlyOrgCount = orgs.filter(
    (o) => !o.is_personal && o.role !== "owner" && o.role !== "admin",
  ).length;
  const prefScope: PrefScopeInput =
    scope.kind === "me"
      ? { userId }
      : { organizationId: scope.organizationId };

  const label = getSurfaceDisplayLabel(surfaceName);
  const namespaces = manifest?.configNamespaces ?? [];
  const hasDictionary = namespaces.some((n) => n.namespace === "dictionary");
  const otherNamespaces = namespaces.filter(
    (n) => n.namespace !== "dictionary",
  );

  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-0 p-0">
          <ChevronLeftTapButton
            onClick={() => router.back()}
            variant="transparent"
            ariaLabel="Back"
          />
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            {label}
          </h1>
          <span className="ml-2 hidden truncate font-mono text-[11px] text-muted-foreground sm:inline">
            {surfaceName}
          </span>
        </div>
      </PageHeader>
      <div className="h-full overflow-hidden">
        <div
          className="h-full overflow-y-auto"
          style={{ paddingTop: "var(--shell-header-h)" }}
        >
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pb-10 pt-2">
            {!manifest && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                No registered manifest for <code>{surfaceName}</code>. Only
                registered matrx-user surfaces appear in this hub.
              </p>
            )}
            {error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            {/* Scope switcher: which tier writes go to. */}
            <div className="flex flex-wrap items-center gap-1.5">
              <ScopePill
                active={scope.kind === "me"}
                icon={User}
                label="Me"
                onClick={() => setScope({ kind: "me" })}
              />
              {realOrgs.map((org) => (
                <ScopePill
                  key={org.id}
                  active={
                    scope.kind === "org" && scope.organizationId === org.id
                  }
                  icon={Building2}
                  label={org.name}
                  onClick={() =>
                    setScope({
                      kind: "org",
                      organizationId: org.id,
                      label: org.name,
                    })
                  }
                />
              ))}
              <span className="ml-1 text-[11px] text-muted-foreground">
                {scope.kind === "me"
                  ? "Changes apply to you everywhere."
                  : `Changes apply to everyone in ${scope.label}.`}
                {memberOnlyOrgCount > 0 &&
                  " Org-wide settings require an org admin role."}
              </span>
            </div>

            {status === "loading" && !resolved && (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading surface configuration…
              </div>
            )}

            {/* LOUD drift: manifest declares roles but the DB mirror has none —
                an unsynced ui_surface_agent_role, not "no roles". */}
            {status === "ready" &&
              (manifest?.agentRoles?.length ?? 0) > 0 &&
              Object.keys(roles).length === 0 && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  This surface declares{" "}
                  {manifest?.agentRoles?.length ?? 0} agent role(s) in code but
                  none exist in the database — the manifest has not been
                  synced. Selections cannot be made until it is.
                </p>
              )}

            {/* Roles */}
            {Object.keys(roles).length > 0 && (
              <SettingsSection
                title="Agent roles"
                description="Which agent fills each position this surface plugs agents into. The strongest tier wins: platform default → org → you."
                icon={Bot}
              >
                <div className="flex flex-col gap-3">
                  {Object.values(roles)
                    .sort(
                      (a, b) =>
                        (a.role.sortOrder ?? 1000) - (b.role.sortOrder ?? 1000),
                    )
                    .map((r) => (
                      <RoleRow
                        key={r.role.name}
                        resolved={r}
                        surfaceName={surfaceName}
                        scope={scope}
                        prefScope={prefScope}
                        onChanged={refresh}
                      />
                    ))}
                </div>
              </SettingsSection>
            )}

            {/* Dictionary */}
            {hasDictionary && (
              <DictionaryPanel
                surfaceName={surfaceName}
                dictionary={getNamespace<DictionaryConfig>("dictionary")}
              />
            )}

            {/* Other config namespaces */}
            {otherNamespaces.map((ns) => (
              <NamespaceConfigPanel
                key={ns.namespace}
                surfaceName={surfaceName}
                namespace={ns.namespace}
                label={ns.label}
                description={ns.description}
                scope={scope}
                prefScope={prefScope}
                merged={getNamespace<unknown>(ns.namespace)}
                tierRow={
                  resolved?.configRows.find(
                    (row) =>
                      row.namespace === ns.namespace &&
                      (scope.kind === "me"
                        ? row.userId === userId
                        : row.organizationId === scope.organizationId),
                  ) ?? null
                }
                onSaved={refresh}
              />
            ))}

            {/* Tools */}
            <ToolsPanel surfaceName={surfaceName} />
          </div>
        </div>
      </div>
    </>
  );
}

function ScopePill({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof User;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border/60 text-muted-foreground hover:bg-accent/50",
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

const TIER_LABEL: Record<string, string> = {
  manifest: "Platform default",
  global: "Platform",
  org: "Organization",
  user: "You",
  scope: "Scope",
};

function RoleRow({
  resolved,
  surfaceName,
  scope,
  prefScope,
  onChanged,
}: {
  resolved: ResolvedRole;
  surfaceName: string;
  scope: HubScope;
  prefScope: PrefScopeInput;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const effective = resolved.effective[0] ?? null;
  const agentName = useAppSelector((s) =>
    effective ? selectAgentById(s, effective.agentId)?.name : undefined,
  );

  // The pref row owned by the SELECTED tier (may differ from the effective winner).
  const tierPrefId =
    scope.kind === "me"
      ? (resolved.userSelection?.prefId ?? null)
      : (resolved.orgSelections.find(
          (o) => o.organizationId === scope.organizationId,
        )?.prefId ?? null);

  const setAgent = async (agentId: string) => {
    setBusy(true);
    try {
      await setRoleSelection({
        surfaceName,
        roleName: resolved.role.name,
        agentId,
        scope: prefScope,
      });
      onChanged();
    } catch (err) {
      console.error("[surfaces] role selection failed", err);
      toast.error("Failed to save agent selection");
    } finally {
      setBusy(false);
    }
  };

  const clearTier = async () => {
    if (!tierPrefId) return;
    setBusy(true);
    try {
      await deleteRolePref(tierPrefId);
      onChanged();
    } catch (err) {
      console.error("[surfaces] role clear failed", err);
      toast.error("Failed to reset agent selection");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-border/60 bg-background px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {resolved.role.label}
            </span>
            {effective && (
              <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {TIER_LABEL[effective.sourceTier] ?? effective.sourceTier}
              </span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {resolved.role.description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AgentListDropdown
            onSelect={(id) => void setAgent(id)}
            compact
            triggerSlot={
              <button
                type="button"
                disabled={busy}
                className="flex max-w-56 items-center gap-1.5 rounded-md border border-border/60 bg-card px-2 py-1.5 text-left transition-colors hover:bg-accent/50"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : (
                  <Bot className="h-3.5 w-3.5 shrink-0 text-primary" />
                )}
                <span className="truncate text-xs text-foreground">
                  {effective
                    ? (agentName ?? effective.agentId.slice(0, 8))
                    : "Choose agent"}
                </span>
              </button>
            }
          />
          {tierPrefId && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void clearTier()}
              className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            >
              Reset
            </button>
          )}
        </div>
      </div>
      {resolved.role.kind === "multi" && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Multi-slot role — this sets the first slot ({scope.kind === "me" ? "for you" : "for the org"}); additional slots are
          managed on the surface itself.
        </p>
      )}
    </div>
  );
}

function DictionaryPanel({
  surfaceName,
  dictionary,
}: {
  surfaceName: string;
  dictionary: DictionaryConfig;
}) {
  const openDictionary = useOpenDictionarySelectorWindow();
  const termCount = dictionary.terms?.length ?? 0;
  const pronCount = dictionary.pronunciations?.length ?? 0;
  return (
    <SettingsSection
      title="Dictionary"
      description="Term corrections and pronunciations applied on this surface (org + user layers merged)."
      icon={BookText}
    >
      <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-3 py-2.5">
        <p className="text-xs text-muted-foreground">
          {termCount} term{termCount === 1 ? "" : "s"}, {pronCount}{" "}
          pronunciation{pronCount === 1 ? "" : "s"} in effect.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => openDictionary({ surfaceKey: surfaceName })}
        >
          Manage dictionary
        </Button>
      </div>
    </SettingsSection>
  );
}

function NamespaceConfigPanel({
  surfaceName,
  namespace,
  label,
  description,
  scope,
  prefScope,
  merged,
  tierRow,
  onSaved,
}: {
  surfaceName: string;
  namespace: string;
  label: string;
  description: string;
  scope: HubScope;
  prefScope: PrefScopeInput;
  merged: unknown;
  tierRow: { id: string; config: unknown } | null;
  onSaved: () => void;
}) {
  const tierKey = scope.kind === "me" ? "me" : scope.organizationId;
  const [draft, setDraft] = useState<string>(() =>
    JSON.stringify(tierRow?.config ?? {}, null, 2),
  );
  const [saving, setSaving] = useState(false);

  // Re-seed the editor when the selected tier (or its row) changes.
  const seed = JSON.stringify(tierRow?.config ?? {}, null, 2);
  const [seedKey, setSeedKey] = useState(`${tierKey}:${seed}`);
  if (seedKey !== `${tierKey}:${seed}`) {
    setSeedKey(`${tierKey}:${seed}`);
    setDraft(seed);
  }

  const save = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      toast.error("Invalid JSON — fix the syntax before saving.");
      return;
    }
    setSaving(true);
    try {
      await setNamespaceConfig({
        surfaceName,
        namespace,
        config: parsed,
        scope: prefScope,
      });
      toast.success(`${label} saved`);
      onSaved();
    } catch (err) {
      console.error(`[surfaces] ${namespace} config save failed`, err);
      toast.error(
        err instanceof Error ? err.message : `Failed to save ${label}`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection title={label} description={description} icon={BookText}>
      <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-background px-3 py-2.5">
        <label className="text-[11px] font-medium text-muted-foreground">
          {scope.kind === "me" ? "Your" : `${scope.label}'s`} config for this
          surface (JSON)
        </label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          rows={6}
          className="w-full resize-y rounded-md border border-border/60 bg-card px-2 py-1.5 font-mono text-xs text-foreground"
          style={{ fontSize: "16px" }}
        />
        <div className="flex items-center justify-between gap-2">
          <details className="min-w-0 text-[11px] text-muted-foreground">
            <summary className="cursor-pointer select-none">
              Effective (merged) config
            </summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted/50 p-2 font-mono text-[11px]">
              {JSON.stringify(merged, null, 2)}
            </pre>
          </details>
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}

function ToolsPanel({ surfaceName }: { surfaceName: string }) {
  const [usage, setUsage] = useState<SurfaceUsage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSurfaceUsage(surfaceName)
      .then((u) => {
        if (!cancelled) setUsage(u);
      })
      .catch((err) => {
        console.error("[surfaces] tools load failed", err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [surfaceName]);

  return (
    <SettingsSection
      title="Tools"
      description="Tools force-included whenever an agent runs on this surface."
      icon={Wrench}
      collapsible
      defaultOpen={false}
    >
      {failed && (
        <p className="px-1 text-xs text-destructive">
          Failed to load tools for this surface.
        </p>
      )}
      {!usage && !failed && (
        <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      )}
      {usage && usage.tools.length === 0 && (
        <p className="px-1 text-xs text-muted-foreground">
          No tools are force-included on this surface.
        </p>
      )}
      {usage && usage.tools.length > 0 && (
        <ul className="divide-y divide-border/60 rounded-md border border-border/60 bg-background">
          {usage.tools.map((t) => (
            <li
              key={`${t.id}:${t.via}:${t.bundle_name ?? ""}`}
              className="flex items-center justify-between gap-2 px-3 py-1.5"
            >
              <span className="truncate font-mono text-xs text-foreground">
                {t.name}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {t.via === "always_include_bundles"
                  ? `bundle: ${t.bundle_name}`
                  : "direct"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}
