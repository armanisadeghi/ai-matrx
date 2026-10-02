import "server-only";

/**
 * Server reader for the composer's "last mode used" cookie, so a page that
 * hosts the composer renders its first paint in the right mode. `null` = no
 * cookie (a new person, or "remember last mode" is off) — the client then
 * applies the `agents.chat_composer.default_mode` knob.
 */

import { cookies } from "next/headers";
import { COMPOSER_MODE_COOKIE, parseComposerModeCookie } from "./composer-mode-cookie";
import type { ComposerMode } from "./composer-types";

export async function readComposerModeCookie(): Promise<ComposerMode | null> {
  const store = await cookies();
  return parseComposerModeCookie(store.get(COMPOSER_MODE_COOKIE)?.value);
}
