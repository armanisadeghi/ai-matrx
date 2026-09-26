"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MICROSOFT_CAMPAIGN_DESCRIPTORS,
  MICROSOFT_DEFAULT_CAMPAIGNS,
  microsoftReturnMessage,
  type MicrosoftCampaign,
} from "@/features/microsoft-integration/campaigns";
import {
  disconnectMicrosoftConnection,
  listMicrosoftConnections,
  preflightMicrosoftConnection,
  startMicrosoftAuthorization,
} from "@/features/microsoft-integration/service";
import type { MicrosoftConnection } from "@/features/microsoft-integration/types";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/**
 * Connect a Microsoft work account.
 *
 * Deliberately a full-page redirect, not a popup: the server's callback already
 * redirects back to this exact settings tab with `?microsoft_status=…`, so the
 * outcome lands on the screen the person started from, survives a pop-up
 * blocker, and needs no second window to post a message back.
 */
export interface MicrosoftConnectPanelProps {
  /**
   * How the browser leaves for Microsoft. Injected so a test can prove we go
   * ONLY to a URL the server minted, and never to one this app built itself.
   */
  readonly navigate?: (url: string) => void;
  readonly onConnectionsChange?: (connections: MicrosoftConnection[] | "error") => void;
}

export function MicrosoftConnectPanel({
  navigate,
  onConnectionsChange,
}: MicrosoftConnectPanelProps = {}) {
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState<MicrosoftConnection[] | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [busyConnectionId, setBusyConnectionId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<MicrosoftCampaign>>(
    () => new Set(MICROSOFT_DEFAULT_CAMPAIGNS),
  );

  const returnStatus = searchParams?.get("microsoft_status") ?? null;
  const returnBanner = useMemo(
    () => (returnStatus ? microsoftReturnMessage(returnStatus) : null),
    [returnStatus],
  );

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const rows = await listMicrosoftConnections(signal);
      setConnections(rows);
      onConnectionsChange?.(rows);
      setLoadError(null);
    } catch (error) {
      if (signal?.aborted) return;
      // NOT an empty list: "you have none" and "we could not look" are
      // different sentences, and only one of them is true here.
      setConnections(null);
      onConnectionsChange?.("error");
      setLoadError(extractErrorMessage(error));
    }
  }, [onConnectionsChange]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await refresh(controller.signal);
    })();
    return () => controller.abort();
  }, [refresh, returnStatus]);

  const toggle = useCallback((campaign: MicrosoftCampaign) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(campaign)) next.delete(campaign);
      else next.add(campaign);
      return next;
    });
  }, []);

  const connect = useCallback(async () => {
    setStarting(true);
    try {
      // Identity is always requested: without it the connection has no name.
      const campaigns: MicrosoftCampaign[] = [
        "identity",
        ...MICROSOFT_CAMPAIGN_DESCRIPTORS.filter(
          (descriptor) =>
            !descriptor.alwaysOn && selected.has(descriptor.campaign),
        ).map((descriptor) => descriptor.campaign),
      ];
      const started = await startMicrosoftAuthorization(campaigns);
      const go = navigate ?? ((url: string) => window.location.assign(url));
      go(started.authorizationUrl);
    } catch (error) {
      setStarting(false);
      toast.error(extractErrorMessage(error));
    }
  }, [navigate, selected]);

  const recheck = useCallback(
    async (connectionId: string) => {
      setBusyConnectionId(connectionId);
      try {
        const result = await preflightMicrosoftConnection(connectionId);
        toast.success(`Microsoft still accepts this connection (${result.status}).`);
        await refresh();
      } catch (error) {
        toast.error(extractErrorMessage(error));
      } finally {
        setBusyConnectionId(null);
      }
    },
    [refresh],
  );

  const disconnect = useCallback(
    async (connection: MicrosoftConnection) => {
      setBusyConnectionId(connection.id);
      try {
        await disconnectMicrosoftConnection(connection.id);
        toast.success(
          `${connection.accountEmail ?? "That Microsoft account"} is disconnected. AI Matrx can no longer read anything from it.`,
        );
        await refresh();
      } catch (error) {
        toast.error(extractErrorMessage(error));
      } finally {
        setBusyConnectionId(null);
      }
    },
    [refresh],
  );

  return (
    <section id="integration-microsoft" className="scroll-mt-20 space-y-4 sm:space-y-6" data-testid="microsoft-connect-panel">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Microsoft</h2>
        <p className="text-sm text-muted-foreground">
          Connect a Microsoft work account so AI Matrx can read what is already
          in your OneDrive, your mailbox, your calendar, and your Teams chats.
          Every permission below is read-only; nothing is ever changed, sent, or
          deleted on your behalf.
        </p>
      </header>

      {returnBanner ? (
        <div
          role="status"
          className={
            returnBanner.tone === "success"
              ? "flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-900 dark:text-emerald-200"
              : "flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200"
          }
        >
          {returnBanner.tone === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{returnBanner.message}</span>
        </div>
      ) : null}

      {loadError ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {loadError} Your Microsoft accounts could not be listed, so this
            screen is showing none rather than pretending you have none.
          </span>
          <ErrorAlchemyMenu error={loadError} />
        </div>
      ) : null}

      {connections === null && loadError ? null : connections === null ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your Microsoft accounts…
        </div>
      ) : connections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No Microsoft account is connected yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {connections.map((connection) => (
            <li
              key={connection.id}
              id={`integration-microsoft-account-${connection.id}`}
              className="scroll-mt-20 flex flex-col gap-2 rounded-md border border-border p-2.5 sm:flex-row sm:items-center sm:justify-between sm:p-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {connection.accountEmail ??
                      connection.accountName ??
                      "Microsoft account"}
                  </span>
                  <Badge
                    variant={
                      connection.status === "connected"
                        ? "secondary"
                        : "destructive"
                    }
                  >
                    {connection.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {connection.scopes.length
                    ? `Can read: ${connection.scopes.join(", ")}`
                    : "No delegated permissions recorded on this connection."}
                </p>
                {connection.lastError ? (
                  <p className="text-xs text-destructive">
                    {connection.lastError}
                    <ErrorAlchemyMenu error={connection.lastError} />
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 sm:shrink-0">
                {/*
                  THE DOOR. A connected account that cannot be looked inside is
                  a row that names a thing and refuses to open it.
                */}
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-11 sm:h-8"
                >
                  <Link href="/connected-sources">
                    <Search className="mr-1.5 h-3.5 w-3.5" />
                    Browse everything
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 sm:h-8"
                  disabled={busyConnectionId === connection.id}
                  onClick={() => void recheck(connection.id)}
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Re-check
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 sm:h-8"
                  disabled={busyConnectionId === connection.id}
                  onClick={() => void disconnect(connection)}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Disconnect
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3 rounded-md border border-border p-2.5 sm:p-4">
        <h3 className="text-sm font-medium text-foreground">
          What AI Matrx may read
        </h3>
        <ul className="space-y-3">
          {MICROSOFT_CAMPAIGN_DESCRIPTORS.map((descriptor) => (
            <li key={descriptor.campaign} className="flex gap-3">
              <Checkbox
                id={`ms-campaign-${descriptor.campaign}`}
                className="mt-0.5 scroll-mt-20"
                checked={
                  descriptor.alwaysOn || selected.has(descriptor.campaign)
                }
                disabled={descriptor.alwaysOn}
                onCheckedChange={() => toggle(descriptor.campaign)}
              />
              <label
                htmlFor={`ms-campaign-${descriptor.campaign}`}
                className="min-w-0 space-y-0.5 text-sm"
              >
                <span className="block font-medium text-foreground">
                  {descriptor.label}
                  {descriptor.alwaysOn ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      always included
                    </span>
                  ) : null}
                </span>
                <span className="block text-muted-foreground">
                  {descriptor.grants}
                </span>
                {descriptor.cannot ? (
                  <span className="block text-xs text-muted-foreground">
                    Cannot: {descriptor.cannot}
                  </span>
                ) : null}
              </label>
            </li>
          ))}
        </ul>
        <Button
          onClick={() => void connect()}
          disabled={starting}
          className="h-11 max-w-full px-2 sm:px-4"
          aria-label={
            connections?.length
              ? "Connect another Microsoft account"
              : "Connect a Microsoft account"
          }
        >
          {starting ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-1.5 h-4 w-4" />
          )}
          <span className="sm:hidden">
            {connections?.length
              ? "Connect another account"
              : "Connect Microsoft"}
          </span>
          <span className="hidden sm:inline">
            {connections?.length
              ? "Connect another Microsoft account"
              : "Connect a Microsoft account"}
          </span>
        </Button>
        <p className="text-xs text-muted-foreground">
          You will finish signing in on Microsoft&apos;s own page and come back
          here. AI Matrx never sees your Microsoft password.
        </p>
      </div>
    </section>
  );
}
