"use client";

/**
 * /connected-sources — what is really inside the accounts a person connected.
 *
 * One account at a time fills the page as a list: every file, message, meeting
 * or chat the server walks live from the provider. The account is chosen in
 * ONE compact bar above the list (the first connected account opens by
 * itself), and each source's limit — what it CANNOT reach — sits one hover away
 * beside that choice, never as a wall of sentences in front of the rows.
 *
 * A person's own accounts need no organization: the server declares these
 * reads organization-free, so the page loads with none selected and re-reads
 * when the header organization changes. Rows are never ours — nothing here
 * writes anything, so the agent surface is read-only.
 */

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Info, Plug } from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  OrganizationRequiredNotice,
  isOrganizationRequiredError,
} from "@/features/organizations/components/OrganizationRequiredNotice";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { CONNECTED_SOURCES_SURFACE_NAME } from "@/features/surfaces/manifests/connected-sources.manifest";
import { extractErrorMessage } from "@/utils/errors";
import { listConnectedAdapters } from "../api";
import type { ConnectedAdapterRow } from "../types";
import { createConnectedSourceListConfig } from "../browse/listConfig";
import type { ConnectedBrowseReport } from "../browse/service";
import { ReadResultsDialog, type ConnectedReadResult } from "./ReadResultsDialog";
import {
  buildConnectedSourcesScope,
  createConnectedSourcesListSurface,
  type ConnectedSourcesPageState,
} from "../browse/surface";

const INTEGRATIONS_HREF = "/settings/integrations";

interface ChosenTarget {
  adapter: string;
  connectionId: string;
}

/** `adapter:connection` — one Select value per account. */
function targetKey(target: ChosenTarget): string {
  return `${target.adapter}::${target.connectionId}`;
}

function parseTargetKey(value: string): ChosenTarget | null {
  const [adapter, connectionId] = value.split("::");
  return adapter && connectionId ? { adapter, connectionId } : null;
}

/** The account the page shows: the person's pick while it still exists, else the first connected one. */
function resolveChosen(
  adapters: ConnectedAdapterRow[] | null,
  picked: ChosenTarget | null,
): ChosenTarget | null {
  if (!adapters) return null;
  if (
    picked &&
    adapters.some(
      (a) =>
        a.adapter === picked.adapter &&
        a.connections.some((c) => c.connection_id === picked.connectionId),
    )
  ) {
    return picked;
  }
  for (const adapter of adapters) {
    const first = adapter.connected ? adapter.connections[0] : undefined;
    if (first) return { adapter: adapter.adapter, connectionId: first.connection_id };
  }
  return null;
}

function providerName(provider: string): string {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

/** The server's measured sentence, said in one short line; the full sentence is its tooltip. */
function reportLine(report: ConnectedBrowseReport): string {
  if (report.hasMore) {
    return `${plural(report.matched, "match", "matches")} in the first ${plural(report.scanned, "item", "items")} read — the account holds more`;
  }
  return report.matched === report.scanned
    ? `All ${plural(report.scanned, "item", "items")}`
    : `${plural(report.matched, "match", "matches")} of ${plural(report.scanned, "item", "items")}`;
}

export function BrowseEverything() {
  const dispatch = useAppDispatch();
  // A person's own connected accounts need no organization (the server declares
  // these reads organization-free); the selection is still re-read when it
  // changes, so switching organizations in the header refreshes the page.
  const organizationId = useAppSelector(selectOrganizationId);
  const [adapters, setAdapters] = useState<ConnectedAdapterRow[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState<ChosenTarget | null>(null);
  const [report, setReport] = useState<ConnectedBrowseReport | null>(null);
  const [readResult, setReadResult] = useState<ConnectedReadResult | null>(null);

  // Re-asked when the header organization changes and on Try again.
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
        setLoadError(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch, organizationId, attempt]);

  const retry = () => {
    setLoadError(null);
    setAdapters(null);
    setAttempt((n) => n + 1);
  };

  const chosen = resolveChosen(adapters, picked);
  const chosenAdapter = adapters?.find((a) => a.adapter === chosen?.adapter);
  const loadErrorText = loadError ? extractErrorMessage(loadError) : null;

  const pageState: ConnectedSourcesPageState = {
    adapters,
    loadError: loadErrorText,
    chosen,
    summary: report?.summary ?? null,
  };
  const getPageState = () => pageState;

  const config =
    chosen
      ? createConnectedSourceListConfig(
          dispatch,
          { adapter: chosen.adapter, connectionId: chosen.connectionId },
          organizationId,
          setReport,
          setReadResult,
        )
      : null;

  const connectedAccounts = (adapters ?? []).filter(
    (a) => a.connected && a.connections.length > 0,
  );
  const missingProviders = [
    ...new Set(
      (adapters ?? []).filter((a) => !a.connected).map((a) => a.provider),
    ),
  ];

  const header = (
    <PageHeader>
      <h1 className="truncate text-sm font-medium">Connected sources</h1>
    </PageHeader>
  );

  const connectLinks = missingProviders.map((provider) => (
    <Button key={provider} asChild size="sm" variant="ghost">
      <Link href={INTEGRATIONS_HREF}>
        <Plug className="mr-1.5 h-3.5 w-3.5" />
        Connect {providerName(provider)}
      </Link>
    </Button>
  ));

  let body: ReactNode = null;
  if (loadError && isOrganizationRequiredError(loadError)) {
    body = <OrganizationRequiredNotice what="Connected sources" onRetry={retry} />;
  } else if (loadError) {
    body = (
      <ErrorNotice
        title="Couldn't read your connected accounts"
        error={loadError}
        operation="List connected sources"
        calls={["/connected-sources/adapters"]}
        actions={
          <Button size="sm" variant="outline" onClick={retry}>
            Try again
          </Button>
        }
      />
    );
  } else if (adapters === null) {
    body = (
      <div className="space-y-2" aria-label="Loading your connected accounts">
        <Skeleton className="h-9 w-full max-w-md" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  } else if (!connectedAccounts.length) {
    body = (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm font-medium text-foreground">No account connected yet</p>
        <p className="text-sm text-muted-foreground">
          Connect Google or Microsoft and everything in it shows up here, read live.
        </p>
        <div className="flex flex-wrap justify-center gap-2">{connectLinks}</div>
      </div>
    );
  }

  if (body || !config || !chosen) {
    return (
      <SurfaceRuntimeProvider
        surfaceName={CONNECTED_SOURCES_SURFACE_NAME}
        getScope={() => buildConnectedSourcesScope(getPageState())}
      >
        {header}
        <div className="matrx-touch-targets h-full overflow-y-auto px-4 pb-4 pt-[calc(var(--shell-header-h)+0.5rem)]">
          {body}
        </div>
      </SurfaceRuntimeProvider>
    );
  }

  const accountBar = (
    <div className="matrx-touch-targets flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <Select
        value={targetKey(chosen)}
        onValueChange={(value) => {
          const next = parseTargetKey(value);
          if (next) {
            setReport(null);
            setPicked(next);
          }
        }}
      >
        <SelectTrigger
          aria-label="Account to browse"
          className="h-9 w-full min-w-0 sm:w-auto sm:max-w-md"
        >
          {/* The account first — it is what tells two choices apart. */}
          <span className="truncate">
            {chosenAdapter?.connections.find(
              (c) => c.connection_id === chosen.connectionId,
            )?.account_email ?? "This account"}
            <span className="text-muted-foreground">
              {" · "}
              {chosenAdapter?.title}
            </span>
          </span>
        </SelectTrigger>
        <SelectContent>
          {connectedAccounts.map((adapter) => (
            <SelectGroup key={adapter.adapter}>
              <SelectLabel>{adapter.title}</SelectLabel>
              {adapter.connections.map((connection) => (
                <SelectItem
                  key={connection.connection_id}
                  value={targetKey({
                    adapter: adapter.adapter,
                    connectionId: connection.connection_id,
                  })}
                >
                  {connection.account_email ?? "Unnamed account"}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {chosenAdapter?.limitation || chosenAdapter?.browse_outcome ? (
        // A popover, not a tooltip: a tap on a phone must open it too.
        <Popover>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9 shrink-0"
              aria-label={`What ${chosenAdapter.title} can and cannot reach`}
            >
              <Info className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="max-w-sm space-y-1 text-sm">
            {chosenAdapter.browse_outcome ? <p>{chosenAdapter.browse_outcome}</p> : null}
            {chosenAdapter.limitation ? (
              <p className="text-muted-foreground">Cannot reach: {chosenAdapter.limitation}</p>
            ) : null}
          </PopoverContent>
        </Popover>
      ) : null}
      <span
        className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
        title={report?.summary}
      >
        {report ? reportLine(report) : "Reading the account…"}
      </span>
      {connectLinks.length ? <div className="flex shrink-0 gap-1">{connectLinks}</div> : null}
    </div>
  );

  return (
    <>
      {header}
      <EntityListPage
        key={`${organizationId ?? "none"}:${targetKey(chosen)}`}
        config={config}
        scopeTabs={false}
        surface={createConnectedSourcesListSurface(getPageState)}
        notice={accountBar}
      />
      <ReadResultsDialog result={readResult} onClose={() => setReadResult(null)} />
    </>
  );
}
