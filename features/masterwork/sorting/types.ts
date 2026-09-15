// features/masterwork/sorting/types.ts
//
// THE SORTING TABLE's wire shapes and its ONE case-parsing path, in one place.
//
// The server is the authority (`aidream/services/distillation/sort_ingest.py`,
// payload `masterwork_sort_cases_ready`, response `SortBoundaryResponse`).
// Nothing here invents a field, and `parseRound` refuses a case with no text
// rather than drawing an empty card the Expert cannot sort.

/** One case on the table — a thing somebody sorts with a thumb in a second. */
export interface SortCase {
  id: string;
  text: string;
  /** Where it came from, in the Expert's terms. NEVER a hint at a pile. */
  note: string;
}

/** One pile, in the Expert's own word for it. `key` is the stable handle. */
export interface SortPile {
  key: string;
  name: string;
}

export interface SortRound {
  cases: SortCase[];
  requested: number;
  repeatsDropped: number;
  pileCount: number;
  boundaryQuestions: number;
  /** Arm the microphone on a boundary answer — the org knob's resolved answer. */
  voiceDefaultOn: boolean;
}

/**
 * One question the boundary pass found worth the Expert's voice.
 *
 * `pair` carries two near-identical cases either side of a pile edge, with the
 * `closeness` that chose them. `empty_pile` carries no pair at all — it is the
 * round's NEGATIVE SPACE, and inventing a pair for it would be a fabricated
 * citation.
 */
export interface BoundaryQuestion {
  id: string;
  kind: "pair" | "empty_pile";
  prompt: string;
  leftCase: string;
  leftCaseId: string;
  leftPile: string;
  rightCase: string;
  rightCaseId: string;
  rightPile: string;
  emptyPile: string;
  closeness: number;
  pileNames: string[];
}

/** What one answered question added, as the ingest door reported it. */
export interface SortIngestSummary {
  added: number;
  quotesVerified: number;
  quotesUnverified: number;
  /** Set when this exact question had already been distilled here. */
  alreadyAnswered: boolean;
}

/**
 * The piles a round opens with when the Expert has not renamed them. Mirrors
 * `sort_ingest._DEFAULT_PILES`; the Expert renames every one of them on screen,
 * which is the difference between a default and a hardcoded taste.
 */
export const DEFAULT_PILE_NAMES: Record<number, string[]> = {
  2: ["Yes", "No"],
  3: ["Approve", "Reject", "Escalate"],
  4: ["Approve", "Reject", "Escalate", "Not my call"],
};

export function defaultPiles(count: number): SortPile[] {
  const clamped = Math.max(2, Math.min(4, Math.round(count) || 3));
  const names = DEFAULT_PILE_NAMES[clamped] ?? DEFAULT_PILE_NAMES[3];
  return names.map((name, index) => ({ key: `p${index + 1}`, name }));
}

/** A client-minted case handle. Only has to key the assignment map. */
export function caseId(): string {
  return `c${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

/**
 * The `masterwork_sort_cases_ready` payload → a round this surface may render.
 *
 * A DEAD CASE IS WORSE THAN A SHORT ROUND. A case with no text or no id is not
 * sortable, so it is dropped here rather than drawn as a blank card — and the
 * surface says how many cases it actually has, never a promised count.
 */
export function parseRound(raw: unknown): SortRound | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (!Array.isArray(data.cases)) return null;
  const cases: SortCase[] = [];
  for (const entry of data.cases) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    const text = typeof row.text === "string" ? row.text.trim() : "";
    if (!id || !text) continue;
    cases.push({
      id,
      text,
      note: typeof row.note === "string" ? row.note : "",
    });
  }
  const int = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return {
    cases,
    requested: int(data.requested, cases.length),
    repeatsDropped: int(data.repeats_dropped, 0),
    pileCount: int(data.pile_count, 3),
    boundaryQuestions: int(data.boundary_questions, 5),
    // Absent reads as ON: the knob's own default, and a microphone that is
    // there when it should not be is recoverable in one tap, while a missing
    // one on a phone ends the session.
    voiceDefaultOn: data.voice_default_on !== false,
  };
}

/** The `/masterworks/sort/boundary` response → questions this surface asks. */
export function parseBoundaryQuestions(raw: unknown): BoundaryQuestion[] {
  if (!raw || typeof raw !== "object") return [];
  const rows = (raw as Record<string, unknown>).questions;
  if (!Array.isArray(rows)) return [];
  const out: BoundaryQuestion[] = [];
  for (const entry of rows) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    const prompt = typeof row.prompt === "string" ? row.prompt.trim() : "";
    const kind = row.kind === "empty_pile" ? "empty_pile" : "pair";
    if (!id || !prompt) continue;
    const str = (value: unknown) => (typeof value === "string" ? value : "");
    // A `pair` question with no pair has nothing to point a rule at. Dropped
    // here rather than asked, because the answer could never carry evidence.
    if (kind === "pair" && !(str(row.left_case) && str(row.right_case))) continue;
    out.push({
      id,
      kind,
      prompt,
      leftCase: str(row.left_case),
      leftCaseId: str(row.left_case_id),
      leftPile: str(row.left_pile),
      rightCase: str(row.right_case),
      rightCaseId: str(row.right_case_id),
      rightPile: str(row.right_pile),
      emptyPile: str(row.empty_pile),
      closeness:
        typeof row.closeness === "number" && Number.isFinite(row.closeness)
          ? row.closeness
          : 0,
      pileNames: Array.isArray(row.pile_names)
        ? row.pile_names.filter((n): n is string => typeof n === "string")
        : [],
    });
  }
  return out;
}
