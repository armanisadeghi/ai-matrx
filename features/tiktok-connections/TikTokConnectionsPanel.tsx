"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { components } from "@ai-matrx/agents/generated/api-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { attachTikTokAccount, discoverTikTokAccount, disconnectTikTokConnection, finishTikTokAuthorization,
  listTikTokConnections, refreshTikTokConnection, startTikTokAuthorization } from "./service";

export function TikTokConnectionsPanel() {
  const userId = useAppSelector(selectUserId);
  const organizationId = useAppSelector(selectOrganizationId);
  const params = useSearchParams();
  const [connections, setConnections] = useState<Awaited<ReturnType<typeof listTikTokConnections>> | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [discovery, setDiscovery] = useState<{ connectionId: string; account: components["schemas"]["TikTokDiscoveryResponse"] } | null>(null);
  const finishing = useRef<string | null>(null);
  const load = useCallback(async () => {
    try { setConnections(await listTikTokConnections()); setFailure(null); }
    catch (error) { setConnections(null); setFailure(extractErrorMessage(error)); }
  }, []);
  useEffect(() => { setDiscovery(null); void load(); }, [load, userId, organizationId]);
  useEffect(() => {
    const state = params?.get("tiktok_state"), code = params?.get("tiktok_code");
    if (!state || !code || !userId || !organizationId || finishing.current === state) return;
    finishing.current = state;
    // Remove the temporary authorization code before notifications/navigation.
    const url = new URL(window.location.href);
    url.searchParams.delete("tiktok_state"); url.searchParams.delete("tiktok_code");
    window.history.replaceState(null, "", url);
    setBusy(true);
    void finishTikTokAuthorization(state, code, userId, organizationId)
      .then(async () => { toast.success("TikTok connected. Select your account to track it."); await load(); })
      .catch(error => setFailure(extractErrorMessage(error))).finally(() => setBusy(false));
  }, [params, userId, organizationId, load]);

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); await load(); }
    catch (error) { setFailure(extractErrorMessage(error)); }
    finally { setBusy(false); }
  };
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3"><h3 className="font-medium">TikTok accounts</h3><Badge variant="secondary">Approved testers</Badge></div>
    <p className="text-sm text-muted-foreground">Connect your own account. Profile and public videos are read only.</p>
    <p className="text-sm text-muted-foreground">TikTok approval is pending. Access is limited to sandbox testers.</p>
    {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
    <Button disabled={busy || !userId || !organizationId} onClick={() => void act(async () => {
      if (!userId || !organizationId) throw new Error("Choose an organization to connect TikTok.");
      const started = await startTikTokAuthorization(userId, organizationId);
      window.location.assign(started.authorization_url);
    })}>Connect TikTok</Button>
    {connections === null && !failure && <p className="text-sm text-muted-foreground">Loading accounts…</p>}
    {connections?.map(connection => <div key={connection.id} className="rounded-md border p-3 space-y-2">
      <div className="flex justify-between gap-2"><span>{connection.account_name ?? "TikTok account"}</span><Badge variant="outline">{connection.status}</Badge></div>
      {connection.last_error && <p role="alert" className="text-sm text-destructive">{connection.last_error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy || connection.status !== "connected"} onClick={() => void act(async () => setDiscovery({ connectionId: connection.id, account: await discoverTikTokAccount(connection.id) }))}>Select account</Button>
        <Button variant="outline" disabled={busy} onClick={() => void act(() => refreshTikTokConnection(connection.id))}>Refresh access</Button>
        <Button variant="outline" disabled={busy} onClick={() => void act(async () => {
          if (!await confirm({ title: "Disconnect TikTok?", description: "Access stops. Collected history stays.", confirmLabel: "Disconnect", variant: "destructive" })) return;
          await disconnectTikTokConnection(connection.id); setDiscovery(null);
        })}>Disconnect</Button>
      </div>
    </div>)}
    {discovery && <div className="rounded-md border p-3 space-y-2">
      <p>{discovery.account.profile.username ? `@${discovery.account.profile.username}` : discovery.account.display_name ?? "TikTok account"}</p>
      <Button disabled={busy} onClick={() => void act(async () => {
        await attachTikTokAccount(discovery.connectionId, discovery.account.resource_ref);
        setDiscovery(null); toast.success("Account added to Social Accounts.");
      })}>Track account</Button>
    </div>}
  </div>;
}
