/**
 * ── ONE HOLDER ANSWER PER SCREEN ─────────────────────────────────────────────
 *
 * 🚨 THE DEFECT (FIX-R9-UI round 2, fresh Sonnet walk of production v0.4.1732,
 * `/administration/mandates/research_client.output_slides`).
 *
 * The three controls shipped and round-tripped — and the walk FAILED anyway,
 * because the "Platform tools" panel further down the SAME page still rendered
 * a complete second holder answer:
 *
 *   Agent          Research → Slides Generator  ·  Versions
 *   System agent   Yes
 *   Version        latest (v7)
 *   ⚠ "Research → Slides Generator does not produce what this job promises."
 *     "The holder does not declare the structured output keys this job's
 *      consumers require, so the assignment fails at run time."
 *     "This job requires `title`, `slides`."
 *   [ Open Research → Slides Generator ]  [ Assign a different holder ]
 *
 * — the same holder, the same version, the same defect, the same remedy, and
 * the very button Arman condemned, renamed. His words: *"massive confusion by
 * then repeating it in the bottom … that's stupid. One place is all we need."*
 *
 * And a THIRD instance of V-PARITY/UX F3 was found on the way: the panel's
 * closing line told an ORG-homed scratch job that *"every user on the platform
 * runs the system answer"*, three lines under its own correct *"Proof Run Judge
 * answers this job for every member of Castellano & Reyes, LLP."*
 *
 * These guards enumerate EVERY health verdict rather than the one the walk
 * happened to read, and pin the two source facts a render test would take a
 * mocked half-page to reach.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  HOLDER_HEALTH_VERDICTS,
  bannerSpeaksHere,
} from "../MandateDetailPanel";
import { HEALTH_PRIORITY, type MandateHealth } from "../mandate-health";

const ADMIN_DIR = join(__dirname, "..");

/** Every health verdict the model can produce — not a hand-written subset. */
const EVERY_HEALTH = Object.keys(HEALTH_PRIORITY) as MandateHealth[];

describe("a host that shows the holder's answer is not told it twice", () => {
  it("covers every health verdict — no value is unclassified", () => {
    // Anti-vacuity, and the thing that makes this a CLASS guard: a health added
    // tomorrow must be decided deliberately, not default into speaking.
    expect(EVERY_HEALTH.length).toBeGreaterThanOrEqual(9);
    for (const health of EVERY_HEALTH) {
      expect(typeof bannerSpeaksHere(health, false)).toBe("boolean");
    }
  });

  it("silences every HOLDER verdict on a host that owns the holder answer", () => {
    for (const health of HOLDER_HEALTH_VERDICTS) {
      expect(bannerSpeaksHere(health, false)).toBe(false);
    }
    // The exact one the walk read, named so a rename cannot quietly drop it.
    expect(bannerSpeaksHere("output contract unmet", false)).toBe(false);
    expect(bannerSpeaksHere("ok", false)).toBe(false);
  });

  it("keeps the health NO holder control can state — the code declaration", () => {
    const codeHealth: MandateHealth[] = EVERY_HEALTH.filter(
      (h) => !HOLDER_HEALTH_VERDICTS.includes(h),
    );
    // Anti-vacuity: if this list were empty the guard above would be trivial.
    expect(codeHealth.length).toBeGreaterThanOrEqual(3);
    for (const health of codeHealth) {
      expect(bannerSpeaksHere(health, false)).toBe(true);
    }
  });

  it("says everything on a host that shows no holder controls of its own", () => {
    for (const health of EVERY_HEALTH) {
      expect(bannerSpeaksHere(health, true)).toBe(true);
    }
  });
});

describe("the admin mandate page asks for one holder answer, and the panel gates its facts on it", () => {
  it("the page passes showHolderAnswer={false}", () => {
    const source = readFileSync(
      join(ADMIN_DIR, "AdminMandateWorkspacePage.tsx"),
      "utf8",
    );
    expect(source).toContain("showHolderAnswer={false}");
    // Its sibling flag, for the same reason one prop over.
    expect(source).toContain("showGoal={false}");
  });

  it("the Agent / System agent / Version facts are gated, not unconditional", () => {
    const source = readFileSync(join(ADMIN_DIR, "MandateDetailPanel.tsx"), "utf8");
    const gate = source.indexOf("{showHolderAnswer ? (");
    const close = source.indexOf("</>\n      ) : null}", gate);
    expect(gate).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(gate);
    const gated = source.slice(gate, close);
    for (const fact of ['<Fact label="Agent">', '<Fact label="System agent">', '<Fact label="Version">']) {
      expect(gated).toContain(fact);
    }
  });

  it("no sentence in the panel claims the platform for a job it has not read the home of", () => {
    const source = readFileSync(join(ADMIN_DIR, "MandateDetailPanel.tsx"), "utf8");
    // RED, verbatim as it shipped on v0.4.1732 and as the walk read it on an
    // ORG-homed job: the scope was hardcoded into the sentence.
    expect(source).not.toContain(
      "Nothing overrides this job — every user on the platform runs the system answer.",
    );
    // GREEN: the phrase comes from the one home-scope function.
    expect(source).toContain("homeScopePhrase(");
  });
});
