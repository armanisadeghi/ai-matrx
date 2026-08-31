"use client";

import { ExternalLink, GitBranch, RefreshCw, Unplug } from "lucide-react";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isJsonObject } from "@/types/json";
import { useGitHubConnection } from "./useGitHubConnection";

export function GitHubConnectionCard({
  compact = false,
}: {
  compact?: boolean;
}) {
  const github = useGitHubConnection();
  const connection = github.inventory.connection;
  const connected = connection?.status === "connected";
  const accountLogin =
    connection &&
    isJsonObject(connection.metadata) &&
    typeof connection.metadata.account_login === "string"
      ? connection.metadata.account_login
      : connection?.account_name;
  const accountUrl = accountLogin
    ? `https://github.com/${encodeURIComponent(accountLogin)}`
    : "https://github.com/settings/installations";

  const handleDisconnect = async () => {
    const confirmed = await confirm({
      title: "Disconnect GitHub?",
      description:
        "Agents, GitHub MCP, sandboxes, and code workspaces will lose repository access until you reconnect. AI Matrx will revoke its GitHub authorization and remove its cached repository inventory; the GitHub App installation may remain until you remove it on GitHub.",
      confirmLabel: "Disconnect GitHub",
      variant: "destructive",
    });
    if (!confirmed) return;
    await github.disconnect();
  };

  return (
    <Card className={connected ? "border-emerald-500/40" : undefined}>
      <CardContent className={compact ? "p-3" : "p-4"}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <GitBranch className="mt-0.5 h-6 w-6 shrink-0" />
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
                  · {github.inventory.repositories.length} repositories
                  available · agents, sandboxes, and GitHub MCP share this
                  connection
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Connect once to choose repositories and make them available to
                  AI Matrx agents and code workspaces.
                </p>
              )}
              {github.error && (
                <p className="mt-2 text-xs text-destructive" role="alert">
                  {github.error}
                </p>
              )}
            </div>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:shrink-0 sm:flex-wrap sm:justify-end sm:gap-1.5">
            {connected ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 w-full sm:h-8 sm:w-auto"
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
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 w-full sm:h-8 sm:w-auto"
                  asChild
                >
                  <a
                    href="https://github.com/settings/installations"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Manage access <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
                {!compact && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-11 w-full sm:h-8 sm:w-auto"
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
                className="h-11 w-full sm:h-8 sm:w-auto"
                onClick={() => void github.connect()}
                disabled={github.loading || github.busy}
              >
                <GitBranch className="h-3.5 w-3.5" /> Connect GitHub
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
