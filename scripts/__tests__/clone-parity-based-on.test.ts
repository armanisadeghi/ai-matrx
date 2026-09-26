/**
 * DB-TOOLS-NO-BRANCH (2026-09-25): the rehearsal parity gate compares the clone with the file's
 * `-- based-on:` body (production BEFORE the file), not with production's current body.
 *
 * Before: a file that replaces a function body failed the gate on every rehearsal until it was on
 * production, because after rule 27's last leg the clone holds the NEW body and production the old.
 * RED on the old gate: the "not yet on production" case below reported drift.
 */
import { basedOnHashesByName, judgeParity } from "../lib/clone-parity-judge";

const SIG = "custom.probe(uuid)";
const OLD = "a".repeat(64); // production's body, the one the file was written against
const NEW = "b".repeat(64); // the file's body, on the clone after the last leg
const OTHER = "c".repeat(64); // somebody else's body, landed on production after the file was written

const m = (h: string | null) => new Map(h ? [[SIG, h]] : []);

describe("the rehearsal parity gate reads the file's based-on body", () => {
  it("passes a file not yet on production: production still holds its based-on body", () => {
    const r = judgeParity("custom.probe", m(NEW), m(OLD), new Set([OLD]));
    expect(r.drift).toEqual([]);
    expect(r.pending).toEqual([SIG]);
  });

  it("fails a file whose based-on drifted: production holds a body the file never saw", () => {
    const r = judgeParity("custom.probe", m(NEW), m(OTHER), new Set([OLD]));
    expect(r.drift).toHaveLength(1);
    expect(r.drift[0]!.why).toMatch(/based-on DRIFTED/);
  });

  it("is level once the file is on production", () => {
    expect(judgeParity("custom.probe", m(NEW), m(NEW), new Set([OLD])).drift).toEqual([]);
  });

  it("still names a body moved on the clone when the file declares nothing for it", () => {
    const r = judgeParity("custom.probe", m(OTHER), m(OLD), new Set());
    expect(r.drift).toHaveLength(1);
    expect(r.drift[0]!.why).toBe("the body on the clone is not the body on production");
  });

  it("still names a body production has and the clone lost", () => {
    const r = judgeParity("custom.probe", m(null), m(OLD), new Set());
    expect(r.drift[0]!.onClone).toBeNull();
  });

  it("groups a file's function based-on hashes by bare name and ignores triggers and views", () => {
    const sql = [
      `-- based-on: custom.probe(uuid) ${OLD}`,
      `-- based-on: Custom.Probe(uuid, text) ${NEW}`,
      `-- based-on: trigger t on custom.x ${OTHER}`,
      `-- based-on: view custom.v ${OTHER}`,
    ].join("\n");
    const by = basedOnHashesByName(sql);
    expect([...by.keys()]).toEqual(["custom.probe"]);
    expect([...by.get("custom.probe")!].sort()).toEqual([OLD, NEW]);
  });
});
