"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle,
  AlertTriangle,
  Smartphone,
  Monitor,
  Search,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { BasicInput } from "@/components/ui/input";
import { BasicTextarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { usePublicScraperContent } from "@/features/public-chat/hooks/usePublicScraperContent";
import { SerpResult } from "@/features/seo/serp/SerpResult";
import { SerpSearchChrome } from "@/features/seo/serp/SerpSearchChrome";
import { SerpFieldBars } from "@/features/seo/serp/SerpValidation";
import {
  evaluateMetaTitle,
  evaluateMetaDescription,
  TITLE_LIMITS,
  DESCRIPTION_LIMITS,
  type MetaEvaluation,
} from "@/features/seo/serp/metrics";
import {
  extractSeoFromScrapeResponse,
  normalizeScrapeUrl,
} from "./extract-seo-from-scrape";

const fieldLabelClass =
  "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const sectionTitleClass =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const previewChromeClass =
  "flex items-center gap-2 border-b border-border bg-muted/40 px-5 py-3";
const inputClass =
  "text-base md:text-sm h-9 border-border bg-background text-foreground";

export function MetaInputWidget() {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const { scrapeUrl, isLoading: isFetching } = usePublicScraperContent();
  const [titleEval, setTitleEval] = useState<MetaEvaluation>(() =>
    evaluateMetaTitle(""),
  );
  const [descEval, setDescEval] = useState<MetaEvaluation>(() =>
    evaluateMetaDescription(""),
  );

  // Measurement uses the browser canvas, so it must run after mount and on
  // every edit. Debounced to keep typing smooth. Limits + math live in the
  // shared metrics module so the live preview agrees with the agent tools.
  useEffect(() => {
    const t = setTimeout(() => {
      setTitleEval(evaluateMetaTitle(title));
      setDescEval(evaluateMetaDescription(description));
    }, 150);
    return () => clearTimeout(t);
  }, [title, description]);

  const titleDesktopOk = titleEval.desktopOk;
  const titleMobileOk = titleEval.mobileOk;
  const titleCharOk = titleEval.charCount <= TITLE_LIMITS.maxChars;
  const descDesktopOk = descEval.desktopOk;
  const descMobileOk = descEval.mobileOk;
  const descCharOk = descEval.charCount <= DESCRIPTION_LIMITS.maxChars;
  const hasData = titleEval.charCount > 0 || descEval.charCount > 0;

  async function handleFetchMetadata() {
    if (!normalizeScrapeUrl(url)) {
      toast.error("Enter a valid website URL");
      return;
    }
    try {
      const result = await scrapeUrl(url.trim());
      const extracted = extractSeoFromScrapeResponse(result.rawResponse);
      if (extracted.url) setUrl(extracted.url);
      if (extracted.title) setTitle(extracted.title);
      if (extracted.description) setDescription(extracted.description);
      if (!extracted.title && !extracted.description) {
        toast.warning("Page scraped, but no meta title or description was found");
      } else {
        toast.success("Metadata loaded from page");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch metadata");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <aside className="space-y-4 xl:col-span-4">
        <Card className="overflow-hidden rounded-2xl shadow-sm">
          <CardHeader className="space-y-0 border-b border-border px-5 py-4">
            <CardTitle className={sectionTitleClass}>Input</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 px-5 py-5">
            <div className="space-y-1.5">
              <Label htmlFor="meta-url" className={fieldLabelClass}>
                Website URL
              </Label>
              <div className="flex gap-2">
                <BasicInput
                  id="meta-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && url.trim() && !isFetching) {
                      e.preventDefault();
                      void handleFetchMetadata();
                    }
                  }}
                  placeholder="allgreenrecycling.com"
                  className={cn(inputClass, "min-w-0 flex-1")}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="default"
                  disabled={!url.trim() || isFetching}
                  className="h-9 w-9 shrink-0"
                  aria-label="Fetch metadata from URL"
                  title="Fetch metadata from URL"
                  onClick={() => void handleFetchMetadata()}
                >
                  {isFetching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="meta-title" className={fieldLabelClass}>
                  Meta Title
                </Label>
                {title ? (
                  <span
                    className={cn(
                      "text-xs font-medium",
                      titleCharOk ? "text-success" : "text-destructive",
                    )}
                  >
                    {titleEval.charCount}/{TITLE_LIMITS.maxChars}
                  </span>
                ) : null}
              </div>
              <BasicInput
                id="meta-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter your meta title…"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="meta-desc" className={fieldLabelClass}>
                  Meta Description
                </Label>
                {description ? (
                  <span
                    className={cn(
                      "text-xs font-medium",
                      descCharOk ? "text-success" : "text-destructive",
                    )}
                  >
                    {descEval.charCount}/{DESCRIPTION_LIMITS.maxChars}
                  </span>
                ) : null}
              </div>
              <BasicTextarea
                id="meta-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter your meta description…"
                rows={4}
                className={cn(
                  inputClass,
                  "min-h-[6rem] resize-none py-2 leading-normal",
                )}
              />
            </div>
          </CardContent>
        </Card>

        {hasData ? (
          <Card className="overflow-hidden rounded-2xl shadow-sm">
            <CardHeader className="space-y-0 border-b border-border px-5 py-4">
              <CardTitle className={sectionTitleClass}>Analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 px-5 py-5">
              {title ? (
                <SerpFieldBars
                  field={{
                    label: "Meta Title",
                    chars: titleEval.charCount,
                    charLimit: TITLE_LIMITS.maxChars,
                    pixels: titleEval.pixelWidth,
                    pixelLimit: TITLE_LIMITS.displayPx,
                    ok: titleEval.ok,
                    desktopOk: titleEval.desktopOk,
                    mobileOk: titleEval.mobileOk,
                  }}
                />
              ) : null}
              {title && description ? <Separator className="bg-border" /> : null}
              {description ? (
                <SerpFieldBars
                  field={{
                    label: "Meta Description",
                    chars: descEval.charCount,
                    charLimit: DESCRIPTION_LIMITS.maxChars,
                    pixels: descEval.pixelWidth,
                    pixelLimit: DESCRIPTION_LIMITS.displayPx,
                    ok: descEval.ok,
                    desktopOk: descEval.desktopOk,
                    mobileOk: descEval.mobileOk,
                  }}
                />
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </aside>

      <section className="space-y-4 xl:col-span-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className={sectionTitleClass}>Live SERP Preview</h2>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex h-2 w-2 rounded-full",
                  titleDesktopOk && titleMobileOk && titleCharOk
                    ? "bg-success"
                    : "bg-destructive",
                )}
              />
              Title
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex h-2 w-2 rounded-full",
                  descDesktopOk && descMobileOk && descCharOk
                    ? "bg-success"
                    : "bg-destructive",
                )}
              />
              Description
            </span>
          </div>
        </div>

        <Card className="overflow-hidden rounded-2xl shadow-sm">
          <div className={previewChromeClass}>
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">
              Search Preview
            </span>
          </div>
          <CardContent className="border-0 p-0">
            <div className="bg-card px-5 py-4">
              <SerpSearchChrome query={title} />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-2xl shadow-sm">
          <div className={previewChromeClass}>
            <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Desktop</span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              Max {TITLE_LIMITS.desktopPx}px title · {DESCRIPTION_LIMITS.desktopPx}px
              description
            </span>
          </div>
          <CardContent className="border-0 p-0">
            <div className="px-8 py-6">
              <SerpResult
                url={url}
                title={title}
                description={description}
                device="desktop"
                density="full"
                showRichSnippet
              />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-2xl shadow-sm">
          <div className={previewChromeClass}>
            <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Mobile</span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              Max {TITLE_LIMITS.mobilePx}px title · {DESCRIPTION_LIMITS.mobilePx}px
              description
            </span>
          </div>
          <CardContent className="border-0 p-0">
            <div className="px-4 py-5">
              <SerpResult
                url={url}
                title={title}
                description={description}
                device="mobile"
                placeholderDescription="Your meta description will appear here with mobile-specific line wrapping applied."
              />
            </div>
          </CardContent>
        </Card>

        {hasData ? (
          <Card className="overflow-hidden rounded-2xl shadow-sm">
            <CardHeader className="space-y-0 border-b border-border px-5 py-4">
              <CardTitle className={sectionTitleClass}>Recommendations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 px-5 py-4">
              {title ? (
                titleEval.issues.length ? (
                  titleEval.issues.map((issue) => (
                    <div
                      key={issue}
                      className="flex items-start gap-2.5 text-xs text-warning"
                    >
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{issue}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex items-start gap-2.5 text-xs text-success">
                    <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Title looks great — within pixel and character limits on all
                      devices.
                    </span>
                  </div>
                )
              ) : null}
              {description ? (
                descEval.issues.length ? (
                  descEval.issues.map((issue) => (
                    <div
                      key={issue}
                      className="flex items-start gap-2.5 text-xs text-warning"
                    >
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{issue}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex items-start gap-2.5 text-xs text-success">
                    <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Description looks great — within pixel and character limits on
                      all devices.
                    </span>
                  </div>
                )
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </section>
    </div>
  );
}
