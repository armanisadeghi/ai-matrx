"use client";

/**
 * Scraper Kinds — Stage A review demo (data-to-kinds replication run 1).
 *
 * Arman, 2026-08-23: *"on anything at all that you choose to remove or ignore…
 * you still have to capture them, and you have to render them for me in a
 * separate tab so that I can see exactly what we are hiding from the user."*
 *
 * That ruling is the whole reason this page has tabs. A real scrape runs on
 * aidream (`POST /api/scraper-kinds/scrape` → the ONE engine → the translation
 * adapter → the `scraped_page` kind), and the answer comes back in three
 * parts, all three shown:
 *
 *   KEPT    — the kind: every field the platform will carry, by section.
 *   HIDDEN  — every value the kind does NOT carry, with the reason AND the
 *             actual data, so the drop can be judged rather than trusted.
 *   RAW     — the engine result verbatim (projection 2, on request).
 *
 * This is a DATA-review surface, not the rendering surface. The kinds are
 * registered but INACTIVE and have no canonical components yet — that is
 * Stage B's job, in this repo, once the shape is approved. Judging the shape
 * first is the point.
 */

import { useState } from "react";
import { AlertTriangle, EyeOff, Globe, Loader2, ShieldCheck } from "lucide-react";
import { useBackendApi } from "@/hooks/useBackendApi";
import { consumeStream } from "@/lib/api/stream-parser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/lib/toast";

interface DroppedValue {
  path: string;
  reason: string;
  kind_of: string;
  size: number | null;
  preview: unknown;
}

interface TranslationReport {
  provider: string;
  unknown: { section: string; keys: string[] }[];
  dropped: DroppedValue[];
}

interface Outcome {
  result: Record<string, unknown>;
  translation: TranslationReport | null;
  raw: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readTranslation(v: unknown): TranslationReport | null {
  if (!isRecord(v)) return null;
  const unknown = Array.isArray(v.unknown)
    ? v.unknown.flatMap((u) =>
        isRecord(u) && typeof u.section === "string" && Array.isArray(u.keys)
          ? [{ section: u.section, keys: u.keys.map(String) }]
          : [],
      )
    : [];
  const dropped = Array.isArray(v.dropped)
    ? v.dropped.flatMap((d) =>
        isRecord(d) && typeof d.path === "string"
          ? [
              {
                path: d.path,
                reason: String(d.reason ?? ""),
                kind_of: String(d.kind_of ?? ""),
                size: typeof d.size === "number" ? d.size : null,
                preview: d.preview,
              },
            ]
          : [],
      )
    : [];
  return { provider: String(v.provider ?? "matrx_scraper"), unknown, dropped };
}

/** How many entries an array field carries, for the section headers. */
function count(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

function preview(v: unknown, chars = 400): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.length > chars ? `${v.slice(0, chars)}…` : v;
  const json = JSON.stringify(v, null, 1);
  return json.length > chars ? `${json.slice(0, chars)}…` : json;
}

/** A section of the kind — collapsed by default when it is large. */
function Section({
  title,
  subtitle,
  children,
  defaultOpen = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">
          {subtitle} {open ? "▾" : "▸"}
        </span>
      </button>
      {open && <div className="border-t border-border px-3 py-2">{children}</div>}
    </div>
  );
}

function ScalarRow({ label, value }: { label: string; value: unknown }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="flex gap-3 border-b border-border/50 py-1 last:border-0">
      <span className="w-44 shrink-0 font-mono text-[11px] text-muted-foreground">{label}</span>
      <span
        className={`min-w-0 flex-1 break-words text-xs ${empty ? "text-muted-foreground/60" : "text-foreground"}`}
      >
        {empty ? "—" : preview(value, 300)}
      </span>
    </div>
  );
}

function JsonPanel({ value }: { value: unknown }) {
  return (
    <pre className="max-h-[70vh] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-[11px] leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

const SCALARS: [string, string][] = [
  ["url", "url"],
  ["response_url", "response_url"],
  ["status_code", "status_code"],
  ["success", "success"],
  ["failure_reason", "failure_reason"],
  ["title", "title"],
  ["published_at", "published_at"],
  ["modified_at", "modified_at"],
  ["scraped_at", "scraped_at"],
  ["content_type", "content_type"],
  ["content_type_raw", "content_type_raw"],
  ["site_name", "site_name"],
  ["page_key", "page_key"],
  ["char_count", "char_count"],
  ["cms", "cms"],
  ["firewall", "firewall"],
  ["ttfb_ms", "ttfb_ms"],
  ["main_image", "main_image"],
];

export default function ScraperKindsDemoPage() {
  const { post } = useBackendApi();
  const [url, setUrl] = useState("https://en.wikipedia.org/wiki/Python_(programming_language)");
  const [includeRaw, setIncludeRaw] = useState(true);
  const [useProxy, setUseProxy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const run = async () => {
    const trimmed = url.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setOutcome(null);
    try {
      const response = await post("/scraper-kinds/scrape", {
        url: trimmed,
        include_raw: includeRaw,
        use_proxy: useProxy,
      });
      let received: Outcome | null = null;
      await consumeStream(response, {
        onData: (data) => {
          if (isRecord(data) && data.type === "scraped_page_result" && isRecord(data.result)) {
            received = {
              result: data.result,
              translation: readTranslation(data.translation),
              raw: data.raw,
            };
          }
        },
        onError: (e) => {
          throw new Error(e.user_message || e.message || "Scrape failed.");
        },
      });
      if (!received) throw new Error("The stream ended without a scraped_page_result event.");
      setOutcome(received);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scrape failed.");
    } finally {
      setBusy(false);
    }
  };

  const page = outcome?.result;
  const dropped = outcome?.translation?.dropped ?? [];
  const unknown = outcome?.translation?.unknown ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          Scraper Kinds — what we keep, and what we hide
        </h1>
        <p className="text-sm text-muted-foreground">
          A real scrape on aidream, translated into the{" "}
          <code className="text-xs">scraped_page</code> kind. Three tabs: what the kind{" "}
          <strong>keeps</strong>, what it <strong>hides</strong> (with the actual data and the
          reason), and the <strong>raw</strong> engine result. No mocks, no fixtures.
        </p>
      </div>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-site.com/a-page"
            className="min-w-64 flex-1"
          />
          <Button type="submit" disabled={busy || !url.trim()}>
            {busy ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Globe className="mr-1.5 h-4 w-4" />
            )}
            Scrape
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-xs">
          <div className="flex items-center gap-2">
            <Switch id="raw" checked={includeRaw} onCheckedChange={setIncludeRaw} />
            <Label htmlFor="raw" className="text-xs text-muted-foreground">
              Include the raw engine result
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="proxy" checked={useProxy} onCheckedChange={setUseProxy} />
            <Label htmlFor="proxy" className="text-xs text-muted-foreground">
              Route through the proxy pool
            </Label>
          </div>
        </div>
      </form>

      {busy && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          Fetching and parsing — engine → translation adapter → kind…
        </div>
      )}

      {page && (
        <>
          {unknown.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-success" />
              Fully accounted — every key the engine returned is either carried by the kind or
              listed under “Hidden”.
            </div>
          ) : (
            <div className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <AlertTriangle className="h-4 w-4 text-warning" />
                The parser returned keys the adapter neither carries nor declares:
              </div>
              <ul className="mt-1 list-disc pl-6 text-muted-foreground">
                {unknown.map((u, i) => (
                  <li key={i}>
                    <span className="font-medium">{u.section}</span>: {u.keys.join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Tabs defaultValue="kept">
            <TabsList>
              <TabsTrigger value="kept">Kept — the kind</TabsTrigger>
              <TabsTrigger value="hidden">
                Hidden from the kind ({dropped.length})
              </TabsTrigger>
              <TabsTrigger value="json">Kind as JSON</TabsTrigger>
              <TabsTrigger value="raw" disabled={!outcome?.raw}>
                Raw engine result
              </TabsTrigger>
            </TabsList>

            {/* ---------------- KEPT ---------------- */}
            <TabsContent value="kept" className="space-y-2">
              <Section title="Identity, transport and outcome" defaultOpen subtitle="18 fields">
                {SCALARS.map(([label, key]) => (
                  <ScalarRow key={key} label={label} value={page[key]} />
                ))}
                <ScalarRow label="security_headers" value={page.security_headers} />
                <ScalarRow label="redirect_chain" value={page.redirect_chain} />
                <ScalarRow label="failure_details" value={page.failure_details} />
              </Section>

              <Section
                title="Readable text"
                subtitle={`${String(page.text ?? "").length.toLocaleString()} chars`}
              >
                <ScalarRow label="text" value={page.text} />
                <ScalarRow label="markdown" value={page.markdown} />
                <ScalarRow label="research_text" value={page.research_text} />
                <ScalarRow
                  label="research_text_with_images"
                  value={page.research_text_with_images}
                />
                <ScalarRow label="raw_text (non-HTML)" value={page.raw_text} />
              </Section>

              <Section title="Sections" subtitle={`${count(page.sections)} headings`}>
                <JsonPanel value={page.sections} />
              </Section>
              <Section title="Outline" subtitle={`${count(page.outline)} headings`}>
                <JsonPanel value={page.outline} />
              </Section>
              <Section
                title="Blocks — the ordered content stream"
                subtitle={`${count(page.blocks)} blocks`}
              >
                <JsonPanel value={page.blocks} />
              </Section>
              <Section title="Tables" subtitle={`${count(page.tables)} tables`}>
                <JsonPanel value={page.tables} />
              </Section>
              <Section title="Code blocks" subtitle={`${count(page.code_blocks)}`}>
                <JsonPanel value={page.code_blocks} />
              </Section>
              <Section title="Lists" subtitle={`${count(page.lists)}`}>
                <JsonPanel value={page.lists} />
              </Section>
              <Section
                title="Media"
                subtitle={`${count(page.images)} images · ${count(page.videos)} videos · ${count(page.audios)} audio`}
              >
                <JsonPanel
                  value={{ images: page.images, videos: page.videos, audios: page.audios }}
                />
              </Section>
              <Section
                title="Links"
                subtitle={`${count(page.links)} anchors + typed URL buckets`}
              >
                <JsonPanel value={{ links: page.links, link_urls: page.link_urls }} />
              </Section>
              <Section title="Page metadata (head)" subtitle="canonical · robots · OG · JSON-LD">
                <JsonPanel value={page.metadata} />
              </Section>
              <Section
                title="Cleaning report — what the scraper removed"
                subtitle={
                  isRecord(page.cleaning)
                    ? `${count(page.cleaning.removed)} removals`
                    : "none recorded"
                }
              >
                <p className="mb-2 text-xs text-muted-foreground">
                  Power-user / SEO surface. On an owned site this is where a call to action ends
                  up when the noise remover decides it is chrome.
                </p>
                <JsonPanel value={page.cleaning} />
              </Section>
              <Section title="Fingerprint" subtitle="near-duplicate signatures">
                <JsonPanel value={page.fingerprint} />
              </Section>
            </TabsContent>

            {/* ---------------- HIDDEN ---------------- */}
            <TabsContent value="hidden" className="space-y-2">
              <div className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                <EyeOff className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Everything the engine produced that the kind does <strong>not</strong> carry —
                  the reason, the real size, and the actual data. Nothing here is hidden from
                  you; the question is whether it should be hidden from a user.
                </span>
              </div>
              {dropped.length === 0 && (
                <p className="px-1 py-4 text-sm text-muted-foreground">
                  Nothing was dropped for this page.
                </p>
              )}
              {dropped.map((d) => (
                <div key={d.path} className="rounded-md border border-border bg-card">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-3 py-2">
                    <code className="text-sm font-medium text-foreground">{d.path}</code>
                    <span className="text-[11px] text-muted-foreground">
                      {d.kind_of}
                      {d.size !== null && ` · ${d.size.toLocaleString()} ${
                        d.kind_of === "str" ? "chars" : "entries"
                      }`}
                    </span>
                  </div>
                  <p className="px-3 py-2 text-xs text-muted-foreground">{d.reason}</p>
                  <pre className="max-h-64 overflow-auto border-t border-border bg-muted/30 px-3 py-2 text-[11px] leading-relaxed">
                    {preview(d.preview, 4000)}
                  </pre>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="json">
              <JsonPanel value={page} />
            </TabsContent>

            <TabsContent value="raw">
              <JsonPanel value={outcome?.raw} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
