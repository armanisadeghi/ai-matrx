/**
 * THE GUARD: `features/audio/constants.ts` may never again carry a bare audio
 * duration or file-size cap.
 *
 * WHY IT EXISTS (owner mandate, 2026-09-17). That file used to hold
 * `MAX_FILE_SIZE_BYTES: 100 * 1024 * 1024` and `MAX_DURATION_SECONDS: 3_600`.
 * An expert who owns a 9-hour audiobook could not get it into AI Matrx,
 * although `aidream/aidream/services/audio/file_transcription.py` had for
 * months been splitting arbitrarily long audio into provider-sized windows and
 * reassembling it with shifted timestamps. A literal in a client constants file
 * was guarding a capability the server already had, and nobody could raise it
 * without a deploy. Law 6 — opinions become knobs — plus
 * `common-docs/policies/limits-are-knobs-agents-set-them.md`.
 *
 * WHAT IT ASSERTS. Three things, and the third is the one that matters:
 *   1. The retired cap names are gone from the module's exports.
 *   2. The source text of `constants.ts` contains no duration- or size-shaped
 *      cap literal (a `MAX_*_SECONDS` / `MAX_*_BYTES` / `MAX_*_SIZE` /
 *      `*_DURATION_*` / `WARN_*` binding), with the deliberate, documented
 *      exceptions named below.
 *   3. Each retired cap RESOLVES THROUGH THE KNOB PATH instead: it is a
 *      declared key in `features/audio/limits.ts`, and that module's only
 *      source of values is `resolveSessionKnob` (`platform.knob_resolve`),
 *      with no numeric default anywhere in the resolution path.
 *
 * ── PROVEN RED, THEN GREEN ──────────────────────────────────────────────────
 *
 * Proven failing on 2026-09-17 by temporarily restoring the literals to
 * `AUDIO_CONSTANTS` in `features/audio/constants.ts`:
 *
 *     MAX_FILE_SIZE_BYTES: 100 * 1024 * 1024,
 *     MAX_DURATION_SECONDS: 3_600,
 *
 * Exact failing output (jest, 2026-09-17):
 *
 *   console.error
 *     features/audio/constants.ts has re-introduced bare product caps:
 *       line 48: MAX_FILE_SIZE_BYTES: 100 * 1024 * 1024,
 *       line 49: MAX_DURATION_SECONDS: 3_600,
 *     Every audio ceiling is a platform.feature_knob row under
 *     `media.transcription`, read through features/audio/limits.ts. Seed it in
 *     migrations/audio_transcription_limits_knobs.sql and resolve it there —
 *     never a literal here. (2026-09-17: a 100 MB / 60 min literal in this file
 *     is what stopped a 9-hour audiobook the server could already transcribe.)
 *
 *   FAIL features/audio/__tests__/audio-limits-are-knobs.test.ts
 *     ● audio limits are knobs, never constants › features/audio/constants.ts
 *       carries no bare duration or size cap
 *
 *       expect(received).toEqual(expected) // deep equality
 *
 *       - Expected  - 1
 *       + Received  + 4
 *
 *       - Array []
 *       + Array [
 *       +   "line 48: MAX_FILE_SIZE_BYTES: 100 * 1024 * 1024,",
 *       +   "line 49: MAX_DURATION_SECONDS: 3_600,",
 *       + ]
 *
 *     ● audio limits are knobs, never constants › the retired caps are gone
 *       from the module's exports
 *
 *       expect(received).toBeUndefined()
 *
 *       Received: 104857600
 *
 *   Tests:       2 failed, 4 passed, 6 total
 *
 * Literals removed again; the same command then reported
 *   Tests:       6 passed, 6 total
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { AUDIO_CONSTANTS, RETRY_CONFIG, VERCEL_LIMITS } from "../constants";
import { AUDIO_LIMIT_KNOBS, AUDIO_LIMITS_FEATURE, audioLimitKnobKey } from "../limits";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const CONSTANTS_PATH = join(REPO_ROOT, "features", "audio", "constants.ts");
const LIMITS_PATH = join(REPO_ROOT, "features", "audio", "limits.ts");
const MIGRATION_PATH = join(
  REPO_ROOT,
  "migrations",
  "audio_transcription_limits_knobs.sql",
);

/**
 * Bindings that LOOK like a cap but are deliberately not knobs. Each is
 * justified in a comment in `constants.ts` itself; adding to this list is a
 * decision, not a way to make the guard quiet.
 *
 *   MAX_BODY_BYTES / MAX_FUNCTION_DURATION_* — Vercel's own hard limits, the
 *     same on every plan. We do not get to choose them, and a knob above them
 *     would turn a clear refusal into a 413.
 *   MAX_CHUNK_SIZE_BYTES — arithmetic on MAX_BODY_BYTES; it moves only when
 *     Vercel's hard limit moves.
 */
const ALLOWED_CAP_BINDINGS = new Set([
  "MAX_BODY_BYTES",
  "MAX_FUNCTION_DURATION_DEFAULT",
  "MAX_FUNCTION_DURATION_FLUID",
  "MAX_CHUNK_SIZE_BYTES",
]);

/** The caps that were literals here and must now resolve through a knob. */
const RETIRED_CAPS = [
  "MAX_FILE_SIZE_BYTES",
  "MAX_DURATION_SECONDS",
  "WARN_DURATION_SECONDS",
  "CHUNK_DURATION_MS",
  "CHUNK_FETCH_TIMEOUT_MS",
  "MAX_ATTEMPTS",
  "BASE_DELAY_MS",
  "MAX_DELAY_MS",
] as const;

/** `NAME: <number-ish>` at the start of a line — a bare cap binding. */
const CAP_BINDING = /^\s*([A-Z][A-Z0-9_]*)\s*:\s*[-0-9]/;

function capShaped(name: string): boolean {
  return (
    /^MAX_.*(SECONDS|BYTES|SIZE|MS|MINUTES|HOURS|ATTEMPTS)$/.test(name) ||
    /DURATION/.test(name) ||
    /^WARN_/.test(name) ||
    /^(BASE|MAX)_DELAY_MS$/.test(name)
  );
}

describe("audio limits are knobs, never constants", () => {
  it("features/audio/constants.ts carries no bare duration or size cap", () => {
    const source = readFileSync(CONSTANTS_PATH, "utf8");
    const offenders: string[] = [];
    source.split("\n").forEach((line, index) => {
      const match = CAP_BINDING.exec(line);
      if (!match) return;
      const name = match[1];
      if (ALLOWED_CAP_BINDINGS.has(name)) return;
      if (!capShaped(name)) return;
      offenders.push(`line ${index + 1}: ${line.trim()}`);
    });

    if (offenders.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `features/audio/constants.ts has re-introduced bare product caps:\n` +
          offenders.map((o) => `  ${o}`).join("\n") +
          `\nEvery audio ceiling is a platform.feature_knob row under\n` +
          `\`${AUDIO_LIMITS_FEATURE}\`, read through features/audio/limits.ts. Seed it in\n` +
          `migrations/audio_transcription_limits_knobs.sql and resolve it there —\n` +
          `never a literal here. (2026-09-17: a 100 MB / 60 min literal in this file\n` +
          `is what stopped a 9-hour audiobook the server could already transcribe.)`,
      );
    }
    expect(offenders).toEqual([]);
  });

  it("the retired caps are gone from the module's exports", () => {
    const exported = {
      ...(AUDIO_CONSTANTS as Record<string, unknown>),
      ...(RETRY_CONFIG as unknown as Record<string, unknown>),
    };
    for (const cap of RETIRED_CAPS) {
      expect(exported[cap]).toBeUndefined();
    }
  });

  it("the Vercel hard limits stay, because they are not ours to choose", () => {
    expect(VERCEL_LIMITS.MAX_BODY_BYTES).toBe(4.5 * 1024 * 1024);
    expect(AUDIO_CONSTANTS.MAX_CHUNK_SIZE_BYTES).toBeLessThan(
      VERCEL_LIMITS.MAX_BODY_BYTES,
    );
  });

  it("each retired cap has a declared knob key on the settings path", () => {
    const declared = new Set<string>(Object.values(AUDIO_LIMIT_KNOBS));
    for (const key of [
      "upload_max_duration_seconds",
      "upload_max_file_size_bytes",
      "recording_max_duration_seconds",
      "recording_max_file_size_bytes",
      "recording_warn_duration_seconds",
      "recording_chunk_rotation_ms",
      "chunk_fetch_timeout_ms",
      "upload_retry_max_attempts",
      "upload_retry_base_delay_ms",
      "upload_retry_max_delay_ms",
    ]) {
      expect(declared.has(key)).toBe(true);
      // And it is seeded, so a read can never be a missing row.
      expect(readFileSync(MIGRATION_PATH, "utf8")).toContain(`'${key}'`);
    }
    // The upload lane and the browser-recording lane are DISTINGUISHABLE —
    // two separate knobs, never one number wearing two hats.
    expect(AUDIO_LIMIT_KNOBS.UPLOAD_MAX_DURATION_SECONDS).not.toBe(
      AUDIO_LIMIT_KNOBS.RECORDING_MAX_DURATION_SECONDS,
    );
    expect(audioLimitKnobKey(AUDIO_LIMIT_KNOBS.UPLOAD_MAX_FILE_SIZE_BYTES)).toBe(
      "media.transcription.upload_max_file_size_bytes",
    );
  });

  it("the resolver reads the settings ladder and nothing else", () => {
    const source = readFileSync(LIMITS_PATH, "utf8");
    expect(source).toContain("resolveSessionKnob");
    // No numeric fallback may exist in the resolution path: a default here is
    // exactly how a stale constant survives a migration to knobs.
    const resolver = source.slice(
      source.indexOf("async function resolveNumber"),
      source.indexOf("/** A pair of ceilings"),
    );
    expect(resolver).not.toMatch(/\b\d{3,}\b/);
    expect(resolver).toContain("resolved: false");
  });

  it("a refusal names the actual limit and the remedy, never a bare message", async () => {
    const { overSizeMessage, overDurationMessage } = await import("../limits");
    const size = overSizeMessage(200 * 1024 * 1024, 100 * 1024 * 1024, "upload");
    expect(size).toContain("100");
    expect(size).toMatch(/Limits & Knobs|Configuration/);
    expect(size).not.toBe("File too large");

    const duration = overDurationMessage(7200, 3600, "recording");
    expect(duration).toContain("1:00:00");
    expect(duration).toContain("2:00:00");
    expect(duration).toMatch(/upload|administrator/i);
  });
});
