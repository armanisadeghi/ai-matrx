"use client";

import { ExternalLink, GitBranch, Loader2, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isJsonObject } from "@/types/json";
import { useGitHubConnection } from "./useGitHubConnection";

export function GitHubConnectionCard({ compact = false }: { compact?: boolean }) {
  const github = useGitHubConnection();
  const connection = github.inventory.connection;
  const connected = connection?.status === "connected";
  const accountLogin =
    connection && isJsonObject(connection.metadata) && typeof connection.metadata.account_login === "string"
      ? connection.metadata.account_login
      : connection?.account_name;
  const accountUrl = accountLogin
    ? `https://github.com/${encodeURIComponent(accountLogin)}`
    : "https://github.com/settings/installations";

  return (
    <Card className={connected ? "border-emerald-500/40" : undefined}>
      <CardContent className={compact ? "p-3" : "p-4"}>
        <div className="flex items-start gap-3">
          <GitBranch className="mt-0.5 h-6 w-6 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">GitHub account</h3>
              <span className={connected ? "text-xs text-emerald-600" : "text-xs text-muted-foreground"}>
                {connected ? "Connected" : "Not connected"}
              </span>
            </div>
            {github.loading ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading…
              </p>
            ) : connected ? (
              <p className="mt-1 text-xs text-muted-foreground">
                <a className="text-foreground hover:underline" href={accountUrl} target="_blank" rel="noreferrer">
                  @{accountLogin}
                </a>{" "}
                · {github.inventory.repositories.length} repositories available · agents, sandboxes, and GitHub MCP share this connection
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Connect once to choose repositories and make them available to AI Matrx agents and code workspaces.
              </p>
            )}
            {github.error && <p className="mt-2 text-xs text-destructive">{github.error}</p>}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {connected ? (
              <>
                <Button variant="outline" size="sm" onClick={() => void github.sync()} disabled={github.busy}>
                  <RefreshCw className={github.busy ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
                  Refresh
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href="https://github.com/settings/installations" target="_blank" rel="noreferrer">
                    Manage access <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
                {!compact && (
                  <Button variant="ghost" size="sm" onClick={() => void github.disconnect()} disabled={github.busy}>
                    <Unplug className="h-3.5 w-3.5" /> Disconnect
                  </Button>
                )}
              </>
            ) : (
              <Button size="sm" onClick={() => github.connect()} disabled={github.loading}>
                <GitBranch className="h-3.5 w-3.5" /> Connect GitHub
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
