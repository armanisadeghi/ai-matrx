/**
 * A PASTE ATTACHES ONCE (2026-10-06). One pasted screenshot showed up as TWO
 * attachments — "pasted-image-<time>.png" and "<original>.png". Two handlers
 * caught the same paste: the hand-rolled `useClipboardPaste` on AgentTextarea
 * and react-dropzone's own paste-to-upload (on by default since v20) on the
 * composer's drop target, which wraps the textarea. The library owns it now;
 * nothing inside the Smart Agent Input may catch a paste itself.
 *
 * RED before: AgentTextarea imported useClipboardPaste / usePasteImageResource,
 * and the drop target had no paste switch (so a host's "no pasting" was ignored).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const smartInput = join(__dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "__tests__") return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

it("no file of the Smart Agent Input catches a paste itself — the drop target's library does", () => {
  const offenders = sources(smartInput).filter((file) => {
    const text = readFileSync(file, "utf8");
    return /useClipboardPaste\(|usePasteImageResource\(|addEventListener\(\s*["']paste|onPaste=/.test(text);
  });
  expect(offenders.map((f) => f.slice(smartInput.length + 1))).toEqual([]);
});

it("the drop target hands paste to react-dropzone and lets a host turn it off", () => {
  const dropTarget = readFileSync(join(smartInput, "SmartInputFileDropTarget.tsx"), "utf8");
  expect(dropTarget).toContain("noPaste: !pasteFiles");
  const stacked = readFileSync(join(smartInput, "SmartAgentInputStacked.tsx"), "utf8");
  // Every style's drop target follows the host's paste setting.
  const targets = stacked.match(/<SmartInputFileDropTarget[\s\S]*?>/g) ?? [];
  expect(targets.length).toBeGreaterThanOrEqual(3);
  for (const target of targets) expect(target).toContain("pasteFiles={enablePasteImages}");
});
