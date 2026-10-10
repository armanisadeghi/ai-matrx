"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertCircle, Check, Link2, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import {
  CUSTOMER_SOCIAL_PROVIDERS,
  type CustomerSocialConnection,
  type CustomerSocialProvider,
  type SocialProviderConfig,
  disconnectCustomerSocialAccount,
  discoverCustomerSocialAccount,
  loadCustomerSocialConnections,
  loadSocialConfigs,
  readCustomerSocialAccount,
  refreshCustomerSocialAccount,
  socialAuthorizeUrl,
} from "./customer-service";

const PROVIDER_LABELS: Record<CustomerSocialProvider, string> = { discord: "Discord", twitch: "Twitch", snapchat: "Snapchat", reddit: "Reddit", bluesky: "Bluesky", mastodon: "Mastodon" };
const CONNECTABLE = new Set<CustomerSocialProvider>(["discord", "twitch", "snapchat"]);

export function CustomerAccountsPanel({ organizationId }: { organizationId: string }) {
  const [configs, setConfigs] = useState<SocialProviderConfig[]>([]);
  const [connections, setConnections] = useState<CustomerSocialConnection[]>([]);
  const [loading, startTransition] = useTransition();
  const [action, setAction] = useState<CustomerSocialProvider | null>(null);
  const refresh = () => startTransition(() => void Promise.all([loadSocialConfigs(organizationId), loadCustomerSocialConnections()]).then(([nextConfigs, nextConnections]) => { setConfigs(nextConfigs); setConnections(nextConnections); }).catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not load social accounts.")));
  useEffect(() => { refresh(); }, [organizationId]);
  const connectionFor = (provider: CustomerSocialProvider) => connections.find((connection) => connection.provider === provider) ?? null;
  const configFor = (provider: CustomerSocialProvider) => configs.find((config) => config.provider === provider);
  const run = async (provider: CustomerSocialProvider, operation: "read" | "discover" | "refresh" | "disconnect") => {
    const connection = connectionFor(provider);
    if (!connection) return;
    setAction(provider);
    try {
      if (operation === "read") { const receipt = await readCustomerSocialAccount(provider, organizationId, connection.id); toast.success(`${receipt.subject.display_name} verified.`); }
      if (operation === "discover") { await discoverCustomerSocialAccount(provider, organizationId, connection.id); toast.success("Account resources updated."); }
      if (operation === "refresh") { await refreshCustomerSocialAccount(provider, organizationId, connection.id); toast.success("Account checked."); }
      if (operation === "disconnect") { await disconnectCustomerSocialAccount(provider, organizationId, connection.id); toast.success("Account disconnected."); }
      refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Account request failed."); }
    finally { setAction(null); }
  };
  return <section className="space-y-3" aria-label="Social accounts">
    <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold">Social accounts</h2><Button variant="quiet" size="sm" onClick={refresh} disabled={loading} icon={<RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}>Refresh</Button></div>
    <div className="grid gap-3 md:grid-cols-2">{CUSTOMER_SOCIAL_PROVIDERS.map((provider) => {
      const config = configFor(provider);
      const connection = connectionFor(provider);
      const unavailable = config?.status === "unavailable" || !CONNECTABLE.has(provider);
      return <Card key={provider}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{PROVIDER_LABELS[provider]}</h3>{connection?.accountName && <p className="text-sm text-muted-foreground">{connection.accountName}</p>}</div><Badge variant="outline" className={connection?.status === "connected" ? "text-green-700" : connection?.status === "needs_attention" ? "text-amber-700" : "text-muted-foreground"}>{connection?.status === "connected" ? "Connected" : connection?.status === "needs_attention" ? "Needs attention" : unavailable ? "Unavailable" : "Not connected"}</Badge></div>
        {unavailable ? <p className="text-sm text-muted-foreground">{config?.reason ?? "This provider is not available."}</p> : connection ? <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={action === provider} onClick={() => void run(provider, "read")}>Check account</Button><Button size="sm" variant="outline" disabled={action === provider} onClick={() => void run(provider, "discover")}>Discover</Button><Button size="sm" variant="outline" disabled={action === provider} onClick={() => void run(provider, "refresh")}>Health</Button><Button size="sm" variant="outline" disabled={action === provider} onClick={() => void run(provider, "disconnect")} icon={<Unplug className="h-3.5 w-3.5" />}>Disconnect</Button></div> : <Button size="sm" onClick={() => { window.location.assign(socialAuthorizeUrl(provider, organizationId)); }} icon={<Link2 className="h-3.5 w-3.5" />}>Connect</Button>}
        {connection?.status === "needs_attention" && <p className="flex items-center gap-1.5 text-sm text-amber-700"><AlertCircle className="h-4 w-4" />Reconnect to restore access.</p>}
      </CardContent></Card>;
    })}</div>
  </section>;
}
