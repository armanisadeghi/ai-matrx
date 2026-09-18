// 🚨 N4 (VERIFY-U-P1-R5) — THE PAGE PRESENTATION'S LIST QUERY MUST SURVIVE THE
// ONLY DECODE LAYER IT HAS: AN ORDINARY QUERY PARSE.
//
// Round 4 (NEW-25) escaped `.` `:` `,` to `%2E` `%3A` `%2C` in `encodeRefPart`,
// which closed the `?panels=detail:` token — three escaping layers, three decodes
// — and did NOT close `?l=`. `new URL(...).searchParams` is the algorithm the
// page route's `searchParams` come from, and it percent-decodes the value BEFORE
// `decodeListItems` splits it, so `%2E` was a literal `.` again:
//
//   what a query parse gives: gsc_property.sc-domain:example.com,gr.ant.x.y
//   after the parse         : {type: "gr", id: "ant.x.y"}   ← A DIFFERENT RECORD
//
// and an id containing a comma was TRUNCATED at the comma. Both silent; both
// reachable by arrowing on a real page (a Search Console property's id is
// `sc-domain:example.com` today).
//
// The grammar carries no `%` now — percent-encoding spelled with `~` over
// `A-Za-z0-9-_~` — so it is invariant under any number of percent-decodes.
//
// This is the verifier's own node-level probe, kept: the REAL encoder text driven
// through the REAL parse, not a direct round trip.

import { decodeListItems, encodeListItems, encodeRefPart } from "../listContext";
import {
  decodePanelArgValue,
  detailInstanceKey,
  encodeListQuery,
  encodePanelArgValue,
  parseDetailInstanceKey,
} from "../presentation";
import type { DetailRef } from "../types";

/** What `?l=<value>` comes back as after the parse the page route goes through. */
function throughAQueryParse(query: string): string {
  return new URL(`https://app.aimatrx.com/detail/party/1${query}`).searchParams.get("l") ?? "";
}

const AWKWARD: DetailRef[] = [
  { type: "gsc_property", id: "sc-domain:example.com" },
  { type: "gr.ant", id: "x.y" },
  { type: "x", id: "a,b" },
  { type: "file", id: "11111111-2222-3333-4444-555555555555" },
  { type: "odd", id: "a~b.c,d:e" },
  { type: "pct", id: "a%41b" },
];

describe("the page presentation's list query", () => {
  it("carries no percent at all, so a query parse cannot change it", () => {
    for (const ref of AWKWARD) {
      expect(encodeRefPart(ref.type)).not.toMatch(/[%.:,]/);
      expect(encodeRefPart(ref.id)).not.toMatch(/[%.:,]/);
    }
  });

  it("returns the records that went in, THROUGH the parse (the probe that was red)", () => {
    const query = encodeListQuery({ items: AWKWARD, index: 1 }, 100);
    const value = throughAQueryParse(query);
    expect(value).toBe(new URLSearchParams(query.slice(1)).get("l"));
    expect(decodeListItems(value)).toEqual(AWKWARD);
  });

  it("never lets a dotted type token become a shorter one", () => {
    const dotted: DetailRef[] = [{ type: "gr.ant", id: "plain" }];
    expect(decodeListItems(throughAQueryParse(encodeListQuery({ items: dotted, index: 0 }, 100))))
      .toEqual(dotted);
  });

  it("never truncates an id at a comma", () => {
    const comma: DetailRef[] = [{ type: "x", id: "a,b" }];
    expect(decodeListItems(throughAQueryParse(encodeListQuery({ items: comma, index: 0 }, 100))))
      .toEqual(comma);
  });

  it("still round trips through the token's grammar, which has three layers (control)", () => {
    const value = encodePanelArgValue(encodeListItems(AWKWARD));
    // The token parser splits on these four; none may survive the escaping.
    expect(value).not.toMatch(/[-_,:]/);
    expect(decodeListItems(decodePanelArgValue(value))).toEqual(AWKWARD);
    for (const ref of AWKWARD) {
      expect(parseDetailInstanceKey(detailInstanceKey(ref))).toEqual(ref);
    }
  });
});
