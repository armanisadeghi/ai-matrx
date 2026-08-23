"use client";

/**
 * CmsPageBuildBlock — THE renderer for the `cms_page_build` kind. There is no
 * other.
 *
 * 🚨 THE CANONICAL COMPONENT LAW (see `features/content-ir/FEATURE.md`).
 * Need one piece elsewhere? Import the PART — `CmsBuildStatus`,
 * `CmsBuildPreview`, `CmsBuildSearchListing`.
 *
 * 🚨 THE MARKUP IS HOSTILE INPUT. It is authored by a model and rendered ONLY
 * through the shared `SandboxedHtml` primitive (empty `sandbox` — no scripts,
 * no same-origin). `dangerouslySetInnerHTML` here would be stored XSS in the
 * aimatrx.com origin. Do not widen the sandbox, and do not add a second
 * preview frame.
 *
 * WHAT THE READER NEEDS FIRST: is this on my website right now? `write_target`
 * answers it, so it leads — `live` means visitors see it, `draft` means the
 * published page was deliberately left alone. Burying that turns "my page" and
 * "a page I have not published" into the same-looking thing.
 *
 * THE DOOR: `route` is the page's durable identity, so a host that knows the
 * site passes `siteUrl` and the route becomes a real link. `page_id` points
 * into the CMS project's own database (a different Supabase project), so this
 * component cannot resolve it into a link on its own and never renders it as a
 * bare unopenable id.
 *
 * Consumes the bridge serverData from
 * `features/content-ir/kinds/cms-page-build.ts`.
 */

import { useState } from "react";
import {
  Code2,
  ExternalLink,
  Eye,
  Globe,
  Loader2,
  PencilRuler,
  Search,
} from "lucide-react";

import SandboxedHtml from "@/components/mardown-display/blocks/common/SandboxedHtml";
import type {
  CmsPageBuildData,
  CmsPageWriteTarget,
} from "@/features/content-ir/kinds/cms-page-build";
import { cmsPageBuildPreviewDocument } from "@/features/content-ir/kinds/cms-page-build";
import { cn } from "@/lib/utils";

export interface CmsPageBuildBlockProps {
  serverData?: unknown;
  /**
   * Origin of the site this page belongs to (e.g. `https://example.com`).
   * When a host knows it, the route becomes a real door to the live page.
   */
  siteUrl?: string;
  className?: string;
}

/** Defensive re-read — a stale/foreign serverData renders nothing. */
export function readCmsPageBuildData(
  serverData: unknown,
): CmsPageBuildData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  const candidate = serverData as Partial<CmsPageBuildData>;
  if (typeof candidate.html !== "string" && candidate.route === undefined) {
    return null;
  }
  const target = candidate.write_target;
  return {
    route: typeof candidate.route === "string" ? candidate.route : null,
    page_id: typeof candidate.page_id === "string" ? candidate.page_id : null,
    write_target: target === "live" || target === "draft" ? target : null,
    html: typeof candidate.html === "string" ? candidate.html : "",
    css: typeof candidate.css === "string" ? candidate.css : "",
    meta_title: typeof candidate.meta_title === "string" ? candidate.meta_title : "",
    meta_description:
      typeof candidate.meta_description === "string"
        ? candidate.meta_description
        : "",
    isComplete: candidate.isComplete === true,
  };
}

/** Build an absolute URL for the route when the host knows the site origin. */
function liveHref(siteUrl: string | undefined, route: string | null): string | null {
  if (!siteUrl || !route) return null;
  try {
    return new URL(route, siteUrl).toString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PARTS
// ---------------------------------------------------------------------------

/** Where this landed — the first thing the owner needs to know. */
export function CmsBuildStatus({
  route,
  writeTarget,
  href,
}: {
  route: string | null;
  writeTarget: CmsPageWriteTarget;
  href?: string | null;
}) {
  if (!route && !writeTarget) return null;
  const live = writeTarget === "live";
  return (
    <div
      className={cn(
        "animate-in fade-in flex flex-wrap items-center gap-2 rounded-lg border p-2.5",
        live ? "border-primary/30 bg-primary/5" : "border-border bg-muted/40",
      )}
    >
      {live ? (
        <Globe className="h-3.5 w-3.5 shrink-0 text-primary" />
      ) : (
        <PencilRuler className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <p className="text-sm leading-relaxed text-foreground">
        {live
          ? "This is on your site now."
          : writeTarget === "draft"
            ? "Saved as a draft — your published page was left as it was."
            : "Built."}
      </p>
      {route ? (
        href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
          >
            {route}
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
          </a>
        ) : (
          <span className="ml-auto font-mono text-xs text-muted-foreground">
            {route}
          </span>
        )
      ) : null}
    </div>
  );
}

/** How the page will look in a search result. */
export function CmsBuildSearchListing({
  metaTitle,
  metaDescription,
}: {
  metaTitle: string;
  metaDescription: string;
}) {
  if (!metaTitle && !metaDescription) return null;
  return (
    <div className="animate-in fade-in rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          How it looks in search
        </span>
      </div>
      <div className="mt-1.5 rounded-md bg-muted/50 p-2">
        {metaTitle ? (
          <p className="text-sm font-medium leading-snug text-primary">
            {metaTitle}
          </p>
        ) : null}
        {metaDescription ? (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {metaDescription}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The built page itself, in a fully sandboxed frame. Markup is toggleable for
 * the rare reader who wants it, and stays collapsed by default — the page is
 * what a page owner came to see.
 */
export function CmsBuildPreview({ data }: { data: CmsPageBuildData }) {
  const [showMarkup, setShowMarkup] = useState(false);
  if (!data.html) return null;

  return (
    <div className="animate-in fade-in overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          The built page
        </span>
        <button
          type="button"
          onClick={() => setShowMarkup((open) => !open)}
          className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Code2 className="h-3 w-3" aria-hidden />
          {showMarkup ? "Hide code" : "Show code"}
        </button>
      </div>
      {showMarkup ? (
        <pre className="max-h-[45dvh] overflow-auto p-3 font-mono text-[11px] leading-relaxed text-foreground">
          {data.html}
        </pre>
      ) : (
        <SandboxedHtml
          html={cmsPageBuildPreviewDocument(data)}
          title={data.route ? `Preview of ${data.route}` : "Page preview"}
          height={420}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The parent
// ---------------------------------------------------------------------------

export default function CmsPageBuildBlock({
  serverData,
  siteUrl,
  className,
}: CmsPageBuildBlockProps) {
  const data = readCmsPageBuildData(serverData);
  if (!data) return null;

  return (
    <div className={cn("my-2 space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Globe className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          Built page
        </span>
        {!data.isComplete && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Building
          </span>
        )}
      </div>

      <CmsBuildStatus
        route={data.route}
        writeTarget={data.write_target}
        href={liveHref(siteUrl, data.route)}
      />
      <CmsBuildPreview data={data} />
      <CmsBuildSearchListing
        metaTitle={data.meta_title}
        metaDescription={data.meta_description}
      />
    </div>
  );
}
