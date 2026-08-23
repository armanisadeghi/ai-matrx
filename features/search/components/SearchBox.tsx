"use client";

/**
 * SearchBox — the ONE input for AI Matrx Search, in two sizes.
 *
 * Submitting writes the query to the URL (`/search?q=…`) and nothing else:
 * the URL is the state, so a search is shareable, the back button replays the
 * previous one, and a reload re-runs exactly what the address bar says.
 *
 * `hero` is the empty-state box (large, centered, autofocused); `compact` is
 * the one that lives in the shell header once results are on screen.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildSearchHref } from "../search-url";

interface SearchBoxProps {
  /** The query currently in the URL — the box resets to it on navigation. */
  currentQuery: string;
  variant?: "hero" | "compact";
  className?: string;
}

export function SearchBox({
  currentQuery,
  variant = "hero",
  className,
}: SearchBoxProps) {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();
  const [draft, setDraft] = useState(currentQuery);

  // Back/forward (and any other URL change) is the source of truth — the box
  // follows the address bar, never the other way around.
  useEffect(() => {
    setDraft(currentQuery);
  }, [currentQuery]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isNavigating) return;
    startTransition(() => {
      router.push(buildSearchHref(trimmed));
    });
  };

  const hero = variant === "hero";

  return (
    <form
      onSubmit={submit}
      role="search"
      className={cn(
        "flex w-full items-center gap-2",
        hero ? "max-w-2xl" : "max-w-xl",
        className,
      )}
    >
      <div className="relative min-w-0 flex-1">
        <Search
          className={cn(
            "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground",
            hero ? "h-5 w-5" : "h-4 w-4",
          )}
        />
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the hero state IS the search box; the caret belongs in it
          autoFocus={hero}
          aria-label="Search the web"
          placeholder="Search the web…"
          className={cn(
            "pl-10",
            hero ? "h-14 rounded-full text-base md:text-lg" : "h-9 rounded-full",
          )}
        />
      </div>
      <Button
        type="submit"
        disabled={!draft.trim() || isNavigating}
        className={cn("rounded-full", hero ? "h-14 px-6 text-base" : "h-9 px-4")}
      >
        {isNavigating ? (
          <Loader2 className={cn("animate-spin", hero ? "h-5 w-5" : "h-4 w-4")} />
        ) : (
          <Search className={cn(hero ? "h-5 w-5" : "h-4 w-4")} />
        )}
        <span className={cn(hero ? "ml-2" : "ml-1.5 hidden sm:inline")}>
          Search
        </span>
      </Button>
    </form>
  );
}
