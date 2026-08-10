/**
 * Pure validation core for the `matrx-admin/applications` write target
 * `app_notice` — the operator broadcast (`AppConfigV1.notice`) that every
 * installed client shows once.
 *
 * Kept free of React and services for two reasons: the failure that matters —
 * a malformed or half-authored broadcast reaching the save payload — is
 * provable in unit tests (`notice-write-targets.test.ts`), and the THROW lands
 * synchronously inside the writeback seam rather than inside a React state
 * updater, where it would escape as an unhandled render error instead of the
 * safe error envelope the agent is supposed to read.
 *
 * Contract (mirrors the manifest target description exactly):
 * - The value REPLACES the whole notice. `level`, `title` and `body` are all
 *   required — a broadcast is authored whole, never half-patched.
 * - `url` is optional and must be an https:// URL when present; omitting it
 *   (or passing "") clears it.
 * - Unknown keys throw: an agent's typo must be heard, never coerced away.
 * - Applying only STAGES the notice in the editor draft and marks it enabled.
 *   Nothing reaches a client until the admin saves and confirms the diff.
 * - Unknown keys already inside the stored notice (`NoticeDraft.extras`)
 *   round-trip unchanged, exactly as the hand-edited path preserves them.
 */

import {
  NOTICE_LEVELS,
  httpsUrlSchema,
  type NoticeDraft,
} from "@/features/admin/applications/config/schema";

/** The only keys `app_notice` accepts — mirrors the schema's KNOWN_NOTICE_KEYS. */
export const APP_NOTICE_WRITE_KEYS = ["level", "title", "body", "url"] as const;

function requiredText(
  obj: Record<string, unknown>,
  key: "title" | "body",
): string {
  const raw = obj[key];
  if (typeof raw !== "string") {
    throw new Error(
      `app_notice: ${key} is required and must be a string. Received ${JSON.stringify(raw)}.`,
    );
  }
  const trimmed = raw.trim();
  if (!trimmed) throw new Error(`app_notice: ${key} must not be empty.`);
  return trimmed;
}

/**
 * Validate an `app_notice` write value and return the NoticeDraft to stage.
 * Throws on any contract break — the seam turns the throw into the error
 * envelope the agent reads.
 */
export function buildNoticeDraftWrite(
  current: NoticeDraft,
  value: unknown,
): NoticeDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "app_notice expects an object value: { level, title, body, url? }.",
    );
  }
  const obj = value as Record<string, unknown>;

  const allowed = new Set<string>(APP_NOTICE_WRITE_KEYS);
  const unknown = Object.keys(obj).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new Error(
      `app_notice: unknown field(s) ${unknown.join(", ")}. Allowed: ${APP_NOTICE_WRITE_KEYS.join(", ")}.`,
    );
  }

  // Enum checked against the REAL vocabulary constant, never re-typed literals.
  const level = NOTICE_LEVELS.find((candidate) => candidate === obj.level);
  if (!level) {
    throw new Error(
      `app_notice: level must be one of ${NOTICE_LEVELS.join(" | ")}. Received ${JSON.stringify(obj.level)}.`,
    );
  }

  const title = requiredText(obj, "title");
  const body = requiredText(obj, "body");

  let url = "";
  if (obj.url !== undefined && obj.url !== null && obj.url !== "") {
    if (typeof obj.url !== "string") {
      throw new Error(
        `app_notice: url must be a string when provided. Received ${JSON.stringify(obj.url)}.`,
      );
    }
    const candidate = obj.url.trim();
    // Reuse the canonical validator the hand-edited path uses — https only.
    if (!httpsUrlSchema.safeParse(candidate).success) {
      throw new Error(
        `app_notice: url must be a valid https:// URL. Received ${JSON.stringify(obj.url)}.`,
      );
    }
    url = candidate;
  }

  // `...current` preserves `extras` — unknown keys inside the stored notice
  // round-trip unchanged, matching the forward-compat rule in schema.ts.
  return { ...current, enabled: true, level, title, body, url };
}
