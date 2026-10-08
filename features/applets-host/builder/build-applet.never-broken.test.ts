/**
 * AN APPLET IS NEVER PUBLISHED BROKEN (lane AB, social planner live test 2026-10-08). Cut from Applet
 * 586891fa: `window.confirm` to delete a brand, a placeholder `"https://drive…\nhttps://figma…"` that showed
 * a literal "\n", and "Use it" enabled beside "Missing in this Applet: useNavigate". checkBuildAnswer
 * refuses the first two (the refusal is what the automatic fix round sends back); `publishBlockedBy` holds
 * publishing while the preview reports any error.
 */
import { browserDialogs, checkBuildAnswer, coerceBuildAnswer, BuildRefused, literalNewlineAttributes, publishBlockedBy } from "./build-applet";

const file = (name: string, source: string) => ({ name, source });

const BRANDS = `import React from "react";
import { useRows } from "@ai-matrx/applets/react";
export default function BrandsPage() {
  const brands = useRows("brands");
  const handleDelete = async (id) => {
    if (window.confirm("Delete this brand?")) {
      await brands.archive(id);
    }
  };
  return <button onClick={() => handleDelete(brands.rows[0]._id)}>Delete</button>;
}`;

const LINKS = `import React from "react";
import { WritingBox } from "@ai-matrx/applets/react";
export default function Detail({ value, set }) {
  const urls = value.split("\\n");
  return <WritingBox value={value} onValueChange={set} label="Links" placeholder="https://drive.google.com/...\\nhttps://figma.com/..." rows={3} />;
}`;

function answerWith(files: Record<string, string>) {
  const raw = {
    applet: {
      name: "Planner",
      entry: "App.tsx",
      files: Object.entries(files).map(([name, source]) => ({ name, source })),
      pages: [{ path: "/", title: "Brands", file: "App.tsx" }],
      sources: [{ alias: "brands", table_id: "f3ff17c2-ca0e-4165-927d-ceadf10d119e", organization_id: "6244807c-842d-41ff-9c50-bc2b7261da58" }],
      mandates: [],
    },
    note: "",
  };
  return { raw, answer: coerceBuildAnswer(raw) };
}

describe("browserDialogs", () => {
  it("names window.confirm, a bare alert and prompt", () => {
    expect(browserDialogs(file("BrandsPage.tsx", BRANDS))).toEqual(["confirm"]);
    expect(browserDialogs(file("a.tsx", `alert("Saved"); const n = prompt("Name?"); window.alert;`)).sort()).toEqual(["alert", "prompt"]);
  });
  it("passes the platform's confirmAction", () => {
    const fixed = BRANDS.replace("window.confirm(\"Delete this brand?\")", 'await confirmAction({ title: "Archive this brand?", confirmLabel: "Archive" })');
    expect(browserDialogs(file("BrandsPage.tsx", fixed))).toEqual([]);
  });
});

describe("literalNewlineAttributes", () => {
  it("names a JSX string attribute that would show a literal \\n, never a JS string", () => {
    expect(literalNewlineAttributes(file("Detail.tsx", LINKS))).toEqual(["placeholder"]);
    expect(literalNewlineAttributes(file("x.tsx", `const lines = text.split("\\n"); <input placeholder="One line" />`))).toEqual([]);
  });
});

describe("checkBuildAnswer", () => {
  it("refuses a browser dialog and a literal \\n placeholder, naming each", () => {
    const { raw, answer } = answerWith({ "App.tsx": BRANDS, "Detail.tsx": LINKS });
    let refused: unknown = null;
    try {
      checkBuildAnswer(raw, answer);
    } catch (err) {
      refused = err;
    }
    expect(refused).toBeInstanceOf(BuildRefused);
    const message = (refused as Error).message;
    expect(message).toContain("App.tsx calls the browser's confirm()");
    expect(message).toContain("confirmAction");
    expect(message).toContain('Detail.tsx has placeholder="…\\n…"');
  });
});

describe("publishBlockedBy", () => {
  it("holds Use it while the preview reports an error, with the reason", () => {
    expect(publishBlockedBy({ message: 'Missing in this Applet: useNavigate from "@ai-matrx/applets/react"' })).toBe(
      'Fix this before using it: Missing in this Applet: useNavigate from "@ai-matrx/applets/react"',
    );
    expect(publishBlockedBy(null)).toBeNull();
  });
});

describe("checkBuildAnswer with the package's import check", () => {
  it("refuses an import the module does not export, read from the real module (useNavigate)", async () => {
    const { appletImportProblems } = await import("@ai-matrx/applets/frame");
    const page = `import React from "react";\nimport { usePage, useNavigate } from "@ai-matrx/applets/react";\nexport default function App() { const go = useNavigate(); return <button onClick={() => go("/")}>Back</button>; }`;
    const { raw, answer } = answerWith({ "App.tsx": page });
    expect(() => checkBuildAnswer(raw, answer, { importProblems: appletImportProblems })).toThrow(/imports useNavigate from "@ai-matrx\/applets\/react", which does not export it — use navigate/);
    const fixed = page.replace("usePage, useNavigate", "navigate").replace("const go = useNavigate(); ", "").replace('go("/")', 'navigate("/")');
    expect(checkBuildAnswer(...Object.values(answerWith({ "App.tsx": fixed })) as [unknown, ReturnType<typeof coerceBuildAnswer>], { importProblems: appletImportProblems }).applet.files).toHaveLength(1);
  });
});
