/**
 * THE CLIENT'S SENTENCES ARE KEYED BY THE SERVER'S ACTUAL CODES.
 *
 * `/api/google-integrations/capabilities` returns a machine CODE per refused
 * capability (`capabilities.py` → `admission_error=exc.code`) and the client
 * turns it into a sentence. On 2026-09-17 the zero-authorship verification of
 * the first Google moment found the map keyed three `*_internal_test_required`
 * spellings, one of which — `google_read_only_internal_test_required` — the hub
 * has never emitted, while the two codes it DOES emit for the read-only sweep,
 * `google_oauth_internal_test_required` and `google_read_only_sweep_paused`,
 * had no entry at all. Nothing lied, because the fallback sentence is true, but
 * the paused case (a 409 that means "paused for everyone", not "not you yet")
 * was being answered with the wrong one, and the map read as exact when it was
 * not.
 *
 * This suite is the forcing function for that class: a server code with no
 * client sentence fails here, and a client key that no longer exists on the
 * server fails here too. It reads the SERVER SOURCE when the sibling aidream
 * checkout is present, so a code added in aidream breaks this test rather than
 * reaching a person as a wrong sentence.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMISSION_LANGUAGE,
  GOOGLE_ADMISSION_CODES,
  admissionLanguage,
} from "../google-adapter";

const AIDREAM_ROOT =
  process.env.AIDREAM_DIR ?? join(process.cwd(), "..", "aidream");
const SERVICE_DIR = join(
  AIDREAM_ROOT,
  "aidream",
  "services",
  "google_integrations",
);
const SERVER_FILES = ["capabilities.py", "read_only_product_admission.py"].map(
  (name) => join(SERVICE_DIR, name),
);

/** Every code the two admission files can put on the wire. */
function codesFromServer(): string[] {
  const codes = new Set<string>();
  for (const file of SERVER_FILES) {
    const source = readFileSync(file, "utf8");
    // `GoogleCapabilityAdmissionError("<code>", ...)` — the catalog's own raise.
    for (const match of source.matchAll(
      /GoogleCapabilityAdmissionError\(\s*\n?\s*"([a-z0-9_]+)"/g,
    )) {
      codes.add(match[1]!);
    }
    // `error="<code>"` — the read-only admission dataclass's field.
    for (const match of source.matchAll(/\berror="([a-z0-9_]+)"/g)) {
      codes.add(match[1]!);
    }
  }
  return [...codes].sort();
}

describe("the admission map", () => {
  it("has one sentence per declared code, and no key beyond them", () => {
    expect(Object.keys(ADMISSION_LANGUAGE).sort()).toEqual(
      [...GOOGLE_ADMISSION_CODES].sort(),
    );
  });

  it("never renders a code to a person", () => {
    for (const code of GOOGLE_ADMISSION_CODES) {
      const sentence = admissionLanguage(code);
      expect(sentence).toBeTruthy();
      expect(sentence).not.toContain(code);
      expect(sentence).not.toContain("_");
    }
  });

  it("distinguishes 'not you yet' from 'paused for everyone'", () => {
    expect(admissionLanguage("google_oauth_internal_test_required")).toBe(
      "Turns on automatically when ready for your account.",
    );
    expect(admissionLanguage("google_read_only_sweep_paused")).toContain(
      "paused for everyone",
    );
  });

  it("still answers an unknown code with something true", () => {
    expect(admissionLanguage("something_new_from_the_hub")).toBe(
      "Turns on automatically when ready for your account.",
    );
    expect(admissionLanguage(null)).toBeNull();
    expect(admissionLanguage(undefined)).toBeNull();
  });

  it("carries no code the server stopped emitting — e.g. the retired spelling", () => {
    expect(
      Object.keys(ADMISSION_LANGUAGE),
    ).not.toContain("google_read_only_internal_test_required");
  });
});

/**
 * The cross-repo leg. It runs whenever the sibling aidream checkout is on this
 * machine (CI for this repo already checks one out for the realtime guard). It
 * is announced when it cannot run — an unmeasured leg never reads as a pass.
 */
const hasServer = SERVER_FILES.every((file) => existsSync(file));

(hasServer ? describe : describe.skip)(
  "the declared codes against the live aidream source",
  () => {
    it("is exactly what the two admission files raise", () => {
      expect(codesFromServer()).toEqual([...GOOGLE_ADMISSION_CODES].sort());
    });
  },
);

it("says out loud when the cross-repo leg could not run", () => {
  if (!hasServer) {
    // Not a silent skip: the reason is printed where the failure would be.
    console.warn(
      `UNMEASURED: the aidream checkout was not found at ${SERVICE_DIR}, so the` +
        " admission codes were checked against the client's declared set only." +
        " Set AIDREAM_DIR to the sibling checkout to measure it.",
    );
  }
  expect(true).toBe(true);
});
