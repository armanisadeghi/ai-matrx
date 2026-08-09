/**
 * PER-PAGE SEO CHECKS — the browser half of the ONE verdict layer.
 *
 * EXACT mirror of the check section of aidream
 * `packages/matrx-scraper/matrx_scraper/seo_audit.py` (`PageEvidence`,
 * `CheckOutcome`, every `check_*`, `PAGE_CHECKS` / `run_page_checks`).
 * Statuses, scores, issue counts, evidence payloads, AND the reasoning
 * strings are byte-identical: a reasoning sentence is a user-facing expert
 * explanation, so the same page must never be explained two different ways
 * depending on which side computed it.
 *
 * 🚨 CHANGE ONE → CHANGE BOTH IN THE SAME UNIT OF WORK. A threshold, a
 * status boundary, or a single word of reasoning changed here must land in
 * `matrx_scraper/seo_audit.py` in the same commit, and the parity fixture
 * must be regenerated:
 *
 *     .venv/bin/python packages/matrx-scraper/scripts/generate_page_checks_parity_fixture.py
 *
 * `checks.parity.test.ts` fails if you forget.
 *
 * The evidence↔verdict split is the point: a check NEVER parses HTML and
 * never touches the network or a database, so the same function serves a
 * live one-shot audit in the browser, a stored-snapshot render, and the
 * server's crawl pipeline. Metrics (pixel widths, indexability) come from
 * their canonical owners — `../serp/metrics` and `./indexability` — and the
 * SERP length limits are IMPORTED, never redeclared.
 */

import { TITLE_LIMITS, DESCRIPTION_LIMITS } from "../serp/metrics";
import type { StoredMetaFieldMetrics } from "../serp/metrics";

// ---------------------------------------------------------------------------
// Thresholds — every decision boundary, declared exactly once.
// Mirrors of the CAPS constants in `seo_audit.py`.
// ---------------------------------------------------------------------------

/**
 * Thin content, in words of audited visible text. Screaming Frog's "low
 * content" default is 200 words; we warn below 300 and fail below 100.
 */
export const CONTENT_OK_WORDS = 300;
export const CONTENT_WARN_WORDS = 200;
export const CONTENT_FAIL_WORDS = 100;

/** Missing image alt escalates from warn to fail at either bound. */
export const IMAGE_ALT_FAIL_RATIO = 0.5;
export const IMAGE_ALT_FAIL_COUNT = 10;

// --- Images & media --------------------------------------------------------
// Every one of these bands maps to a rule in the `web.analysis_item` row's
// `score_contract`; the row is the spec, these constants are its only home.

/** Raster formats worth converting, and the modern targets to convert them to. */
export const IMAGE_MODERN_RASTER_FORMATS: ReadonlySet<string> = new Set([
  "avif",
  "webp",
]);
export const IMAGE_LEGACY_RASTER_FORMATS: ReadonlySet<string> = new Set([
  "bmp",
  "gif",
  "jpg",
  "png",
  "tif",
]);

/** Share of images that must declare width/height before the page is clean. */
export const IMAGE_DIMENSION_ATTR_PASS_COVERAGE = 0.9;
export const IMAGE_DIMENSION_ATTR_FAIL_COVERAGE = 0.5;

/** Share of convertible raster IMAGES — count-weighted, see checkImageModernFormat. */
export const IMAGE_MODERN_FORMAT_PASS_COVERAGE = 0.9;
export const IMAGE_MODERN_FORMAT_FAIL_COVERAGE = 0.5;

/**
 * Fold geometry is NOT captured, so DOM order stands in for it: the first N
 * <img> elements are treated as likely above-the-fold.
 */
export const IMAGE_ABOVE_FOLD_DOM_COUNT = 3;
export const IMAGE_BELOW_FOLD_EAGER_FAIL_RATIO = 0.5;

/**
 * Oversizing, in declared-intrinsic-width / declared-display-width. A 2x ratio
 * is CORRECT (retina), so the bands start above the DPR headroom.
 */
export const IMAGE_OVERSIZE_MINOR_RATIO = 2.0;
export const IMAGE_OVERSIZE_MAJOR_RATIO = 4.0;
export const IMAGE_OVERSIZE_SEVERE_RATIO = 8.0;

/** Broken images: the row's own band — 3+ is a page that looks abandoned. */
export const BROKEN_IMAGE_FAIL_COUNT = 3;

/** Extensions `imageFormat` recognises, and the spellings it folds together. */
const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  "apng",
  "avif",
  "bmp",
  "gif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);
const IMAGE_FORMAT_ALIASES: Record<string, string> = {
  jpeg: "jpg",
  tiff: "tif",
};

/**
 * Redirects: hops BEYOND the first are the waste. >2 entries in the chain
 * means the crawler followed more than one hop to land.
 */
export const REDIRECT_CHAIN_MAX_HOPS = 2;

/**
 * Weight ceiling for the HTML DOCUMENT — the only transfer size the crawl
 * measures. Subresource bytes (images, scripts, fonts) are NOT fetched, so
 * there is no total-page-weight number here and the catalogue row says so.
 */
export const LARGE_PAGE_BYTES = 5_000_000;

/**
 * TTFB bands, straight from the `ttfb_server_response` row's score_contract
 * and from Google's server-response-time audit: at or under 800 ms is good,
 * over 1800 ms is poor. These grade TRUE time-to-first-byte (`ttfbMs`), never
 * total response time — a fast server behind a slow download must not be
 * scored as slow, and the reverse is worse.
 */
export const TTFB_GOOD_MS = 800;
export const TTFB_POOR_MS = 1_800;

// --- Mobile rendering, language, social ------------------------------------

/**
 * Viewport zoom lockout. A `maximum-scale` at or below this pins the page at
 * its initial scale — the same WCAG 1.4.4 failure `user-scalable=no` causes.
 */
export const VIEWPORT_ZOOM_LOCK_MAX_SCALE = 1.0;
/** Values of `user-scalable` that disable pinch-zoom. */
export const VIEWPORT_ZOOM_DISABLED_VALUES: ReadonlySet<string> = new Set([
  "no",
  "0",
  "false",
]);

/**
 * Formats the social-share crawlers actually render. Anything else (svg, bmp,
 * ico, tiff) is fetched and then dropped, so the share renders imageless.
 */
export const OG_IMAGE_SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
]);

/** The Open Graph tags a rich share preview requires, per the catalogue row. */
export const SOCIAL_REQUIRED_OG_TAGS = [
  "og:title",
  "og:description",
  "og:image",
  "og:url",
  "og:type",
] as const;
/** Deductions from the tag-coverage score — the catalogue row's formula, verbatim. */
export const SOCIAL_OG_URL_CONFLICT_PENALTY = 20;
export const SOCIAL_NO_TWITTER_CARD_PENALTY = 10;
/** Score bands the coverage formula maps to a status. */
export const SOCIAL_META_PASS_SCORE = 100;
export const SOCIAL_META_WARN_SCORE = 60;

/**
 * A meta refresh at or below this delay is an outright HTTP-redirect
 * substitute; above it the page is an interstitial the user actually sees.
 */
export const META_REFRESH_INSTANT_MAX_SECONDS = 0;

/**
 * HTTP-variant probe verdicts for `https_enforcement`. A permanent redirect is
 * the only answer that consolidates the duplicate.
 */
export const HTTP_VARIANT_PERMANENT_REDIRECTS: ReadonlySet<number> = new Set([
  301, 308,
]);

// --- Outline, depth, and error-page detection ------------------------------

/**
 * `heading_hierarchy` — a "skip" is a jump of more than one level between two
 * consecutive headings (h2 → h4).
 */
export const HEADING_SKIP_FAIL_COUNT = 3;
export const HEADING_EMPTY_FAIL_RATIO = 0.3;

/** `text_html_ratio` — extracted visible-text bytes / raw HTML bytes. */
export const TEXT_HTML_RATIO_FAIL = 0.03;
export const TEXT_HTML_RATIO_WARN = 0.1;

/**
 * `content_depth` — per-TYPE word expectations, the analytics counterpart to
 * `thin_content`'s absolute floor. Only evaluated when the page declares a
 * type; an unknown type is `n_a`, never a second thin-content verdict.
 */
export const CONTENT_DEPTH_ARTICLE_MIN_WORDS = 500;
export const CONTENT_DEPTH_ARTICLE_TARGET_WORDS = 900;
export const CONTENT_DEPTH_COMMERCE_MIN_WORDS = 100;
/** schema.org @type values (lowercased) that carry a long-form expectation. */
export const CONTENT_DEPTH_ARTICLE_SCHEMA_TYPES: ReadonlySet<string> = new Set([
  "article",
  "advertisercontentarticle",
  "blogposting",
  "liveblogposting",
  "newsarticle",
  "report",
  "scholarlyarticle",
  "socialmediaposting",
  "techarticle",
]);
/** Commerce/listing types — a short page is normal, an EMPTY one is not. */
export const CONTENT_DEPTH_COMMERCE_SCHEMA_TYPES: ReadonlySet<string> = new Set(
  [
    "collectionpage",
    "individualproduct",
    "itemlist",
    "offercatalog",
    "product",
    "productgroup",
    "productmodel",
  ],
);
/** Types with no content expectation at all — exempt, per the catalogue row. */
export const CONTENT_DEPTH_UTILITY_SCHEMA_TYPES: ReadonlySet<string> = new Set([
  "aboutpage",
  "checkoutpage",
  "contactpage",
  "profilepage",
  "searchresultspage",
]);

/** `soft_404_detection` — a 200 that serves error content. */
export const SOFT_404_PHRASE_MAX_WORDS = 50;
export const SOFT_404_EMPTY_MAX_WORDS = 30;
/**
 * Not-found phrasing in a TITLE. Deliberately narrow — an article titled
 * "What to do when a page is missing" must not be called a soft 404.
 */
export const SOFT_404_TITLE_PATTERN =
  /\b(404|page not found|not found|no longer (?:exists|available)|page (?:does not|doesn'?t) exist|page unavailable|error 404)\b/i;

/** `temporary_redirect_usage` — statuses that should have been 301/308. */
export const TEMPORARY_REDIRECT_STATUSES: ReadonlySet<number> = new Set([
  302, 307,
]);

/** How many offending URLs a check attaches as evidence. */
export const CHECK_EVIDENCE_SAMPLE_LIMIT = 5;

// --- Structured data -------------------------------------------------------

/** Properties Google REQUIRES for a rich result of this type. */
export const RICH_RESULT_REQUIRED_PROPERTIES: Record<
  string,
  readonly string[]
> = {
  Article: ["headline"],
  NewsArticle: ["headline"],
  BlogPosting: ["headline"],
  BreadcrumbList: ["itemListElement"],
  Course: ["name", "description", "provider"],
  Event: ["name", "startDate", "location"],
  FAQPage: ["mainEntity"],
  HowTo: ["name", "step"],
  JobPosting: ["title", "datePosted", "hiringOrganization", "jobLocation"],
  LocalBusiness: ["name", "address"],
  Organization: ["name"],
  Product: ["name", "offers"],
  QAPage: ["mainEntity"],
  Recipe: ["name", "image"],
  Review: ["itemReviewed", "reviewRating", "author"],
  SoftwareApplication: ["name", "offers"],
  VideoObject: ["name", "thumbnailUrl", "uploadDate"],
};

/** Properties Google recommends — absent, the rich result renders with less. */
export const RICH_RESULT_RECOMMENDED_PROPERTIES: Record<
  string,
  readonly string[]
> = {
  Article: ["image", "author", "datePublished", "dateModified", "publisher"],
  NewsArticle: [
    "image",
    "author",
    "datePublished",
    "dateModified",
    "publisher",
  ],
  BlogPosting: ["image", "author", "datePublished", "dateModified"],
  Course: ["url", "image"],
  Event: ["description", "endDate", "image", "offers", "performer"],
  HowTo: ["image", "totalTime", "supply", "tool"],
  JobPosting: ["description", "baseSalary", "employmentType", "validThrough"],
  LocalBusiness: [
    "telephone",
    "openingHours",
    "geo",
    "url",
    "image",
    "priceRange",
  ],
  Organization: ["url", "logo", "sameAs", "contactPoint"],
  Product: ["image", "description", "brand", "aggregateRating", "sku"],
  Recipe: [
    "author",
    "datePublished",
    "description",
    "recipeIngredient",
    "recipeInstructions",
    "cookTime",
  ],
  Review: ["datePublished"],
  SoftwareApplication: [
    "aggregateRating",
    "applicationCategory",
    "operatingSystem",
  ],
  VideoObject: ["description", "duration", "contentUrl", "embedUrl"],
};

/**
 * Spellings schema.org accepts for the SAME fact. A page that declares
 * `openingHoursSpecification` has stated its opening hours; calling that
 * "missing" is the check being wrong, not the page.
 */
export const SCHEMA_PROPERTY_ALIASES: Record<string, readonly string[]> = {
  address: ["address", "location"],
  author: ["author", "creator"],
  image: ["image", "thumbnailUrl", "photo"],
  openingHours: ["openingHours", "openingHoursSpecification"],
  offers: ["offers", "aggregateRating", "review"],
  step: ["step", "steps"],
  telephone: ["telephone", "phone"],
};

/** schema.org LocalBusiness subtypes common enough to be worth naming. */
export const LOCAL_BUSINESS_SUBTYPES: ReadonlySet<string> = new Set([
  "AutomotiveBusiness",
  "ChildCare",
  "Dentist",
  "DryCleaningOrLaundry",
  "EmergencyService",
  "EmploymentAgency",
  "EntertainmentBusiness",
  "FinancialService",
  "FoodEstablishment",
  "GovernmentOffice",
  "HealthAndBeautyBusiness",
  "HomeAndConstructionBusiness",
  "InsuranceAgency",
  "LegalService",
  "Library",
  "LodgingBusiness",
  "MedicalBusiness",
  "ProfessionalService",
  "RadioStation",
  "RealEstateAgent",
  "Restaurant",
  "SelfStorage",
  "ShoppingCenter",
  "SportsActivityLocation",
  "Store",
  "TelevisionStation",
  "TouristInformationCenter",
  "TravelAgency",
]);

/** How many offending values a structured-data check attaches as evidence. */
export const STRUCTURED_DATA_EVIDENCE_LIMIT = 5;

/** How much of a malformed JSON-LD script is quoted back to the user. */
export const MALFORMED_SCRIPT_SNIPPET_CHARS = 200;

// --- International ---------------------------------------------------------

/** The reserved hreflang value for the fallback page — not a language tag. */
export const HREFLANG_DEFAULT_VALUE = "x-default";

// --- Lab performance (PageSpeed Insights) ----------------------------------

/** cwv_lcp — Google's Core Web Vitals thresholds, in milliseconds. */
export const LCP_GOOD_MS = 2_500;
export const LCP_POOR_MS = 4_000;
/** Milliseconds of LCP above `LCP_POOR_MS` that cost one point. */
export const LCP_POOR_MS_PER_POINT = 200;

/** cwv_inp_tbt — Total Blocking Time, the lab proxy for INP. */
export const TBT_GOOD_MS = 200;
export const TBT_POOR_MS = 600;
export const TBT_POOR_MS_PER_POINT = 50;

/** cwv_cls — unitless layout-shift score. */
export const CLS_GOOD = 0.1;
export const CLS_POOR = 0.25;
/** CLS above `CLS_POOR` is multiplied by this before being deducted. */
export const CLS_POOR_PENALTY_PER_UNIT = 100;

/** The bands a good / needs-improvement measurement is scored within. */
export const CWV_GOOD_BAND: readonly [number, number] = [90, 100];
export const CWV_MID_BAND: readonly [number, number] = [50, 89];
export const CWV_POOR_CEILING = 49;

/** asset_delivery — estimated savings, in milliseconds. */
export const DELIVERY_SAVINGS_GOOD_MS = 250;
export const DELIVERY_SAVINGS_POOR_MS = 1_500;
export const DELIVERY_POOR_MS_PER_POINT = 100;
export const DELIVERY_POOR_FLOOR = 10;

/** caching_policy — a static asset is "well cached" at or above this lifetime. */
export const CACHE_WELL_CACHED_MIN_MS = 30 * 24 * 60 * 60 * 1_000;
/** Below this many static bytes, caching is not a meaningful lever. */
export const CACHE_NEGLIGIBLE_STATIC_BYTES = 10_000;

/** A measurement older than this is stale evidence, not today's truth. */
export const LAB_PERFORMANCE_MAX_AGE_DAYS = 90;

/** Status bands shared by the performance checks, applied to the final score. */
export const PERFORMANCE_PASS_SCORE = 90;
export const PERFORMANCE_WARN_SCORE = 50;

/** Lighthouse audit id → the same defect stated for a non-technical reader. */
const DELIVERY_AUDIT_LABELS: Record<string, string> = {
  "render-blocking-insight": "files that block the page from drawing",
  "document-latency-insight": "a slow or uncompressed first response",
  "image-delivery-insight": "images sent larger than they are shown",
  "legacy-javascript-insight": "code shipped twice for old browsers",
  "duplicated-javascript-insight": "the same code included more than once",
  "font-display-insight": "fonts that hide text while they load",
  "unminified-css": "styling files sent uncompacted",
  "unminified-javascript": "code files sent uncompacted",
  "unused-css-rules": "styling rules this page never uses",
  "unused-javascript": "code this page never runs",
};

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/**
 * A persisted meta-field metrics payload, as written by either side.
 * Every key is optional because a snapshot may predate a field; the Python
 * reads them with `.get()` for exactly the same reason. `title_ok` /
 * `description_ok` are the pre-`ok` names still present in stored rows.
 */
export type CheckMetaMetrics = Partial<StoredMetaFieldMetrics> & {
  title_ok?: boolean;
  description_ok?: boolean;
};

export interface RedirectHop {
  url?: string | null;
  status?: number | null;
}

/** One entry of `web.snapshot.headings.all`. */
export interface HeadingEvidenceItem {
  level?: unknown;
  text?: unknown;
}

/** One entry of `web.snapshot.images.items`, in DOM order. */
export interface PageImageItem {
  src?: string | null;
  srcset?: string[];
  srcset_widths?: number[];
  picture_formats?: string[];
  sizes?: string | null;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
  loading?: string | null;
  featured?: boolean;
  http_status?: number | null;
  [key: string]: unknown;
}

/** One under-cached asset PageSpeed flagged. */
export interface CacheShortTtlResource {
  url?: unknown;
  cache_lifetime_ms?: unknown;
  total_bytes?: unknown;
  [key: string]: unknown;
}

/**
 * One PageSpeed Insights observation, reduced to what the checks score —
 * mirror of Python's `LabPerformance`. Every field is null when PageSpeed did
 * not report it, and every check must answer `n_a` for a null.
 */
export interface LabPerformance {
  strategy: string;
  /** ISO 8601 instant; null when the store recorded no timestamp. */
  observedAt?: string | null;
  lcpMs?: number | null;
  tbtMs?: number | null;
  cls?: number | null;
  /** Estimated total savings across the delivery fix-list, milliseconds. */
  deliverySavingsMs?: number | null;
  /** Per-audit `{name: savings_ms}` — the offender list behind that total. */
  deliveryAudits?: Record<string, number>;
  /** Total transferred bytes of cacheable static assets; null = not reported. */
  cacheStaticBytes?: number | null;
  cacheShortTtlResources?: CacheShortTtlResource[];
}

/**
 * Everything a per-page check needs, from ANY source — a live audit or a
 * persisted snapshot row. A missing/null field means "not captured": every
 * check must answer `n_a` for it, NEVER a silent pass.
 */
export interface PageEvidence {
  url: string;
  title?: string | null;
  titleMetrics?: CheckMetaMetrics;
  description?: string | null;
  descriptionMetrics?: CheckMetaMetrics;
  metaRobots?: string | null;
  canonicalUrl?: string | null;
  canonicalMatches?: boolean | null;
  noindex?: boolean | null;
  nofollow?: boolean | null;
  h1Count?: number | null;
  /**
   * Every heading in document order — `web.snapshot.headings.all`. Null =
   * never captured (the outline checks answer n_a); `[]` = captured, and the
   * page genuinely has no headings.
   */
  headings?: HeadingEvidenceItem[] | null;
  wordCount?: number | null;
  /** UTF-8 bytes of the visible text `wordCount` counts. */
  textBytes?: number | null;
  /** schema.org @type values the page declares; null = never captured. */
  schemaTypes?: string[] | null;
  imageCount?: number | null;
  imagesMissingAlt?: number | null;
  /**
   * Per-<img> inventory in DOM order, capped while `imageCount` stays the true
   * total. Empty with a non-zero `imageCount` means the snapshot predates the
   * inventory, which every image check must answer `n_a` for.
   */
  imageItems?: PageImageItem[];
  httpStatus?: number | null;
  redirectChain?: RedirectHop[];
  mixedContent?: string[];
  /**
   * Security-relevant response headers, lower-cased. Null = the capture never
   * recorded headers; `{}` = it did and the server sent none of them.
   */
  responseHeaders?: Record<string, string> | null;
  /**
   * Result of probing this URL's http:// variant — {status, location}. Null =
   * never probed, which checkHttpsEnforcement answers n_a for.
   */
  httpVariantProbe?: Record<string, unknown> | null;
  /**
   * Transfer size of the HTML DOCUMENT only — subresources are never fetched,
   * so this is NOT total page weight (see checkPageWeight).
   */
  responseBytes?: number | null;
  /**
   * Total elapsed time of the fetch: server think time PLUS the body
   * download. Recorded for the record; NOT what the TTFB check grades.
   */
  responseTimeMs?: number | null;
  /**
   * TRUE time to first byte, in ms, measured by the transport, redirect hops
   * included. Null/undefined = never measured (snapshots captured before
   * 2026-08-09, and anything fetched through the browser transport).
   * checkTtfbServerResponse answers n_a for those; it must NEVER fall back to
   * responseTimeMs, which measures a different thing.
   */
  ttfbMs?: number | null;
  /**
   * {prev, next} from rel=prev/next link tags. Empty = the page declares no
   * pagination, which is NOT a defect (see checkPaginationMarkup).
   */
  pagination?: Record<string, unknown>;
  /** hreflang annotations as [{lang, href}], exactly as persisted. */
  hreflang?: Record<string, unknown>[];
  /**
   * The COMPLETE structured-data payload. Empty = never captured (n_a), which
   * is a different fact from "captured, and the page has no markup".
   */
  structuredData?: Record<string, unknown>;
  /**
   * True once an HTML <head> was actually parsed for this page. A URL the
   * crawler attempted but never snapshotted has NO head evidence, so every
   * head check answers n_a instead of reporting a tag as missing on markup
   * nobody ever read.
   */
  headCaptured?: boolean;
  /** `<html lang>` verbatim; empty when the page declares none. */
  lang?: string | null;
  /** Raw social tag bags, keys exactly as authored ("og:title"). */
  og?: Record<string, string> | null;
  twitter?: Record<string, string> | null;
  /**
   * {viewport, refresh} — the two head metas that are neither SEO text nor
   * transport. Null = the snapshot predates this capture.
   */
  headMeta?: Record<string, unknown> | null;
  /**
   * Lab performance from the ONE PageSpeed store. Null = PageSpeed has never
   * run for this page, which every Core Web Vitals check answers `n_a` +
   * COLLECT_PAGESPEED for — NEVER a pass.
   */
  labPerformance?: LabPerformance | null;
}

export type CheckStatus = "pass" | "warn" | "fail" | "n_a";

/**
 * A verdict. `score` is 1-100 for pass/warn/fail and null otherwise — the
 * shape `web.analysis_result`'s status/score constraint requires.
 */
/**
 * The ONE-CLICK FIX for a check that could not run yet — the browser mirror of
 * Python's `seo_audit.Remediation`.
 *
 * A check that answers `n_a` because EVIDENCE IS MISSING attaches one of these
 * and NEVER tells the user to run something in prose (NO DEAD ENDS doctrine).
 * `command` names a crawler command the platform already performs;
 * `features/marketing/crawler/remediation.ts` maps it to the existing
 * direct-client call.
 */
export interface Remediation {
  /** Existing crawler command key. */
  command:
    | "links_check"
    | "page_fetch"
    | "site_recrawl"
    | "sitemaps_sync"
    | "pagespeed_collect"
    | "gsc_sync";
  /** "site" (one command covers the whole site) | "page" (this page only). */
  scope: "site" | "page";
  /** The button's verb, in the user's language. */
  label: string;
  /** What will happen, stated BEFORE it happens. */
  explainer: string;
}

export const CHECK_SITE_LINKS: Remediation = {
  command: "links_check",
  scope: "site",
  label: "Check this site's links",
  explainer:
    "We follow every link on the site once and record which ones are broken " +
    "or bounce through a redirect. It runs across the whole site, so it only " +
    "needs doing once after each crawl.",
};

export const RECAPTURE_PAGE: Remediation = {
  command: "page_fetch",
  scope: "page",
  label: "Capture this page again",
  explainer:
    "We fetch a fresh copy of this one page right now and measure it. It " +
    "takes a few seconds and changes nothing on your website.",
};

export const COLLECT_PAGESPEED: Remediation = {
  command: "pagespeed_collect",
  scope: "page",
  label: "Measure this page's speed",
  explainer:
    "We load this one page in a real phone-sized browser and time it — how " +
    "fast the main content appears, how long it stays unresponsive, and how " +
    "much the layout jumps. It takes under a minute and changes nothing on " +
    "your website.",
};

export const SYNC_GSC: Remediation = {
  command: "gsc_sync",
  scope: "site",
  label: "Pull this site's Google data",
  explainer:
    "We ask Google Search Console for the clicks, impressions and average " +
    "positions it recorded for this site, and store them so the search " +
    "checks can read real numbers instead of guessing. It reads only; " +
    "nothing on your website or in Google changes.",
};

export const SYNC_SITEMAPS: Remediation = {
  command: "sitemaps_sync",
  scope: "site",
  label: "Read this site's sitemap",
  explainer:
    "We find and read the sitemap files your website publishes — the list " +
    "of pages it asks search engines to index — and compare them with the " +
    "pages we actually found. It takes seconds and changes nothing on your " +
    "website.",
};

export const RECRAWL_SITE: Remediation = {
  command: "site_recrawl",
  scope: "site",
  label: "Crawl this site again",
  explainer:
    "We walk the whole site from the homepage, re-reading every page and " +
    "the links between them. This is the slow one — it can take a while on " +
    "a large site — but it is what rebuilds the site-wide picture.",
};

export interface CheckOutcome {
  status: CheckStatus;
  score: number | null;
  reasoning: string;
  issueCount: number;
  evidence: Record<string, unknown> | null;
  /** Set whenever the verdict is blocked on evidence the platform can go get. */
  remediation: Remediation | null;
}

function outcome(
  status: CheckStatus,
  score: number | null,
  reasoning: string,
  issueCount = 0,
  evidence: Record<string, unknown> | null = null,
  remediation: Remediation | null = null,
): CheckOutcome {
  return { status, score, reasoning, issueCount, evidence, remediation };
}

// ---------------------------------------------------------------------------
// Formatting helpers — Python semantics, not JavaScript's
// ---------------------------------------------------------------------------

export function clampScore(value: number): number {
  return Math.max(1, Math.min(100, value));
}

export function sampleUrls(urls: string[]): string[] {
  return urls.slice(0, CHECK_EVIDENCE_SAMPLE_LIMIT);
}

/**
 * Python `round()` is banker's rounding (half-to-even); `Math.round` is
 * half-up. They disagree on e.g. 46.5, which `checkImageAltPresence` can
 * produce, so the mirror needs Python's rule.
 */
function pythonRound(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Python string slicing counts code points, not UTF-16 units. */
function sliceCodePoints(text: string, end: number): string {
  return Array.from(text).slice(0, end).join("");
}

/** Python `f"{n:,}"` — locale-free thousands separators. */
function withThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Round a double the way Python's `format(value, f".{digits}f")` does:
 * correctly-rounded decimal with HALF-TO-EVEN on an exact tie. `toFixed`
 * rounds ties away from zero, so `(2.25).toFixed(1)` is "2.3" where Python
 * says "2.2" — a divergence a display-width ratio hits for real.
 */
function pyFixed(value: number, digits: number): string {
  if (!Number.isFinite(value)) return String(value);
  const negative = value < 0;
  const expansion = Math.abs(value).toFixed(Math.min(100 - digits, digits + 25));
  const dot = expansion.indexOf(".");
  const intPart = dot === -1 ? expansion : expansion.slice(0, dot);
  const fracPart = dot === -1 ? "" : expansion.slice(dot + 1);
  const keep = fracPart.slice(0, digits).padEnd(digits, "0");
  const rest = fracPart.slice(digits);
  let roundUp = false;
  if (rest) {
    const first = rest[0];
    const tail = rest.slice(1);
    if (first > "5") roundUp = true;
    else if (first === "5") {
      if (/[1-9]/.test(tail)) roundUp = true;
      else {
        const lastKept =
          digits > 0 ? keep[digits - 1] : intPart[intPart.length - 1];
        roundUp = Number(lastKept) % 2 === 1;
      }
    }
  }
  const all = (intPart + keep).split("");
  if (roundUp) {
    let i = all.length - 1;
    for (; i >= 0; i -= 1) {
      if (all[i] === "9") all[i] = "0";
      else {
        all[i] = String(Number(all[i]) + 1);
        break;
      }
    }
    if (i < 0) all.unshift("1");
  }
  const joined = all.join("");
  const head = digits > 0 ? joined.slice(0, joined.length - digits) : joined;
  const tail = digits > 0 ? joined.slice(joined.length - digits) : "";
  const body = (head || "0") + (digits > 0 ? `.${tail}` : "");
  return negative && Number(body) !== 0 ? `-${body}` : body;
}

/** Python `round(value, digits)` — the same half-to-even rule, as a number. */
function pyRoundTo(value: number, digits: number): number {
  return Number(pyFixed(value, digits));
}

/** Python's `urlsplit` — deliberately NOT `new URL()`, which normalizes. */
interface UrlParts {
  scheme: string;
  netloc: string;
  path: string;
  query: string;
  fragment: string;
}

function urlSplit(url: string): UrlParts {
  let rest = url;
  let scheme = "";
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.\-]*):/.exec(rest);
  if (schemeMatch) {
    scheme = schemeMatch[1].toLowerCase();
    rest = rest.slice(schemeMatch[0].length);
  }
  let netloc = "";
  if (rest.startsWith("//")) {
    rest = rest.slice(2);
    const end = rest.search(/[/?#]/);
    netloc = end === -1 ? rest : rest.slice(0, end);
    rest = end === -1 ? "" : rest.slice(end);
  }
  let fragment = "";
  const hash = rest.indexOf("#");
  if (hash !== -1) {
    fragment = rest.slice(hash + 1);
    rest = rest.slice(0, hash);
  }
  let query = "";
  const mark = rest.indexOf("?");
  if (mark !== -1) {
    query = rest.slice(mark + 1);
    rest = rest.slice(0, mark);
  }
  return { scheme, netloc, path: rest, query, fragment };
}

/** Python `str.rstrip(chars)` for the one character these checks strip. */
function rstripSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

/** Render a possibly-absent number the way Python's f-string renders None. */
function pyNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "None" : String(value);
}

function isEmptyMetrics(metrics: CheckMetaMetrics | undefined): boolean {
  return !metrics || Object.keys(metrics).length === 0;
}

/**
 * Python `urlsplit(...).netloc`, minus a leading `www.`. Deliberately NOT
 * `new URL()`: the WHATWG parser strips default ports and re-encodes, so it
 * would disagree with the server on `https://host:443/x`.
 */
export function registrableHost(url: string): string {
  const host = urlSplit(url).netloc.toLowerCase();
  return host.startsWith("www.") ? host.slice(4) : host;
}

function chainUrls(ev: PageEvidence): string[] {
  return (ev.redirectChain ?? [])
    .filter((hop): hop is RedirectHop => Boolean(hop && hop.url))
    .map((hop) => String(hop.url));
}

// --- Title -----------------------------------------------------------------

export function checkTitlePresence(ev: PageEvidence): CheckOutcome {
  if (ev.title) {
    return outcome(
      "pass",
      100,
      `Title present: "${sliceCodePoints(ev.title, 120)}".`,
    );
  }
  return outcome(
    "fail",
    5,
    "This page has no <title> tag (or it is empty) — search engines will " +
      "synthesize one, and the SERP headline is out of your control.",
    1,
  );
}

export function checkTitleLength(ev: PageEvidence): CheckOutcome {
  const metrics = ev.titleMetrics;
  if (!ev.title) {
    return outcome(
      "n_a",
      null,
      "This page has no title yet, so there is nothing to measure.",
    );
  }
  if (isEmptyMetrics(metrics)) {
    return outcome(
      "n_a",
      null,
      "We haven't measured this page's title yet.",
      0,
      null,
      RECAPTURE_PAGE,
    );
  }
  const issues = (metrics?.issues ?? []).map((issue) => String(issue));
  const chars = metrics?.character_count;
  const pixels = metrics?.pixel_width;
  const detail =
    chars !== null && chars !== undefined
      ? `${chars} chars, ${pyNumber(pixels)}px`
      : "measured at capture";
  if (metrics?.ok || metrics?.title_ok) {
    return outcome("pass", 100, `Title length is within limits (${detail}).`);
  }
  const flagsBad = [
    metrics?.seo_length_ok,
    metrics?.desktop_ok,
    metrics?.mobile_ok,
  ].filter((ok) => ok === false).length;
  const score = flagsBad <= 1 ? 60 : 35;
  const reason = issues.length
    ? `Title length problem (${detail}): ` + issues.join("; ")
    : `Title is outside the recommended window (${detail}; aim for ` +
      `${TITLE_LIMITS.minChars}-${TITLE_LIMITS.maxChars} chars) and may truncate in SERPs.`;
  return outcome("warn", score, reason, Math.max(1, issues.length));
}

// --- Meta description ------------------------------------------------------

export function checkMetaDescriptionPresence(ev: PageEvidence): CheckOutcome {
  if (ev.description) {
    return outcome("pass", 100, "Meta description present.");
  }
  return outcome(
    "fail",
    25,
    "No meta description — Google will scrape arbitrary body text for the " +
      "snippet, and CTR suffers.",
    1,
  );
}

export function checkMetaDescriptionLength(ev: PageEvidence): CheckOutcome {
  const metrics = ev.descriptionMetrics;
  if (!ev.description) {
    return outcome(
      "n_a",
      null,
      "This page has no meta description yet, so there is nothing to measure.",
    );
  }
  if (isEmptyMetrics(metrics)) {
    return outcome(
      "n_a",
      null,
      "We haven't measured this page's meta description yet.",
      0,
      null,
      RECAPTURE_PAGE,
    );
  }
  const issues = (metrics?.issues ?? []).map((issue) => String(issue));
  const chars = metrics?.character_count;
  const pixels = metrics?.pixel_width;
  const detail =
    chars !== null && chars !== undefined
      ? `${chars} chars, ${pyNumber(pixels)}px`
      : "measured at capture";
  if (metrics?.ok || metrics?.description_ok) {
    return outcome(
      "pass",
      100,
      `Meta description length is within limits (${detail}).`,
    );
  }
  const flagsBad = [
    metrics?.seo_length_ok,
    metrics?.desktop_ok,
    metrics?.mobile_ok,
  ].filter((ok) => ok === false).length;
  const score = flagsBad <= 1 ? 60 : 40;
  const reason = issues.length
    ? `Meta description length problem (${detail}): ` + issues.join("; ")
    : `Meta description is outside the recommended window (${detail}; aim for ` +
      `${DESCRIPTION_LIMITS.minChars}-${DESCRIPTION_LIMITS.maxChars} chars).`;
  return outcome("warn", score, reason, Math.max(1, issues.length));
}

// --- Structure -------------------------------------------------------------

export function checkH1Presence(ev: PageEvidence): CheckOutcome {
  const h1Count = ev.h1Count;
  if (h1Count === null || h1Count === undefined) {
    return outcome(
      "n_a",
      null,
      "We haven't recorded this page's headings yet.",
      0,
      null,
      RECAPTURE_PAGE,
    );
  }
  if (h1Count === 1) return outcome("pass", 100, "Exactly one H1.");
  if (h1Count === 0) {
    return outcome(
      "fail",
      20,
      "No H1 on the page — the primary on-page topic signal is missing.",
      1,
    );
  }
  return outcome(
    "warn",
    50,
    `${h1Count} H1 tags — multiple H1s dilute the primary topic signal; keep one.`,
    h1Count - 1,
  );
}

export function checkThinContent(ev: PageEvidence): CheckOutcome {
  const words = ev.wordCount;
  if (words === null || words === undefined) {
    return outcome(
      "n_a",
      null,
      "We haven't counted the words on this page yet.",
      0,
      null,
      RECAPTURE_PAGE,
    );
  }
  if (words >= CONTENT_OK_WORDS) {
    return outcome("pass", 100, `${words} words of visible text.`);
  }
  if (words >= CONTENT_WARN_WORDS) {
    return outcome(
      "warn",
      60,
      `Only ${words} words of visible text (below ${CONTENT_OK_WORDS}) — ` +
        "thin pages struggle to rank for anything competitive.",
      1,
    );
  }
  if (words >= CONTENT_FAIL_WORDS) {
    return outcome(
      "warn",
      40,
      `Only ${words} words of visible text — this is thin content by any ` +
        `industry bar (Screaming Frog flags under ${CONTENT_WARN_WORDS}).`,
      1,
    );
  }
  return outcome(
    "fail",
    15,
    `Only ${words} words of visible text — effectively an empty page to a search engine.`,
    1,
  );
}

export function checkImageAltPresence(ev: PageEvidence): CheckOutcome {
  const count = ev.imageCount;
  const missing = ev.imagesMissingAlt;
  if (
    count === null ||
    count === undefined ||
    missing === null ||
    missing === undefined
  ) {
    return outcome(
      "n_a",
      null,
      "We haven't listed this page's images yet.",
      0,
      null,
      RECAPTURE_PAGE,
    );
  }
  if (count === 0) return outcome("n_a", null, "No images on this page.");
  if (missing === 0) {
    return outcome("pass", 100, `All ${count} images carry alt text.`);
  }
  const ratio = missing / count;
  const score = clampScore(pythonRound(95 * (1 - ratio)));
  const status: CheckStatus =
    ratio >= IMAGE_ALT_FAIL_RATIO || missing >= IMAGE_ALT_FAIL_COUNT
      ? "fail"
      : "warn";
  return outcome(
    status,
    score,
    `${missing} of ${count} images have no alt text — invisible to image ` +
      "search and screen readers.",
    missing,
  );
}

// --- Indexability ----------------------------------------------------------

export function checkMetaRobotsConflicts(ev: PageEvidence): CheckOutcome {
  const robots = (ev.metaRobots ?? "").toLowerCase();
  const tokens = new Set(
    robots
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean),
  );
  if ((ev.noindex === null || ev.noindex === undefined) && !robots) {
    return outcome("pass", 100, "No robots directives — indexable by default.");
  }
  if (tokens.has("index") && tokens.has("noindex")) {
    return outcome(
      "fail",
      20,
      `Conflicting robots directives ("${ev.metaRobots}") — index and ` +
        "noindex together leave the outcome to the crawler's mood.",
      1,
    );
  }
  if (ev.noindex) {
    return outcome(
      "fail",
      10,
      "Page is noindexed — it can never rank. If that is intentional, " +
        "suppress this finding; if not, this silently removes the page from Google.",
      1,
      { meta_robots: ev.metaRobots ?? null },
    );
  }
  if (ev.nofollow) {
    return outcome(
      "warn",
      55,
      "Page is nofollowed — its internal links pass no signals onward.",
      1,
      { meta_robots: ev.metaRobots ?? null },
    );
  }
  return outcome(
    "pass",
    100,
    robots
      ? `Robots directives are clean ("${ev.metaRobots}").`
      : "Robots directives are clean.",
  );
}

export function checkCanonicalPresence(ev: PageEvidence): CheckOutcome {
  const canonical = ev.canonicalUrl;
  if (!canonical) {
    return outcome(
      "warn",
      50,
      "No rel=canonical — parameter/scheme/host variants of this URL can " +
        "compete with it in the index.",
      1,
    );
  }
  if (!canonical.startsWith("http://") && !canonical.startsWith("https://")) {
    return outcome(
      "warn",
      45,
      `rel=canonical is not an absolute URL ("${sliceCodePoints(canonical, 120)}") — ` +
        "relative canonicals are error-prone and best made absolute.",
      1,
    );
  }
  return outcome(
    "pass",
    100,
    `rel=canonical present: ${sliceCodePoints(canonical, 160)}`,
  );
}

export function checkCanonicalConflicts(ev: PageEvidence): CheckOutcome {
  const canonical = ev.canonicalUrl;
  if (
    !canonical ||
    (!canonical.startsWith("http://") && !canonical.startsWith("https://"))
  ) {
    return outcome(
      "n_a",
      null,
      "This page has no full canonical link, so there is nothing to check.",
    );
  }
  if (ev.canonicalMatches === true) {
    return outcome("pass", 100, "Canonical is self-referential — no conflict.");
  }
  if (ev.canonicalMatches === null || ev.canonicalMatches === undefined) {
    return outcome(
      "n_a",
      null,
      "We haven't checked where this page's canonical link points yet.",
      0,
      null,
      RECAPTURE_PAGE,
    );
  }
  if (registrableHost(canonical) !== registrableHost(ev.url)) {
    return outcome(
      "fail",
      25,
      `Canonical points at a DIFFERENT site (${sliceCodePoints(canonical, 160)}) — this page ` +
        "donates all its equity off-domain. Verify that is deliberate.",
      1,
      { canonical_url: canonical },
    );
  }
  if (ev.noindex) {
    return outcome(
      "fail",
      20,
      "Page is noindexed AND canonicalized to another URL — two conflicting " +
        "de-indexing signals; Google ignores canonicals on noindexed pages.",
      1,
      { canonical_url: canonical },
    );
  }
  return outcome(
    "warn",
    55,
    `Page is canonicalized to another URL (${sliceCodePoints(canonical, 160)}) — fine when ` +
      "this is a deliberate duplicate, a leak when it is not.",
    1,
    { canonical_url: canonical },
  );
}

// --- Transport -------------------------------------------------------------
//
// Status and redirects are split into FOUR checks, not two, because the
// `web.analysis_item` catalogue models them as four separate items
// (`broken_page_4xx`, `server_error_5xx`, `redirect_chain`, `redirect_loop`)
// with different weights and severity bands — a 5xx is a 3.0-weight outage, a
// 4xx is a dead end, and a loop is categorically worse than a long chain. One
// combined check could only ever be recorded under one of those keys, so the
// other verdicts would be computed and thrown away.

export function checkBrokenPage4xx(ev: PageEvidence): CheckOutcome {
  const status = ev.httpStatus;
  if (status === null || status === undefined) {
    return outcome(
      "n_a",
      null,
      "We haven't recorded what this page's server answered yet.",
      0,
      null,
      RECAPTURE_PAGE,
    );
  }
  if (status >= 400 && status < 500) {
    return outcome(
      "fail",
      10,
      `The page returns HTTP ${status} — it is a dead end; every link ` +
        "pointing here is wasted.",
      1,
      { http_status: status },
    );
  }
  return outcome("pass", 100, `HTTP ${status} — not a client error.`);
}

export function checkServerError5xx(ev: PageEvidence): CheckOutcome {
  const status = ev.httpStatus;
  if (status === null || status === undefined) {
    return outcome(
      "n_a",
      null,
      "We haven't recorded what this page's server answered yet.",
      0,
      null,
      RECAPTURE_PAGE,
    );
  }
  // 0 is the crawler's "no response at all" (timeout / connection refused),
  // which the catalogue item scores together with 5xx.
  if (status === 0) {
    return outcome(
      "fail",
      5,
      "The server never responded (timeout or connection failure) — the page " +
        "is unreachable for users and crawlers alike.",
      1,
      { http_status: status },
    );
  }
  if (status >= 500 && status < 600) {
    return outcome(
      "fail",
      5,
      `The server returned HTTP ${status} — the page is broken for users and ` +
        "will be dropped from the index if it persists.",
      1,
      { http_status: status },
    );
  }
  return outcome("pass", 100, `HTTP ${status} — not a server error.`);
}

export function checkRedirectChain(ev: PageEvidence): CheckOutcome {
  const chain = ev.redirectChain ?? [];
  const status = ev.httpStatus;
  if (status !== null && status !== undefined && status >= 300 && status < 400) {
    return outcome(
      "warn",
      60,
      `The URL answers with HTTP ${status} rather than serving content ` +
        "directly — link to the destination instead.",
      1,
      { http_status: status },
    );
  }
  if (chain.length === 0) {
    return outcome(
      "pass",
      100,
      "No redirects — the URL serves content directly.",
    );
  }
  if (chain.length > REDIRECT_CHAIN_MAX_HOPS) {
    return outcome(
      "warn",
      45,
      `${chain.length - 1} redirect hops before this page resolves (limit is ` +
        `${REDIRECT_CHAIN_MAX_HOPS - 1}) — every hop wastes crawl budget and ` +
        "leaks link equity.",
      chain.length - 1,
      { redirect_chain: sampleUrls(chainUrls(ev)) },
    );
  }
  return outcome(
    "pass",
    100,
    `Redirect chain is short (${Math.max(0, chain.length - 1)} hop(s)).`,
  );
}

export function checkRedirectLoop(ev: PageEvidence): CheckOutcome {
  const urlsInChain = chainUrls(ev);
  if (urlsInChain.length === 0) {
    return outcome("pass", 100, "No redirect chain to loop.");
  }
  if (new Set(urlsInChain).size !== urlsInChain.length) {
    return outcome(
      "fail",
      1,
      "The redirect chain visits the same URL twice — a redirect LOOP; " +
        "neither users nor crawlers ever arrive.",
      1,
      { redirect_chain: sampleUrls(urlsInChain) },
    );
  }
  return outcome(
    "pass",
    100,
    "Every hop in the redirect chain is a distinct URL.",
  );
}

/**
 * `rel=next`/`rel=prev` sanity. Google stopped using these as an indexing
 * signal in 2019, but they remain a discovery hint for crawlers and a
 * correctness signal for the site: a page that points `rel=next`/`rel=prev`
 * at ITSELF is a paginator bug that traps a crawler on one page of the series.
 */
export function checkPaginationMarkup(ev: PageEvidence): CheckOutcome {
  const pagination = ev.pagination ?? {};
  if (Object.keys(pagination).length === 0) {
    return outcome(
      "n_a",
      null,
      "This page is not part of a next/previous page series, so there is " +
        "nothing to check.",
    );
  }
  const rstripSlash = (value: string): string => value.replace(/\/+$/, "");
  const selfRefs = (["prev", "next"] as const).filter(
    (rel) =>
      Boolean(pagination[rel]) &&
      rstripSlash(String(pagination[rel])) === rstripSlash(ev.url),
  );
  if (selfRefs.length > 0) {
    return outcome(
      "fail",
      25,
      `rel=${selfRefs.join("/")} points at this page itself — the pagination ` +
        "series is a dead end; crawlers cannot reach the rest of it.",
      selfRefs.length,
      { pagination: { ...pagination } },
    );
  }
  const declared = (["prev", "next"] as const)
    .filter((rel) => Boolean(pagination[rel]))
    .map((rel) => `rel=${rel}`)
    .join(", ");
  return outcome(
    "pass",
    100,
    `Pagination markup is coherent (${declared}).`,
    0,
    { pagination: { ...pagination } },
  );
}

export function checkMixedContent(ev: PageEvidence): CheckOutcome {
  const resources = ev.mixedContent ?? [];
  if (resources.length === 0) {
    return outcome(
      "pass",
      100,
      "No insecure http:// resources on this page.",
    );
  }
  const n = resources.length;
  return outcome(
    "warn",
    clampScore(70 - 5 * n),
    `${n} resource(s) load over plain http:// on an https:// page — browsers ` +
      "block or warn on mixed content, and the padlock disappears.",
    n,
    { mixed_content: sampleUrls(resources) },
  );
}

/**
 * HTML DOCUMENT weight — not total page weight.
 *
 * The crawl downloads the document and reads every subresource URL out of the
 * markup, but it never fetches those subresources, so their transfer sizes do
 * not exist anywhere in the evidence. This check therefore grades the one
 * number that IS measured, and the catalogue row states the same scope. The
 * day subresource sizes are captured, both move together.
 */
export function checkPageWeight(ev: PageEvidence): CheckOutcome {
  const size = ev.responseBytes;
  if (size === null || size === undefined) {
    return outcome(
      "n_a",
      null,
      "We haven't recorded how big this page is yet.",
      0,
      null,
      RECAPTURE_PAGE,
    );
  }
  if (size <= LARGE_PAGE_BYTES) {
    return outcome(
      "pass",
      100,
      `HTML document is ${withThousands(size)} bytes.`,
    );
  }
  return outcome(
    "warn",
    40,
    `The HTML document alone is ${withThousands(size)} bytes (over ${withThousands(LARGE_PAGE_BYTES)}) — ` +
      "slow on mobile connections and expensive to crawl.",
    1,
    { bytes: size },
  );
}

/**
 * True time to first byte, graded on the row's 800 / 1800 ms bands.
 *
 * Reads `ttfbMs` ONLY. `responseTimeMs` is total elapsed — it also covers the
 * body download, so a big page on a fast server looks slow through it. A
 * snapshot captured before TTFB was measured (or by the browser transport,
 * which cannot report it) has no `ttfbMs` and answers n_a: an unknown server
 * speed is never scored, in either direction.
 */
export function checkTtfbServerResponse(ev: PageEvidence): CheckOutcome {
  const ttfb = ev.ttfbMs;
  if (ttfb === null || ttfb === undefined) {
    return outcome(
      "n_a",
      null,
      "We haven't measured this page's server response time yet.",
      0,
      null,
      RECAPTURE_PAGE,
    );
  }
  // Floor division, not rounding, in all three bands: Python rounds halves to
  // even and JavaScript rounds them up, so a rounded score would diverge from
  // the Python original on exact midpoints. Floor over non-negative integers
  // means the same thing in both languages.
  if (ttfb <= TTFB_GOOD_MS) {
    // 100 at instant, easing to 90 at the good/needs-work boundary.
    return outcome(
      "pass",
      clampScore(100 - Math.floor((10 * ttfb) / TTFB_GOOD_MS)),
      `The server sent the first byte in ${ttfb} ms — comfortably inside ` +
        `the ${TTFB_GOOD_MS} ms bar for a good server response.`,
      0,
      { ttfb_ms: ttfb },
    );
  }
  if (ttfb <= TTFB_POOR_MS) {
    // 89 down to 50 across the needs-improvement band.
    const span = TTFB_POOR_MS - TTFB_GOOD_MS;
    return outcome(
      "warn",
      clampScore(89 - Math.floor((39 * (ttfb - TTFB_GOOD_MS)) / span)),
      `The server took ${ttfb} ms to send the first byte (over ` +
        `${TTFB_GOOD_MS} ms) — every other speed metric starts late, and ` +
        "visitors feel the delay before anything appears.",
      1,
      { ttfb_ms: ttfb },
    );
  }
  return outcome(
    "fail",
    clampScore(49 - Math.floor((ttfb - TTFB_POOR_MS) / 100)),
    `The server took ${ttfb} ms to send the first byte (over ` +
      `${TTFB_POOR_MS} ms) — slow server response suppresses both rankings ` +
      "and conversions.",
    1,
    { ttfb_ms: ttfb },
  );
}

// --- Outline and depth -----------------------------------------------------

/**
 * The document outline: skipped levels and empty headings.
 *
 * A "skip" is a jump of more than one level between two CONSECUTIVE headings
 * (h2 → h4). The first heading is never a skip — a page whose outline starts
 * at h2 has a missing H1, which is checkH1Presence's verdict, not this one's;
 * counting it twice would double-charge the same defect.
 */
export function checkHeadingHierarchy(ev: PageEvidence): CheckOutcome {
  const headings = ev.headings;
  if (headings === null || headings === undefined) {
    return outcome(
      "n_a",
      null,
      "We haven't recorded this page's headings yet.",
      0,
      null,
      RECAPTURE_PAGE,
    );
  }

  const levels: number[] = [];
  let empty = 0;
  for (const item of headings) {
    const level = item?.level;
    if (typeof level !== "number" || !Number.isInteger(level)) continue;
    if (level < 1 || level > 6) continue;
    levels.push(level);
    const text = item?.text;
    if (typeof text !== "string" || !text.trim()) empty += 1;
  }

  if (levels.length === 0) {
    const words = ev.wordCount;
    if (words === null || words === undefined) {
      return outcome(
        "n_a",
        null,
        "This page has no headings, and we haven't counted its words yet — " +
          "we can't tell whether that's a problem.",
        0,
        null,
        RECAPTURE_PAGE,
      );
    }
    if (words > CONTENT_OK_WORDS) {
      return outcome(
        "warn",
        55,
        `${words} words of text and not a single heading — readers and search ` +
          "engines both navigate by headings, and this page gives them none.",
        1,
      );
    }
    return outcome(
      "pass",
      100,
      "No headings, but too little content on the page to need them.",
    );
  }

  const skips: [number, number][] = [];
  for (let i = 1; i < levels.length; i += 1) {
    if (levels[i] > levels[i - 1] + 1) skips.push([levels[i - 1], levels[i]]);
  }
  const emptyRatio = empty / levels.length;
  const detail = skips.length
    ? `${skips.length} skipped heading level(s)`
    : `${empty} heading(s) with no text`;
  const evidence = {
    heading_levels: levels.slice(0, CHECK_EVIDENCE_SAMPLE_LIMIT),
    skipped_levels: skips
      .map(([a, b]) => `h${a}->h${b}`)
      .slice(0, CHECK_EVIDENCE_SAMPLE_LIMIT),
    empty_headings: empty,
    heading_count: levels.length,
  };
  if (
    skips.length > HEADING_SKIP_FAIL_COUNT ||
    emptyRatio > HEADING_EMPTY_FAIL_RATIO
  ) {
    // The row's severity_map puts a 45 in the "low" band — a real defect to
    // fix, not a page-breaking one, so it warns rather than fails.
    return outcome(
      "warn",
      45,
      `The heading outline is broken (${detail} across ${levels.length} headings) — ` +
        "the page reads as a pile of styled text rather than a structured document.",
      skips.length + empty,
      evidence,
    );
  }
  if (skips.length || empty) {
    return outcome(
      "warn",
      70,
      `The heading outline has gaps (${detail}) — headings should step down one ` +
        "level at a time and always carry text.",
      skips.length + empty,
      evidence,
    );
  }
  return outcome(
    "pass",
    100,
    `Clean heading outline across ${levels.length} headings.`,
  );
}

/**
 * The page's own claim about what kind of page it is — schema.org `@type`
 * first, then `og:type`. Returns null when the page declares nothing we
 * recognise (a genuine "we don't know", not a default).
 */
export function declaredPageType(ev: PageEvidence): string | null {
  const declared: string[] = [];
  if (ev.schemaTypes !== null && ev.schemaTypes !== undefined) {
    for (const type of ev.schemaTypes) {
      if (typeof type === "string") declared.push(type.toLowerCase().trim());
    }
  }
  if (ev.og !== null && ev.og !== undefined) {
    const ogType = ev.og["og:type"];
    if (typeof ogType === "string" && ogType.trim()) {
      declared.push(ogType.toLowerCase().trim());
    }
  }
  if (declared.some((t) => CONTENT_DEPTH_ARTICLE_SCHEMA_TYPES.has(t)))
    return "article";
  if (declared.some((t) => CONTENT_DEPTH_COMMERCE_SCHEMA_TYPES.has(t)))
    return "commerce";
  if (declared.some((t) => CONTENT_DEPTH_UTILITY_SCHEMA_TYPES.has(t)))
    return "utility";
  return null;
}

/**
 * Content volume measured against the page's OWN declared type.
 *
 * Deliberately NOT a second thin-content verdict: checkThinContent asks an
 * absolute question with a fixed floor, this asks a relative one. When the
 * page declares no type there is no expectation to measure against, so this
 * answers `n_a` rather than restating the floor.
 */
export function checkContentDepth(ev: PageEvidence): CheckOutcome {
  const words = ev.wordCount;
  if (words === null || words === undefined) {
    return outcome(
      "n_a",
      null,
      "We haven't counted the words on this page yet.",
      0,
      null,
      RECAPTURE_PAGE,
    );
  }
  if (
    (ev.schemaTypes === null || ev.schemaTypes === undefined) &&
    (ev.og === null || ev.og === undefined)
  ) {
    return outcome(
      "n_a",
      null,
      "We haven't recorded what kind of page this is, so there's no " +
        "expectation to measure its length against.",
      0,
      null,
      RECAPTURE_PAGE,
    );
  }
  const pageType = declaredPageType(ev);
  if (pageType === null) {
    return outcome(
      "n_a",
      null,
      "This page doesn't say what kind of page it is (no schema.org type, no " +
        "og:type), so there is no per-type length expectation to hold it to. " +
        "Its raw length is covered by the thin-content check.",
    );
  }
  const evidence = { page_type: pageType, word_count: words };
  if (pageType === "utility") {
    return outcome(
      "pass",
      100,
      `This is a ${pageType} page — length is not what makes it good.`,
      0,
      evidence,
    );
  }
  if (pageType === "article") {
    if (words < CONTENT_DEPTH_ARTICLE_MIN_WORDS) {
      return outcome(
        "warn",
        55,
        `This page presents itself as an article but runs only ${words} words ` +
          `(articles that compete usually clear ${CONTENT_DEPTH_ARTICLE_MIN_WORDS}).`,
        1,
        evidence,
      );
    }
    if (words < CONTENT_DEPTH_ARTICLE_TARGET_WORDS) {
      // A PASS carrying an 80: worth knowing on a competitive topic, not a
      // defect — the row's severity_map calls this band "info".
      return outcome(
        "pass",
        80,
        `${words} words — a solid article, still short of the ` +
          `${CONTENT_DEPTH_ARTICLE_TARGET_WORDS} words the best-performing pages ` +
          "on a competitive topic tend to carry.",
        1,
        evidence,
      );
    }
    return outcome(
      "pass",
      100,
      `${words} words — full depth for an article.`,
      0,
      evidence,
    );
  }
  if (words < CONTENT_DEPTH_COMMERCE_MIN_WORDS) {
    return outcome(
      "warn",
      60,
      `Only ${words} words of unique copy on a product/listing page — there is ` +
        "nothing here for a search engine to match a buyer's question against.",
      1,
      evidence,
    );
  }
  return outcome(
    "pass",
    100,
    `${words} words — enough unique copy for a product/listing page.`,
    0,
    evidence,
  );
}

/** Visible-text bytes as a share of the HTML the server sent. */
export function checkTextHtmlRatio(ev: PageEvidence): CheckOutcome {
  const textBytes = ev.textBytes;
  const htmlBytes = ev.responseBytes;
  if (textBytes === null || textBytes === undefined || !htmlBytes) {
    return outcome(
      "n_a",
      null,
      "We haven't measured this page's text against its page size yet.",
      0,
      null,
      RECAPTURE_PAGE,
    );
  }
  const ratio = textBytes / htmlBytes;
  const evidence = {
    text_bytes: textBytes,
    html_bytes: htmlBytes,
    ratio: pyRoundTo(ratio, 4),
  };
  const percent = `${pyFixed(ratio * 100, 1)}%`;
  if (ratio < TEXT_HTML_RATIO_FAIL) {
    return outcome(
      "warn",
      50,
      `Only ${percent} of this page is readable text (${withThousands(textBytes)} of ` +
        `${withThousands(htmlBytes)} bytes) — either the markup is enormously bloated or the ` +
        "real content only appears after JavaScript runs.",
      1,
      evidence,
    );
  }
  if (ratio < TEXT_HTML_RATIO_WARN) {
    // A PASS carrying a 75 — the row's own logic is "advisory signal; only
    // extreme values matter", and its severity_map calls this band "info".
    return outcome(
      "pass",
      75,
      `${percent} of the page is readable text — low, though not unusual for a ` +
        "component-heavy template.",
      1,
      evidence,
    );
  }
  return outcome(
    "pass",
    100,
    `${percent} of the page is readable text.`,
    0,
    evidence,
  );
}

// --- Images & media --------------------------------------------------------
//
// All five read the per-<img> inventory. Two of them are bounded by what the
// crawl captures today and SAY SO in their own reasoning rather than passing
// on unverified images: `broken_images` needs a per-image HTTP status nothing
// writes yet, and `image_oversized` falls back to srcset `w` descriptors
// because transfer bytes need a fetch. Both gaps are filed in FOUND_DEFECTS.md.

/** Raster/vector format from a URL path extension, null when unknowable. */
function imageFormat(url: string | null | undefined): string | null {
  if (!url) return null;
  const path = urlSplit(url).path.toLowerCase();
  const tail = path.slice(path.lastIndexOf("/") + 1);
  if (!tail.includes(".")) return null;
  const suffix = tail.slice(tail.lastIndexOf(".") + 1);
  if (!IMAGE_EXTENSIONS.has(suffix)) return null;
  return IMAGE_FORMAT_ALIASES[suffix] ?? suffix;
}

/** The usable per-image inventory, or the `n_a` that explains its absence. */
function inventoryOrReason(
  ev: PageEvidence,
): [PageImageItem[], CheckOutcome | null] {
  if (ev.imageCount === 0) {
    return [[], outcome("n_a", null, "No images on this page.")];
  }
  const items = (ev.imageItems ?? []).filter(
    (item): item is PageImageItem => typeof item === "object" && item !== null,
  );
  if (items.length === 0) {
    return [
      [],
      outcome(
        "n_a",
        null,
        "We haven't listed this page's images yet.",
        0,
        null,
        RECAPTURE_PAGE,
      ),
    ];
  }
  return [items, null];
}

/** Names the inventory cap when the page carried more images than we kept. */
function inventoryNote(ev: PageEvidence, items: PageImageItem[]): string {
  const total = ev.imageCount;
  if (typeof total === "number" && Number.isInteger(total) && total > items.length) {
    return ` (measured over the first ${items.length} of ${total} images)`;
  }
  return "";
}

/**
 * Width/height on every <img> — the main image-driven CLS prevention.
 *
 * A CSS `aspect-ratio` reserves space just as well but is invisible to an
 * HTML-only audit, so a page styled that way scores low here. That is the
 * documented limit of the evidence, not a hidden assumption.
 */
export function checkImageDimensionAttrs(ev: PageEvidence): CheckOutcome {
  const [items, unavailable] = inventoryOrReason(ev);
  if (unavailable) return unavailable;
  const missing = items
    .filter(
      (item) =>
        item.width === null ||
        item.width === undefined ||
        item.height === null ||
        item.height === undefined,
    )
    .map((item) => item.src || "(no src)");
  const total = items.length;
  const covered = total - missing.length;
  const coverage = covered / total;
  const score = clampScore(pythonRound(100 * coverage));
  const note = inventoryNote(ev, items);
  if (coverage >= IMAGE_DIMENSION_ATTR_PASS_COVERAGE) {
    return outcome(
      "pass",
      score,
      `${covered} of ${total} images declare width and height${note}.`,
      missing.length,
      missing.length ? { missing_dimensions: sampleUrls(missing) } : null,
    );
  }
  const status: CheckStatus =
    coverage < IMAGE_DIMENSION_ATTR_FAIL_COVERAGE ? "fail" : "warn";
  return outcome(
    status,
    score,
    `${missing.length} of ${total} images declare no width/height${note} — the browser ` +
      "cannot reserve space for them, so the page jumps as they load (layout shift).",
    missing.length,
    { missing_dimensions: sampleUrls(missing) },
  );
}

/**
 * Lazy below the fold, eager above it — and never lazy on the hero.
 *
 * Viewport geometry is not captured, so "above the fold" is approximated by
 * DOM order plus the page's own featured/OG image, which IS captured and is
 * the usual LCP element.
 */
export function checkImageLazyLoading(ev: PageEvidence): CheckOutcome {
  const [items, unavailable] = inventoryOrReason(ev);
  if (unavailable) return unavailable;

  const isLazy = (item: PageImageItem): boolean =>
    String(item.loading ?? "")
      .trim()
      .toLowerCase() === "lazy";

  const aboveFold = items.filter(
    (item, index) => index < IMAGE_ABOVE_FOLD_DOM_COUNT || item.featured === true,
  );
  const belowFold = items.filter(
    (item, index) =>
      !(index < IMAGE_ABOVE_FOLD_DOM_COUNT || item.featured === true),
  );
  const note = inventoryNote(ev, items);

  const heroLazy = aboveFold
    .filter((item) => isLazy(item))
    .map((item) => item.src || "(no src)");
  if (heroLazy.length) {
    return outcome(
      "fail",
      30,
      `${heroLazy.length} image(s) at the top of the page are lazy-loaded — ` +
        "lazy-loading the hero/LCP image delays the largest paint the browser " +
        "measures and is a known Core Web Vitals killer.",
      heroLazy.length,
      { lazy_above_fold: sampleUrls(heroLazy) },
    );
  }

  const eagerBelow = belowFold
    .filter((item) => !isLazy(item))
    .map((item) => item.src || "(no src)");
  if (eagerBelow.length === 0) {
    return outcome(
      "pass",
      100,
      `Lazy-loading policy is correct in both directions across ${items.length} images${note}.`,
    );
  }
  const ratio = eagerBelow.length / belowFold.length;
  const score = ratio > IMAGE_BELOW_FOLD_EAGER_FAIL_RATIO ? 60 : 80;
  return outcome(
    "warn",
    score,
    `${eagerBelow.length} of ${belowFold.length} images below the fold load eagerly${note} — ` +
      "the browser downloads them before the visitor can possibly see them.",
    eagerBelow.length,
    { eager_below_fold: sampleUrls(eagerBelow) },
  );
}

/**
 * Share of raster images served as WebP/AVIF instead of JPEG/PNG/GIF.
 *
 * The catalogue row asks for a BYTE-weighted share. Transfer bytes are not
 * captured, so this is image-COUNT weighted and says so in its reasoning — a
 * byte-weighted number would be invented.
 */
export function checkImageModernFormat(ev: PageEvidence): CheckOutcome {
  const [items, unavailable] = inventoryOrReason(ev);
  if (unavailable) return unavailable;

  let modern = 0;
  const legacy: string[] = [];
  for (const item of items) {
    const offered = new Set(
      (item.picture_formats ?? []).map((format) => String(format).toLowerCase()),
    );
    if ([...offered].some((format) => IMAGE_MODERN_RASTER_FORMATS.has(format))) {
      modern += 1;
      continue;
    }
    const candidates = [item.src, ...(item.srcset ?? [])];
    const formats = new Set(
      candidates
        .map((url) => imageFormat(url))
        .filter((format): format is string => Boolean(format)),
    );
    if ([...formats].some((format) => IMAGE_MODERN_RASTER_FORMATS.has(format))) {
      modern += 1;
    } else if (
      [...formats].some((format) => IMAGE_LEGACY_RASTER_FORMATS.has(format))
    ) {
      legacy.push(item.src || "(no src)");
    }
  }

  const classified = modern + legacy.length;
  const note = inventoryNote(ev, items);
  if (classified === 0) {
    return outcome(
      "n_a",
      null,
      `None of this page's ${items.length} images declare a format in their URL ` +
        "(vector or extension-less CDN sources) — nothing to judge.",
    );
  }
  const coverage = modern / classified;
  const score = clampScore(pythonRound(100 * coverage));
  if (coverage >= IMAGE_MODERN_FORMAT_PASS_COVERAGE) {
    return outcome(
      "pass",
      score,
      `${modern} of ${classified} raster images are already WebP/AVIF${note}.`,
      legacy.length,
    );
  }
  const status: CheckStatus =
    coverage < IMAGE_MODERN_FORMAT_FAIL_COVERAGE ? "fail" : "warn";
  return outcome(
    status,
    score,
    `${legacy.length} of ${classified} raster images are still JPEG/PNG/GIF${note} — ` +
      "WebP or AVIF typically cuts those downloads by a quarter to a half. " +
      "(Share is image-weighted; per-image transfer bytes are not captured.)",
    legacy.length,
    { legacy_format_images: sampleUrls(legacy) },
  );
}

/**
 * Images delivered far larger than the box they are drawn into.
 *
 * The catalogue row scores this in bytes; per-image transfer bytes and decoded
 * dimensions both need a fetch the crawl never makes. The one intrinsic-size
 * fact HTML does carry is a srcset `w` descriptor, so this compares the widest
 * DECLARED candidate against the declared display width — and only for images
 * with no `sizes` attribute. No image declaring both → `n_a`, never a pass on
 * unmeasured images.
 */
export function checkImageOversized(ev: PageEvidence): CheckOutcome {
  const [items, unavailable] = inventoryOrReason(ev);
  if (unavailable) return unavailable;

  const measured: [string, number, number, number][] = [];
  for (const item of items) {
    if (item.sizes) continue;
    const display = item.width;
    const widths = (item.srcset_widths ?? []).filter(
      (width) => typeof width === "number" && Number.isInteger(width) && width > 0,
    );
    if (
      typeof display !== "number" ||
      !Number.isInteger(display) ||
      display <= 0 ||
      widths.length === 0
    ) {
      continue;
    }
    const intrinsic = Math.max(...widths);
    measured.push([
      item.src || "(no src)",
      intrinsic / display,
      intrinsic,
      display,
    ]);
  }

  if (measured.length === 0) {
    return outcome(
      "n_a",
      null,
      "No image on this page declares both a display width and an intrinsic " +
        "srcset width, and per-image bytes are not captured — nothing measurable " +
        "here without an image-fetch pass.",
    );
  }

  measured.sort((left, right) => right[1] - left[1]);
  const [worstSrc, worstRatio, worstIntrinsic, worstDisplay] = measured[0];
  const offenders = measured
    .filter(([, ratio]) => ratio > IMAGE_OVERSIZE_MINOR_RATIO)
    .map(
      ([src, , intrinsic, display]) =>
        `${src} (${intrinsic}px for a ${display}px slot)`,
    );
  if (worstRatio <= IMAGE_OVERSIZE_MINOR_RATIO) {
    return outcome(
      "pass",
      100,
      `All ${measured.length} measurable images are sized for their slot ` +
        `(worst case ${pyFixed(worstRatio, 1)}x, within retina headroom).`,
    );
  }
  const detail =
    `the worst is ${worstIntrinsic}px wide for a ${worstDisplay}px slot ` +
    `(${pyFixed(worstRatio, 1)}x): ${worstSrc}`;
  let status: CheckStatus;
  let score: number;
  if (worstRatio > IMAGE_OVERSIZE_SEVERE_RATIO) {
    status = "fail";
    score = 25;
  } else if (worstRatio > IMAGE_OVERSIZE_MAJOR_RATIO) {
    status = "warn";
    score = 50;
  } else {
    status = "warn";
    score = 80;
  }
  return outcome(
    status,
    score,
    `${offenders.length} image(s) are delivered far larger than they are displayed — ` +
      `${detail}. Visitors pay for every one of those pixels. ` +
      "(Measured from declared dimensions; transfer bytes are not captured.)",
    offenders.length,
    { oversized_images: sampleUrls(offenders) },
  );
}

/**
 * <img> sources that return 4xx/5xx.
 *
 * 🚨 CAPTURE GAP — this check cannot answer today. The crawl status-checks
 * PAGES, never sub-resources, so no `http_status` is ever written onto an
 * image inventory item and this returns `n_a` on every page. The logic below
 * is the contract the capture pass has to satisfy.
 */
export function checkBrokenImages(ev: PageEvidence): CheckOutcome {
  const [items, unavailable] = inventoryOrReason(ev);
  if (unavailable) return unavailable;
  const statuses = items
    .filter(
      (item) =>
        typeof item.http_status === "number" &&
        Number.isInteger(item.http_status),
    )
    .map(
      (item) => [item.src || "(no src)", item.http_status as number] as const,
    );
  if (statuses.length === 0) {
    return outcome(
      "n_a",
      null,
      `None of this page's ${items.length} images have been status-checked — the ` +
        "crawl fetches pages, not their images, so whether they load is unverified.",
    );
  }
  const broken = statuses
    .filter(([, status]) => status >= 400)
    .map(([src]) => src);
  if (broken.length === 0) {
    return outcome(
      "pass",
      100,
      `All ${statuses.length} status-checked images load.`,
    );
  }
  const score = broken.length >= BROKEN_IMAGE_FAIL_COUNT ? 25 : 50;
  return outcome(
    "fail",
    score,
    `${broken.length} image(s) on this page do not load — visitors see a broken ` +
      "icon where a picture should be.",
    broken.length,
    { broken_images: sampleUrls(broken) },
  );
}

// --- Redirect intent -------------------------------------------------------

/**
 * 302/307 where a 301/308 was meant.
 *
 * ⚠️ SINGLE-SESSION TIER ONLY. The catalogue row scores a 302 that survives
 * three or more crawl sessions harder than one seen once; this sweep reads
 * only the latest accepted snapshot per page, so that tier is not evaluated
 * here and this check never claims it.
 */
export function checkTemporaryRedirectUsage(ev: PageEvidence): CheckOutcome {
  const chain = ev.redirectChain ?? [];
  const status = ev.httpStatus;
  const known = chain
    .map((hop) => hop?.status)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isInteger(value),
    );
  const temporarySet = new Set(
    known.filter((code) => TEMPORARY_REDIRECT_STATUSES.has(code)),
  );
  if (
    typeof status === "number" &&
    Number.isInteger(status) &&
    TEMPORARY_REDIRECT_STATUSES.has(status)
  ) {
    temporarySet.add(status);
  }
  const temporary = [...temporarySet].sort((a, b) => a - b);

  if (temporary.length) {
    const codes = temporary.join("/");
    return outcome(
      "warn",
      65,
      `This URL redirects with a temporary ${codes} — search engines keep the ` +
        "old address and pass none of its earned authority to the destination. " +
        "A move you do not plan to undo should be a 301.",
      temporary.length,
      {
        temporary_statuses: temporary,
        redirect_chain: sampleUrls(chainUrls(ev)),
      },
    );
  }
  if (known.length) {
    const redirects = known.filter((code) => code >= 300 && code < 400);
    if (
      typeof status === "number" &&
      Number.isInteger(status) &&
      status >= 300 &&
      status < 400
    ) {
      redirects.push(status);
    }
    return outcome(
      "pass",
      100,
      redirects.length
        ? "Every redirect on the way to this page is permanent (301/308)."
        : "No redirect — the URL serves content directly.",
    );
  }
  if (chain.length || (status !== null && status !== undefined)) {
    // A chain was recorded but its hop statuses were not — older captures
    // stored URLs only. Nothing to judge; say so rather than passing.
    if (chain.length) {
      return outcome(
        "n_a",
        null,
        "We recorded this page's redirects but not the kind of redirect they " +
          "were, so we can't tell temporary from permanent.",
        0,
        null,
        RECAPTURE_PAGE,
      );
    }
    return outcome(
      "pass",
      100,
      "No redirect — the URL serves content directly.",
    );
  }
  return outcome(
    "n_a",
    null,
    "We haven't fetched this URL yet, so we don't know whether it redirects.",
    0,
    null,
    RECAPTURE_PAGE,
  );
}

/**
 * A 200 that is really an error page.
 *
 * ⚠️ Two of the catalogue row's signals need evidence this per-page check
 * cannot see (a hash match against the SITE's own 404 template, and a redirect
 * to a generic error page). Only the page-local signals are scored here.
 */
export function checkSoft404Detection(ev: PageEvidence): CheckOutcome {
  const status = ev.httpStatus;
  if (status === null || status === undefined) {
    return outcome(
      "n_a",
      null,
      "We haven't fetched this URL yet, so we don't know what it answers with.",
      0,
      null,
      RECAPTURE_PAGE,
    );
  }
  if (status !== 200) {
    return outcome(
      "pass",
      100,
      `This URL answers with HTTP ${status} — whatever it is, it is not ` +
        "pretending to be a working page.",
    );
  }
  const words = ev.wordCount;
  if (words === null || words === undefined) {
    return outcome(
      "n_a",
      null,
      "We haven't counted the words on this page yet.",
      0,
      null,
      RECAPTURE_PAGE,
    );
  }
  const phrasing = Boolean(ev.title && SOFT_404_TITLE_PATTERN.test(ev.title));
  const nearlyEmpty = words < SOFT_404_PHRASE_MAX_WORDS;
  const evidence = {
    word_count: words,
    title: ev.title ?? null,
    http_status: status,
  };

  if (phrasing && nearlyEmpty) {
    return outcome(
      "fail",
      15,
      `This page answers HTTP 200 while its title says "${ev.title}" and it ` +
        `carries only ${words} words — it is an error page in disguise. Search ` +
        "engines index it as a real page and visitors hit a dead end.",
      1,
      evidence,
    );
  }
  if (words < SOFT_404_EMPTY_MAX_WORDS) {
    return outcome(
      "warn",
      40,
      `This page answers HTTP 200 with only ${words} words — there is nothing ` +
        "here, which is what a broken or removed page usually looks like.",
      1,
      evidence,
    );
  }
  if (phrasing) {
    return outcome(
      "warn",
      70,
      "This page answers HTTP 200 but its title reads like an error page " +
        `("${ev.title}"). If the page is genuinely gone it should answer 404 or 410.`,
      1,
      evidence,
    );
  }
  if (nearlyEmpty) {
    return outcome(
      "warn",
      70,
      `This page answers HTTP 200 with only ${words} words — thin enough that a ` +
        "search engine may treat it as an error page rather than content.",
      1,
      evidence,
    );
  }
  return outcome(
    "pass",
    100,
    "This page answers HTTP 200 and serves real content.",
  );
}

/**
 * Served over HTTPS, and no HTTP duplicate left reachable.
 *
 * Two independent facts. The FIRST is free — the URL's own scheme. The SECOND
 * needs a probe of the URL's http:// variant, which the crawler does not
 * perform today; a check is pure and NEVER fetches, so without the probe this
 * answers `n_a` rather than passing on evidence nobody collected.
 */
export function checkHttpsEnforcement(ev: PageEvidence): CheckOutcome {
  const scheme = urlSplit(ev.url).scheme.toLowerCase();
  if (scheme !== "http" && scheme !== "https") {
    return outcome(
      "n_a",
      null,
      `Not an http(s) URL (${sliceCodePoints(ev.url, 120)}).`,
    );
  }
  if (scheme === "http") {
    return outcome(
      "fail",
      5,
      "This page is served over plain HTTP — browsers mark it 'Not secure', " +
        "the content can be read and rewritten in transit, and Google has " +
        "treated HTTPS as a ranking signal since 2014.",
      1,
      { scheme: "http", url: ev.url },
    );
  }

  const probe = ev.httpVariantProbe;
  const status =
    probe && typeof probe === "object" ? probe["status"] : undefined;
  if (typeof status !== "number" || !Number.isInteger(status)) {
    return outcome(
      "n_a",
      null,
      "This page is served securely. We can't yet tell whether an insecure " +
        "copy of it is also reachable — our crawler doesn't check that today.",
      0,
      { scheme: "https" },
    );
  }

  const location =
    probe && typeof probe === "object" ? probe["location"] : undefined;
  const targetScheme = location
    ? urlSplit(String(location)).scheme.toLowerCase()
    : "";
  if (status >= 200 && status < 300) {
    return outcome(
      "fail",
      30,
      `The http:// variant of this URL answers HTTP ${status} instead of ` +
        "redirecting — the page is live at two addresses, splitting its " +
        "signals and leaving an insecure copy indexable.",
      1,
      { http_variant: probe },
    );
  }
  if (status >= 300 && status < 400) {
    if (targetScheme && targetScheme !== "https") {
      return outcome(
        "fail",
        30,
        `The http:// variant redirects (HTTP ${status}) but lands on ` +
          `${targetScheme}:// — the insecure address is never left behind.`,
        1,
        { http_variant: probe },
      );
    }
    if (HTTP_VARIANT_PERMANENT_REDIRECTS.has(status)) {
      return outcome(
        "pass",
        100,
        "Served over HTTPS, and the http:// variant redirects permanently " +
          `(HTTP ${status}).`,
        0,
        { http_variant: probe },
      );
    }
    return outcome(
      "warn",
      70,
      `The http:// variant redirects with HTTP ${status} rather than a ` +
        "permanent 301/308 — a temporary redirect tells crawlers the insecure " +
        "URL is still the real one and passes signals grudgingly.",
      1,
      { http_variant: probe },
    );
  }
  // 4xx / 5xx / 0 on the http:// variant: there is no insecure duplicate to
  // consolidate. Not the textbook redirect, but nothing is reachable over HTTP.
  return outcome(
    "pass",
    100,
    `Served over HTTPS, and the http:// variant is not reachable (HTTP ${status}).`,
    0,
    { http_variant: probe },
  );
}

// --- Mobile rendering ------------------------------------------------------

/** `width=device-width, initial-scale=1` → {width: "device-width", …}. */
function parseViewport(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const part of content.split(",")) {
    const index = part.indexOf("=");
    const key = (index === -1 ? part : part.slice(0, index)).trim().toLowerCase();
    const value = index === -1 ? "" : part.slice(index + 1).trim().toLowerCase();
    if (key) parsed[key] = value;
  }
  return parsed;
}

/**
 * The single tag that decides whether a phone renders the page at all.
 *
 * Without it every mobile browser lays the page out at ~980 CSS px and then
 * shrinks it, so the site is a pinch-and-pan desktop page on a phone — which
 * is what Google's mobile-first index actually sees.
 */
export function checkViewportMeta(ev: PageEvidence): CheckOutcome {
  if (ev.headMeta === null || ev.headMeta === undefined) {
    return outcome(
      "n_a",
      null,
      "We haven't recorded this page's mobile viewport tag yet.",
      0,
      null,
      RECAPTURE_PAGE,
    );
  }
  const raw = ev.headMeta["viewport"];
  const content = typeof raw === "string" ? raw.trim() : "";
  if (!content) {
    return outcome(
      "fail",
      20,
      "This page has no viewport tag, so phones render it as a shrunken " +
        "desktop page. Google indexes the mobile version — this is the single " +
        "biggest mobile-rendering defect a page can have.",
      1,
    );
  }
  const directives = parseViewport(content);
  const width = directives["width"] ?? "";
  if (width !== "device-width") {
    return outcome(
      "fail",
      40,
      width
        ? `The viewport is fixed at "${width}" instead of the device width — ` +
            "the page cannot adapt to the screen it is on."
        : "The viewport tag never sets a width, so phones fall back to a " +
            "desktop-width layout.",
      1,
      { viewport: content },
    );
  }
  const lockouts: string[] = [];
  if (VIEWPORT_ZOOM_DISABLED_VALUES.has(directives["user-scalable"] ?? "")) {
    lockouts.push("user-scalable=no");
  }
  const rawMaxScale = directives["maximum-scale"];
  const maxScale =
    rawMaxScale !== undefined && pyFloatable(rawMaxScale)
      ? Number(rawMaxScale)
      : null;
  if (maxScale !== null && maxScale <= VIEWPORT_ZOOM_LOCK_MAX_SCALE) {
    lockouts.push(`maximum-scale=${rawMaxScale}`);
  }
  if (lockouts.length) {
    return outcome(
      "warn",
      60,
      `The viewport is responsive but blocks zoom (${lockouts.join(", ")}) — ` +
        "anyone who needs to enlarge the text cannot, which fails accessibility " +
        "guidelines and drives real visitors away.",
      lockouts.length,
      { viewport: content },
    );
  }
  return outcome("pass", 100, `Responsive viewport declared ("${content}").`);
}

/** Whether Python's `float(value)` would succeed on this string. */
function pyFloatable(value: string): boolean {
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(value.trim());
}

// --- Language --------------------------------------------------------------

/**
 * Well-formed BCP-47: language[-script][-region][-variant…][-extension…].
 * Structural only — this says the tag is SHAPED right, never that the content
 * is in that language (nothing in a crawl snapshot detects content language).
 */
const BCP47_RE =
  /^[A-Za-z]{2,3}(?:-[A-Za-z]{3}){0,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|[0-9]{3}))?(?:-(?:[0-9A-Za-z]{5,8}|[0-9][0-9A-Za-z]{3}))*(?:-[0-9A-WY-Za-wy-z](?:-[0-9A-Za-z]{2,8})+)*(?:-x(?:-[0-9A-Za-z]{1,8})+)?$/;

export function checkHtmlLangValidity(ev: PageEvidence): CheckOutcome {
  if (!ev.headCaptured) {
    return outcome(
      "n_a",
      null,
      "We haven't read this page's markup yet, so its language tag is unknown.",
      0,
      null,
      RECAPTURE_PAGE,
    );
  }
  const lang = (ev.lang ?? "").trim();
  if (!lang) {
    return outcome(
      "warn",
      55,
      "The <html> tag declares no language. Screen readers pick the wrong " +
        "voice, browsers offer the wrong translation, and search engines have " +
        "to guess which country's results this page belongs in.",
      1,
    );
  }
  if (!BCP47_RE.test(lang) || lang.toLowerCase().startsWith("x-")) {
    return outcome(
      "fail",
      45,
      `The declared language "${sliceCodePoints(lang, 60)}" is not a valid language code — ` +
        "it is ignored exactly as if it were missing. Use a standard code " +
        'such as "en" or "en-US".',
      1,
      { lang },
    );
  }
  return outcome(
    "pass",
    100,
    `Language declared as "${lang}", a valid code. (Whether the writing is ` +
      "actually in that language is not measured from a crawl.)",
  );
}

// --- Social cards ----------------------------------------------------------

function urlExtension(url: string): string {
  const path = urlSplit(url).path;
  return path.includes(".") ? path.slice(path.lastIndexOf(".") + 1).toLowerCase() : "";
}

/**
 * URL equality for canonical-vs-og:url — scheme/host case and the trailing
 * slash are noise, everything else is a real difference.
 */
function sameTarget(a: string, b: string): boolean {
  const left = urlSplit(a);
  const right = urlSplit(b);
  return (
    left.scheme.toLowerCase() === right.scheme.toLowerCase() &&
    left.netloc.toLowerCase() === right.netloc.toLowerCase() &&
    rstripSlashes(left.path || "/") === rstripSlashes(right.path || "/") &&
    left.query === right.query
  );
}

/**
 * The picture that appears when the page is shared.
 *
 * A crawl can prove the tag exists and points somewhere a share crawler can
 * fetch; it cannot prove the pixels are big enough, because that needs the
 * image itself. The reasoning says which half was measured.
 */
export function checkOgImageValidity(ev: PageEvidence): CheckOutcome {
  if (!ev.headCaptured) {
    return outcome(
      "n_a",
      null,
      "We haven't read this page's markup yet, so its share tags are unknown.",
      0,
      null,
      RECAPTURE_PAGE,
    );
  }
  const raw = ev.og?.["og:image"];
  const image = typeof raw === "string" ? raw.trim() : "";
  if (!image) {
    return outcome(
      "fail",
      45,
      "No share image (og:image) — links to this page post as a bare grey " +
        "rectangle everywhere, which collapses how often anyone clicks them.",
      1,
    );
  }
  if (!image.startsWith("http://") && !image.startsWith("https://")) {
    return outcome(
      "fail",
      45,
      `The share image is not a full web address ("${sliceCodePoints(image, 120)}"). Facebook, ` +
        "LinkedIn and X do not resolve relative paths, so no image is shown.",
      1,
      { og_image: image },
    );
  }
  const extension = urlExtension(image);
  if (extension && !OG_IMAGE_SUPPORTED_EXTENSIONS.has(extension)) {
    return outcome(
      "warn",
      55,
      `The share image is a .${extension} file, which the social networks do ` +
        `not render. Use one of: ${[...OG_IMAGE_SUPPORTED_EXTENSIONS].sort().join(", ")}.`,
      1,
      { og_image: image },
    );
  }
  return outcome(
    "pass",
    100,
    `Share image declared as a full web address (${sliceCodePoints(image, 160)}). Its pixel ` +
      "size is not measured here — that needs the image file itself.",
    0,
    { og_image: image },
  );
}

export function checkSocialMetaCompleteness(ev: PageEvidence): CheckOutcome {
  if (!ev.headCaptured) {
    return outcome(
      "n_a",
      null,
      "We haven't read this page's markup yet, so its share tags are unknown.",
      0,
      null,
      RECAPTURE_PAGE,
    );
  }
  const og = ev.og ?? {};
  const missing = SOCIAL_REQUIRED_OG_TAGS.filter((tag) => {
    const value = og[tag];
    return !(typeof value === "string" && value.trim());
  });
  const present = SOCIAL_REQUIRED_OG_TAGS.length - missing.length;
  const twitterCard = ev.twitter?.["twitter:card"];
  const hasTwitterCard =
    typeof twitterCard === "string" && Boolean(twitterCard.trim());

  const ogUrl = (og["og:url"] ?? "").trim();
  const canonical = (ev.canonicalUrl ?? "").trim();
  const conflicts = Boolean(
    ogUrl &&
      canonical &&
      (ogUrl.startsWith("http://") || ogUrl.startsWith("https://")) &&
      (canonical.startsWith("http://") || canonical.startsWith("https://")) &&
      !sameTarget(ogUrl, canonical),
  );

  let score = pythonRound((100 * present) / SOCIAL_REQUIRED_OG_TAGS.length);
  if (conflicts) score -= SOCIAL_OG_URL_CONFLICT_PENALTY;
  if (!hasTwitterCard) score -= SOCIAL_NO_TWITTER_CARD_PENALTY;
  score = clampScore(score);

  const problems: string[] = [];
  if (missing.length) problems.push(`missing ${missing.join(", ")}`);
  if (!hasTwitterCard)
    problems.push("no twitter:card, so X falls back to a small preview");
  if (conflicts) {
    problems.push(
      `og:url (${sliceCodePoints(ogUrl, 100)}) disagrees with the canonical URL ` +
        `(${sliceCodePoints(canonical, 100)}), so shares may credit the wrong page`,
    );
  }
  const evidence: Record<string, unknown> = {
    missing_og_tags: missing,
    twitter_card: hasTwitterCard ? twitterCard : null,
    og_url: ogUrl || null,
    canonical_url: canonical || null,
  };
  if (problems.length === 0) {
    return outcome(
      "pass",
      score,
      "Share preview is complete: all five Open Graph tags plus a Twitter " +
        `card ("${twitterCard}"), and og:url agrees with the canonical URL.`,
      0,
      evidence,
    );
  }
  const status: CheckStatus =
    score >= SOCIAL_META_PASS_SCORE
      ? "pass"
      : score >= SOCIAL_META_WARN_SCORE
        ? "warn"
        : "fail";
  return outcome(
    status,
    score,
    "Shares of this page will not render a full preview — " +
      problems.join("; ") +
      ".",
    missing.length + (hasTwitterCard ? 0 : 1) + (conflicts ? 1 : 0),
    evidence,
  );
}

// --- Redirects declared in the markup --------------------------------------

/**
 * A `<meta http-equiv="refresh">` standing in for an HTTP redirect.
 *
 * Only the markup half is measured: a crawl snapshot records the tag, not the
 * client-side `location =` assignments that do the same thing in JavaScript,
 * and the reasoning never implies otherwise.
 */
export function checkMetaRefreshRedirect(ev: PageEvidence): CheckOutcome {
  if (ev.headMeta === null || ev.headMeta === undefined) {
    return outcome(
      "n_a",
      null,
      "We haven't recorded this page's refresh tag yet.",
      0,
      null,
      RECAPTURE_PAGE,
    );
  }
  const raw = ev.headMeta["refresh"];
  const content = typeof raw === "string" ? raw.trim() : "";
  if (!content) {
    return outcome(
      "pass",
      100,
      "This page does not redirect itself through a meta refresh tag.",
    );
  }
  const semicolon = content.indexOf(";");
  const delayPart = semicolon === -1 ? content : content.slice(0, semicolon);
  const targetPart = semicolon === -1 ? "" : content.slice(semicolon + 1);
  const equals = targetPart.indexOf("=");
  const target =
    equals === -1
      ? ""
      : targetPart
          .slice(equals + 1)
          .trim()
          .replace(/^['"]+/, "")
          .replace(/['"]+$/, "");
  const delay = pyFloatable(delayPart) ? Number(delayPart.trim()) : 0;
  if (!target) {
    return outcome(
      "pass",
      100,
      `The page reloads itself every ${delayPart.trim() || "0"} seconds but ` +
        "does not send visitors elsewhere, so it is not standing in for a redirect.",
      0,
      { meta_refresh: content },
    );
  }
  if (delay <= META_REFRESH_INSTANT_MAX_SECONDS) {
    return outcome(
      "fail",
      35,
      `This page instantly bounces visitors to ${sliceCodePoints(target, 120)} using a meta ` +
        "refresh tag instead of a real server redirect. Search engines treat " +
        "that as a weaker, slower signal and some ignore it, so the destination " +
        "inherits little of this page's standing.",
      1,
      { meta_refresh: content, target },
    );
  }
  return outcome(
    "warn",
    50,
    `This page shows for ${delayPart.trim()} seconds and then sends visitors ` +
      `to ${sliceCodePoints(target, 120)} via a meta refresh tag. Interstitials like this waste ` +
      "the visit and are a weaker signal than a server redirect.",
    1,
    { meta_refresh: content, target },
  );
}

// --- Structured data -------------------------------------------------------

/** The normalized entity blocks the capture already produced. */
export function structuredDataBlocks(
  structuredData: Record<string, unknown>,
): Record<string, unknown>[] {
  const blocks = structuredData["blocks"];
  if (!Array.isArray(blocks)) return [];
  return blocks.filter(
    (block): block is Record<string, unknown> =>
      typeof block === "object" && block !== null && !Array.isArray(block),
  );
}

function blockTypes(block: Record<string, unknown>): string[] {
  const types = block["types"];
  if (!Array.isArray(types)) return [];
  // Microdata carries full schema.org URLs; the capture already trims those,
  // but RDFa vocabularies can still arrive prefixed.
  return types
    .filter((type) => Boolean(type))
    .map((type) => {
      const trimmed = rstripSlashes(String(type));
      return trimmed.slice(trimmed.lastIndexOf("/") + 1);
    });
}

/** The declared value for `prop`, honouring the accepted alias spellings. */
function propertyValue(node: Record<string, unknown>, prop: string): unknown {
  for (const name of SCHEMA_PROPERTY_ALIASES[prop] ?? [prop]) {
    const value = node[name];
    if (value === null || value === undefined) continue;
    if (value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value as Record<string, unknown>).length === 0
    ) {
      continue;
    }
    return value;
  }
  return null;
}

function missingProperties(
  node: Record<string, unknown>,
  props: readonly string[],
): string[] {
  return props.filter((prop) => propertyValue(node, prop) === null);
}

/** Which rich-result contract a block is claiming, if any. */
export function richResultTypeOf(types: string[]): string | null {
  for (const declared of types) {
    if (declared in RICH_RESULT_REQUIRED_PROPERTIES) return declared;
  }
  for (const declared of types) {
    if (LOCAL_BUSINESS_SUBTYPES.has(declared)) return "LocalBusiness";
  }
  return null;
}

/**
 * Parse errors and rich-result completeness, from the stored capture.
 *
 * Order is the catalogue row's, top-down: a parse error voids the whole
 * script, so it outranks any missing property.
 */
export function checkStructuredDataValidity(ev: PageEvidence): CheckOutcome {
  const payload = ev.structuredData ?? {};
  if (Object.keys(payload).length === 0) {
    return outcome(
      "n_a",
      null,
      "This page has no stored structured-data capture yet.",
      0,
      null,
      RECAPTURE_PAGE,
    );
  }

  const rawErrors = payload["parse_errors"];
  const errors = (Array.isArray(rawErrors) ? rawErrors : []).filter(
    (error): error is Record<string, unknown> =>
      typeof error === "object" && error !== null && !Array.isArray(error),
  );
  if (errors.length) {
    const rawJsonLd = payload["json_ld_raw"];
    const rawScripts = (Array.isArray(rawJsonLd) ? rawJsonLd : []).filter(
      (script): script is string => typeof script === "string",
    );
    const broken = errors
      .slice(0, STRUCTURED_DATA_EVIDENCE_LIMIT)
      .map((error) => {
        const index = error["index"];
        const snippet =
          typeof index === "number" &&
          Number.isInteger(index) &&
          index >= 0 &&
          index < rawScripts.length
            ? sliceCodePoints(rawScripts[index], MALFORMED_SCRIPT_SNIPPET_CHARS)
            : null;
        const entry: Record<string, unknown> = {
          source: error["source"] ?? null,
          message: error["message"] ?? null,
        };
        if (snippet) entry.script = snippet;
        return entry;
      });
    return outcome(
      "fail",
      30,
      `${errors.length} structured-data script(s) on this page could not be ` +
        "read at all — a search engine discards a block it cannot parse, so " +
        "every rich result this page markup was written for is void.",
      errors.length,
      { parse_errors: broken },
    );
  }

  const blocks = structuredDataBlocks(payload);
  if (blocks.length === 0) {
    return outcome(
      "n_a",
      null,
      "This page carries no structured data, so there is nothing to " +
        "validate (whether it SHOULD have some is the coverage check's job).",
    );
  }

  const missingRequired: { type: string; missing: string[] }[] = [];
  const missingRecommended: { type: string; missing: string[] }[] = [];
  const validated: string[] = [];
  for (const block of blocks) {
    const data = block["data"];
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      continue;
    }
    const node = data as Record<string, unknown>;
    const richType = richResultTypeOf(blockTypes(block));
    if (richType === null) continue;
    validated.push(richType);
    const required = missingProperties(
      node,
      RICH_RESULT_REQUIRED_PROPERTIES[richType],
    );
    if (required.length) {
      missingRequired.push({ type: richType, missing: required });
      continue;
    }
    const recommended = missingProperties(
      node,
      RICH_RESULT_RECOMMENDED_PROPERTIES[richType] ?? [],
    );
    if (recommended.length) {
      missingRecommended.push({ type: richType, missing: recommended });
    }
  }

  if (missingRequired.length) {
    const named = missingRequired
      .map((item) => `${item.type} (no ${item.missing.join(", ")})`)
      .join(", ");
    return outcome(
      "fail",
      50,
      "Structured data on this page is missing properties Google REQUIRES " +
        `for the rich result it describes: ${named}. The markup parses, but ` +
        "it cannot produce the enhanced search listing it was written for.",
      missingRequired.length,
      {
        missing_required: missingRequired.slice(
          0,
          STRUCTURED_DATA_EVIDENCE_LIMIT,
        ),
      },
    );
  }
  if (missingRecommended.length) {
    const named = missingRecommended
      .slice(0, STRUCTURED_DATA_EVIDENCE_LIMIT)
      .map((item) => `${item.type} (no ${item.missing.join(", ")})`)
      .join(", ");
    return outcome(
      "warn",
      75,
      "Structured data is valid, but recommended properties are absent: " +
        `${named}. The rich result will show, with less in it.`,
      missingRecommended.length,
      {
        missing_recommended: missingRecommended.slice(
          0,
          STRUCTURED_DATA_EVIDENCE_LIMIT,
        ),
      },
    );
  }
  if (validated.length === 0) {
    return outcome(
      "pass",
      100,
      `${blocks.length} structured-data block(s) parse cleanly. None of them ` +
        "claims a rich-result type with published property requirements.",
    );
  }
  return outcome(
    "pass",
    100,
    "Structured data parses cleanly and every rich-result type in use " +
      `(${[...new Set(validated)].sort().join(", ")}) declares its required and ` +
      "recommended properties.",
  );
}

// --- International ---------------------------------------------------------

/** A legal `hreflang` attribute value: a BCP-47 tag, or `x-default`. */
export function isValidHreflangValue(value: string): boolean {
  const tag = (value ?? "").trim();
  if (!tag) return false;
  if (tag.toLowerCase() === HREFLANG_DEFAULT_VALUE) return true;
  return BCP47_RE.test(tag) && !tag.toLowerCase().startsWith("x-");
}

/**
 * Comparison key for "is this the same page?" across annotations. Scheme and
 * fragment are dropped and the host is lowercased with `www.` folded away.
 */
export function normalizedUrlKey(url: string): string {
  const parts = urlSplit((url ?? "").trim());
  let host = parts.netloc.toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  const path = rstripSlashes(parts.path) || "/";
  return `${host}${path}` + (parts.query ? `?${parts.query}` : "");
}

/** (lang, href) pairs as captured, both non-empty strings. */
export function hreflangEntries(ev: PageEvidence): [string, string][] {
  const entries: [string, string][] = [];
  for (const item of ev.hreflang ?? []) {
    if (typeof item !== "object" || item === null) continue;
    const lang = item["lang"];
    const href = item["href"];
    if (
      typeof lang === "string" &&
      typeof href === "string" &&
      lang.trim() &&
      href.trim()
    ) {
      entries.push([lang.trim(), href.trim()]);
    }
  }
  return entries;
}

/**
 * Codes, absolute URLs, self-reference, canonical agreement, x-default.
 *
 * Rule order is the catalogue row's and is deliberate: an invalid code breaks
 * the whole cluster for every page in it, so it is reported ahead of the
 * self-reference and canonical problems that break only this page's half.
 */
export function checkHreflangValidity(ev: PageEvidence): CheckOutcome {
  const entries = hreflangEntries(ev);
  if (entries.length === 0) {
    return outcome(
      "n_a",
      null,
      "This page declares no hreflang annotations, so there is no " +
        "language cluster to validate.",
    );
  }

  const badCodes = entries
    .filter(([lang]) => !isValidHreflangValue(lang))
    .map(([lang]) => lang);
  const relative = entries
    .filter(
      ([, href]) =>
        !href.toLowerCase().startsWith("http://") &&
        !href.toLowerCase().startsWith("https://"),
    )
    .map(([, href]) => href);
  if (badCodes.length || relative.length) {
    const problems: string[] = [];
    if (badCodes.length) {
      problems.push(
        `${badCodes.length} annotation(s) use a language code that is not ` +
          `a valid language(-script)(-region) tag: ${badCodes.slice(0, 5).join(", ")}`,
      );
    }
    if (relative.length) {
      problems.push(
        `${relative.length} annotation(s) point at a relative URL — hreflang ` +
          "must always be absolute",
      );
    }
    return outcome(
      "fail",
      30,
      problems.join("; ") +
        ". Search engines drop an entire hreflang cluster that contains an " +
        "annotation they cannot resolve.",
      badCodes.length + relative.length,
      {
        invalid_codes: badCodes.slice(0, STRUCTURED_DATA_EVIDENCE_LIMIT),
        relative_urls: sampleUrls(relative),
      },
    );
  }

  const selfKey = normalizedUrlKey(ev.url);
  const selfEntry =
    entries.find(([, href]) => normalizedUrlKey(href) === selfKey) ?? null;
  if (selfEntry === null) {
    return outcome(
      "fail",
      45,
      `This page's hreflang set names ${entries.length} language version(s) but ` +
        "never names ITSELF. A cluster without a self-reference is invalid, and " +
        "search engines ignore the whole set.",
      1,
      { declared: sampleUrls(entries.map(([, href]) => href)) },
    );
  }

  const canonical = ev.canonicalUrl;
  if (
    canonical &&
    (canonical.startsWith("http://") || canonical.startsWith("https://")) &&
    normalizedUrlKey(canonical) !== normalizedUrlKey(selfEntry[1])
  ) {
    return outcome(
      "fail",
      40,
      `The hreflang self-reference (${sliceCodePoints(selfEntry[1], 120)}) and the ` +
        `rel=canonical (${sliceCodePoints(canonical, 120)}) name DIFFERENT URLs — the page ` +
        "is annotating a URL it also says is not the canonical one, and " +
        "the two signals cancel out.",
      1,
      { self_href: selfEntry[1], canonical_url: canonical },
    );
  }

  if (
    !entries.some(([lang]) => lang.toLowerCase() === HREFLANG_DEFAULT_VALUE)
  ) {
    return outcome(
      "warn",
      80,
      `The hreflang set is valid (${entries.length} version(s), self-reference ` +
        "present) but declares no x-default — visitors whose language matches " +
        "none of the declared versions get no designated fallback page.",
      1,
    );
  }
  return outcome(
    "pass",
    100,
    `Valid hreflang set: ${entries.length} version(s), all codes and URLs well ` +
      "formed, self-reference present, x-default declared.",
  );
}

// --- Lab performance (PageSpeed Insights) ----------------------------------
//
// 🚨 These checks are PURE, like every other one here: they read
// `labPerformance` and nothing else. Collection is a separate step; this half
// only scores what landed.

/** Map `value` in [low, high] onto `band`, where LOWER value scores HIGHER. */
function linearBand(
  value: number,
  low: number,
  high: number,
  band: readonly [number, number],
): number {
  const span = high - low;
  const top = band[1];
  const bottom = band[0];
  if (span <= 0) return top;
  const fraction = Math.min(Math.max((value - low) / span, 0), 1);
  return clampScore(pythonRound(top - fraction * (top - bottom)));
}

function performanceStatus(score: number): CheckStatus {
  if (score >= PERFORMANCE_PASS_SCORE) return "pass";
  return score >= PERFORMANCE_WARN_SCORE ? "warn" : "fail";
}

/**
 * The shared "is there a usable measurement?" gate. Returns `[lab, null]` when
 * a check may score, or `[null, outcome]` with the `n_a` verdict + its
 * one-click fix when it may not.
 */
function labOrReason(
  ev: PageEvidence,
): [LabPerformance | null, CheckOutcome | null] {
  const lab = ev.labPerformance;
  if (lab === null || lab === undefined) {
    return [
      null,
      outcome(
        "n_a",
        null,
        "We haven't measured this page's real-world loading speed yet. It " +
          "needs a browser to load the page and time it, which a crawl cannot do.",
        0,
        null,
        COLLECT_PAGESPEED,
      ),
    ];
  }
  if (lab.observedAt) {
    const observed = Date.parse(lab.observedAt);
    if (!Number.isNaN(observed)) {
      const ageDays = Math.floor((Date.now() - observed) / 86_400_000);
      if (ageDays > LAB_PERFORMANCE_MAX_AGE_DAYS) {
        return [
          null,
          outcome(
            "n_a",
            null,
            `The last speed measurement of this page is ${ageDays} days old — ` +
              "too old to describe the page as it is today.",
            0,
            null,
            COLLECT_PAGESPEED,
          ),
        ];
      }
    }
  }
  return [lab, null];
}

function measuredOn(lab: LabPerformance): string {
  const where = lab.strategy === "mobile" ? "on a phone" : `on ${lab.strategy}`;
  const when = lab.observedAt ? ` on ${lab.observedAt.slice(0, 10)}` : "";
  return `${where}${when}`;
}

export function checkCwvLcp(ev: PageEvidence): CheckOutcome {
  const [lab, blocked] = labOrReason(ev);
  if (blocked !== null) return blocked;
  if (lab === null) return blocked as never;
  if (lab.lcpMs === null || lab.lcpMs === undefined) {
    return outcome(
      "n_a",
      null,
      "The speed measurement for this page did not report when its main " +
        "content finished drawing.",
      0,
      null,
      COLLECT_PAGESPEED,
    );
  }
  const lcp = lab.lcpMs;
  const seconds = `${pyFixed(lcp / 1000, 1)}s`;
  let score: number;
  if (lcp <= LCP_GOOD_MS) {
    score = linearBand(lcp, 0, LCP_GOOD_MS, CWV_GOOD_BAND);
  } else if (lcp <= LCP_POOR_MS) {
    score = linearBand(lcp, LCP_GOOD_MS, LCP_POOR_MS, CWV_MID_BAND);
  } else {
    score = clampScore(
      pythonRound(CWV_POOR_CEILING - (lcp - LCP_POOR_MS) / LCP_POOR_MS_PER_POINT),
    );
  }
  const evidence = { lcp_ms: lcp, strategy: lab.strategy };
  if (score >= PERFORMANCE_PASS_SCORE) {
    return outcome(
      "pass",
      score,
      `The main content of this page appears in ${seconds} ` +
        `(${measuredOn(lab)}) — inside Google's 2.5 second target.`,
      0,
      evidence,
    );
  }
  return outcome(
    performanceStatus(score),
    score,
    `The main content of this page takes ${seconds} to appear ` +
      `(${measuredOn(lab)}). Google's target is 2.5 seconds and it treats ` +
      "anything over 4 as poor; visitors leave before a slow page finishes, " +
      "so this costs both rankings and the visits you already earned.",
    1,
    evidence,
  );
}

export function checkCwvInpTbt(ev: PageEvidence): CheckOutcome {
  const [lab, blocked] = labOrReason(ev);
  if (blocked !== null) return blocked;
  if (lab === null) return blocked as never;
  if (lab.tbtMs === null || lab.tbtMs === undefined) {
    return outcome(
      "n_a",
      null,
      "The speed measurement for this page did not report how long it " +
        "stayed unresponsive while loading.",
      0,
      null,
      COLLECT_PAGESPEED,
    );
  }
  const tbt = lab.tbtMs;
  let score: number;
  if (tbt <= TBT_GOOD_MS) {
    score = linearBand(tbt, 0, TBT_GOOD_MS, CWV_GOOD_BAND);
  } else if (tbt <= TBT_POOR_MS) {
    score = linearBand(tbt, TBT_GOOD_MS, TBT_POOR_MS, CWV_MID_BAND);
  } else {
    score = clampScore(
      pythonRound(CWV_POOR_CEILING - (tbt - TBT_POOR_MS) / TBT_POOR_MS_PER_POINT),
    );
  }
  const evidence = { tbt_ms: tbt, strategy: lab.strategy };
  if (score >= PERFORMANCE_PASS_SCORE) {
    return outcome(
      "pass",
      score,
      "While loading, this page ignores taps and clicks for only " +
        `${pythonRound(tbt)}ms (${measuredOn(lab)}) — comfortably responsive.`,
      0,
      evidence,
    );
  }
  return outcome(
    performanceStatus(score),
    score,
    `While loading, this page is busy running scripts for ${pythonRound(tbt)}ms ` +
      `(${measuredOn(lab)}) and cannot react to taps or clicks during that ` +
      "time. Visitors read that as broken and tap again, and Google measures " +
      "it directly as a ranking signal. The usual cause is too much JavaScript " +
      "running before the page is usable.",
    1,
    evidence,
  );
}

export function checkCwvCls(ev: PageEvidence): CheckOutcome {
  const [lab, blocked] = labOrReason(ev);
  if (blocked !== null) return blocked;
  if (lab === null) return blocked as never;
  if (lab.cls === null || lab.cls === undefined) {
    return outcome(
      "n_a",
      null,
      "The speed measurement for this page did not report how much its " +
        "layout moved while loading.",
      0,
      null,
      COLLECT_PAGESPEED,
    );
  }
  const cls = lab.cls;
  let score: number;
  if (cls <= CLS_GOOD) {
    score = linearBand(cls, 0, CLS_GOOD, CWV_GOOD_BAND);
  } else if (cls <= CLS_POOR) {
    score = linearBand(cls, CLS_GOOD, CLS_POOR, CWV_MID_BAND);
  } else {
    score = clampScore(
      pythonRound(CWV_POOR_CEILING - (cls - CLS_POOR) * CLS_POOR_PENALTY_PER_UNIT),
    );
  }
  const evidence = { cls, strategy: lab.strategy };
  if (score >= PERFORMANCE_PASS_SCORE) {
    return outcome(
      "pass",
      score,
      `This page holds still as it loads (layout shift ${pyFixed(cls, 3)}, ` +
        `${measuredOn(lab)}) — under Google's 0.1 limit.`,
      0,
      evidence,
    );
  }
  return outcome(
    performanceStatus(score),
    score,
    "Content on this page jumps around while it loads (layout shift " +
      `${pyFixed(cls, 3)}, ${measuredOn(lab)}; Google's limit is 0.1). That is the ` +
      "effect where someone goes to tap one thing and hits another because an " +
      "image or advert pushed the page down. It is usually fixed by giving " +
      "images and embeds a declared width and height.",
    1,
    evidence,
  );
}

export function checkAssetDelivery(ev: PageEvidence): CheckOutcome {
  const [lab, blocked] = labOrReason(ev);
  if (blocked !== null) return blocked;
  if (lab === null) return blocked as never;
  if (lab.deliverySavingsMs === null || lab.deliverySavingsMs === undefined) {
    return outcome(
      "n_a",
      null,
      "The stored speed measurement for this page predates the delivery " +
        "breakdown, so there is nothing to add up yet.",
      0,
      null,
      COLLECT_PAGESPEED,
    );
  }
  const savings = lab.deliverySavingsMs;
  let score: number;
  if (savings <= DELIVERY_SAVINGS_GOOD_MS) {
    score = linearBand(savings, 0, DELIVERY_SAVINGS_GOOD_MS, CWV_GOOD_BAND);
  } else if (savings <= DELIVERY_SAVINGS_POOR_MS) {
    score = linearBand(
      savings,
      DELIVERY_SAVINGS_GOOD_MS,
      DELIVERY_SAVINGS_POOR_MS,
      CWV_MID_BAND,
    );
  } else {
    score = Math.max(
      DELIVERY_POOR_FLOOR,
      clampScore(
        pythonRound(
          CWV_POOR_CEILING -
            (savings - DELIVERY_SAVINGS_POOR_MS) / DELIVERY_POOR_MS_PER_POINT,
        ),
      ),
    );
  }
  const offenders = Object.entries(lab.deliveryAudits ?? {})
    .filter(([, ms]) => ms > 0)
    .sort((left, right) => right[1] - left[1]);
  const evidence = {
    total_savings_ms: savings,
    audits: Object.fromEntries(offenders.slice(0, CHECK_EVIDENCE_SAMPLE_LIMIT)),
    strategy: lab.strategy,
  };
  if (score >= PERFORMANCE_PASS_SCORE) {
    return outcome(
      "pass",
      score,
      `How this page's files are delivered costs it about ${pythonRound(savings)}ms ` +
        `(${measuredOn(lab)}) — nothing worth chasing.`,
      0,
      evidence,
    );
  }
  const names = offenders
    .slice(0, 4)
    .map(([name]) => DELIVERY_AUDIT_LABELS[name] ?? name)
    .join(", ");
  return outcome(
    performanceStatus(score),
    score,
    `About ${pyFixed(pythonRound(savings) / 1000, 1)}s of this page's load is spent on how ` +
      "its files are delivered rather than on the page itself " +
      `(${measuredOn(lab)}). The measured causes: ${names}. These are the ` +
      "standard build-and-hosting fixes — nothing about your content has to change.",
    offenders.length,
    evidence,
  );
}

export function checkCachingPolicy(ev: PageEvidence): CheckOutcome {
  const [lab, blocked] = labOrReason(ev);
  if (blocked !== null) return blocked;
  if (lab === null) return blocked as never;
  if (lab.cacheStaticBytes === null || lab.cacheStaticBytes === undefined) {
    return outcome(
      "n_a",
      null,
      "The stored speed measurement for this page predates the caching " +
        "breakdown, so its cache lifetimes are unknown.",
      0,
      null,
      COLLECT_PAGESPEED,
    );
  }
  const staticBytes = lab.cacheStaticBytes;
  if (staticBytes < CACHE_NEGLIGIBLE_STATIC_BYTES) {
    return outcome(
      "pass",
      100,
      "This page loads almost no images, styling or code files of its own, " +
        "so how long they are cached makes no practical difference.",
      0,
      { static_bytes: staticBytes },
    );
  }
  const shortTtl = (lab.cacheShortTtlResources ?? []).filter((resource) => {
    const lifetime = labNumber(resource?.cache_lifetime_ms);
    return lifetime !== null && lifetime < CACHE_WELL_CACHED_MIN_MS;
  });
  const poorlyCachedBytes = Math.min(
    staticBytes,
    shortTtl.reduce(
      (total, resource) => total + (labNumber(resource?.total_bytes) ?? 0),
      0,
    ),
  );
  const wellCachedBytes = Math.max(0, staticBytes - poorlyCachedBytes);
  const score = clampScore(pythonRound((100 * wellCachedBytes) / staticBytes));
  const evidence = {
    static_bytes: staticBytes,
    well_cached_bytes: wellCachedBytes,
    short_ttl_urls: sampleUrls(
      shortTtl.map((resource) => String(resource?.url ?? "")),
    ),
    strategy: lab.strategy,
  };
  if (score >= PERFORMANCE_PASS_SCORE) {
    return outcome(
      "pass",
      score,
      "Visitors' browsers keep this page's images, styling and code for a " +
        "month or more, so returning visits reuse them instead of " +
        "re-downloading them.",
      0,
      evidence,
    );
  }
  const share = pythonRound((100 * poorlyCachedBytes) / staticBytes);
  return outcome(
    performanceStatus(score),
    score,
    `${share}% of this page's images, styling and code are told to expire in ` +
      `under a month (${shortTtl.length} files, ${measuredOn(lab)}), so people ` +
      "who come back download them all over again — a slower repeat visit for " +
      "no benefit. It is a one-line hosting setting, not a content change.",
    shortTtl.length,
    evidence,
  );
}

/** Python `_lab_number` — a real number, or null (booleans are not numbers). */
function labNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

/**
 * The canonical registry. A per-page SEO check exists HERE (and in its Python
 * twin) or it does not exist — no surface may re-derive one of these verdicts
 * from raw evidence in a component.
 */
export const PAGE_CHECKS: Record<
  string,
  (ev: PageEvidence) => CheckOutcome
> = {
  title_presence: checkTitlePresence,
  title_length: checkTitleLength,
  meta_description_presence: checkMetaDescriptionPresence,
  meta_description_length: checkMetaDescriptionLength,
  h1_presence: checkH1Presence,
  heading_hierarchy: checkHeadingHierarchy,
  thin_content: checkThinContent,
  content_depth: checkContentDepth,
  text_html_ratio: checkTextHtmlRatio,
  image_alt_presence: checkImageAltPresence,
  image_dimension_attrs: checkImageDimensionAttrs,
  image_lazy_loading: checkImageLazyLoading,
  image_modern_format: checkImageModernFormat,
  image_oversized: checkImageOversized,
  broken_images: checkBrokenImages,
  viewport_meta: checkViewportMeta,
  html_lang_validity: checkHtmlLangValidity,
  og_image_validity: checkOgImageValidity,
  social_meta_completeness: checkSocialMetaCompleteness,
  meta_robots_conflicts: checkMetaRobotsConflicts,
  canonical_presence: checkCanonicalPresence,
  canonical_conflicts: checkCanonicalConflicts,
  meta_refresh_redirect: checkMetaRefreshRedirect,
  broken_page_4xx: checkBrokenPage4xx,
  server_error_5xx: checkServerError5xx,
  redirect_chain: checkRedirectChain,
  redirect_loop: checkRedirectLoop,
  temporary_redirect_usage: checkTemporaryRedirectUsage,
  soft_404_detection: checkSoft404Detection,
  pagination_markup: checkPaginationMarkup,
  mixed_content: checkMixedContent,
  https_enforcement: checkHttpsEnforcement,
  page_weight: checkPageWeight,
  ttfb_server_response: checkTtfbServerResponse,
  structured_data_validity: checkStructuredDataValidity,
  hreflang_validity: checkHreflangValidity,
  cwv_lcp: checkCwvLcp,
  cwv_inp_tbt: checkCwvInpTbt,
  cwv_cls: checkCwvCls,
  asset_delivery: checkAssetDelivery,
  caching_policy: checkCachingPolicy,
};

/** Every per-page check, keyed by check name. */
export function runPageChecks(ev: PageEvidence): Record<string, CheckOutcome> {
  const results: Record<string, CheckOutcome> = {};
  for (const [key, check] of Object.entries(PAGE_CHECKS)) {
    results[key] = check(ev);
  }
  return results;
}
