"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, Share2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { BasicInput } from "@/components/ui/input";
import { BasicTextarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { usePublicScraperContent } from "@/features/public-chat/hooks/usePublicScraperContent";
import {
  extractSocialFromScrapeResponse,
  normalizeScrapeUrl,
} from "@/features/seo/serp/extract-seo-from-scrape";
import {
  evaluateSocialCard,
  cleanTagValue,
  KNOWN_TWITTER_CARDS,
} from "@/features/seo/audit/social";
import { AuditIssueList } from "@/features/seo/audit/AuditIssueList";
import { SocialCard, parseSocialDomain } from "./SocialCard";

/**
 * SocialCardAnalyzer — the canonical "social share appearance" composite.
 *
 * ONE component behind every surface that previews/validates Open Graph +
 * Twitter card metadata: the public tool (`/seo/social-preview`), the Social
 * Cards window panel, and any embed. Prop-driven and host-agnostic; layout
 * responds to the CONTAINER via `@container/social`. Validation is the
 * deterministic evaluator in `features/seo/audit/social.ts` (exact parity
 * with the scraper's crawl-time computation).
 */
export interface SocialCardAnalyzerValues {
  url: string;
  title: string;
  description: string;
  image: string;
  siteName: string;
  ogType: string;
  cardType: string;
}

export interface SocialCardAnalyzerProps {
  initialUrl?: string;
  initialTitle?: string;
  initialDescription?: string;
  initialImage?: string;
  initialSiteName?: string;
  initialOgType?: string;
  initialCardType?: string;
  /** Show the scrape-this-URL fetch button. Default true. */
  enableFetch?: boolean;
  onValuesChange?: (values: SocialCardAnalyzerValues) => void;
  className?: string;
}

const fieldLabelClass =
  "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const sectionTitleClass =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const previewChromeClass =
  "flex items-center gap-2 border-b border-border bg-muted/40 px-5 py-3";
const inputClass =
  "text-base md:text-sm h-9 border-border bg-background text-foreground";

export function SocialCardAnalyzer({
  initialUrl = "",
  initialTitle = "",
  initialDescription = "",
  initialImage = "",
  initialSiteName = "",
  initialOgType = "",
  initialCardType = "",
  enableFetch = true,
  onValuesChange,
  className,
}: SocialCardAnalyzerProps) {
  const [url, setUrl] = useState(initialUrl);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [image, setImage] = useState(initialImage);
  const [siteName, setSiteName] = useState(initialSiteName);
  const [ogType, setOgType] = useState(initialOgType);
  const [cardType, setCardType] = useState(initialCardType);
  const { scrapeUrl, isLoading: isFetching } = usePublicScraperContent();

  useEffect(() => {
    onValuesChange?.({ url, title, description, image, siteName, ogType, cardType });
  }, [url, title, description, image, siteName, ogType, cardType, onValuesChange]);

  const evaluation = evaluateSocialCard({
    ogTitle: cleanTagValue(title),
    ogDescription: cleanTagValue(description),
    ogImage: cleanTagValue(image),
    ogSiteName: cleanTagValue(siteName),
    ogUrl: cleanTagValue(url),
    ogType: cleanTagValue(ogType),
    twitterCard: cleanTagValue(cardType),
    twitterTitle: null,
    twitterDescription: null,
    twitterImage: null,
  });
  const domain = parseSocialDomain(url);
  const hasData = Boolean(
    title.trim() || description.trim() || image.trim() || url.trim(),
  );

  async function handleFetch() {
    if (!normalizeScrapeUrl(url)) {
      toast.error("Enter a valid website URL");
      return;
    }
    try {
      const result = await scrapeUrl(url.trim());
      const extracted = extractSocialFromScrapeResponse(result.rawResponse);
      if (extracted.url) setUrl(extracted.url);
      setTitle(extracted.ogTitle);
      setDescription(extracted.ogDescription);
      setImage(extracted.ogImage);
      setSiteName(extracted.ogSiteName);
      setOgType(extracted.ogType);
      setCardType(extracted.twitterCard);
      if (!extracted.ogTitle && !extracted.ogImage) {
        toast.warning("Page scraped, but no social share tags were found");
      } else {
        toast.success("Social tags loaded from page");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch tags");
    }
  }

  return (
    <div className={cn("@container/social", className)}>
      <div className="grid grid-cols-1 gap-6 @[64rem]/social:grid-cols-12">
        <aside className="space-y-4 @[64rem]/social:col-span-4">
          <Card className="overflow-hidden rounded-2xl shadow-sm">
            <CardHeader className="space-y-0 border-b border-border px-5 py-4">
              <CardTitle className={sectionTitleClass}>Share Tags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-5 py-5">
              <div className="space-y-1.5">
                <Label htmlFor="social-url" className={fieldLabelClass}>
                  Page URL
                </Label>
                <div className="flex gap-2">
                  <BasicInput
                    id="social-url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        enableFetch &&
                        e.key === "Enter" &&
                        url.trim() &&
                        !isFetching
                      ) {
                        e.preventDefault();
                        void handleFetch();
                      }
                    }}
                    placeholder="aimatrx.com"
                    className={cn(inputClass, "min-w-0 flex-1")}
                  />
                  {enableFetch ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="default"
                      disabled={!url.trim() || isFetching}
                      className="h-9 w-9 shrink-0"
                      aria-label="Fetch social tags from URL"
                      title="Fetch social tags from URL"
                      onClick={() => void handleFetch()}
                    >
                      {isFetching ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Search className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="social-title" className={fieldLabelClass}>
                    og:title
                  </Label>
                  {title.trim() ? (
                    <span
                      className={cn(
                        "font-mono text-[11px]",
                        evaluation.titleLength > 70
                          ? "text-warning"
                          : "text-success",
                      )}
                    >
                      {evaluation.titleLength}c
                    </span>
                  ) : null}
                </div>
                <BasicInput
                  id="social-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Social share title…"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="social-desc" className={fieldLabelClass}>
                    og:description
                  </Label>
                  {description.trim() ? (
                    <span
                      className={cn(
                        "font-mono text-[11px]",
                        evaluation.descriptionLength > 200
                          ? "text-warning"
                          : "text-success",
                      )}
                    >
                      {evaluation.descriptionLength}c
                    </span>
                  ) : null}
                </div>
                <BasicTextarea
                  id="social-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Social share description…"
                  rows={3}
                  className={cn(inputClass, "min-h-[4.5rem] resize-none py-2")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="social-image" className={fieldLabelClass}>
                  og:image
                </Label>
                <BasicInput
                  id="social-image"
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  placeholder="https://…/share-image.png (1200×630)"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="social-site-name" className={fieldLabelClass}>
                    og:site_name
                  </Label>
                  <BasicInput
                    id="social-site-name"
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                    placeholder="AI Matrx"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="social-og-type" className={fieldLabelClass}>
                    og:type
                  </Label>
                  <BasicInput
                    id="social-og-type"
                    value={ogType}
                    onChange={(e) => setOgType(e.target.value)}
                    placeholder="website"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="social-card-type" className={fieldLabelClass}>
                  twitter:card
                </Label>
                <select
                  id="social-card-type"
                  value={cardType}
                  onChange={(e) => setCardType(e.target.value)}
                  className={cn(
                    inputClass,
                    "w-full rounded-md border px-3 text-foreground",
                  )}
                >
                  <option value="">Not set</option>
                  {KNOWN_TWITTER_CARDS.map((card) => (
                    <option key={card} value={card}>
                      {card}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          {hasData ? (
            <Card className="overflow-hidden rounded-2xl shadow-sm">
              <CardHeader className="space-y-0 border-b border-border px-5 py-4">
                <CardTitle className={sectionTitleClass}>Checks</CardTitle>
              </CardHeader>
              <CardContent className="px-5 py-4">
                <AuditIssueList
                  issues={evaluation.issues}
                  successText="Share tags look great — title, image, description, card type, and canonical link are all present."
                />
              </CardContent>
            </Card>
          ) : null}
        </aside>

        <section className="space-y-4 @[64rem]/social:col-span-8">
          <div className="flex items-center justify-between gap-4">
            <h2 className={sectionTitleClass}>Share Previews</h2>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={cn(
                  "inline-flex h-2 w-2 rounded-full",
                  evaluation.ok ? "bg-success" : "bg-destructive",
                )}
              />
              {evaluation.ok ? "Ready to share" : "Needs attention"}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 @[40rem]/social:grid-cols-2">
            <Card className="overflow-hidden rounded-2xl shadow-sm @[40rem]/social:col-span-2">
              <div className={previewChromeClass}>
                <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">X</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {evaluation.cardType ?? "no twitter:card — small summary fallback"}
                </span>
              </div>
              <CardContent className="border-0 p-5">
                <SocialCard
                  platform="x"
                  title={title}
                  description={description}
                  image={image}
                  domain={domain}
                  cardType={cleanTagValue(cardType) ?? "summary"}
                  className="mx-auto max-w-lg"
                />
              </CardContent>
            </Card>

            <Card className="overflow-hidden rounded-2xl shadow-sm">
              <div className={previewChromeClass}>
                <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">Facebook</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  1200×630 recommended
                </span>
              </div>
              <CardContent className="border-0 p-5">
                <SocialCard
                  platform="facebook"
                  title={title}
                  description={description}
                  image={image}
                  domain={domain}
                />
              </CardContent>
            </Card>

            <Card className="overflow-hidden rounded-2xl shadow-sm">
              <div className={previewChromeClass}>
                <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">LinkedIn</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  1200×627 recommended
                </span>
              </div>
              <CardContent className="border-0 p-5">
                <SocialCard
                  platform="linkedin"
                  title={title}
                  description={description}
                  image={image}
                  domain={domain}
                />
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}
