"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Building2,
  KeyRound,
  Link2,
  Loader2,
  RefreshCw,
  Unplug,
  UserRound,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  useBindBingSite,
  useBingConnectionInventory,
  useConnectBingApiKey,
  useDisconnectBing,
} from "@/features/marketing/bing/hooks";
import type { BingConnectionSummary } from "@/features/marketing/bing/types";
import { parseBingSiteBinding } from "@/features/marketing/bing/binding";

export function BingConnectionsWorkspace() {
  const sites = useSiteOptions();
  const organizations = useActiveOrganizationPicker();
  const inventory = useBingConnectionInventory();
  const connect = useConnectBingApiKey();
  const bind = useBindBingSite();
  const disconnect = useDisconnectBing();

  const [apiKey, setApiKey] = useState("");
  const [connectingOwner, setConnectingOwner] = useState<
    "user" | "organization" | null
  >(null);
  const [siteId, setSiteId] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [resourceRef, setResourceRef] = useState("");

  const connections = inventory.data?.connections ?? [];
  const usableConnections = connections.filter((c) => c.status !== "revoked");
  const resources = inventory.data?.resources ?? [];
  const selectedSite = (sites.data ?? []).find((site) => site.id === siteId);
  const currentBinding = selectedSite
    ? parseBingSiteBinding(selectedSite.integrations)
    : null;
  const resourcesForConnection = resources.filter(
    (resource) => resource.connection_id === connectionId,
  );

  const startConnect = async (owner: "user" | "organization") => {
    if (!apiKey.trim()) {
      toast.error("Enter a Bing Webmaster API key first.");
      return;
    }
    setConnectingOwner(owner);
    try {
      await connect.mutateAsync({
        apiKey: apiKey.trim(),
        owner:
          owner === "organization" && organizations.activeOrgId
            ? { type: "organization", organizationId: organizations.activeOrgId }
            : { type: "user" },
      });
      setApiKey("");
      toast.success("Bing Webmaster connected and sites discovered.");
    } catch (error) {
      toast.error("Could not connect Bing Webmaster", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setConnectingOwner(null);
    }
  };

  const runBind = async () => {
    if (!selectedSite || !connectionId || !resourceRef) return;
    try {
      await bind.mutateAsync({
        organizationId: selectedSite.organization_id,
        siteId: selectedSite.id,
        connectionId,
        resourceRef,
      });
      toast.success(`Bing Webmaster bound to ${selectedSite.domain}.`);
    } catch (error) {
      toast.error("Could not bind the Bing Webmaster site", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <>
      <RouteHeader
        left={
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Bing Webmaster Connection
          </h1>
        }
        center={<MarketingWorkspaceNav />}
      />
      <main className="h-full overflow-y-auto bg-textured px-3 pb-4 pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-4">
        <div className="space-y-3">
          <section className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-3">
            <div>
              <Link
                href="/marketing/connections"
                className="text-[10px] font-medium text-primary"
              >
                Connections
              </Link>
              <h2 className="mt-0.5 text-sm font-semibold">Bing Webmaster</h2>
              <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">
                Connect a Bing Webmaster Tools API key, then bind the exact
                verified site to a managed site for search-performance sync.
                Generate a key from Bing Webmaster Tools → Settings → API
                Access.
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <KeyRound className="h-4 w-4" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">API key connections</h2>
                    <Badge
                      variant={
                        inventory.isLoading
                          ? "secondary"
                          : usableConnections.length
                            ? "success"
                            : "secondary"
                      }
                    >
                      {inventory.isLoading
                        ? "Checking connection…"
                        : usableConnections.length
                          ? `${usableConnections.length} connection${usableConnections.length === 1 ? "" : "s"}`
                          : "Not connected"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    OAuth (bring-your-own Bing app) is supported server-side
                    at `/bing-integrations/authorize-url` + `/exchange` but has
                    no UI yet — API key is the supported connect path here.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
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

            <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                className="h-8 w-full max-w-xs font-mono text-[11px]"
                placeholder="Bing Webmaster API key"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
              <Button
                size="sm"
                className="h-8 gap-1.5"
                disabled={connectingOwner !== null || !apiKey.trim()}
                onClick={() => void startConnect("user")}
              >
                {connectingOwner === "user" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserRound className="h-3.5 w-3.5" />
                )}
                Connect personally
              </Button>
              {organizations.activeOrgId ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5"
                  disabled={connectingOwner !== null || !apiKey.trim()}
                  onClick={() => void startConnect("organization")}
                >
                  {connectingOwner === "organization" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Building2 className="h-3.5 w-3.5" />
                  )}
                  Connect for organization
                </Button>
              ) : null}
            </div>

            {inventory.isError ? (
              <div className="flex items-center justify-between gap-3 p-3">
                <p className="text-xs text-destructive">
                  Bing connections could not be loaded.
                </p>
                <Button size="sm" variant="outline" onClick={() => inventory.refetch()}>
                  Try again
                </Button>
              </div>
            ) : usableConnections.length ? (
              <div className="divide-y divide-border">
                {usableConnections.map((connection) => (
                  <ConnectionRow
                    key={connection.id}
                    connection={connection}
                    siteCount={
                      resources.filter((r) => r.connection_id === connection.id).length
                    }
                    busy={disconnect.isPending}
                    onDisconnect={async () => {
                      try {
                        await disconnect.mutateAsync({
                          connectionId: connection.id,
                          organizationId: connection.organization_id,
                        });
                        toast.success("Bing Webmaster disconnected.");
                      } catch (error) {
                        toast.error("Could not disconnect", {
                          description:
                            error instanceof Error ? error.message : undefined,
                        });
                      }
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="p-3 text-xs text-muted-foreground">
                No Bing Webmaster connections yet.
              </p>
            )}
          </section>

          <section
            id="site-bindings"
            className="rounded-lg border border-border bg-card"
          >
            <div className="border-b border-border px-3 py-2">
              <h2 className="text-sm font-semibold">
                Bind a verified Bing property to a site
              </h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                The property URL must exactly match the managed site&apos;s
                root URL and be verified in Bing Webmaster Tools.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 p-3">
              <Select
                value={siteId || undefined}
                onValueChange={(value) => {
                  setSiteId(value);
                  setConnectionId("");
                  setResourceRef("");
                }}
              >
                <SelectTrigger className="w-full sm:w-64" size="sm">
                  <SelectValue
                    placeholder={sites.isLoading ? "Loading sites…" : "Select a site"}
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
              <Select
                value={connectionId || undefined}
                disabled={!siteId || !usableConnections.length}
                onValueChange={(value) => {
                  setConnectionId(value);
                  setResourceRef("");
                }}
              >
                <SelectTrigger className="w-full sm:w-56" size="sm">
                  <SelectValue placeholder="Bing connection" />
                </SelectTrigger>
                <SelectContent>
                  {usableConnections.map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      {connection.owner_type === "organization"
                        ? "Organization"
                        : "Personal"}{" "}
                      · {connection.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={resourceRef || undefined}
                disabled={!connectionId || !resourcesForConnection.length}
                onValueChange={setResourceRef}
              >
                <SelectTrigger className="w-full sm:w-64" size="sm">
                  <SelectValue
                    placeholder={
                      connectionId && !resourcesForConnection.length
                        ? "No verified sites discovered"
                        : "Bing property"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {resourcesForConnection.map((resource) => (
                    <SelectItem key={resource.id} value={resource.resource_ref}>
                      {resource.display_name}
                      {resource.metadata?.verified === false ? " (unverified)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-8 gap-1.5"
                disabled={!siteId || !connectionId || !resourceRef || bind.isPending}
                onClick={() => void runBind()}
              >
                {bind.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Link2 className="h-3.5 w-3.5" />
                )}
                Bind
              </Button>
            </div>
            {selectedSite ? (
              <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                {currentBinding?.enabled ? (
                  <span>
                    Currently bound to{" "}
                    <span className="font-medium text-foreground">
                      {currentBinding.resource_ref}
                    </span>
                    .
                  </span>
                ) : (
                  <span>{selectedSite.domain} has no active Bing Webmaster binding.</span>
                )}
              </div>
            ) : null}
          </section>
        </div>
      </main>
    </>
  );
}

function ConnectionRow({
  connection,
  siteCount,
  busy,
  onDisconnect,
}: {
  connection: BingConnectionSummary;
  siteCount: number;
  busy: boolean;
  onDisconnect: () => void;
}) {
  const usable = connection.status === "connected";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-xs font-semibold">
            Bing Webmaster · {connection.id.slice(0, 8)}
          </span>
          <Badge variant={usable ? "success" : "warning"}>
            {usable ? "Connected" : "Needs attention"}
          </Badge>
          <Badge variant="outline">
            {connection.owner_type === "organization" ? "Organization" : "Personal"}
          </Badge>
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {siteCount} discovered propert{siteCount === 1 ? "y" : "ies"}
          {connection.last_error ? ` · ${connection.last_error}` : ""}
        </p>
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
