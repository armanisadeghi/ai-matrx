import { cn } from "@/lib/utils";

/**
 * SerpResult — the canonical "simulated Google search result".
 *
 * The single visual primitive for "how this title/description appears in
 * Google". Consumed by:
 *   - the live Meta Width Calculator page (desktop + mobile previews)
 *   - the SEO agent tool visualizations (inline stacks + overlay results page)
 *
 * Purely presentational: no Redux, no hooks, no browser APIs — give it a
 * url/title/description and it renders. Validation status is the caller's
 * concern (the page computes it via `metrics.ts`; tool checks pass the
 * server's precomputed flags), so this component can render in RSC or client.
 */

export type SerpDevice = "desktop" | "mobile";
export type SerpDensity = "full" | "compact";

export interface SerpResultProps {
  url?: string;
  title?: string;
  description?: string;
  device?: SerpDevice;
  /** "full" = page hero size, "compact" = inline/list size. Ignored for mobile. */
  density?: SerpDensity;
  /** Show the decorative rich-snippet row (stars / price / stock). */
  showRichSnippet?: boolean;
  /** Clamp the description to 2 lines like Google does. Default true. */
  clampDescription?: boolean;
  /**
   * Muted stand-in when no title is provided (e.g. the description checker).
   * Pass `null` to omit the title line entirely when empty.
   */
  placeholderTitle?: string | null;
  /**
   * Muted stand-in when no description is provided (e.g. the title checker).
   * Pass `null` to omit the description line entirely when empty.
   */
  placeholderDescription?: string | null;
  className?: string;
}

export function parseSerpDomain(url?: string): string {
  if (!url) return "example.com";
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(
      /^www\./,
      "",
    );
  } catch {
    return url;
  }
}

export function parseSerpBreadcrumb(url?: string): string {
  if (!url) return " › category › page";
  try {
    const segs = new URL(url.startsWith("http") ? url : `https://${url}`).pathname
      .split("/")
      .filter(Boolean);
    return segs.length ? " › " + segs.slice(-3).join(" › ") : " › category › page";
  } catch {
    return " › category › page";
  }
}

type SizeKey = "lg" | "md" | "sm";

const SIZE_TOKENS: Record<
  SizeKey,
  {
    favicon: string;
    domain: string;
    crumb: string;
    title: string;
    titlePlaceholder: string;
    desc: string;
    maxW: string;
    gap: string;
  }
> = {
  lg: {
    favicon: "h-7 w-7 text-xs",
    domain: "text-sm",
    crumb: "text-xs",
    title: "text-xl leading-[1.3]",
    titlePlaceholder: "text-base",
    desc: "text-sm leading-[1.58]",
    maxW: "max-w-[600px]",
    gap: "gap-3",
  },
  md: {
    favicon: "h-6 w-6 text-[11px]",
    domain: "text-[13px]",
    crumb: "text-[11px]",
    title: "text-base leading-[1.3]",
    titlePlaceholder: "text-sm",
    desc: "text-[13px] leading-[1.5]",
    maxW: "max-w-[560px]",
    gap: "gap-2.5",
  },
  sm: {
    favicon: "h-6 w-6 text-[10px]",
    domain: "text-xs",
    crumb: "text-[10px]",
    title: "text-base leading-[1.3]",
    titlePlaceholder: "text-sm",
    desc: "text-xs leading-[1.5]",
    maxW: "max-w-full",
    gap: "gap-2",
  },
};

export function SerpResult({
  url,
  title,
  description,
  device = "desktop",
  density = "full",
  showRichSnippet = false,
  clampDescription = true,
  placeholderTitle = "Your meta title will appear here…",
  placeholderDescription = "Your meta description will appear here. This is usually taken from the Meta Description tag if relevant to the query.",
  className,
}: SerpResultProps) {
  const size: SizeKey =
    device === "mobile" ? "sm" : density === "compact" ? "md" : "lg";
  const t = SIZE_TOKENS[size];

  const domain = parseSerpDomain(url);
  const breadcrumb = parseSerpBreadcrumb(url);
  const faviconChar = domain.charAt(0).toUpperCase() || "·";

  const hasTitle = Boolean(title && title.trim());
  const hasDescription = Boolean(description && description.trim());
  const showTitle = hasTitle || placeholderTitle != null;
  const showDescription = hasDescription || placeholderDescription != null;

  return (
    <div
      className={cn(
        "bg-card font-sans",
        device === "mobile" ? "max-w-[380px]" : "",
        className,
      )}
    >
      {/* Favicon + domain + breadcrumb */}
      <div className={cn("mb-2 flex items-center", t.gap)}>
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full bg-muted font-bold text-muted-foreground",
            t.favicon,
          )}
        >
          {faviconChar}
        </div>
        <div className="min-w-0">
          <div
            className={cn("truncate font-medium leading-tight text-foreground", t.domain)}
          >
            {domain}
          </div>
          <div className={cn("truncate leading-tight text-muted-foreground", t.crumb)}>
            {domain}
            {breadcrumb}
          </div>
        </div>
      </div>

      {/* Title (blue link) */}
      {showTitle ? (
        <div
          className={cn(
            "mb-1.5 cursor-pointer truncate text-primary hover:underline",
            t.maxW,
            t.title,
          )}
        >
          {hasTitle ? (
            title
          ) : (
            <span
              className={cn("font-normal text-muted-foreground", t.titlePlaceholder)}
            >
              {placeholderTitle}
            </span>
          )}
        </div>
      ) : null}

      {/* Description */}
      {showDescription ? (
        <div
          className={cn(
            "text-muted-foreground",
            t.maxW,
            t.desc,
            clampDescription && "line-clamp-2",
          )}
        >
          {hasDescription ? (
            description
          ) : (
            <span className="text-muted-foreground/70">{placeholderDescription}</span>
          )}
        </div>
      ) : null}

      {showRichSnippet ? (
        <div
          className={cn(
            "mt-2.5 flex gap-5 text-muted-foreground",
            size === "sm" ? "text-[10px]" : "text-xs",
          )}
        >
          <span className="text-warning">★★★★☆</span>
          <span>$99 – $199</span>
          <span>In stock</span>
        </div>
      ) : null}
    </div>
  );
}
