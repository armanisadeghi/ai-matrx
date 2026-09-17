// features/workflow-runtime/components/run/laneDetail.ts
//
// WHAT ONE FAN-OUT LANE IS ALLOWED TO SAY ABOUT ITSELF.
//
// 🚨 THE DEFECT (cold walk 5, finding 5b, 2026-09-16; reproduced live on a
// brand-new run on 2026-09-17). On the finished run page of a Masterwork — the
// one screen whose entire job is to be the trustworthy, presentable record of a
// decision — the right-hand "THE PLAN" rail rendered its five completed
// sub-items as:
//
//     #1  dence": "", "fix_hint": "" } ], "content_id": "v1", "violation_count": 0 }
//     #2  ence": "", "fix_hint": "" } ], "content_id": "v2", "violation_count": 0 }
//
// — the last ninety characters of a structured-output node's raw JSON payload,
// cut mid-key, printed where a plain-English step label belongs. The rail
// preferred the node's raw stream TAIL over the declared progress message the
// engine emits for exactly this purpose, so every structured-output step in the
// platform put its own serialization on screen in front of an Expert.
//
// THE RULE THIS FILE ENFORCES: a label is DECLARED, never scraped. The lane
// says what the run itself declared about it — an error, or the step's own
// progress sentence. A raw stream tail is a last resort and is admitted only
// when it reads as prose; a payload fragment is refused outright and the lane
// falls back to something honest (how long it took, or its phase). A machine
// frame never wins over silence.

/** A lane's rail width holds about this much. */
export const LANE_TAIL_CHARS = 90;

/**
 * Does this text read as a machine talking to itself rather than to a person?
 *
 * Pure and deliberately blunt: a JSON key, a stray structural bracket pair, or
 * a fragment that begins inside a quoted key all mean the same thing — this is
 * a serialization, not a sentence.
 */
export function looksLikeMachineFrame(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // `"fix_hint":`, `"content_id":` — a quoted key followed by a colon.
  if (/"[A-Za-z_][A-Za-z0-9_]*"\s*:/.test(trimmed)) return true;
  // `dence": ""` — the tail began INSIDE a quoted key that was cut in half.
  if (/^[^"\s]*"\s*:/.test(trimmed)) return true;
  // `} ],` / `{"` — structural brackets are not punctuation a person types.
  if ((trimmed.match(/[{}[\]]/g) ?? []).length >= 2) return true;
  // A lone XML/protocol frame, e.g. `<reasoning>` or `</tool_call>`.
  if (/^<\/?[a-z_][\w-]*>?/i.test(trimmed)) return true;
  return false;
}

/**
 * A tail that survived the machine-frame check, cut to the rail's width on a
 * word boundary so it never starts mid-word.
 */
export function proseTail(textTail: string, limit = LANE_TAIL_CHARS): string | null {
  const whole = textTail.trim();
  if (!whole) return null;
  if (looksLikeMachineFrame(whole)) return null;
  if (whole.length <= limit) return whole;
  const cut = whole.slice(-limit);
  const onAWord = cut.replace(/^\S*\s+/, "").trim();
  const shown = onAWord || cut.trim();
  if (!shown || looksLikeMachineFrame(shown)) return null;
  return `…${shown}`;
}

export interface LaneFacts {
  phase: string;
  error?: { message?: string | null } | null;
  progress?: { message?: string | null } | null;
  textTail: string;
  durationMs: number | null;
}

/**
 * The one sentence a lane is allowed to show, in the one order that keeps a
 * declared label ahead of a scraped one.
 */
export function laneDetail(lane: LaneFacts): string | null {
  const error = lane.error?.message?.trim();
  if (error) return error;
  const declared = lane.progress?.message?.trim();
  if (declared) return declared;
  const tail = proseTail(lane.textTail);
  if (tail) return tail;
  if (lane.durationMs !== null) return `${Math.round(lane.durationMs)} ms`;
  return null;
}
