"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Search, ShieldCheck, Library as LibraryIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DeckCard } from "./DeckCard";
import { listPublicDecks } from "../service";
import type { PublicDeck } from "../types";

/**
 * Community library browse surface. Search + certified-only facet over public
 * decks (`edu_public_decks`), certified-first. Signed-out friendly: viewing +
 * duplicate-to-edit route anon visitors through the P7 flow.
 */
export function LibraryBrowser({
  initialDecks,
  isSuperAdmin,
  isSignedIn,
}: {
  initialDecks: PublicDeck[];
  isSuperAdmin: boolean;
  isSignedIn: boolean;
}) {
  const [decks, setDecks] = useState<PublicDeck[]>(initialDecks);
  const [search, setSearch] = useState("");
  const [certifiedOnly, setCertifiedOnly] = useState(false);
  const [isPending, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runQuery = useCallback((s: string, c: boolean) => {
    startTransition(async () => {
      const next = await listPublicDecks({ search: s, certifiedOnly: c });
      setDecks(next);
    });
  }, []);

  // Debounced re-query on search; immediate on the facet toggle.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => runQuery(search, certifiedOnly), 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [search, certifiedOnly, runQuery]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-2">
        <LibraryIcon className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Community Library</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
        Free, public study decks from the AI Matrx community. Study a copy, or
        suggest an improvement. Look for the{" "}
        <span className="text-emerald-600 dark:text-emerald-400 font-medium">Certified</span>{" "}
        mark — editorially verified decks.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search decks by name, topic, or description…"
            className="pl-9"
          />
        </div>
        <Button
          variant={certifiedOnly ? "default" : "outline"}
          onClick={() => setCertifiedOnly((v) => !v)}
          className="gap-1.5 shrink-0"
        >
          <ShieldCheck className="h-4 w-4" />
          Certified only
        </Button>
      </div>

      {decks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-20 text-center text-muted-foreground">
          {isPending ? "Searching…" : "No public decks match yet."}
        </div>
      ) : (
        <div
          className={cn(
            "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4",
            isPending && "opacity-60 transition-opacity",
          )}
        >
          {decks.map((deck) => (
            <DeckCard
              key={deck.id}
              deck={deck}
              isSuperAdmin={isSuperAdmin}
              isSignedIn={isSignedIn}
            />
          ))}
        </div>
      )}
    </div>
  );
}
