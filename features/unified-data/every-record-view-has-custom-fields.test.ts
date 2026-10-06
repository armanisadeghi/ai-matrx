/**
 * @jest-environment node
 */
// G1 — EVERY RECORD VIEW HAS ITS CUSTOM FIELDS (lane 7 STANDARD-TABLES W5, static part).
//
// Owner (Arman): custom fields on every feature's records through the same mechanism as custom tables.
// Champion: Salesforce — one field definition appears on every layout and list view, no per-object code.
//
// The census (scripts/record-pages/census.ts) counts every route, window panel and peek, and every
// <MatrxDataTable>. Each declares in its own file which record it shows. This test reruns it fresh and
// fails when:
//   - a unit has no declaration and is not in the shrink-only ledger (lib/record-pages/pending.json);
//   - a ledger entry is declared now (stale — the ledger only shrinks);
//   - "record-view: <token>" names a token that is not an active Entity/Detail token with custom fields,
//     or the file renders no <EntityCustomFields entityToken="<token>"> through what it imports;
//   - "record-view: host" reaches no Detail host, or DetailHost.tsx binds no customFields port;
//   - a reason-less "record-view: none", or the views without a section rise above the ceiling;
//   - a <MatrxDataTable> sets no rowToken and is not in the ledger's tablesPending;
//   - a record view carries no "Linked records" section (<EntityBackLinks>, rendered by <EntityCustomFields> or mounted beside a StandardRecordForm);
//   - lib/record-pages/record-pages.generated.json is stale.
//
// THE LIVE PART (a section that renders nothing, a dead branch) is the safety-net walk
// scripts/safety-net/walks/custom-fields-everywhere.mjs (check custom-fields.walk-every-record-view).
//
// PLANTS — never a mutated real file:
//   RECORD_PAGES_PLANT="<repo path>=<scratch file>[;…]"   read the scratch file in place of the path
//   RECORD_PAGES_EXTRA_ROUTE="<pattern>=<repo source>"     add an undeclared route to the census
// e.g. a scratch copy of features/crm/components/record/PartyRecordPage.tsx with its
// <EntityCustomFields> removed turns this red ("declares "party" but renders no …").

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildCensus, toGenerated, type EntityTypeRow, type Ledger } from "@/scripts/record-pages/census";

const ROOT = resolve(__dirname, "..", "..");
const json = <T>(rel: string): T => JSON.parse(readFileSync(join(ROOT, rel), "utf8")) as T;

function plantedOverrides(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (process.env.RECORD_PAGES_PLANT ?? "").split(";").filter(Boolean)) {
    const [path, scratch] = pair.split("=");
    out[path] = readFileSync(scratch, "utf8");
  }
  return out;
}

function extraRoutes() {
  return (process.env.RECORD_PAGES_EXTRA_ROUTE ?? "")
    .split(";")
    .filter(Boolean)
    .map((pair) => {
      const [pattern, source] = pair.split("=");
      return { pattern, source };
    });
}

const entityTypes = json<EntityTypeRow[]>("lib/record-pages/entity-types.snapshot.json");
const ledger = json<Ledger>("lib/record-pages/pending.json");

describe("G1: every record view has its custom fields", () => {
  const census = buildCensus({
    root: ROOT,
    entityTypes,
    ledger,
    overrides: plantedOverrides(),
    extraRoutes: extraRoutes(),
  });

  it("every route, window, peek and table declares, and every declaration is true", () => {
    expect(census.problems).toEqual([]);
  });

  it("the generated page→token map is current (pnpm tsx scripts/record-pages/generate.ts)", () => {
    if (process.env.RECORD_PAGES_PLANT || process.env.RECORD_PAGES_EXTRA_ROUTE) return;
    expect(toGenerated(census)).toEqual(json("lib/record-pages/record-pages.generated.json"));
  });
});

// The guard's own proof: each fault it exists for, planted in memory, turns it red.
describe("G1 self-test: the guard can fail", () => {
  const party = "features/crm/components/record/PartyRecordPage.tsx";
  // The party section now lives inside the identity card's one form (StandardRecordForm).
  const card = "features/crm/components/record/PartyIdentityCard.tsx";
  const cardText = readFileSync(join(ROOT, card), "utf8");
  const partyText = readFileSync(join(ROOT, party), "utf8");
  const withoutSection = (t: string) => t.replace(/<StandardRecordForm\b[\s\S]*?>/g, "<div>");

  it("a record page that loses its section is red", () => {
    const stripped = withoutSection(cardText);
    expect(stripped).not.toEqual(cardText);
    const c = buildCensus({ root: ROOT, entityTypes, ledger, overrides: { [card]: stripped } });
    expect(c.problems.join("\n")).toMatch(/declares "party" but renders no <EntityCustomFields entityToken="party">/);
  });

  // LINKED RECORDS (AP-4): the party view must mount <EntityBackLinks>; losing it is red.
  it("a record view without Linked records is red", () => {
    const stripped = cardText.replace(/<EntityBackLinks\b[^>]*\/>/g, "");
    expect(stripped).not.toEqual(cardText);
    const c = buildCensus({ root: ROOT, entityTypes, ledger, overrides: { [card]: stripped } });
    expect(c.problems.join("\n")).toMatch(/record view without Linked records — "party" renders no <EntityBackLinks/);
  });

  it("the shared custom-fields line that stops rendering Linked records is red", () => {
    const shared = "features/unified-data/components/EntityCustomFields.tsx";
    const text = readFileSync(join(ROOT, shared), "utf8").replace(/<EntityBackLinks\b[^>]*\/>/g, "");
    const c = buildCensus({ root: ROOT, entityTypes, ledger, overrides: { [shared]: text } });
    expect(c.problems.join("\n")).toMatch(/renders no <EntityBackLinks>/);
  });

  it("a new undeclared route is red", () => {
    const c = buildCensus({
      root: ROOT,
      entityTypes,
      ledger,
      extraRoutes: [{ pattern: "/clinic-visits/[visitId]", source: party }],
      overrides: { [card]: withoutSection(cardText) },
    });
    expect(c.problems.join("\n")).toMatch(/route:\/clinic-visits\/\[visitId\]: shows no declaration/);
  });

  it("a token that takes no custom fields is red", () => {
    const route = "app/(core)/crm/[partyId]/page.tsx";
    const text = readFileSync(join(ROOT, route), "utf8").replace("// record-view: party", "// record-view: no_such_token");
    const c = buildCensus({ root: ROOT, entityTypes, ledger, overrides: { [route]: text } });
    expect(c.problems.join("\n")).toMatch(/"no_such_token", which is not a registry token/);
  });

  it("a reason-less exemption is red", () => {
    const route = "app/(core)/crm/[partyId]/page.tsx";
    const text = readFileSync(join(ROOT, route), "utf8").replace("// record-view: party", "// record-view: none");
    const c = buildCensus({ root: ROOT, entityTypes, ledger, overrides: { [route]: text } });
    expect(c.problems.join("\n")).toMatch(/"record-view: none" with no reason/);
  });
});
