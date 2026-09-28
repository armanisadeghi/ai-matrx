"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Search, ShieldCheck, Library as LibraryIcon, Lightbulb } from "lucide-react";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DeckCard } from "./DeckCard";
import { listPublicDecks, suggestDeckEdit } from "../service";
import type { PublicDeck } from "../types";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { collectionWriteHandlers } from "@/features/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import { EDUCATION_LIBRARY_COMMUNITY_SURFACE_NAME } from "@/features/surfaces/manifests/education-library-community.manifest";
import { isOrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";
import { forkSharedResource } from "@/utils/permissions/shareLinks";
import {
  buildCommunityLibraryScope,
  parseCopyDecksValue,
  parseCreateDeckSuggestionsValue,
} from "../communitySurface";
import { ReadFailure } from "@/components/read-state/ReadFailure";
import { StaleDataNotice } from "@/components/official/stale-data/StaleDataNotice";
import { extractErrorMessage } from "@/utils/errors";

/**
 * Community library browse surface. Search + certified-only facet over public
 * decks (`edu_public_decks`), certified-first. Signed-out friendly: viewing +
 * duplicate-to-edit route anon visitors through the P7 flow.
 */
export function LibraryBrowser({
  initialDecks,
  initialError = null,
  isSuperAdmin,
  isSignedIn: isSignedInOnServer,
  openSuggestionCount = 0,
}: {
  initialDecks: PublicDeck[];
  /** The server's first read failed — say it, never "no decks". */
  initialError?: string | null;
  isSuperAdmin: boolean;
  isSignedIn: boolean;
  /** Open suggestions on the viewer's own decks — the badge on the inbox door. */
  openSuggestionCount?: number;
}) {
  // The server's answer can blink to "signed out" when its identity check
  // is briefly unavailable (seen live 2026-09-27: a signed-in admin lost the
  // Suggest edit buttons and the suggestions door on one load). The client
  // session is the second witness; either one means signed in.
  const isSignedInOnClient = useAppSelector(selectIsAuthenticated);
  const isSignedIn = isSignedInOnServer || isSignedInOnClient;
  const [decks, setDecks] = useState<PublicDeck[]>(initialDecks);
  const [loadError, setLoadError] = useState<unknown>(initialError);
  const [search, setSearch] = useState("");
  const [certifiedOnly, setCertifiedOnly] = useState(false);
  const [isPending, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runQuery = useCallback((s: string, c: boolean) => {
    startTransition(async () => {
      try {
        const next = await listPublicDecks({ search: s, certifiedOnly: c });
        setDecks(next);
        setLoadError(null);
      } catch (err) {
        setLoadError(err);
      }
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

  // Surface `matrx-user/education-library-community`: what the page shows,
  // read from render state (getScope never fetches — it is polled), plus the
  // two things a person can do to someone else's deck here, through the same
  // functions the buttons call: "Study a copy" (copy_decks) and "Suggest
  // edit" (create_deck_suggestions).
  const getScope = () =>
    buildCommunityLibraryScope({
      decks,
      search,
      certifiedOnly,
      searching: isPending,
      isSignedIn,
      openSuggestionCount,
    });

  const guard = <T,>(parse: () => T): T => {
    try {
      return parse();
    } catch (e) {
      return refuseSurfaceWrite((e as Error).message);
    }
  };

  const copyHandlers = collectionWriteHandlers(
    {
      plural: "decks",
      singular: "deck",
      create: {
        parse: (value) =>
          guard(() => parseCopyDecksValue(value, decks, isSignedIn)),
        run: async (deck: PublicDeck) => {
          const result = await forkSharedResource("fc_set", deck.id);
          if (!result.success || !result.path)
            throw new Error(result.error ?? "the copy could not be saved");
          const copyId = result.path.split("/").filter(Boolean).pop() ?? "";
          // The copy keeps the deck's name (same as the button's fork).
          return { id: copyId, name: deck.name };
        },
        nameOf: (deck: PublicDeck) => deck.name,
        refusalFor: (e) =>
          isOrganizationSelectionCancelled(e)
            ? "The person closed the workspace picker, so no decks were copied. Ask which workspace the copies belong in."
            : undefined,
      },
    },
    refuseSurfaceWrite,
  );

  const suggestionHandlers = collectionWriteHandlers(
    {
      plural: "deck_suggestions",
      singular: "deck suggestion",
      create: {
        parse: (value) =>
          guard(() =>
            parseCreateDeckSuggestionsValue(value, decks, isSignedIn),
          ),
        run: async (plan: { deck: PublicDeck; body: string }) => {
          await suggestDeckEdit(plan.deck.id, plan.body);
          return { id: plan.deck.id, name: `Suggestion on ${plan.deck.name}` };
        },
        nameOf: (plan: { deck: PublicDeck }) => `suggestion on ${plan.deck.name}`,
      },
    },
    refuseSurfaceWrite,
  );

  const getWriteHandlers = () => ({
    copy_decks: copyHandlers.create_decks,
    create_deck_suggestions: suggestionHandlers.create_deck_suggestions,
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName={EDUCATION_LIBRARY_COMMUNITY_SURFACE_NAME}
      getScope={getScope}
      getWriteHandlers={getWriteHandlers}
    >
    <NonEditableContextMenu
      sourceFeature="education-flashcards"
      surfaceName={EDUCATION_LIBRARY_COMMUNITY_SURFACE_NAME}
      menuVersion={1}
      getApplicationScope={getScope}
      contentSource={{ type: "raw" }}
    >
    <div className="matrx-touch-targets mx-auto w-full max-w-6xl px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-2">
        <LibraryIcon className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Community Library</h1>
        {/* The deck owner's own inbox. It was linked only from the admin route
            map, so the person the suggest-edit flywheel exists for had no way
            to reach it — the flywheel's other half was unreachable. */}
        {isSignedIn && (
          <Button
            asChild
            variant={openSuggestionCount > 0 ? "default" : "outline"}
            size="sm"
            className="ml-auto gap-1.5 shrink-0"
          >
            <Link href="/education/library/suggestions">
              <Lightbulb className="h-4 w-4" />
              Suggestions on your decks
              {openSuggestionCount > 0 && (
                <span className="ml-0.5 rounded-full bg-background/25 px-1.5 py-0.5 text-[11px] font-semibold leading-none">
                  {openSuggestionCount}
                </span>
              )}
            </Link>
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
        Free, public study decks from the AI Matrx community. Study a copy, or
        suggest an improvement. The{" "}
        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
          Certified
        </span>{" "}
        mark means a human expert verified the deck;{" "}
        <span className="font-medium text-foreground">AI-built starter</span>{" "}
        means we curated it but nobody has checked it yet.
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

      {loadError && decks.length > 0 ? (
        <StaleDataNotice
          hasData
          what="the community decks"
          detail={extractErrorMessage(loadError)}
          onRetry={() => runQuery(search, certifiedOnly)}
          className="mb-4"
        />
      ) : null}
      {loadError && decks.length === 0 ? (
        <ReadFailure
          error={loadError}
          what="the community decks"
          onRetry={() => runQuery(search, certifiedOnly)}
          className="m-0"
        />
      ) : decks.length === 0 ? (
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
    </NonEditableContextMenu>
    </SurfaceRuntimeProvider>
  );
}
