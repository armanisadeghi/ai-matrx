"use client";

/**
 * WHICH MODE AM I IN — and the refusal when nobody can say.
 *
 * Human-in-the-loop policy (common-docs `/policies/human-in-the-loop-autonomy-modes.md`):
 *   rule 1 — every AI-driven capability declares its mode;
 *   rule 2 — platform default → organization → (personal capabilities) user;
 *   rule 3 — the mode is a KNOB, never a constant;
 *   rule 8 — 🚨 a runner that cannot determine its mode REFUSES. "Defaulting to
 *            'apply' when the capability is unknown, the scope cannot be
 *            resolved, or the ladder returns nothing is the exact failure this
 *            policy exists to prevent."
 *
 * So this module has no fallback value anywhere in it. It either returns a mode
 * the ladder actually answered with, or a REFUSAL carrying the sentence a
 * surface shows the person. There is no third outcome, and `mode_1` is never
 * assumed.
 *
 * The ladder itself is `platform.knob_resolve`, reached through
 * `lib/scoped-config/effectiveKnobs.ts` — the same nearest-rung-wins resolution
 * the settings screens show, so a runner and the screen that configures it can
 * never disagree. The knobs are registered by
 * `migrations/hitl_google_knobs.sql`.
 */

import {
  ensureEffectiveKnob,
  useEffectiveKnob,
} from "@/lib/scoped-config/effectiveKnobs";
import { AUTONOMY_MODES, type AutonomyMode } from "./types";

/**
 * The capabilities whose mode is configurable, by knob key. Gmail send is
 * DELIBERATELY ABSENT: a human confirms every single message (google-native
 * PLAN §4.4 "Not a knob"), so the code path has no auto mode and
 * `GMAIL_SEND_MODE` below is a constant, not a read.
 */
export const HITL_KNOBS = {
  /** Someone asked, in the moment, for a change to their own Google file. */
  googleAttendedFileWrite: "hitl.google.attended_file_write",
  /** A workflow or schedule wants to write with nobody watching. */
  googleUnattendedFileWrite: "hitl.google.unattended_file_write",
  /** An agent proposes importing a Google contact or task. */
  googleAgentImport: "hitl.google.agent_import",
} as const;

export type HitlCapability = keyof typeof HITL_KNOBS;

/** How long a mode-3 item waits before it applies itself. */
export const HITL_REVIEW_TIMEOUT_KNOB = "hitl.google.review_timeout_hours";

/**
 * Gmail send is human-confirmed per message, always, for everyone. This is not
 * a default and not a knob read: the send path (`GmailReviewCard` →
 * `sendReviewedGmail`) has no code that can send without a click, so declaring
 * anything else here would be a control that governs nothing.
 */
export const GMAIL_SEND_MODE: AutonomyMode = "mode_4";

export type ModeResolution =
  | { ok: true; mode: AutonomyMode }
  /**
   * Nobody could say. `sentence` is shown to the person where the work would
   * have appeared, and the caller does NOT act.
   */
  | { ok: false; sentence: string };

function narrowMode(value: unknown): AutonomyMode | null {
  return typeof value === "string" &&
    (AUTONOMY_MODES as readonly string[]).includes(value)
    ? (value as AutonomyMode)
    : null;
}

function refusal(knobKey: string, why: string): ModeResolution {
  return {
    ok: false,
    sentence:
      `This step did not run: nothing could tell it whether a person has to ` +
      `approve it first (${why}). Set "${knobKey}" in your organization's ` +
      `configuration and run it again — it will not guess.`,
  };
}

/**
 * Resolve one capability's mode, or refuse. Async face for a runner outside
 * React (a service call, a thunk).
 */
export async function resolveHitlMode(
  capability: HitlCapability,
  organizationId: string | null | undefined,
  userId: string | null | undefined,
): Promise<ModeResolution> {
  const knobKey = HITL_KNOBS[capability];
  if (!organizationId) {
    return refusal(knobKey, "the organization this would run for is unknown");
  }
  let value: unknown;
  try {
    value = await ensureEffectiveKnob(organizationId, userId ?? null, knobKey);
  } catch (error) {
    return refusal(
      knobKey,
      `the setting could not be read (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  const mode = narrowMode(value);
  if (!mode) {
    return refusal(
      knobKey,
      value === undefined || value === null
        ? "the setting is not registered in this database"
        : `the setting holds "${String(value)}", which is not one of the five modes`,
    );
  }
  return { ok: true, mode };
}

/**
 * React face. `undefined` while the ladder is still answering — a caller must
 * treat that as "not answered yet", never as a mode.
 */
export function useHitlMode(
  capability: HitlCapability,
  organizationId: string | null | undefined,
  userId: string | null | undefined,
): ModeResolution | undefined {
  const knobKey = HITL_KNOBS[capability];
  const value = useEffectiveKnob(organizationId, userId, knobKey);
  if (!organizationId) {
    return refusal(knobKey, "the organization this would run for is unknown");
  }
  if (value === undefined) return undefined;
  const mode = narrowMode(value);
  return mode
    ? { ok: true, mode }
    : refusal(
        knobKey,
        value === null
          ? "the setting is not registered in this database"
          : `the setting holds "${String(value)}", which is not one of the five modes`,
      );
}

/**
 * The mode-3 window, in hours. Returns `null` until the ladder answers and when
 * the value is not a usable number — a caller that cannot read the window must
 * NOT invent one, because the instant it computes is the instant a person is
 * promised the change will not happen before.
 */
export function useHitlReviewTimeoutHours(
  organizationId: string | null | undefined,
  userId: string | null | undefined,
): number | null {
  const value = useEffectiveKnob(
    organizationId,
    userId,
    HITL_REVIEW_TIMEOUT_KNOB,
  );
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

/**
 * A surface that must show the refusal rather than silently rendering nothing.
 * Kept here so every consumer says it the same way.
 */
export function useHitlModeSentence(
  capability: HitlCapability,
  organizationId: string | null | undefined,
  userId: string | null | undefined,
): string | null {
  const resolution = useHitlMode(capability, organizationId, userId);
  return resolution && !resolution.ok ? resolution.sentence : null;
}
