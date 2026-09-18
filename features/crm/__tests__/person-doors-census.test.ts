/**
 * features/crm/__tests__/person-doors-census.test.ts
 *
 * THE DOOR LAW census for F-40's find: ~13 files across the Google-native
 * campaign hand-rolled a `<Link>`/`<a>` straight at `/crm/${partyId}` instead
 * of going through `EntityRef token="party"` (route + new tab + peek, one
 * primitive). A hand-built anchor loses the peek and, unless it also hand-
 * rolled `target="_blank"` and an aria-label, the explicit new-tab door too —
 * and it drifts the moment the party route changes.
 *
 * This test is the guard against a NEW hand-built Person door reappearing in
 * any of the census files. It is source-level (regex over the file text, not
 * a render), because the point is "no raw `/crm/${personId}` interpolation",
 * not any one file's runtime behaviour — those are covered by each feature's
 * own suites.
 *
 * The pattern it looks for is deliberately narrow: `/crm/${` with NOTHING
 * between `crm/` and the interpolation. Every legitimate non-Person `/crm/`
 * route carries a literal path segment first — `/crm/outreach-lists/${id}`,
 * `/crm/sending-identities/${id}`, `/crm/duplicates` — so those never match.
 * `crm.party` is the only entity addressed at `/crm/<id>` with no segment.
 *
 * RED before the conversion (2026-09-17, lane F-43): every file below had at
 * least one hit. GREEN after: the party-naming sites all moved to EntityRef;
 * the survivors are either literal-segment routes (never Person doors) or an
 * EntityRef `href` override carrying the same interpolation (chasebox's
 * `?interaction=` deep link) — which the second, EntityRef-aware pattern
 * below excludes explicitly.
 */
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../..");

// The exact census from F-40 (231c8a87), plus GoogleContactsImportPanel.tsx —
// the one F-43 was told to start with.
const CENSUS_FILES = [
  "features/crm/components/dedup/DuplicateReviewPage.tsx",
  "features/crm/components/dedup/MergeStatusCard.tsx",
  "features/crm/components/dedup/CandidatePairCard.tsx",
  "features/crm/components/record/EmploymentCard.tsx",
  "features/crm/components/outreach-lists/CallQueuePage.tsx",
  "features/crm/components/outreach-lists/OutreachListDetailPage.tsx",
  "features/crm/chasebox/components/ChaseboxDraftDialog.tsx",
  "features/crm/inbox/components/InboxReplyDialog.tsx",
  "features/crm/inbox/useInboxRowActions.tsx",
  "features/research/components/experts/TopicExperts.tsx",
  "features/marketing/content-plan/components/NodeAssociations.tsx",
  "features/marketing/content-plan/components/EntityManager.tsx",
  "features/connectors/import/GoogleContactsImportPanel.tsx",
];

// A bare `/crm/${` with no literal segment in between is a Person door.
// (?<!\w) guards against matching inside a longer path we don't care about.
const RAW_PARTY_HREF = /\/crm\/\$\{/;

// A raw `<Link` or `<a` tag (not `<EntityRef`) whose own `href={` attribute
// carries the pattern above, within a short window after the tag opens —
// good enough for JSX where `href` is usually the first or second prop.
function findHandBuiltPartyLinks(source: string): string[] {
  const hits: string[] = [];
  const tagPattern = /<(Link|a)\b[^>]*?href=\{`([^`]*)`\}/gs;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(source)) !== null) {
    const [, , hrefTemplate] = match;
    if (RAW_PARTY_HREF.test(hrefTemplate)) {
      const line = source.slice(0, match.index).split("\n").length;
      hits.push(`line ${line}: <${match[1]} href={\`${hrefTemplate}\`}>`);
    }
  }
  return hits;
}

describe("THE DOOR LAW: no hand-built Person link survives in the census files", () => {
  for (const relPath of CENSUS_FILES) {
    it(`${relPath} names every Person through EntityRef, never a raw /crm/\${…} Link`, () => {
      const fullPath = path.join(REPO_ROOT, relPath);
      const source = fs.readFileSync(fullPath, "utf8");
      const hits = findHandBuiltPartyLinks(source);
      expect(hits).toEqual([]);
    });
  }

  it("sanity: the detector itself fires on a hand-built party Link (so a silently-broken regex can't hide a real regression)", () => {
    const fixture = [
      "function Row({ id }: { id: string }) {",
      "  return <Link href={`/crm/${id}`}>Open</Link>;",
      "}",
    ].join("\n");
    expect(findHandBuiltPartyLinks(fixture)).toHaveLength(1);
  });

  it("sanity: the detector does NOT fire on a literal-segment /crm/ route (never a Person door)", () => {
    const fixture = [
      "function Row({ id }: { id: string }) {",
      "  return <Link href={`/crm/outreach-lists/${id}`}>Open</Link>;",
      "}",
    ].join("\n");
    expect(findHandBuiltPartyLinks(fixture)).toHaveLength(0);
  });
});
