// features/scraper/failure/scrapeFailure.ts
//
// THE AUDIENCE LAW FOR SCRAPE FAILURES.
//
// A scrape fails loudly — that part was always right. What was wrong (W44,
// 2026-09-12) is WHO the loudness was written for: a non-technical Expert
// adding a link to a Rulebook was shown
//
//   "https://…: bad_status — failed at useScraperApi.scrapeUrl →
//    validate_result_success (see errorDiagnostics)"
//
// plus a JavaScript stack and a "Diagnostics JSON" block, as the PRIMARY body
// of the screen. She has no idea what a stage is, cannot act on a stack, and
// the one thing she could have done — paste the text in instead — was not
// offered anywhere.
//
// So every scrape failure now has TWO faces, produced in ONE place:
//   - `title` + `remedy`: plain words and a next action, for the person.
//   - `developerMessage` + `diagnostics`: for support, behind a disclosure.
//
// The hook derives this for EVERY operation and every failure kind, so a new
// consumer gets plain words by default and cannot re-invent the engineer
// string as a user-facing body. Guard:
// features/scraper/failure/__tests__/scrapeFailure.test.ts.

import type { ScraperApiErrorDiagnostics } from "@/features/scraper/hooks/useScraperApi";

/** What actually went wrong, in the terms a REMEDY depends on. */
export type ScrapeFailureKind =
  | "site_refused" // the target answered with an error status (bad_status, 4xx/5xx)
  | "blocked" // bot wall, paywall, login wall, captcha
  | "timeout" // the read took too long
  | "empty" // we reached the page and it carried no readable text
  | "bad_address" // the URL does not resolve / is not a page we can reach
  | "unknown"; // anything else — still plain words, never a stack

export interface ScrapeFailure {
  kind: ScrapeFailureKind;
  /** One plain sentence naming what happened. No stage, hook, or stack. */
  title: string;
  /** One plain sentence naming what the person can do instead. */
  remedy: string;
  /** The target's HTTP status when we know it — "(it answered with 403)". */
  httpStatus: number | null;
  /** The engineer string. Support audience only — never a primary body. */
  developerMessage: string;
  /** The full structured report. Support audience only. */
  diagnostics: ScraperApiErrorDiagnostics | null;
}

/**
 * The engineer suffix `useScraperApi` appends to every failure message. It is
 * exactly what must never reach a person, so it is stripped here rather than
 * at each call site.
 */
const DEVELOPER_SUFFIX = / — failed at useScraperApi\.[^\s]+ → [^\s]+ \(see errorDiagnostics\)\s*$/;

/** The leading "https://…: " label the row validator prepends. */
function stripUrlLabel(message: string): string {
  return message.replace(/^https?:\/\/\S+:\s*/i, "").trim();
}

function readHttpStatus(
  diagnostics: ScraperApiErrorDiagnostics | null,
): number | null {
  const received = diagnostics?.received;
  if (!received) return null;
  // The target's own status, when the backend reported it on the failed row —
  // our transport returned 200 with a `success: false` row, so `received.http`
  // is OUR status and is only a fallback when it is itself an error.
  const row = received.firstResult;
  if (row) {
    for (const key of ["status_code", "http_status", "status"]) {
      const value = row[key];
      if (typeof value === "number" && value >= 100 && value < 600) return value;
      if (typeof value === "string" && /^\d{3}$/.test(value)) return Number(value);
    }
  }
  const transport = received.http?.status;
  if (typeof transport === "number" && transport >= 400) return transport;
  return null;
}

function classifyKind(message: string, httpStatus: number | null): ScrapeFailureKind {
  const m = message.toLowerCase();
  if (/timed? ?out|timeout|etimedout|deadline/.test(m)) return "timeout";
  if (/captcha|cloudflare|bot (?:wall|detection|check)|paywall|login wall|robots\.txt|forbidden|access denied/.test(m))
    return "blocked";
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429) return "blocked";
  if (/enotfound|eai_again|dns|invalid url|could not resolve|name not resolved|econnrefused/.test(m))
    return "bad_address";
  if (/no results|empty|no readable text|no content|0 characters/.test(m)) return "empty";
  if (/bad_status|bad status|http error|status \d{3}|\b[45]\d{2}\b/.test(m)) return "site_refused";
  if (httpStatus !== null && httpStatus >= 400) return "site_refused";
  return "unknown";
}

const PASTE_REMEDY = "Paste the text in instead, or try another link.";

function plainWords(
  kind: ScrapeFailureKind,
  httpStatus: number | null,
): { title: string; remedy: string } {
  const answered =
    httpStatus === null ? "an error" : `an error (${httpStatus})`;
  switch (kind) {
    case "site_refused":
      return {
        title: `This site would not let us read the page (it answered with ${answered}).`,
        remedy: PASTE_REMEDY,
      };
    case "blocked":
      return {
        title:
          httpStatus === null
            ? "This site blocks automated readers, so we could not open the page."
            : `This site blocks automated readers, so we could not open the page (it answered with ${httpStatus}).`,
        remedy: PASTE_REMEDY,
      };
    case "timeout":
      return {
        title: "The page took too long to answer, so we stopped waiting.",
        remedy: "Try the link again in a moment, or paste the text in instead.",
      };
    case "empty":
      return {
        title: "We opened the page but found no readable text on it.",
        remedy:
          "Some pages build their text in the browser. Paste the text in instead, or try another link.",
      };
    case "bad_address":
      return {
        title: "We could not reach that address at all.",
        remedy: "Check the link for a typo, or paste the text in instead.",
      };
    default:
      return {
        title: "We could not read that page.",
        remedy: PASTE_REMEDY,
      };
  }
}

/**
 * Turn whatever `useScraperApi` is holding after a failure into the two-faced
 * report above. Safe to call on every render — it is pure string work.
 */
export function classifyScrapeFailure(input: {
  /** The hook's `error` string, or the thrown value. */
  error: unknown;
  diagnostics: ScraperApiErrorDiagnostics | null;
}): ScrapeFailure {
  const raw =
    typeof input.error === "string"
      ? input.error
      : input.error instanceof Error
        ? input.error.message
        : (input.diagnostics?.message ?? "");
  const developerMessage = raw.trim() || "Scraping failed";
  const base = stripUrlLabel(developerMessage.replace(DEVELOPER_SUFFIX, ""));
  const httpStatus = readHttpStatus(input.diagnostics);
  const kind = classifyKind(base || developerMessage, httpStatus);
  const { title, remedy } = plainWords(kind, httpStatus);
  return {
    kind,
    title,
    remedy,
    httpStatus,
    developerMessage,
    diagnostics: input.diagnostics,
  };
}
