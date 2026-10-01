/**
 * THE durable-id seam (lib/ids/durable-record-id.ts).
 *
 * 1. Behavior: every id the stream mints for a record the database never saw
 *    answers "no durable id"; a real row id passes through unchanged.
 * 2. Census: client-temp ids are minted ONLY through `mintClientTempId`. A
 *    hand-built `client-assistant-…` template elsewhere is a second door into
 *    the class (an id `durableRecordId` might not recognise). The census reads
 *    the source tree and fails on any new member; its self-test proves the
 *    pattern catches the exact template process-stream used before 2026-10-01.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  CLIENT_TEMP_ID_PREFIX,
  durableRecordId,
  isClientTempId,
  mintClientTempId,
} from "./durable-record-id";

describe("durableRecordId", () => {
  it.each([
    mintClientTempId("assistant", "req_e61282d2-70ce-45f9-bac3-ebbd3f78d7e1"),
    mintClientTempId(
      "assistant",
      "req_4f0b9c1e-2d3a-4c5b-9e8f-7a6b5c4d3e2f",
      "iter2",
    ),
    mintClientTempId("tool-call", "toolu_01H8ZQ"),
    "",
    null,
    undefined,
  ])("answers null for %p", (id) => {
    expect(durableRecordId(id)).toBeNull();
  });

  it.each([
    "263550e7-eb60-4e8e-97ee-e19297126ebe",
    "993b734d-bd03-45bb-9bdd-0458025c89fb",
  ])("passes the row id %s through", (id) => {
    expect(durableRecordId(id)).toBe(id);
  });

  it("marks what it mints as client-temp, and a row id as not", () => {
    expect(isClientTempId(mintClientTempId("assistant", "req_1"))).toBe(true);
    expect(isClientTempId("263550e7-eb60-4e8e-97ee-e19297126ebe")).toBe(false);
  });
});

// ── Census ────────────────────────────────────────────────────────────────

const REPO = join(__dirname, "..", "..");
const ROOTS = ["features", "lib", "components", "app", "hooks", "providers", "utils"];
const SKIP_DIRS = new Set(["node_modules", ".next", "__tests__", "test-utils"]);
const THIS_SEAM = join("lib", "ids", "durable-record-id.ts");

/** A string or template literal that hand-builds a client-temp record id. */
const HAND_BUILT_TEMP_ID = new RegExp(
  `[\`"']${CLIENT_TEMP_ID_PREFIX}(assistant|tool-call|user|message)-`,
);

function sourceFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("client-temp id census", () => {
  it("self-test: the pattern catches the pre-2026-10-01 hand-built template", () => {
    expect(
      HAND_BUILT_TEMP_ID.test("const tempId = `client-assistant-${requestId}`;"),
    ).toBe(true);
    expect(HAND_BUILT_TEMP_ID.test('dbId = "client-tool-call-" + callId;')).toBe(
      true,
    );
    expect(HAND_BUILT_TEMP_ID.test('mintClientTempId("assistant", requestId)')).toBe(
      false,
    );
  });

  it("no source file hand-builds a client-temp id outside the seam", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of sourceFiles(join(REPO, root))) {
        const rel = relative(REPO, file);
        if (rel === THIS_SEAM) continue;
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          if (HAND_BUILT_TEMP_ID.test(line)) offenders.push(`${rel}:${i + 1}`);
        });
      }
    }
    // Remedy: mint through mintClientTempId (lib/ids/durable-record-id.ts).
    expect(offenders).toEqual([]);
  });
});
