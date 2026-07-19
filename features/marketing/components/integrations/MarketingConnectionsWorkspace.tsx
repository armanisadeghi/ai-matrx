"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Gauge,
  Loader2,
  LockKeyhole,
  RefreshCw,
  SearchCheck,
  Unplug,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { MarketingWorkspaceNav } from "@/features/marketing/components/shared/MarketingWorkspaceNav";
import { useSiteOptions } from "@/features/marketing/data/hooks";
import { useActiveOrganizationPicker } from "@/features/organizations/hooks/useActiveOrganizationPicker";
import {
  useConnectGoogle,
  useDisconnectGoogle,
  useGoogleConnectionInventory,
} from "@/features/marketing/google/hooks";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";

export function MarketingConnectionsWorkspace() {
  const sites = useSiteOptions();
  const organizations = useActiveOrganizationPicker();
  const inventory = useGoogleConnectionInventory();
  const connect = useConnectGoogle();
  const disconnect = useDisconnectGoogle();
  const [siteId, setSiteId] = useState("");
  const selectedSite = sites.data?.find((site) => site.id === siteId);
  const resourcesByConnection = new Map<string, number>();
  for (const resource of inventory.data?.resources ?? []) {
    resourcesByConnection.set(
      resource.connection_id,
      (resourcesByConnection.get(resource.connection_id) ?? 0) + 1,
    );
  }

  const startConnection = async (owner: "user" | "organization") => {
    try {
      await connect.mutateAsync({
        owner:
          owner === "organization" && organizations.activeOrgId
            ? {
                type: "organization",
                organizationId: organizations.activeOrgId,
              }
            : { type: "user" },
        returnPath: "/marketing/connections",
      });
      toast.success("Google account connected and properties discovered.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to connect Google.",
      );
    }
  };

  return (
    <>
      <RouteHeader
        left={
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Data Connections
          </h1>
        }
        center={<MarketingWorkspaceNav />}
      />
      <main className="h-full overflow-y-auto bg-textured px-3 pb-4 pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-4">
        <div className="space-y-3">
          <section className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-3">
            <div>
              <h2 className="text-sm font-semibold">
                Connect once, use across sites
              </h2>
              <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">
                Keep credentials at the user or organization level, then bind
                the relevant provider property to each managed site.
              </p>
            </div>
            <Badge variant="outline" className="gap-1 text-[10px]">
              <LockKeyhole className="h-3 w-3" /> Secrets stay server-side
            </Badge>
          </section>

          <div className="grid gap-3 xl:grid-cols-3">
            <ProviderCard
              icon={SearchCheck}
              title="Google Search Console"
              status="OAuth + offline access"
              description="Seed canonical URLs, search queries, indexing evidence, clicks, and impressions."
            />
            <ProviderCard
              icon={BarChart3}
              title="Google Analytics 4"
              status="OAuth + property discovery"
              description="Add traffic, landing-page, engagement, channel, and conversion context."
            />
            <ProviderCard
              icon={Gauge}
              title="PageSpeed Insights"
              status="Site binding available"
              description="Collect Lighthouse and field-performance evidence for canonical pages."
            />
          </div>

          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-3 py-2">
              <h2 className="text-sm font-semibold">
                1. Choose where credentials belong
              </h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Personal connections follow you. Organization connections are
                reusable by authorized team members without exposing tokens.
              </p>
            </div>
            <div className="grid gap-2 p-3 md:grid-cols-2">
              <ConnectionScope
                icon={UserRound}
                title="Personal connection"
                description="Authorize Google once for Search Console and Analytics. Offline access supports scheduled synchronization."
                action="Connect personal Google"
                busy={connect.isPending}
                onAction={() => startConnection("user")}
              />
              <ConnectionScope
                icon={Building2}
                title={
                  organizations.activeOrgName
                    ? `${organizations.activeOrgName} connection`
                    : "Organization connection"
                }
                description="Create a shared Google connection for authorized organization members and managed sites."
                action={
                  organizations.activeOrgId
                    ? "Connect organization Google"
                    : "Choose an organization"
                }
                busy={connect.isPending}
                disabled={!organizations.activeOrgId}
                onAction={() => startConnection("organization")}
              />
            </div>
            <div className="border-t border-border bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground">
              OAuth tokens are exchanged server-side, encrypted before storage,
              and never returned to the browser. This page reads only safe
              connection metadata and discovered properties directly from
              Supabase.
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
              <div>
                <h2 className="text-sm font-semibold">
                  Connected Google accounts
                </h2>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Reconnect to refresh consent or property inventory.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                disabled={inventory.isFetching}
                onClick={() => inventory.refetch()}
              >
                {inventory.isFetching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Refresh
              </Button>
            </div>
            {inventory.isLoading ? (
              <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading
                connections…
              </div>
            ) : inventory.isError ? (
              <p className="p-3 text-xs text-destructive">
                {inventory.error.message}
              </p>
            ) : inventory.data?.connections.length ? (
              <div className="divide-y divide-border">
                {inventory.data.connections.map((connection) => (
                  <ConnectionRow
                    key={connection.id}
                    connection={connection}
                    resourceCount={
                      resourcesByConnection.get(connection.id) ?? 0
                    }
                    busy={disconnect.isPending}
                    onDisconnect={async () => {
                      try {
                        await disconnect.mutateAsync(connection.id);
                        toast.success("Google account disconnected.");
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Unable to disconnect Google.",
                        );
                      }
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="p-3 text-xs text-muted-foreground">
                No Google accounts are connected yet.
              </p>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-3 py-2">
              <h2 className="text-sm font-semibold">
                2. Bind the provider to a site
              </h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Select the Search Console or Analytics property that represents
                the real website.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 p-3">
              <Select value={siteId || undefined} onValueChange={setSiteId}>
                <SelectTrigger className="w-full sm:w-80" size="sm">
                  <SelectValue
                    placeholder={
                      sites.isLoading
                        ? "Loading sites…"
                        : "Select a managed site"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(sites.data ?? []).map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name} · {site.domain}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSite ? (
                <Button asChild size="sm" className="h-8 gap-1.5">
                  <Link
                    href={`/marketing/sites/${selectedSite.id}/integrations`}
                  >
                    Configure {selectedSite.name}{" "}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline" className="h-8">
                  <Link href="/marketing/sites/new">Add a site first</Link>
                </Button>
              )}
            </div>
          </section>

          <Alert className="border-emerald-500/40 bg-emerald-500/5 py-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <AlertTitle className="text-xs">
              Production OAuth authority enabled
            </AlertTitle>
            <AlertDescription className="text-[11px] leading-4 text-muted-foreground">
              Search Console and Analytics properties are discovered during
              connection. PageSpeed uses an application-owned quota key and does
              not require access to a user account.
            </AlertDescription>
          </Alert>
        </div>
      </main>
    </>
  );
}

function ProviderCard({
  icon: Icon,
  title,
  status,
  description,
}: {
  icon: typeof SearchCheck;
  title: string;
  status: string;
  description: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <Badge variant="secondary" className="text-[10px]">
          {status}
        </Badge>
      </div>
      <h3 className="mt-2 text-xs font-semibold">{title}</h3>
      <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
        {description}
      </p>
    </section>
  );
}

function ConnectionScope({
  icon: Icon,
  title,
  description,
  action,
  busy,
  disabled,
  onAction,
}: {
  icon: typeof UserRound;
  title: string;
  description: string;
  action: string;
  busy: boolean;
  disabled?: boolean;
  onAction: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <h3 className="text-xs font-semibold">{title}</h3>
        <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
          {description}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2 h-7 gap-1 text-xs"
          disabled={busy || disabled}
          onClick={onAction}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {action} <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function ConnectionRow({
  connection,
  resourceCount,
  busy,
  onDisconnect,
}: {
  connection: GoogleConnectionSummary;
  resourceCount: number;
  busy: boolean;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-xs font-semibold">
            {connection.account_name ||
              connection.account_email ||
              "Google account"}
          </span>
          <Badge
            variant={connection.status === "connected" ? "success" : "warning"}
          >
            {connection.status === "connected"
              ? "Connected"
              : "Needs attention"}
          </Badge>
          <Badge variant="outline">
            {connection.owner_type === "organization"
              ? "Organization"
              : "Personal"}
          </Badge>
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {connection.account_email || "Email unavailable"} · {resourceCount}{" "}
          discovered propert{resourceCount === 1 ? "y" : "ies"}
        </p>
        {connection.last_error ? (
          <p className="mt-1 max-w-3xl text-[10px] text-amber-700 dark:text-amber-400">
            {connection.last_error}
          </p>
        ) : null}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 text-xs text-destructive"
        disabled={busy}
        onClick={onDisconnect}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Unplug className="h-3.5 w-3.5" />
        )}
        Disconnect
      </Button>
    </div>
  );
}
