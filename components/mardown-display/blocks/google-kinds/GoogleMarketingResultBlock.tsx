"use client";

/**
 * `google_marketing_result` — the ONE component for the `google_marketing` tool.
 *
 * THE READER'S QUESTION: *can I trust this number, and what is it a number OF?*
 *
 * Six read-only reads share one kind: Search Console, GA4, Tag Manager, the
 * tracking-health verdict, a YouTube channel and YouTube Analytics. Nothing here
 * writes, so the risk is not damage — it is a partial window read as a total.
 * Every branch keys on the shape that arrived (`verdict` + `checks` for the
 * health read, `containers` for Tag Manager, `data` for everything else) and the
 * honesty fields the tool already states are printed ON the number rather than
 * under it:
 *
 *  - `source` — our own stored facts, or a bounded live call to Google. A GA4
 *    figure read from our tables and one read live are different claims.
 *  - `bounds` — the window, the cap and the profile that were ASKED for.
 *  - `returned_count` + `count_unit` — 412 *rows*, not 412 of something.
 *  - `truncated` / `completeness` — capped, complete within the window, or
 *    UNKNOWABLE. `null` is a declared state and never reads as complete.
 *  - `freshness` — Search Console runs about three days behind; a number without
 *    that is a wrong answer with a right value.
 *
 * The rows themselves go to `ResultValue`, the platform's honest value viewer —
 * never a second table implementation.
 *
 * See `google-result-shared.tsx` for the route contract and the wrapper law.
 */

import React from "react";
import {
  Activity,
  BarChart3,
  CircleHelp,
  CircleSlash,
  CheckCircle2,
  Search,
  Tags,
  MonitorPlay,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ResultValue } from "@/features/tool-call-visualization/result-fields/ResultValue";
import { humanizeKey } from "@/features/tool-call-visualization/result-fields/shape";
import {
  ChipRow,
  LeftoverFields,
  MetaStrip,
  RawRegion,
  Section,
  StateChip,
  StillArriving,
  isRecord,
  printsResidualFacts,
  readBool,
  readKindValue,
  readText,
  type ResultKindBlockProps,
} from "../result-kinds/result-kind-shared";
import {
  Bounds,
  CountedFact,
  NothingWasWritten,
  RecordDoor,
  ServerSentence,
  TruncationChip,
  UnmodelledPreviews,
  WRITE_CLAIM_KEYS,
  emptyReadSentence,
  hasStatedBounds,
  hasSubstantiveContent,
  noteWithoutRepeatedClaim,
  readBlock,
  readRows,
  readWriteClaim,
} from "./google-result-shared";

/**
 * This block has NO dedicated preview section — its six actions are all
 * read-only, so a `would_*` key here is always unmodelled and always goes
 * through `UnmodelledPreviews`'s generic section (empty on purpose).
 */
const DEDICATED_PREVIEW_KEYS: readonly string[] = [];

/**
 * Exported so the render-leg test suite can census it directly — a promoted
 * key with no matching print statement is the exact defect this list guards
 * against (a `site_id` sat here, unprinted, until F-86).
 *
 * 🚨 `WRITE_CLAIM_KEYS` is spread in because `NothingWasWritten` (below)
 * already consumes that whole family — `dry_run`, `awaiting_approval`,
 * `appended`, `written`, `created`, `imported`, `sent`, `approval` — through
 * `readWriteClaim`/`readBlock(value.approval)`. Left off this list, those keys
 * fell through to `MetaStrip`/`LeftoverFields` as raw leftovers: the same fact
 * shown twice, once summarized and once unlabeled (F-95). The dynamically-named
 * `would_*` keys are NOT here (they cannot be enumerated statically); the
 * render call sites below merge `claim.previewKeys` into `omit` instead.
 */
export const PROMOTED = [
  ...WRITE_CLAIM_KEYS,
  "action",
  "source",
  "google_account",
  "site_id",
  "channel_id",
  "bounds",
  "returned_count",
  "count_unit",
  "truncated",
  "completeness",
  "limit_note",
  "freshness",
  "note",
  "data",
  "verdict",
  "checks",
  "has_ga4",
  "has_conversion_tag",
  "has_consent",
  "caveats",
  "containers",
] as const;

function headIcon(action: string) {
  if (action.includes("search_console")) return Search;
  if (action.includes("analytics") && action.includes("youtube")) return Activity;
  if (action.includes("youtube")) return MonitorPlay;
  if (action.includes("analytics")) return BarChart3;
  if (action.includes("tag_manager")) return Tags;
  if (action.includes("tracking_health")) return Activity;
  return BarChart3;
}

/** pass / fail / unknown — three states, three tones, no fourth reading. */
function checkTone(verdict: string | null): "good" | "bad" | "warn" {
  if (verdict === "pass") return "good";
  if (verdict === "fail") return "bad";
  return "warn";
}

function CheckIcon({ verdict }: { verdict: string | null }) {
  if (verdict === "pass") return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />;
  if (verdict === "fail") return <CircleSlash className="h-3.5 w-3.5 shrink-0 text-destructive" />;
  return <CircleHelp className="h-3.5 w-3.5 shrink-0 text-warning" />;
}

/**
 * The tracking-health read: a plain-English verdict, then each graded check with
 * the evidence behind it AND the remedy beside it — a flagged problem never
 * arrives without what to do about it.
 */
const HealthChecks: React.FC<{ checks: Record<string, unknown>[] }> = ({ checks }) => (
  <Section label="What was checked">
    <div className="divide-y divide-border rounded-md border border-border">
      {checks.map((check, index) => {
        const verdict = readText(check.verdict);
        const id = readText(check.id);
        return (
          <div key={id ?? index} className="min-w-0 space-y-0.5 px-2.5 py-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5">
              <CheckIcon verdict={verdict} />
              <span className="min-w-0 break-words text-xs font-medium text-foreground">
                {id ? humanizeKey(id) : "Check"}
              </span>
              {verdict ? <StateChip label={verdict} tone={checkTone(verdict)} /> : null}
            </div>
            <ServerSentence text={check.evidence} />
            {readText(check.remedy) ? (
              <p className="text-xs leading-relaxed text-foreground">
                {readText(check.remedy)}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  </Section>
);

const GoogleMarketingResultBlock: React.FC<ResultKindBlockProps> = ({
  content,
  metadata,
  className,
}) => {
  const { value, recovered, streaming } = readKindValue(content, metadata);
  if (!recovered || !isRecord(value)) {
    return <RawRegion content={content} className={className} />;
  }

  const action = readText(value.action) ?? "";
  const source = readText(value.source);
  const account = readText(value.google_account);
  const verdict = readText(value.verdict);
  const checks = readRows(value.checks);
  const containers = readRows(value.containers);
  const caveats = Array.isArray(value.caveats)
    ? (value.caveats.filter((item) => typeof item === "string") as string[])
    : null;

  /**
   * Six READ-ONLY reads share this kind, so a write claim should never arrive
   * here at all — which is exactly why the claim is read. The truth table lives
   * once (`google-result-shared.tsx`) and BOTH Google blocks consult it, so a
   * `would_*` or a completed-write marker that turns up on a marketing payload
   * leads with "nothing was written" instead of passing silently through the
   * leftovers (V-22, NEW-8).
   */
  const claim = readWriteClaim(value);

  const HeadIcon = headIcon(action);
  const booleans: Array<{ key: string; label: string }> = [
    { key: "has_ga4", label: "GA4 tag" },
    { key: "has_conversion_tag", label: "conversion tag" },
    { key: "has_consent", label: "consent mode" },
  ];
  const hasHealthFlag = booleans.some(({ key }) => readBool(value[key]) !== null);
  /**
   * 🚨 THE FOOTER'S "NO ROWS" SENTENCE IS FOR A TRULY EMPTY READ ONLY (F-95,
   * extended by BUGBOT MEDIUM on `eb641aee`). The tracking-health read
   * (`tracking_health`) never carries `data`, so `checks: []`/absent plus a
   * real `verdict` and/or `has_*` flags used to still fall through this
   * predicate and print "no rows" under a real answer (F-95). Then
   * `UnmodelledPreviews` started printing a `would_*` change even when NONE
   * of the read-branch fields below arrived, and the same predicate missed
   * that too — the card showed a preview and claimed nothing came back in
   * the same breath. `hasSubstantiveContent` (`google-result-shared.tsx`)
   * is the ONE place both halves live: this block's own read-branch union,
   * OR any write claim at all (`claim.state !== "none"`).
   */
  /** Merged into `omit` at every render site below: see {@link WRITE_CLAIM_KEYS}. */
  const omitKeys = [...PROMOTED, ...claim.previewKeys];
  const windowStated = hasStatedBounds(value.bounds);
  const substantiveRead = hasSubstantiveContent(
    claim,
    Boolean(verdict) || hasHealthFlag || Boolean(checks) || Boolean(containers) ||
      (value.data !== undefined && value.data !== null),
    // THE SAME PASS THE STRIP BELOW PRINTS FROM (F-104, V-23 NEW-5): a payload
    // whose whole answer arrives as unpromoted keys — `sessions: 1234`,
    // `users: 900` — is not an empty read, and the footer may not say it is.
    printsResidualFacts(value, omitKeys),
  );

  return (
    <div className={cn("my-2 min-w-0 space-y-2.5", className)}>
      {streaming ? <StillArriving /> : null}

      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <HeadIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          {action ? humanizeKey(action) : "Google marketing read"}
        </span>
        {/* A NUMBER ALWAYS CARRIES ITS WINDOW: `bounds` is optional on this kind,
            so an absent window is announced ON the count (V-22, NEW-10). */}
        <CountedFact
          count={value.returned_count}
          unit={value.count_unit}
          windowStated={windowStated}
        />
      </div>

      <NothingWasWritten claim={claim} approval={readBlock(value.approval)} />
      <UnmodelledPreviews value={value} claim={claim} rendered={DEDICATED_PREVIEW_KEYS} />

      <ChipRow>
        {/* WHERE the number came from. Never implied. */}
        {source === "persisted" ? (
          <StateChip label="our stored facts — no call to Google" tone="neutral" />
        ) : source === "live_google" ? (
          <StateChip label="read live from Google" tone="accent" />
        ) : source ? (
          <StateChip label={source} />
        ) : null}
        <TruncationChip truncated={value.truncated} completeness={value.completeness} />
        {account ? <StateChip label={account} /> : null}
        {/* WHICH site the numbers belong to — the reader's first question about
            any number here. A site is a Record; the door opens it in AI Matrx,
            and renders nothing when the type has no wired opener, leaving the
            plain chip as the honest fallback.

            🚨 THE TOKEN IS `web_site`, NOT `site` (F-87). `web_site` is the
            platform's registered name for `web.site` — in the entity registry,
            in the item-presentation registry and on every marketing surface.
            F-86 shipped this door spelled `site`, a token nothing resolves, so
            it rendered absent forever: a door written against a name the
            platform does not know is indistinguishable from no door at all. */}
        {readText(value.site_id) ? (
          <span className="inline-flex shrink-0 items-center gap-0.5">
            <StateChip label={`site ${readText(value.site_id)}`} />
            <RecordDoor type="web_site" id={value.site_id} fallbackLabel="site" />
          </span>
        ) : null}
        {readText(value.channel_id) ? (
          <StateChip label={`channel ${readText(value.channel_id)}`} />
        ) : null}
      </ChipRow>

      <Bounds bounds={value.bounds} />

      {/* How old the numbers are — the field that makes a Search Console answer
          honest rather than merely correct. */}
      {readText(value.freshness) ? (
        <p className="text-xs font-medium text-foreground">{readText(value.freshness)}</p>
      ) : null}

      {verdict ? (
        <Section label="The verdict">
          <p className="text-sm leading-relaxed text-foreground">{verdict}</p>
        </Section>
      ) : null}

      {hasHealthFlag ? (
        <ChipRow>
          {booleans.map(({ key, label }) => {
            const flag = readBool(value[key]);
            if (flag === null) return null;
            return (
              <StateChip
                key={key}
                label={flag ? label : `no ${label}`}
                tone={flag ? "good" : "bad"}
                icon={<CheckIcon verdict={flag ? "pass" : "fail"} />}
              />
            );
          })}
        </ChipRow>
      ) : null}

      {checks ? <HealthChecks checks={checks} /> : null}

      {/* What the read could NOT see. A caveat is part of the answer. */}
      {caveats && caveats.length > 0 ? (
        <Section label="What this read could not see">
          <ul className="space-y-0.5">
            {caveats.map((caveat) => (
              <li key={caveat} className="text-xs leading-relaxed text-warning">
                {caveat}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {containers ? (
        <Section label="Containers">
          <ResultValue value={containers} density="full" />
        </Section>
      ) : null}

      {value.data !== undefined && value.data !== null ? (
        <Section label="The numbers">
          <ResultValue value={value.data} density="full" embedMedia={false} />
        </Section>
      ) : null}

      {/* The lead already states the write claim when there is one, so the
          server's own note never repeats it (F-104, the F-98 class). */}
      <ServerSentence text={noteWithoutRepeatedClaim(value.note, claim)} />
      <ServerSentence text={value.limit_note} />

      {/* NEVER "for the window above" when no window was stated (V-23 NEW-5). */}
      {!substantiveRead ? (
        <p className="text-xs text-muted-foreground">{emptyReadSentence(windowStated)}</p>
      ) : null}

      <MetaStrip value={value} omit={omitKeys} />
      <LeftoverFields value={value} omit={omitKeys} />
    </div>
  );
};

export default GoogleMarketingResultBlock;
