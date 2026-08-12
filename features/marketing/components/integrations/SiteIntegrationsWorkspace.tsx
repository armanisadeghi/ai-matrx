"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Gauge,
  KeyRound,
  Loader2,
  Plus,
  Radio,
  RefreshCw,
  Save,
  SearchCheck,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingIntegrationsScope } from "@/features/surfaces/manifests/marketing-integrations.manifest";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  buildSiteIntegrations,
  credentialAuthorities,
  emptyProviderIntegration,
  parseSiteIntegrations,
  providerReferenceStatus,
  validateSiteIntegrations,
  type BuiltInProviderKey,
  type CredentialAuthority,
  type CustomProviderIntegrationDraft,
  type ProviderIntegrationDraft,
  type SiteIntegrationsDraft,
} from "@/features/marketing/data/integrations-schema";
import {
  updateBuiltInProviderIntegration,
  updateSiteIntegrations,
} from "@/features/marketing/data/integrations-service";
import { marketingKeys } from "@/features/marketing/data/hooks";
import { syncGsc } from "@/features/marketing/crawler/direct-client";
import { useSiteCommandRun } from "@/features/marketing/data/useSiteCommandRun";
import { syncGscSearchPerformance } from "@/features/marketing/search-console/sync";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  BackendFailureDetails,
  formatCompactDate,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  describeBackendFailure,
  type BackendFailureExplanation,
} from "@/lib/api/errors";
import {
  dedupeGoogleConnectionsForPicker,
  diagnoseGoogleConnection,
} from "@/features/marketing/google/health";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { cn } from "@/lib/utils";
import {
  useConnectGoogle,
  useGoogleConnectionInventory,
} from "@/features/marketing/google/hooks";
import type {
  GoogleConnectionResource,
  GoogleConnectionSummary,
} from "@/features/marketing/google/types";
import { GOOGLE_CONNECTION_SCOPES } from "@/features/marketing/google/types";
import type { MarketingSite } from "@/features/marketing/types";
import { LazyGoogleAPIProvider } from "@/providers/google-provider/LazyGoogleAPIProvider";
import { useGoogleAPI } from "@/providers/google-provider/GoogleApiProvider";

const authorityLabels: Record<CredentialAuthority, string> = {
  user_secret: "Personal vault credential",
  organization_secret: "Organization vault credential",
  external_connection: "Managed external connection",
};

const builtIns: Array<{
  key: BuiltInProviderKey;
  label: string;
  description: string;
  resourceLabel?: string;
  resourcePlaceholder?: string;
  icon: typeof SearchCheck;
}> = [
  {
    key: "googleSearchConsole",
    label: "Google Search Console",
    description:
      "Search performance, indexing, queries, and canonical URL evidence.",
    resourceLabel: "Search Console property",
    resourcePlaceholder: "sc-domain:example.com or https://example.com/",
    icon: SearchCheck,
  },
  {
    key: "pageSpeedInsights",
    label: "PageSpeed Insights",
    description:
      "Lighthouse and field-performance collection for canonical pages.",
    icon: Gauge,
  },
  {
    key: "googleAnalytics4",
    label: "Google Analytics 4 (optional)",
    description:
      "Optional traffic and engagement context. Analytics setup does not affect Search Console or PageSpeed.",
    resourceLabel: "GA4 property",
    resourcePlaceholder: "properties/123456789",
    icon: BarChart3,
  },
];

export function SiteIntegrationsWorkspace() {
  const { site } = useMarketingSite();
  return (
    <LazyGoogleAPIProvider scopes={[...GOOGLE_CONNECTION_SCOPES]}>
      <SiteIntegrationsEditor key={`${site.id}:${site.version}`} site={site} />
    </LazyGoogleAPIProvider>
  );
}

function SiteIntegrationsEditor({ site }: { site: MarketingSite }) {
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const googleInventory = useGoogleConnectionInventory();
  const connectGoogle = useConnectGoogle();
  const google = useGoogleAPI();
  const [googleConnectionOwner, setGoogleConnectionOwner] = useState<
    "organization" | "user" | null
  >(null);
  const initial = useMemo(
    () => parseSiteIntegrations(site.integrations),
    [site],
  );
  const [draft, setDraft] = useState<SiteIntegrationsDraft>(initial);
  const issues = useMemo(() => validateSiteIntegrations(draft), [draft]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const update = useMutation({
    mutationFn: updateSiteIntegrations,
    onSuccess: (next) => {
      queryClient.setQueryData(marketingKeys.site(site.id), next);
      void queryClient.invalidateQueries({ queryKey: marketingKeys.root });
    },
    onError: (error) => toast.error(error.message),
  });

  const setBuiltIn = (
    key: BuiltInProviderKey,
    next: ProviderIntegrationDraft,
  ) => setDraft((current) => ({ ...current, [key]: next }));

  const addCustomProvider = () => {
    setDraft((current) => ({
      ...current,
      customProviders: [
        ...current.customProviders,
        {
          id: crypto.randomUUID(),
          key: "",
          label: "",
          ...emptyProviderIntegration(),
        },
      ],
    }));
  };

  const setCustomProvider = (
    index: number,
    provider: CustomProviderIntegrationDraft,
  ) =>
    setDraft((current) => ({
      ...current,
      customProviders: current.customProviders.map((currentProvider, offset) =>
        offset === index ? provider : currentProvider,
      ),
    }));

  const removeCustomProvider = (index: number) =>
    setDraft((current) => ({
      ...current,
      customProviders: current.customProviders.filter(
        (_, offset) => offset !== index,
      ),
    }));

  const persistBuiltInProvider = async (
    provider: BuiltInProviderKey,
    next: ProviderIntegrationDraft,
    successTitle: string,
    successDescription?: string,
  ) => {
    const updatedSite = await updateBuiltInProviderIntegration({
      siteId: site.id,
      provider,
      expected: initial[provider],
      next,
    });
    queryClient.setQueryData(marketingKeys.site(site.id), updatedSite);
    setDraft(parseSiteIntegrations(updatedSite.integrations));
    void queryClient.invalidateQueries({ queryKey: marketingKeys.root });
    toast.success(successTitle, { description: successDescription });
    if (provider === "googleSearchConsole") kickGscFirstImport(next);
  };

  /**
   * ON-BIND AUTO-IMPORT: the moment a Search Console binding is first
   * created, kick the FULL history import (backfill walks to Google's
   * ~16-month horizon) plus a forward sync — Google deletes history past 16
   * months, so every day not fetched at bind time is eventually lost
   * forever. Fire-and-forget: the server detaches on disconnect and the
   * dashboard/wizard narrate progress from server state.
   */
  const kickGscFirstImport = (next: ProviderIntegrationDraft) => {
    const configured = Boolean(
      next.enabled && next.credentialRef && next.resourceRef,
    );
    if (!configured || site.gsc_synced_at) return;
    void syncGscSearchPerformance(dispatch, site.id, site.organization_id, {
      mode: "backfill",
    }).catch(() => undefined);
    void syncGscSearchPerformance(
      dispatch,
      site.id,
      site.organization_id,
      {},
    ).catch(() => undefined);
    toast.success("Search Console history import started", {
      description:
        "The full ~16-month import is running server-side. Open the Intake tab to run the site interview while it fills in.",
    });
  };

  const startGoogleConnection = async (
    owner: "organization" | "user" = "organization",
  ) => {
    setGoogleConnectionOwner(owner);
    try {
      const code = await google.requestAuthorizationCode([
        ...GOOGLE_CONNECTION_SCOPES,
      ]);
      const result = await connectGoogle.mutateAsync({
        code,
        owner:
          owner === "organization"
            ? { type: "organization", organizationId: site.organization_id }
            : { type: "user" },
      });
      const refreshed = await googleInventory.refetch();
      const connectionId = result.connectionId;
      if (!connectionId)
        throw new Error("Google connected without returning a connection ID.");
      const resources = refreshed.data?.resources ?? [];
      const searchResources = resources.filter(
        (resource) =>
          resource.connection_id === connectionId &&
          resource.resource_type === "search_console_property",
      );
      const matchingSearch =
        searchResources.find((resource) => {
          const ref = resource.resource_ref.toLowerCase();
          if (ref === `sc-domain:${site.domain.toLowerCase()}`) return true;
          try {
            return (
              new URL(ref).hostname.toLowerCase() === site.domain.toLowerCase()
            );
          } catch {
            return false;
          }
        }) ?? (searchResources.length === 1 ? searchResources[0] : null);
      const nextGoogleSearchConsole: ProviderIntegrationDraft = {
        ...draft.googleSearchConsole,
        enabled: Boolean(matchingSearch) || draft.googleSearchConsole.enabled,
        credentialAuthority: "external_connection",
        credentialRef: connectionId,
        resourceRef:
          matchingSearch?.resource_ref ?? draft.googleSearchConsole.resourceRef,
      };

      if (matchingSearch) {
        await persistBuiltInProvider(
          "googleSearchConsole",
          nextGoogleSearchConsole,
          "Search Console connected",
          `${matchingSearch.display_name} is now connected to ${site.domain}.`,
        );
      } else {
        setBuiltIn("googleSearchConsole", nextGoogleSearchConsole);
        toast.success("Google Search Console authorized", {
          description:
            searchResources.length > 0
              ? "Select this site's Search Console property below, then click Connect selected property."
              : "No Search Console properties were returned for this Google account.",
        });
      }
    } catch (error) {
      toast.error("Could not connect Google", {
        description:
          error instanceof Error
            ? error.message
            : "Google authorization failed.",
      });
    } finally {
      setGoogleConnectionOwner(null);
    }
  };

  const save = () => {
    if (issues.length) return;
    try {
      update.mutate(
        {
          siteId: site.id,
          expectedVersion: site.version,
          integrations: buildSiteIntegrations(site.integrations, draft),
        },
        {
          onSuccess: () => {
            toast.success("Site integrations saved.");
            const before = providerReferenceStatus(
              initial.googleSearchConsole,
              true,
            );
            if (before !== "reference_configured")
              kickGscFirstImport(draft.googleSearchConsole);
          },
        },
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to save integrations.",
      );
    }
  };

  const providerStatusLabel = (key: BuiltInProviderKey): string =>
    providerReferenceStatus(
      draft[key],
      key !== "pageSpeedInsights",
      key !== "pageSpeedInsights",
    ).replace(/_/g, " ");

  const providerCopy = (
    key: BuiltInProviderKey,
    label: string,
  ): ReturnType<typeof webCopy> =>
    webCopy({
      kind: "web-site-integration-provider",
      label,
      description:
        "One provider integration binding for this managed site (credential/resource references only — never secrets).",
      surface: `Integrations — ${label} — ${site.domain}`,
      data: {
        site_id: site.id,
        provider: key,
        saved: initial[key],
        draft: draft[key],
      },
      lines: [
        ["Site", site.domain],
        ["Provider", label],
        ["Enabled", draft[key].enabled ? "yes" : "no"],
        ["Status", providerStatusLabel(key)],
        ["Credential authority", draft[key].credentialAuthority],
        ["Credential reference", draft[key].credentialRef],
        ["Resource reference", draft[key].resourceRef],
        ...(key === "googleSearchConsole"
          ? ([
              [
                "Last GSC sync",
                site.gsc_synced_at
                  ? formatCompactDate(site.gsc_synced_at)
                  : "never",
              ],
            ] as Array<[string, string]>)
          : []),
      ],
      attributes: { site_id: site.id, provider: key },
    });

  const integrationsCopy = webCopy({
    kind: "web-site-integrations",
    label: "Site integrations",
    description:
      "Every provider integration binding for this managed site: built-in Google providers plus custom provider references (no secrets).",
    surface: `Integrations — ${site.domain}`,
    data: {
      site_id: site.id,
      saved: site.integrations,
      draft,
      dirty,
      issues,
    },
    lines: [
      ["Site", site.domain],
      ...builtIns.map(({ key, label }): [string, string] => [
        label,
        `${draft[key].enabled ? "enabled" : "disabled"} · ${providerStatusLabel(key)}`,
      ]),
      ["Custom providers", draft.customProviders.length],
      ["Unsaved changes", dirty ? "yes" : "no"],
    ],
    attributes: { site_id: site.id, dirty },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-integrations"
      getScope={() =>
        createMarketingIntegrationsScope({
          ...getBaseValues(),
          // Safe binding metadata ONLY — never tokens/secrets/credentials.
          provider_bindings: {
            google_search_console: {
              enabled: draft.googleSearchConsole.enabled,
              status: providerStatusLabel("googleSearchConsole"),
              gsc_synced_at: site.gsc_synced_at,
            },
            google_analytics_4: {
              enabled: draft.googleAnalytics4.enabled,
              status: providerStatusLabel("googleAnalytics4"),
            },
            pagespeed_insights: {
              enabled: draft.pageSpeedInsights.enabled,
              status: providerStatusLabel("pageSpeedInsights"),
            },
            cms: {
              enabled: draft.cms.enabled,
              // Same requiresResource/requiresCredential shape as the site
              // status card (lib/site-status.ts): a CMS binding needs a
              // resource reference but no credential UUID.
              status: providerReferenceStatus(draft.cms, true, false).replace(
                /_/g,
                " ",
              ),
            },
            custom_providers: draft.customProviders.map((provider) => ({
              key: provider.key,
              label: provider.label,
              enabled: provider.enabled,
              status: providerReferenceStatus(provider).replace(/_/g, " "),
            })),
          },
          custom_provider_count: draft.customProviders.length,
          unsaved_changes: dirty,
          configuration_issues: issues.map((issue) => ({
            field: issue.field,
            message: issue.message,
          })),
          // Reference metadata only — account identity + health, never tokens.
          google_connections: googleInventory.data?.connections.map(
            (connection) => ({
              id: connection.id,
              account:
                connection.account_name ||
                connection.account_email ||
                "Google account",
              owner_type: connection.owner_type,
              health: connection.health,
              diagnosis:
                connection.health === "connected"
                  ? null
                  : diagnoseGoogleConnection(connection).label,
            }),
          ),
          google_resources: googleInventory.data?.resources.map((resource) => ({
            connection_id: resource.connection_id,
            resource_type: resource.resource_type,
            resource_ref: resource.resource_ref,
            display_name: resource.display_name,
          })),
          gsc_synced_at: site.gsc_synced_at ?? undefined,
        })
      }
    >
      <main className="h-full overflow-y-auto bg-textured p-3 sm:p-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-base font-semibold">Site integrations</h1>
              <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">
                Connect data sources for {site.domain}, then choose the property
                that belongs to this website.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <CopyButtons size="icon" {...integrationsCopy} />
              <Badge
                variant="outline"
                className="gap-1 text-[10px] font-medium"
              >
                <KeyRound className="h-3 w-3" /> Credentials protected
              </Badge>
            </div>
          </div>

          <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <KeyRound className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-xs font-semibold">
                  Connect Google directly
                </h2>
                <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                  Authorize Search Console, choose the property for{" "}
                  {site.domain}, and connect it to this managed site. Analytics
                  is optional and does not affect this setup.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                size="sm"
                className="h-8 gap-1.5"
                disabled={
                  googleConnectionOwner !== null ||
                  google.isInitializing ||
                  !google.isGoogleLoaded
                }
                onClick={() => void startGoogleConnection("organization")}
              >
                {googleConnectionOwner === "organization" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <KeyRound className="h-3.5 w-3.5" />
                )}
                Connect Search Console
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={
                  googleConnectionOwner !== null ||
                  google.isInitializing ||
                  !google.isGoogleLoaded
                }
                onClick={() => void startGoogleConnection("user")}
              >
                {googleConnectionOwner === "user" ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Connect personally
              </Button>
            </div>
          </section>

          <div className="grid gap-3 xl:grid-cols-3">
            {builtIns.map(({ key, ...provider }) => (
              <BuiltInProviderCard
                key={key}
                providerKey={key}
                {...provider}
                copy={
                  <CopyButtons
                    size="icon"
                    {...providerCopy(key, provider.label)}
                  />
                }
                footer={
                  key === "googleSearchConsole" ? (
                    <GscSyncRow
                      site={site}
                      status={providerReferenceStatus(
                        draft.googleSearchConsole,
                        true,
                      )}
                      connection={
                        googleInventory.data?.connections.find(
                          (candidate) =>
                            candidate.id ===
                            draft.googleSearchConsole.credentialRef,
                        ) ?? null
                      }
                    />
                  ) : undefined
                }
                value={draft[key]}
                connections={googleInventory.data?.connections ?? []}
                resources={googleInventory.data?.resources ?? []}
                dirty={
                  JSON.stringify(draft[key]) !== JSON.stringify(initial[key])
                }
                saving={update.isPending}
                onSave={save}
                onEnable={() => {
                  void persistBuiltInProvider(
                    key,
                    { ...draft[key], enabled: true },
                    `${provider.label} enabled`,
                    `${provider.label} is now enabled for ${site.domain}.`,
                  ).catch((error) =>
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : `Unable to enable ${provider.label}.`,
                    ),
                  );
                }}
                onChange={(next) => setBuiltIn(key, next)}
              />
            ))}
          </div>

          <section className="rounded-lg border border-border bg-card">
            <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border px-3 py-1.5">
              <div>
                <h2 className="text-sm font-semibold">Additional providers</h2>
                <p className="text-[10px] text-muted-foreground">
                  Add extensible provider bindings without placing credentials
                  in site JSON.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5"
                onClick={addCustomProvider}
              >
                <Plus className="h-3.5 w-3.5" /> Add provider
              </Button>
            </div>
            {draft.customProviders.length ? (
              <div className="divide-y divide-border">
                {draft.customProviders.map((provider, index) => (
                  <CustomProviderRow
                    key={provider.id}
                    index={index}
                    value={provider}
                    onChange={(next) => setCustomProvider(index, next)}
                    onRemove={() => removeCustomProvider(index)}
                  />
                ))}
              </div>
            ) : (
              <p className="p-3 text-xs text-muted-foreground">
                No additional provider references are configured.
              </p>
            )}
          </section>

          {issues.length ? (
            <Alert variant="destructive" className="py-2.5">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-xs">
                Resolve {issues.length} configuration issue
                {issues.length === 1 ? "" : "s"}
              </AlertTitle>
              <AlertDescription>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px]">
                  {issues.map((issue) => (
                    <li key={`${issue.field}:${issue.message}`}>
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          {update.isError ? (
            <Alert variant="destructive" className="py-2.5">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-xs">Save failed</AlertTitle>
              <AlertDescription className="text-[11px]">
                {update.error.message}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border/80 bg-background/95 py-2 backdrop-blur">
            <p className="text-[11px] text-muted-foreground">
              {dirty ? "Unsaved changes" : "All integration changes saved"}
            </p>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!dirty || issues.length > 0 || update.isPending}
              onClick={save}
            >
              {update.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {update.isPending ? "Saving…" : "Save integrations"}
            </Button>
          </div>
        </div>
      </main>
    </SurfaceRuntimeProvider>
  );
}

/**
 * "Sync now" + freshness + FULL failure disclosure for the Search Console card.
 *
 * Two rules this row exists to enforce:
 *  1. A broken credential is stated BEFORE the click (derived connection
 *     health), not discovered as a mid-stream crash.
 *  2. When a sync does fail, the exact server cause, error code, and request id
 *     stay on screen — the streaming layer's "<Command> failed unexpectedly"
 *     template is never the whole answer.
 */
function GscSyncRow({
  site,
  status,
  connection,
}: {
  site: MarketingSite;
  status: ReturnType<typeof providerReferenceStatus>;
  /** The Google connection this site's Search Console binding points at. */
  connection: GoogleConnectionSummary | null;
}) {
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<BackendFailureExplanation | null>(
    null,
  );
  const connected = status === "reference_configured";
  const diagnosis = connection ? diagnoseGoogleConnection(connection) : null;
  const blocked = Boolean(diagnosis?.blocking);
  // A GSC sync pulls days of Search Analytics rows per page. It streams its
  // progress into the floating run window and is rejoined after a reload.
  const sync = useSiteCommandRun({
    siteId: site.id,
    mode: "gsc_sync",
    run: (callbacks) => syncGsc(site.id, callbacks),
    onComplete: async () => {
      await queryClient.invalidateQueries({
        queryKey: marketingKeys.site(site.id),
      });
      toast.success("Search Console synced", {
        description: `Fresh page stats are stored for ${site.domain}.`,
      });
    },
    onRemoteFailure: (message) =>
      toast.error("Search Console sync failed", { description: message }),
  });
  const syncing = sync.isActive;
  const runSync = async () => {
    setFailure(null);
    try {
      await sync.launch();
    } catch (error) {
      const explanation = describeBackendFailure(error);
      setFailure(explanation);
      toast.error("Search Console sync failed", {
        description: explanation.headline,
      });
    }
  };
  return (
    <div className="space-y-1.5 rounded-md border border-border bg-muted/20 p-2">
      <div className="flex items-center justify-between gap-2">
        <p
          className={cn(
            "text-[10px] leading-4",
            connected && !site.gsc_synced_at
              ? "font-medium text-amber-600 dark:text-amber-400"
              : "text-muted-foreground",
          )}
        >
          {site.gsc_synced_at
            ? `Last synced ${formatCompactDate(site.gsc_synced_at)}`
            : connected
              ? "Connected, never synced"
              : "Connect a property to enable sync"}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 gap-1.5"
          disabled={!syncing && (!connected || blocked)}
          onClick={() => (syncing ? sync.openWindow() : void runSync())}
        >
          {syncing ? (
            <Radio className="h-3.5 w-3.5 text-primary" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {syncing ? "Watch progress" : "Sync now"}
        </Button>
      </div>

      {/* Pre-flight truth: state the broken credential instead of letting the
          sync fail with a template. */}
      {diagnosis && diagnosis.blocking ? (
        <div className="rounded-sm border border-destructive/40 bg-destructive/5 p-1.5">
          <p className="text-[10px] font-medium text-destructive">
            Sync unavailable — {diagnosis.label.toLowerCase()}
          </p>
          <p className="mt-0.5 text-[10px] leading-4 text-destructive/90">
            {diagnosis.reason}
          </p>
          {diagnosis.remedy ? (
            <p className="mt-0.5 text-[10px] leading-4 text-destructive/90">
              {diagnosis.remedy}{" "}
              <Link
                className="underline"
                href={marketingRoutes.connectionsGoogle()}
              >
                Open Google connections
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {failure ? (
        <BackendFailureDetails failure={failure} label="Last sync failed" />
      ) : null}
    </div>
  );
}

function BuiltInProviderCard({
  providerKey,
  label,
  description,
  resourceLabel,
  resourcePlaceholder,
  icon: Icon,
  value,
  connections,
  resources,
  dirty,
  saving,
  footer,
  copy,
  onSave,
  onEnable,
  onChange,
}: {
  providerKey: BuiltInProviderKey;
  label: string;
  description: string;
  resourceLabel?: string;
  resourcePlaceholder?: string;
  icon: typeof SearchCheck;
  value: ProviderIntegrationDraft;
  connections: GoogleConnectionSummary[];
  resources: GoogleConnectionResource[];
  dirty: boolean;
  saving: boolean;
  footer?: React.ReactNode;
  /** Copy / Copy-for-AI pair for this provider card (agent-copy doctrine). */
  copy?: React.ReactNode;
  onSave: () => void;
  onEnable: () => void;
  onChange: (next: ProviderIntegrationDraft) => void;
}) {
  const status = providerReferenceStatus(
    value,
    Boolean(resourceLabel),
    providerKey !== "pageSpeedInsights",
  );
  const readyToApply =
    value.enabled &&
    (providerKey === "pageSpeedInsights" ||
      (Boolean(value.credentialRef) && Boolean(value.resourceRef)));
  const actionLabel =
    providerKey === "googleSearchConsole"
      ? dirty
        ? "Connect selected property"
        : "Search Console connected"
      : providerKey === "pageSpeedInsights"
        ? dirty
          ? "Enable PageSpeed Insights"
          : "PageSpeed Insights enabled"
        : dirty
          ? "Connect Analytics property"
          : "Analytics property connected";
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex min-h-14 items-start justify-between gap-3 border-b border-border p-3">
        <div className="flex min-w-0 gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-semibold">{label}</h2>
            <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {copy}
          <Switch
            aria-label={`Enable ${label}`}
            checked={value.enabled}
            onCheckedChange={(enabled) => onChange({ ...value, enabled })}
          />
        </div>
      </div>
      <div className="space-y-3 p-3">
        <StatusBadge status={status} />
        <ProviderReferenceFields
          providerKey={providerKey}
          value={value}
          connections={connections}
          resources={resources}
          resourceLabel={resourceLabel}
          resourcePlaceholder={resourcePlaceholder}
          onChange={onChange}
        />
        {readyToApply || providerKey === "pageSpeedInsights" ? (
          <Button
            size="sm"
            className="h-8 w-full gap-1.5"
            disabled={(value.enabled && !dirty) || saving}
            onClick={value.enabled ? onSave : onEnable}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : dirty ? (
              <Save className="h-3.5 w-3.5" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {value.enabled ? actionLabel : "Enable PageSpeed Insights"}
          </Button>
        ) : null}
        {footer}
      </div>
    </section>
  );
}

function ProviderReferenceFields({
  providerKey,
  value,
  connections,
  resources,
  resourceLabel,
  resourcePlaceholder,
  onChange,
}: {
  providerKey: BuiltInProviderKey;
  value: ProviderIntegrationDraft;
  connections: GoogleConnectionSummary[];
  resources: GoogleConnectionResource[];
  resourceLabel?: string;
  resourcePlaceholder?: string;
  onChange: (next: ProviderIntegrationDraft) => void;
}) {
  if (providerKey === "pageSpeedInsights") {
    return (
      <p className="rounded-md border border-border bg-muted/20 p-2 text-[10px] leading-4 text-muted-foreground">
        PageSpeed uses the application quota key. No Google account or
        credential reference is required.
      </p>
    );
  }

  const resourceType =
    providerKey === "googleSearchConsole"
      ? "search_console_property"
      : "analytics_property";
  const availableResources = resources.filter(
    (resource) =>
      resource.connection_id === value.credentialRef &&
      resource.resource_type === resourceType,
  );
  // One entry per Google identity: a personal + an org connection to the
  // same Google account are the same authorization — never two choices.
  const pickerConnections = dedupeGoogleConnectionsForPicker(
    connections,
    value.credentialRef,
  );

  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-[11px]">Google connection</Label>
        <Select
          value={value.credentialRef || undefined}
          onValueChange={(credentialRef) =>
            onChange({
              ...value,
              credentialAuthority: "external_connection",
              credentialRef,
              resourceRef: "",
            })
          }
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="Select a connected account" />
          </SelectTrigger>
          <SelectContent>
            {pickerConnections.map((connection) => (
              <SelectItem key={connection.id} value={connection.id}>
                {connection.account_name ||
                  connection.account_email ||
                  "Google account"}
                {connection.health === "connected"
                  ? ""
                  : ` · ${diagnoseGoogleConnection(connection).label}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!connections.length ? (
          <p className="text-[10px] text-muted-foreground">
            <Link
              className="text-primary underline"
              href="/marketing/connections"
            >
              Connect Google
            </Link>{" "}
            before binding a property.
          </p>
        ) : null}
      </div>
      {resourceLabel ? (
        <div className="space-y-1.5">
          <Label className="text-[11px]">{resourceLabel}</Label>
          <Select
            value={value.resourceRef || undefined}
            disabled={!value.credentialRef || !availableResources.length}
            onValueChange={(resourceRef) => onChange({ ...value, resourceRef })}
          >
            <SelectTrigger size="sm">
              <SelectValue
                placeholder={
                  value.credentialRef && !availableResources.length
                    ? "No properties discovered"
                    : resourcePlaceholder
                }
              />
            </SelectTrigger>
            <SelectContent>
              {availableResources.map((resource) => (
                <SelectItem key={resource.id} value={resource.resource_ref}>
                  {resource.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </>
  );
}

function CustomProviderRow({
  index,
  value,
  onChange,
  onRemove,
}: {
  index: number;
  value: CustomProviderIntegrationDraft;
  onChange: (next: CustomProviderIntegrationDraft) => void;
  onRemove: () => void;
}) {
  const prefix = `custom-provider-${index}`;
  return (
    <div className="p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch
            aria-label={`Enable custom provider ${index + 1}`}
            checked={value.enabled}
            onCheckedChange={(enabled) => onChange({ ...value, enabled })}
          />
          <StatusBadge status={providerReferenceStatus(value)} />
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label={`Remove ${value.label || `custom provider ${index + 1}`}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <div className="space-y-1.5 xl:col-span-1">
          <Label htmlFor={`${prefix}-label`} className="text-[11px]">
            Label
          </Label>
          <Input
            id={`${prefix}-label`}
            className="h-8 text-xs"
            value={value.label}
            placeholder="Bing Webmaster"
            onChange={(event) =>
              onChange({ ...value, label: event.target.value })
            }
          />
        </div>
        <div className="space-y-1.5 xl:col-span-1">
          <Label htmlFor={`${prefix}-key`} className="text-[11px]">
            Provider key
          </Label>
          <Input
            id={`${prefix}-key`}
            className="h-8 font-mono text-[11px]"
            value={value.key}
            placeholder="bing_webmaster"
            spellCheck={false}
            onChange={(event) =>
              onChange({ ...value, key: event.target.value })
            }
          />
        </div>
        <div className="space-y-1.5 xl:col-span-1">
          <Label className="text-[11px]">Credential authority</Label>
          <Select
            value={value.credentialAuthority || undefined}
            onValueChange={(credentialAuthority) =>
              onChange({
                ...value,
                credentialAuthority: credentialAuthority as CredentialAuthority,
              })
            }
          >
            <SelectTrigger size="sm">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {credentialAuthorities.map((authority) => (
                <SelectItem key={authority} value={authority}>
                  {authorityLabels[authority]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 xl:col-span-2">
          <Label htmlFor={`${prefix}-credential`} className="text-[11px]">
            Credential reference UUID
          </Label>
          <Input
            id={`${prefix}-credential`}
            className="h-8 font-mono text-[11px]"
            value={value.credentialRef}
            placeholder="00000000-0000-4000-8000-000000000000"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) =>
              onChange({ ...value, credentialRef: event.target.value })
            }
          />
        </div>
        <div className="space-y-1.5 xl:col-span-1">
          <Label htmlFor={`${prefix}-resource`} className="text-[11px]">
            Resource reference
          </Label>
          <Input
            id={`${prefix}-resource`}
            className="h-8 font-mono text-[11px]"
            value={value.resourceRef}
            placeholder="resource:site-id"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) =>
              onChange({ ...value, resourceRef: event.target.value })
            }
          />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: ReturnType<typeof providerReferenceStatus>;
}) {
  if (status === "disabled") return <Badge variant="secondary">Disabled</Badge>;
  if (status === "needs_reference")
    return <Badge variant="warning">Needs reference</Badge>;
  return <Badge variant="success">Configured for this site</Badge>;
}
