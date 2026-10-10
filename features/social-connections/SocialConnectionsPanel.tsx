"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Badge, RegionSkeleton } from "@ai-matrx/design-system/controls";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { extractErrorMessage } from "@/utils/errors";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { replaceAddressWithoutNavigating } from "@/lib/url-state/addressWithoutNavigating";
import { toast } from "@/lib/toast";
import { listSocialConnections } from "./connections";
import {
  attachXAccount,
  getXConfig,
  discoverXAccount,
  disconnectXAccount,
  refreshXAccess,
  selectXAccount,
  syncXAccount,
} from "./service";

export function SocialConnectionsPanel({
  brandId,
  organizationId: requestedOrg,
  returnUrl = "/user-settings/integrations",
  onChanged,
}: {
  brandId?: string;
  organizationId?: string;
  returnUrl?: string;
  onChanged?: () => void;
}) {
  const activeOrg = useAppSelector(selectOrganizationId);
  const organizationId = requestedOrg ?? activeOrg;
  const userId = useAppSelector(selectUserId);
  const backendOrigin = useAppSelector(selectResolvedBaseUrl);
  const params = useSearchParams();
  const [connections, setConnections] = useState<Awaited<
    ReturnType<typeof listSocialConnections>
  > | null>(null);
  const [discovery, setDiscovery] = useState<{
    connectionId: string;
    resources: Awaited<ReturnType<typeof discoverXAccount>>["resources"];
  } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [appAvailable, setAppAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const loadGeneration = useRef(0);
  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    try {
      const rows = await listSocialConnections();
      const config = organizationId ? await getXConfig(organizationId) : null;
      if (generation !== loadGeneration.current) return;
      setConnections(rows);
      setAppAvailable(config?.status === "available");
    } catch (error) {
      if (generation !== loadGeneration.current) return;
      setFailure(extractErrorMessage(error));
      setConnections(null);
      setAppAvailable(false);
    }
  }, [organizationId, backendOrigin]);
  useEffect(() => {
    let current = true;
    const reload = async () => {
      await load();
      if (!current) return;
      setDiscovery(null);
      const status = params?.get("x_oauth_status");
      if (!status) return;
      if (status === "connected") toast.success("X connected");
      else
        setFailure(
          status === "cancelled"
            ? "Connection cancelled."
            : status === "quota_exhausted"
              ? "X API credits are exhausted. Contact your organization administrator."
              : status === "rate_limited"
                ? "X has rate limited this account. Try again after the reset."
                : status === "needs_attention"
                  ? "X access was refused. Reconnect your account."
                  : "X could not connect. Try again.",
        );
      const url = new URL(window.location.href);
      url.searchParams.delete("x_oauth_status");
      replaceAddressWithoutNavigating(url.toString());
    };
    void reload();
    return () => {
      current = false;
      loadGeneration.current += 1;
    };
  }, [userId, params, load]);
  const act = async (action: (org: string) => Promise<unknown>) => {
    if (!organizationId) {
      setFailure("Choose an organization.");
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      await action(organizationId);
      await load();
      onChanged?.();
    } catch (error) {
      setFailure(extractErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const connect = () => {
    if (!organizationId) {
      setFailure("Choose an organization.");
      return;
    }
    if (!backendOrigin) {
      setFailure("Choose an API server.");
      return;
    }
    const query = new URLSearchParams({
      organization_id: organizationId,
      backend_origin: backendOrigin,
      return_url: returnUrl,
    });
    window.location.assign(
      new URL(`/api/social-oauth/x/start?${query}`, window.location.origin)
        .href,
    );
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">Your X accounts</h3>
        <Button
          disabled={busy || !userId || !organizationId || !appAvailable}
          onClick={connect}
        >
          Connect X
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Read profile, posts and insights
      </p>
      {connections !== null && !appAvailable && !failure && (
        <p className="text-sm text-muted-foreground">
          X connection setup is unavailable
        </p>
      )}
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {failure}
          <ErrorAlchemyMenu error={failure} operation="Connect X" />
        </p>
      )}
      {connections === null && !failure && (
        <RegionSkeleton shape="rows" count={1} aria-label="Loading your X accounts" />
      )}
      {!failure && connections?.length === 0 && (
        <p className="text-sm text-muted-foreground">No X accounts connected</p>
      )}
      {connections?.map((connection) => (
        <div key={connection.id} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">
              {connection.account_name ?? "X account"}
            </span>
            <Badge>{connection.status.replaceAll("_", " ")}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Permissions: {connection.scopes?.join(", ") || "Unavailable"}
          </p>
          <p className="text-sm text-muted-foreground">
            Last checked:{" "}
            {connection.last_verified_at
              ? new Date(connection.last_verified_at).toLocaleString()
              : "Never"}
          </p>
          {typeof connection.metadata === "object" &&
            connection.metadata !== null &&
            !Array.isArray(connection.metadata) &&
            "token_expires_at" in connection.metadata &&
            typeof connection.metadata.token_expires_at === "string" && (
              <p className="text-sm text-muted-foreground">
                Access expires:{" "}
                {new Date(
                  connection.metadata.token_expires_at,
                ).toLocaleString()}
              </p>
            )}
          {connection.last_error && (
            <p role="alert" className="text-sm text-destructive">
              {connection.last_error}
              <ErrorAlchemyMenu
                error={connection.last_error}
                operation="X account access"
              />
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy || connection.status !== "connected"}
              onClick={() =>
                void act(async (org) => {
                  const result = await discoverXAccount(connection.id, org);
                  setDiscovery({
                    connectionId: connection.id,
                    resources: result.resources,
                  });
                })
              }
            >
              Select account
            </Button>
            <Button
              variant="outline"
              disabled={busy || connection.status !== "connected"}
              onClick={() =>
                void act((org) => refreshXAccess(connection.id, org))
              }
            >
              Refresh access
            </Button>
            {brandId && (
              <Button
                variant="outline"
                disabled={busy || connection.status !== "connected"}
                onClick={() =>
                  void act((org) => syncXAccount(connection.id, brandId, org))
                }
              >
                Refresh now
              </Button>
            )}
            {connection.status !== "connected" && (
              <Button variant="outline" disabled={busy} onClick={connect}>
                Reconnect
              </Button>
            )}
            <Button
              variant="outline"
              disabled={busy || connection.status === "disconnected"}
              onClick={() =>
                void act(async (org) => {
                  if (
                    !(await confirm({
                      title: "Disconnect X?",
                      description: "Access stops. Saved history stays.",
                      confirmLabel: "Disconnect",
                      variant: "destructive",
                    }))
                  )
                    return;
                  await disconnectXAccount(connection.id, org);
                  setDiscovery(null);
                })
              }
            >
              Disconnect
            </Button>
          </div>
        </div>
      ))}
      {discovery?.resources.map((resource) => (
        <div
          key={resource.resource_ref}
          className="flex items-center justify-between gap-3 rounded-lg border p-3"
        >
          <span>
            {resource.username
              ? `@${resource.username}`
              : resource.display_name}
          </span>
          <Button
            disabled={busy}
            onClick={() =>
              void act(async (org) => {
                if (brandId)
                  await attachXAccount(
                    discovery.connectionId,
                    resource.resource_ref,
                    brandId,
                    org,
                  );
                else
                  await selectXAccount(
                    discovery.connectionId,
                    resource.resource_ref,
                    org,
                  );
                setDiscovery(null);
                toast.success(brandId ? "Account added" : "Account selected");
              })
            }
          >
            {brandId
              ? "Add to brand"
              : resource.selected
                ? "Selected"
                : "Select"}
          </Button>
        </div>
      ))}
    </div>
  );
}
