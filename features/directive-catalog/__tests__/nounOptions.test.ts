/**
 * nounOptions — proven against the REAL catalog the server publishes
 * (`docs/protocol/kind_directives_catalog.generated.json`), never a fixture.
 *
 * The defect this guards (2026-09-30): the builder opened on the alphabetically
 * first token, `access_delta_probe` — a noun no verb can use — and offered
 * 1,100 raw tokens in one unsearchable list.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NounDirectives } from "../types";
import {
  defaultNounFor,
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

describe("defaultNounFor", () => {
  it.each(["reference", "create", "update"] as const)(
    "opens %s on a noun that is wired for it, and writable",
    (verb) => {
      const token = defaultNounFor(catalog.nouns, verb);
      const noun = byToken.get(token);
      expect(noun).toBeDefined();
      expect(noun?.[verb]).toBe("yes");
      expect(noun && isWritable(noun)).toBe(true);
    },
  );

  it("never opens on the alphabetically-first token when it can't be used", () => {
    const first = [...catalog.nouns].sort((a, b) =>
      a.noun.localeCompare(b.noun),
    )[0];
    expect(first.reference).not.toBe("yes");
    expect(defaultNounFor(catalog.nouns, "reference")).not.toBe(first.noun);
  });

  it("is empty for an empty catalog", () => {
    expect(defaultNounFor([], "reference")).toBe("");
  });
});

describe("nounOptionGroups", () => {
  it("offers every noun exactly once, wired first and the rest folded", () => {
    for (const verb of ["reference", "create"] as const) {
      const groups = nounOptionGroups(catalog.nouns, verb);
      const all = groups.flatMap((g) => g.options);
      expect(all.length).toBe(catalog.nouns.length);
      expect(new Set(all).size).toBe(catalog.nouns.length);
      expect(groups[0].collapsed).toBe(false);
      expect(groups[0].options.every((t) => byToken.get(t)?.[verb] === "yes")).toBe(true);
      expect(groups.slice(1).every((g) => g.collapsed === true)).toBe(true);
    }
  });

  it("puts writable nouns ahead of read-only ones inside the wired group", () => {
    const wired = nounOptionGroups(catalog.nouns, "reference")[0].options;
    const firstReadOnly = wired.findIndex((t) => !isWritable(byToken.get(t)!));
    const lastWritable = wired.map((t) => isWritable(byToken.get(t)!)).lastIndexOf(true);
    expect(lastWritable).toBeLessThan(firstReadOnly);
  });
});

describe("labels and hints", () => {
  it("shows the server's label, and the token only when the label hides it", () => {
    const agent = byToken.get("agent")!;
    expect(nounLabel(agent)).toBe("Agent");
    expect(nounHint(agent)).toBe("Agents");
    const deal = byToken.get("crm_deal")!;
    expect(nounHint(deal) ?? "").toContain("crm_deal");
  });

  it("humanizes a token when no label arrives", () => {
    const bare = { ...byToken.get("agent")!, noun: "access_delta_probe", label: "" };
    expect(nounLabel(bare)).toBe("Access delta probe");
  });
});
