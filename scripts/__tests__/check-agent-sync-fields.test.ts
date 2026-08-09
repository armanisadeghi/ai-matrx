/**
 * Unit tests for the agent-sync drift guard's SET-clause parser.
 *
 * A guard that never fires is indistinguishable from a guard that is broken, so
 * these tests run the parser against the REAL committed function definition and
 * against mutated variants of it — one mutation per drift class the guard has
 * to catch (column added to the RPC, column dropped from the RPC, group flipped,
 * an assignment shape nobody anticipated).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  diffSyncFields,
  extractFunctionDefinition,
  parseSyncSetClause,
} from "@/scripts/check-agent-sync-fields";
import { AGENT_SYNC_FIELDS } from "@/features/agents/sync/sync-fields";

const SNAPSHOT_PATH = resolve(__dirname, "..", "agent-sync-fields-snapshot.json");
const REAL_DEFINITION = (
  JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as { definition: string }
).definition;

describe("parseSyncSetClause — the real live function", () => {
  it("reads every synced column out of the sync UPDATE", () => {
    const parsed = parseSyncSetClause(REAL_DEFINITION);
    expect(parsed.problems).toEqual([]);
    expect(parsed.columns.map((c) => c.column)).toEqual([
      "name",
      "description",
      "category",
      "tags",
      "messages",
      "variable_definitions",
      "model_id",
      "model_tiers",
      "settings",
      "output_schema",
      "tools",
      "custom_tools",
      "context_slots",
      "mcp_servers",
      "tool_config",
      "skill_config",
      "default_rag_boost",
      "rag_awareness_mode",
    ]);
  });

  it("classifies the CASE WHEN v_identity columns as identity, the rest as behavior", () => {
    const parsed = parseSyncSetClause(REAL_DEFINITION);
    const identity = parsed.columns.filter((c) => c.group === "identity").map((c) => c.column);
    expect(identity).toEqual(["name", "description", "category", "tags"]);
    expect(parsed.columns.filter((c) => c.group === "behavior")).toHaveLength(14);
  });

  it("ignores the bookkeeping assignment and the second, unrelated UPDATE", () => {
    const parsed = parseSyncSetClause(REAL_DEFINITION);
    expect(parsed.ignored).toEqual(["updated_at = now()"]);
    expect(parsed.columns.map((c) => c.column)).not.toContain("updated_at");
    expect(parsed.columns.map((c) => c.column)).not.toContain("source_snapshot_at");
  });

  it("agrees exactly with AGENT_SYNC_FIELDS today", () => {
    const parsed = parseSyncSetClause(REAL_DEFINITION);
    expect(diffSyncFields(parsed.columns, AGENT_SYNC_FIELDS)).toEqual([]);
  });
});

describe("diffSyncFields — mutated function definitions", () => {
  it("reports a column the RPC gained but TS does not list", () => {
    const mutated = REAL_DEFINITION.replace(
      "    tools                = v_from.tools,",
      "    tools                = v_from.tools,\n    ui_gates             = v_from.ui_gates,",
    );
    const parsed = parseSyncSetClause(mutated);
    expect(parsed.problems).toEqual([]);
    expect(parsed.columns.map((c) => c.column)).toContain("ui_gates");

    const issues = diffSyncFields(parsed.columns, AGENT_SYNC_FIELDS);
    expect(issues).toHaveLength(1);
    expect(issues[0].column).toBe("ui_gates");
    expect(issues[0].detail).toContain("the RPC's UPDATE writes it (behavior)");
    expect(issues[0].detail).toContain("absent from AGENT_SYNC_FIELDS");
  });

  it("reports a column TS lists that the RPC stopped writing", () => {
    const mutated = REAL_DEFINITION.replace("    skill_config         = v_from.skill_config,\n", "");
    const parsed = parseSyncSetClause(mutated);
    expect(parsed.problems).toEqual([]);
    expect(parsed.columns.map((c) => c.column)).not.toContain("skill_config");

    const issues = diffSyncFields(parsed.columns, AGENT_SYNC_FIELDS);
    expect(issues).toHaveLength(1);
    expect(issues[0].column).toBe("skill_config");
    expect(issues[0].detail).toContain('TS: listed in AGENT_SYNC_FIELDS as "behavior"');
    expect(issues[0].detail).toContain("the RPC's UPDATE never writes it");
  });

  it("reports a group flip when an identity column becomes unconditional", () => {
    const mutated = REAL_DEFINITION.replace(
      "    tags                 = CASE WHEN v_identity THEN v_from.tags        ELSE tags        END,",
      "    tags                 = v_from.tags,",
    );
    const parsed = parseSyncSetClause(mutated);
    expect(parsed.problems).toEqual([]);

    const issues = diffSyncFields(parsed.columns, AGENT_SYNC_FIELDS);
    expect(issues).toHaveLength(1);
    expect(issues[0].column).toBe("tags");
    expect(issues[0].detail).toContain('TS: "identity"');
    expect(issues[0].detail).toContain('DB: "behavior"');
  });

  it("screams instead of guessing when an assignment shape is unrecognized", () => {
    const mutated = REAL_DEFINITION.replace(
      "    settings             = v_from.settings,",
      "    settings             = COALESCE(v_from.settings, settings),",
    );
    const parsed = parseSyncSetClause(mutated);
    expect(parsed.problems).toHaveLength(1);
    expect(parsed.problems[0]).toContain("settings");
    expect(parsed.problems[0]).toContain("matches neither the identity form");
  });

  it("screams when the sync UPDATE itself is gone", () => {
    const mutated = REAL_DEFINITION.replace(/UPDATE agent\.definition SET\n[\s\S]*?WHERE id = v_to\.id;/, "");
    const parsed = parseSyncSetClause(mutated);
    expect(parsed.columns).toEqual([]);
    expect(parsed.problems.join(" ")).toContain("no \"UPDATE agent.definition SET");
  });

  it("catches a cross-column copy (col = v_from.other_col)", () => {
    const mutated = REAL_DEFINITION.replace(
      "    model_id             = v_from.model_id,",
      "    model_id             = v_from.model_tiers,",
    );
    const parsed = parseSyncSetClause(mutated);
    expect(parsed.problems).toHaveLength(1);
    expect(parsed.problems[0]).toContain("v_from.model_tiers");
  });
});

describe("extractFunctionDefinition", () => {
  it("pulls the one function out of a multi-routine dump", () => {
    const dump =
      "CREATE OR REPLACE FUNCTION public.something_else(a int)\n RETURNS int\nAS $function$ BEGIN RETURN 1; END; $function$\n;\n\n" +
      REAL_DEFINITION +
      ";\n\nCREATE OR REPLACE FUNCTION public.zzz_after()\n RETURNS void\nAS $function$ BEGIN END; $function$\n;\n";
    const extracted = extractFunctionDefinition(dump);
    expect(extracted).not.toBeNull();
    expect(extracted).toContain("agx_sync_linked_agents");
    expect(extracted).not.toContain("zzz_after");
    expect(parseSyncSetClause(extracted ?? "").columns).toHaveLength(AGENT_SYNC_FIELDS.length);
  });

  it("returns null when the function is absent", () => {
    expect(extractFunctionDefinition("CREATE OR REPLACE FUNCTION public.nope() RETURNS void AS $function$ BEGIN END; $function$")).toBeNull();
  });
});
