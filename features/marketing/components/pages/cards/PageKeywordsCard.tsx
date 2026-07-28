"use client";

/**
 * PageKeywordsCard — the keyword batch attached to this page, riding the
 * REAL keyword plane end-to-end: chips are `seo.keyword` library rows linked
 * by `seo_keyword → web_page` association edges (role `supporting`), the
 * primary stays `web.page.target_keyword` (the column PageIntentCard owns),
 * and adding goes through the canonical KeywordInput (library resolution,
 * GSC/analyzer suggestions, Keyword Intelligence). The page analyzer's
 * server-written keyword edges surface here automatically — same edge space.
 *
 * Interactions: add, remove, promote-to-primary (swaps the old primary into
 * the supporting batch), per-chip Keyword Intelligence.
 */

import { useState } from "react";
import { ArrowUpFromDot, BrainCircuit, Loader2, Tags, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { SectionCard } from "@/features/marketing/components/shared/MarketingUi";
import { KeywordInput } from "@/features/marketing/seo/keyword/KeywordInput";
import {
  formatSearchVolume,
  KeywordCompetitionBadge,
} from "@/features/marketing/seo/keyword-research/components/KeywordMetrics";
import { pickKeywordMarket } from "@/features/marketing/seo/keyword/data";
import { useOpenKeywordWindow } from "@/features/overlays/openers/keywordWindow";
import { useUpdatePageIntent } from "@/features/marketing/data/hooks";
import {
  addPageSupportingKeyword,
  ensureKeywordId,
  fetchKeywordsByIds,
  listPageKeywordEdges,
  pageKeywordsQueryKey,
  PAGE_KEYWORD_SUPPORTING_ROLE,
  removePageKeyword,
} from "@/features/marketing/data/page-keywords";
import { normalizeKeywordPhrase } from "@/features/marketing/seo/keyword/data";
import type { KeywordSuggestion } from "@/features/marketing/seo/keyword/types";
import type { MarketingPage } from "@/features/marketing/types";
import { extractErrorMessage } from "@/utils/errors";
import { PageTaskButton } from "@/features/marketing/components/pages/PageTaskButton";

interface BoardKeyword {
  keywordId: string;
  phrase: string;
  role: string;
  volume: number | null;
  competition: string | null;
}

export function PageKeywordsCard({
  page,
  brandId,
  suggestions,
}: {
  page: MarketingPage;
  brandId: string | null;
  /** GSC top queries + analyzer keywords from the workspace. */
  suggestions: KeywordSuggestion[];
}) {
  const queryClient = useQueryClient();
  const openKeywordIntel = useOpenKeywordWindow();
  const intentMutation = useUpdatePageIntent();
  const [draftPhrase, setDraftPhrase] = useState("");
  const [busyKeywordId, setBusyKeywordId] = useState<string | null>(null);
  const [pendingPhrases, setPendingPhrases] = useState<string[]>([]);

  const board = useQuery({
    queryKey: pageKeywordsQueryKey(page.id),
    queryFn: async (): Promise<BoardKeyword[]> => {
      const edges = await listPageKeywordEdges(page.id);
      const rows = await fetchKeywordsByIds(edges.map((edge) => edge.otherId));
      const byId = new Map(rows.map((row) => [row.id, row]));
      return edges
        .map((edge): BoardKeyword | null => {
          const row = byId.get(edge.otherId);
          if (!row) return null;
          const market = pickKeywordMarket(row.keyword_market);
          return {
            keywordId: row.id,
            phrase: row.phrase,
            role: edge.role ?? PAGE_KEYWORD_SUPPORTING_ROLE,
            volume: market?.search_volume ?? null,
            competition: market?.competition ?? null,
          };
        })
        .filter((entry): entry is BoardKeyword => entry !== null);
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: pageKeywordsQueryKey(page.id) });

  const keywords = board.data ?? [];
  const primaryPhrase = page.target_keyword?.trim() ?? "";
  const primaryNormalized = primaryPhrase.toLowerCase();
  const supporting = keywords.filter(
    (entry) => entry.phrase.toLowerCase() !== primaryNormalized,
  );

  const addMutation = useMutation({
    mutationFn: async (phrase: string) => {
      const keywordId = await ensureKeywordId(phrase);
      await addPageSupportingKeyword(
        page.id,
        keywordId,
        page.organization_id ?? undefined,
      );
    },
    onSuccess: () => {
      void invalidate();
    },
    onError: (error, phrase) => {
      toast.error("Could not attach keyword", {
        description: `“${phrase}”: ${extractErrorMessage(error)}`,
      });
    },
    onSettled: (_data, _error, phrase) => {
      const normalized = normalizeKeywordPhrase(phrase);
      setPendingPhrases((current) =>
        current.filter(
          (candidate) => normalizeKeywordPhrase(candidate) !== normalized,
        ),
      );
    },
  });

  const submitSupportingKeyword = (phrase: string) => {
    const trimmed = phrase.trim();
    const normalized = normalizeKeywordPhrase(trimmed);
    if (!normalized) return;
    const alreadyAttached =
      normalized === normalizeKeywordPhrase(primaryPhrase) ||
      supporting.some(
        (entry) => normalizeKeywordPhrase(entry.phrase) === normalized,
      ) ||
      pendingPhrases.some(
        (candidate) => normalizeKeywordPhrase(candidate) === normalized,
      );
    setDraftPhrase("");
    if (alreadyAttached) {
      toast.info(`“${trimmed}” is already in this keyword batch`);
      return;
    }
    setPendingPhrases((current) => [...current, trimmed]);
    addMutation.mutate(trimmed);
  };

  const remove = async (entry: BoardKeyword) => {
    setBusyKeywordId(entry.keywordId);
    try {
      await removePageKeyword(page.id, entry.keywordId, entry.role);
      await invalidate();
    } catch (error) {
      toast.error("Could not remove keyword", {
        description: extractErrorMessage(error),
      });
    } finally {
      setBusyKeywordId(null);
    }
  };

  /**
   * Promote a supporting keyword to the page's primary (target_keyword). The
   * old primary is preserved in the supporting batch instead of vanishing.
   */
  const promote = async (entry: BoardKeyword) => {
    setBusyKeywordId(entry.keywordId);
    try {
      await intentMutation.mutateAsync({
        siteId: page.site_id,
        pageId: page.id,
        expectedVersion: page.version,
        targetKeyword: entry.phrase,
        desiredMetaTitle: page.meta_title_desired,
        desiredMetaDescription: page.meta_description_desired,
      });
      if (primaryPhrase) {
        try {
          const oldPrimaryId = await ensureKeywordId(primaryPhrase);
          if (oldPrimaryId !== entry.keywordId) {
            await addPageSupportingKeyword(
              page.id,
              oldPrimaryId,
              page.organization_id ?? undefined,
            );
          }
        } catch {
          // Preserving the old primary is best-effort; the promote itself
          // already succeeded and the toast below reports that truth.
        }
      }
      toast.success(`“${entry.phrase}” is now the target keyword`);
      await invalidate();
    } catch (error) {
      toast.error("Could not promote keyword", {
        description: extractErrorMessage(error),
      });
    } finally {
      setBusyKeywordId(null);
    }
  };

  const copy = webCopy({
    kind: "web-page-keywords",
    label: "Keyword batch",
    description:
      "The batch of library keywords attached to this canonical page (primary + supporting), with market data.",
    surface: `Keyword batch — ${page.url}`,
    data: {
      url: page.url,
      target_keyword: page.target_keyword,
      supporting: supporting.map((entry) => ({
        phrase: entry.phrase,
        role: entry.role,
        search_volume: entry.volume,
        competition: entry.competition,
      })),
    },
    lines: [
      ["URL", page.url],
      ["Primary", page.target_keyword ?? "not set"],
      ...supporting.map((entry): [string, string] => [
        entry.role,
        `${entry.phrase}${entry.volume === null ? "" : ` (${formatSearchVolume(entry.volume)}/mo)`}`,
      ]),
    ],
    attributes: { page_id: page.id, count: supporting.length },
  });

  return (
    <SectionCard
      title="Keyword batch"
      copy={copy}
      collapsible
      anchor="keyword_batch"
      headerExtra={
        <PageTaskButton
          page={page}
          ariaLabel="Create a keyword research task"
          title={`Keyword research — ${page.path || page.url}`}
          description={`Research and expand the keyword batch for ${page.url}.\nPrimary: ${page.target_keyword ?? "not set"}\nSupporting: ${supporting.map((s) => s.phrase).join(", ") || "none"}`}
        />
      }
    >
      <div className="grid gap-3 p-3">
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <ArrowUpFromDot className="h-3 w-3 text-primary" />
            Primary
          </div>
          {primaryPhrase ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-2.5 py-1 text-xs font-medium text-foreground">
              {primaryPhrase}
              <button
                type="button"
                aria-label={`Open Keyword Intelligence for ${primaryPhrase}`}
                title="Keyword Intelligence"
                onClick={() =>
                  openKeywordIntel({
                    phrase: primaryPhrase,
                    organizationId: page.organization_id,
                    siteId: page.site_id,
                    pageId: page.id,
                    brandId: brandId ?? undefined,
                  })
                }
                className="text-muted-foreground transition-colors hover:text-primary"
              >
                <BrainCircuit className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : (
            <p className="text-xs text-muted-foreground">
              No target keyword yet — set one in Page intent, or promote a
              supporting keyword below.
            </p>
          )}
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Tags className="h-3 w-3 text-primary" />
            Supporting
            <span className="rounded-full bg-muted px-1.5 py-0.5 tabular-nums">
              {supporting.length}
            </span>
            {board.isFetching ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : null}
          </div>
          {supporting.length === 0 &&
          pendingPhrases.length === 0 &&
          !board.isLoading ? (
            <p className="text-xs text-muted-foreground">
              No supporting keywords attached yet. Add them below — the Page
              Analyzer also attaches what it discovers.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {supporting.map((entry) => {
                const busy = busyKeywordId === entry.keywordId;
                return (
                  <span
                    key={entry.keywordId}
                    className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                  >
                    {entry.phrase}
                    {entry.volume !== null ? (
                      <span className="tabular-nums text-[10px] text-muted-foreground">
                        {formatSearchVolume(entry.volume)}/mo
                      </span>
                    ) : null}
                    {entry.competition ? (
                      <KeywordCompetitionBadge
                        competition={entry.competition}
                        className="text-[9px]"
                      />
                    ) : null}
                    {busy ? (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    ) : (
                      <span className="flex items-center gap-0.5">
                        <button
                          type="button"
                          aria-label={`Open Keyword Intelligence for ${entry.phrase}`}
                          title="Keyword Intelligence"
                          onClick={() =>
                            openKeywordIntel({
                              phrase: entry.phrase,
                              organizationId: page.organization_id,
                              siteId: page.site_id,
                              pageId: page.id,
                              brandId: brandId ?? undefined,
                            })
                          }
                          className="text-muted-foreground transition-colors hover:text-primary"
                        >
                          <BrainCircuit className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Make ${entry.phrase} the target keyword`}
                          title="Promote to target keyword"
                          onClick={() => void promote(entry)}
                          className="text-muted-foreground transition-colors hover:text-primary"
                        >
                          <ArrowUpFromDot className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${entry.phrase} from this page`}
                          title="Remove from this page"
                          onClick={() => void remove(entry)}
                          className="text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    )}
                  </span>
                );
              })}
              {pendingPhrases.map((phrase) => (
                <span
                  key={`pending:${normalizeKeywordPhrase(phrase)}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {phrase}
                  <Loader2 className="h-3 w-3 animate-spin" />
                </span>
              ))}
            </div>
          )}
        </div>

        <KeywordInput
          value={draftPhrase}
          onChange={setDraftPhrase}
          onSubmit={submitSupportingKeyword}
          showDetails={false}
          scope={{
            organizationId: page.organization_id,
            siteId: page.site_id,
            pageId: page.id,
            brandId,
          }}
          suggestions={suggestions}
          placeholder="Type a supporting keyword and press Enter"
        />
      </div>
    </SectionCard>
  );
}
