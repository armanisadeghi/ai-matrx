"use client";

/**
 * `news_client_context` (NEWS-ENGINE-SPEC §6.16) — what the judgment jobs were
 * told about the client this run: company, spokespeople and proof, rivals,
 * beats, search terms, exclusions and the brief. The ONE renderer.
 */

import { isRecord, records, str, strings } from "../run-document";
import { FactRow, KindCard, Pill, SmartLink } from "./shared";

export function NewsClientContextView({ value }: { value: Record<string, unknown> }) {
  const company = isRecord(value.company) ? value.company : {};
  const facts = isRecord(value.facts) ? value.facts : {};
  const spokespeople = records(facts.spokespeople);
  const proofs = records(facts.proof_assets);
  const brief = isRecord(value.brief) ? value.brief : null;
  const list = (v: unknown) => strings(v).join(", ") || "none";
  return (
    <KindCard
      testId="news-client-context"
      title={`What the judges were told about ${str(company.name) || "the client"}`}
      subtitle="Frozen at the start of the run; each judgment job receives only its slice."
    >
      {str(company.description) ? <p className="text-xs text-foreground">{str(company.description)}</p> : null}
      {str(company.website) ? (
        <FactRow label="Website">
          <SmartLink href={str(company.website)}>{str(company.website)}</SmartLink>
        </FactRow>
      ) : null}
      <FactRow label="Spokespeople">
        {spokespeople.length
          ? spokespeople.map((s) => [str(s.name), str(s.title)].filter(Boolean).join(", ")).join("; ")
          : "none on file"}
      </FactRow>
      <FactRow label="Proof">
        {proofs.length ? proofs.map((p) => str(p.summary)).join("; ") : "none on file"}
      </FactRow>
      {value.proof_on_file === false ? (
        <Pill tone="warn">No proof on file — pitch-ready items are proof-gated</Pill>
      ) : null}
      <FactRow label="Rivals">{list(value.competitors)}</FactRow>
      <FactRow label="Beats">{list(value.topics)}</FactRow>
      <FactRow label="Search terms">{list(value.search_terms)}</FactRow>
      <FactRow label="Standing">{list(value.standing)}</FactRow>
      <FactRow label="Never">{list(value.exclusions)}</FactRow>
      <FactRow label="Brief">
        {!brief || brief.is_empty === true ? "empty — no brief rules applied" : str(brief.text).slice(0, 400)}
      </FactRow>
    </KindCard>
  );
}
