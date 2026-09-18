// features/crm/gmail/reviewed-send-exemptions-are-the-servers.test.ts
//
// CENSUS — THE EXEMPTION TABLE THIS CLIENT DISCLOSES IS THE SPINE'S, MEASURED.
//
// `./reviewed-send-exemptions.ts` tells the approver which of the authority's
// blocks the spine will set aside and why. That disclosure is only worth
// anything if it is the SAME set the server actually exempts: a client showing a
// stale table would tell a person a rule was set aside when in fact it refused
// the send (or the reverse, which is worse — a refusal presented as a note).
//
// So this reads `GATE_EXEMPT_BLOCKS` out of the sibling aidream checkout and
// diffs it BOTH WAYS, codes and sentences, and measures the one-line envelope
// predicate the pre-click compliance-class disclosure mirrors.
//
// UNMEASURED and passing only when the checkout is absent.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BODY_HASH_MISMATCH_BLOCK_CODE,
  COMPLIANCE_CLASS_COMMERCIAL,
  COMPLIANCE_CLASS_CORRESPONDENCE,
  CORRESPONDENCE_EXEMPT_BLOCKS,
  REVIEWED_SEND_EXEMPT_BLOCKS,
  complianceFooterWillBeAppended,
  exemptionsFor,
} from "./reviewed-send-exemptions";

const AIDREAM_ROOT =
  process.env.AIDREAM_DIR ?? join(process.cwd(), "..", "aidream");
const REVIEWED_SEND = join(
  AIDREAM_ROOT,
  "aidream",
  "services",
  "outreach_single_send",
  "reviewed_send.py",
);

const measurable = existsSync(REVIEWED_SEND);

/**
 * The `GATE_EXEMPT_BLOCKS` mapping, as Python declares it.
 *
 * Read as a whole block (from the assignment to the closing brace at column 0)
 * so a comment line between entries cannot be mistaken for one, then each
 * `"code": "…"` or `"code": ( "…" "…" )` pair collapsed the way Python
 * concatenates adjacent string literals.
 */
function serverExemptBlocks(
  name = "GATE_EXEMPT_BLOCKS",
): Record<string, string> {
  const source = readFileSync(REVIEWED_SEND, "utf8");
  const start = source.indexOf(`${name}: Mapping[str, str] = {`);
  if (start < 0) {
    throw new Error(
      `${REVIEWED_SEND} no longer declares ${name}. Fix this reader ` +
        "rather than deleting the check — a census that measures nothing is " +
        "worse than none.",
    );
  }
  const end = source.indexOf("\n}", start);
  const block = `${source.slice(start, end)}\n`;
  const table: Record<string, string> = {};
  // Each entry: a quoted key, a colon, then one or more quoted fragments
  // (optionally parenthesised and split over lines) up to the trailing comma.
  const entry = /"([a-z_0-9]+)"\s*:\s*(\(?[\s\S]*?"\s*\)?),\n/g;
  for (const match of block.matchAll(entry)) {
    const code = match[1]!;
    const fragments = [...match[2]!.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(
      (piece) => piece[1]!,
    );
    if (fragments.length === 0) continue;
    table[code] = fragments.join("");
  }
  if (Object.keys(table).length === 0) {
    throw new Error(
      `${REVIEWED_SEND} ${name} parsed to ZERO entries. Fix this reader.`,
    );
  }
  return table;
}

(measurable ? describe : describe.skip)(
  "the reviewed-send exemption table against the live spine",
  () => {
    it("exempts exactly the codes the spine exempts", () => {
      const server = serverExemptBlocks();
      expect(Object.keys(REVIEWED_SEND_EXEMPT_BLOCKS).sort()).toEqual(
        Object.keys(server).sort(),
      );
    });

    it("gives the spine's own reason for each one, word for word", () => {
      const server = serverExemptBlocks();
      for (const [code, reason] of Object.entries(server)) {
        expect(REVIEWED_SEND_EXEMPT_BLOCKS[code]).toBe(reason);
      }
    });

    it("never claims an ENFORCED recipient rule is exempt", () => {
      // The codes the path exists to enforce. Disclosing one of these as "set
      // aside" would be the dangerous direction of this defect.
      const source = readFileSync(REVIEWED_SEND, "utf8");
      const enforced = [
        ...source
          .slice(source.indexOf("ENFORCED_BLOCK_EXAMPLES"))
          .slice(0, 600)
          .matchAll(/"([a-z_0-9]+)"/g),
      ].map((match) => match[1]!);
      expect(enforced.length).toBeGreaterThan(5);
      for (const code of enforced) {
        expect(REVIEWED_SEND_EXEMPT_BLOCKS[code]).toBeUndefined();
      }
    });

    it("can fail: a code the spine does not exempt is detected", () => {
      // FALSIFIABILITY — a reader that returned every name would pass the three
      // assertions above without measuring anything.
      const server = serverExemptBlocks();
      expect(server.unsubscribed).toBeUndefined();
      expect(server.list_not_found).toBe(
        "A reviewed 1:1 message belongs to no outreach list.",
      );
    });

    it("exempts the identity-readiness codes for a correspondence mailbox", () => {
      const server = serverExemptBlocks("CORRESPONDENCE_EXEMPT_BLOCKS");
      expect(Object.keys(CORRESPONDENCE_EXEMPT_BLOCKS).sort()).toEqual(
        Object.keys(server).sort(),
      );
      for (const [code, reason] of Object.entries(server)) {
        expect(CORRESPONDENCE_EXEMPT_BLOCKS[code]).toBe(reason);
      }
    });

    it("assembles the table the way `exemptions_for` does, failing closed", () => {
      const source = readFileSync(REVIEWED_SEND, "utf8");
      // `if identity_purpose != PURPOSE_CORRESPONDENCE: return GATE_EXEMPT_BLOCKS`
      // — anything that is not the literal word gets the narrow table.
      expect(source).toMatch(
        /if identity_purpose != PURPOSE_CORRESPONDENCE:\s*\n\s*return GATE_EXEMPT_BLOCKS/,
      );
      expect(Object.hasOwn(exemptionsFor(null), "domain_unverified")).toBe(false);
      expect(Object.hasOwn(exemptionsFor("outreach"), "domain_unverified")).toBe(
        false,
      );
      expect(
        Object.hasOwn(exemptionsFor("correspondence"), "domain_unverified"),
      ).toBe(true);
      // And a purpose nobody declared never widens it.
      expect(
        Object.hasOwn(exemptionsFor("something_new"), "domain_unverified"),
      ).toBe(false);
    });

    it("mirrors the envelope predicate, purpose and all", () => {
      const source = readFileSync(REVIEWED_SEND, "utf8");
      // The spine's own two lines: both ids required, and a correspondence
      // mailbox never carries the footer (R24 / W4).
      expect(source).toMatch(/if not \(identity_id and medium_id\):\s*\n\s*return False/);
      expect(source).toMatch(/return identity_purpose != PURPOSE_CORRESPONDENCE/);
      expect(
        complianceFooterWillBeAppended({
          identityId: "id-1",
          mediumId: "medium-1",
        }),
      ).toBe(true);
      expect(
        complianceFooterWillBeAppended({
          identityId: "id-1",
          mediumId: "medium-1",
          identityPurpose: "correspondence",
        }),
      ).toBe(false);
      expect(
        complianceFooterWillBeAppended({ identityId: "id-1", mediumId: null }),
      ).toBe(false);
      expect(
        complianceFooterWillBeAppended({ identityId: null, mediumId: "m" }),
      ).toBe(false);
      // A whitespace-only id is not an id.
      expect(
        complianceFooterWillBeAppended({ identityId: " ", mediumId: "m" }),
      ).toBe(false);
    });

    it("names the two compliance classes the spine names", () => {
      const source = readFileSync(REVIEWED_SEND, "utf8");
      expect(source).toMatch(
        new RegExp(
          `COMPLIANCE_CLASS_CORRESPONDENCE = "${COMPLIANCE_CLASS_CORRESPONDENCE}"`,
        ),
      );
      expect(source).toMatch(
        new RegExp(
          `COMPLIANCE_CLASS_COMMERCIAL = "${COMPLIANCE_CLASS_COMMERCIAL}"`,
        ),
      );
    });

    it("UNMEASURED-until-present: the body-hash refusal code (R24)", () => {
      const source = readFileSync(REVIEWED_SEND, "utf8");
      if (source.includes(BODY_HASH_MISMATCH_BLOCK_CODE)) {
        throw new Error(
          `\`${BODY_HASH_MISMATCH_BLOCK_CODE}\` is now declared by the spine ` +
            "(aidream lane B-26). Promote this UNMEASURED-until-present leg to an " +
            "ordinary assertion in " +
            "features/crm/gmail/reviewed-send-exemptions-are-the-servers.test.ts.",
        );
      }
      console.warn(
        "UNMEASURED-until-present: the spine does not declare a " +
          `\`${BODY_HASH_MISMATCH_BLOCK_CODE}\` refusal yet, so R24 (the body sent ` +
          "is the body approved) is not enforced server-side and the client's " +
          "naming of that refusal could not be measured. A mismatch refusal " +
          "still renders through `reviewedSendRefusalOf`'s generic path.",
      );
      expect(source).not.toContain(BODY_HASH_MISMATCH_BLOCK_CODE);
    });
  },
);

it("says out loud when the cross-repo leg could not run", () => {
  if (!measurable) {
    console.warn(
      `UNMEASURED: ${REVIEWED_SEND} was not found, so ` +
        "features/crm/gmail/reviewed-send-exemptions.ts was NOT compared against " +
        "the spine. Set AIDREAM_DIR to the sibling checkout.",
    );
  }
  expect(true).toBe(true);
});
