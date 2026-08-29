"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ExternalLink, Search } from "lucide-react";
import { MediumComponentLoading } from "@/components/matrx/LoadingComponents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLiveConnectors } from "./useLiveConnectors";

/** The canonical, live-only integrations directory used by the chat window. */
export function LiveIntegrationsList() {
  const [query, setQuery] = useState("");
  const {
    items,
    connect,
    refresh,
    connectingId,
    isNavigating,
    isLoading,
    error,
  } = useLiveConnectors();

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredItems = items
    .filter(({ connector }) => {
      if (!normalizedQuery) return true;
      return `${connector.name} ${connector.blurb}`
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    })
    .sort((left, right) =>
      left.connector.name.localeCompare(right.connector.name),
    );

  if (isLoading) return <MediumComponentLoading />;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 border-b border-border px-4 py-3 sm:px-5">
        <p className="text-sm text-muted-foreground">
          Connect the services agents can use in a conversation. Only live,
          usable integrations appear here.
        </p>
        <div className="relative mt-3">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search integrations"
            aria-label="Search live integrations"
            className="h-10 pl-9 text-base sm:h-9 sm:text-sm"
          />
        </div>
      </div>

      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm font-medium">
            Integrations could not be loaded
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void refresh()}
          >
            Try again
          </Button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {filteredItems.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              No live integrations match “{query.trim()}”.
            </div>
          ) : (
            <div role="list" aria-label="Live integrations">
              {filteredItems.map(({ connector, status, actionLabel }) => {
                const Logo = connector.logo;
                const connected = status === "connected";
                const busy = connectingId === connector.id || isNavigating;
                const label = `${actionLabel} ${connector.name}`;

                const identity =
                  connected && connector.manageHref ? (
                    <Link
                      href={connector.manageHref}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-foreground hover:underline"
                    >
                      {connector.name}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="font-medium text-foreground hover:underline disabled:cursor-wait"
                      onClick={() => void connect(connector.id)}
                      disabled={busy}
                      aria-label={label}
                    >
                      {connector.name}
                    </button>
                  );

                return (
                  <div
                    key={connector.id}
                    role="listitem"
                    className="flex items-center gap-3 border-b border-border/70 px-4 py-3 last:border-b-0 sm:px-5"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card">
                      <Logo
                        colored={connected}
                        className={cn(
                          "h-5 w-5",
                          !connected && "text-muted-foreground",
                        )}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm">
                        {identity}
                        {connected && (
                          <span className="inline-flex items-center gap-1 text-xs text-success">
                            <Check className="h-3 w-3" aria-hidden />
                            Connected
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {connector.blurb}
                      </p>
                    </div>
                    {connected && connector.manageHref ? (
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-10 shrink-0 gap-1.5 sm:h-8"
                      >
                        <Link
                          href={connector.manageHref}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={label}
                        >
                          Manage
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-10 shrink-0 sm:h-8"
                        onClick={() => void connect(connector.id)}
                        disabled={busy}
                        aria-label={label}
                      >
                        {busy ? "Opening…" : actionLabel}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
