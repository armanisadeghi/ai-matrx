"use client";

/**
 * `newsworthiness_verdict` (NEWS-ENGINE-SPEC §6.15) — the newsworthiness check:
 * a 1–10 score and band, the recommendation, the closest anchor, each scored
 * dimension, the caps that fired, and what would fix it. The ONE renderer.
 */

import { humanize, isRecord, num, records, str, strings } from "../run-document";
import { FactRow, KindCard, Pill, SmartLink } from "./shared";

export function NewsworthinessVerdictView({
  value,
  title,
}: {
  value: Record<string, unknown>;
  title?: string;
}) {
  const score = typeof value.score === "number" ? value.score : null;
  const band = str(value.newsworthiness_band);
  const anchor = isRecord(value.closest_anchor) ? value.closest_anchor : null;
  const dimensions = records(value.dimensions);
  const caps = records(value.caps_fired);
  const evidence = records(value.evidence_used);
  return (
    <KindCard
      testId="newsworthiness-verdict"
      title={
        <>
          Newsworthiness{title ? ` — ${title}` : ""}:{" "}
          {score == null ? "blocked" : `${score}/10`} {band ? `· ${humanize(band)}` : ""}
        </>
      }
      subtitle={
        [str(value.recommendation) && `Recommendation: ${str(value.recommendation)}`, str(value.coverage_outlook)]
          .filter(Boolean)
          .join(" · ") || undefined
      }
    >
      {str(value.summary) ? <p className="text-sm text-foreground">{str(value.summary)}</p> : null}
      {anchor ? (
        <div className="flex flex-col gap-0.5">
          <FactRow label="Closest anchor">{str(anchor.example)}</FactRow>
          {str(anchor.why_not_higher) ? <FactRow label="Why not higher">{str(anchor.why_not_higher)}</FactRow> : null}
          {str(anchor.why_not_lower) ? <FactRow label="Why not lower">{str(anchor.why_not_lower)}</FactRow> : null}
        </div>
      ) : null}
      {dimensions.length ? (
        <ul className="flex flex-col gap-0.5">
          {dimensions.map((d) => (
            <li key={str(d.name)} className="flex flex-wrap gap-x-2 text-xs">
              <span className="font-medium text-foreground">{humanize(str(d.name))}</span>
              <span className="text-muted-foreground">
                {num(d.score)} × weight {num(d.weight)} — {str(d.reason)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {caps.length ? (
        <div className="flex flex-wrap gap-1.5">
          {caps.map((c, i) => (
            <Pill key={i} tone="warn" title={str(c.why)}>
              cap {num(c.cap)}: {str(c.trigger)}
            </Pill>
          ))}
        </div>
      ) : null}
      {str(value.kill_switch) ? <p className="text-xs text-destructive">Kill switch: {str(value.kill_switch)}</p> : null}
      {strings(value.weak_spots).length ? (
        <FactRow label="Weak spots">{strings(value.weak_spots).join("; ")}</FactRow>
      ) : null}
      {strings(value.fixes).length ? <FactRow label="Fixes">{strings(value.fixes).join("; ")}</FactRow> : null}
      {evidence.length ? (
        <ul className="flex flex-col gap-0.5 text-xs">
          {evidence.map((e, i) => (
            <li key={i}>
              {str(e.url) ? <SmartLink href={str(e.url)}>{str(e.title) || str(e.url)}</SmartLink> : str(e.title)}{" "}
              <span className="text-muted-foreground">{str(e.date)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {strings(value.evidence_gaps).length ? (
        <FactRow label="Evidence gaps">{strings(value.evidence_gaps).join("; ")}</FactRow>
      ) : null}
    </KindCard>
  );
}
