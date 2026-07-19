"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  Gauge,
  KeyRound,
  Loader2,
  Plus,
  Save,
  SearchCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
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
import { updateSiteIntegrations } from "@/features/marketing/data/integrations-service";
import { marketingKeys } from "@/features/marketing/data/hooks";
import {
  useConnectGoogle,
  useGoogleConnectionInventory,
} from "@/features/marketing/google/hooks";
import type {
  GoogleConnectionResource,
  GoogleConnectionSummary,
} from "@/features/marketing/google/types";
import type { MarketingSite } from "@/features/marketing/types";

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
    key: "googleAnalytics4",
    label: "Google Analytics 4",
    description:
      "Traffic, engagement, landing pages, conversions, and channel context.",
    resourceLabel: "GA4 property",
    resourcePlaceholder: "properties/123456789",
    icon: BarChart3,
  },
  {
    key: "pageSpeedInsights",
    label: "PageSpeed Insights",
    description:
      "Lighthouse and field-performance collection for canonical pages.",
    icon: Gauge,
  },
];

export function SiteIntegrationsWorkspace() {
  const { site } = useMarketingSite();
  return (
    <SiteIntegrationsEditor key={`${site.id}:${site.version}`} site={site} />
  );
}

function SiteIntegrationsEditor({ site }: { site: MarketingSite }) {
  const queryClient = useQueryClient();
  const googleInventory = useGoogleConnectionInventory();
  const connectGoogle = useConnectGoogle();
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
      toast.success("Integration references saved.");
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

  const startGoogleConnection = async (
    owner: "organization" | "user" = "organization",
  ) => {
    try {
      const result = await connectGoogle.mutateAsync({
        owner:
          owner === "organization"
            ? { type: "organization", organizationId: site.organization_id }
            : { type: "user" },
        returnPath: `/marketing/sites/${site.id}/integrations`,
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
      const analyticsResources = resources.filter(
        (resource) =>
          resource.connection_id === connectionId &&
          resource.resource_type === "analytics_property",
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
      const matchingAnalytics =
        analyticsResources.length === 1 ? analyticsResources[0] : null;

      setDraft((current) => ({
        ...current,
        googleSearchConsole: {
          ...current.googleSearchConsole,
          enabled:
            Boolean(matchingSearch) || current.googleSearchConsole.enabled,
          credentialAuthority: "external_connection",
          credentialRef: connectionId,
          resourceRef:
            matchingSearch?.resource_ref ??
            current.googleSearchConsole.resourceRef,
        },
        googleAnalytics4: {
          ...current.googleAnalytics4,
          enabled:
            Boolean(matchingAnalytics) || current.googleAnalytics4.enabled,
          credentialAuthority: "external_connection",
          credentialRef: connectionId,
          resourceRef:
            matchingAnalytics?.resource_ref ??
            current.googleAnalytics4.resourceRef,
        },
      }));
      toast.success("Google connected", {
        description:
          matchingSearch || matchingAnalytics
            ? "Matching properties were selected. Review and save the site bindings."
            : "Choose the Search Console and Analytics properties below.",
      });
    } catch (error) {
      toast.error("Could not connect Google", {
        description:
          error instanceof Error
            ? error.message
            : "Google authorization failed.",
      });
    }
  };

  const save = () => {
    if (issues.length) return;
    try {
      update.mutate({
        siteId: site.id,
        expectedVersion: site.version,
        integrations: buildSiteIntegrations(site.integrations, draft),
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to save integrations.",
      );
    }
  };

  return (
    <main className="h-full overflow-y-auto bg-textured p-3 sm:p-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold">Site integrations</h1>
            <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">
              Map {site.domain} to provider properties and opaque credential
              references. Provider data will be read from Supabase after workers
              persist it.
            </p>
          </div>
          <Badge variant="outline" className="gap-1 text-[10px] font-medium">
            <KeyRound className="h-3 w-3" /> References only
          </Badge>
        </div>

        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <KeyRound className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-xs font-semibold">Connect Google directly</h2>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                Authorize once, discover Search Console and GA4 properties, then
                bind the matching properties to {site.domain} below.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              size="sm"
              className="h-8 gap-1.5"
              disabled={connectGoogle.isPending}
              onClick={() => void startGoogleConnection("organization")}
            >
              {connectGoogle.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <KeyRound className="h-3.5 w-3.5" />
              )}
              Connect Google
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={connectGoogle.isPending}
              onClick={() => void startGoogleConnection("user")}
            >
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
              value={draft[key]}
              connections={googleInventory.data?.connections ?? []}
              resources={googleInventory.data?.resources ?? []}
              onChange={(next) => setBuiltIn(key, next)}
            />
          ))}
        </div>

        <section className="rounded-lg border border-border bg-card">
          <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border px-3 py-1.5">
            <div>
              <h2 className="text-sm font-semibold">Additional providers</h2>
              <p className="text-[10px] text-muted-foreground">
                Add extensible provider bindings without placing credentials in
                site JSON.
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
            {dirty
              ? "Unsaved reference changes"
              : "All reference changes saved"}
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
  onChange: (next: ProviderIntegrationDraft) => void;
}) {
  const status = providerReferenceStatus(
    value,
    Boolean(resourceLabel),
    providerKey !== "pageSpeedInsights",
  );
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
        <Switch
          aria-label={`Enable ${label}`}
          checked={value.enabled}
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
        />
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
            {connections.map((connection) => (
              <SelectItem key={connection.id} value={connection.id}>
                {connection.account_name ||
                  connection.account_email ||
                  "Google account"}
                {connection.owner_type === "organization"
                  ? " · Organization"
                  : " · Personal"}
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
  return <Badge variant="info">Reference configured · not verified</Badge>;
}
