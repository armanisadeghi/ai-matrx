// features/masterwork/record/copy.ts
//
// Copy payloads for THE RECORD. Human text is what the Expert would paste into
// a document; the agent payload is what a downstream agent needs to reason
// about the corpus. Modeled on `features/war-room/lib/copy.ts`.

import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import type { ExpertContribution, ExpertCorpus } from "./service";

export const RECORD_LOCATION = "AI Matrx → Masterwork Studio → Your words";

function stamp(when: string): string {
  return new Date(when).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** One contribution as plain text — headed by when it happened. */
export function contributionHuman(c: ExpertContribution): string {
  const head =
    c.kind === "message"
      ? `[${stamp(c.when)}]`
      : `[${stamp(c.when)} — ${c.kind === "transcript" ? "recording" : "uploaded source"}]`;
  // Say out loud that the words were SPOKEN and that the audio still exists —
  // a reader (human or agent) that only sees prose has no idea the voice is
  // one click away.
  const voice = c.dictations?.length
    ? `\n[spoken aloud — ${c.dictations.length} recording${
        c.dictations.length === 1 ? "" : "s"
      }: ${c.dictations.map((d) => d.title).join("; ")}]`
    : "";
  return `${head}${voice}\n${c.text}`.trim();
}

/** The whole Record as plain text, oldest first. */
export function corpusHuman(
  corpus: ExpertCorpus,
  rulebookName: string,
): string {
  const header = [
    `Everything I've said about: ${rulebookName}`,
    `${corpus.contributions.length} contributions across ${corpus.interviews.length} interview${
      corpus.interviews.length === 1 ? "" : "s"
    } · ${corpus.totalChars.toLocaleString()} characters`,
  ].join("\n");
  return [header, "", ...corpus.contributions.map(contributionHuman)].join(
    "\n\n---\n\n",
  );
}

export function contributionAgentPayload(
  c: ExpertContribution,
  rulebookName: string,
): AgentPayloadInput {
  return {
    kind: "expert-contribution",
    location: RECORD_LOCATION,
    description: `One thing the Expert said while building the Rulebook "${rulebookName}".`,
    summary: contributionHuman(c),
    data: c,
    attributes: { rulebook: rulebookName, contribution_kind: c.kind },
  };
}

export function corpusAgentPayload(
  corpus: ExpertCorpus,
  rulebookName: string,
): AgentPayloadInput {
  return {
    kind: "expert-corpus",
    location: RECORD_LOCATION,
    description: `Everything the Expert has contributed to the Rulebook "${rulebookName}" — every interview turn, uploaded source, and recording, oldest first.`,
    summary: corpusHuman(corpus, rulebookName),
    data: corpus,
    attributes: {
      rulebook: rulebookName,
      rulebook_id: corpus.rulebookId,
      contributions: corpus.contributions.length,
      interviews: corpus.interviews.length,
      total_chars: corpus.totalChars,
      recordings: corpus.contributions.reduce(
        (n, c) => n + (c.dictations?.length ?? 0),
        0,
      ),
    },
  };
}
