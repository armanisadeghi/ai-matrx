/**
 * A relationship finding must still BE a relationship when it lands.
 *
 * The Relationship Auditor's entire payload is the amended statement PLUS the
 * machine-readable `relates_to` (THE ANTI-MISLEADING LAW). Until 2026-08-19
 * this surface dropped that half three times over — `parseProposed` did not
 * read it, `projectCheckup` did not write it, and both Improve and Edit
 * rebuilt the proposal without it — so approving a relationship finding wrote
 * an ordinary statement edit and the connection vanished silently.
 */

import { parseFinding } from "../types";
import { projectCheckup } from "../service";
import type { Rulebook } from "../../types";

const SIBLING = {
  id: "beatable-page-higher-authority",
  name: "Spot a beatable page",
  section: "G",
  statement: "Look for a top-10 page your site outranks on authority.",
  severity: "critical" as const,
};

const TARGET = {
  id: "sanity-check-competitor-backlink-profiles-before",
  name: "Check competitor backlinks",
  section: "G",
  statement: "Before committing to a keyword, check the top-10 backlink profiles.",
  severity: "minor" as const,
};

const rulebook = {
  id: "rb",
  name: "SEO",
  slug: "seo",
  organization_id: "org",
  version: 1,
  sections: { G: { label: "General" } },
  rules: [SIBLING, TARGET],
  metadata: {},
} as unknown as Rulebook;

const wireFinding = {
  id: "relationship_auditor-abc",
  kind: "modify",
  target_rule_id: TARGET.id,
  proposed: {
    name: TARGET.name,
    statement:
      "If you notice a page that seems beatable because your site has higher authority, examine how many links it took them to get there.",
    severity: "minor",
    section: "G",
    relates_to: [
      {
        rule_id: SIBLING.id,
        kind: "refines",
        note: "only once a beatable page is spotted",
      },
      { rule_id: "does-not-exist", kind: "refines" },
      { rule_id: SIBLING.id, kind: "sibling-of" },
    ],
  },
  reason: "It reads as unconditional.",
  evidence: "you only check backlinks once you spot a beatable page",
  confidence: 0.8,
  source: "relationship_auditor",
};

describe("checkup relationship round trip", () => {
  it("parses relates_to and drops malformed entries", () => {
    const finding = parseFinding(wireFinding);
    expect(finding).not.toBeNull();
    const relations = finding!.proposed!.relates_to;
    // The unknown kind is dropped by the wire-shape check; the unresolvable id
    // is the server's job (it never writes one) and is not silently repaired.
    expect(relations).toEqual([
      {
        rule_id: SIBLING.id,
        kind: "refines",
        note: "only once a beatable page is spotted",
      },
      { rule_id: "does-not-exist", kind: "refines" },
    ]);
  });

  it("writes the connection onto the rule when the Expert approves", () => {
    const finding = parseFinding(wireFinding)!;
    const projection = projectCheckup({
      rulebook,
      findings: [finding],
      dispositions: { [finding.id]: { decision: "approve" } },
      runId: null,
    });
    const written = projection.rules.find((r) => r.id === TARGET.id);
    expect(written?.relates_to?.[0]).toEqual({
      rule_id: SIBLING.id,
      kind: "refines",
      note: "only once a beatable page is spotted",
    });
    expect(written?.statement).toContain("higher authority");
  });

  it("leaves existing relations alone when a finding carries none", () => {
    const linked = { ...TARGET, relates_to: [{ rule_id: SIBLING.id, kind: "refines" as const }] };
    const finding = parseFinding({
      ...wireFinding,
      proposed: { ...wireFinding.proposed, relates_to: [] },
    })!;
    const projection = projectCheckup({
      rulebook: { ...rulebook, rules: [SIBLING, linked] } as unknown as Rulebook,
      findings: [finding],
      dispositions: { [finding.id]: { decision: "approve" } },
      runId: null,
    });
    expect(
      projection.rules.find((r) => r.id === TARGET.id)?.relates_to,
    ).toHaveLength(1);
  });
});
