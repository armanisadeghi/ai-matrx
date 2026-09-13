// features/masterwork/components/masterworks/auditionVerdict.ts
//
// The Audition verdict document as it reaches a client — the SAME shape whether
// it arrived on the live stream or was read back off `platform.masterwork_run`
// minutes or days later. Both halves matter: an Audition costs real money and
// several minutes, so a past one must REOPEN rather than be re-run to be read
// again, and that is only true while one parser understands both sources.
//
// Server contract: `MasterworkAuditionVerdictData`
// (matrx-connect/context/data_types.py), terminal event of
// POST /masterworks/audition.

export interface RuleFinding {
  rule_id: string;
  winner: string;
  note: string;
}

export interface AuditionVerdict {
  verdict: string;
  summary: string;
  findings: RuleFinding[];
  gaps: string[];
  gaps_captured: number;
  quality_score: number | null;
  vanilla_compared: boolean;
  vanilla_score: number | null;
  vanilla_text: string | null;
  vanilla_error: string | null;
  vanilla_verdict: string | null;
  /** The plain model's standing on each of the SAME rules. */
  vanilla_findings: RuleFinding[];
  /** How the vanilla arm was built — which tier, and where the ask came from. */
  vanilla_note: string | null;
  vanilla_model: string | null;
  beat_vanilla_rules: number | null;
  lost_to_vanilla_rules: number | null;
  vanilla_rules_compared: number | null;
  verdict_sentence: string | null;
}

export function parseVerdict(raw: unknown): AuditionVerdict | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (data.type !== "masterwork_audition_verdict") return null;
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  return {
    verdict: String(data.verdict ?? "parity"),
    summary: String(data.summary ?? ""),
    findings: Array.isArray(data.findings) ? (data.findings as RuleFinding[]) : [],
    gaps: Array.isArray(data.gaps) ? (data.gaps as string[]) : [],
    gaps_captured: Number(data.gaps_captured ?? 0),
    quality_score: num(data.quality_score),
    vanilla_compared: data.vanilla_compared === true,
    vanilla_score: num(data.vanilla_score),
    vanilla_text: typeof data.vanilla_text === "string" ? data.vanilla_text : null,
    vanilla_error: typeof data.vanilla_error === "string" ? data.vanilla_error : null,
    vanilla_verdict:
      typeof data.vanilla_verdict === "string" ? data.vanilla_verdict : null,
    vanilla_findings: Array.isArray(data.vanilla_findings)
      ? (data.vanilla_findings as RuleFinding[])
      : [],
    vanilla_note: typeof data.vanilla_note === "string" ? data.vanilla_note : null,
    vanilla_model: typeof data.vanilla_model === "string" ? data.vanilla_model : null,
    beat_vanilla_rules: num(data.beat_vanilla_rules),
    lost_to_vanilla_rules: num(data.lost_to_vanilla_rules),
    vanilla_rules_compared: num(data.vanilla_rules_compared),
    verdict_sentence:
      typeof data.verdict_sentence === "string" ? data.verdict_sentence : null,
  };
}
