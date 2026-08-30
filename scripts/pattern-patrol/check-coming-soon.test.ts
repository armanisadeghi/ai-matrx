import { scanSourceText } from "./check-coming-soon";

describe("P9 coming-soon static detector", () => {
  it("ignores comments and registered announcer calls", () => {
    const result = scanSourceText(`
      // Coming soon is documentation here.
      announceComingSoon("files.activity");
    `);

    expect(result.findings).toEqual([]);
    expect(result.announcedIds).toEqual(["files.activity"]);
  });

  it("routes rendered promise language and toast copy to repair-now", () => {
    const result = scanSourceText(`
      export function Example() {
        const run = () => toast.info("Coming soon");
        return <button title="Coming soon" onClick={run}>SOON</button>;
      }
    `);

    expect(result.findings.map((finding) => finding.kind)).toEqual(
      expect.arrayContaining(["bare-toast", "bare-jsx"]),
    );
    expect(result.findings.every((finding) => finding.route === "repair-now")).toBe(
      true,
    );
  });

  it("keeps non-rendered code samples in contextual review", () => {
    const result = scanSourceText(`
      const code = \`disabled: true // Coming soon feature\`;
    `);

    expect(result.findings).toEqual([
      expect.objectContaining({ kind: "context-review", route: "review" }),
    ]);
  });

  it("treats user-facing data properties as repair-now", () => {
    const result = scanSourceText(`
      export const card = { title: "Reports coming soon" };
    `);

    expect(result.findings).toEqual([
      expect.objectContaining({ kind: "user-facing-data", route: "repair-now" }),
    ]);
  });
});
