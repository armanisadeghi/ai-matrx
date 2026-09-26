"use client";

/**
 * GitHubConnectionCard — the ONE thing every surface shows about GitHub.
 *
 * Modeled on Vercel's "Import Git Repository" screen and GitHub's own
 * /settings/installations page: the account you are acting as, then one row per
 * installation with its coverage ("All repositories" / "N selected"), and — the
 * part Vercel gets right and we did not — a PERMANENT "Missing Git repository?"
 * escape hatch, not an empty state that only appears once you are already lost.
 *
 * Why permanent: repository access is per-INSTALLATION. Arman's connection is
 * healthy, says "Connected", lists 62 repositories, and still cannot clone
 * AI-Matrix-Engine/aidream, because that organization has no installation. A
 * card that only offers the fix when it sees zero repositories can never tell
 * him that, because from AI Matrx's side nothing is wrong. The user is the only
 * one who knows which repository they were looking for, so the door to add it
 * stays open at all times.
 */

import { useMemo } from "react";
import {
  Building2,
  ExternalLink,
  GitBranch,
  Plus,
  RefreshCw,
  Unplug,
  User as UserIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useSurfaceScopeContribution } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { GitHubInstallation } from "./types";
import { useGitHubConnection } from "./useGitHubConnection";
import { ErrorNotice } from "@/components/errors/ErrorNotice";

function coverageLabel(installation: GitHubInstallation): string {
  if (installation.suspended) return "Suspended on GitHub";
  if (installation.repositorySelection === "all") return "All repositories";
  if (installation.repositorySelection === "selected") {
    return `${installation.repositoryCount} selected`;
  }
  return `${installation.repositoryCount} repositories`;
}

function syncedLabel(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) return "never synced";
  const when = new Date(lastSyncedAt);
  if (Number.isNaN(when.getTime())) return "never synced";
  return `synced ${formatDistanceToNow(when, { addSuffix: true })}`;
}

/** One installation row: who it covers, how much, and its GitHub settings. */
function InstallationRow({
  installation,
  compact,
}: {
  installation: GitHubInstallation;
  compact: boolean;
}) {
  const AccountIcon =
    installation.accountType === "Organization" ? Building2 : UserIcon;
  const body = (
    <>
      <Avatar className="h-5 w-5 shrink-0">
        {installation.accountAvatarUrl && (
          <AvatarImage
            src={installation.accountAvatarUrl}
            alt={installation.accountLogin}
          />
        )}
        <AvatarFallback className="text-[9px]">
          {installation.accountLogin.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
        {installation.accountLogin}
      </span>
      <AccountIcon
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
        aria-label={installation.accountType ?? "Account"}
      />
      <span className={cn("shrink-0", installation.suspended ? "text-destructive" : "text-muted-foreground")}>
        {coverageLabel(installation)}
      </span>
    </>
  );

  const className = cn(
    "flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs",
    compact ? "bg-background" : "bg-muted/30",
  );

  if (!installation.htmlUrl) return <div className={className}>{body}</div>;
  return (
    <a
      className={cn(className, "transition-colors hover:bg-accent")}
      href={installation.htmlUrl}
      target="_blank"
      rel="noreferrer"
      title={`Manage AI Matrx access for ${installation.accountLogin} on GitHub`}
    >
      {body}
      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
    </a>
  );
}

export function GitHubConnectionCard({
  compact = false,
}: {
  compact?: boolean;
}) {
  const github = useGitHubConnection();
  const connection = github.inventory.connection;
  const connected = connection?.status === "connected";
  const account = github.inventory.account;
  const installations = github.inventory.installations;
  const repositoryCount = github.inventory.repositories.length;

  const accountLogin = account?.login ?? null;
  const accountUrl =
    account?.htmlUrl ?? "https://github.com/settings/installations";

  const scope = useMemo(
    () => ({
      connected,
      status: connection?.status ?? "not_connected",
      account_login: accountLogin,
      repository_count: repositoryCount,
      installation_accounts: installations.map((row) => row.accountLogin),
    }),
    [connected, connection?.status, accountLogin, repositoryCount, installations],
  );

  useSurfaceScopeContribution(
    "matrx-user/settings",
    "github-account-card",
    () => (github.loading ? {} : { github_connection: scope }),
  );

  const handleDisconnect = async () => {
    const confirmed = await confirm({
      title: "Disconnect GitHub?",
      description:
        "Agents, GitHub MCP, sandboxes, and code workspaces will lose repository access until you reconnect. AI Matrx will revoke this GitHub connection and remove its cached repository inventory; the GitHub App installation may remain until you remove it on GitHub.",
      confirmLabel: "Disconnect GitHub",
      variant: "destructive",
    });
    if (!confirmed) return;
    await github.disconnect();
  };

  /**
   * THE ALWAYS-VISIBLE DOOR. Rendered whether or not repositories are missing,
   * because only the user knows which repository they came looking for.
   */
  const addAccessBlock = (
    <div
      className={cn(
        "border-t border-border px-0 py-2 sm:rounded-md sm:border sm:border-dashed sm:px-2.5",
        compact ? "sm:bg-background" : "sm:bg-muted/20",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Don&apos;t see the repos you want?
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-11 max-w-full px-2 text-sm sm:h-7"
          onClick={() => void github.install()}
          disabled={github.busy || github.loading}
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="sm:hidden">Add repository access</span>
          <span className="hidden sm:inline">Add an organization or more repositories</span>
          <ExternalLink className="h-3 w-3" />
        </Button>
      </div>
      <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
        Opens GitHub in a secure connection window and refreshes the inventory
        after GitHub confirms the updated installation.
      </p>
    </div>
  );

  return (
    <Card id="integration-github" className={cn("scroll-mt-20", connected && "border-emerald-500/40")}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {connected && account?.avatarUrl ? (
              <Avatar className="mt-0.5 h-8 w-8 shrink-0">
                <AvatarImage src={account.avatarUrl} alt={account.login} />
                <AvatarFallback className="text-xs">
                  {account.login.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ) : (
              <GitBranch className="mt-0.5 h-6 w-6 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">GitHub account</h3>
                <span
                  className={
                    connected
                      ? "text-xs text-emerald-600"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {connected ? "Connected" : "Not connected"}
                </span>
              </div>
              {github.loading ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  <SuspenseLoader
                    centered={false}
                    size="xs"
                    message="Loading GitHub account…"
                  />
                </div>
              ) : connected ? (
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  <a
                    className="break-all font-medium text-foreground hover:underline"
                    href={accountUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    @{accountLogin}
                  </a>{" "}
                  · {repositoryCount} repositories across {installations.length}{" "}
                  {installations.length === 1 ? "account" : "accounts"} ·{" "}
                  {syncedLabel(github.inventory.lastSyncedAt)}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Connect once to choose repositories and make them available to
                  AI Matrx agents, sandboxes, code workspaces, and the GitHub
                  MCP. You pick the accounts and repositories at GitHub; AI
                  Matrx never stores a password or a token you can see.
                </p>
              )}
              {github.error && (
                <ErrorNotice size="inline" className="mt-2 text-xs" message={github.error} />
              )}
              {!github.error && connection?.status === "needs_attention" && (
                <ErrorNotice size="inline" className="mt-2 text-xs" message={connection.last_error ??
                    "GitHub is authorized, but no approved GitHub App installation is available yet."} />
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:w-auto sm:shrink-0 sm:justify-end sm:gap-1.5">
            {connected ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 sm:h-8"
                  onClick={() => void github.sync()}
                  disabled={github.busy}
                >
                  <RefreshCw
                    className={
                      github.busy ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"
                    }
                  />
                  Refresh
                </Button>
                {!compact && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-11 sm:h-8"
                    onClick={() => void handleDisconnect()}
                    disabled={github.busy}
                  >
                    <Unplug className="h-3.5 w-3.5" /> Disconnect
                  </Button>
                )}
              </>
            ) : (
              <Button
                size="sm"
                className="h-11 sm:h-8"
                onClick={() => void github.connect()}
                disabled={github.loading || github.busy}
              >
                <GitBranch className="h-3.5 w-3.5" /> Connect GitHub
              </Button>
            )}
          </div>
        </div>

        {!github.loading && connected && (
          <div className="mt-3 space-y-1.5">
            {installations.length > 0 ? (
              installations.map((installation) => (
                <InstallationRow
                  key={installation.id ?? installation.accountLogin}
                  installation={installation}
                  compact={compact}
                />
              ))
            ) : (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-xs text-destructive">
                AI Matrx is authorized but not installed on any account, so no
                repository is reachable yet. Add one below.
              </p>
            )}
            {addAccessBlock}
          </div>
        )}

        {!github.loading && !connected && (
          <div className="mt-3">{addAccessBlock}</div>
        )}
      </CardContent>
    </Card>
  );
}
