"use client";

/**
 * One muted line under an assistant reply that started from a prefill, saying
 * how the prefill was honoured (aidream records `metadata.prefill` on the reply:
 * `{mode: native|convert|drop, text, forced, starts_with_prefill}`).
 *
 *   native  — the model continued from the text; the reply shows it in full.
 *   convert — the model was ASKED to start with it — not forced — and whether it did.
 *   drop    — the organization drops unhonourable flags; the text was not sent.
 */

export interface PrefillRecord {
  mode: "native" | "convert" | "drop";
  text: string;
  forced?: boolean;
  starts_with_prefill?: boolean;
}

export function readPrefillRecord(metadata: unknown): PrefillRecord | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>).prefill;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if ((r.mode !== "native" && r.mode !== "convert" && r.mode !== "drop") || typeof r.text !== "string") {
    return null;
  }
  return {
    mode: r.mode,
    text: r.text,
    forced: typeof r.forced === "boolean" ? r.forced : undefined,
    starts_with_prefill:
      typeof r.starts_with_prefill === "boolean" ? r.starts_with_prefill : undefined,
  };
}

function quote(text: string): string {
  const t = text.trim();
  return `“${t.length > 40 ? `${t.slice(0, 40)}…` : t}”`;
}

export function prefillSentence(record: PrefillRecord): string {
  if (record.mode === "native") return `Started from the prefill ${quote(record.text)}.`;
  if (record.mode === "convert") {
    return `Asked to start with ${quote(record.text)}, not forced — ${
      record.starts_with_prefill ? "it did" : "it did not"
    }.`;
  }
  return `Prefill ${quote(record.text)} was not sent — this model cannot take one.`;
}

export function PrefillNote({ metadata }: { metadata: unknown }) {
  const record = readPrefillRecord(metadata);
  if (!record) return null;
  const off = record.mode !== "native" && record.starts_with_prefill === false;
  return (
    <p
      className={`mt-1 text-[11px] ${off ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
      data-testid="prefill-note"
    >
      {prefillSentence(record)}
    </p>
  );
}
