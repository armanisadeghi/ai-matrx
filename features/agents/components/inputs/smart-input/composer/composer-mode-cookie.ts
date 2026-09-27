/**
 * "Last mode used" (Amendment 1, A1) — a cookie, not a setting.
 *
 * Framework-free on purpose: the server reader (`composer-mode.server.ts`)
 * and the client writer (`useComposerMode`) share these constants. The
 * server reads it so the first paint is already in the right mode (no flash);
 * the default mode and "remember last mode" are knobs
 * (`agents.chat_composer.*`), resolved on the client.
 */

import { isComposerMode, type ComposerMode } from "./composer-types";

export const COMPOSER_MODE_COOKIE = "matrx:composer-mode";

/** One year, like the other shell preference cookies. */
const COMPOSER_MODE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseComposerModeCookie(value: string | undefined | null): ComposerMode | null {
  return isComposerMode(value) ? value : null;
}

export function writeComposerModeCookie(mode: ComposerMode): void {
  if (typeof document === "undefined") return;
  document.cookie =
    `${COMPOSER_MODE_COOKIE}=${mode}; path=/; max-age=${COMPOSER_MODE_COOKIE_MAX_AGE}; samesite=lax`;
}

export function clearComposerModeCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COMPOSER_MODE_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

export function readComposerModeCookieClient(): ComposerMode | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${COMPOSER_MODE_COOKIE}=`));
  return parseComposerModeCookie(hit?.slice(COMPOSER_MODE_COOKIE.length + 1));
}

/** The knob addresses the mode reads (seeded by chat_composer_knobs_2026_09_27.sql). */
export const COMPOSER_KNOBS = {
  defaultMode: { feature: "agents.chat_composer", key: "default_mode" },
  rememberLastMode: { feature: "agents.chat_composer", key: "remember_last_mode" },
  compactInputMaxHeightPct: { feature: "agents.chat_composer", key: "compact_input_max_height_pct" },
  quickActions: { feature: "agents.chat_composer", key: "quick_actions" },
  floatingPanelSize: { feature: "agents.chat_composer", key: "floating_panel_size" },
} as const;
