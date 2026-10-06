/**
 * Defect 3 (2026-10-05): typing a search term wiped the whole setup form and
 * re-seeded it from the brand. Two causes, both guarded here:
 *  1. Every term row was keyed by its own text (`${item.text}-${index}`), so
 *     each keystroke unmounted the row being typed in (focus and caret lost).
 *  2. The draft lived only in component state, so any remount of the editor
 *     (reload, dev refresh, error-boundary retry, session re-key) re-seeded a
 *     fresh form. The unsaved draft is now kept in the shared wizard-draft
 *     store and put back — announced — before any fresh seed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(__dirname, "MonitorSetupEditor.tsx"),
  "utf8",
);

describe("the setup form survives typing and remounts", () => {
  it("never keys a row by the text being typed into it", () => {
    expect(source).not.toMatch(/key=\{`\$\{item\.text\}/);
    expect(source).not.toMatch(/key=\{`[^`]*\$\{[a-z]+\.(text|keyword|name)\}[^`]*\$\{index\}`\}/);
  });

  it("keeps the unsaved draft in the wizard-draft store and restores it before seeding", () => {
    expect(source).toMatch(/useWizardDraft<MonitorDraft \| null>\(\s*`news-monitor-setup:/);
    const seedEffect = source.slice(source.indexOf("if (draft || !brandRow || sites.isPending) return;"));
    const restoreAt = seedEffect.indexOf('keptStatus === "found"');
    const freshSeedAt = seedEffect.indexOf("newDraft({");
    expect(restoreAt).toBeGreaterThan(-1);
    expect(restoreAt).toBeLessThan(freshSeedAt);
    expect(source).toContain("<WizardDraftRestored");
    expect(source).toMatch(/keptDraft\.clear\(\);/);
  });
});
