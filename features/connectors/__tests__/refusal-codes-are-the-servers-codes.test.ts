/**
 * THE CLIENT'S REFUSAL VOCABULARY IS THE SERVER'S.
 *
 * A Google call that is refused is classified ONCE, on the server, in
 * `aidream/aidream/services/google_integrations/call_health.py` (`RefusalCode`),
 * and stored on the connection row. The client decides what each code MEANS for
 * the person — reconnect, wait, ours to repair, retry — and that decision is
 * useless if the two lists drift: a code with no disposition would render a
 * refusal with no expectation and, worse, no button where one is owed.
 *
 * So this suite is the forcing function, built the same way as
 * `admission-codes-are-the-servers-codes.test.ts`: it reads the SERVER SOURCE
 * when the sibling aidream checkout is present, and it announces itself out
 * loud when it cannot — an unmeasured leg never reads as a pass.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONNECTOR_REFUSAL_CODES,
  isConnectorRefusalCode,
  refusalDisposition,
} from "../health";

const AIDREAM_ROOT =
  process.env.AIDREAM_DIR ?? join(process.cwd(), "..", "aidream");
const CALL_HEALTH = join(
  AIDREAM_ROOT,
  "aidream",
  "services",
  "google_integrations",
  "call_health.py",
);

/** The `RefusalCode = Literal[...]` union, as the server declares it. */
function codesFromServer(): string[] {
  const source = readFileSync(CALL_HEALTH, "utf8");
  const union = source.match(/RefusalCode = Literal\[([\s\S]*?)\]/);
  if (!union) {
    throw new Error(
      `${CALL_HEALTH} no longer declares 'RefusalCode = Literal[...]'. The ` +
        "client's refusal vocabulary cannot be measured against it — fix this " +
        "reader rather than deleting the check.",
    );
  }
  return [...union[1]!.matchAll(/"([a-z0-9_]+)"/g)]
    .map((match) => match[1]!)
    .sort();
}

describe("the refusal vocabulary", () => {
  it("gives every code exactly one disposition", () => {
    for (const code of CONNECTOR_REFUSAL_CODES) {
      expect(refusalDisposition(code)).toBeTruthy();
    }
  });

  it("recognizes only the declared codes", () => {
    expect(isConnectorRefusalCode("scope_missing")).toBe(true);
    expect(isConnectorRefusalCode("something_new_from_the_hub")).toBe(false);
    expect(isConnectorRefusalCode(null)).toBe(false);
    expect(isConnectorRefusalCode(42)).toBe(false);
  });
});

const hasServer = existsSync(CALL_HEALTH);

(hasServer ? describe : describe.skip)(
  "the declared codes against the live aidream source",
  () => {
    it("is exactly what the recording seam can classify", () => {
      expect(codesFromServer()).toEqual([...CONNECTOR_REFUSAL_CODES].sort());
    });
  },
);

it("says out loud when the cross-repo leg could not run", () => {
  if (!hasServer) {
    console.warn(
      `UNMEASURED: the aidream checkout was not found at ${CALL_HEALTH}, so the` +
        " refusal codes were checked against the client's declared set only." +
        " Set AIDREAM_DIR to the sibling checkout to measure it.",
    );
  }
  expect(true).toBe(true);
});
