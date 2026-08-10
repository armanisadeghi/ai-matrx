// features/flashcards/fast-fire/drill-config.ts
//
// THE canonical drill-configuration contract: the `FastFireConfig` shape, its
// defaults, the bounds every control is constrained by, and the ONE validator
// that turns an untrusted partial patch into a safe `Partial<FastFireConfig>`.
//
// Not to be confused with `config.ts`, which holds FastFire's AGENT-ID settings
// (which grader/help/review agent each lane uses). This module is about the
// DRILL's own settings — pace, length, voice mode.
//
// WHY THIS MODULE EXISTS SEPARATELY FROM THE SLICE
// The bounds used to live as bare numeric literals inside `FastFireSetup`'s
// `<Slider min= max=>` props, and the shape + defaults lived in the slice. That
// was fine while the setup form was the only writer. It is not fine now that
// the surface manifest advertises this config to AGENTS: the manifest's
// write-target description has to spell out the exact accepted range, and the
// write handler has to enforce it. Three copies of "3 to 30 seconds" in three
// files drift the moment anyone widens a slider — and the drift is invisible
// (an agent is told one range, the handler enforces another, the UI offers a
// third). So the bounds, the defaults, and the validator live HERE, and the
// slider props, the manifest prose, and the handler all derive from them.
//
// Nothing in here imports Redux — the surface manifest imports this module, and
// manifests must stay free of store dependencies.

/** The drill's full configuration. Owned by `fastFireSlice.config`. */
export interface FastFireConfig {
  setId: string | null;
  setName: string | null;
  secondsPerCard: number;
  /** Cap the card count (0 / undefined = all cards in the set). */
  cardLimit: number;
  /** Show running grades live, or only reveal at the scoreboard. */
  liveScore: boolean;
  /** Speak each card's question aloud (pre-generated + cached TTS). Default off. */
  spokenFronts: boolean;
  /**
   * VOICE MODE ONLY: seconds to answer AFTER the question finishes playing. The
   * answer timer does not start until the audio stops (you never lose time to the
   * reading), and this is deliberately SHORTER than `secondsPerCard` — in voice
   * mode you don't spend part of the window reading, so you need less time.
   */
  voiceAnswerSeconds: number;
  /**
   * Seconds-remaining at which the learner gets the light "almost out of time"
   * warning beep. Config-driven so each mode/quiz can set its own rule; the timer
   * only arms it when it lands strictly inside the card's window. 0 disables it.
   */
  warningSeconds: number;
}

export const DEFAULT_DRILL_CONFIG: FastFireConfig = {
  setId: null,
  setName: null,
  secondsPerCard: 12,
  cardLimit: 0,
  liveScore: true,
  spokenFronts: false,
  voiceAnswerSeconds: 8,
  warningSeconds: 3,
};

/**
 * Inclusive integer bounds for every numeric drill setting. The setup form's
 * sliders read these for `min`/`max`, the manifest interpolates them into the
 * write-target description an agent reads, and `parseDrillConfigPatch` enforces
 * them — so the offered range, the advertised range, and the accepted range are
 * one number.
 */
export const DRILL_CONFIG_BOUNDS = {
  secondsPerCard: { min: 3, max: 30 },
  cardLimit: { min: 0, max: 50 },
  voiceAnswerSeconds: { min: 3, max: 30 },
  warningSeconds: { min: 0, max: 10 },
} as const;

/**
 * The config fields an AGENT may patch through the surface write target, in the
 * order the setup form presents them.
 *
 * `setId`/`setName` are deliberately absent — see the `writeTargets` docblock in
 * `features/surfaces/manifests/education-fastfire.manifest.ts` for why choosing
 * the deck is not agent-drivable on this surface.
 */
export const AGENT_WRITABLE_DRILL_FIELDS = [
  "secondsPerCard",
  "cardLimit",
  "warningSeconds",
  "liveScore",
  "spokenFronts",
  "voiceAnswerSeconds",
] as const;

export type AgentWritableDrillField = (typeof AGENT_WRITABLE_DRILL_FIELDS)[number];

const NUMERIC_FIELDS = [
  "secondsPerCard",
  "cardLimit",
  "warningSeconds",
  "voiceAnswerSeconds",
] as const satisfies readonly AgentWritableDrillField[];

const BOOLEAN_FIELDS = [
  "liveScore",
  "spokenFronts",
] as const satisfies readonly AgentWritableDrillField[];

/**
 * The effective ceiling on `voiceAnswerSeconds`: the answer window in voice mode
 * can never exceed the card's own window. The setup form's slider uses exactly
 * this (`max={Math.max(3, config.secondsPerCard)}`), so a patch is held to the
 * same rule the learner's own dragging is.
 */
export function maxVoiceAnswerSeconds(secondsPerCard: number): number {
  return Math.max(DRILL_CONFIG_BOUNDS.voiceAnswerSeconds.min, secondsPerCard);
}

/**
 * Validate an untrusted drill-config patch and return the safe subset to
 * dispatch. THROWS (never coerces, never silently drops) on anything wrong —
 * the surface writeback seam turns a throw into an error envelope the calling
 * agent reads and can correct against.
 *
 * `current` supplies the values a cross-field rule needs when the patch itself
 * doesn't carry them (e.g. `voiceAnswerSeconds` is bounded by whatever
 * `secondsPerCard` will be AFTER this patch applies).
 */
export function parseDrillConfigPatch(
  value: unknown,
  current: FastFireConfig,
): Partial<FastFireConfig> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `drill_config expects an object patch with one or more of: ${AGENT_WRITABLE_DRILL_FIELDS.join(", ")}.`,
    );
  }

  const patch = value as Record<string, unknown>;
  const keys = Object.keys(patch);

  if (keys.length === 0) {
    throw new Error(
      `drill_config received an empty object — include at least one of: ${AGENT_WRITABLE_DRILL_FIELDS.join(", ")}.`,
    );
  }

  const unknownKeys = keys.filter(
    (k) => !(AGENT_WRITABLE_DRILL_FIELDS as readonly string[]).includes(k),
  );
  if (unknownKeys.length > 0) {
    throw new Error(
      `drill_config rejected — unsupported field(s): ${unknownKeys
        .map((k) => JSON.stringify(k))
        .join(", ")}. Writable fields are: ${AGENT_WRITABLE_DRILL_FIELDS.join(", ")}.` +
        (unknownKeys.some((k) => k === "setId" || k === "setName")
          ? " Choosing the flashcard set is not agent-writable on this surface — the learner picks it in the set picker."
          : ""),
    );
  }

  const out: Partial<FastFireConfig> = {};

  for (const field of NUMERIC_FIELDS) {
    if (!(field in patch)) continue;
    const raw = patch[field];
    const { min, max } = DRILL_CONFIG_BOUNDS[field];
    if (!Number.isInteger(raw)) {
      throw new Error(
        `drill_config.${field} expects a whole number between ${min} and ${max}; received ${JSON.stringify(raw)}.`,
      );
    }
    const n = raw as number;
    if (n < min || n > max) {
      throw new Error(
        `drill_config.${field} of ${n} is out of range — it must be between ${min} and ${max} (inclusive).`,
      );
    }
    out[field] = n;
  }

  for (const field of BOOLEAN_FIELDS) {
    if (!(field in patch)) continue;
    const raw = patch[field];
    if (typeof raw !== "boolean") {
      throw new Error(
        `drill_config.${field} expects true or false; received ${JSON.stringify(raw)}.`,
      );
    }
    out[field] = raw;
  }

  // Cross-field: the voice-mode answer window can never exceed the card window
  // it lives inside. Check against the POST-patch seconds-per-card so a patch
  // that raises both at once is accepted, exactly as dragging both sliders is.
  const effectiveSecondsPerCard = out.secondsPerCard ?? current.secondsPerCard;
  const voiceCeiling = maxVoiceAnswerSeconds(effectiveSecondsPerCard);
  if (out.voiceAnswerSeconds !== undefined && out.voiceAnswerSeconds > voiceCeiling) {
    throw new Error(
      `drill_config.voiceAnswerSeconds of ${out.voiceAnswerSeconds} exceeds secondsPerCard (${effectiveSecondsPerCard}) — the answer window cannot be longer than the card window. Raise secondsPerCard in the same patch, or lower voiceAnswerSeconds to ${voiceCeiling} or less.`,
    );
  }

  return out;
}
