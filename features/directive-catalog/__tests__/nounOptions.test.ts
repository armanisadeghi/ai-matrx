/**
 * nounOptions — proven against the REAL catalog the server publishes
 * (`docs/protocol/kind_directives_catalog.generated.json`), never a fixture.
 *
 * The defect this guards (2026-09-30): the builder opened on the alphabetically
 * first token, `access_delta_probe` — a noun no verb can use — and offered
 * 1,100 raw tokens in one unsearchable list. It now opens on nothing, with the
 * org's common types (the reference picker's knob) on top.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NounDirectives } from "../types";
import {
  commonNounTokens,
  nounHint,
  nounLabel,
  nounOptionGroups,
} from "../nounOptions";

const catalog = JSON.parse(
  readFileSync(
    join(process.cwd(), "docs/protocol/kind_directives_catalog.generated.json"),
    "utf8",
  ),
) as { nouns: NounDirectives[] };
const byToken = new Map(catalog.nouns.map((n) => [n.noun, n] as const));

const isWritable = (n: NounDirectives) =>
  n.create === "yes" || n.update === "yes" || n.delete === "yes";

/** The knob's seeded value (migrations/reference_picker_common_types_knob.sql). */
const SEEDED_COMMON = [
  "conversation",
  "note",
  "task",
  "project",
  "file",
  "udt_document",
  "agent",
  "dataset",
  "workbook",
  "transcript",
  "url",
];

describe("commonNounTokens", () => {
  it("keeps knob order, follows aliases, and skips tokens the catalog lacks", () => {
    const common = commonNounTokens(
      catalog.nouns,
      ["document", "note", "nope", "note"],
      {
        document: "udt_document",
      },
    );
    expect(common).toEqual(
      ["udt_document", "note"].filter((t) => byToken.has(t)),
    );
  });

  it("resolves the seeded tier to real nouns, task and note included", () => {
    const common = commonNounTokens(catalog.nouns, SEEDED_COMMON);
    expect(common).toContain("task");
    expect(common).toContain("note");
    expect(common.every((t) => byToken.has(t))).toBe(true);
  });
});

describe("nounOptionGroups", () => {
  it("leads with the common tier and never repeats its nouns below", () => {
    const common = commonNounTokens(catalog.nouns, SEEDED_COMMON);
    const groups = nounOptionGroups(catalog.nouns, "create", common);
    expect(groups[0].heading).toBe("Common");
    expect(groups[0].options).toEqual(common);
    expect(groups[0].collapsed).toBe(false);
    const all = groups.flatMap((g) => g.options);
    expect(all.length).toBe(catalog.nouns.length);
    expect(new Set(all).size).toBe(catalog.nouns.length);
  });

  it("offers every noun exactly once, wired first and the rest folded", () => {
    for (const verb of ["reference", "create"] as const) {
      const groups = nounOptionGroups(catalog.nouns, verb);
      const all = groups.flatMap((g) => g.options);
      expect(all.length).toBe(catalog.nouns.length);
      expect(new Set(all).size).toBe(catalog.nouns.length);
      expect(groups[0].collapsed).toBe(false);
      expect(
        groups[0].options.every((t) => byToken.get(t)?.[verb] === "yes"),
      ).toBe(true);
      expect(groups.slice(1).every((g) => g.collapsed === true)).toBe(true);
    }
  });

  it("puts writable nouns ahead of read-only ones inside the wired group", () => {
    const wired = nounOptionGroups(catalog.nouns, "reference")[0].options;
    const firstReadOnly = wired.findIndex((t) => !isWritable(byToken.get(t)!));
    const lastWritable = wired
      .map((t) => isWritable(byToken.get(t)!))
      .lastIndexOf(true);
    expect(lastWritable).toBeLessThan(firstReadOnly);
  });
});

describe("labels and hints", () => {
  it("uses the reference picker's friendly name where it has one", () => {
    expect(nounLabel(byToken.get("conversation")!)).toBe("Chat");
  });

  it("shows the server's label, and the token only when the label hides it", () => {
    const agent = byToken.get("agent")!;
    expect(nounLabel(agent)).toBe("Agent");
    expect(nounHint(agent)).toBe("Agents");
    const deal = byToken.get("crm_deal")!;
    expect(nounHint(deal) ?? "").toContain("crm_deal");
  });

  it("humanizes a token when no label arrives", () => {
    const bare = {
      ...byToken.get("agent")!,
      noun: "access_delta_probe",
      label: "",
    };
    expect(nounLabel(bare)).toBe("Access Delta Probe");
  });
});
