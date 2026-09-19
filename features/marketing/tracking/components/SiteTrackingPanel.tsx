"use client";

/**
 * THE site tracking panel (google-native PLAN §4.10 Plane A) — the ONE component behind every
 * place a site's Google Tag Manager tracking is shown: the site's Integrations settings section
 * and the `siteTrackingWindow` window panel. A window body WRAPS this component; a bespoke copy
 * would be a second renderer that drifts (the window-panels law).
 *
 * What it answers, in Tracking Auditor order — and our edge over that champion is that it lives
 * ON the site record, for the owner, beside everything else about the site:
 *   · the container inventory (accounts → containers → workspaces) the read-only scope allows;
 *   · the graded checks, each with the evidence that produced it and the remedy that fixes it;
 *   · 🚨 the reconciliation: whether the container is actually ON the live page. Everything above
 *     it grades the container's WORKSPACE DRAFT. A verdict that skips this is the exact defect
 *     this feature exists to prevent;
 *   · how old the check is, and the server's own caveats, printed verbatim.
 *
 * Honesty rules it enforces (each one costs the reader money when skipped):
 *   · A container we could not read is a REFUSAL with the Connect door, never three grey "no"
 *     (`trackingHealth`, and the server refuses with a sentence rather than three falses).
 *   · `not_checked` renders as `not_checked` — never as a pass, never as a fail.
 *   · The rollout state is said plainly: Tag Manager is `internal_test` today, so a reader who
 *     cannot use it is told that, rather than shown a dead button (`rolloutSentence`).
 *   · Re-check states its consequence first: it spends a Google request and fetches the site.
 */

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  CircleHelp,
  ExternalLink,
  Loader2,
  RefreshCw,
  Tag,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errors";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import {
  isOrganizationRequiredError,
  OrganizationRequiredNotice,
} from "@/features/organizations/components/OrganizationRequiredNotice";
import { DataFreshnessLine } from "@/features/marketing/components/shared/DataFreshnessLine";
import { parseSiteIntegrations } from "@/features/marketing/data/integrations-schema";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { useTagManagerInventory } from "@/features/marketing/google/hooks";
import { useGoogleConnectorState } from "@/features/connectors/google-adapter";
import { GOOGLE_CONNECTOR_PROVIDER } from "@/features/connectors/provider-config";
import { productHealth, rolloutSentence } from "@/features/connectors/health";
import {
  trackingHealth,
  trackingSentence,
} from "@/features/marketing/tracking/health";
import {
  trackingSnapshotKey,
  useLatestTrackingSnapshot,
} from "@/features/marketing/tracking/hooks";
import { useTrackingSnapshotMaxAgeHours } from "@/features/marketing/tracking/knobs";
import { takeTrackingSnapshot } from "@/features/marketing/tracking/service";
import {
  CHECK_LABELS,
  PAGE_RECONCILIATION_CHECK_ID,
  type TrackingCheck,
  type TrackingVerdict,
} from "@/features/marketing/tracking/types";
import type { MarketingSite } from "@/features/marketing/types";

const TAG_MANAGER_PRODUCT_KEY = "tag_manager";

/** Google's own door for one container — its workspace list in Tag Manager. */
function tagManagerContainerUrl(accountId: string, containerId: string): string {
  return `https://tagmanager.google.com/#/container/accounts/${encodeURIComponent(accountId)}/containers/${encodeURIComponent(containerId)}/workspaces`;
}

const VERDICT_TONE: Record<TrackingVerdict, string> = {
  pass: "border-success/40 bg-success/5",
  fail: "border-destructive/40 bg-destructive/5",
  // NOT a warning colour that reads as "nearly bad": nothing was measured, and the row says so.
  not_checked: "border-border bg-muted/20",
};

const VERDICT_WORD: Record<TrackingVerdict, string> = {
  pass: "Yes",
  fail: "No",
  not_checked: "Not checked",
};

function CheckRow({ check }: { check: TrackingCheck }) {
  const label = CHECK_LABELS[check.id] ?? check.id.replace(/_/g, " ");
  return (
    <li
      className={cn("space-y-1 rounded-md border p-2.5", VERDICT_TONE[check.verdict])}
    >
      <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-foreground">
        {check.verdict === "not_checked" ? (
          <CircleHelp className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ) : check.verdict === "fail" ? (
          <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
        ) : null}
        <span>{label}</span>
        <Badge variant={check.verdict === "pass" ? "success" : "outline"}>
          {VERDICT_WORD[check.verdict]}
        </Badge>
      </p>
      {/* THE EVIDENCE IS ON THE VERDICT, never a level down. A graded check whose evidence is
          somewhere else is an opinion the reader has to go and corroborate. */}
      {check.evidence ? (
        <p className="text-[11px] leading-4 text-muted-foreground">{check.evidence}</p>
      ) : null}
      {check.remedy ? (
        <p className="text-[11px] leading-4 text-foreground">{check.remedy}</p>
      ) : null}
      {check.fetchedUrl ? (
        <p className="text-[11px] leading-4 text-muted-foreground">
          {`Read from ${check.fetchedUrl}`}
          {check.httpStatus ? ` (HTTP ${check.httpStatus})` : ""}
        </p>
      ) : null}
    </li>
  );
}

export interface SiteTrackingPanelProps {
  site: MarketingSite;
  /** `section` carries its own card chrome; `bare` expects the host to be it. */
  variant?: "section" | "bare";
  /** Injectable so one clock judges the age (the DataFreshnessLine contract). */
  now?: Date;
  className?: string;
}

export function SiteTrackingPanel({
  site,
  variant = "section",
  now,
  className,
}: SiteTrackingPanelProps) {
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [organizationRefused, setOrganizationRefused] = useState(false);
  const queryClient = useQueryClient();

  const binding = parseSiteIntegrations(site.integrations).googleTagManager;
  const containerBound = binding.enabled && Boolean(binding.resourceRef.trim());

  const snapshotQuery = useLatestTrackingSnapshot({
    siteId: site.id,
    organizationId: site.organization_id,
  });
  const knob = useTrackingSnapshotMaxAgeHours();
  const connector = useGoogleConnectorState();
  const inventory = useTagManagerInventory();

  const health = trackingHealth({
    snapshot: snapshotQuery.data ?? null,
    containerBound,
    maxAgeHours: knob.hours,
    now: now ?? new Date(),
  });
  const findings = health.findings;
  const reconciliation = findings?.pageReconciliation ?? null;
  const otherChecks =
    findings?.checks.filter((check) => check.id !== PAGE_RECONCILIATION_CHECK_ID) ??
    [];

  // THE ROLLOUT STATE, SAID PLAINLY. Tag Manager's catalog row is `internal_test` today, so a
  // reader who is not admitted must be told that rather than shown a button that refuses.
  const product = GOOGLE_CONNECTOR_PROVIDER.products.find(
    (entry) => entry.key === TAG_MANAGER_PRODUCT_KEY,
  );
  const account =
    connector.accounts.find((entry) => entry.id === binding.credentialRef) ??
    connector.accounts[0] ??
    null;
  const productRow =
    product && !connector.rolloutUnavailable
      ? productHealth({
          provider: GOOGLE_CONNECTOR_PROVIDER,
          product,
          account,
          rollout: connector.rollout,
        })
      : null;
  // THE ROLLOUT SENTENCE IS ONLY SAID WHEN THE ROLLOUT IS WHAT IS BLOCKING. Printing
  // "generally available" beside "not switched on" is two sentences that contradict each other:
  // a product can be fully rolled out and still not connected on THIS account, and the row's own
  // `reason` / `remedy` are the honest words for that.
  const rolloutBlocking = productRow?.rollout.some((entry) => !entry.eligible) ?? false;
  const rollout = productRow && rolloutBlocking ? rolloutSentence(productRow) : null;
  const productReady = productRow ? productRow.state === "connected" : false;
  const integrationsHref = marketingRoutes.siteSettings(
    site.brand_id,
    site.id,
    "integrations",
  );

  const canCheck = Boolean(
    containerBound && binding.credentialRef && productReady && !checking,
  );

  const runCheck = async () => {
    // A DESTRUCTIVE-OR-EXPENSIVE CLICK STATES ITS CONSEQUENCE FIRST. This one spends a Google
    // Tag Manager request AND fetches the customer's own website, so "Are you sure?" would not
    // be enough — it names both.
    const agreed = await confirm({
      title: `Check ${site.domain}'s tracking now?`,
      description:
        `This reads container ${binding.resourceRef} from Google Tag Manager — spending part of ` +
        `this account's Tag Manager request allowance — and then fetches ${site.domain}'s own ` +
        `homepage once to see whether the container is actually on it. It deletes nothing: the ` +
        `new snapshot is stored beside the old ones and this panel reads the newest.`,
      confirmLabel: "Check tracking",
      cancelLabel: "Not now",
    });
    if (!agreed) return;
    setChecking(true);
    setCheckError(null);
    setOrganizationRefused(false);
    try {
      await takeTrackingSnapshot({
        siteId: site.id,
        organizationId: site.organization_id,
        connectionId: binding.credentialRef,
        containerId: binding.resourceRef || null,
      });
      await queryClient.invalidateQueries({
        queryKey: trackingSnapshotKey(site.id),
      });
      toast.success("Tracking checked");
    } catch (error) {
      if (isOrganizationRequiredError(error)) {
        setOrganizationRefused(true);
        return;
      }
      const message = extractErrorMessage(error);
      setCheckError(message);
      toast.error("Tracking check failed", { description: message });
    } finally {
      setChecking(false);
    }
  };

  const copy = webCopy({
    kind: "web-site-tracking",
    label: `Tag Manager tracking — ${site.domain}`,
    description: `The graded Tag Manager checks for ${site.domain}, with the evidence behind each verdict and whether the container is on the live page.`,
    surface: "Site tracking panel",
    data: snapshotQuery.data ?? {},
    lines: findings
      ? [
          ["Verdict", trackingSentence(findings)],
          ["Container", findings.containerId ?? "unknown"],
          ["Workspace", findings.workspaceName ?? "unknown"],
          [
            "On the live page",
            reconciliation
              ? `${VERDICT_WORD[reconciliation.verdict]} — ${reconciliation.evidence}`
              : "not checked",
          ],
          // THE CAVEAT TRAVELS WITH THE VERDICT. A copied grade without it reads as production
          // truth when it is a workspace draft.
          ["Caveat", findings.caveat ?? "none reported"],
        ]
      : [["Tracking", "never checked"]],
    attributes: {
      site_id: site.id,
      container_id: findings?.containerId ?? "",
      taken_at: snapshotQuery.data?.taken_at ?? "",
    },
  });

  const body = (
    <div className="flex min-w-0 flex-col gap-2.5">
      {/* THE ROLLOUT STATE, never a dead panel. A reviewer-only read is NAMED as one. */}
      {productRow && !productReady ? (
        <div className="rounded-md border border-border bg-muted/20 p-2.5">
          <p className="text-xs font-medium text-foreground">
            {`Tag Manager: ${productRow.label}`}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {productRow.reason}
            {productRow.remedy ? ` ${productRow.remedy}` : ""}
            {rollout ? ` ${rollout}` : ""} Everything already stored for this site still shows
            below; nothing new is read from Google until this is settled.
          </p>
        </div>
      ) : null}

      {!containerBound ? (
        // A REFUSAL WITH ITS DOOR, never three grey "no". Nothing here is graded, and the panel
        // says which single thing would make it gradeable.
        <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5">
          <p className="text-xs font-medium text-foreground">
            No Tag Manager container is bound to this site
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            Bind the container whose id appears in this site&rsquo;s own Tag Manager snippet
            (it looks like <span className="font-mono">GTM-ABC1234</span>) and this panel will
            grade what is firing, and check that the container is really on the page.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href={integrationsHref}>
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Bind a container
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <DataFreshnessLine
          provider="tag_manager"
          dataThrough={null}
          pulledAt={snapshotQuery.data?.taken_at ?? null}
          {...(now ? { now } : {})}
        />
      </div>

      {knob.unavailableReason ? (
        // Law 4: the stand-in announces itself with its remedy. The panel still states WHEN the
        // snapshot was taken; only the staleness verdict is unenforced.
        <p className="text-[11px] leading-4 text-muted-foreground">
          {knob.unavailableReason}
        </p>
      ) : null}

      {health.stale ? (
        <p className="text-[11px] leading-4 text-warning">
          {`This check is older than the ${knob.hours} hours your organization allows before a tracking check is called stale — re-check it.`}
        </p>
      ) : null}

      {/* "No organization selected" is not a crash and not an empty panel: both reads here file
          under one organization, so the refusal comes with the picker that answers it
          (`pnpm check:organization-context`). */}
      {snapshotQuery.isError && isOrganizationRequiredError(snapshotQuery.error) ? (
        <OrganizationRequiredNotice
          what="This site's tracking"
          compact
          onRetry={() => void snapshotQuery.refetch()}
        />
      ) : snapshotQuery.isError ? (
        <InlineQueryError
          what="this site's tracking snapshot"
          error={snapshotQuery.error}
          onRetry={() => void snapshotQuery.refetch()}
        />
      ) : null}

      {organizationRefused ? (
        <OrganizationRequiredNotice
          what="Checking this site's tracking"
          compact
          onRetry={() => void runCheck()}
        />
      ) : checkError ? (
        <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-2.5">
          <p className="text-xs font-medium text-destructive">
            The tracking check did not run
          </p>
          <p className="text-[11px] leading-4 text-muted-foreground">{checkError}</p>
        </div>
      ) : null}

      {containerBound && !snapshotQuery.isLoading && !snapshotQuery.data ? (
        <p className="text-xs leading-5 text-muted-foreground">
          A container is bound but this site has never been checked. Run a check to see what is
          firing on it.
        </p>
      ) : null}

      {findings ? (
        <>
          <p className="text-xs font-medium leading-5 text-foreground">
            {health.detail}
          </p>

          {/* THE RECONCILIATION LEADS. Every verdict under it describes a container; this one
              says whether that container is on the site at all. */}
          {reconciliation ? (
            <ul className="space-y-1.5">
              <CheckRow check={reconciliation} />
            </ul>
          ) : null}

          <ul className="space-y-1.5">
            {otherChecks.map((check) => (
              <CheckRow key={check.id} check={check} />
            ))}
          </ul>

          {/* The server's own words about what this read can and cannot see, verbatim. */}
          {findings.caveat ? (
            <p className="rounded-md border border-warning/40 bg-warning/5 p-2 text-[11px] leading-4 text-muted-foreground">
              {findings.caveat}
            </p>
          ) : null}
          {findings.truncated ? (
            <p className="text-[11px] leading-4 text-warning">
              The read hit its bound, so tags below the cut were not graded — this list is not the
              whole container.
            </p>
          ) : null}

          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-4">
            {[
              ["Account", findings.accountId],
              ["Container", findings.containerId],
              ["Workspace", findings.workspaceName ?? findings.workspaceId],
            ].map(([label, value]) => (
              <div key={label as string} className="min-w-0">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="truncate font-mono text-foreground" title={value ?? ""}>
                  {value ?? "—"}
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}

      {/* THE INVENTORY — accounts → containers → workspaces, which is everything the read-only
          Tag Manager scope returns for a listing. Tags are read per container by the check above
          (their names are in its evidence); triggers and variables are NOT in this scope's
          listing at all, and the panel says so rather than showing empty headings. */}
      <div className="space-y-2 rounded-md border border-border bg-muted/10 p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-foreground">Container inventory</p>
          <Button
            size="sm"
            variant="outline"
            className="h-6 gap-1 px-2 text-[11px]"
            disabled={!binding.credentialRef || inventory.isPending || !productReady}
            title={
              !binding.credentialRef
                ? "Bind a Google account to this site first"
                : !productReady
                  ? "Tag Manager is not switched on for this account yet"
                  : "List the accounts, containers and workspaces this Google account can read"
            }
            onClick={() => {
              inventory.mutate({
                connectionId: binding.credentialRef,
                organizationId: site.organization_id,
              });
            }}
          >
            {inventory.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            List containers
          </Button>
        </div>
        {inventory.isError ? (
          <InlineQueryError
            what="this account's Tag Manager containers"
            error={inventory.error}
            onRetry={() => {
              inventory.mutate({
                connectionId: binding.credentialRef,
                organizationId: site.organization_id,
              });
            }}
          />
        ) : null}
        {inventory.data ? (
          inventory.data.accounts.length === 0 ? (
            <p className="text-[11px] leading-4 text-muted-foreground">
              This Google account can read no Tag Manager accounts. That is a Tag Manager
              permission, not a Matrx one — ask the container&rsquo;s owner to grant this address
              read access.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {inventory.data.accounts.map((tmAccount) => (
                <li key={tmAccount.account_id} className="text-[11px] leading-4">
                  <span className="font-medium text-foreground">{tmAccount.name}</span>
                  <ul className="mt-0.5 space-y-0.5 pl-3">
                    {tmAccount.containers.map((container) => (
                      <li key={container.container_id} className="text-muted-foreground">
                        {/* THE DOOR LAW: a container id the panel names must OPEN. It is
                            Google's record, not ours, so its door is Google's — the container's
                            own workspace list in Tag Manager, in a new tab. */}
                        <a
                          href={tagManagerContainerUrl(
                            tmAccount.account_id,
                            container.container_id,
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-foreground underline-offset-2 hover:underline"
                          title={`Open ${container.name} in Google Tag Manager`}
                        >
                          {container.name}
                          <span className="font-mono">
                            {container.public_id ?? container.container_id}
                          </span>
                          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                        </a>
                        {container.workspaces.length ? (
                          <span>
                            {" · "}
                            {container.workspaces
                              .map((workspace) => workspace.name)
                              .join(", ")}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )
        ) : null}
        <p className="text-[11px] leading-4 text-muted-foreground">
          Accounts, containers and workspaces are everything the read-only Tag Manager permission
          lists. A container&rsquo;s tags are read by the check above — their names are in its
          evidence — and triggers and variables are not listed by this permission at all, so
          nothing here is hiding them.
        </p>
      </div>
    </div>
  );

  const header = (
    <div
      className={cn(
        "flex h-10 items-center justify-between gap-2 px-3",
        variant === "section" ? "border-b border-border" : "px-0",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Tag className="h-4 w-4 text-primary" aria-hidden />
        <h2 className="truncate text-sm font-semibold text-foreground">Tracking</h2>
        <Badge
          variant={health.state === "connected" ? "success" : "outline"}
          title={health.detail}
        >
          {health.state === "connected"
            ? "Healthy"
            : health.state === "attention"
              ? "Needs attention"
              : "Not connected"}
        </Badge>
      </div>
      <div className="flex items-center gap-1">
        {snapshotQuery.data ? (
          <CopyButtons size="icon" {...copy} json={() => snapshotQuery.data} />
        ) : null}
        <Button
          size="sm"
          variant="outline"
          className="h-6 gap-1 px-2 text-[11px]"
          onClick={() => void runCheck()}
          disabled={!canCheck}
          title={
            !containerBound
              ? "Bind a Tag Manager container to this site first"
              : !productReady
                ? "Tag Manager is not switched on for this account yet"
                : "Read the container from Google and fetch this site once to check it"
          }
        >
          {checking ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Re-check
        </Button>
      </div>
    </div>
  );

  if (variant === "bare") {
    // The window frame IS the chrome, so no second border or background — but the actions still
    // belong to the panel, never re-implemented by the host.
    return (
      <div className={cn("flex min-w-0 flex-col gap-2", className)}>
        {header}
        {body}
      </div>
    );
  }
  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      {header}
      <div className="p-3">{body}</div>
    </section>
  );
}
