/**
 * Finding remedies — RENDERING only. The remedies themselves live in the
 * database, one per check, on `web.analysis_item.remedy` (OSP-24, aidream
 * migration 20260927210000_lane_f_analysis_item_remedy.sql). The finding page
 * and the in-app agent's `seo_site.findings` read that ONE copy; nothing here
 * holds remedy content, so a remedy is changed in the database, never here.
 *
 * Stored shape (templates are filled per finding):
 *   { kind: "ai", title, summary, ask, apply_to_page }
 *   { kind: "manual", title, summary, instruction, where }
 * `{page}` → the page's url, else its path, else "this page";
 * `{page_url}` → the url, else "the page's full https:// address";
 * `{page_href}` → the url, else "https://your-page-address".
 *
 * THE FALLBACK LAW: a check with no stored remedy (a new server check, or one
 * nobody has written a remedy for yet) still renders completely — the
 * analyzer's own `metadata.reasoning` sentence, plus the GENERIC remedy below,
 * a real action that opens the SEO agent with the finding briefed. It
 * announces itself: `isUnknownKey` is true and the card says so.
 * `resolveFindingRemedy` never returns null and never throws.
 *
 * NO DEAD ENDS: every remedy is either `ai` (a real one-click action: the SEO
 * Page Analyzer mandate with a prepared brief) or `manual` (an explicit,
 * copy-able instruction naming WHAT to change and WHERE).
 */

import type { AssistAction } from "@/features/assists/types";
import type { Json } from "@/types/database.types";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";

/** The mandate the AI remedies resolve at click time (rebindable from the
 * admin mandates console, no deploy). Declared server-side in aidream
 * `services/seo/keyword_agents.py::PAGE_ANALYZER_MANDATE`. */
export const SEO_PAGE_ANALYZER_MANDATE = MANDATE_KEYS.seo__page_analyzer;
const SEO_AGENT_NAME = "SEO Page Analyzer";

/** What `web.analysis_item.remedy` holds, once validated. */
export type StoredRemedy =
  | {
      kind: "ai";
      title: string;
      summary: string;
      ask: string;
      apply_to_page: boolean;
    }
  | {
      kind: "manual";
      title: string;
      summary: string;
      instruction: string;
      where: string;
    };

/** Everything a remedy may use. Only `itemKey` is required — every other
 * field is genuinely optional in the data, and a remedy must degrade. */
export interface FindingRemedyContext {
  itemKey: string;
  /** `web.analysis_item.label` when the catalogue knows this key. */
  itemLabel?: string | null;
  itemDescription?: string | null;
  /** `web.analysis_item.remedy` — raw from the row; validated here. */
  remedy?: Json | null;
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
  /** True when the check has no stored remedy (the generic one is shown). */
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

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Validate the raw column value. A malformed row is treated as "no remedy"
 * (the generic one, announced) — never a crash, never a blank card. */
export function parseStoredRemedy(raw: Json | null | undefined): StoredRemedy | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, Json | undefined>;
  if (!nonEmpty(r.title) || !nonEmpty(r.summary)) return null;
  if (r.kind === "ai" && nonEmpty(r.ask)) {
    return {
      kind: "ai",
      title: r.title,
      summary: r.summary,
      ask: r.ask,
      apply_to_page: r.apply_to_page === true,
    };
  }
  if (r.kind === "manual" && nonEmpty(r.instruction) && nonEmpty(r.where)) {
    return {
      kind: "manual",
      title: r.title,
      summary: r.summary,
      instruction: r.instruction,
      where: r.where,
    };
  }
  return null;
}

/** Fill `{page}`, `{page_url}` and `{page_href}` for this finding. */
export function fillRemedyTemplate(text: string, ctx: FindingRemedyContext): string {
  return text
    .replaceAll("{page_url}", ctx.pageUrl ?? "the page's full https:// address")
    .replaceAll("{page_href}", ctx.pageUrl ?? "https://your-page-address")
    .replaceAll("{page}", pageLabel(ctx));
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

/**
 * The one extra sentence that makes a metadata remedy end-to-end REAL instead
 * of advice: the `seo` tool's meta actions render through the SERP renderer
 * (`renderers/seo-shared/SerpToolInline`), which carries `ApplyMetaToPage` —
 * one click writes the winner to the page's desired metadata. It describes
 * this screen's capability, so it stays here; the stored remedy says only
 * `apply_to_page: true`.
 */
const APPLY_ASK =
  "Run the `seo` tool (`check_titles` / `check_descriptions`, whichever this finding is about) on this page's URL with your proposals so they render as SERP previews — from there the user can apply the winner to the page in one click.";

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
      mandateKey: SEO_PAGE_ANALYZER_MANDATE,
      agentName: SEO_AGENT_NAME,
      draftText: brief(ctx, ask),
    },
  };
}

function renderStored(stored: StoredRemedy, ctx: FindingRemedyContext): FindingRemedy {
  if (stored.kind === "manual") {
    return {
      kind: "manual",
      title: stored.title,
      summary: stored.summary,
      instruction: fillRemedyTemplate(stored.instruction, ctx),
      where: fillRemedyTemplate(stored.where, ctx),
    };
  }
  const ask = fillRemedyTemplate(stored.ask, ctx);
  return aiRemedy(
    ctx,
    stored.title,
    stored.summary,
    stored.apply_to_page ? `${ask} ${APPLY_ASK}` : ask,
  );
}

/**
 * The GENERIC remedy — what a check with no stored remedy gets. A REAL action,
 * not a placeholder: the SEO agent is opened with the finding fully briefed.
 */
function genericRemedy(ctx: FindingRemedyContext): AiRemedy {
  return aiRemedy(
    ctx,
    "Ask the SEO agent what to do",
    "No fix is written down for this check yet, so the SEO agent takes this finding and the page, explains it in plain words, and tells you the specific change to make.",
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
 * remedy read from `web.analysis_item.remedy`. NEVER returns null and never
 * throws — a check with no stored remedy is a normal, fully-rendered outcome.
 */
export function resolveFindingRemedy(
  ctx: FindingRemedyContext,
): ResolvedFinding {
  const stored = parseStoredRemedy(ctx.remedy);
  const { explanation, fromServer } = explain(ctx);
  return {
    title: ctx.itemLabel?.trim() || humanizeItemKey(ctx.itemKey),
    explanation,
    explanationFromServer: fromServer,
    isUnknownKey: stored === null,
    remedy: stored ? renderStored(stored, ctx) : genericRemedy(ctx),
  };
}
