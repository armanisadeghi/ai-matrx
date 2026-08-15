"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  ExternalLink,
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { MarketingSite } from "@/features/marketing/types";

const BING_WEBMASTER_URL = "https://www.bing.com/webmasters";

function propertyKey(value: string): string {
  const candidate = value.includes("://") ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "").toLowerCase();
    return `${host}${path}`;
  } catch {
    return value
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/+$/, "");
  }
}

function findMatchingProperty(
  site: MarketingSite,
  resources: Array<{ resource_ref: string; display_name: string }>,
) {
  const siteKeys = new Set(
    [site.root_url, site.domain].filter(Boolean).map(propertyKey),
  );
  return resources.find(
    (resource) =>
      siteKeys.has(propertyKey(resource.resource_ref)) ||
      siteKeys.has(propertyKey(resource.display_name)),
  );
}

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
  const [showAddConnection, setShowAddConnection] = useState(false);

  const connections = inventory.data?.connections ?? [];
  const usableConnections = connections.filter((c) => c.status !== "revoked");
  const resources = inventory.data?.resources ?? [];
  const organizationSites = useMemo(
    () =>
      (sites.data ?? []).filter(
        (site) =>
          !organizations.activeOrgId ||
          site.organization_id === organizations.activeOrgId,
      ),
    [organizations.activeOrgId, sites.data],
  );
  const selectedSite = organizationSites.find((site) => site.id === siteId);
  const currentBinding = selectedSite
    ? parseBingSiteBinding(selectedSite.integrations)
    : null;
  const connectionsForSite = selectedSite
    ? usableConnections.filter(
        (connection) =>
          connection.owner_type === "user" ||
          connection.organization_id === selectedSite.organization_id,
      )
    : usableConnections;
  const organizationConnection = selectedSite
    ? connectionsForSite.find(
        (connection) =>
          connection.owner_type === "organization" &&
          connection.organization_id === selectedSite.organization_id,
      )
    : undefined;
  const selectedConnectionId =
    connectionId &&
    connectionsForSite.some((connection) => connection.id === connectionId)
      ? connectionId
      : (organizationConnection?.id ??
        (connectionsForSite.length === 1 ? connectionsForSite[0]?.id : ""));
  const resourcesForConnection = resources.filter(
    (resource) => resource.connection_id === selectedConnectionId,
  );
  const matchingProperty = selectedSite
    ? findMatchingProperty(selectedSite, resourcesForConnection)
    : undefined;
  const selectedResourceRef =
    resourceRef || matchingProperty?.resource_ref || "";
  const alreadyBound = Boolean(
    currentBinding?.enabled &&
    currentBinding.resource_ref === selectedResourceRef,
  );
  const showConnectionForm =
    !inventory.isLoading && (!usableConnections.length || showAddConnection);

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
            ? {
                type: "organization",
                organizationId: organizations.activeOrgId,
              }
            : { type: "user" },
      });
      setApiKey("");
      setShowAddConnection(false);
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
    if (!selectedSite || !selectedConnectionId || !selectedResourceRef) return;
    try {
      await bind.mutateAsync({
        organizationId: selectedSite.organization_id,
        siteId: selectedSite.id,
        connectionId: selectedConnectionId,
        resourceRef: selectedResourceRef,
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
      <main className="h-full overflow-y-auto bg-textured px-3 pb-4 pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-4">
        <div className="mx-auto max-w-4xl space-y-3">
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
                Connect Bing once, then choose which managed sites should
                receive Bing search-performance data.
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
                    <h2 className="text-sm font-semibold">
                      Step 1 — Connect Bing Webmaster
                    </h2>
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
                    AI Matrx uses a Bing API key to discover your verified sites
                    and sync their search data.
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

            {inventory.isError ? (
              <div className="flex items-center justify-between gap-3 p-3">
                <p className="text-xs text-destructive">
                  We couldn&apos;t check your Bing connection.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => inventory.refetch()}
                >
                  Try again
                </Button>
              </div>
            ) : null}

            {showConnectionForm ? (
              <div className="grid gap-4 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs font-semibold">Get your API key</p>
                  <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs text-muted-foreground marker:font-semibold marker:text-foreground">
                    <li>Open Bing Webmaster Tools and sign in.</li>
                    <li>
                      Click{" "}
                      <span className="font-medium text-foreground">
                        Settings
                      </span>
                      , then{" "}
                      <span className="font-medium text-foreground">
                        API access
                      </span>
                      .
                    </li>
                    <li>
                      Choose{" "}
                      <span className="font-medium text-foreground">
                        API Key
                      </span>
                      , generate the key, and copy it.
                    </li>
                  </ol>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="mt-3 gap-1.5"
                  >
                    <a
                      href={BING_WEBMASTER_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open Bing Webmaster
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </div>

                <div className="flex flex-col justify-center">
                  <Label
                    htmlFor="bing-api-key"
                    className="text-xs font-semibold"
                  >
                    Paste your Bing API key
                  </Label>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    The key is saved securely and is not shown again after
                    connection.
                  </p>
                  <Input
                    id="bing-api-key"
                    type="password"
                    autoFocus={!usableConnections.length}
                    autoComplete="off"
                    spellCheck={false}
                    className="mt-2 h-9 w-full font-mono text-xs"
                    placeholder="Paste API key here"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {organizations.activeOrgId ? (
                      <Button
                        size="sm"
                        className="h-8 gap-1.5"
                        disabled={connectingOwner !== null || !apiKey.trim()}
                        onClick={() => void startConnect("organization")}
                      >
                        {connectingOwner === "organization" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Building2 className="h-3.5 w-3.5" />
                        )}
                        Connect for{" "}
                        {organizations.activeOrgName ?? "organization"}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant={
                        organizations.activeOrgId ? "outline" : "default"
                      }
                      className="h-8 gap-1.5"
                      disabled={connectingOwner !== null || !apiKey.trim()}
                      onClick={() => void startConnect("user")}
                    >
                      {connectingOwner === "user" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <UserRound className="h-3.5 w-3.5" />
                      )}
                      Only for me
                    </Button>
                    {usableConnections.length ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => {
                          setApiKey("");
                          setShowAddConnection(false);
                        }}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                  {organizations.activeOrgId ? (
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Recommended: connect for{" "}
                      {organizations.activeOrgName ?? "your organization"} so
                      teammates can use the same verified properties.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {usableConnections.length ? (
              <div className="border-t border-border">
                <div className="divide-y divide-border">
                  {usableConnections.map((connection) => (
                    <ConnectionRow
                      key={connection.id}
                      connection={connection}
                      organizationName={organizations.activeOrgName}
                      siteCount={
                        resources.filter(
                          (r) => r.connection_id === connection.id,
                        ).length
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
                              error instanceof Error
                                ? error.message
                                : undefined,
                          });
                        }
                      }}
                    />
                  ))}
                </div>
                {!showAddConnection ? (
                  <div className="border-t border-border px-3 py-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setShowAddConnection(true)}
                    >
                      Add another Bing connection
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          {usableConnections.length ? (
            <section
              id="site-bindings"
              className="rounded-lg border border-border bg-card"
            >
              <div className="border-b border-border px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Link2 className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold">
                      Step 2 — Connect a managed site
                    </h2>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Choose a site. AI Matrx will find its matching verified
                      Bing property.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-3 p-3">
                <div>
                  <Label className="text-xs">Managed site</Label>
                  <Select
                    value={siteId || undefined}
                    onValueChange={(value) => {
                      setSiteId(value);
                      setConnectionId("");
                      setResourceRef("");
                    }}
                  >
                    <SelectTrigger className="mt-1 w-full sm:w-80" size="sm">
                      <SelectValue
                        placeholder={
                          sites.isLoading ? "Loading sites…" : "Choose a site"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {organizationSites.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.name} · {site.domain}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedSite && connectionsForSite.length > 1 ? (
                  <div>
                    <Label className="text-xs">Bing connection</Label>
                    <Select
                      value={selectedConnectionId || undefined}
                      onValueChange={(value) => {
                        setConnectionId(value);
                        setResourceRef("");
                      }}
                    >
                      <SelectTrigger className="mt-1 w-full sm:w-80" size="sm">
                        <SelectValue placeholder="Choose who owns this connection" />
                      </SelectTrigger>
                      <SelectContent>
                        {connectionsForSite.map((connection) => (
                          <SelectItem key={connection.id} value={connection.id}>
                            {connection.owner_type === "organization"
                              ? `${organizations.activeOrgName ?? "Organization"} shared connection`
                              : "My personal connection"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {selectedSite && selectedConnectionId ? (
                  resourcesForConnection.length ? (
                    <div className="space-y-2">
                      {matchingProperty ? (
                        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <div>
                            <p className="text-xs font-medium">
                              Matching Bing property found
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {matchingProperty.display_name}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <Label className="text-xs">
                            Verified Bing property
                          </Label>
                          <Select
                            value={selectedResourceRef || undefined}
                            onValueChange={setResourceRef}
                          >
                            <SelectTrigger
                              className="mt-1 w-full sm:w-80"
                              size="sm"
                            >
                              <SelectValue placeholder="Choose the matching Bing property" />
                            </SelectTrigger>
                            <SelectContent>
                              {resourcesForConnection.map((resource) => (
                                <SelectItem
                                  key={resource.id}
                                  value={resource.resource_ref}
                                >
                                  {resource.display_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            We couldn&apos;t identify an exact match
                            automatically. Choose only the property for{" "}
                            {selectedSite.domain}.
                          </p>
                        </div>
                      )}
                      <Button
                        size="sm"
                        className="h-8 gap-1.5"
                        disabled={
                          !selectedResourceRef || bind.isPending || alreadyBound
                        }
                        onClick={() => void runBind()}
                      >
                        {bind.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : alreadyBound ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <Link2 className="h-3.5 w-3.5" />
                        )}
                        {alreadyBound
                          ? "Connected"
                          : `Connect ${selectedSite.domain}`}
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <p className="text-xs font-medium">
                        No verified Bing properties were found for this
                        connection.
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Add or import the site in Bing Webmaster, then refresh
                        this page.
                      </p>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="mt-2 gap-1.5"
                      >
                        <a
                          href={BING_WEBMASTER_URL}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open Bing Webmaster
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    </div>
                  )
                ) : null}

                {selectedSite && !connectionsForSite.length ? (
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs font-medium">
                      This site needs a connection for its organization.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => setShowAddConnection(true)}
                    >
                      Add connection
                    </Button>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </>
  );
}

function ConnectionRow({
  connection,
  organizationName,
  siteCount,
  busy,
  onDisconnect,
}: {
  connection: BingConnectionSummary;
  organizationName: string | null;
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
            {connection.owner_type === "organization"
              ? `${organizationName ?? "Organization"} shared connection`
              : "My personal Bing connection"}
          </span>
          <Badge variant={usable ? "success" : "warning"}>
            {usable ? "Connected" : "Needs attention"}
          </Badge>
          <Badge variant="outline">
            {connection.owner_type === "organization"
              ? "Organization"
              : "Personal"}
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
