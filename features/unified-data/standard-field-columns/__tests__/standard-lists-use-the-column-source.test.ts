// features/unified-data/standard-field-columns/__tests__/standard-lists-use-the-column-source.test.ts
//
// GUARD (feeds lane 7's G1 census): every standard list named here offers its organization's
// custom fields as columns through THE ONE generic source — the page mounts
// `useStandardFieldColumns("<token>", …)`, spreads its columns into the table, and its service
// applies the custom filters server-side. Remove any of the three from a list and this is red.
//
// Plant (never by editing the real file — a sweep would ship the mutant): copy a page to a
// scratch path with the source removed and point the env var at it, e.g.
//   STANDARD_COLUMNS_PLANT="features/crm/components/CrmListPage.tsx=/tmp/plant/CrmListPage.tsx" \
//     pnpm jest features/unified-data/standard-field-columns
// The self-test below also feeds a planted copy in-memory, so the check can never pass vacuously.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../../..");

interface StandardList {
  token: string;
  page: string;
  service: string;
}

/** Add a list here the day it mounts the source; the G1 census will make this a registry read. */
const STANDARD_LISTS: StandardList[] = [
  { token: "party", page: "features/crm/components/CrmListPage.tsx", service: "features/crm/service.ts" },
  { token: "crm_deal", page: "features/crm/components/deals/DealsPage.tsx", service: "features/crm/deals/service.ts" },
];

function plants(): Map<string, string> {
  const out = new Map<string, string>();
  for (const pair of (process.env.STANDARD_COLUMNS_PLANT ?? "").split(",").filter(Boolean)) {
    const [real, planted] = pair.split("=");
    if (real && planted) out.set(real, planted);
  }
  return out;
}

function read(path: string): string {
  return readFileSync(plants().get(path) ?? join(ROOT, path), "utf8");
}

/** What a list must carry, in words a failure prints. Empty = the list uses the source. */
export function missingFromList(token: string, pageText: string, serviceText: string): string[] {
  const missing: string[] = [];
  const hook = new RegExp(`useStandardFieldColumns<[^>]+>\\(\\s*"${token}"`);
  const match = pageText.match(/const (\w+) = useStandardFieldColumns</);
  if (!hook.test(pageText) || !match) missing.push(`the page does not mount useStandardFieldColumns("${token}")`);
  else if (!new RegExp(`\\.\\.\\.${match[1]}\\.columns`).test(pageText)) {
    missing.push("the source's columns are not spread into the table's columns");
  }
  if (!/applyCustomFieldFilters\(/.test(serviceText)) missing.push("the service does not apply custom filters server-side");
  if (!/customFieldOrderColumn\(/.test(serviceText)) missing.push("the service cannot sort on a custom field");
  return missing;
}

describe("standard lists offer custom fields through the one column source", () => {
  it.each(STANDARD_LISTS)("$page ($token)", ({ token, page, service }) => {
    expect(missingFromList(token, read(page), read(service))).toEqual([]);
  });

  it("self-test: a list with the source removed is caught", () => {
    const page = readFileSync(join(ROOT, STANDARD_LISTS[0].page), "utf8");
    const service = readFileSync(join(ROOT, STANDARD_LISTS[0].service), "utf8");
    const planted = page.replace(/useStandardFieldColumns</g, "useSomethingElse<");
    expect(missingFromList("party", planted, service)).not.toEqual([]);
    const unspread = page.replace(/\.\.\.customColumns\.columns/g, "");
    expect(missingFromList("party", unspread, service)).not.toEqual([]);
  });
});
