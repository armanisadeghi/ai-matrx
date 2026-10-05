/**
 * A class keeps taking material after it is made, and every piece can sit in
 * a part of the class (a unit, lesson or section). These are the rules the hub
 * reads and writes by — each one names the defect it guards.
 */
import type { ContainerLink } from "@ai-matrx/associations/react";
import {
  attachableSourceRef,
  classContentLinks,
  classPartIds,
  groupsInPart,
  itemKey,
  partMembership,
  partScopeSlug,
  sortParts,
  sourceFilingTargets,
  titleHintFromEdgeLabel,
} from "../classParts";

const CLASS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UNIT_1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const UNIT_2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DECK = "11111111-1111-4111-8111-111111111111";
const WEB_PAGE = "22222222-2222-4222-8222-222222222222";
const TRANSCRIPT = "33333333-3333-4333-8333-333333333333";

function link(
  token: string,
  resourceId: string,
  role: string | null = null,
): ContainerLink {
  return {
    edgeId: `${token}:${resourceId}:${role}`,
    token,
    resourceId,
    role,
    label: null,
    metadata: {},
  };
}

describe("what a class lists as its content", () => {
  const links = [
    link("fc_set", DECK),
    link("fc_set", DECK, "assignment"),
    link("processed_document", WEB_PAGE),
    link("transcript", TRANSCRIPT),
    link("scope", UNIT_1, "part_of"),
  ];

  it("lists every kind of source added to it — a web page or a transcript is never dropped", () => {
    const tokens = classContentLinks(links).map((l) => l.token);
    expect(tokens).toEqual(["fc_set", "processed_document", "transcript"]);
  });

  it("never lists an assignment edge or one of its own parts as content", () => {
    const rows = classContentLinks(links);
    expect(rows.some((r) => r.role === "assignment")).toBe(false);
    expect(rows.some((r) => r.token === "scope")).toBe(false);
  });

  it("reads its parts off the part_of edges only", () => {
    expect(classPartIds([...links, link("scope", UNIT_2)])).toEqual([UNIT_1]);
  });
});

describe("what a filed source is called", () => {
  it("never names a web page after its edge (the registry labels a Source under a scope 'about')", () => {
    expect(titleHintFromEdgeLabel("processed_document", "about")).toBeNull();
  });

  it("keeps a label someone actually wrote", () => {
    expect(titleHintFromEdgeLabel("file", "Chapter 3 scan")).toBe(
      "Chapter 3 scan",
    );
    expect(titleHintFromEdgeLabel("note", null)).toBeNull();
  });
});

describe("which picked source can be filed under a class", () => {
  it("files a web page, a note, a file and a transcript", () => {
    for (const [type, id] of [
      ["processed_document", WEB_PAGE],
      ["note", DECK],
      ["file", DECK],
      ["transcript", TRANSCRIPT],
    ] as const) {
      expect(
        attachableSourceRef({ resource_type: type, resource_id: id }),
      ).toEqual({
        ok: true,
        token: type,
        id,
      });
    }
  });

  it("reads the server's file alias as a file", () => {
    expect(
      attachableSourceRef({ resource_type: "cld_file", resource_id: DECK }),
    ).toEqual({
      ok: true,
      token: "file",
      id: DECK,
    });
  });

  it("refuses a kind with no registered edge to a class, by name — never a silent skip", () => {
    const out = attachableSourceRef(
      { resource_type: "structured_list", resource_id: DECK },
      "Pick list",
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/pick list/i);
  });

  it("refuses a card that has not landed yet", () => {
    expect(attachableSourceRef(null).ok).toBe(false);
  });
});

describe("parts", () => {
  it("orders Unit 2 before Unit 10", () => {
    const parts = sortParts([
      { id: "a", name: "Unit 10" },
      { id: "b", name: "Unit 2" },
      { id: "c", name: "Unit 1" },
    ]);
    expect(parts.map((p) => p.name)).toEqual(["Unit 1", "Unit 2", "Unit 10"]);
  });

  it("gives two classes' Unit 1 different slugs", () => {
    const a = partScopeSlug("Unit 1", "a1b2c3");
    const b = partScopeSlug("Unit 1", "d4e5f6");
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("still makes a valid slug from a name with no letters", () => {
    expect(partScopeSlug("— —", "x9")).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("knows which part holds which item, and ignores archived or foreign edges", () => {
    const membership = partMembership(
      [
        { targetId: UNIT_1, sourceType: "fc_set", sourceId: DECK, role: null },
        {
          targetId: UNIT_1,
          sourceType: "processed_document",
          sourceId: WEB_PAGE,
          role: null,
        },
        { targetId: UNIT_2, sourceType: "fc_set", sourceId: DECK, role: null },
        {
          targetId: UNIT_2,
          sourceType: "fc_set",
          sourceId: WEB_PAGE,
          role: "assignment",
        },
      ],
      [UNIT_1, UNIT_2],
    );
    expect([...(membership.get(UNIT_1) ?? [])].sort()).toEqual(
      [`fc_set:${DECK}`, `processed_document:${WEB_PAGE}`].sort(),
    );
    expect([...(membership.get(UNIT_2) ?? [])]).toEqual([`fc_set:${DECK}`]);
  });
});

describe("where Add sources files a Source (the server door's attach_to)", () => {
  it("files it under the class alone when no part is selected", () => {
    expect(sourceFilingTargets(CLASS, null)).toEqual([
      { entity_type: "scope", entity_id: CLASS, label: null, signal: true },
    ]);
  });

  it("files it under the class AND the selected part in one keep", () => {
    expect(sourceFilingTargets(CLASS, UNIT_1).map((t) => t.entity_id)).toEqual([
      CLASS,
      UNIT_1,
    ]);
  });

  it("never names a display name as the edge label", () => {
    for (const t of sourceFilingTargets(CLASS, UNIT_2)) expect(t.label).toBeNull();
  });
});

describe("what a selected unit shows (owner hub and a member's view alike)", () => {
  const groups = [
    {
      group: "Notes",
      items: [
        { token: "note", entityId: DECK, title: "Cell membrane transport — study guide" },
        { token: "note", entityId: WEB_PAGE, title: "Cellular respiration — three stages" },
      ],
    },
    {
      group: "Sources",
      items: [{ token: "transcript", entityId: TRANSCRIPT, title: "Lecture 4" }],
    },
  ];

  it("shows only the items the unit holds and drops groups it holds nothing in", () => {
    const unit1 = new Set([itemKey("note", DECK)]);
    const shown = groupsInPart(groups, unit1);
    expect(shown.map((g) => g.group)).toEqual(["Notes"]);
    expect(shown[0].items.map((i) => i.title)).toEqual([
      "Cell membrane transport — study guide",
    ]);
  });

  it("shows everything with no unit selected", () => {
    expect(groupsInPart(groups, null)).toEqual(groups);
  });

  it("shows nothing for a unit that holds nothing", () => {
    expect(groupsInPart(groups, new Set())).toEqual([]);
  });
});
