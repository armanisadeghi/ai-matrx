/**
 * Lane F6 (Arman built "Client Offer Breakdowns", 2026-10-09): the fix round says what it is fixing in
 * plain words, the history never shows "Fixing" twice, the card says what each button does and shows the
 * full link, the held badge is explained, and a generated Applet never ships the Sparkles icon.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { bannedIcons } from "./applet-code-checks";
import { appletLink, doneLine, fixNarration, fixRowText, heldHint, requestOutcome, type BuildEntry } from "./build-session";

const REFUSAL = 'Not saved: the date "created_date" is a plain text box — use <RecordField source field="created_date" … /> (or <DateField>) so she picks a date.';
const entry = (over: Partial<BuildEntry>): BuildEntry =>
  ({ id: "e", text: "Make an applet", fix: null, state: "running", started_at: "2026-10-09T05:34:01Z", conversation_id: null, ...over }) as BuildEntry;

describe("F6 the fix round narrates in her words", () => {
  it("names the field the check found, never the check's code words", () => {
    expect(fixNarration(REFUSAL)).toBe("I found a problem with the created date field and I'm fixing it");
    expect(fixNarration("Not saved: something broke")).toBe("I found a problem and I'm fixing it");
    expect(fixRowText({ fix: { where: "record", message: REFUSAL } })).toBe("Fix the created date field");
  });
  it("a refused request and its running fix round never both read Fixing", () => {
    const requests = [entry({ id: "a", state: "refused" }), entry({ id: "b", state: "running", text: "Fix this error", fix: { where: "record", message: REFUSAL } })];
    expect(requestOutcome(requests, 0).label).toBe("Problem found");
    expect(requestOutcome(requests, 1).label).toBe("Fixing");
  });
});

describe("F6 the card says it is done and gives the real link", () => {
  it("says what Use it and Open each do, within one line", () => {
    const line = doneLine("draft");
    expect(line).toMatch(/draft/);
    expect(line).toMatch(/Use it/);
    expect(line).toMatch(/Open/);
    expect(line.length).toBeLessThanOrEqual(60);
  });
  it("is the full address, never a bare path", () => {
    expect(appletLink("https://www.aimatrx.com/", "client-offer-breakdowns")).toBe("https://www.aimatrx.com/applets/client-offer-breakdowns");
  });
  it("explains the held badge in one tooltip sentence", () => {
    expect(heldHint(1)).toMatch(/^1 change you made/);
    expect(heldHint(1).length).toBeLessThanOrEqual(140);
  });
  it("copies through the kit clipboard door, never navigator.clipboard", () => {
    const src = readFileSync(join(__dirname, "AppletBuilder.tsx"), "utf8");
    expect(src).toContain('from "@ai-matrx/kit/clipboard"');
    expect(src).not.toContain("navigator.clipboard");
  });
});

describe("F6 one live window per build", () => {
  it("every run window of a build shares one instance id, and a refusal closes it before the fix round", () => {
    const src = readFileSync(join(__dirname, "AppletBuilder.tsx"), "utf8");
    const opens = src.match(/openRunWindow\(\{[^}]*\}\)/g) ?? [];
    expect(opens.length).toBeGreaterThan(0);
    for (const call of opens) expect(call).toContain("instanceId: buildWindowId(");
    expect(src).not.toMatch(/live\.handle\?\.update\(\{ pending: false \}\);\s*live\.handle = null;\s*await repairRefusal/);
  });
});

describe("F6 bannedIcons", () => {
  it("refuses Sparkles from lucide, allows an emoji in her own text", () => {
    expect(bannedIcons({ name: "list.tsx", source: `import { Plus, Sparkles } from "lucide-react";\nexport default () => <h1><Sparkles /> Offer Breakdowns</h1>;` })).toEqual(["Sparkles"]);
    expect(bannedIcons({ name: "data.ts", source: `export const S = { client_name: "🇪🇸 VIVA ESPAÑA ✨" };` })).toEqual([]);
    expect(bannedIcons({ name: "a.tsx", source: `import { SparklesIcon as S } from "lucide-react";` })).toEqual(["Sparkles"]);
  });
});
