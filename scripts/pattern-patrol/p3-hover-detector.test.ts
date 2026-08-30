import {
  analyzeP3HoverSource,
  firstP3HoverRepairUnit,
  type P3HoverScan,
} from "./p3-hover-detector";

describe("P3 hover-only interaction detector", () => {
  it("ranks a directly interactive hover-only control as actionable", () => {
    const [finding] = analyzeP3HoverSource(
      `<button className="opacity-0 group-hover:opacity-100" onClick={save}>Save</button>`,
      "features/save.tsx",
    );
    expect(finding).toMatchObject({
      classification: "actionable",
      file: "features/save.tsx",
      line: 1,
      rank: 140,
      tag: "button",
    });
    expect(finding.reason).toContain("invisible until hover");
  });

  it("detects a hover-hidden wrapper containing an interactive descendant", () => {
    const [finding] = analyzeP3HoverSource(`
      <div className={cn("opacity-0", active && "group-hover:opacity-100")}>
        <Button aria-label="Edit" />
      </div>
    `);
    expect(finding).toMatchObject({
      classification: "actionable",
      rank: 110,
      tag: "div",
    });
    expect(finding.reason).toContain("wrapper containing interactive <Button>");
  });

  it("recognizes namespaced primitive close controls as actionable", () => {
    const [finding] = analyzeP3HoverSource(
      `<ToastPrimitives.Close className="opacity-0 group-hover:opacity-100" />`,
    );
    expect(finding).toMatchObject({
      classification: "actionable",
      rank: 125,
      tag: "ToastPrimitives.Close",
    });
  });

  it.each([
    [
      "responsive mobile visibility",
      `<Button className="md:opacity-0 md:group-hover:opacity-100" />`,
      "responsive breakpoint",
    ],
    [
      "hover-capable media gating",
      `<Button className="[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100" />`,
      "hover-capable media",
    ],
    [
      "coarse-pointer fallback",
      `<Button className="opacity-0 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100" />`,
      "coarse-pointer",
    ],
    [
      "focus fallback",
      `<Button className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />`,
      "focus-visible",
    ],
  ])("recognizes %s as already safe", (_name, source, reason) => {
    const [finding] = analyzeP3HoverSource(source);
    expect(finding.classification).toBe("safe");
    expect(finding.reason).toContain(reason);
  });

  it("separates decorative imported icons from actionable controls", () => {
    const [finding] = analyzeP3HoverSource(`
      import { Sparkles } from "lucide-react";
      export const Accent = () => (
        <span className="opacity-0 group-hover:opacity-100"><Sparkles /></span>
      );
    `);
    expect(finding).toMatchObject({
      classification: "decoration",
      rank: 20,
      tag: "span",
    });
  });

  it("keeps ambiguous custom subtrees in a visible review category", () => {
    const [finding] = analyzeP3HoverSource(
      `<div className="opacity-0 group-hover:opacity-100"><UnknownAction /></div>`,
    );
    expect(finding).toMatchObject({
      classification: "review",
      rank: 60,
    });
  });

  it("returns a deterministic repair unit capped by unique files", () => {
    const actionable = [
      ...analyzeP3HoverSource(
        `<button className="opacity-0 hover:opacity-100" />`,
        "b.tsx",
      ),
      ...analyzeP3HoverSource(
        `<div className="opacity-0 group-hover:opacity-100"><button /></div>`,
        "a.tsx",
      ),
      ...analyzeP3HoverSource(
        `<button className="opacity-0 hover:opacity-100" />`,
        "c.tsx",
      ),
    ].sort((a, b) => b.rank - a.rank || a.file.localeCompare(b.file));
    const scan: P3HoverScan = {
      actionable,
      decoration: [],
      review: [],
      safe: [],
    };
    expect(firstP3HoverRepairUnit(scan, 2).map((finding) => finding.file)).toEqual([
      "b.tsx",
      "c.tsx",
    ]);
  });
});
