/**
 * Finding remedies — the ONE place that turns a raw SEO analysis finding into
 * something a NON-TECHNICAL person can act on.
 *
 * THE FALLBACK LAW (the reason this file exists): the server's canonical check
 * registry (`aidream` `matrx_scraper/seo_audit.py::PAGE_CHECKS`) grows on the
 * server's schedule, not ours. A new `item_key` must render CORRECTLY here
 * with no frontend change — never blank, never filtered out, never a crash.
 * Every result the analyzer writes carries a human-readable
 * `metadata.reasoning` sentence (`web_crawl/analysis.py`), and that sentence
 * is the guaranteed floor: an unknown key renders its DB-supplied reasoning,
 * category, severity, and page, plus the GENERIC remedy below — which is a
 * real, working action (it opens the SEO agent with the finding briefed).
 *
 * So `resolveFindingRemedy` NEVER returns null and never throws.
 *
 * NO DEAD ENDS (/Users/armanisadeghi/code/common-docs/policies/no-dead-ends.md):
 * "every problem you can detect ships with its one-click fix." Every remedy
 * here is either
 *   - `ai`     — a real one-click action: open the SEO Page Analyzer agent
 *                (slot `seo.page_analyzer`, the same slot the GSC insights
 *                producer uses) with a prepared brief, or
 *   - `manual` — an explicit, copy-able instruction naming exactly WHAT to
 *                change and WHERE, for things only the site owner can do on
 *                their own site (a robots tag, a server response, a redirect).
 * A remedy with neither is a defect. We never invent a button that does
 * nothing — an honest instruction beats a fake fix.
 *
 * Pure module (no React, no I/O) so it is unit-testable — see
 * `__tests__/finding-remedies.test.ts`, which proves the unknown-key path.
 */

import type { AssistAction } from "@/features/assists/types";

/** The agent slot the AI remedies resolve at click time (repinnable from the
 * admin slots console, no deploy). Declared server-side in aidream
 * `services/seo/keyword_agents.py::PAGE_ANALYZER_SLOT`. */
export const SEO_PAGE_ANALYZER_SLOT = "seo.page_analyzer";
const SEO_AGENT_NAME = "SEO Page Analyzer";

/** Everything a remedy may use. Only `itemKey` is required — every other
 * field is genuinely optional in the data, and a remedy must degrade. */
export interface FindingRemedyContext {
  itemKey: string;
  /** `web.analysis_item.label` when the catalogue knows this key. */
  itemLabel?: string | null;
  itemDescription?: string | null;
  category?: string | null;
  subcategory?: string | null;
  severity?: string | null;
  /** `metadata.reasoning` from the latest analysis result — the floor. */
  reasoning?: string | null;
  pageUrl?: string | null;
  pagePath?: string | null;
  siteDomain?: string | null;
}

export interface AiRemedy {
  kind: "ai";
  /** The chip/button title the user reads. */
  title: string;
  /** One plain sentence: what the AI will actually do. */
  summary: string;
  action: AssistAction;
}

export interface ManualRemedy {
  kind: "manual";
  title: string;
  summary: string;
  /** The copy-able instruction. Plain words, names the exact change. */
  instruction: string;
  /** Where the user makes it, in their words ("your site's page settings"). */
  where: string;
}

export type FindingRemedy = AiRemedy | ManualRemedy;

export interface ResolvedFinding {
  /** Human title — catalogue label, else the key de-snake-cased. */
  title: string;
  /** Plain-language "what's wrong" — reasoning first, catalogue description
   * next, and only then a generic sentence built from the key itself. */
  explanation: string;
  /** True when `explanation` came from the DB's `metadata.reasoning`. */
  explanationFromServer: boolean;
  /** True when no remedy is registered for this key (new/unknown check). */
  isUnknownKey: boolean;
  remedy: FindingRemedy;
}

/** `redirect_chain` → "Redirect chain". Never returns an empty string. */
export function humanizeItemKey(itemKey: string): string {
  const cleaned = itemKey.replace(/[_.-]+/g, " ").trim();
  if (!cleaned) return "Unnamed check";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** The page this finding is about, in words a person can act on. */
function pageLabel(ctx: FindingRemedyContext): string {
  return ctx.pageUrl || ctx.pagePath || "this page";
}

function severityWords(severity: string | null | undefined): string {
  switch (severity) {
    case "critical":
      return "critical";
    case "high":
      return "serious";
    case "med":
      return "moderate";
    case "low":
      return "minor";
    case "info":
      return "informational";
    default:
      return "flagged";
  }
}

/** The brief every AI remedy sends. Always carries the server's reasoning —
 * the agent gets the same sentence the user reads. */
function brief(ctx: FindingRemedyContext, ask: string): string {
  const lines = [
    `SEO finding on ${ctx.siteDomain ?? "this site"} — ${
      ctx.itemLabel || humanizeItemKey(ctx.itemKey)
    }.`,
    "",
    `Page: ${pageLabel(ctx)}`,
    `Check: ${ctx.itemKey}`,
  ];
  if (ctx.category) {
    lines.push(
      `Area: ${ctx.category}${ctx.subcategory ? ` / ${ctx.subcategory}` : ""}`,
    );
  }
  lines.push(`Severity: ${ctx.severity ?? "unspecified"}`);
  if (ctx.reasoning) lines.push("", `What the analyzer found: ${ctx.reasoning}`);
  lines.push("", ask);
  return lines.join("\n");
}

function aiRemedy(
  ctx: FindingRemedyContext,
  title: string,
  summary: string,
  ask: string,
): AiRemedy {
  return {
    kind: "ai",
    title,
    summary,
    action: {
      kind: "launch_agent",
      slotKey: SEO_PAGE_ANALYZER_SLOT,
      agentName: SEO_AGENT_NAME,
      draftText: brief(ctx, ask),
    },
  };
}

/**
 * The one extra sentence that makes a metadata remedy end-to-end REAL instead
 * of advice: the `seo` tool's meta actions render through the SERP renderer
 * (`renderers/seo-shared/SerpToolInline`), which carries `ApplyMetaToPage` —
 * one click writes the winner to the page's desired metadata via
 * `updatePageIntent`. Chat proposals that never reach the page were the
 * dead end this closes.
 */
const APPLY_ASK =
  "Run the `seo` tool (`check_titles` / `check_descriptions`, whichever this finding is about) on this page's URL with your proposals so they render as SERP previews — from there the user can apply the winner to the page in one click.";

type RemedyBuilder = (ctx: FindingRemedyContext) => FindingRemedy;

/**
 * Registered remedies, keyed by the server's `item_key`. A key missing here
 * is NOT an error — it falls through to the generic remedy below, which is
 * why a new server check needs no frontend change.
 */
const REMEDIES: Record<string, RemedyBuilder> = {
  // ── Titles + snippets: the AI genuinely can write these ──────────────────
  title_presence: (ctx) =>
    aiRemedy(
      ctx,
      "Write a title for this page",
      "The SEO agent reads the page and drafts a headline for search results. You approve it before anything changes.",
      `This page has no title for search results. Read the page, then propose 3 title options (50-60 characters) with a one-line reason for each, and say which you recommend. ${APPLY_ASK}`,
    ),
  title_length: (ctx) =>
    aiRemedy(
      ctx,
      "Rewrite the title to fit",
      "The SEO agent rewrites the headline so search engines show all of it. You approve it before anything changes.",
      `This page's search-results title is the wrong length. Propose 3 replacement titles (50-60 characters) that keep the same meaning and lead with what people search for, and say which you recommend. ${APPLY_ASK}`,
    ),
  meta_description_presence: (ctx) =>
    aiRemedy(
      ctx,
      "Write the search snippet",
      "The SEO agent drafts the two-line description shown under your link in Google. You approve it before anything changes.",
      `This page has no meta description, so Google invents the snippet. Read the page and propose 3 meta descriptions (140-155 characters) that give someone a reason to click, and say which you recommend. ${APPLY_ASK}`,
    ),
  meta_description_length: (ctx) =>
    aiRemedy(
      ctx,
      "Rewrite the search snippet",
      "The SEO agent rewrites the description so it fits the space Google gives it. You approve it before anything changes.",
      `This page's meta description is the wrong length. Propose 3 replacements (140-155 characters) that keep the promise of the page and read naturally, and say which you recommend. ${APPLY_ASK}`,
    ),

  // ── Content: the AI drafts, the owner publishes ──────────────────────────
  h1_presence: (ctx) =>
    aiRemedy(
      ctx,
      "Draft the page heading",
      "The SEO agent proposes the main on-page heading. You paste the one you like into your site.",
      "This page's main heading (H1) is missing or duplicated. Propose the single main heading this page should have, plus the sub-headings it should sit above, and explain the structure in one paragraph.",
    ),
  thin_content: (ctx) =>
    aiRemedy(
      ctx,
      "Plan what to add",
      "The SEO agent reads the page and lists the specific sections worth adding. You decide what to write.",
      "This page is thin — too little substance for the topic it targets. List the specific sections and questions this page should cover to genuinely serve the reader, ordered by importance, and say what a good length would be and why.",
    ),
  image_alt_presence: (ctx) =>
    aiRemedy(
      ctx,
      "Write the image descriptions",
      "The SEO agent drafts alt text for the images that are missing it. You paste them into your site.",
      "Images on this page have no alt text (the short description screen readers and search engines use). Draft alt text for each image you can identify, and explain in one line where to paste each one.",
    ),

  // ── Indexability: one-line changes only the owner can make ───────────────
  meta_robots_conflicts: (ctx) => ({
    kind: "manual",
    title: "Let search engines index this page",
    summary:
      "This page is currently telling search engines to stay away. That is a one-line change on your own site — and if you meant it, suppress this finding.",
    instruction: [
      `On ${pageLabel(ctx)}, find the page's SEO or "advanced" settings and turn OFF the "noindex" (or "discourage search engines") option, so the page can appear in search results.`,
      "",
      "If you are hands-on with the page's code, the tag to remove is:",
      '  <meta name="robots" content="noindex">',
      "",
      "If this page is meant to be hidden from search (a thank-you page, a private page), this finding is correct behavior — suppress it instead.",
    ].join("\n"),
    where: "your website's page settings (or your CMS's SEO panel)",
  }),
  canonical_presence: (ctx) => ({
    kind: "manual",
    title: "Tell search engines this is the original",
    summary:
      "This page does not declare which address is the real one, so duplicates can compete with it.",
    instruction: [
      `On ${pageLabel(ctx)}, set the "canonical URL" to this page's own address:`,
      `  ${ctx.pageUrl ?? "the page's full https:// address"}`,
      "",
      "Most site builders have this as a single field in the page's SEO settings. In raw HTML it is one line in the page's <head>:",
      `  <link rel="canonical" href="${ctx.pageUrl ?? "https://your-page-address"}">`,
    ].join("\n"),
    where: "your website's page SEO settings",
  }),
  canonical_conflicts: (ctx) => ({
    kind: "manual",
    title: "Point this page at itself",
    summary:
      "This page tells search engines that a DIFFERENT address is the real one, so this page's own ranking is being handed away.",
    instruction: [
      `On ${pageLabel(ctx)}, change the "canonical URL" field so it points at this page's own address:`,
      `  ${ctx.pageUrl ?? "the page's full https:// address"}`,
      "",
      "If it genuinely IS a duplicate of another page and you meant to point elsewhere, this finding is correct behavior — suppress it instead.",
    ].join("\n"),
    where: "your website's page SEO settings",
  }),

  // ── Transport / delivery: the owner's site or host ───────────────────────
  broken_page_4xx: (ctx) => ({
    kind: "manual",
    title: "This address is broken",
    summary:
      "Visitors and search engines asking for this address get an error page. Anything linking to it is wasted.",
    instruction: [
      // access-errors: ok — reports the HTTP 404 our crawler observed on the customer's page; that 404 is the finding.
      `${pageLabel(ctx)} returns a "not found" error.`,
      "",
      "Pick one:",
      "  1. Restore the page at this exact address, or",
      "  2. Redirect this address to the page that replaced it (a permanent / 301 redirect), or",
      "  3. If the page is gone on purpose, remove the links that still point at it.",
      "",
      "If you deliberately retired this page and are happy for it to error, suppress this finding.",
    ].join("\n"),
    where: "your website's pages list, or your host's redirect settings",
  }),
  server_error_5xx: (ctx) => ({
    kind: "manual",
    title: "The server is failing on this page",
    summary:
      "The page did not fail to be found — it failed to be built. That is a hosting or application error, and search engines drop pages that keep doing it.",
    instruction: [
      `${pageLabel(ctx)} returns a server error.`,
      "",
      "Send this to whoever runs your website or hosting:",
      `  "${pageLabel(ctx)} is returning a 5xx server error when crawled. Please check the server/application logs for this URL and fix the failure."`,
      "",
      "Re-run the analysis once it is fixed to confirm.",
    ].join("\n"),
    where: "your hosting provider or web developer",
  }),
  redirect_chain: (ctx) => ({
    kind: "manual",
    title: "Shorten the redirect hops",
    summary:
      "Reaching this page takes several hops. Every hop loses a little ranking strength and adds delay for the visitor.",
    instruction: [
      `${pageLabel(ctx)} is reached through more than one redirect in a row.`,
      "",
      "In your redirect settings, change the FIRST redirect so it points straight at the final address, and delete the middle steps. Then update any links, menus, and sitemap entries to use the final address directly.",
    ].join("\n"),
    where: "your host's or CMS's redirect settings",
  }),
  redirect_loop: (ctx) => ({
    kind: "manual",
    title: "Break the redirect loop",
    summary:
      "This address redirects back to itself, so nobody — visitor or search engine — can ever reach it.",
    instruction: [
      `${pageLabel(ctx)} redirects in a circle and never resolves.`,
      "",
      "In your redirect settings, find the rules that mention this address and remove the one that sends it back to itself (a loop is usually two rules fighting: www vs non-www, or http vs https). Keep exactly ONE rule, pointing at the final address.",
    ].join("\n"),
    where: "your host's or CMS's redirect settings",
  }),
  mixed_content: (ctx) => ({
    kind: "manual",
    title: "Load everything securely",
    summary:
      "This secure page pulls in some files over an insecure connection, which can show visitors a browser warning and block those files from loading.",
    instruction: [
      `${pageLabel(ctx)} loads some images, scripts, or styles from "http://" addresses instead of "https://".`,
      "",
      'Edit the page and change those addresses so they start with "https://" instead of "http://". If a file is only available over http://, re-upload it to your own site and link to your copy.',
    ].join("\n"),
    where: "the page's content, theme, or template",
  }),
  page_weight: (ctx) => ({
    kind: "manual",
    title: "Make the page lighter",
    summary:
      "This page is heavy to download. On a phone connection that is felt directly as a slow page, and slow pages lose both visitors and rankings.",
    instruction: [
      `${pageLabel(ctx)} is larger than it should be.`,
      "",
      "In order of payoff:",
      "  1. Re-export large images at the size they are actually displayed, and save them as WebP.",
      "  2. Remove plugins, embeds, or tracking scripts the page does not need.",
      "  3. Ask your developer to enable compression and lazy-loading of images.",
    ].join("\n"),
    where: "the page's images and your site's theme/plugin settings",
  }),
  ttfb_server_response: (ctx) => ({
    kind: "manual",
    title: "Speed up the server's first response",
    summary:
      "Your server takes a long time to start sending this page — before any image or script is even involved. That delay is added to every single visit.",
    instruction: [
      `${pageLabel(ctx)} is slow to start responding (a slow "time to first byte").`,
      "",
      "Send this to whoever runs your website or hosting:",
      `  "${pageLabel(ctx)} has a slow time-to-first-byte. Please check server-side caching, database queries, and the hosting plan/region for this site."`,
    ].join("\n"),
    where: "your hosting provider or web developer",
  }),
  pagination_markup: (ctx) => ({
    kind: "manual",
    title: "Link the parts of this series",
    summary:
      "This page is part of a numbered series, but it does not tell search engines which page comes before and after it.",
    instruction: [
      `${pageLabel(ctx)} looks like page 2+ of a series but declares its neighbours incorrectly.`,
      "",
      'Ask your developer to add the "previous" and "next" link tags to each page in the series:',
      '  <link rel="prev" href="…page 1 address…">',
      '  <link rel="next" href="…page 3 address…">',
      "",
      "Many site builders do this automatically once pagination is switched on in the theme settings.",
    ].join("\n"),
    where: "your site's theme or template settings",
  }),
};

/**
 * The GENERIC remedy — what an unknown or newly-added `item_key` gets. It is
 * a REAL action, not a placeholder: the SEO agent is opened with the finding
 * fully briefed (including the server's own reasoning sentence), which is
 * exactly what an expert would do with a check they have not seen before.
 */
function genericRemedy(ctx: FindingRemedyContext): AiRemedy {
  return aiRemedy(
    ctx,
    "Ask the SEO agent what to do",
    "The SEO agent takes this finding and the page, explains it in plain words, and tells you the specific change to make.",
    "Explain this finding to a smart person who is NOT an SEO: what it means, whether it actually matters for this page, and the exact change to make (and where to make it). If it does not matter here, say so plainly.",
  );
}

function explain(ctx: FindingRemedyContext): {
  explanation: string;
  fromServer: boolean;
} {
  const reasoning = ctx.reasoning?.trim();
  if (reasoning) return { explanation: reasoning, fromServer: true };
  const description = ctx.itemDescription?.trim();
  if (description) return { explanation: description, fromServer: false };
  return {
    explanation: `${humanizeItemKey(ctx.itemKey)} was flagged as a ${severityWords(
      ctx.severity,
    )} issue on ${pageLabel(ctx)}${
      ctx.category
        ? ` in the ${ctx.category}${ctx.subcategory ? ` / ${ctx.subcategory}` : ""} area`
        : ""
    }. Re-run the analysis to capture the analyzer's explanation for it.`,
    fromServer: false,
  };
}

/**
 * Resolve a finding to its human title, plain-language explanation, and a
 * remedy. NEVER returns null and never throws — an unknown key is a normal,
 * fully-rendered outcome, not an error.
 */
export function resolveFindingRemedy(
  ctx: FindingRemedyContext,
): ResolvedFinding {
  const builder = REMEDIES[ctx.itemKey];
  const { explanation, fromServer } = explain(ctx);
  return {
    title: ctx.itemLabel?.trim() || humanizeItemKey(ctx.itemKey),
    explanation,
    explanationFromServer: fromServer,
    isUnknownKey: !builder,
    remedy: builder ? builder(ctx) : genericRemedy(ctx),
  };
}

/** Item keys with a registered remedy — for tests and admin/coverage views.
 * NOT a gate: nothing filters findings by membership in this list. */
export function registeredRemedyKeys(): string[] {
  return Object.keys(REMEDIES).sort();
}

/**
 * Item keys whose REGISTERED remedy is a real one-click AI action — the exact
 * set the findings assist producer is allowed to chip.
 *
 * Derived from `REMEDIES`, never hand-maintained: registering a new `ai`
 * remedy above is all it takes for that check to start producing chips, and a
 * `manual` remedy (a robots tag, a redirect, a hosting fix) can never leak
 * into a chip whose button would have nothing to run. The generic fallback is
 * deliberately excluded — "ask the agent what this means" is a fine card on a
 * finding the user opened, and noise as an unsolicited chip.
 *
 * Pure: the builders take a context but touch nothing but it, so a probe
 * context is enough to read a remedy's kind.
 */
export function aiRemedyItemKeys(): string[] {
  return Object.entries(REMEDIES)
    .filter(([itemKey, build]) => build({ itemKey }).kind === "ai")
    .map(([itemKey]) => itemKey)
    .sort();
}

/**
 * Checks whose AI remedy ends in a write the user can apply to the page in
 * one click (`ApplyMetaToPage` → `updatePageIntent`). Ranked first by the
 * assist producer — cheapest, safest, most complete path we own today.
 */
export const APPLIABLE_METADATA_KEYS: readonly string[] = [
  "title_presence",
  "title_length",
  "meta_description_presence",
  "meta_description_length",
];
