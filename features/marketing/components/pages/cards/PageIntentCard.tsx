"use client";

import { useState } from "react";
import { Download, Loader2, Save } from "lucide-react";
import { toast } from "@/lib/toast";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUpdatePageIntent } from "@/features/marketing/data/hooks";
import { useQueryClient } from "@tanstack/react-query";
import type { MarketingPage } from "@/features/marketing/types";
import { marketingPageManifest } from "@/features/surfaces/manifests/marketing-page.manifest";
import {
  surfaceGroupLabels,
  surfaceValueLabels,
} from "@/features/surfaces/utils/surface-display";
import { SerpFieldChips } from "@/features/marketing/seo/serp/SerpValidation";
import { MetaRecommendations } from "@/features/marketing/seo/serp/MetaRecommendations";
import {
  evaluateMetaTitle,
  evaluateMetaDescription,
} from "@/features/marketing/seo/serp/metrics";
import { SectionCard } from "@/features/marketing/components/shared/MarketingUi";
import { extractErrorMessage } from "@/utils/errors";
import { KeywordInput } from "@/features/marketing/seo/keyword/KeywordInput";
import { KeywordUsageChips } from "@/features/marketing/seo/keyword/KeywordUsageChips";
import { buildKeywordBrief } from "@/features/marketing/seo/keyword/keyword-brief";
import {
  seoKeywordKeys,
  usePageTopQueries,
  useResolvedKeyword,
} from "@/features/marketing/seo/keyword/hooks";
import { normalizeKeywordPhrase } from "@/features/marketing/seo/keyword/data";
import { useOpenKeywordWindow } from "@/features/overlays/openers/keywordWindow";
import type { KeywordSuggestion } from "@/features/marketing/seo/keyword/types";

// THE NAMING LAW: canonical labels for every declared surface value + group —
// section titles and field labels below render these byte-identically.
const L = surfaceValueLabels(marketingPageManifest);
const G = surfaceGroupLabels(marketingPageManifest);

export function PageIntentCard({
  page,
  brandId,
  observedTitle,
  observedDescription,
  observedH1,
  analyzerKeywords,
}: {
  page: MarketingPage;
  brandId: string | null;
  observedTitle: string | null;
  observedDescription: string | null;
  observedH1: string | null;
  /** Keyword candidates the Page Analyzer inferred for this page. */
  analyzerKeywords: KeywordSuggestion[];
}) {
  const mutation = useUpdatePageIntent();
  const queryClient = useQueryClient();
  const openKeywordIntel = useOpenKeywordWindow();
  const [keyword, setKeyword] = useState(page.target_keyword ?? "");
  // The keyword never travels bare: resolve the SAVED target keyword against
  // the universal keyword plane so its condensed market data rides along in
  // every copy/agent payload built from this card.
  const resolvedTarget = useResolvedKeyword(page.target_keyword);
  // Real Search Console queries already reaching this page — first-class
  // suggestions for what the target keyword should be.
  const topQueries = usePageTopQueries(page.id);
  const keywordSuggestions: KeywordSuggestion[] = [
    ...(topQueries.data ?? []).map(
      (row): KeywordSuggestion => ({
        phrase: row.query,
        source: "gsc",
        detail: `${row.impressions.toLocaleString()} impr${
          row.position === null ? "" : ` · pos ${row.position.toFixed(1)}`
        }`,
      }),
    ),
    ...analyzerKeywords,
  ];
  const [title, setTitle] = useState(page.meta_title_desired ?? "");
  const [description, setDescription] = useState(
    page.meta_description_desired ?? "",
  );
  const dirty =
    keyword !== (page.target_keyword ?? "") ||
    title !== (page.meta_title_desired ?? "") ||
    description !== (page.meta_description_desired ?? "");

  // Live verdict on the editorial draft — same deterministic evaluator the
  // scraper and the Search Appearance analyzer use.
  const draftTitleEval = title.trim() ? evaluateMetaTitle(title) : null;
  const draftDescEval = description.trim()
    ? evaluateMetaDescription(description)
    : null;

  const save = async () => {
    try {
      const savedKeyword = keyword.trim();
      await mutation.mutateAsync({
        siteId: page.site_id,
        pageId: page.id,
        expectedVersion: page.version,
        targetKeyword: savedKeyword || null,
        desiredMetaTitle: title.trim() || null,
        desiredMetaDescription: description.trim() || null,
      });
      // Nudge: a saved target keyword should never sit dataless — offer the
      // one-click library enrichment when the phrase is unknown. Reads the
      // resolution CACHE the KeywordInput already populated (no new fetch).
      const cachedResolution = queryClient.getQueryData<{
        keyword: unknown | null;
      }>(seoKeywordKeys.resolve(normalizeKeywordPhrase(savedKeyword)));
      if (savedKeyword && cachedResolution && !cachedResolution.keyword) {
        toast.success("Page intent saved", {
          description: `“${savedKeyword}” isn't in the keyword library yet — fetch its market data now?`,
          action: {
            label: "Fetch data",
            onClick: () =>
              openKeywordIntel({
                phrase: savedKeyword,
                organizationId: page.organization_id,
                siteId: page.site_id,
                pageId: page.id,
                brandId: brandId ?? undefined,
              }),
          },
        });
      } else {
        toast.success("Page intent saved");
      }
    } catch (error) {
      toast.error("Could not save page intent", {
        description: extractErrorMessage(error),
      });
    }
  };

  const useObservedMetadata = () => {
    setTitle(observedTitle ?? "");
    setDescription(observedDescription ?? "");
    toast.success("Current metadata copied into page intent");
  };

  // Condensed keyword dossier for AI/agent consumers — attached whenever the
  // page has a target keyword the library knows about.
  const targetBrief = page.target_keyword
    ? buildKeywordBrief({
        phrase: page.target_keyword,
        keyword: resolvedTarget.data?.keyword ?? null,
        market: resolvedTarget.data?.market ?? null,
      })
    : null;

  const copy = webCopy({
    kind: "web-page-intent",
    label: G.page_intent,
    description:
      "The user-owned editorial intent for this page (target keyword + its market data + desired metadata).",
    surface: `Page intent — ${page.url}`,
    data: {
      url: page.url,
      target_keyword: page.target_keyword,
      target_keyword_data: targetBrief?.data ?? null,
      meta_title_desired: page.meta_title_desired,
      meta_description_desired: page.meta_description_desired,
      seo_metrics_desired: page.seo_metrics_desired,
    },
    lines: [
      ["URL", page.url],
      [L.target_keyword, page.target_keyword ?? "not set"],
      ...(targetBrief?.lines.slice(1) ?? []),
      ["Desired title", page.meta_title_desired ?? "not set"],
      ["Desired description", page.meta_description_desired ?? "not set"],
    ],
    attributes: { page_id: page.id },
  });

  return (
    <SectionCard
      title={G.page_intent}
      copy={copy}
      collapsible
      anchor="page_intent"
      headerExtra={
        <button
          type="button"
          onClick={useObservedMetadata}
          disabled={!observedTitle && !observedDescription}
          aria-label="Fill intent from current page metadata"
          title="Fill desired title and description from the latest captured page"
          className="flex h-6 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      }
    >
      <div className="grid gap-3 p-3">
        <div className="space-y-1.5" data-surface-value="target_keyword">
          <Label htmlFor="target-keyword" className="text-xs">
            {L.target_keyword}
          </Label>
          <KeywordInput
            id="target-keyword"
            value={keyword}
            onChange={setKeyword}
            scope={{
              organizationId: page.organization_id,
              siteId: page.site_id,
              pageId: page.id,
              brandId,
            }}
            suggestions={keywordSuggestions}
          />
          <KeywordUsageChips
            phrase={keyword}
            fields={[
              { label: "Title", text: observedTitle },
              { label: "Description", text: observedDescription },
              { label: "H1", text: observedH1 },
              { label: "URL", text: page.path },
            ]}
          />
        </div>
        <div className="space-y-1.5" data-surface-value="desired_title">
          <div className="flex items-center justify-between">
            <Label htmlFor="desired-title" className="text-xs">
              {L.desired_title}
            </Label>
            {draftTitleEval ? (
              <SerpFieldChips
                chars={draftTitleEval.charCount}
                pixels={draftTitleEval.pixelWidth}
                ok={draftTitleEval.ok}
              />
            ) : (
              <span className="text-[10px] tabular-nums text-muted-foreground">
                0 characters
              </span>
            )}
          </div>
          <Input
            id="desired-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Editorial target, separate from observed content"
          />
        </div>
        <div className="space-y-1.5" data-surface-value="desired_description">
          <div className="flex items-center justify-between">
            <Label htmlFor="desired-description" className="text-xs">
              {L.desired_description}
            </Label>
            {draftDescEval ? (
              <SerpFieldChips
                chars={draftDescEval.charCount}
                pixels={draftDescEval.pixelWidth}
                ok={draftDescEval.ok}
              />
            ) : (
              <span className="text-[10px] tabular-nums text-muted-foreground">
                0 characters
              </span>
            )}
          </div>
          <Textarea
            id="desired-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            minHeight={86}
            maxHeight={160}
            placeholder="Editorial target, separate from observed content"
          />
        </div>
        {draftTitleEval?.issues.length || draftDescEval?.issues.length ? (
          <MetaRecommendations
            titleEval={draftTitleEval}
            descriptionEval={draftDescEval}
            issuesOnly
            compact
          />
        ) : null}
        <div className="flex justify-end">
          <Button
            size="sm"
            className="h-8"
            disabled={!dirty || mutation.isPending}
            onClick={() => void save()}
          >
            {mutation.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Save intent
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
