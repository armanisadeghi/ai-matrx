"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  CircleAlert,
  Cloud,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import {
  disconnectStorageConnection,
  listStorageConnections,
  refreshStorageConnection,
  startStorageAuthorization,
} from "@/features/storage-connections/service";
import type {
  StorageConnection,
  StorageOAuthProvider,
} from "@/features/storage-connections/types";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

interface ProviderCopy {
  readonly name: string;
  readonly scope: string;
  readonly limitation: string;
}

const PROVIDERS: Record<StorageOAuthProvider, ProviderCopy> = {
  dropbox: {
    name: "Dropbox",
    scope:
      "Read account identity, file names and folders, and file bytes. AI Matrx cannot create, change, move, or delete Dropbox content.",
    limitation:
      "During Dropbox app development, only the Dropbox account that owns the approved app can complete this connection.",
  },
  box: {
    name: "Box",
    scope:
      "Read files and folders visible from your Box root. AI Matrx cannot upload, change, move, or delete Box content.",
    limitation:
      "Box grants root-level read-only access. Existing Box permissions still decide which content is visible.",
  },
};

function returnMessage(status: string): {
  tone: "success" | "warning";
  message: string;
} {
  if (status === "connected") {
    return { tone: "success", message: "Your file connection is ready." };
  }
  if (status === "denied") {
    return {
      tone: "warning",
      message:
        "You cancelled on the provider's sign-in page. Nothing was connected.",
    };
  }
  if (status === "invalid_callback") {
    return {
      tone: "warning",
      message:
        "The provider returned without a usable authorization code. Nothing was connected.",
    };
  }
  return {
    tone: "warning",
    message:
      "The provider could not complete the connection. Nothing was saved as connected.",
  };
}

export interface StorageConnectionsPanelProps {
  readonly navigate?: (url: string) => void;
}

export function StorageConnectionsPanel({
  navigate,
}: StorageConnectionsPanelProps = {}) {
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState<StorageConnection[] | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const returnedProvider = searchParams?.get("provider");
  const returnStatus = searchParams?.get("oauth_status");
  const returnBanner = useMemo(() => {
    if (
      !returnStatus ||
      (returnedProvider !== "box" && returnedProvider !== "dropbox")
    ) {
      return null;
    }
    return returnMessage(returnStatus);
  }, [returnStatus, returnedProvider]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      setConnections(await listStorageConnections(signal));
      setLoadError(null);
    } catch (error) {
      if (signal?.aborted) return;
      setConnections(null);
      setLoadError(extractErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await refresh(controller.signal);
    })();
    return () => controller.abort();
  }, [refresh, returnStatus]);

  const connect = useCallback(
    async (provider: StorageOAuthProvider) => {
      setBusyKey(`connect:${provider}`);
      try {
        const started = await startStorageAuthorization(provider);
        const go = navigate ?? ((url: string) => window.location.assign(url));
        go(started.authorizationUrl);
      } catch (error) {
        setBusyKey(null);
        toast.error(extractErrorMessage(error));
      }
    },
    [navigate],
  );

  const checkAccess = useCallback(
    async (connection: StorageConnection) => {
      setBusyKey(`refresh:${connection.id}`);
      try {
        const result = await refreshStorageConnection(
          connection.provider,
          connection.id,
        );
        toast.success(
          `${PROVIDERS[connection.provider].name} reports ${result.status}.`,
        );
        await refresh();
      } catch (error) {
        toast.error(extractErrorMessage(error));
      } finally {
        setBusyKey(null);
      }
    },
    [refresh],
  );

  const disconnect = useCallback(
    async (connection: StorageConnection) => {
      const providerName = PROVIDERS[connection.provider].name;
      const accountName =
        connection.accountEmail ??
        connection.accountName ??
        `${providerName} account`;
      let confirmed = false;
      try {
        confirmed = await confirm({
          title: `Disconnect ${accountName}?`,
          description:
            `AI Matrx will stop reading from this ${providerName} account and retire this connection's token. ` +
            `Files you already imported into Matrx Files will remain. Only ${accountName} will be disconnected.`,
          confirmLabel: `Disconnect ${providerName}`,
          variant: "destructive",
        });
      } catch (error) {
        toast.error(extractErrorMessage(error));
        return;
      }
      if (!confirmed) return;

      setBusyKey(`disconnect:${connection.id}`);
      try {
        await disconnectStorageConnection(connection.provider, connection.id);
        toast.success(`${accountName} is disconnected.`);
        await refresh();
      } catch (error) {
        toast.error(extractErrorMessage(error));
      } finally {
        setBusyKey(null);
      }
    },
    [refresh],
  );

  return (
    <section className="space-y-5" data-testid="storage-connections-panel">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">
          File connections
        </h2>
        <p className="text-sm text-muted-foreground">
          Connect an account to browse and import its files into Matrx Files.
          Hosted MCP connections below give agents provider tools and are
          managed separately.
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
            {loadError} Your file connections could not be listed, so this
            screen is not claiming that you have none.
          </span>
        </div>
      ) : null}

      {connections === null && !loadError ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your file connections…
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {(["dropbox", "box"] as const).map((provider) => {
          const copy = PROVIDERS[provider];
          const providerConnections = (connections ?? []).filter(
            (connection) => connection.provider === provider,
          );
          return (
            <article
              key={provider}
              className="space-y-4 rounded-lg border border-border p-4"
            >
              <div className="flex items-start gap-3">
                <Cloud className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div className="min-w-0 space-y-1">
                  <h3 className="font-medium text-foreground">{copy.name}</h3>
                  <p className="text-sm text-muted-foreground">{copy.scope}</p>
                  <p className="text-xs text-muted-foreground">
                    {copy.limitation}
                  </p>
                </div>
              </div>

              {connections && providerConnections.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No {copy.name} account is connected yet.
                </p>
              ) : null}

              {providerConnections.length ? (
                <ul className="space-y-2">
                  {providerConnections.map((connection) => {
                    const status = connection.status.status;
                    const isBusy = busyKey?.endsWith(connection.id) ?? false;
                    return (
                      <li
                        key={connection.id}
                        className="space-y-2 rounded-md bg-muted/40 p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {connection.accountEmail ??
                              connection.accountName ??
                              `${copy.name} account`}
                          </span>
                          <Badge
                            variant={
                              status === "connected"
                                ? "secondary"
                                : "destructive"
                            }
                          >
                            {status ?? "Status unavailable"}
                          </Badge>
                        </div>
                        {connection.lastError ? (
                          <p className="text-xs text-destructive">
                            {connection.lastError}
                          </p>
                        ) : null}
                        {status === null ? (
                          <p className="text-xs text-muted-foreground">
                            This app does not recognize the provider status “
                            {connection.status.asRead || "missing"}”. No access
                            is being claimed.
                          </p>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          {status === "connected" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isBusy}
                              onClick={() => void checkAccess(connection)}
                            >
                              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                              Check access
                            </Button>
                          ) : null}
                          {status === "needs_attention" ||
                          status === "disconnected" ||
                          status === "revoked" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busyKey !== null}
                              onClick={() => void connect(provider)}
                            >
                              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                              {status === "needs_attention"
                                ? "Reconnect"
                                : "Connect again"}
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => void disconnect(connection)}
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            Disconnect
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              <Button
                onClick={() => void connect(provider)}
                disabled={busyKey !== null}
              >
                {busyKey === `connect:${provider}` ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-1.5 h-4 w-4" />
                )}
                {providerConnections.length
                  ? `Connect another ${copy.name} account`
                  : `Connect ${copy.name}`}
              </Button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
