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
 * reads organization-free (the account list, comments, history, speaker notes)
 * or organization-optional (browse), so the page loads with none selected and
 * re-reads when the header organization changes. The one exception is a
 * source whose browse files a tenant row (Microsoft's credential audit, the
 * adapter's `needs_organization`): with no organization it shows the platform's
 * organization picker in place of the list — never an error. Rows are never ours — nothing here
 * writes anything, so the agent surface is read-only.
 */

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Info, Plug } from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTriggerLegacy as SelectTrigger,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { ErrorNotice } from "@ai-matrx/design-system";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  OrganizationRequiredNotice,
  isOrganizationRequiredError,
} from "@/features/organizations/components/OrganizationRequiredNotice";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { CONNECTED_SOURCES_SURFACE_NAME } from "@/features/surfaces/manifests/connected-sources.manifest";
import { extractErrorMessage } from "@/utils/errors";
import { listConnectedAdapters } from "../api";
import type { ConnectedAdapterRow } from "../types";
import { createConnectedSourceListConfig } from "../browse/listConfig";
import type {
  ConnectedBrowseReport,
  ConnectedBrowseStatus,
} from "../browse/service";
import { ReadResultsDialog, type ConnectedReadDialogState } from "./ReadResultsDialog";
import {
  buildConnectedSourcesScope,
  createConnectedSourcesListSurface,
  type ConnectedSourcesPageState,
} from "../browse/surface";
import { formatCount } from "@ai-matrx/kit/format";
import { ConnectorTile } from "@/features/connectors/ConnectorMark";
import { getConnector } from "@/features/connectors/registry";
import type { ConnectorDefinition } from "@/features/connectors/types";

const INTEGRATIONS_HREF = "/user-settings/integrations";

/** The integrations directory, opened on one provider's own detail. */
function providerHref(provider: string): string {
  return `${INTEGRATIONS_HREF}?provider=${encodeURIComponent(provider)}`;
}

/** The provider's brand mark, from the ONE connector registry where it has one. */
function providerMark(provider: string): ConnectorDefinition {
  const known = provider === "google" ? getConnector("google-workspace") : undefined;
  return (
    known ?? {
      id: provider,
      name: providerName(provider),
      blurb: "",
      surfaces: ["directory"],
      iconUrl: provider === "microsoft" ? "/icons/brands/microsoft.svg" : null,
    }
  );
}
/** Per-viewer convenience only: the account this browser last looked at. */
const PICK_STORAGE_KEY = "connected-sources:account";

function readStoredPick(): ChosenTarget | null {
  try {
    const raw = window.localStorage.getItem(PICK_STORAGE_KEY);
    return raw ? parseTargetKey(raw) : null;
  } catch {
    return null;
  }
}

function storePick(target: ChosenTarget): void {
  try {
    window.localStorage.setItem(PICK_STORAGE_KEY, targetKey(target));
  } catch {
    // Storage blocked (private window): the pick simply isn't remembered.
  }
}

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

/** Every read ends in a line: reading, what it found, couldn't read, or waiting on an organization. */
function statusLine(status: ConnectedBrowseStatus | null): string {
  if (!status) return "Reading the account…";
  if (status.state === "done") return reportLine(status.report);
  if (status.state === "held") return "Waiting for an organization";
  return "Couldn't read this account";
}

/**
 * Only what the pager below cannot say. The count of rows is the pager's
 * ("1–2 of 2"); this line speaks only when the account holds more than was
 * read, or a search narrowed what was read. The full server sentence is its
 * tooltip.
 */
function reportLine(report: ConnectedBrowseReport): string {
  if (report.hasMore) {
    return `Read the first ${plural(report.scanned, "item", "items")} — the account holds more`;
  }
  return report.matched === report.scanned
    ? ""
    : `${formatCount(report.matched)} of ${plural(report.scanned, "item", "items")} match`;
}

export function BrowseEverything() {
  const dispatch = useAppDispatch();
  // A person's own connected accounts need no organization (the server declares
  // these reads organization-free), so the account list is NOT re-asked when the
  // header organization changes. The selected organization is only handed to a
  // source that itself works inside one (its `needs_organization` hold below).
  const organizationId = useAppSelector(selectOrganizationId);
  const [adapters, setAdapters] = useState<ConnectedAdapterRow[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  // The last account this viewer chose, when it still exists; otherwise the
  // first connected one (the server lists them oldest first).
  const [picked, setPicked] = useState<ChosenTarget | null>(() =>
    typeof window === "undefined" ? null : readStoredPick(),
  );
  // How the last read of the list ended, tagged with the account + organization
  // it was for — a status from another account is no status for this one.
  const [status, setStatus] = useState<{
    key: string;
    status: ConnectedBrowseStatus;
  } | null>(null);
  const [readResult, setReadResult] = useState<ConnectedReadDialogState | null>(null);

  // Asked once, and again on Try again.
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
  }, [dispatch, attempt]);

  const retry = () => {
    setLoadError(null);
    setAdapters(null);
    setAttempt((n) => n + 1);
  };

  const chosen = resolveChosen(adapters, picked);
  const chosenAdapter = adapters?.find((a) => a.adapter === chosen?.adapter);
  const loadErrorText = loadError ? extractErrorMessage(loadError) : null;

  const listKey = chosen ? `${organizationId ?? "none"}:${targetKey(chosen)}` : "";
  const currentStatus = status && status.key === listKey ? status.status : null;
  const report = currentStatus?.state === "done" ? currentStatus.report : null;
  // Held: this source needs an organization and none is chosen — known up
  // front from the adapter list, or learned from the server's hold.
  const held =
    Boolean(chosen) &&
    !organizationId &&
    (chosenAdapter?.needs_organization === true || currentStatus?.state === "held");

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
          (next) => setStatus({ key: listKey, status: next }),
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
    <RecordPageHeader record={{ name: "Connected sources" }} />
  );

  const connectLinks = missingProviders.map((provider) => (
    <Button key={provider} asChild variant="quiet">
      <Link href={providerHref(provider)}>
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
          <Button variant="outline" onClick={retry}>
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
    // One card per provider the server can read, naming what connecting it
    // makes browsable here — straight into that provider's own connect detail.
    const providers = [...new Set(adapters.map((a) => a.provider))];
    body = (
      <div className="mx-auto flex max-w-3xl flex-col gap-5 py-10">
        <h2 className="text-center text-lg font-semibold text-foreground">
          Connect an account to browse it here
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {providers.map((provider) => (
            <Link
              key={provider}
              href={providerHref(provider)}
              data-clickable
              className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-[border-color,box-shadow] hover:border-foreground/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center gap-3">
                <ConnectorTile connector={providerMark(provider)} size="md" />
                <span className="text-sm font-semibold text-foreground">
                  {providerName(provider)}
                </span>
              </span>
              <span className="line-clamp-2 text-xs text-muted-foreground">
                {adapters
                  .filter((a) => a.provider === provider)
                  .map((a) => a.title)
                  .join(" · ")}
              </span>
              <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-primary">
                Connect {providerName(provider)}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
        <Link
          href={INTEGRATIONS_HREF}
          className="mx-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Browse every integration
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
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
            storePick(next);
            setPicked(next);
          }
        }}
      >
        <SelectTrigger
          aria-label="Account to browse"
          className="h-auto min-h-11 w-full min-w-0 py-1 sm:h-9 sm:min-h-0 sm:w-auto sm:max-w-full sm:py-0"
        >
          {/* The account first — it is what tells two choices apart. On a
              phone the source sits on its own line so neither is cut off. */}
          {/* A div, not a span: the trigger clamps a direct child SPAN to one
              line ([&>span]:line-clamp-1), which flattened these two lines. */}
          <div className="flex min-w-0 flex-col text-left sm:flex-row sm:items-baseline sm:gap-1">
            <span className="truncate sm:shrink-0">
              {chosenAdapter?.connections.find(
                (c) => c.connection_id === chosen.connectionId,
              )?.account_email ?? "This account"}
            </span>
            <span className="truncate text-xs text-muted-foreground sm:text-sm">
              <span className="hidden sm:inline">· </span>
              {chosenAdapter?.title}
            </span>
          </div>
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
              icon={<Info />}
              variant="quiet"
              className="shrink-0"
              aria-label={`What ${chosenAdapter.title} can and cannot reach`}
            />
          </PopoverTrigger>
          <PopoverContent /* sizing: fixed — two short sentences about one source */ align="start" className="w-80 space-y-1 text-sm">
            {chosenAdapter.browse_outcome ? <p>{chosenAdapter.browse_outcome}</p> : null}
            {chosenAdapter.limitation ? (
              <p className="text-muted-foreground">{chosenAdapter.limitation}</p>
            ) : null}
          </PopoverContent>
        </Popover>
      ) : null}
      <span
        role="status"
        className="min-w-0 flex-1 text-xs text-muted-foreground sm:truncate"
        title={report?.summary}
      >
        {statusLine(currentStatus)}
      </span>
      {connectLinks.length ? <div className="flex shrink-0 gap-1">{connectLinks}</div> : null}
    </div>
  );

  if (held) {
    return (
      <SurfaceRuntimeProvider
        surfaceName={CONNECTED_SOURCES_SURFACE_NAME}
        getScope={() => buildConnectedSourcesScope(getPageState())}
      >
        {header}
        <div className="matrx-touch-targets h-full space-y-4 overflow-y-auto px-4 pb-4 pt-[calc(var(--shell-header-h)+0.5rem)]">
          {accountBar}
          <OrganizationRequiredNotice
            // "…needed for browsing Outlook mail" — the notice lowers the first
            // letter of its subject, so the source's own name never leads.
            what={`Browsing ${chosenAdapter?.title ?? "this source"}`}
            onRetry={() => setStatus(null)}
          />
        </div>
      </SurfaceRuntimeProvider>
    );
  }

  return (
    <>
      {header}
      <EntityListPage
        key={listKey}
        config={config}
        scopeTabs={false}
        surface={createConnectedSourcesListSurface(getPageState, dispatch, setReadResult)}
        notice={accountBar}
        emptyAction={
          chosen.adapter === "google_picked_files" ? (
            <Button variant="primary" asChild>
              <Link href={providerHref("google")}>Pick files</Link>
            </Button>
          ) : undefined
        }
      />
      <ReadResultsDialog result={readResult} onClose={() => setReadResult(null)} />
    </>
  );
}
