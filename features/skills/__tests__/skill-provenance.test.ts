import {
  attributionLine,
  getSkillProvenance,
  notRunnableSummary,
} from "../skill-provenance";

const imported = {
  config: {
    ingested_from: "outside_pack",
    source_authors: ["Elvis Sun", "Carly Martinetti"],
    source_repo: "https://github.com/elvisun/newsjack",
    source_commit: "092d882",
    source_license: "MIT",
    tooling_not_runnable: ["Medialyst (the authors' commercial PR data service)"],
  },
};

describe("skill provenance — imported rows never read as AI Matrx's own", () => {
  it("names the authors and the source repo for an imported row", () => {
    const p = getSkillProvenance(imported);
    expect(p.imported).toBe(true);
    expect(attributionLine(p)).toBe(
      "By Elvis Sun and Carly Martinetti · imported from github.com/elvisun/newsjack",
    );
  });

  it("flags tooling the platform does not have", () => {
    const summary = notRunnableSummary(getSkillProvenance(imported));
    expect(summary).toContain("not in AI Matrx yet");
    expect(summary).toContain("Medialyst");
  });

  it("a repo mirror or hand-authored row is not imported and makes no claim", () => {
    const p = getSkillProvenance({
      config: { ingested_from: "filesystem", source_repo: "aidream" },
    });
    expect(p.imported).toBe(false);
    expect(attributionLine(p)).toBeNull();
    expect(notRunnableSummary(p)).toBeNull();
    expect(getSkillProvenance({ config: null }).imported).toBe(false);
  });

  it("the not-runnable flag works on any row, imported or not", () => {
    const p = getSkillProvenance({ config: { tooling_not_runnable: ["a cron job"] } });
    expect(p.imported).toBe(false);
    expect(notRunnableSummary(p)).toContain("a cron job");
  });
});

/**
 * THE PAIRING RUNS BOTH WAYS (acceptance 2026-09-29). aidream's library ingest stamps
 * `config.our_version` on the imported original and `config.derived_from` on our own
 * version; every row shows its counterpart.
 */
describe("skill provenance — each side of a pair names the other", () => {
  const importedWithOurs = {
    config: {
      ...imported.config,
      our_version: { id: "ours-uuid", skill_id: "matrx-angle-generator", library_set: "ai-matrx-pr" },
    },
  };
  const ours = {
    config: {
      ingested_from: "platform_library",
      library_set: "ai-matrx-pr",
      derived_from: {
        id: "orig-uuid",
        skill_id: "angle-generator",
        pack_id: "elvisun-pr-skills",
        source_repo: "https://github.com/elvisun/newsjack",
        source_authors: ["Elvis Sun", "Carly Martinetti"],
      },
    },
  };

  it("the imported original names our version", () => {
    const p = getSkillProvenance(importedWithOurs);
    expect(p.ourVersion).toEqual({ id: "ours-uuid", skillId: "matrx-angle-generator" });
    expect(attributionLine(p)).toBe(
      "By Elvis Sun and Carly Martinetti · imported from github.com/elvisun/newsjack · our version: matrx-angle-generator",
    );
  });

  it("our version says it is derived from newsjack's original", () => {
    const p = getSkillProvenance(ours);
    expect(p.imported).toBe(false);
    expect(p.derivedFrom).toEqual({
      id: "orig-uuid",
      skillId: "angle-generator",
      sourceName: "newsjack",
      authors: ["Elvis Sun", "Carly Martinetti"],
    });
    expect(attributionLine(p)).toBe(
      "AI Matrx version · derived from newsjack's angle-generator (Elvis Sun and Carly Martinetti)",
    );
  });
});
