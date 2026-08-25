"use client";

/**
 * `scraped_page` — THE canonical component for a web page we read.
 *
 * The whole argument for this kind family is that a page is not a bag of
 * fields, it is a THING, and once the shape is declared every surface can show
 * it the way a person actually wants to see it. So this component is built as
 * a reader, not an inspector:
 *
 *   HEADER   the page as a result — favicon, title, breadcrumb, status,
 *            timing, CMS/WAF, freshness.
 *   STATS    reading time, words, links, images, tables, code, headings.
 *   READ     the page's own markdown, with its outline beside it.
 *   the rest opens on demand: structure, media gallery, links, the social
 *            card the page declares, and what our cleaner removed.
 *
 * Every nested instance renders through ITS canonical component via
 * `ScraperKindNested` — a db-registered override for `page_link` reskins every
 * link here with zero code. This component owns only the page chrome.
 *
 * Streaming: a large page arrives in pieces, so a half-filled value is a
 * NORMAL state and every section renders whatever has landed.
 */

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock,
  Code2,
  FileText,
  Image as ImageIcon,
  Layers,
  Link2,
  List,
  ListTree,
  Scissors,
  Share2,
  Table as TableIcon,
  Timer,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils";
import MarkdownCore from "@/components/markdown-core/MarkdownCore";
import PageCleaningReportBlock from "./PageCleaningReportBlock";
import { ScraperKindNested } from "./ScraperKindNested";
import {
  BreadcrumbLine,
  Disclosure,
  Pill,
  SectionHeading,
  SiteFavicon,
  Stat,
} from "./scraper-kind-shared";
import {
  compactNumber,
  isRecord,
  items,
  num,
  readingMinutes,
  readScraperKindValue,
  shortDate,
  statusTone,
  text,
} from "./scraper-kind-data";

interface Props {
  serverData?: unknown;
  className?: string;
}

/** Which body text to read. The page carries several renderings on purpose. */
type ReadMode = "markdown" | "plain" | "research" | "raw";

export default function ScrapedPageBlock({ serverData, className }: Props) {
  const { value, isComplete } = readScraperKindValue<"scraped_page">(serverData);

  const url = text(value.url);
  const responseUrl = text(value.response_url) ?? url;
  const title = text(value.title);
  const status = num(value.status_code);
  const success = value.success === undefined ? null : (value.success as boolean | null);
  const tone = statusTone(status, success);
  const failureReason = text(value.failure_reason);

  const markdown = text(value.markdown);
  const plainText = text(value.plain_text);
  const researchText = text(value.research_text);
  const rawText = text(value.raw_text);
  const charCount = num(value.char_count);

  const outline = items(value.outline);
  const sections = items(value.sections);
  const tables = items(value.tables);
  const codeBlocks = items(value.code_blocks);
  const lists = items(value.lists);
  const images = items(value.images);
  const videos = items(value.videos);
  const audios = items(value.audios);
  const links = items(value.links);
  const blocks = items(value.blocks);
  const redirects = items(value.redirect_chain);

  const available = useMemo(() => {
    const modes: { key: ReadMode; label: string; body: string | null }[] = [
      { key: "markdown", label: "Markdown", body: markdown },
      { key: "plain", label: "Plain text", body: plainText },
      { key: "research", label: "Research", body: researchText },
      { key: "raw", label: "Extracted text", body: rawText },
    ];
    return modes.filter((m) => m.body);
  }, [markdown, plainText, researchText, rawText]);

  const [mode, setMode] = useState<ReadMode | null>(null);
  const active = available.find((m) => m.key === mode) ?? available[0] ?? null;

  const readMinutes = readingMinutes(charCount);
  const securityHeaders = isRecord(value.security_headers) ? value.security_headers : null;

  if (!url && !isComplete) {
    return (
      <div className={cn("animate-pulse rounded-lg border border-border bg-card p-4", className)}>
        <div className="h-4 w-1/3 rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className={cn("my-2 space-y-3", className)}>
      {/* ------------------------------------------------------- header */}
      <div className="flex items-start gap-3">
        <SiteFavicon url={responseUrl} className="mt-0.5 h-9 w-9 shrink-0 p-1.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={responseUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 truncate text-base font-semibold text-foreground hover:underline"
            >
              {title ?? responseUrl ?? (isComplete ? "Untitled page" : "Reading…")}
            </a>
            {status !== null && status > 0 && (
              <Pill tone={tone} title={failureReason ?? undefined}>
                {status}
              </Pill>
            )}
            {failureReason && <Pill tone="error">{failureReason}</Pill>}
          </div>
          <BreadcrumbLine url={responseUrl} />
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {text(value.content_type) && <Pill>{text(value.content_type)}</Pill>}
            {text(value.cms) && text(value.cms) !== "unknown" && (
              <Pill title="detected CMS">{text(value.cms)}</Pill>
            )}
            {text(value.firewall) && text(value.firewall) !== "none" && (
              <Pill tone="warn" title="detected WAF / CDN">
                {text(value.firewall)}
              </Pill>
            )}
            {redirects.length > 1 && (
              <Pill tone="redirect">{redirects.length - 1} redirect(s)</Pill>
            )}
            {securityHeaders && (
              <Pill title={Object.keys(securityHeaders).join(", ")}>
                {Object.keys(securityHeaders).length} security headers
              </Pill>
            )}
            {shortDate(value.published_at) && (
              <Pill title="published">{shortDate(value.published_at)}</Pill>
            )}
            {shortDate(value.modified_at) && (
              <Pill title="last modified">updated {shortDate(value.modified_at)}</Pill>
            )}
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------- stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <Stat
          icon={Clock}
          label="read"
          value={readMinutes ? `${readMinutes} min` : null}
          hint="estimated at 230 words per minute"
        />
        <Stat
          icon={Type}
          label="characters"
          value={charCount === null ? null : compactNumber(charCount)}
        />
        <Stat icon={Link2} label="links" value={compactNumber(links.length)} />
        <Stat icon={ImageIcon} label="images" value={compactNumber(images.length)} />
        <Stat icon={TableIcon} label="tables" value={tables.length} />
        <Stat icon={Code2} label="code" value={codeBlocks.length} />
        <Stat
          icon={Timer}
          label="ttfb"
          value={num(value.ttfb_ms) === null ? null : `${num(value.ttfb_ms)} ms`}
          hint="true time to first byte; blank means NOT MEASURED, not fast"
        />
      </div>

      {/* --------------------------------------------------------- read */}
      {active && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="mr-2 text-sm font-medium text-foreground">The page</span>
            {available.map((m) => (
              <button key={m.key} type="button" onClick={() => setMode(m.key)}>
                <Pill tone={active.key === m.key ? "ok" : "neutral"}>{m.label}</Pill>
              </button>
            ))}
          </div>
          <div className="flex max-h-[34rem] gap-4 overflow-hidden">
            {outline.length > 2 && (
              <nav className="hidden w-56 shrink-0 overflow-auto border-r border-border py-3 pl-3 lg:block">
                <SectionHeading icon={ListTree} label="Outline" count={outline.length} />
                {outline.map((heading, i) => (
                  <ScraperKindNested key={i} value={heading} />
                ))}
              </nav>
            )}
            <div className="min-w-0 flex-1 overflow-auto px-3 py-3">
              {active.key === "markdown" ? (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <MarkdownCore>{active.body ?? ""}</MarkdownCore>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                  {active.body}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------- the rest, on demand */}
      {sections.length > 0 && (
        <Disclosure icon={Layers} label="Sections" count={sections.length}>
          <div className="space-y-4">
            {sections.map((section, i) => (
              <ScraperKindNested key={i} value={section} />
            ))}
          </div>
        </Disclosure>
      )}

      {tables.length > 0 && (
        <Disclosure icon={TableIcon} label="Tables" count={tables.length}>
          <div className="space-y-3">
            {tables.map((table, i) => (
              <ScraperKindNested key={i} value={table} />
            ))}
          </div>
        </Disclosure>
      )}

      {codeBlocks.length > 0 && (
        <Disclosure icon={Code2} label="Code blocks" count={codeBlocks.length}>
          <div className="space-y-2">
            {codeBlocks.map((block, i) => (
              <ScraperKindNested key={i} value={block} />
            ))}
          </div>
        </Disclosure>
      )}

      {lists.length > 0 && (
        <Disclosure icon={List} label="Lists" count={lists.length}>
          <div className="space-y-3">
            {lists.map((entry, i) => (
              <ScraperKindNested key={i} value={entry} />
            ))}
          </div>
        </Disclosure>
      )}

      {(images.length > 0 || videos.length > 0 || audios.length > 0) && (
        <Disclosure
          icon={ImageIcon}
          label="Media"
          count={images.length + videos.length + audios.length}
          summary={
            images.filter((i) => !text((i as Record<string, unknown>).alt)).length > 0
              ? `${images.filter((i) => !text((i as Record<string, unknown>).alt)).length} missing alt`
              : undefined
          }
        >
          <div className="space-y-3">
            {images.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {images.map((image, i) => (
                  <ScraperKindNested key={i} value={image} />
                ))}
              </div>
            )}
            {videos.map((video, i) => (
              <ScraperKindNested key={`v${i}`} value={video} />
            ))}
            {audios.map((audio, i) => (
              <ScraperKindNested key={`a${i}`} value={audio} />
            ))}
          </div>
        </Disclosure>
      )}

      {(links.length > 0 || isRecord(value.link_urls)) && (
        <Disclosure icon={Link2} label="Links" count={links.length}>
          <div className="space-y-4">
            {links.length > 0 && (
              <div className="max-h-96 divide-y divide-border/50 overflow-auto pr-1">
                {links.slice(0, 200).map((link, i) => (
                  <ScraperKindNested key={i} value={link} />
                ))}
                {links.length > 200 && (
                  <p className="py-2 text-xs text-muted-foreground">
                    + {compactNumber(links.length - 200)} more anchors
                  </p>
                )}
              </div>
            )}
            {isRecord(value.link_urls) && (
              <div>
                <SectionHeading icon={Link2} label="Every URL, by type" />
                <ScraperKindNested value={value.link_urls} />
              </div>
            )}
          </div>
        </Disclosure>
      )}

      {isRecord(value.metadata) && (
        <Disclosure icon={Share2} label="What the page says about itself">
          <ScraperKindNested value={value.metadata} />
        </Disclosure>
      )}

      {blocks.length > 0 && (
        <Disclosure
          icon={ListTree}
          label="Content stream"
          count={blocks.length}
          summary="in document order"
        >
          <div className="max-h-[34rem] space-y-2 overflow-auto pr-1">
            {blocks.map((block, i) => (
              <ScraperKindNested key={i} value={block} />
            ))}
          </div>
        </Disclosure>
      )}

      {isRecord(value.cleaning) && (
        <Disclosure
          icon={Scissors}
          label="What the scraper removed"
          summary={
            <span className="flex items-center gap-1 text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
              review on your own sites
            </span>
          }
        >
          <PageCleaningReportBlock
            serverData={value.cleaning}
            survivors={{
              tables: tables.length,
              codeBlocks: codeBlocks.length,
              lists: lists.length,
            }}
          />
        </Disclosure>
      )}

      {(redirects.length > 1 || isRecord(value.fingerprint)) && (
        <Disclosure icon={Timer} label="Transport and fingerprint">
          <div className="space-y-3">
            {redirects.length > 1 && (
              <div>
                <SectionHeading icon={Link2} label="Redirect chain" count={redirects.length} />
                <div className="space-y-1">
                  {redirects.map((hop, i) => (
                    <ScraperKindNested key={i} value={hop} />
                  ))}
                </div>
              </div>
            )}
            {isRecord(value.fingerprint) && <ScraperKindNested value={value.fingerprint} />}
            {securityHeaders && (
              <div className="rounded-md border border-border">
                <table className="w-full text-[11px]">
                  <tbody>
                    {Object.entries(securityHeaders).map(([key, header]) => (
                      <tr key={key} className="border-b border-border/50 last:border-0">
                        <td className="w-56 px-2 py-1 align-top font-mono text-muted-foreground">
                          {key}
                        </td>
                        <td className="break-words px-2 py-1 text-foreground">{String(header)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Disclosure>
      )}
    </div>
  );
}
