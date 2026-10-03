// features/scopes/service/scopesReadKnob.server.ts — the server twin of `scopesReadFromStore()`.
//
// The same platform knob (`custom.scope_readers_read_the_store`), read through the same one snapshot
// door for the person on this request (`readEffectiveKnobOnServer`). The server is never told the
// person's active organization (`resolveActiveOrgContext`: nothing server-side reads the active-org
// cookie), so it answers at the platform rung: a person or organization override reaches the browser's
// screens, not these two one-row lookups (the scope short link, the class checkout), which answer the
// same scope on either path. A knob that cannot be answered is the old path with a warning.

import "server-only";

import { readEffectiveKnobOnServer } from "@/lib/scoped-config/effectiveKnobs.server";
import { SCOPES_READ_KNOB } from "./scopesReadKnob";

export async function scopesReadFromStoreOnServer(): Promise<boolean> {
  const value = await readEffectiveKnobOnServer(SCOPES_READ_KNOB);
  if (typeof value === "boolean") return value;
  console.warn(
    `[scopes] the read switch ${SCOPES_READ_KNOB.feature}.${SCOPES_READ_KNOB.key} answered ` +
      `${JSON.stringify(value)} on the server, so this request reads the old tables.`,
  );
  return false;
}
