/**
 * THE GUARD ON THE CLASS THE FIRST SWEEP MISSED.
 *
 * 🚨 Arman, 2026-08-31: *"Users are not expected to enter objects and we
 * should, at no time, force them to do such a thing."* The model and its
 * settings were editable only by typing JSON into a textarea, and the fix wave
 * replaced that with the canonical `ModelListDropdown` + `RunConfigOverrides`
 * composition (`StoredModelOverridesField`).
 *
 * IT MISSED A DOOR. The wave fixed the shared `AdvancedSection`, which
 * `ShortcutEditorNext` mounts — but `ShortcutForm`, the modal that is the ONLY
 * editor for the three non-per-agent shortcut route families, carries its own
 * advanced block and still shipped a raw "LLM Overrides (JSON)" textarea. The
 * independent walk of v0.4.1585 found it. A census done by reading one
 * component's imports is not a census.
 *
 * So the guard is not about one file: no shortcut- or binding-editing surface
 * may present a raw JSON editor as the way to set a model. It reads the SOURCE,
 * because that is the only way to assert something about every door at once
 * rather than about the doors a test happened to render.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOTS = [
  join(process.cwd(), "features/agent-shortcuts"),
  join(process.cwd(), "features/bindings"),
];

/** The control that replaced every one of these. Its own file is exempt. */
const SANCTIONED = "StoredModelOverridesField";

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      out.push(...tsxFiles(full));
      continue;
    }
    if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) out.push(full);
  }
  return out;
}

describe("nobody is asked to type a model into a textarea", () => {
  const files = ROOTS.flatMap(tsxFiles);

  it("finds the editors it is meant to be guarding", () => {
    // A guard that silently walks an empty tree passes forever. Pin that it
    // is actually reading the surfaces this rule is about.
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.endsWith("ShortcutForm.tsx"))).toBe(true);
    expect(files.some((f) => f.endsWith("AdvancedSection.tsx"))).toBe(true);
    expect(files.some((f) => f.endsWith("BindingOptionsDrawer.tsx"))).toBe(true);
  });

  it("no surface labels a raw JSON field as the model / LLM override editor", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (file.includes(SANCTIONED)) continue;
      const source = readFileSync(file, "utf8");
      // The literal label shapes that have shipped as raw JSON textareas here.
      if (
        /["'`][^"'`]*LLM Overrides \(JSON\)/i.test(source) ||
        /title=["']LLM overrides["']/i.test(source)
      ) {
        offenders.push(file.replace(process.cwd() + "/", ""));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every surface that stores llmOverrides routes it through the canonical control", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      // A surface that hands `llmOverrides` to an onChange is EDITING it.
      const edits = /onChange\(\s*["']llmOverrides["']/.test(source) ||
        /handleChange\(\s*["']llmOverrides["']/.test(source);
      if (!edits) continue;
      if (!source.includes(SANCTIONED)) {
        offenders.push(file.replace(process.cwd() + "/", ""));
      }
    }
    expect(offenders).toEqual([]);
  });
});
