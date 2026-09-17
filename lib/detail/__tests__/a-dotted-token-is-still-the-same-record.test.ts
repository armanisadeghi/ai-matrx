// 🚨 NEW-25 (VERIFY-U-P1-R4) — A `.` OR A `:` IN A TYPE TOKEN OR AN ID NEVER
// RETARGETS THE RECORD.
//
// `encodeURIComponent` leaves `.` alone, and every spelling of a record in a URL
// — the page query's `type.id` list entries AND the `?panels=detail:<type>.<id>`
// instance key — splits on the FIRST dot. So `{type: "gr.ant", id: "x.y"}` came
// back as `{type: "gr", id: "ant.x.y"}`: a DIFFERENT record, silently, on both
// URL spellings. `sc-domain:example.com` is already a real Search Console
// identifier, so the first external-id detail type lands on this.
//
// The rule: the separator is escaped on encode and therefore unambiguous on
// decode — one encoder, one decoder, both spellings, and the round trip returns
// the record that went in.

import { decodeListItems, encodeListItems } from "../listContext";
import {
  decodePanelArgValue,
  detailInstanceKey,
  encodePanelArgValue,
  parseDetailInstanceKey,
} from "../presentation";

const AWKWARD = [
  { type: "gr.ant", id: "x.y" },
  { type: "linked_document", id: "sc-domain:example.com" },
  { type: "sc.property", id: "https://example.com/a,b" },
  { type: "file", id: "11111111-2222-3333-4444-555555555555" },
];

describe("a record whose type or id carries the separator", () => {
  it("round trips through the page query's list spelling", () => {
    expect(decodeListItems(encodeListItems(AWKWARD))).toEqual(AWKWARD);
  });

  it("round trips through the panel token's escaped list value", () => {
    const value = encodePanelArgValue(encodeListItems(AWKWARD));
    // The token's grammar: no separator the panel parser splits on survives.
    expect(value).not.toMatch(/[-_,:]/);
    expect(decodeListItems(decodePanelArgValue(value))).toEqual(AWKWARD);
  });

  it("round trips through the `?panels=detail:` instance key", () => {
    for (const ref of AWKWARD) {
      expect(parseDetailInstanceKey(detailInstanceKey(ref))).toEqual(ref);
    }
  });

  it("never lets one record's key parse as another record", () => {
    const dotted = detailInstanceKey({ type: "gr.ant", id: "x.y" });
    const plain = detailInstanceKey({ type: "gr", id: "ant.x.y" });
    expect(dotted).not.toBe(plain);
  });
});
