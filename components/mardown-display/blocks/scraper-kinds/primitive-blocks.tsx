"use client";

/**
 * THE canonical components for the `web_page` primitive kinds.
 *
 * One component per registered kind, each usable STANDALONE (a bare
 * `page_link` arriving from anywhere renders here) and composed by
 * `ScrapedPageBlock` through `ScraperKindNested`. No parent ever
 * re-implements a child's rendering — that is the whole point of the family.
 */

import React from "react";
import {
  Code2,
  CornerDownRight,
  Fingerprint,
  Hash,
  Link2,
  Music,
  Play,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import MarkdownCore from "@/components/markdown-core/MarkdownCore";
import { ExternalImage, Pill, SiteFavicon } from "./scraper-kind-shared";
import {
  compactNumber,
  isRecord,
  num,
  readScraperKindValue,
  records,
  strings,
  text,
} from "./scraper-kind-data";

interface BlockProps {
  serverData?: unknown;
  className?: string;
}

/* ------------------------------------------------------------------ links */

const LINK_TYPE_TONE = {
  internal: "border-primary/40 bg-primary/10 text-primary",
  external: "border-border bg-muted/40 text-muted-foreground",
  subdomain: "border-warning/40 bg-warning/10 text-warning",
} as const;

export function PageLinkBlock({ serverData, className }: BlockProps) {
  const { value } = readScraperKindValue<"page_link">(serverData);
  const url = text(value.target_url);
  if (!url) return null;
  const anchor = text(value.anchor_text);
  const linkType = text(value.link_type);
  const region = text(value.region);
  const fromAlt = text(value.text_source) === "image_alt";

  return (
    <div className={cn("flex items-start gap-2 py-1", className)}>
      <SiteFavicon url={url} className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm text-primary hover:underline"
        >
          {anchor ?? url}
        </a>
        <div className="flex flex-wrap items-center gap-1.5">
          {anchor && <span className="truncate text-[11px] text-muted-foreground">{url}</span>}
          {fromAlt && (
            <span className="text-[10px] italic text-muted-foreground">label from image alt</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {value.nofollow === true && <Pill tone="warn">nofollow</Pill>}
        {region && <Pill>{region}</Pill>}
        {linkType && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
              linkType === "internal"
                ? LINK_TYPE_TONE.internal
                : linkType === "external"
                  ? LINK_TYPE_TONE.external
                  : linkType === "subdomain"
                    ? LINK_TYPE_TONE.subdomain
                    : "border-border bg-muted/40 text-muted-foreground",
            )}
          >
            {linkType}
          </span>
        )}
      </div>
    </div>
  );
}

const BUCKETS = [
  ["internal", "Internal"],
  ["external", "External"],
  ["images", "Images"],
  ["documents", "Documents"],
  ["videos", "Video"],
  ["audio", "Audio"],
  ["archives", "Archives"],
  ["others", "Other"],
] as const;

export function LinkBucketsBlock({ serverData, className }: BlockProps) {
  const { value } = readScraperKindValue<"link_buckets">(serverData);
  const present = BUCKETS.map(([key, label]) => ({
    key,
    label,
    urls: strings(value[key]),
  })).filter((b) => b.urls.length > 0);
  if (present.length === 0) return null;
  const total = present.reduce((sum, b) => sum + b.urls.length, 0);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap gap-1.5">
        {present.map((b) => (
          <Pill key={b.key} title={`${b.urls.length} ${b.label.toLowerCase()} URLs`}>
            {b.label} · {compactNumber(b.urls.length)}
          </Pill>
        ))}
        <Pill tone="ok">{compactNumber(total)} total</Pill>
      </div>
      {present.map((b) => (
        <div key={b.key}>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {b.label}
          </div>
          <ul className="space-y-0.5">
            {b.urls.slice(0, 25).map((url) => (
              <li key={url} className="truncate">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
          {b.urls.length > 25 && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              + {compactNumber(b.urls.length - 25)} more
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ media */

export function PageImageBlock({ serverData, className }: BlockProps) {
  const { value } = readScraperKindValue<"page_image">(serverData);
  const src = text(value.src);
  if (!src) return null;
  const alt = text(value.alt);
  const caption = text(value.caption) ?? text(value.title);
  const width = text(value.width);
  const height = text(value.height);

  return (
    <figure className={cn("overflow-hidden rounded-md border border-border bg-card", className)}>
      <a href={src} target="_blank" rel="noopener noreferrer">
        <ExternalImage src={src} alt={alt} className="h-28 w-full bg-muted" />
      </a>
      <figcaption className="space-y-0.5 px-2 py-1.5">
        <div className={cn("truncate text-[11px]", alt ? "text-foreground" : "italic text-destructive")}>
          {alt ?? "no alt text"}
        </div>
        {caption && <div className="truncate text-[10px] text-muted-foreground">{caption}</div>}
        {width && height && (
          <div className="text-[10px] text-muted-foreground">
            {width} × {height}
          </div>
        )}
      </figcaption>
    </figure>
  );
}

export function PageVideoBlock({ serverData, className }: BlockProps) {
  const { value } = readScraperKindValue<"page_video">(serverData);
  const src = text(value.src);
  if (!src) return null;
  const poster = text(value.poster);
  const provider = text(value.provider);
  return (
    <div className={cn("flex items-center gap-2 rounded-md border border-border bg-card p-2", className)}>
      {poster ? (
        <ExternalImage src={poster} alt="" className="h-12 w-20 shrink-0 rounded bg-muted" />
      ) : (
        <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
          <Play className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-xs text-primary hover:underline"
        >
          {src}
        </a>
        {provider && <Pill className="mt-1">{provider}</Pill>}
      </div>
    </div>
  );
}

export function PageAudioBlock({ serverData, className }: BlockProps) {
  const { value } = readScraperKindValue<"page_audio">(serverData);
  const src = text(value.src);
  if (!src) return null;
  return (
    <div className={cn("flex items-center gap-2 rounded-md border border-border bg-card p-2", className)}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
        <Music className="h-4 w-4" />
      </span>
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 flex-1 truncate text-xs text-primary hover:underline"
      >
        {src}
      </a>
    </div>
  );
}

/* -------------------------------------------------------------- structure */

export function PageHeadingBlock({ serverData, className }: BlockProps) {
  const { value } = readScraperKindValue<"page_heading">(serverData);
  const label = text(value.text);
  if (!label) return null;
  const level = num(value.level) ?? 0;
  return (
    <div
      className={cn("flex items-center gap-1.5 py-0.5 text-sm", className)}
      style={{ paddingLeft: `${Math.max(0, level - 1) * 14}px` }}
    >
      {level > 1 && <CornerDownRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />}
      <span
        className={cn(
          "truncate",
          level <= 1 ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <span className="ml-1 shrink-0 text-[10px] text-muted-foreground/60">H{level}</span>
    </div>
  );
}

export function PageSectionBlock({ serverData, className }: BlockProps) {
  const { value } = readScraperKindValue<"page_section">(serverData);
  const heading = text(value.heading);
  const markdown = text(value.markdown);
  if (!heading && !markdown) return null;
  return (
    <section className={cn("space-y-1", className)}>
      {heading && <h3 className="text-sm font-semibold text-foreground">{heading}</h3>}
      {markdown && (
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <MarkdownCore>{markdown}</MarkdownCore>
        </div>
      )}
    </section>
  );
}

export function PageListBlock({ serverData, className }: BlockProps) {
  const { value } = readScraperKindValue<"page_list">(serverData);
  const entries = strings(value.items);
  if (entries.length === 0) return null;
  const ordered = value.ordered === true;
  const ListTag = ordered ? "ol" : "ul";
  return (
    <div className={cn("space-y-1", className)}>
      {text(value.before) && (
        <p className="text-[11px] italic text-muted-foreground">{text(value.before)}</p>
      )}
      <ListTag
        className={cn(
          "space-y-0.5 pl-5 text-sm text-foreground",
          ordered ? "list-decimal" : "list-disc",
        )}
      >
        {entries.map((entry, i) => (
          <li key={i}>{entry}</li>
        ))}
      </ListTag>
    </div>
  );
}

export function CodeBlockKindBlock({ serverData, className }: BlockProps) {
  const { value } = readScraperKindValue<"code_block">(serverData);
  const code = text(value.code);
  if (!code) return null;
  const language = text(value.language);
  return (
    <div className={cn("overflow-hidden rounded-md border border-border", className)}>
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-2 py-1">
        <Code2 className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {language ?? "code"}
        </span>
      </div>
      <pre className="max-h-72 overflow-auto bg-muted/20 p-2.5 text-[11px] leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

/**
 * `page_block` — one node of the ordered content stream. This is the ONLY
 * renderer that preserves the page's real reading order across types, so it
 * dispatches on `type` rather than showing a field dump.
 */
export function PageBlockBlock({ serverData, className }: BlockProps) {
  const { value } = readScraperKindValue<"page_block">(serverData);
  const type = text(value.type);
  const body = text(value.text);
  const entries = strings(value.items);
  const src = text(value.src);

  if (type === "header") {
    const level = num(value.level) ?? 2;
    return (
      <div
        className={cn(
          "pt-2 font-semibold text-foreground",
          level <= 1 ? "text-base" : level === 2 ? "text-sm" : "text-xs",
          className,
        )}
      >
        {body}
      </div>
    );
  }
  if (type === "list" && entries.length > 0) {
    return (
      <ul className={cn("list-disc space-y-0.5 pl-5 text-sm text-foreground", className)}>
        {entries.map((entry, i) => (
          <li key={i}>{entry}</li>
        ))}
      </ul>
    );
  }
  if (type === "code" && body) {
    return (
      <pre
        className={cn(
          "overflow-auto rounded border border-border bg-muted/20 p-2 text-[11px]",
          className,
        )}
      >
        {body}
      </pre>
    );
  }
  if (type === "image" && src) {
    return (
      <ExternalImage
        src={src}
        alt={text(value.alt)}
        className={cn("h-32 rounded border border-border bg-muted", className)}
      />
    );
  }
  if (type === "table") {
    const rows = Array.isArray(value.rows) ? value.rows : [];
    return (
      <div className={cn("text-[11px] text-muted-foreground", className)}>
        table · {rows.length} rows
      </div>
    );
  }
  if (!body) return null;
  return <p className={cn("text-sm leading-relaxed text-foreground", className)}>{body}</p>;
}

/* ------------------------------------------------------- transport / meta */

export function RedirectHopBlock({ serverData, className }: BlockProps) {
  const { value } = readScraperKindValue<"redirect_hop">(serverData);
  const url = text(value.url);
  if (!url) return null;
  const status = num(value.status);
  return (
    <div className={cn("flex items-center gap-2 text-xs", className)}>
      <Pill tone={status && status >= 300 && status < 400 ? "redirect" : "ok"}>{status ?? "—"}</Pill>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{url}</span>
    </div>
  );
}

export function ContentFingerprintBlock({ serverData, className }: BlockProps) {
  const { value } = readScraperKindValue<"content_fingerprint">(serverData);
  const simhash = text(value.simhash);
  const outline = text(value.outline_simhash);
  const minhash = Array.isArray(value.minhash) ? value.minhash : [];
  if (!simhash && !outline && minhash.length === 0) return null;
  return (
    <div className={cn("space-y-1.5 text-xs", className)}>
      {simhash && (
        <div className="flex items-center gap-2">
          <Fingerprint className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">simhash</span>
          <code className="truncate font-mono text-[11px] text-foreground">{simhash}</code>
        </div>
      )}
      {outline && (
        <div className="flex items-center gap-2">
          <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">outline</span>
          <code className="truncate font-mono text-[11px] text-foreground">{outline}</code>
        </div>
      )}
      {minhash.length > 0 && (
        <div className="text-[11px] text-muted-foreground">
          minhash signature · {minhash.length} values
        </div>
      )}
    </div>
  );
}

/**
 * `page_metadata` — rendered as the SOCIAL SHARE PREVIEW the page declares,
 * because that is what this data is for: a reader wants to see the card their
 * link will produce, not a list of meta tags.
 */
export function PageMetadataBlock({ serverData, className }: BlockProps) {
  const { value } = readScraperKindValue<"page_metadata">(serverData);
  const og = isRecord(value.open_graph) ? value.open_graph : {};
  const ogTitle = text(og["og:title"]);
  const ogDesc = text(og["og:description"]);
  const ogImage = text(og["og:image"]);
  const ogSite = text(og["og:site_name"]);
  const canonical = text(value.canonical_url);
  const robots = text(value.robots_directives);
  const jsonLd = records(value.json_ld);
  const metaTags = isRecord(value.meta_tags) ? value.meta_tags : {};
  const metaCount = Object.keys(metaTags).length;

  const schemaTypes = jsonLd
    .map((entry) => text(entry["@type"]))
    .filter((t): t is string => Boolean(t));

  const hasCard = Boolean(ogTitle || ogDesc || ogImage);

  return (
    <div className={cn("space-y-3", className)}>
      {hasCard && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {ogImage && (
            <ExternalImage src={ogImage} alt="" className="h-40 w-full bg-muted" />
          )}
          <div className="space-y-1 p-3">
            {ogSite && (
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {ogSite}
              </div>
            )}
            {ogTitle && (
              <div className="text-sm font-semibold text-foreground">{ogTitle}</div>
            )}
            {ogDesc && <p className="text-xs text-muted-foreground">{ogDesc}</p>}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {schemaTypes.map((type, i) => (
          <Pill key={i} tone="ok">
            <Tag className="h-3 w-3" /> {type}
          </Pill>
        ))}
        {robots && <Pill title="robots directives">{robots}</Pill>}
        {metaCount > 0 && <Pill>{metaCount} meta tags</Pill>}
      </div>

      {canonical && (
        <div className="flex items-center gap-1.5 text-xs">
          <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 text-muted-foreground">canonical</span>
          <a
            href={canonical}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 truncate text-primary hover:underline"
          >
            {canonical}
          </a>
        </div>
      )}

      {metaCount > 0 && (
        <div className="rounded-md border border-border">
          <table className="w-full text-[11px]">
            <tbody>
              {Object.entries(metaTags)
                .filter(([, v]) => v !== "" && v !== null && v !== undefined)
                .slice(0, 30)
                .map(([key, v]) => (
                  <tr key={key} className="border-b border-border/50 last:border-0">
                    <td className="w-40 px-2 py-1 align-top font-mono text-muted-foreground">
                      {key}
                    </td>
                    <td className="break-words px-2 py-1 text-foreground">
                      {Array.isArray(v) ? v.join(", ") : String(v)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- removal */

export function PageRemovalBlock({ serverData, className }: BlockProps) {
  const { value } = readScraperKindValue<"page_removal">(serverData);
  const body = text(value.text);
  const trigger = text(value.trigger_value);
  const attribute = text(value.attribute);
  const remover = text(value.remover);
  const length = num(value.html_length);
  if (!body && !trigger) return null;

  return (
    <div className={cn("rounded-md border border-border bg-card", className)}>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-2 py-1">
        <Pill tone={remover === "noise_remover" ? "warn" : "neutral"}>
          {remover === "noise_remover" ? "noise" : "filter"}
        </Pill>
        {attribute && <span className="font-mono text-[10px] text-muted-foreground">{attribute}</span>}
        {trigger && <code className="truncate text-[11px] text-foreground">{trigger}</code>}
        {length !== null && (
          <span className="ml-auto text-[10px] text-muted-foreground">
            {compactNumber(length)} chars
          </span>
        )}
      </div>
      {body && (
        <p className="max-h-24 overflow-auto whitespace-pre-wrap px-2 py-1.5 text-[11px] text-muted-foreground">
          {body}
        </p>
      )}
    </div>
  );
}

/** `parsed_table` — reused kind; a page table renders as a real table. */
export function ParsedTableBlock({ serverData, className }: BlockProps) {
  const { value } = readScraperKindValue<"parsed_table">(serverData);
  const rows = records(value.rows);
  const columns = strings(value.columns);
  if (rows.length === 0) return null;
  const cols =
    columns.length > 0
      ? columns
      : Array.from(
          rows.reduce<Set<string>>((set, row) => {
            Object.keys(row).forEach((k) => set.add(k));
            return set;
          }, new Set()),
        );

  return (
    <div className={cn("overflow-auto rounded-md border border-border", className)}>
      <table className="w-full text-[11px]">
        <thead className="bg-muted/40">
          <tr>
            {cols.map((col) => (
              <th key={col} className="px-2 py-1 text-left font-medium text-muted-foreground">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((row, i) => (
            <tr key={i} className="border-t border-border/50">
              {cols.map((col) => {
                const cell = row[col];
                return (
                  <td key={col} className="px-2 py-1 align-top text-foreground">
                    {cell === null || cell === undefined ? "" : String(cell)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 50 && (
        <div className="border-t border-border px-2 py-1 text-[10px] text-muted-foreground">
          + {rows.length - 50} more rows
        </div>
      )}
    </div>
  );
}
