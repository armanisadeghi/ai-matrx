"use client";

/**
 * Shared visual primitives for the scraper kind family.
 *
 * Reuses the platform's canonical URL/favicon/breadcrumb logic from
 * `parseSearch.ts` (the tool-call-visualization search renderer) rather than
 * re-deriving hostnames — the Inventory Law: the platform already solved this
 * for the search family and there is exactly one copy of it.
 *
 * Page images and favicons are EXTERNAL media (someone else's server), so a
 * plain <img> with an onError fallback is the correct treatment — the
 * media-durability law governs OUR files only.
 */

import React, { useState } from "react";
import { Globe, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import {
  getFaviconUrl,
  getBreadcrumbParts,
} from "@/features/tool-call-visualization/renderers/search/parseSearch";

/** Favicon for a page: favicon service derived from the URL → Globe. */
export const SiteFavicon: React.FC<{ url?: string | null; className?: string }> = ({
  url,
  className,
}) => {
  const serviceUrl = url ? getFaviconUrl(url, 64) : "";
  const [failedFor, setFailedFor] = useState<string | null>(null);
  if (!serviceUrl || failedFor === serviceUrl) {
    return (
      <span
        className={cn(
          "flex items-center justify-center rounded bg-muted text-muted-foreground",
          className,
        )}
      >
        <Globe className="h-1/2 w-1/2" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={serviceUrl}
      alt=""
      loading="lazy"
      className={cn("rounded object-contain", className)}
      onError={() => setFailedFor(serviceUrl)}
    />
  );
};

/** External image with a graceful placeholder — never a broken-image icon. */
export const ExternalImage: React.FC<{
  src: string;
  alt?: string | null;
  className?: string;
}> = ({ src, alt, className }) => {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground",
          className,
        )}
      >
        <ImageOff className="h-5 w-5" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={typeof alt === "string" ? alt : ""}
      loading="lazy"
      className={cn("object-cover", className)}
      onError={() => setFailed(true)}
    />
  );
};

/** Google-style `origin › segment › segment` line. */
export const BreadcrumbLine: React.FC<{ url?: string | null; className?: string }> = ({
  url,
  className,
}) => {
  if (!url) return null;
  const { origin, segments } = getBreadcrumbParts(url);
  return (
    <div className={cn("truncate text-xs text-muted-foreground", className)}>
      <span className="text-success">{origin}</span>
      {segments.map((segment, i) => (
        <span key={i}>
          <span className="mx-1 opacity-60">›</span>
          {segment}
        </span>
      ))}
    </div>
  );
};

const TONE_CLASSES = {
  ok: "border-success/40 bg-success/10 text-success",
  redirect: "border-warning/40 bg-warning/10 text-warning",
  warn: "border-warning/40 bg-warning/10 text-warning",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
  unknown: "border-border bg-muted/40 text-muted-foreground",
  neutral: "border-border bg-muted/40 text-muted-foreground",
} as const;

export type PillTone = keyof typeof TONE_CLASSES;

export const Pill: React.FC<{
  children: React.ReactNode;
  tone?: PillTone;
  title?: string;
  className?: string;
}> = ({ children, tone = "neutral", title, className }) => (
  <span
    title={title}
    className={cn(
      "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
      TONE_CLASSES[tone],
      className,
    )}
  >
    {children}
  </span>
);

/**
 * One figure in the page's stat strip. `value` of null renders an em dash —
 * "we did not measure this" is a real state and must not read as zero.
 */
export const Stat: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number | null;
  hint?: string;
}> = ({ icon: Icon, label, value, hint }) => (
  <div
    title={hint}
    className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
  >
    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    <div className="min-w-0 leading-tight">
      <div className="truncate text-sm font-semibold text-foreground">
        {value === null ? "—" : value}
      </div>
      <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  </div>
);

/** Section heading inside a kind card. */
export const SectionHeading: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number | null;
  trailing?: React.ReactNode;
}> = ({ icon: Icon, label, count, trailing }) => (
  <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
    <Icon className="h-3.5 w-3.5" />
    <span>{label}</span>
    {typeof count === "number" && count > 0 && (
      <span className="rounded-full bg-muted px-1.5 text-[10px]">{count}</span>
    )}
    {trailing && <span className="ml-auto normal-case">{trailing}</span>}
  </div>
);

/**
 * A collapsible card section — large sections stay closed until asked for.
 *
 * EVERY section carries copy controls. Arman, 2026-08-24: *"when you have
 * something like this, in almost all instances, you're going to want to copy
 * things. And considering the fact that we specialize in AI, that's one of the
 * most important things we need to offer."* Pass `copy` and the canonical
 * `CopyButtons` pair (plain Copy + Copy-for-AI) sits in the section header,
 * clicking without toggling the section.
 */
export const Disclosure: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number | null;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  /** Data behind this section — becomes its Copy / Copy-for-AI pair. */
  copy?: { label: string; human?: () => string; data: unknown; description: string };
  children: React.ReactNode;
}> = ({ icon: Icon, label, count, summary, defaultOpen = false, copy, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 pr-24 text-left transition-colors hover:bg-muted/40"
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{label}</span>
        {typeof count === "number" && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {count}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {summary}
          <span aria-hidden>{open ? "▾" : "▸"}</span>
        </span>
      </button>
      {copy && (
        <div className="absolute right-9 top-1.5">
          <CopyButtons
            size="xs"
            label={copy.label}
            human={copy.human ?? (() => JSON.stringify(copy.data, null, 2))}
            agent={() => ({
              kind: "scraped_page_section",
              location: "AI Matrx — Scraped Page",
              description: copy.description,
              data: copy.data,
            })}
            json={() => copy.data}
          />
        </div>
      )}
      {open && <div className="border-t border-border px-3 py-3">{children}</div>}
    </div>
  );
};
