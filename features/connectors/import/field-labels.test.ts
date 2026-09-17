// features/connectors/import/field-labels.test.ts
//
// B4 / B3 / D9 (VERIFY-B1-B2), forced:
//   * D9 — the Tasks panel printed `kept_local.join(", ")`, so a person read
//     "due_date, description was edited here": raw column names, and a verb that
//     did not agree. One label map, shared with the Contacts panel, ends it.
//   * B4 — "from Google Contacts, imported <date>" appeared nowhere. It appears
//     now when the server sends provenance, and says so honestly when it does
//     not: the server's provenance write is inert until aidream regenerates its
//     models, and a panel that filled in a plausible date would lie on every
//     field.
//   * B3 — the already-imported badge carried no date.
//
// The scans below fail on the pre-fix bytes of both panels.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  IMPORT_PROVENANCE_UNRECORDED,
  importDateText,
  importFieldLabel,
  importFieldList,
  importMatchKeyWords,
  importProvenanceSentence,
} from "./field-labels";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const PANELS = [
  "features/connectors/import/GoogleTasksImportPanel.tsx",
  "features/connectors/import/GoogleContactsImportPanel.tsx",
];

describe("importFieldLabel / importFieldList", () => {
  it("never hands a person a column name", () => {
    expect(importFieldLabel("due_date")).toBe("due date");
    expect(importFieldLabel("description")).toBe("description");
    expect(importFieldLabel("first_name")).toBe("first name");
    // An unknown key is humanised, not printed raw and not dropped.
    expect(importFieldLabel("some_new_column")).toBe("some new column");
  });

  it("agrees with its own count", () => {
    expect(importFieldList(["due_date"])).toEqual({
      text: "due date",
      verb: "was",
    });
    expect(importFieldList(["due_date", "description"])).toEqual({
      text: "due date and description",
      verb: "were",
    });
    expect(importFieldList(["due_date", "description", "status"]).text).toBe(
      "due date, description and status",
    );
  });
});

describe("importProvenanceSentence", () => {
  it("says where a value came from and when", () => {
    const sentence = importProvenanceSentence({
      sourceRef: "people/c123",
      importedAt: "2026-09-12T08:30:00Z",
      source: "Google Contacts",
    });
    expect(sentence).toContain("from Google Contacts");
    expect(sentence).toContain("imported");
    expect(sentence).toContain("2026");
  });

  it("NEVER invents a date when the server recorded none", () => {
    expect(
      importProvenanceSentence({
        sourceRef: null,
        importedAt: null,
        source: "Google Contacts",
      }),
    ).toBeNull();
    // And the source without a date says only what it knows.
    expect(
      importProvenanceSentence({
        sourceRef: "people/c123",
        importedAt: null,
        source: "Google Contacts",
      }),
    ).toBe("from Google Contacts");
    expect(
      importProvenanceSentence({
        importedAt: "not-a-date",
        source: "Google Tasks",
      }),
    ).toBeNull();
  });

  it("has one sentence for the absence, and it blames nobody", () => {
    expect(IMPORT_PROVENANCE_UNRECORDED).toContain("never recorded");
    expect(IMPORT_PROVENANCE_UNRECORDED).not.toContain("you edited");
  });

  it("speaks dates, not ISO strings", () => {
    expect(importDateText("2026-09-12T08:30:00Z")).not.toContain("T08:30");
    expect(importDateText(null)).toBeNull();
  });
});

describe("THE GUARD: both panels speak English and show provenance", () => {
  it.each(PANELS)("%s prints no raw field keys", (relative) => {
    const source = readFileSync(join(REPO_ROOT, relative), "utf8");
    // The exact pre-fix shapes: a raw join of server-sent column keys.
    expect(source).not.toMatch(/kept_local\.join\(/);
    expect(source).not.toMatch(/changes\.join\(/);
    expect(source).not.toMatch(/changed_fields\.join\(/);
  });

  it.each(PANELS)("%s uses the one label map", (relative) => {
    const source = readFileSync(join(REPO_ROOT, relative), "utf8");
    expect(source).toMatch(/from "\.\/field-labels"/);
  });

  it.each(PANELS)("%s dates the already-imported badge", (relative) => {
    const source = readFileSync(join(REPO_ROOT, relative), "utf8");
    expect(source).toMatch(/importDateText\((?:contact|task)\.imported_at\)/);
  });

  it("the Contacts panel no longer disables a kept_manual field", () => {
    const source = readFileSync(join(REPO_ROOT, PANELS[1]), "utf8");
    // The pre-fix bytes: `const locked = field.action === "kept_manual"` plus
    // `disabled={locked}` on the checkbox, so Google's value was unreachable.
    expect(source).not.toMatch(/const locked = field\.action === "kept_manual"/);
    expect(source).not.toMatch(/disabled=\{locked\}/);
    expect(source).toMatch(/localWins/);
  });
});

// ---------------------------------------------------------------------------
// THE CONTRACT ADOPTION (aidream `services/google_import/**`, 2026-09-17).
//
// The server grew `unrecorded`, `choice_required`, `explanation`, `match_state`,
// `candidates` and `unrecorded_fields`; the panels ran on a stand-in union that
// knew none of them, so two of the states a person most needs to read would have
// rendered a blank label. These fail on the pre-adoption bytes.
// ---------------------------------------------------------------------------

import {
  CONTACT_FIELD_ACTIONS,
  CONTACT_MATCH_STATES,
  decideContactField,
  narrowContactFieldAction,
} from "./contract";

describe("the /google-import contract this build renders", () => {
  it("knows every action the server can emit, and admits an unknown one", () => {
    expect(CONTACT_FIELD_ACTIONS).toContain("unrecorded");
    expect(CONTACT_FIELD_ACTIONS).toContain("choice_required");
    expect(narrowContactFieldAction("unrecorded")).toBe("unrecorded");
    // A state a NEWER server invents is never dropped and never rendered blank.
    expect(narrowContactFieldAction("something_new")).toBe("unknown");
    expect(narrowContactFieldAction(undefined)).toBe("unknown");
  });

  it("knows every match state the resolver can report", () => {
    expect([...CONTACT_MATCH_STATES]).toEqual([
      "new",
      "imported",
      "matched",
      "choice_required",
    ]);
  });

  /**
   * The cross-repo half: the server's own literal is the truth. It runs when the
   * sibling aidream checkout is present (it is, in every agent container and in
   * the release gates that mount both repos) and says so when it is not, rather
   * than passing quietly.
   */
  it("mirrors the server's own FieldAction literal", () => {
    const serverFile = join(
      REPO_ROOT,
      "..",
      "aidream",
      "aidream/services/google_import/contacts.py",
    );
    if (!existsSync(serverFile)) {
      console.warn(
        `[field-labels] UNMEASURED: ${serverFile} is not in this container, so the TS action list was NOT compared against the server's own literal. Run this test where the sibling aidream checkout exists.`,
      );
      return;
    }
    const python = readFileSync(serverFile, "utf8");
    const literal = /FieldAction = Literal\[([^\]]+)\]/.exec(python);
    expect(literal).not.toBeNull();
    const serverActions = [...(literal?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map(
      (match) => match[1],
    );
    expect(serverActions.length).toBeGreaterThan(0);
    expect([...CONTACT_FIELD_ACTIONS].sort()).toEqual(serverActions.sort());
  });

  it("local wins by DEFAULT for an edited value, and only for that", () => {
    expect(decideContactField({ action: "kept_manual" })).toMatchObject({
      includeByDefault: false,
      choosable: true,
      localWins: true,
    });
    // An unstamped value is not presumed to be anybody's choice.
    expect(decideContactField({ action: "unrecorded" })).toMatchObject({
      includeByDefault: true,
      choosable: true,
    });
    // Nothing about an ambiguous contact is decided here.
    expect(decideContactField({ action: "choice_required" })).toMatchObject({
      includeByDefault: false,
      choosable: false,
    });
    expect(decideContactField({ action: "excluded" }).choosable).toBe(false);
  });

  it("keeps the server's sentence and drops a blank one", () => {
    expect(
      decideContactField({ action: "fill", explanation: "  " }).explanation,
    ).toBeNull();
    expect(
      decideContactField({ action: "fill", explanation: "Email is empty here." })
        .explanation,
    ).toBe("Email is empty here.");
  });
});

describe("THE GUARD: the panels adopt the contract honestly", () => {
  it("the Contacts panel decides every row through the one adapter", () => {
    const source = readFileSync(join(REPO_ROOT, PANELS[1]), "utf8");
    expect(source).toMatch(/decideContactField/);
    expect(source).toMatch(/narrowContactMatchState/);
    // It renders the server's sentence, and never composes one for a state it
    // does not know.
    expect(source).toMatch(/decision\.explanation/);
    expect(source).toMatch(/UNKNOWN_ACTION_SENTENCE/);
  });

  it("never says New Person for a contact the apply would merge", () => {
    const source = readFileSync(join(REPO_ROOT, PANELS[1]), "utf8");
    // The merge case names the Person and how it was recognised.
    expect(source).toMatch(/Will update/);
    expect(source).toMatch(/matched_by/);
    // And the ambiguous case refuses, names both People, and gives the remedy.
    expect(source).toMatch(/More than one Person matches/);
    expect(source).toMatch(/Merge/);
    expect(source).not.toMatch(/Pick the right Person/);
  });

  it("the Tasks panel says 'no record' rather than 'edited here'", () => {
    const source = readFileSync(join(REPO_ROOT, PANELS[0]), "utf8");
    expect(source).toMatch(/task\.unrecorded/);
    expect(source).toMatch(/unrecorded_fields/);
    expect(source).toMatch(/no record of what the import last wrote/);
  });

  it("no panel renders the Google Tasks API resource as a page to open", () => {
    for (const relative of PANELS) {
      const source = readFileSync(join(REPO_ROOT, relative), "utf8");
      expect(source).not.toMatch(/tasks\.googleapis\.com/);
      expect(source).not.toMatch(/Open in Google Tasks/);
      expect(source).not.toMatch(/href=\{[^}]*source_url/);
    }
    // And it says what the link back actually is.
    const tasks = readFileSync(join(REPO_ROOT, PANELS[0]), "utf8");
    expect(tasks).toMatch(/Linked to Google Tasks/);
  });

  it("the ambiguity list humanises `matched_by`, never prints the raw key (VERIFY-B1-B2-R4 D9/V9)", () => {
    // GoogleContactsImportPanel.tsx:559 and :699 printed
    // `({candidate.matched_by})` verbatim — `(external_id:google_contacts)` at
    // a person choosing between two customer records, on exactly the screen a
    // non-technical expert must get right. `importMatchKeyWords` is the twin
    // helper the "Will update" badge already used a few lines up; the fix is
    // the SAME helper on the ambiguity list, never a second map.
    const source = readFileSync(join(REPO_ROOT, PANELS[1]), "utf8");
    const rawPrints = [
      ...source.matchAll(/\{candidate\.person_name\} \(\{(.*)\}\)/g),
    ];
    expect(rawPrints.length).toBeGreaterThan(0);
    for (const match of rawPrints) {
      expect(match[1]).toBe("importMatchKeyWords(candidate.matched_by)");
    }
  });
});

describe("THE CONTRACT: every matched_by value the server can emit has a label", () => {
  /**
   * `aidream/services/crm/party_resolver.py::_find_match` tags each candidate
   * with the key that found it — `email` | `phone` | `domain` | `name` |
   * `created` | `external_id:<platform_slug>` (VERIFY-B1-B2-R4 V9's
   * remedy: "every `matched_by` value the server can emit has a label").
   * `importMatchKeyWords` must speak every one of them in words, never a
   * key nobody translated reaching a person on the ambiguity screen.
   */
  it("importMatchKeyWords never returns the raw key back", () => {
    const keys = [
      "email",
      "phone",
      "domain",
      "name",
      "created",
      "external_id:google_contacts",
      "external_id:google_tasks",
      "",
    ];
    for (const key of keys) {
      const words = importMatchKeyWords(key);
      expect(words.length).toBeGreaterThan(0);
      if (key) {
        expect(words).not.toBe(key);
        expect(words).not.toContain(":");
        expect(words).not.toContain("_");
      }
    }
  });

  it("mirrors the server's own matched_by census (VERIFY-B1-B2-R4 V9)", () => {
    const serverFile = join(REPO_ROOT, "..", "aidream", "aidream/services/crm/party_resolver.py");
    if (!existsSync(serverFile)) {
      console.warn(
        `[field-labels] UNMEASURED: ${serverFile} is not in this container, so the ` +
          "matched_by census was NOT compared against the server's own resolver. Run " +
          "this test where the sibling aidream checkout exists.",
      );
      return;
    }
    const python = readFileSync(serverFile, "utf8");
    // The literal keys `_find_match._collect(...)` and `resolve_party` tag a
    // candidate with, minus the interpolated `external_id:{slug}` form (its
    // prefix is covered by the census above).
    const literalKeys = [...new Set(
      [...python.matchAll(/"(email|phone|domain|name|created)"/g)].map((m) => m[1]),
    )];
    expect(literalKeys.length).toBeGreaterThan(0);
    for (const key of literalKeys) {
      expect(importMatchKeyWords(key)).not.toBe(key);
    }
    // The interpolated form is still live in the resolver — a change here
    // without a matching `startsWith("external_id")` branch is the exact
    // class this test exists to catch.
    expect(python).toMatch(/f"external_id:\{slug\}"/);
    expect(importMatchKeyWords("external_id:whatever")).toBe("its Google Contacts id");
  });
});
