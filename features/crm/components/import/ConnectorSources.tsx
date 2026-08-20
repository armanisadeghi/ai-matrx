"use client";

// features/crm/components/import/ConnectorSources.tsx
//
// API import sources on the /crm/import source step — provider-generic cards
// over the server connector registry (Google Contacts first). A connector only
// READS the source; everything after "Import" is the same map → dry-run →
// commit spine a file upload uses, so nothing is saved until the user
// confirms the preview.
//
// The Google contacts.readonly scope is registered but not yet Google-approved
// (its own verification campaign). The authorize action is gated by
// features/crm/import/connectors/campaign.ts: internal testers (super admins)
// can run it; everyone else sees an explicit "awaiting verification" status —
// a real status, never a decorative tile.

import { useCallback, useEffect, useState } from "react";
import { CloudDownload, Loader2, RefreshCcw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { GOOGLE_CONTACTS_IMPORT_SCOPES } from "@/lib/googleScopes";
import { LazyGoogleAPIProvider } from "@/providers/google-provider/LazyGoogleAPIProvider";
import { useGoogleAPI } from "@/providers/google-provider/GoogleApiProvider";
import { connectGoogle } from "@/features/marketing/google/service";
import type { PartyKind } from "../../types";
import type { ParsedImportData } from "../../import/types";
import {
  canRequestGoogleContactsScope,
  GOOGLE_CONTACTS_CAMPAIGN_PAUSE_REASON,
} from "../../import/connectors/campaign";
import {
  fetchConnectorContacts,
  listImportConnectors,
  type ImportConnector,
} from "../../import/connectors/service";

interface ConnectorSourcesProps {
  orgId: string | null;
  kind: PartyKind;
  onLoaded: (parsed: ParsedImportData, name: string | null) => void;
}

export function ConnectorSources({ orgId, kind, onLoaded }: ConnectorSourcesProps) {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const [connectors, setConnectors] = useState<ImportConnector[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetching, setFetching] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoadError(null);
      setConnectors(await listImportConnectors(orgId));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [orgId]);

  useEffect(() => {
    setConnectors(null);
    void reload();
  }, [reload]);

  if (!orgId) return null;

  const runImport = async (
    connector: ImportConnector,
    connectionId: string,
    mode: "auto" | "full",
  ) => {
    setFetching(`${connector.providerKey}:${connectionId}:${mode}`);
    try {
      const parsed = await fetchConnectorContacts({
        providerKey: connector.providerKey,
        connectionId,
        orgId,
        mode,
      });
      if (parsed.rows.length === 0) {
        const deleted = parsed.connector?.deletedExternalIds.length ?? 0;
        toast.success(
          parsed.connector?.incremental
            ? `No new or changed contacts in ${connector.displayName} since the last sync${deleted > 0 ? ` (${deleted} deleted at the source — imports never delete)` : ""}.`
            : `${connector.displayName} returned no contacts to import.`,
        );
        return;
      }
      onLoaded(parsed, parsed.sourceLabel);
    } catch (e) {
      toast.error(
        `Could not read ${connector.displayName}: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setFetching(null);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        Or import directly from a connected account
      </span>
      {loadError && (
        <p className="text-xs text-destructive">
          Could not list import sources: {loadError}
        </p>
      )}
      {connectors === null && !loadError && (
        <p className="text-xs text-muted-foreground">Checking connected accounts…</p>
      )}
      {connectors?.map((connector) => (
        <div
          key={connector.providerKey}
          className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2.5"
        >
          <div className="flex items-center gap-2">
            <CloudDownload className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {connector.displayName}
            </span>
            <span className="text-xs text-muted-foreground">
              Incremental sync — a re-run imports only what changed. Importing
              never marks anyone as opted in.
            </span>
          </div>
          {kind !== "person" ? (
            <p className="text-xs text-muted-foreground">
              {connector.displayName} imports people — switch to “People” above
              to use it.
            </p>
          ) : (
            <>
              {connector.connections.map((connection) => {
                const busyKey = `${connector.providerKey}:${connection.connectionId}`;
                return (
                  <div
                    key={connection.connectionId}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span className="text-xs text-foreground">
                      {connection.accountEmail ?? connection.connectionId}
                    </span>
                    {connection.scopeGranted ? (
                      <>
                        <Button
                          size="sm"
                          className="h-8 gap-1.5 text-xs"
                          disabled={fetching !== null}
                          onClick={() =>
                            void runImport(
                              connector,
                              connection.connectionId,
                              "auto",
                            )
                          }
                        >
                          {fetching === `${busyKey}:auto` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CloudDownload className="h-3.5 w-3.5" />
                          )}
                          {connection.hasSyncCursor ? "Sync changes" : "Import"}
                        </Button>
                        {connection.hasSyncCursor && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 gap-1.5 text-xs"
                              disabled={fetching !== null}
                              onClick={() =>
                                void runImport(
                                  connector,
                                  connection.connectionId,
                                  "full",
                                )
                              }
                            >
                              {fetching === `${busyKey}:full` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RefreshCcw className="h-3.5 w-3.5" />
                              )}
                              Full re-import
                            </Button>
                            {connection.lastSyncedAt && (
                              <span className="text-xs text-muted-foreground">
                                Last synced{" "}
                                {new Date(
                                  connection.lastSyncedAt,
                                ).toLocaleString()}
                              </span>
                            )}
                          </>
                        )}
                      </>
                    ) : canRequestGoogleContactsScope(isSuperAdmin) ? (
                      <GoogleAuthorizeContactsButton
                        label={`Authorize contacts on ${connection.accountEmail ?? "this account"}`}
                        onAuthorized={reload}
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        Awaiting Google verification
                      </span>
                    )}
                  </div>
                );
              })}
              {connector.connections.length === 0 &&
                (canRequestGoogleContactsScope(isSuperAdmin) ? (
                  <GoogleAuthorizeContactsButton
                    label="Connect a Google account"
                    onAuthorized={reload}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {GOOGLE_CONTACTS_CAMPAIGN_PAUSE_REASON}
                  </p>
                ))}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * The Google authorize step, mounted lazily so the /crm/import page never pays
 * for the Google script unless the (gated) action is actually rendered — the
 * same pattern ConnectMailboxDialog uses.
 */
function GoogleAuthorizeContactsButton(props: {
  label: string;
  onAuthorized: () => Promise<void> | void;
}) {
  return (
    <LazyGoogleAPIProvider scopes={[...GOOGLE_CONTACTS_IMPORT_SCOPES]}>
      <GoogleAuthorizeContactsButtonBody {...props} />
    </LazyGoogleAPIProvider>
  );
}

function GoogleAuthorizeContactsButtonBody({
  label,
  onAuthorized,
}: {
  label: string;
  onAuthorized: () => Promise<void> | void;
}) {
  const google = useGoogleAPI();
  const [busy, setBusy] = useState(false);

  const authorize = async () => {
    setBusy(true);
    try {
      const code = await google.requestAuthorizationCode([
        ...GOOGLE_CONTACTS_IMPORT_SCOPES,
      ]);
      await connectGoogle(code, { type: "user" });
      toast.success("Google Contacts access granted.");
      await onAuthorized();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Closing Google's popup is a decision, not an error worth shouting.
      if (!message.includes("closed before it finished")) {
        toast.error(`Google authorization failed: ${message}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-8 gap-1.5 text-xs"
      disabled={busy}
      onClick={() => void authorize()}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {label}
    </Button>
  );
}
