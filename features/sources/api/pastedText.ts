/**
 * features/sources/api/pastedText.ts
 *
 * Builds the landing for text a person pasted into the Sources page
 * (SOURCE-CONVERGENCE §8.1 "Add → Paste text"): ONE `section` portion,
 * `origin_client='web'`, `capture_method='native'`, sent to `POST /sources/land`.
 *
 * PURE ON PURPOSE: no React, no Supabase, no app imports — only the generated
 * wire type — so the extension (or any client) can copy this file verbatim
 * and land pasted text the same way. Identity is the text itself
 * (`pasted-text:<sha256>`), so pasting the same text twice is one Source.
 *
 * `source_kind` is `inline` — the one registered kind for text that has no
 * origin row; the door accepts it and mints the source id itself (aidream
 * 1772395cd0). A door that refuses is shown to the person in its own words.
 */

import type { components } from "@/types/python-generated/api-types";

export type SourceLandingBody = components["schemas"]["SourceLanding"];

export const PASTED_TEXT_SOURCE_KIND = "inline";
/** Longest name derived from the first line of the text. */
export const PASTED_TEXT_NAME_MAX = 80;

export interface PastedTextInput {
  text: string;
  /** What the person called it; derived from the first line when blank. */
  name?: string | null;
  organizationId: string;
  userId: string;
  /** Injected for tests; defaults to now. */
  now?: Date;
}

/** The name a pasted text gets when the person did not name it. */
export function pastedTextName(text: string, name?: string | null): string {
  const given = (name ?? "").trim();
  if (given) return given.slice(0, 200);
  const firstLine =
    text
      .split(/\r?\n/)
      .map((l) => l.replace(/^#+\s*/, "").trim())
      .find((l) => l.length > 0) ?? "";
  if (!firstLine) return "Pasted text";
  return firstLine.length > PASTED_TEXT_NAME_MAX
    ? `${firstLine.slice(0, PASTED_TEXT_NAME_MAX - 1)}…`
    : firstLine;
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * The landing body. Refuses the empty in words (the door would too, but a
 * person should not wait for a round trip to learn they pasted nothing).
 */
export async function buildPastedTextLanding(
  input: PastedTextInput,
): Promise<SourceLandingBody> {
  const text = input.text.replace(/\r\n/g, "\n").trim();
  if (!text) {
    throw new Error("There is no text to save. Paste something first.");
  }
  const hash = await sha256Hex(text);
  const name = pastedTextName(text, input.name);
  return {
    source_kind: PASTED_TEXT_SOURCE_KIND,
    // Pasted text has no origin row: the door mints its source id.
    source_id: null,
    canonical_identity: `pasted-text:${hash}`,
    name,
    mime_type: "text/plain",
    portions: [
      {
        ordinal: 1,
        kind: "section",
        text,
        locator: { heading_path: [name], text_fragment: text.slice(0, 80) },
        method: "native",
      },
    ],
    provenance: {
      origin_client: "web",
      capture_method: "native",
      captured_at: (input.now ?? new Date()).toISOString(),
      user_id: input.userId,
    },
    // Landed unsaved: the Save panel opens next with Save on, so the person
    // chooses where it is filed in the same motion (and can decline).
    keep: false,
    // A Source is organization data (Arman 2026-09-26): no per-Source privacy.
    visibility: "internal",
    organization_id: input.organizationId,
  };
}
