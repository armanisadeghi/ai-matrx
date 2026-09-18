"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GoogleAccountSelect } from "@/features/google-workspace/GoogleAccountSelect";
import { GoogleAgentToolsSection } from "@/features/google-workspace/GoogleAgentToolsSection";
import { isGoogleAuthorizationActionDisabled } from "@/features/google-workspace/authorizationReadiness";
import {
  useConnectGoogle,
  useGoogleCapabilities,
  useGoogleConnectionInventory,
} from "@/features/marketing/google/hooks";
import {
  buildGoogleReconnectRequest,
  type GoogleCapabilityKey,
} from "@/features/marketing/google/service";
import { googleConnectionLabel } from "@/features/marketing/google/presentation";
import { isGoogleWorkspaceFileRow } from "@/features/marketing/google/types";
import {
  OpenGoogleDocumentRecordButton,
  hasGoogleDocumentRecord,
  pickedGoogleRecordResource,
} from "@/features/google-workspace/documents/openRecord";
import { googleWorkspaceFileType } from "@/features/google-workspace/resource-types";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import type {
  GoogleCapabilityMetadata,
  GoogleConnectionResource,
  GoogleConnectionSummary,
} from "@/features/marketing/google/types";
import { GOOGLE_WORKSPACE_FILE_SCOPES } from "@/lib/googleScopes";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAuthReady,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { toast } from "@/lib/toast";
import { LazyGoogleAPIProvider } from "@/providers/google-provider/LazyGoogleAPIProvider";
import {
  isGoogleAuthorizationCancelled,
  useGoogleAPI,
} from "@/providers/google-provider/GoogleApiProvider";
import { extractErrorMessage } from "@/utils/errors";

export interface GoogleWorkspaceOverviewBodyProps {
  initialConnectionId?: string | null;
  onAddAccount: () => void;
  onManageWorkspace: (connectionId: string) => void;
}

/** Shared account and capability overview for the WindowPanel and Settings. */
export function GoogleWorkspaceOverviewBody(
  props: GoogleWorkspaceOverviewBodyProps,
) {
  return (
    <LazyGoogleAPIProvider scopes={[...GOOGLE_WORKSPACE_FILE_SCOPES]}>
      <GoogleWorkspaceOverviewBodyContent {...props} />
    </LazyGoogleAPIProvider>
  );
}

function GoogleWorkspaceOverviewBodyContent({
  initialConnectionId,
  onAddAccount,
  onManageWorkspace,
}: GoogleWorkspaceOverviewBodyProps) {
  const authReady = useAppSelector(selectAuthReady);
  const userId = useAppSelector(selectUserId);
  const organizationContextId = useAppSelector(selectOrganizationId);
  const google = useGoogleAPI();
  const inventory = useGoogleConnectionInventory();
  const capabilities = useGoogleCapabilities();
  const connectGoogle = useConnectGoogle();
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(initialConnectionId ?? null);
  const [targetUnavailableDismissed, setTargetUnavailableDismissed] =
    useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const connections = inventory.data?.connections ?? [];
  const requestedConnection = initialConnectionId
    ? (connections.find(
        (connection) => connection.id === initialConnectionId,
      ) ?? null)
    : null;
  const selectedConnection = selectedConnectionId
    ? (connections.find(
        (connection) => connection.id === selectedConnectionId,
      ) ?? null)
    : (connections[0] ?? null);
  const resources = selectedConnection
    ? (inventory.data?.resources ?? []).filter(
        (resource) => resource.connection_id === selectedConnection.id,
      )
    : [];
  const authorizationActionDisabled = isGoogleAuthorizationActionDisabled(
    google.isGoogleLoaded,
    busy ? "reconnect" : null,
  );

  useEffect(() => {
    setSelectedConnectionId(initialConnectionId ?? null);
    setTargetUnavailableDismissed(false);
  }, [initialConnectionId]);

  async function reconnectSelectedAccount() {
    if (!selectedConnection) return;
    setBusy("reconnect");
    try {
      const request = buildGoogleReconnectRequest(selectedConnection);
      const code = await google.requestAuthorizationCode(
        request.scopes,
        request.loginHint,
      );
      const result = await connectGoogle.mutateAsync({
        code,
        owner: request.owner,
        options: request.options,
      });
      setSelectedConnectionId(result.connectionId);
      await inventory.refetch();
      toast.success("Google account reconnected.");
    } catch (cause) {
      if (isGoogleAuthorizationCancelled(cause))
        toast.info("Google authorization cancelled");
      else toast.error(extractErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function enableCapability(
    capability: GoogleCapabilityMetadata,
    redirect = false,
  ) {
    const connection = selectedConnection;
    const capabilityKey = googleCapabilityKey(capability.key);
    const requiredScopes = capability.required_scopes.map(({ scope }) => scope);
    if (
      !connection ||
      !capabilityKey ||
      !capability.eligible ||
      connection.health !== "connected" ||
      requiredScopes.every((scope) => connection.scopes.includes(scope))
    ) {
      return;
    }
    const request = buildGoogleReconnectRequest(
      connection,
      requiredScopes,
      capabilityKey,
    );
    const frozenConnectionId = request.options.targetConnectionId;
    const frozenCapabilityKey = request.options.capabilityKey;
    const frozenOwner = request.owner;
    const frozenOrganizationContextId =
      connection.organization_id ?? organizationContextId;
    const initiatingUserId = userId;
    setBusy(`capability:${capabilityKey}:${redirect ? "redirect" : "popup"}`);
    try {
      if (redirect) {
        if (!frozenOrganizationContextId) {
          throw new Error(
            "Choose an organization before continuing with Google in this tab.",
          );
        }
        await google.startAuthorizationCodeRedirect(request.scopes, {
          returnTo: `${window.location.pathname}${window.location.search}${window.location.hash}`,
          owner: frozenOwner,
          organizationContextId: frozenOrganizationContextId,
          connectionPurpose: "google_capability",
          loginHint: request.loginHint,
          forceConsent: true,
          targetConnectionId: frozenConnectionId,
          capabilityKey: frozenCapabilityKey,
        });
        return;
      }
      const code = await google.requestAuthorizationCode(
        request.scopes,
        request.loginHint,
        { forceConsent: true },
      );
      const result = await connectGoogle.mutateAsync({
        code,
        owner: frozenOwner,
        connectionPurpose: "google_capability",
        options: {
          targetConnectionId: frozenConnectionId,
          capabilityKey: frozenCapabilityKey,
          organizationContextId: frozenOrganizationContextId ?? undefined,
          expectedUserId: initiatingUserId ?? undefined,
        },
      });
      setSelectedConnectionId(result.connectionId);
      await inventory.refetch();
      toast.success(`${capability.title} enabled.`);
    } catch (cause) {
      if (isGoogleAuthorizationCancelled(cause)) {
        toast.info("Google authorization cancelled");
      } else {
        toast.error(extractErrorMessage(cause));
      }
    } finally {
      setBusy(null);
    }
  }

  if (!authReady || inventory.isLoading)
    return <OverviewLoading message="Loading Google account access…" />;
  if (inventory.isError)
    return (
      <OverviewError
        message="Google account status could not be loaded."
        onRetry={() => void inventory.refetch()}
      />
    );
  if (
    initialConnectionId &&
    !requestedConnection &&
    !targetUnavailableDismissed
  ) {
    return (
      <UnavailableRequestedAccount
        connections={connections}
        onChoose={(connectionId) => {
          setSelectedConnectionId(connectionId);
          setTargetUnavailableDismissed(true);
        }}
        onRetry={() => void inventory.refetch()}
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <AccountToolbar
          connections={connections}
          selectedConnection={selectedConnection}
          resources={resources}
          busy={busy !== null}
          authorizationActionDisabled={authorizationActionDisabled}
          googleLoaded={google.isGoogleLoaded}
          onConnectionChange={setSelectedConnectionId}
          onAddAccount={onAddAccount}
          onReconnect={reconnectSelectedAccount}
        />
        {capabilities.isLoading ? (
          <OverviewLoading
            message="Loading Google capability availability…"
            compact
          />
        ) : capabilities.isError ? (
          <OverviewError
            message="Google capability availability could not be loaded."
            onRetry={() => void capabilities.refetch()}
          />
        ) : (
          <CapabilityCatalog
            capabilities={capabilities.data ?? []}
            connection={selectedConnection}
            resources={resources}
            onAddAccount={onAddAccount}
            onManageWorkspace={onManageWorkspace}
            onEnableCapability={enableCapability}
            busy={busy}
            authorizationActionDisabled={authorizationActionDisabled}
          />
        )}
        <GoogleAgentToolsSection />
      </div>
    </div>
  );
}

function AccountToolbar({
  connections,
  selectedConnection,
  resources,
  busy,
  authorizationActionDisabled,
  googleLoaded,
  onConnectionChange,
  onAddAccount,
  onReconnect,
}: {
  connections: GoogleConnectionSummary[];
  selectedConnection: GoogleConnectionSummary | null;
  resources: GoogleConnectionResource[];
  busy: boolean;
  authorizationActionDisabled: boolean;
  googleLoaded: boolean;
  onConnectionChange: (connectionId: string) => void;
  onAddAccount: () => void;
  onReconnect: () => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          {selectedConnection ? (
            <GoogleAccountSelect
              connections={connections}
              connectionId={selectedConnection.id}
              onConnectionChange={onConnectionChange}
              label="Google account"
              disabled={busy}
            />
          ) : (
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Google accounts
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Add an account to inspect its available Google services.
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onAddAccount}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add account
          </Button>
          {selectedConnection?.health !== "connected" && selectedConnection ? (
            <Button
              onClick={onReconnect}
              disabled={authorizationActionDisabled}
            >
              <RefreshCw className="mr-1.5 h-4 w-4" />
              {busy
                ? "Reconnecting…"
                : !googleLoaded
                  ? "Loading Google…"
                  : "Reconnect"}
            </Button>
          ) : null}
        </div>
      </div>
      {selectedConnection ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1.5">
            {selectedConnection.health === "connected" ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            ) : (
              <CircleAlert className="h-3.5 w-3.5 text-warning" />
            )}
            {selectedConnection.health === "connected"
              ? "Connected"
              : selectedConnection.health === "revoked"
                ? "Access revoked"
                : "Needs reconnect"}
          </Badge>
          <Badge variant="outline">{resources.length} selected resources</Badge>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">
              Permission details
            </summary>
            <p className="mt-1 max-w-xl">
              Each capability below states separately whether this account has
              its required permission and resource access.
            </p>
          </details>
        </div>
      ) : null}
    </section>
  );
}

function CapabilityCatalog({
  capabilities,
  connection,
  resources,
  onAddAccount,
  onManageWorkspace,
  onEnableCapability,
  busy,
  authorizationActionDisabled,
}: {
  capabilities: GoogleCapabilityMetadata[];
  connection: GoogleConnectionSummary | null;
  resources: GoogleConnectionResource[];
  onAddAccount: () => void;
  onManageWorkspace: (connectionId: string) => void;
  onEnableCapability: (
    capability: GoogleCapabilityMetadata,
    redirect?: boolean,
  ) => void;
  busy: string | null;
  authorizationActionDisabled: boolean;
}) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-foreground">
          Google capabilities
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Product access, account permissions, and selected resources are
          checked independently.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {capabilities.map((capability) => {
          const permissionGranted = Boolean(
            connection &&
            connection.health === "connected" &&
            capability.required_scopes.every((scope) =>
              connection.scopes.includes(scope.scope),
            ),
          );
          const matchingResources = resources.filter((resource) =>
            capability.eligible_resource_types.includes(resource.resource_type),
          );
          const capabilityKey = googleCapabilityKey(capability.key);
          const canEnable = Boolean(
            capabilityKey &&
            capability.eligible &&
            connection?.health === "connected" &&
            !permissionGranted,
          );
          const capabilityBusy = busy?.startsWith(
            `capability:${capabilityKey}:`,
          );
          return (
            <article
              key={capability.key}
              className="rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {capability.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {capability.user_outcome}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {capability.rollout_phase === "available"
                    ? "Available"
                    : "Internal testing"}
                </Badge>
              </div>
              <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                <CapabilityState
                  label="Product access"
                  value={
                    capability.eligible
                      ? "Available to you"
                      : "Not available during this rollout"
                  }
                  good={capability.eligible}
                />
                <CapabilityState
                  label="Account permission"
                  value={
                    !connection
                      ? "Choose an account"
                      : permissionGranted
                        ? "Granted"
                        : "Needed"
                  }
                  good={permissionGranted}
                />
                {capability.eligible_resource_types.length ? (
                  <CapabilityState
                    label="Selected resource"
                    value={
                      matchingResources.length
                        ? `${matchingResources.length} available`
                        : "Needed"
                    }
                    good={matchingResources.length > 0}
                  />
                ) : null}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {capability.limitation}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {capability.remedy}
              </p>
              {matchingResources.length ? (
                <details className="mt-3 text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none">
                    View selected resources
                  </summary>
                  <div className="mt-2 divide-y divide-border/70">
                    {matchingResources.map((resource) => (
                      <div
                        key={resource.id}
                        className="flex items-center justify-between gap-2 py-1.5"
                      >
                        <a
                          href={googleResourceHref(resource)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-foreground hover:text-primary"
                        >
                          <span className="min-w-0 truncate">
                            {resource.display_name}
                          </span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        </a>
                        {/*
                          🚨 A NAMED FILE OPENS HERE TOO (F-58). A Doc or Sheet in
                          this roster used to offer only its Google link; its AI
                          Matrx Record is the surface that holds the body, the
                          refresh and the append.
                        */}
                        {hasGoogleDocumentRecord(resource.resource_type) ? (
                          <OpenGoogleDocumentRecordButton
                            resource={pickedGoogleRecordResource(resource)}
                            variant="ghost"
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
              {capability.key === "search_console" ? (
                <Button className="mt-3" size="sm" variant="outline" asChild>
                  <Link href={marketingRoutes.connectionsGoogle()}>
                    Manage Search Console
                  </Link>
                </Button>
              ) : capability.key === "analytics" ||
                capability.key === "youtube" ? (
                <Button className="mt-3" size="sm" variant="outline" asChild>
                  <Link href={marketingRoutes.connectionsGoogle()}>
                    Manage {capability.title}
                  </Link>
                </Button>
              ) : canEnable ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => onEnableCapability(capability)}
                    disabled={authorizationActionDisabled}
                  >
                    {capabilityBusy === "capability:" + capabilityKey + ":popup"
                      ? `Enabling ${capability.title}…`
                      : `Enable ${capability.title}`}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onEnableCapability(capability, true)}
                    disabled={authorizationActionDisabled}
                  >
                    {capabilityBusy ===
                    "capability:" + capabilityKey + ":redirect"
                      ? "Opening Google…"
                      : "Continue in this tab"}
                  </Button>
                </div>
              ) : capability.rollout_phase === "available" &&
                (capability.key === "drive_files" ||
                  capability.key === "docs" ||
                  capability.key === "sheets" ||
                  capability.key === "gmail_send") ? (
                <Button
                  className="mt-3"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (connection) onManageWorkspace(connection.id);
                    else onAddAccount();
                  }}
                >
                  Manage Google access
                </Button>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function googleCapabilityKey(value: string): GoogleCapabilityKey | null {
  return value === "contacts" ||
    value === "calendar" ||
    value === "tasks" ||
    value === "tag_manager" ||
    value === "youtube_analytics"
    ? value
    : null;
}

function CapabilityState({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good: boolean;
}) {
  return (
    <p>
      <span className="font-medium text-foreground">{label}:</span>{" "}
      <span className={good ? "text-success" : undefined}>{value}</span>
    </p>
  );
}
function OverviewLoading({
  message,
  compact = false,
}: {
  message: string;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground"
          : "flex min-h-0 flex-1 items-center justify-center gap-2 p-6 text-sm text-muted-foreground"
      }
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      {message}
    </div>
  );
}
function OverviewError({
  message,
  onRetry,
  retryLabel = "Try again",
}: {
  message: string;
  onRetry: () => void;
  retryLabel?: string;
}) {
  return (
    <section
      className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
      role="alert"
    >
      <p>{message}</p>
      <Button className="mt-3" size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
        {retryLabel}
      </Button>
    </section>
  );
}

function UnavailableRequestedAccount({
  connections,
  onChoose,
  onRetry,
}: {
  connections: GoogleConnectionSummary[];
  onChoose: (connectionId: string) => void;
  onRetry: () => void;
}) {
  return (
    <section
      className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
      role="alert"
    >
      <p>
        The Google account requested here is no longer available to you. Choose
        another account to inspect.
      </p>
      {connections.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {connections.map((connection) => (
            <Button
              key={connection.id}
              size="sm"
              variant="outline"
              onClick={() => onChoose(connection.id)}
            >
              {googleConnectionLabel(connection)}
            </Button>
          ))}
        </div>
      ) : null}
      <Button className="mt-3" size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
        Try again
      </Button>
    </section>
  );
}
function googleResourceHref(resource: GoogleConnectionResource): string {
  const storedLink = resource.metadata.web_view_link;
  if (typeof storedLink === "string" && storedLink) return storedLink;
  // Workspace files get their door from the ONE file-type record, so a type the
  // server adds cannot fall through to the Search Console URL below (V13-3).
  if (isGoogleWorkspaceFileRow(resource))
    return googleWorkspaceFileType(resource.resource_type).hrefFor(
      resource.resource_ref,
    );
  if (resource.resource_type === "youtube_channel")
    return `https://www.youtube.com/channel/${encodeURIComponent(resource.resource_ref)}`;
  if (resource.resource_type === "analytics_property")
    return `https://analytics.google.com/analytics/web/#/p${encodeURIComponent(resource.resource_ref.replace("properties/", ""))}`;
  return `https://search.google.com/search-console?resource_id=${encodeURIComponent(resource.resource_ref)}`;
}
