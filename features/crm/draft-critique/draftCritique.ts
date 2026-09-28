// features/crm/draft-critique/draftCritique.ts
//
// The Tough Editor's score, computed from its own rubric. `crm.outreach_draft_reviewer`
// (the Chasebox `draft_reviewer` role) embeds a `draft_critique` block —
// criteria[{id 1-13, score 0-2, note}] (criterion 8, the subject line, omitted for a
// press release), points, score (1-10), verdict. The brief (common-docs
// BRIEFS-MEDIA-WRITING-CRISIS.md section 6): "the scale mapping is applied by code
// from the points, so the score can never disagree with the rubric".
//
// This is the TypeScript mirror of aidream `aidream/services/crm/draft_critique.py`.
// Both run the same golden vectors (`draft-critique.vectors.json`, byte-identical in
// both repos — the aidream test fails if they differ). Change one, change both.
//
// Scale (a release has 24 points and is scaled x26/24 first):
//   22-26 -> 9-10 publishable   17-21 -> 7-8 publishable   11-16 -> 5-6 workshopable
//    6-10 -> 3-4 start_over      0-5 -> 1-2 start_over
// Within a band: the LOWER number unless the scaled points sit strictly above the
// band's midpoint (13 -> 5, 14 -> 6; 24 -> 9, 25 -> 10).
//
// Every change is returned in `corrections` — the caller shows them; nothing is fixed
// silently.

export type DraftType = "pitch_email" | "press_release";
export type DraftVerdict = "publishable" | "workshopable" | "start_over";

export interface DraftCritiqueCriterion {
  id: number;
  score: number;
  note?: string;
  [key: string]: unknown;
}

export interface DraftCritique {
  __kind: "draft_critique";
  criteria: DraftCritiqueCriterion[];
  points?: number;
  score?: number;
  verdict?: DraftVerdict | string;
  draft_type?: DraftType;
  [key: string]: unknown;
}

export interface DraftCritiqueCorrection {
  critique: DraftCritique & { points: number; score: number; verdict: DraftVerdict };
  corrections: string[];
  draftType: DraftType;
  maxPoints: number;
}

const FULL_SCALE_POINTS = 26;
const SUBJECT_LINE_CRITERION = 8;
const CRITERION_IDS = Array.from({ length: 13 }, (_, i) => i + 1);

/** [lowest scaled points, highest, lower score, higher score, verdict], highest band first. */
const BANDS: ReadonlyArray<readonly [number, number, number, number, DraftVerdict]> = [
  [22, 26, 9, 10, "publishable"],
  [17, 21, 7, 8, "publishable"],
  [11, 16, 5, 6, "workshopable"],
  [6, 10, 3, 4, "start_over"],
  [0, 5, 1, 2, "start_over"],
];

function scaled(points: number, maxPoints: number): number {
  return maxPoints ? (points * FULL_SCALE_POINTS) / maxPoints : 0;
}

function band(points: number, maxPoints: number) {
  const value = scaled(points, maxPoints);
  return BANDS.find((b) => value >= b[0]) ?? BANDS[BANDS.length - 1];
}

export function bandScore(points: number, maxPoints = FULL_SCALE_POINTS): number {
  const [lowPts, highPts, low, high] = band(points, maxPoints);
  return scaled(points, maxPoints) > (lowPts + highPts) / 2 ? high : low;
}

export function bandVerdict(points: number, maxPoints = FULL_SCALE_POINTS): DraftVerdict {
  return band(points, maxPoints)[4];
}

/** Python-repr-ish rendering so both implementations word corrections the same way. */
function show(value: unknown): string {
  if (value === undefined || value === null) return "None";
  if (typeof value === "string") return `'${value}'`;
  return JSON.stringify(value);
}

export function correctDraftCritique(
  critique: DraftCritique,
  draftType?: DraftType | null,
): DraftCritiqueCorrection {
  if (!critique || typeof critique !== "object" || !Array.isArray(critique.criteria)) {
    throw new Error("draft_critique has no criteria list — there is nothing to score");
  }
  const out = structuredClone(critique) as DraftCritique;
  const corrections: string[] = [];

  const idsPresent = new Set(
    out.criteria.filter((c) => c && typeof c === "object").map((c) => c.id),
  );
  let kindType = draftType ?? out.draft_type;
  if (kindType !== "pitch_email" && kindType !== "press_release") {
    kindType = idsPresent.has(SUBJECT_LINE_CRITERION) ? "pitch_email" : "press_release";
  }
  const expected = CRITERION_IDS.filter(
    (i) => !(kindType === "press_release" && i === SUBJECT_LINE_CRITERION),
  );
  const maxPoints = 2 * expected.length;

  const kept: DraftCritiqueCriterion[] = [];
  const seen = new Set<number>();
  for (const raw of out.criteria) {
    const entry = raw && typeof raw === "object" ? raw : null;
    const cid = entry?.id;
    if (typeof cid !== "number" || !Number.isInteger(cid) || !expected.includes(cid)) {
      if (cid === SUBJECT_LINE_CRITERION && kindType === "press_release") {
        corrections.push(
          "criterion 8 (subject line) was scored on a press release — dropped; a release is scored out of 24",
        );
      } else {
        corrections.push(`criterion entry ${JSON.stringify(raw)} is not one of criteria ${JSON.stringify(expected)} — dropped`);
      }
      continue;
    }
    if (seen.has(cid)) {
      corrections.push(`criterion ${cid} appeared twice — kept the first, dropped the repeat`);
      continue;
    }
    seen.add(cid);
    const given = entry!.score;
    const numeric = typeof given === "number" && Number.isFinite(given) ? Math.round(given) : null;
    const fixed = numeric === null ? 0 : Math.min(2, Math.max(0, numeric));
    if (fixed !== given) {
      corrections.push(`criterion ${cid} score ${show(given)} is outside 0-2 — counted as ${fixed}`);
      kept.push({ ...entry!, score: fixed });
    } else {
      kept.push(entry!);
    }
  }
  const missing = expected.filter((i) => !seen.has(i));
  if (missing.length) {
    corrections.push(`criteria ${JSON.stringify(missing)} were not scored — counted as 0`);
  }
  out.criteria = kept;

  const points = kept.reduce((sum, c) => sum + c.score, 0);
  const next = {
    points,
    score: bandScore(points, maxPoints),
    verdict: bandVerdict(points, maxPoints),
  } as const;
  for (const key of ["points", "score", "verdict"] as const) {
    if (out[key] !== next[key]) {
      corrections.push(
        `${key} was ${show(out[key])}; the rubric gives ${show(next[key])}` +
          (key !== "points" ? ` (${points} of ${maxPoints} points)` : ""),
      );
    }
  }

  return {
    critique: { ...out, ...next },
    corrections,
    draftType: kindType,
    maxPoints,
  };
}
