"use client";

/**
 * "Browse everything" — one screen for every connected account.
 *
 * A person who has connected Microsoft or Google should be able to see what is
 * actually in there: every file, every message, every meeting, every chat —
 * walked live, filtered, and selected in bulk. That is the whole point of the
 * connected-account readers, and until this screen existed the only way to see
 * any of it was a curl command.
 *
 * The screen never hides a limit. Each adapter's own sentence about what it
 * CANNOT reach is shown beside its name, and the server's measured sentence
 * ("read 1,240 items in 3.1s; 88 matched; there is more in the account") sits
 * above the rows — because a list that shows 50 of an unknown number and says
 * nothing is a screen quietly lying about the size of someone's mailbox.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleAlert, Loader2, Search } from "lucide-react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { extractErrorMessage } from "@/utils/errors";
import { listConnectedAdapters } from "../api";
import type { ConnectedAdapterRow } from "../types";
import { createConnectedSourceListConfig } from "../browse/listConfig";
import type { ConnectedBrowseReport } from "../browse/service";

interface ChosenTarget {
  adapter: string;
  connectionId: string;
}

export function BrowseEverything() {
  const dispatch = useAppDispatch();
  const organizationId = useAppSelector(selectOrganizationId);
  const [adapters, setAdapters] = useState<ConnectedAdapterRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<ChosenTarget | null>(null);
  const [report, setReport] = useState<ConnectedBrowseReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listConnectedAdapters(dispatch);
        if (cancelled) return;
        setAdapters(rows);
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        setAdapters(null);
        setLoadError(extractErrorMessage(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  const onReport = useCallback((next: ConnectedBrowseReport) => {
    setReport(next);
  }, []);

  const config = useMemo(
    () =>
      chosen
        ? createConnectedSourceListConfig(
            dispatch,
            { adapter: chosen.adapter, connectionId: chosen.connectionId },
            organizationId,
            onReport,
          )
        : null,
    [chosen, dispatch, onReport, organizationId],
  );

  const chosenAdapter = adapters?.find(
    (adapter) => adapter.adapter === chosen?.adapter,
  );

  return (
    <>
      <PageHeader>
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-sm font-medium">Browse everything</h1>
          <span className="hidden truncate text-xs text-muted-foreground md:inline">
            What is really in your connected accounts
          </span>
        </div>
      </PageHeader>

      <div className="mx-auto w-full max-w-5xl space-y-4 p-4">
        {loadError ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{loadError}</span>
          </div>
        ) : null}

        {adapters === null && !loadError ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Looking at what you have connected…
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          {(adapters ?? []).map((adapter) => {
            const active = chosen?.adapter === adapter.adapter;
            return (
              <div
                key={adapter.adapter}
                className={
                  active
                    ? "rounded-md border border-primary p-3"
                    : "rounded-md border border-border p-3"
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {adapter.title}
                  </span>
                  <Badge variant={adapter.connected ? "secondary" : "outline"}>
                    {adapter.connected ? "connected" : "not connected"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {adapter.browse_outcome}
                </p>
                {adapter.limitation ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Cannot: {adapter.limitation}
                  </p>
                ) : null}
                {adapter.connected ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {adapter.connections.map((connection) => (
                      <Button
                        key={connection.connection_id}
                        size="sm"
                        variant={
                          active && chosen?.connectionId === connection.connection_id
                            ? "default"
                            : "outline"
                        }
                        onClick={() =>
                          setChosen({
                            adapter: adapter.adapter,
                            connectionId: connection.connection_id,
                          })
                        }
                      >
                        <Search className="mr-1.5 h-3.5 w-3.5" />
                        Browse {connection.account_email ?? "this account"}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {adapter.unavailable_reason}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {config && chosen ? (
        <EntityListPage
          key={`${chosen.adapter}:${chosen.connectionId}`}
          config={config}
          notice={
            <div className="mx-auto w-full max-w-5xl pb-2 text-xs text-muted-foreground">
              {report ? (
                <span>{report.summary}</span>
              ) : (
                <span>
                  Walking {chosenAdapter?.title ?? "this account"} live — the
                  first page appears as soon as the provider answers.
                </span>
              )}
            </div>
          }
        />
      ) : null}
    </>
  );
}
