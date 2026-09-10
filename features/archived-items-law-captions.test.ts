// features/archived-items-law-captions.test.ts
//
// THE ARCHIVED-ITEMS LAW, honesty half — THE CLASS, across every feature that
// took the live/archived split.
//
// The law's own headline is that a screen never lies. Splitting a list into a
// live half and an archived half makes every COUNT honest and quietly makes
// every CAPTION dishonest: a sentence that used to mean "nothing exists" —
// "No conversations yet.", "Nothing has been added.", "No Masterworks built
// yet." — is now computed from the live half alone, so it fires while the
// surface's own "Archived (N)" door sits one line below offering the rows it
// just denied. Row F10's independent live review caught it on the Rulebook
// page; this file is the census of its siblings.
//
// The rule, everywhere: "none / never / yet" may only be said when
// live + archived is 0. Otherwise the caption says how many are archived.
//
// These read SOURCE TEXT on purpose — the branches live in JSX and this repo
// has no React testing library; a test that re-implements the component it
// checks proves nothing. The Masterwork half of the class is unit-tested
// against real functions in `features/masterwork/archivedItemsLaw.test.ts`.

import { readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..");

function source(relative: string): string {
  return readFileSync(path.join(REPO_ROOT, relative), "utf8");
}

describe("HR custom fields — the table's empty state", () => {
  const FILE = "features/hr/settings/fields/HrFieldsPanel.tsx";

  it("does not claim nothing was added while archived definitions exist", () => {
    const text = source(FILE);
    // The live half feeds the table, so the "Nothing has been added" copy may
    // only be reached when the archived half is empty too.
    expect(text).toMatch(
      /liveDefinitions\.length === 0 &&\s*archivedDefinitions\.length > 0/,
    );
    expect(text).toMatch(/custom \$\{archivedDefinitions\.length === 1/);
  });

  it("still keeps the honest empty copy for a genuinely empty registry", () => {
    expect(source(FILE)).toContain("No custom fields on HR records");
  });
});

describe("WhatsApp conversation list — the empty pane", () => {
  const FILE =
    "features/whatsapp-clone/conversation-list/ConversationListPane.tsx";

  it('does not say "No conversations yet." with archived chats one click away', () => {
    const text = source(FILE);
    // `conversations` is the ACTIVE half (a server round-trip, not a client
    // sieve), so the never-had-one sentence must consult the archived count.
    expect(text).toMatch(
      /\(archivedCount\?\.count \?\? 0\) > 0[\s\S]{0,200}?Every chat is archived/,
    );
    // …and it must still be able to say it when there is genuinely nothing.
    expect(text).toContain('"No conversations yet."');
  });
});

describe("the surfaces whose empty states were ALREADY honest stay that way", () => {
  // Rule 3 of the six laws: census the siblings. These five took the same
  // split and already guard both halves. Each assertion goes red if somebody
  // narrows the check back to the live half.
  const BOTH_HALVES: Array<{ file: string; pattern: RegExp }> = [
    {
      file: "features/pdf/scanner/components/desktop/ScannerDesktop.tsx",
      pattern: /recent\.active\.length === 0 && recent\.archived\.length === 0/,
    },
    {
      file: "features/pdf-extractor/components/PdfExtractorWorkspace.tsx",
      pattern: /history\.length === 0 && archivedHistory\.length === 0/,
    },
    {
      file: "features/page-extraction/components/SavedJobsList.tsx",
      pattern: /jobs\.length === 0 && archivedJobs\.length === 0/,
    },
    {
      file: "features/canvas/core/SavedCanvasItems.tsx",
      pattern: /activeItems\.length === 0 && archivedItems\.length === 0/,
    },
    {
      file: "features/agents/agent-creators/templates/TemplatesGrid.tsx",
      pattern:
        /filteredTemplates\.length === 0 && archivedTemplates\.length === 0/,
    },
  ];

  it.each(BOTH_HALVES)(
    "$file gates its empty caption on BOTH halves",
    ({ file, pattern }) => {
      expect(source(file)).toMatch(pattern);
    },
  );
});
