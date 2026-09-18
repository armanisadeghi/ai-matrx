/**
 * features/crm/__tests__/person-doors-census.test.ts
 *
 * THE DOOR LAW, as a CLASS guard: nowhere in `features/`, `app/` or
 * `components/` does a file build a Person's (or Company's) URL out of a
 * string. A `crm.party` record is named through ONE door:
 *
 *   * `<EntityRef token="party" …>` — route + new tab + peek, one primitive;
 *   * the registered opener (`useOpenItemPresentation("party", id)` →
 *     `useOpenDetail`) when it must open IN PLACE, which is what the CRM inbox
 *     needed: opening a reply's contact used to LEAVE the queue;
 *   * `resolveEntityDoors("party", id).href` when a bare URL is genuinely
 *     needed — the entity registry's `hrefFor` is the one place `/crm/<id>`
 *     is written down (`features/scopes/registry/entityRegistry.ts`).
 *
 * 🚨 N7 (VERIFY-U-P1-R5) — WHY THIS FILE WAS REWRITTEN. The first version was
 * INSTANCE-scoped: a fixed list of 13 files, and within them it only looked at
 * `<Link>` / `<a>` tags whose own `href={`…`}` carried the interpolation. So
 * `features/crm/inbox/useInboxRowActions.tsx` — INSIDE its own census — kept
 * hand-building the Person door twice, as a menu `href:` data property and as a
 * `router.push`, and the guard stayed silent. Adding the same door to a 14th
 * file was silent too. This version walks the whole tree, reads every shape a
 * URL can be built in, and fails BY NAME.
 *
 * The baseline below is a census, not an exemption: every entry is a real
 * hand-built door that is owed the one builder, and an entry that no longer
 * matches FAILS, so the list can only shrink.
 *
 * It reads the file TEXT, comments included — write the route as `/crm/<id>` in
 * prose. A commented-out door is one paste from being a live one, and a guard
 * that parses around comments is a guard with a hole in it.
 */
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SCANNED_DIRS = ["features", "app", "components"];

/**
 * Every way a party URL gets hand-built.
 *
 * `/crm/${…}` with NOTHING between `crm/` and the interpolation is the party
 * route: every other `/crm/` route carries a literal segment first
 * (`/crm/outreach-lists/${id}`, `/crm/sending-identities/${id}`). `/crm/people/`
 * would be a route that does not exist at all. `/crm/parties/...` is
 * deliberately NOT here: it is the aidream SERVER's path (`/crm/parties/resolve`,
 * `/crm/parties/{party_id}/contacts`), not a frontend route, and flagging it
 * would be a false positive in five service files.
 */
const PARTY_URL_SHAPES: ReadonlyArray<{ kind: string; pattern: RegExp }> = [
  { kind: "interpolated `/crm/${…}`", pattern: /\/crm\/\$\{/g },
  { kind: "concatenated \"/crm/\" +", pattern: /["'`]\/crm\/["'`]\s*\+/g },
  { kind: "a `/crm/people/` route that does not exist", pattern: /\/crm\/people\//g },
];

export interface PartyUrlHit {
  file: string;
  line: number;
  kind: string;
}

function isScannable(rel: string): boolean {
  if (!/\.tsx?$/.test(rel)) return false;
  // A test may legitimately hold the shape as a fixture (this file does).
  return !/(^|\/)(__tests__|__mocks__)(\/|$)/.test(rel) && !/\.(test|spec)\.tsx?$/.test(rel);
}

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

export function findHandBuiltPartyUrls(source: string, file = "<fixture>"): PartyUrlHit[] {
  const hits: PartyUrlHit[] = [];
  for (const { kind, pattern } of PARTY_URL_SHAPES) {
    for (const match of source.matchAll(pattern)) {
      hits.push({
        file,
        line: source.slice(0, match.index ?? 0).split("\n").length,
        kind,
      });
    }
  }
  return hits.sort((a, b) => a.line - b.line);
}

/**
 * THE BASELINE. Each entry is a file that still hand-builds the party URL, with
 * the reason it is not fixed in this pass. Not an exemption: a listed file that
 * stops matching FAILS the test below, so the list only ever shrinks, and a new
 * offender is never covered by it.
 */
const BASELINE: Readonly<Record<string, string>> = {
  // The canonical source of the URL itself — the entity registry's `hrefFor`
  // for the `party` token IS the one builder every other file should call.
  "features/scopes/registry/entityRegistry.ts":
    "THE one builder: `hrefFor: (id) => `/crm/${id}`` for the party token. The string is written down here on purpose.",
  // The route naming itself.
  "app/(core)/crm/[partyId]/page.tsx":
    "The party route's own page, echoing its own path to the sign-in gate so a bounced visitor returns to this record.",
  // Real hand-built doors, all onto the 360° workspace route, owed the one
  // builder. Censused 2026-09-18 (lane F-47, N7); each is a one-line change
  // that belongs with a lane that owns the file.
  "features/crm/components/CrmListPage.tsx":
    "Row open, the row menu's Open entry and its Copy link all build `/crm/<id>` by hand (3 sites).",
  "features/crm/components/columns.tsx":
    "The Name column's `href` data property builds the route by hand.",
  "features/crm/components/crm-row-actions.tsx":
    "`partyMenuTarget` and the outreach-member target both carry a hand-built `href`.",
  "features/crm/components/SaveContactFromSelectionDialog.tsx":
    "The success toast's link to the saved contact.",
  "features/crm/components/outreach-lists/OutreachListDetailPage.tsx":
    "The Member column href, the row menu's Open CRM record, and the row-open push (3 sites).",
  "features/crm/chasebox/types.ts":
    "`chaseboxFixHref` returns the repair destination for three queues as a hand-built string.",
  "features/crm/chasebox/components/ChaseboxDraftDialog.tsx":
    "An EntityRef `href` OVERRIDE carrying `?interaction=` — a real deep link, but the base path is still hand-built.",
  "features/crm/inbox/columns.tsx":
    "The subject column's `href` data property beside its own EntityRef token/id.",
  "features/crm/inbox/types.ts":
    "`inboxPartyHref` is a second, feature-local URL builder for the same route.",
  "features/hr/routes.ts":
    "`hrPartyHref` is a third builder for the same route, in another feature.",
  "features/window-panels/windows/crm/CrmCreatePartyWindow.tsx":
    "After creating a party the window pushes the hand-built record route.",
  "features/marketing/content-plan/lib/entity-write-targets.ts":
    "A refusal SENTENCE that names where a person/company is managed; the id inside it is not a door yet.",
};

function relativeTo(file: string): string {
  return path.relative(REPO_ROOT, file).split(path.sep).join("/");
}

function censusTheTree(): Map<string, PartyUrlHit[]> {
  const files: string[] = [];
  for (const dir of SCANNED_DIRS) walk(path.join(REPO_ROOT, dir), files);
  const found = new Map<string, PartyUrlHit[]>();
  for (const file of files) {
    const rel = relativeTo(file);
    if (!isScannable(rel)) continue;
    const hits = findHandBuiltPartyUrls(fs.readFileSync(file, "utf8"), rel);
    if (hits.length > 0) found.set(rel, hits);
  }
  return found;
}

describe("THE DOOR LAW: a Person is never reached by a hand-built URL", () => {
  const census = censusTheTree();

  it("no file outside the baseline builds a party URL by string", () => {
    const offenders = [...census.entries()]
      .filter(([rel]) => !(rel in BASELINE))
      .map(([rel, hits]) =>
        `${rel}: ${hits.map((h) => `line ${h.line} (${h.kind})`).join(", ")}`,
      )
      .sort();
    // RED (2026-09-18, before the fix): features/crm/inbox/useInboxRowActions.tsx
    // at lines 74, 135 and 163 — the menu's Open contact record, the Copy link
    // and the row-open push. It is in the OLD guard's own census file list and
    // that guard never saw it.
    expect(offenders).toEqual([]);
  });

  it("every baseline entry still matches, so the list can only shrink", () => {
    const stale = Object.keys(BASELINE)
      .filter((rel) => !census.has(rel))
      .sort();
    expect(stale).toEqual([]);
  });

  it("the CRM inbox opens a contact through the ONE door, in place", () => {
    const source = fs.readFileSync(
      path.join(REPO_ROOT, "features/crm/inbox/useInboxRowActions.tsx"),
      "utf8",
    );
    expect(findHandBuiltPartyUrls(source)).toEqual([]);
    // Not merely "no string": it opens IN PLACE through the registered opener,
    // which is the behaviour F-40 filed (the reviewer had to leave the queue).
    expect(source).toMatch(/useOpenItemPresentation/);
    // And the copy-link value comes from the one URL resolver.
    expect(source).toMatch(/resolveEntityDoors\(\s*"party"/);
  });

  it("sanity: the detector fires on each shape (a silently-broken regex cannot hide a regression)", () => {
    expect(findHandBuiltPartyUrls("<Link href={`/crm/${id}`}>Open</Link>")).toHaveLength(1);
    expect(findHandBuiltPartyUrls("const href = { href: `/crm/${row.id}` };")).toHaveLength(1);
    expect(findHandBuiltPartyUrls("router.push(`/crm/${partyId}`)")).toHaveLength(1);
    expect(findHandBuiltPartyUrls('const h = "/crm/" + id;')).toHaveLength(1);
    expect(findHandBuiltPartyUrls('const h = "/crm/people/list";')).toHaveLength(1);
  });

  it("sanity: the detector ignores a literal-segment route and the server's own /crm/parties path", () => {
    expect(findHandBuiltPartyUrls("<Link href={`/crm/outreach-lists/${id}`}>x</Link>")).toHaveLength(0);
    expect(findHandBuiltPartyUrls('const P = "/crm/parties/{party_id}/contacts";')).toHaveLength(0);
  });
});
