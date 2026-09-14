"use client";

/**
 * GitHubRepositoryPicker — the searchable inventory, Vercel-style.
 *
 * It replaced a native `<select>` holding 62 `<option>` elements. A select is
 * the wrong primitive here for a reason that is not cosmetic: it cannot be
 * searched, it cannot show visibility or permission, and — the part that
 * matters — it cannot say "your search matched nothing because that account
 * isn't connected". A user hunting for `AI-Matrix-Engine/aidream` in a select
 * scrolls, fails, and blames us. Here the empty result carries the fix.
 */

import { useMemo, useState } from "react";
import { ExternalLink, Lock, Search } from "lucide-react";
import { Input } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { GitHubConnectionCard } from "./GitHubConnectionCard";
import type { GitHubRepository } from "./types";

/**
 * Search over what the row actually SHOWS: full name, visibility word, and
 * permission word. Typing "private" or "admin" filters, because those are the
 * words on screen and a search box that ignores them is a lie.
 */
export function filterGitHubRepositories(
  repositories: GitHubRepository[],
  query: string,
): GitHubRepository[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return repositories;
  return repositories.filter((repository) => {
    const visibility = repository.private ? "private" : "public";
    const haystack = [
      repository.fullName,
      visibility,
      repository.permissionLevel ?? "",
      repository.archived ? "archived" : "",
    ]
      .join(" ")
      .toLowerCase();
    return needle
      .split(/\s+/)
      .every((term) => haystack.includes(term));
  });
}

export function GitHubRepositoryPicker({
  repositories,
  selectedId,
  onSelect,
  disabled = false,
  showConnectionCard = true,
  /**
   * The account/inventory fetch this list is drawn from is still in flight
   * (mirrors `useGitHubConnection().loading`, shown above by
   * `GitHubConnectionCard`'s "Loading GitHub account…" state). While it is
   * true, `repositories` is necessarily still `[]` — an empty array never
   * means "connect an org", only "not answered yet". Rendering the
   * missing-repos fix message here at the same moment the card says
   * "Loading…" told the user two contradictory things at once.
   */
  loading = false,
}: {
  repositories: GitHubRepository[];
  selectedId: string | null;
  onSelect: (repository: GitHubRepository) => void;
  disabled?: boolean;
  showConnectionCard?: boolean;
  loading?: boolean;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(
    () => filterGitHubRepositories(repositories, query),
    [repositories, query],
  );

  return (
    <div className="space-y-2">
      {showConnectionCard && <GitHubConnectionCard compact />}

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search your GitHub repositories"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search repositories, private, admin…"
          className="h-9 pl-8 text-sm"
          disabled={disabled}
        />
      </div>

      <div className="max-h-56 overflow-y-auto rounded-md border border-border">
        {loading ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            Loading your repositories…
          </p>
        ) : matches.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            {repositories.length === 0
              ? "No repositories yet. Add an organization or repositories above, then refresh."
              : `No repository matches “${query}”. If it belongs to an organization, add that organization above — AI Matrx only sees accounts it is installed on.`}
          </p>
        ) : (
          <ul>
            {matches.map((repository) => {
              const selected = repository.id === selectedId;
              return (
                <li key={repository.id}>
                  <div
                    className={cn(
                      "flex items-center gap-2 border-b border-border/60 px-2 py-1.5 text-xs last:border-b-0",
                      selected && "bg-accent",
                    )}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-50"
                      onClick={() => onSelect(repository)}
                      disabled={disabled || repository.archived}
                      title={
                        repository.archived
                          ? `${repository.fullName} is archived on GitHub`
                          : `Use ${repository.fullName}`
                      }
                    >
                      {repository.private && (
                        <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                        {repository.fullName}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {repository.private ? "private" : "public"}
                        {repository.permissionLevel
                          ? ` · ${repository.permissionLevel}`
                          : ""}
                        {repository.archived ? " · archived" : ""}
                      </span>
                    </button>
                    <a
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      href={repository.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${repository.fullName} on GitHub`}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        {matches.length} of {repositories.length} repositories
      </p>
    </div>
  );
}
