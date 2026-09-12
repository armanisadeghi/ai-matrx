/**
 * AN ANCHORED PANEL MAY NOT BE CAPPED WITH A VIEWPORT FRACTION.
 *
 * 🚨 The class behind FIX-Q13's hidden DANGER section. A dropdown, context
 * menu, submenu or popover is anchored to the control that opened it, so it
 * STARTS partway down the screen — `max-h-[70dvh]` is measured against the
 * whole viewport and the panel overhangs the bottom by however far down the
 * trigger sits. Radix measures the space that is actually there and publishes
 * it as `--radix-<family>-content-available-height`; that is the only cap that
 * fits. (Centered dialogs, sheets and drawers are NOT anchored — a viewport
 * fraction is right for them, so they are not in this census.)
 *
 * RED against HEAD before the fix: 13 findings across 11 files — admin
 * breadcrumbs and the admin nav tree, the admin sidebar menu and its submenu,
 * the v3 menu's own submenu, the print section menu, the agent-apps filter
 * popover, the attached-document chip, the shared-canvas popover, the
 * ProTextarea menu, and two hover cards. GREEN: 0.
 */
import { readFileSync } from "fs";
import { execSync } from "child_process";
import path from "path";

const ROOT = path.resolve(__dirname, "../../../..");

/** Radix popper surfaces — every one of them is anchored to a trigger. */
const ANCHORED = [
  "DropdownMenuContent",
  "DropdownMenuSubContent",
  "ContextMenuContent",
  "ContextMenuSubContent",
  "MenubarContent",
  "MenubarSubContent",
  "PopoverContent",
  "HoverCardContent",
  // The v3 menu's family adapter renders Radix SubContent under this name.
  "SubContent",
];

const VIEWPORT_FRACTION = /max-h-\[[^\]]*\d+\s*d?vh[^\]]*\]/;

function sourceFiles(): string[] {
  const out = execSync(
    `git ls-files -- 'app/*.tsx' 'components/*.tsx' 'features/*.tsx' 'lib/*.tsx'`,
    { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  return out.split("\n").filter(Boolean);
}

interface Finding {
  file: string;
  line: number;
  tag: string;
  text: string;
}

function scan(): Finding[] {
  const findings: Finding[] = [];
  for (const rel of sourceFiles()) {
    const src = readFileSync(path.join(ROOT, rel), "utf8");
    for (const tag of ANCHORED) {
      const opener = new RegExp(`<${tag}(?![A-Za-z])`, "g");
      let m: RegExpExecArray | null;
      while ((m = opener.exec(src))) {
        // The opening tag's props, bounded so a whole file is never swept in.
        const window = src.slice(m.index, m.index + 1200);
        const end = window.indexOf(">\n");
        // Comments are prose, not styling — the banner in `ItemMenu.tsx` says
        // the word `max-h-[70vh]` precisely to explain why it is wrong, and a
        // guard that reads its own explanation as a violation is noise.
        const props = (end === -1 ? window : window.slice(0, end))
          .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\/\/[^\n]*/g, "");
        const hit = VIEWPORT_FRACTION.exec(props);
        if (!hit) continue;
        findings.push({
          file: rel,
          line: src.slice(0, m.index).split("\n").length,
          tag,
          text: hit[0],
        });
      }
    }
  }
  return findings;
}

describe("every anchored panel caps on the height Radix measured", () => {
  const findings = scan();

  it("finds no viewport-fraction cap on an anchored panel", () => {
    const report = findings
      .map((f) => `${f.file}:${f.line} <${f.tag}> ${f.text}`)
      .join("\n");
    expect(report).toBe("");
  });

  it("can still see the surfaces it is meant to police", () => {
    // A rename that emptied the census would make the guard silently green.
    const files = sourceFiles();
    const seen = files.filter((rel) => {
      const src = readFileSync(path.join(ROOT, rel), "utf8");
      return ANCHORED.some((t) => new RegExp(`<${t}(?![A-Za-z])`).test(src));
    });
    expect(seen.length).toBeGreaterThan(20);
  });
});
