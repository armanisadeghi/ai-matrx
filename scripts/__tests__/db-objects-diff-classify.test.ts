/**
 * Rules for `pnpm db:objects-diff --against branch`
 * (scripts/db-objects-diff.ts → scripts/lib/db-objects-diff-core.ts).
 *
 * WHY THESE CASES AND NOT A LIVE RUN
 * ----------------------------------
 * The live run's exit code is only as good as the CLASSIFIER behind it: the
 * whole point of the tool is that production and the rehearsal branch differ by
 * ~27 tables and that 25 of them are pre-ruled scratch the chair already
 * dispositioned (v5 BUILD-BOOK `W0-TGT-FE`, ATTACK-5 finding 7). A tool that
 * counted those 25 into its exit code would be red forever and nobody would
 * read it; a tool that swallowed a real `platform` table into the same bucket
 * would be green while the rehearsal stood in for a production it no longer
 * matches. Both failures are invisible against a live database that happens to
 * be healthy today, so they are asserted here against a fixed delta set.
 *
 * Every case below is a delta shape the live databases actually produce.
 *
 * matrx-real-data:allow — the `zz_`/`zzz_` names in this file are not placeholder data: they
 * exercise `LANE_SCRATCH_PREFIX = "zz_"`, the classifier's own real, functional reserved-namespace
 * constant (scripts/lib/db-objects-diff-core.ts), the same way a trigger-name test quotes a live
 * trigger. Renaming them would stop testing the actual prefix the tool checks for.
 */
import {
  classifyDelta,
  summarise,
  NOISE_PUBLIC_TABLES,
  RULING_SCHEMAS,
  type Delta,
} from "../lib/db-objects-diff-core";

function table(schema: string, name: string, direction: Delta["direction"]): Delta {
  return {
    object: { kind: "table", schema, table: name, name },
    direction,
  };
}

function column(
  schema: string,
  tbl: string,
  name: string,
  direction: Delta["direction"],
): Delta {
  return {
    object: { kind: "column", schema, table: tbl, name },
    direction,
    productionSignature: "text null",
    branchSignature: "text not null",
  };
}

describe("classifyDelta — the ruling schemas", () => {
  it("names the three schemas the lane rules on", () => {
    expect([...RULING_SCHEMAS].sort()).toEqual(["history", "iam", "platform"]);
  });

  it.each(["platform", "iam", "history"])(
    "a %s table present on production only is A RULING",
    (schema) => {
      const v = classifyDelta(table(schema, "masterwork_run_kind", "production_only").object);
      expect(v.cls).toBe("ruling");
    },
  );

  it("a platform table present on the branch only is A RULING too (both directions)", () => {
    const v = classifyDelta(table("platform", "zzz_not_scratch", "branch_only").object);
    expect(v.cls).toBe("ruling");
  });

  it("a column difference on a platform table is A RULING", () => {
    const v = classifyDelta(column("platform", "feature_knob", "default_value", "differs").object);
    expect(v.cls).toBe("ruling");
  });

  it.each(["constraint", "trigger"] as const)(
    "a %s difference on an iam table is A RULING",
    (kind) => {
      const v = classifyDelta({ kind, schema: "iam", table: "grant", name: "grant_scope_ck" });
      expect(v.cls).toBe("ruling");
    },
  );

  it("an event trigger is A RULING — it is cluster-global and has no schema to sort it by", () => {
    const v = classifyDelta({
      kind: "event_trigger",
      schema: null,
      table: null,
      name: "ddl_guard_log",
    });
    expect(v.cls).toBe("ruling");
  });
});

describe("classifyDelta — pre-ruled noise", () => {
  it("carries all 25 named public scratch tables", () => {
    expect(NOISE_PUBLIC_TABLES.size).toBe(25);
    expect(NOISE_PUBLIC_TABLES.has("m4_r20_toast")).toBe(true);
    expect(NOISE_PUBLIC_TABLES.has("m_visibility_version")).toBe(true);
  });

  it.each([...NOISE_PUBLIC_TABLES])(
    "public.%s branch-only is PRE-RULED NOISE",
    (name) => {
      expect(classifyDelta(table("public", name, "branch_only").object).cls).toBe("noise");
    },
  );

  it("a column of a pre-ruled scratch table is noise as well", () => {
    expect(classifyDelta(column("public", "m5_cell", "value", "differs").object).cls).toBe("noise");
  });

  it.each(["corpus", "campaign_watch"])(
    "the reserved schema %s is PRE-RULED NOISE in either direction",
    (schema) => {
      expect(classifyDelta(table(schema, "anything", "branch_only").object).cls).toBe("noise");
      expect(classifyDelta(table(schema, "anything", "production_only").object).cls).toBe("noise");
    },
  );

  it("a zz_<lane>_* schema is PRE-RULED NOISE", () => {
    expect(classifyDelta(table("zz_w0_scratch", "t", "branch_only").object).cls).toBe("noise");
  });

  it("a zz_<lane>_* TABLE is noise even inside a ruling schema — it is lane scratch", () => {
    expect(classifyDelta(table("platform", "zz_w0_probe", "branch_only").object).cls).toBe("noise");
  });

  it("public.some_real_table is NOT noise just because it is public", () => {
    expect(classifyDelta(table("public", "some_real_table", "branch_only").object).cls).not.toBe(
      "noise",
    );
  });

  it("a public table whose name merely STARTS with a scratch name is not pre-ruled", () => {
    expect(classifyDelta(table("public", "m_record_archive", "branch_only").object).cls).not.toBe(
      "noise",
    );
  });
});

describe("classifyDelta — outside the ruling schemas", () => {
  it("an agent-schema table difference is neither a ruling nor pre-ruled", () => {
    const v = classifyDelta(table("agent", "recipe", "production_only").object);
    expect(v.cls).toBe("outside");
    expect(v.reason).toMatch(/platform|iam|history/);
  });

  it("a Supabase-managed schema lands outside, not in the gate", () => {
    expect(classifyDelta(table("storage", "buckets", "differs").object).cls).toBe("outside");
  });
});

describe("summarise — what the exit code is made of", () => {
  const deltas: Delta[] = [
    table("platform", "masterwork_run_kind", "production_only"),
    table("platform", "provision_generate_target", "production_only"),
    table("public", "m5_cell", "branch_only"),
    table("public", "m_grant", "branch_only"),
    table("corpus", "verdict", "branch_only"),
    table("agent", "recipe", "differs"),
  ];

  it("counts each class and both directions", () => {
    const s = summarise(deltas);
    expect(s.ruling.length).toBe(2);
    expect(s.noise.length).toBe(3);
    expect(s.outside.length).toBe(1);
    expect(s.productionOnly).toBe(2);
    expect(s.branchOnly).toBe(3);
    expect(s.differs).toBe(1);
  });

  it("exits non-zero on a ruling-class delta and zero without one", () => {
    expect(summarise(deltas).exitCode).toBe(1);
    expect(summarise(deltas.filter((d) => d.object.schema !== "platform")).exitCode).toBe(0);
    expect(summarise([]).exitCode).toBe(0);
  });

  it("never lets noise or outside deltas move the exit code", () => {
    const noiseOnly = deltas.filter((d) => d.object.schema !== "platform");
    expect(noiseOnly.length).toBeGreaterThan(0);
    expect(summarise(noiseOnly).exitCode).toBe(0);
  });
});
