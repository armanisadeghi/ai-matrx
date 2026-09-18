/**
 * CENSUS — THE CLIENT'S CONNECTION-STATUS VOCABULARY IS THE SERVER'S, MEASURED.
 *
 * WHY THIS EXISTS (VERIFY-U-P2-R5, finding V17-1, and chair ruling R22).
 * `users.integration_connections.status` is written by aidream and read by the
 * browser, and the browser used to collapse EVERY word it did not recognise into
 * `connected` (`features/marketing/google/service.ts::connectionSummary`). So the
 * day the server gained a third terminal word — `unavailable`, for "the provider
 * or our own platform configuration blocks every call and nothing you can click
 * repairs it" — the card would have printed "Connected" over it, which is the
 * exact lie PLAN §5.3 exists to forbid: *"Connected is never a boolean that
 * lies."*
 *
 * A hand-copied union with nothing diffing the two repos is the V14-4 defect
 * (`features/approvals/__tests__/receipt-states-are-the-servers-states.test.ts`),
 * so this reads the server's own declaration out of the sibling aidream checkout,
 * exactly like `refusal-codes-are-the-servers-codes.test.ts` and
 * `admission-codes-are-the-servers-codes.test.ts` do for their vocabularies.
 *
 * THE THREE LEGS:
 *   1. every status the SERVER declares is one this build recognises — a word we
 *      have no branch for cannot ship;
 *   2. every status this build recognises that the server does NOT declare
 *      carries its reason in `CLIENT_ONLY_CONNECTION_STATUSES` (that is how
 *      `revoked` — Google's own disconnect word — stays lawful without the union
 *      quietly growing);
 *   3. an unrecognised word is `null`, never `connected`, and blocks everything.
 *
 * 🚨 WHAT IT READS, so lane B-23 can keep it measuring. The declaration lives in
 * `aidream/aidream/services/connection_health.py`. B-23 exports the whole set as
 * `CONNECTION_STATUSES = (...)`; until it lands, the file declares one constant
 * per line (`CONNECTED = "connected"`), and the fallback reader below reads those
 * — EVERY module-level `NAME = "lower_snake"` except the three named non-status
 * constants, so a new status word cannot hide from it. That leg is named
 * UNMEASURED-until-present so nobody reads it as the stronger proof.
 *
 * PROVEN TO FAIL: a fourth status planted in a scratch copy of the server file
 * (`CONNECTION_STATUSES = (…, "suspended_by_provider")`, and separately
 * `SUSPENDED_BY_PROVIDER = "suspended_by_provider"`) is named by both legs with
 * `AIDREAM_DIR` pointed at the scratch tree. With the checkout absent the
 * server legs print UNMEASURED and are SKIPPED — never a pass that reads as a
 * measurement.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CLIENT_ONLY_CONNECTION_STATUSES,
  CONNECTION_STATUSES,
  readConnectionStatus,
  statusBlocksEverything,
} from "../connection-status";

const AIDREAM_ROOT =
  process.env.AIDREAM_DIR ?? join(process.cwd(), "..", "aidream");

/** Where the server declares the status words, newest home first. */
const STATUS_SOURCES = [
  join(AIDREAM_ROOT, "aidream", "services", "connection_health.py"),
] as const;

/**
 * Module-level constants in that file that are NOT status words. Named, because
 * the fallback reader is otherwise generic: a constant added there without being
 * added here fails this suite with a remedy, which is the right way round — the
 * alternative (a hand list of status names) is the copy this census replaces.
 */
const NON_STATUS_CONSTANTS = new Set([
  "STAMP_KEY",
  "CAPABILITY_HEALTH_KIND",
  "LEGACY_GOOGLE_CAPABILITY_HEALTH_KIND",
]);

function serverSourceFile(): string | null {
  return (
    STATUS_SOURCES.find(
      (path) =>
        existsSync(path) &&
        /^(CONNECTION_STATUSES = |CONNECTED = ")/m.test(readFileSync(path, "utf8")),
    ) ?? null
  );
}

/** The exported set, when the server exports one. Null until B-23 lands it. */
function declaredStatusSet(path: string): string[] | null {
  const source = readFileSync(path, "utf8");
  const match = /^CONNECTION_STATUSES(?::[^=]+)? = [([]([\s\S]*?)[)\]]/m.exec(source);
  if (!match) return null;
  const found = [...match[1]!.matchAll(/"([a-z][a-z_]*)"/g)].map((m) => m[1]!);
  if (found.length === 0) {
    throw new Error(
      `${path} declares CONNECTION_STATUSES but no string values could be read from ` +
        "it. Fix this reader rather than deleting the check — a census that measures " +
        "nothing is worse than none.",
    );
  }
  return [...new Set(found)].sort();
}

/** Every `NAME = "lower_snake"` constant that is not a declared non-status one. */
function statusConstants(path: string): string[] {
  const source = readFileSync(path, "utf8");
  const rows = [...source.matchAll(/^([A-Z][A-Z0-9_]*) = "([a-z][a-z0-9_]*)"$/gm)];
  const named = rows.filter(([, name]) => !NON_STATUS_CONSTANTS.has(name!));
  if (named.length === 0) {
    throw new Error(
      `${path} no longer declares 'NAME = "value"' status constants. Point ` +
        "STATUS_SOURCES at the module that now declares them (or read the exported " +
        "CONNECTION_STATUSES) rather than deleting the check.",
    );
  }
  return [...new Set(named.map(([, , value]) => value!))].sort();
}

const serverFile = serverSourceFile();
const exportedSet = serverFile ? declaredStatusSet(serverFile) : null;

describe("the status vocabulary this build declares", () => {
  it("answers null — never `connected` — for a word it has never heard of", () => {
    for (const word of ["suspended_by_provider", "UNAVAILABLE", "", "pending"]) {
      const reading = readConnectionStatus(word);
      expect(reading.status).toBeNull();
      // The word is KEPT, for the operator surface that may name it.
      expect(reading.asRead).toBe(word);
      // And it blocks: nothing may render an unvouchable claim as working.
      expect(statusBlocksEverything(reading)).toBe(true);
    }
  });

  it("treats a missing or non-string column exactly like an unknown word", () => {
    for (const value of [null, undefined, 3, {}]) {
      const reading = readConnectionStatus(value);
      expect(reading.status).toBeNull();
      expect(statusBlocksEverything(reading)).toBe(true);
    }
  });

  it("blocks on `unavailable` and only on the words that cannot be pressed away", () => {
    expect(statusBlocksEverything(readConnectionStatus("unavailable"))).toBe(true);
    expect(statusBlocksEverything(readConnectionStatus("connected"))).toBe(false);
    expect(statusBlocksEverything(readConnectionStatus("needs_attention"))).toBe(
      false,
    );
  });

  it("names a reason for every word the shared vocabulary does not declare", () => {
    // Guards the guard: a client-only entry that is not even a status would make
    // leg 2 below vacuously true.
    for (const status of Object.keys(CLIENT_ONLY_CONNECTION_STATUSES)) {
      expect(CONNECTION_STATUSES as readonly string[]).toContain(status);
      expect(
        CLIENT_ONLY_CONNECTION_STATUSES[
          status as keyof typeof CLIENT_ONLY_CONNECTION_STATUSES
        ],
      ).toMatch(/[a-z]/);
    }
  });
});

(serverFile ? describe : describe.skip)(
  "against the live aidream declaration" +
    (serverFile ? "" : " — UNMEASURED: no aidream checkout, nothing was compared"),
  () => {
    (exportedSet ? it : it.skip)(
      "recognises every status the server's exported set declares" +
        (exportedSet
          ? ""
          : " — UNMEASURED-until-present: connection_health.py does not export CONNECTION_STATUSES yet (lane B-23)"),
      () => {
        const unknown = (exportedSet ?? []).filter(
          (status) => !(CONNECTION_STATUSES as readonly string[]).includes(status),
        );
        expect({
          server: exportedSet,
          client: [...CONNECTION_STATUSES],
          unknownToThisBuild: unknown,
        }).toEqual({
          server: exportedSet,
          client: [...CONNECTION_STATUSES],
          unknownToThisBuild: [],
        });
      },
    );

    it("recognises every status word the server file declares as a constant", () => {
      const declared = statusConstants(serverFile!);
      const unknown = declared.filter(
        (status) => !(CONNECTION_STATUSES as readonly string[]).includes(status),
      );
      expect({ declared, unknownToThisBuild: unknown }).toEqual({
        declared,
        unknownToThisBuild: [],
      });
    });

    it("carries a reason for every word of its own the server does not declare", () => {
      const declared = new Set([
        ...(exportedSet ?? []),
        ...statusConstants(serverFile!),
      ]);
      const extra = CONNECTION_STATUSES.filter(
        (status) => !declared.has(status),
      ).filter((status) => !(status in CLIENT_ONLY_CONNECTION_STATUSES));
      expect({ withoutAReason: extra }).toEqual({ withoutAReason: [] });
    });
  },
);
