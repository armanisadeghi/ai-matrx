"use client";

import { useEffect, useRef, useState } from "react";
import { PinterestDataPanel } from "./PinterestDataPanel";
import { pinterestRequest } from "./pinterest-service";
import { AlertCircle, Link2, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, RegionSkeleton } from "@ai-matrx/design-system/controls";
import { toast } from "@/lib/toast";
import {
  CUSTOMER_SOCIAL_PROVIDERS,
  type CustomerSocialConnection,
  type CustomerSocialProvider,
  type SocialProviderConfig,
  type SocialIdentity,
  type SocialResource,
  selectCustomerSocialAccount,
  disconnectCustomerSocialAccount,
  discoverCustomerSocialAccount,
  loadCustomerSocialConnections,
  loadSocialConfigs,
  readCustomerSocialAccount,
  refreshCustomerSocialAccount,
  socialAuthorizeUrl,
} from "./customer-service";

const LABELS: Record<CustomerSocialProvider, string> = { facebook: "Facebook Pages", instagram: "Instagram", threads: "Threads", pinterest: "Pinterest", linkedin: "LinkedIn", discord: "Discord", twitch: "Twitch", snapchat: "Snapchat", reddit: "Reddit", bluesky: "Bluesky", mastodon: "Mastodon" };
const CONNECTABLE = new Set<CustomerSocialProvider>(["facebook", "instagram", "threads", "pinterest","linkedin", "discord", "twitch", "snapchat", "reddit", "mastodon", "bluesky"]);
type ConnectableProvider = CustomerSocialProvider;

interface AccountLoadRequest {
  organizationId: string;
  clearExisting: boolean;
  generationRef: { current: number };
  setConfigs: (configs: SocialProviderConfig[]) => void;
  setConnections: (connections: CustomerSocialConnection[]) => void;
  setLoading: (loading: boolean) => void;
  setReceipts: (receipts: Record<string, { subject: SocialIdentity; resources: SocialResource[] }>) => void;
}

function loadAccounts({ organizationId, clearExisting, generationRef, setConfigs, setConnections, setLoading, setReceipts }: AccountLoadRequest): void {
  const generation = generationRef.current + 1;
  generationRef.current = generation;
  const isCurrent = () => generationRef.current === generation;
  if (!isCurrent()) return;
  setLoading(true);
  if (clearExisting) {
    setConfigs([]);
    setConnections([]);
    setReceipts({});
  }
  const configsRequest = loadSocialConfigs(organizationId)
    .then((configs) => { if (isCurrent()) setConfigs(configs); })
    .catch((error: unknown) => {
      if (!isCurrent()) return;
      setConfigs([]);
      toast.error(error instanceof Error ? error.message : "Could not load social accounts.");
    });
  const connectionsRequest = loadCustomerSocialConnections()
    .then((connections) => { if (isCurrent()) setConnections(connections); })
    .catch((error: unknown) => {
      if (!isCurrent()) return;
      setConnections([]);
      toast.error(error instanceof Error ? error.message : "Could not load saved accounts.");
    });
  void Promise.allSettled([configsRequest, connectionsRequest]).then(() => {
    if (isCurrent()) setLoading(false);
  });
}

export function CustomerAccountsPanel({ organizationId, brandId, returnUrl = "/user-settings/integrations", providers = CUSTOMER_SOCIAL_PROVIDERS }: { organizationId: string; brandId?: string; returnUrl?: string; providers?: readonly CustomerSocialProvider[] }) {
  const [configs, setConfigs] = useState<SocialProviderConfig[]>([]);
  const [connections, setConnections] = useState<CustomerSocialConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<{ connectionId: string; token: number } | null>(null);
  const [receipts, setReceipts] = useState<Record<string, {subject: SocialIdentity; resources: SocialResource[]}>>({});
  const [mastodonIssuer, setMastodonIssuer] = useState("");
  const [blueskyHandle, setBlueskyHandle] = useState("");
  const generationRef = useRef(0);
  const contextTokenRef = useRef(0);
  const actionTokenRef = useRef(0);
  const organizationRef = useRef(organizationId);
  organizationRef.current = organizationId;
  const refresh = () => {
    loadAccounts({ organizationId, clearExisting: false, generationRef, setConfigs, setConnections, setLoading, setReceipts });
  };
  useEffect(() => {
    contextTokenRef.current += 1;
    setAction(null);
    loadAccounts({ organizationId, clearExisting: true, generationRef, setConfigs, setConnections, setLoading, setReceipts });
    return () => {
      contextTokenRef.current += 1;
      generationRef.current += 1;
    };
  }, [organizationId]);
  const connect = (provider: ConnectableProvider, issuer?: string | null, reconnectConnectionId?: string) => {
    if (provider === "mastodon" && !issuer?.trim()) { toast.error("Enter your Mastodon server address."); return; }
    const reconnect = connections.find((connection) => connection.id === reconnectConnectionId);
    const handle = reconnect?.provider === "bluesky" ? reconnect.accountName || reconnect.providerSubject || "" : blueskyHandle;
    if (provider === "bluesky" && !handle.trim()) { toast.error("Enter your Bluesky handle."); return; }
    window.location.assign(socialAuthorizeUrl(provider, organizationId, issuer?.trim(), provider === "bluesky" ? handle.trim() : undefined, reconnectConnectionId, returnUrl));
  };
  const run = async (connection: CustomerSocialConnection, operation: "read" | "discover" | "refresh" | "disconnect") => {
    const operationOrganizationId = organizationId;
    const contextToken = contextTokenRef.current;
    const actionToken = actionTokenRef.current + 1;
    actionTokenRef.current = actionToken;
    const ownsOperation = () => contextTokenRef.current === contextToken && actionTokenRef.current === actionToken && organizationRef.current === operationOrganizationId;
    if (!ownsOperation()) return;
    setAction({ connectionId: connection.id, token: actionToken });
    try {
      if (operation === "read") { const receipt = await readCustomerSocialAccount(connection.provider, operationOrganizationId, connection.id); if (!ownsOperation()) return; setReceipts((current) => ({...current, [connection.id]: receipt})); toast.success("Account checked."); }
      if (operation === "discover") { const receipt = await discoverCustomerSocialAccount(connection.provider, operationOrganizationId, connection.id); if (!ownsOperation()) return; setReceipts((current) => ({...current, [connection.id]: receipt})); }
      if (operation === "refresh") {
        try { await refreshCustomerSocialAccount(connection.provider, operationOrganizationId, connection.id); }
        catch (error) {
          if (!(error instanceof Error) || !error.message.includes("protocol_not_supported")) throw error;
          await readCustomerSocialAccount(connection.provider, operationOrganizationId, connection.id);
        }
        if (!ownsOperation()) return;
        toast.success("Account checked.");
      }
      if (operation === "disconnect") {
        const receipt = await disconnectCustomerSocialAccount(connection.provider, operationOrganizationId, connection.id);
        if (!ownsOperation()) return;
        setReceipts((current) => { const next = {...current}; delete next[connection.id]; return next; });
        if (receipt.providerRevocation === "retained") toast.success("Disconnected from AI Matrx; Meta authorization remains.");
        else if (receipt.providerRevocation === "failed") toast.warning("Disconnected from AI Matrx; provider access could not be revoked.");
        else toast.success("Account disconnected.");
      }
      if (!ownsOperation()) return;
      setAction(null);
      refresh();
    } catch (error) {
      if (!ownsOperation()) return;
      toast.error(error instanceof Error ? error.message : "Account request failed.");
      setAction(null);
      refresh();
    } finally { if (ownsOperation()) setAction(null); }
  };
  // Until the provider configuration has loaded nothing is "unavailable" yet.
  if (loading && configs.length === 0) return <RegionSkeleton shape="cards" count={3} aria-label="Loading social accounts" />;
  return <section className="space-y-3" aria-label="Social accounts">
    <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold">Social accounts</h2><Button variant="quiet" onClick={() => void refresh()} disabled={loading} icon={<RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}>Refresh</Button></div>
    <div className="grid gap-3 md:grid-cols-2">{providers.map((provider) => {
      const config = configs.find((item) => item.provider === provider);
      const accounts = connections.filter((item) => item.provider === provider);
      const connected = accounts.filter((item) => item.status === "connected");
      const needsAttention = accounts.filter((item) => item.status !== "connected");
      const allDisconnected = accounts.length > 0 && accounts.every((item) => item.status === "disconnected");
      const issuer = provider === "mastodon" ? mastodonIssuer || accounts.find((item) => item.issuer)?.issuer || "" : undefined;
      const unavailable = !config || config.status === "unavailable" || !CONNECTABLE.has(provider);
      const status = connected.length ? "Connected" : allDisconnected ? "Disconnected" : needsAttention.length ? "Needs attention" : unavailable ? "Unavailable" : "Not connected";
      return <Card key={provider}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-medium">{LABELS[provider]}</h3><Badge variant="outline" className={connected.length ? "text-green-700" : needsAttention.length && !allDisconnected ? "text-amber-700" : "text-muted-foreground"}>{status}</Badge></div>
        {unavailable && <p className="text-sm text-muted-foreground">{config?.reason ?? "This provider is not available."}</p>}
        {provider === "pinterest" && <Badge variant="outline">Approved testers · Trial access</Badge>}
        {provider === "linkedin" && <Badge variant="outline">Profile insights unavailable</Badge>}
        {["facebook", "instagram", "threads"].includes(provider) && config?.accessMode !== "approved" && <Badge variant="outline">Approved testers only</Badge>}
        {!unavailable && provider === "mastodon" && <Input aria-label="Mastodon server" placeholder="https://mastodon.social" value={issuer} onChange={(event) => setMastodonIssuer(event.target.value)} />}
        {!unavailable && provider === "bluesky" && <Input aria-label="Bluesky handle" placeholder="your-name.bsky.social" value={blueskyHandle} onChange={(event) => setBlueskyHandle(event.target.value)} />}
        {connected.map((connection) => <div className="space-y-2 text-sm" key={connection.id}>
          <div className="flex flex-wrap items-center justify-between gap-2"><span>{connection.accountName ?? connection.providerSubject ?? "Connected account"}</span><div className="flex flex-wrap gap-1">
            <Button variant="outline" disabled={unavailable || action?.connectionId === connection.id} onClick={() => void run(connection, "read")}>Check</Button>
            <Button variant="outline" disabled={unavailable || action?.connectionId === connection.id} onClick={() => void run(connection, "discover")}>Discover</Button>
            <Button variant="outline" disabled={unavailable || action?.connectionId === connection.id} onClick={() => void run(connection, "refresh")}>Renew access</Button>
            <Button variant="outline" disabled={action?.connectionId === connection.id} onClick={() => void run(connection, "disconnect")} icon={<Unplug className="h-3.5 w-3.5" />}>Disconnect</Button>
          </div></div>
          {receipts[connection.id] && <div className="space-y-2 rounded-md border p-3" aria-label="Account result">
            <div className="font-medium">{receipts[connection.id].subject.display_name}</div>
            {receipts[connection.id].subject.email && <div>{receipts[connection.id].subject.email}</div>}
            {receipts[connection.id].resources.map((resource) => <div className="flex items-center justify-between gap-2" key={`${resource.resource_type}:${resource.resource_ref}`}><span>{resource.display_name}</span><Button variant="outline" disabled={(brandId && ["facebook", "instagram", "threads"].includes(provider) ? resource.attachedBrandId === brandId : resource.selected) || action?.connectionId === connection.id} onClick={async () => {
            const actionToken = actionTokenRef.current + 1;
            const selectionOrganizationId = organizationId;
            const selectionContextToken = contextTokenRef.current;
            const ownsSelection = () => actionTokenRef.current === actionToken && contextTokenRef.current === selectionContextToken && organizationRef.current === selectionOrganizationId;
            actionTokenRef.current = actionToken;
            if (!ownsSelection()) return;
            setAction({ connectionId: connection.id, token: actionToken });
              try { if (provider === "pinterest") await pinterestRequest("attach", selectionOrganizationId, {connection_id: connection.id, resource_ref: resource.resource_ref}); else await selectCustomerSocialAccount(provider, selectionOrganizationId, connection.id, resource, brandId); if (!ownsSelection()) return; const receipt = await discoverCustomerSocialAccount(provider, selectionOrganizationId, connection.id); if (!ownsSelection()) return; setReceipts((current) => ({...current, [connection.id]: receipt})); }
              catch (error) { if (ownsSelection()) toast.error(error instanceof Error ? error.message : "Selection failed."); }
              finally { if (ownsSelection()) setAction(null); }
            }}>{brandId && ["facebook", "instagram", "threads"].includes(provider) ? resource.attachedBrandId === brandId ? "Attached" : "Attach" : resource.selected ? "Selected" : "Select"}</Button></div>)}
          </div>}
          {provider === "pinterest" && <PinterestDataPanel organizationId={organizationId} connectionId={connection.id} selectionVersion={receipts[connection.id]} />}
        </div>)}
        {needsAttention.map((connection) => <div className="flex flex-wrap items-center justify-between gap-2 text-sm" key={connection.id}><span className="flex items-center gap-1.5"><AlertCircle className="h-4 w-4" />{connection.accountName ?? connection.providerSubject ?? "Account"} · {connection.status === "disconnected" ? "Disconnected" : "Reconnect required"}</span><div className="flex gap-1">{provider === "bluesky" && connection.status !== "disconnected" && <Button variant="outline" disabled={unavailable || action?.connectionId === connection.id} onClick={() => void run(connection, "read")}>Check</Button>}<Button disabled={unavailable || action?.connectionId === connection.id} onClick={() => connect(provider, provider === "mastodon" ? connection.issuer : undefined, ["linkedin", "bluesky", "facebook", "instagram", "threads"].includes(provider) ? connection.id : undefined)} icon={<Link2 className="h-3.5 w-3.5" />}>Reconnect</Button>{connection.status !== "disconnected" && <Button variant="outline" disabled={action?.connectionId === connection.id} onClick={() => void run(connection, "disconnect")}>Disconnect</Button>}</div></div>)}
        {provider === "pinterest" && needsAttention.map((connection) => <PinterestDataPanel key={connection.id} organizationId={organizationId} connectionId={connection.id} selectionVersion={connection.status} />)}
        <Button disabled={unavailable} variant={accounts.length ? "outline" : "primary"} onClick={() => connect(provider as ConnectableProvider, provider === "mastodon" ? issuer : undefined)} icon={<Link2 className="h-3.5 w-3.5" />}>{accounts.length ? "Connect another" : "Connect"}</Button>
      </CardContent></Card>;
    })}</div>
  </section>;
}
