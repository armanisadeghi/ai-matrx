"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle,
  XCircle,
  Smartphone,
  Monitor,
  AlertTriangle,
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
import {
  extractSeoFromScrapeResponse,
  normalizeScrapeUrl,
} from "./extract-seo-from-scrape";

function parseDisplayUrl(url: string): string {
  if (!url) return "example.com";
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
  } catch {
    return url;
  }
}

function parseBreadcrumb(url: string): string {
  if (!url) return " › category › page";
  try {
    const segs = new URL(
      url.startsWith("http") ? url : `https://${url}`,
    ).pathname
      .split("/")
      .filter(Boolean);
    return segs.length
      ? " › " + segs.slice(-3).join(" › ")
      : " › category › page";
  } catch {
    return " › category › page";
  }
}

function barTone(pct: number): { bar: string; text: string } {
  if (pct >= 100) return { bar: "bg-destructive", text: "text-destructive" };
  if (pct >= 85) return { bar: "bg-warning", text: "text-warning" };
  return { bar: "bg-success", text: "text-success" };
}

function ProgressBar({
  pct,
  label,
  detail,
}: {
  pct: number;
  label: string;
  detail: string;
}) {
  const { bar, text } = barTone(pct);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className={cn("font-medium", text)}>{detail}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-300", bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function DeviceCheck({
  icon: Icon,
  label,
  ok,
}: {
  icon: React.FC<{ className?: string }>;
  label: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-xs text-foreground">{label}</span>
      <span className="ml-auto">
        {ok ? (
          <CheckCircle className="h-4 w-4 text-success" />
        ) : (
          <XCircle className="h-4 w-4 text-destructive" />
        )}
      </span>
    </div>
  );
}

const fieldLabelClass =
  "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const sectionTitleClass =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const previewChromeClass =
  "flex items-center gap-2 border-b border-border bg-muted/40 px-5 py-3";

export function MetaInputWidget() {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const { scrapeUrl, isLoading: isFetching } = usePublicScraperContent();
  const [metrics, setMetrics] = useState({
    titlePx: 0,
    descPx: 0,
    titleChars: 0,
    descChars: 0,
  });

  const calculate = useCallback(() => {
    const titleChars = title.length;
    const descChars = description.length;
    if (!title && !description) {
      setMetrics({ titlePx: 0, descPx: 0, titleChars: 0, descChars: 0 });
      return;
    }
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.font = "400 20px 'Google Sans', Roboto, Arial, sans-serif";
    const titlePx = title ? ctx.measureText(title).width : 0;
    ctx.font = "400 13px 'Google Sans', Roboto, Arial, sans-serif";
    const descPx = description ? ctx.measureText(description).width : 0;
    setMetrics({ titlePx, descPx, titleChars, descChars });
  }, [title, description]);

  useEffect(() => {
    const t = setTimeout(calculate, 150);
    return () => clearTimeout(t);
  }, [calculate]);

  const titleDesktopOk = metrics.titlePx <= 580;
  const titleMobileOk = metrics.titlePx <= 920;
  const titleCharOk = metrics.titleChars <= 60;
  const descDesktopOk = metrics.descPx <= 920;
  const descMobileOk = metrics.descPx <= 680;
  const descCharOk = metrics.descChars <= 160;
  const hasData =
    metrics.titlePx > 0 ||
    metrics.descPx > 0 ||
    metrics.titleChars > 0 ||
    metrics.descChars > 0;

  const titlePct = Math.min((metrics.titlePx / 580) * 100, 100);
  const descPct = Math.min((metrics.descPx / 920) * 100, 100);
  const titleCharPct = Math.min((metrics.titleChars / 60) * 100, 100);
  const descCharPct = Math.min((metrics.descChars / 160) * 100, 100);

  const displayUrl = parseDisplayUrl(url);
  const breadcrumb = parseBreadcrumb(url);
  const faviconChar = displayUrl.charAt(0).toUpperCase();

  const inputClass =
    "text-base md:text-sm h-9 border-border bg-background text-foreground";

  const handleFetchMetadata = useCallback(async () => {
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
        toast.warning(
          "Page scraped, but no meta title or description was found",
        );
      } else {
        toast.success("Metadata loaded from page");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch metadata";
      toast.error(message);
    }
  }, [url, scrapeUrl]);

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
                    {metrics.titleChars}/60
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
                    {metrics.descChars}/160
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
                <div className="space-y-3">
                  <div className="flex items-center">
                    <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                      Meta Title
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {metrics.titlePx.toFixed(0)}px
                    </span>
                  </div>
                  <ProgressBar
                    pct={titlePct}
                    label="Pixel width (desktop 580px)"
                    detail={`${titlePct.toFixed(0)}%`}
                  />
                  <ProgressBar
                    pct={titleCharPct}
                    label="Characters (60 limit)"
                    detail={`${metrics.titleChars}/60`}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <DeviceCheck
                      icon={Monitor}
                      label="Desktop"
                      ok={titleDesktopOk}
                    />
                    <DeviceCheck
                      icon={Smartphone}
                      label="Mobile"
                      ok={titleMobileOk}
                    />
                  </div>
                </div>
              ) : null}
              {title && description ? (
                <Separator className="bg-border" />
              ) : null}
              {description ? (
                <div className="space-y-3">
                  <div className="flex items-center">
                    <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                      Meta Description
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {metrics.descPx.toFixed(0)}px
                    </span>
                  </div>
                  <ProgressBar
                    pct={descPct}
                    label="Pixel width (desktop 920px)"
                    detail={`${descPct.toFixed(0)}%`}
                  />
                  <ProgressBar
                    pct={descCharPct}
                    label="Characters (160 limit)"
                    detail={`${metrics.descChars}/160`}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <DeviceCheck
                      icon={Monitor}
                      label="Desktop"
                      ok={descDesktopOk}
                    />
                    <DeviceCheck
                      icon={Smartphone}
                      label="Mobile"
                      ok={descMobileOk}
                    />
                  </div>
                </div>
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
              <div className="max-w-[640px] space-y-3">
                <div className="flex items-center gap-3 rounded-full border border-border px-5 py-2.5 shadow-sm">
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-sm text-foreground">
                    {title || "Paste your meta title to preview…"}
                  </span>
                </div>
                <div className="flex gap-5 border-b border-border pb-0 text-xs">
                  {["All", "Images", "Videos", "News", "Maps"].map((tab, i) => (
                    <span
                      key={tab}
                      className={cn(
                        "border-b-2 pb-2.5",
                        i === 0
                          ? "border-primary font-medium text-primary"
                          : "border-transparent text-muted-foreground",
                      )}
                    >
                      {tab}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  About 600,000,000 results (0.54 seconds)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-2xl shadow-sm">
          <div className={previewChromeClass}>
            <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Desktop</span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              Max 580px title · 920px description
            </span>
          </div>
          <CardContent className="border-0 p-0">
            <div className="bg-card px-8 py-6 font-sans">
              <div className="mb-2 flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                  {faviconChar}
                </div>
                <div>
                  <div className="text-sm font-medium leading-tight text-foreground">
                    {displayUrl}
                  </div>
                  <div className="text-xs leading-tight text-muted-foreground">
                    {displayUrl}
                    {breadcrumb}
                  </div>
                </div>
              </div>
              <div className="mb-1.5 max-w-[600px] cursor-pointer text-xl leading-[1.3] text-primary hover:underline truncate">
                {title || (
                  <span className="font-normal text-base text-muted-foreground">
                    Your meta title will appear here…
                  </span>
                )}
              </div>
              <div className="max-w-[600px] text-sm leading-[1.58] text-muted-foreground">
                {description || (
                  <span>
                    Your meta description will appear here. This is usually
                    taken from the Meta Description tag if relevant to the
                    query.
                  </span>
                )}
              </div>
              <div className="mt-2.5 flex gap-5 text-xs text-muted-foreground">
                <span className="text-warning">★★★★☆</span>
                <span>$99 – $199</span>
                <span>In stock</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-2xl shadow-sm">
          <div className={previewChromeClass}>
            <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Mobile</span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              Max 920px title · 680px description
            </span>
          </div>
          <CardContent className="border-0 p-0">
            <div className="max-w-[380px] bg-card px-4 py-5 font-sans">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                  {faviconChar}
                </div>
                <div>
                  <div className="text-xs font-medium text-foreground">
                    {displayUrl}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {displayUrl}
                    {breadcrumb}
                  </div>
                </div>
              </div>
              <div className="mb-1 cursor-pointer text-base leading-[1.3] text-primary hover:underline truncate">
                {title || (
                  <span className="font-normal text-sm text-muted-foreground">
                    Your meta title will appear here…
                  </span>
                )}
              </div>
              <div className="text-xs leading-[1.5] text-muted-foreground">
                {description || (
                  <span>
                    Your meta description will appear here with mobile-specific
                    line wrapping applied.
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {hasData ? (
          <Card className="overflow-hidden rounded-2xl shadow-sm">
            <CardHeader className="space-y-0 border-b border-border px-5 py-4">
              <CardTitle className={sectionTitleClass}>
                Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 px-5 py-4">
              {title ? (
                <>
                  {!titleDesktopOk ? (
                    <div className="flex items-start gap-2.5 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        Title exceeds <strong>580px</strong> desktop limit (
                        {metrics.titlePx.toFixed(0)}px) — may be truncated.
                      </span>
                    </div>
                  ) : null}
                  {!titleMobileOk ? (
                    <div className="flex items-start gap-2.5 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        Title exceeds <strong>920px</strong> mobile limit (
                        {metrics.titlePx.toFixed(0)}px) — may be truncated on
                        mobile.
                      </span>
                    </div>
                  ) : null}
                  {!titleCharOk ? (
                    <div className="flex items-start gap-2.5 text-xs text-warning">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        Title has{" "}
                        <strong>{metrics.titleChars} characters</strong> — SEO
                        best practice is ≤60 chars.
                      </span>
                    </div>
                  ) : null}
                  {titleDesktopOk && titleMobileOk && titleCharOk ? (
                    <div className="flex items-start gap-2.5 text-xs text-success">
                      <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        Title looks great — within pixel and character limits on
                        all devices.
                      </span>
                    </div>
                  ) : null}
                </>
              ) : null}
              {description ? (
                <>
                  {!descDesktopOk ? (
                    <div className="flex items-start gap-2.5 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        Description exceeds <strong>920px</strong> desktop limit
                        — may be truncated.
                      </span>
                    </div>
                  ) : null}
                  {!descMobileOk ? (
                    <div className="flex items-start gap-2.5 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        Description exceeds <strong>680px</strong> mobile limit
                        — may be truncated on mobile.
                      </span>
                    </div>
                  ) : null}
                  {!descCharOk ? (
                    <div className="flex items-start gap-2.5 text-xs text-warning">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        Description has{" "}
                        <strong>{metrics.descChars} characters</strong> — SEO
                        best practice is ≤160 chars.
                      </span>
                    </div>
                  ) : null}
                  {descDesktopOk && descMobileOk && descCharOk ? (
                    <div className="flex items-start gap-2.5 text-xs text-success">
                      <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        Description looks great — within pixel and character
                        limits on all devices.
                      </span>
                    </div>
                  ) : null}
                </>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </section>
    </div>
  );
}
