/**
 * THE DEFAULT TOOL SET HAS ONE AUTHOR.
 *
 * THE DEFECT THIS PINS. "Which tools does an organization's agent carry without anybody
 * attaching them, and which switches decide it" is now written down in THREE places that
 * must agree: the picker's eligibility (`TOOL_ORG_KNOBS`, this repo), the turn's ambient
 * injection (`ORG_KNOB_DEFAULT_TOOLS`, aidream), and the INSERT-time seed that puts the
 * tool into the agent's own saved list (`agent.org_default_tool`, the database).
 *
 * That is exactly the shape that produced the 2026-09-19 findings: the tool row and the
 * executing code were kept in step BY HAND, drifted, and the platform advertised an
 * argument the build refused. Two copies of a rule with nothing comparing them is one
 * defect waiting for a date. So the SQL declaration — the one the database actually
 * enforces on every agent INSERT — is read here and matched, pair for pair, against this
 * repo's copy. A tool or a knob added to one and not the other fails BY NAME.
 *
 * This is the static half and it needs no credentials. The live half is the browser walk
 * in PROGRESS-AGENT-UI.md: a new agent in a store-on organization comes back carrying
 * `records`, and one in a store-off organization comes back carrying nothing.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TOOL_ORG_KNOBS } from "../toolKnobGating";

const ROOT = join(__dirname, "..", "..", "..");
const AIDREAM = process.env.AIDREAM_DIR ?? join(ROOT, "..", "aidream");

/** The migration that created `agent.org_default_tool` — the database's own copy. */
const DECLARATION_SQL = join(
  AIDREAM,
  "db",
  "migrations",
  "campaign",
  "agtui_a_new_agent_carries_its_organizations_tools.sql",
);

type Pair = { tool: string; feature: string; key: string };

/**
 * Read the view's `values (...)` rows. Each row opens with three quoted words —
 * tool, feature, key — before its prose reason, which is the only shape the
 * declaration is ever written in.
 */
function readSqlDeclaration(sql: string): Pair[] {
  const body = sql.slice(sql.indexOf("create view agent.org_default_tool"));
  const rows = body.slice(0, body.indexOf(") as v("));
  const out: Pair[] = [];
  const row = /\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,/g;
  let hit: RegExpExecArray | null;
  while ((hit = row.exec(rows)) !== null) {
    out.push({ tool: hit[1], feature: hit[2], key: hit[3] });
  }
  return out;
}

function sortPairs(pairs: Pair[]): string[] {
  return pairs.map((p) => `${p.tool} → ${p.feature}/${p.key}`).sort();
}

describe("the default tool set has one author", () => {
  it("the SQL declaration exists and is readable", () => {
    expect(existsSync(DECLARATION_SQL)).toBe(true);
    const declared = readSqlDeclaration(readFileSync(DECLARATION_SQL, "utf8"));
    expect(declared.length).toBeGreaterThan(0);
  });

  it("this repo's picker eligibility says exactly what the database says", () => {
    const sqlPairs = readSqlDeclaration(readFileSync(DECLARATION_SQL, "utf8"));
    const tsPairs: Pair[] = [];
    for (const [tool, refs] of Object.entries(TOOL_ORG_KNOBS)) {
      for (const ref of refs) {
        tsPairs.push({ tool, feature: ref.feature, key: ref.key });
      }
    }
    expect(sortPairs(tsPairs)).toEqual(sortPairs(sqlPairs));
  });

  it("records follows the store switch, not merely the tool's own switch", () => {
    const sqlPairs = readSqlDeclaration(readFileSync(DECLARATION_SQL, "utf8"));
    const forRecords = sqlPairs
      .filter((p) => p.tool === "records")
      .map((p) => `${p.feature}/${p.key}`)
      .sort();
    expect(forRecords).toEqual(["custom/records_tool_default", "custom/system_enabled"]);
  });
});
