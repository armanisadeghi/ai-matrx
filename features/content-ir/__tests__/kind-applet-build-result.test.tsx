/**
 * `applet_build_result` — the Applet builder's answer renders as words, never as raw JSON,
 * and the client's save path still reads the same answer (sources included).
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { envelopeFromCompleteValue, KIND_KEY } from "@ai-matrx/content-ir";

import AppletBuildResultBlock from "@/components/mardown-display/blocks/applet-build-result/AppletBuildResultBlock";
import { checkBuildAnswer, coerceBuildAnswer } from "@/features/applets-host/builder/build-applet";
import {
  APPLET_BUILD_RESULT_KIND,
  appletBuildResultMarkdownFromValue,
  appletBuildResultServerDataFromEnvelope,
} from "../kinds/applet-build-result";
import { SYSTEM_KIND_DEFINITIONS } from "../registry/system-kinds";

// Her tables are named by the one read of the tables she can see; the card never shows the code's alias.
jest.mock("@/features/applets/hooks/useSourceTableNames", () => ({
  useSourceTableNames: () => ({
    "0b6f6a2e-4c1d-4f7a-9f55-3e2b1c9d8a71": { name: "Client Posts", organizationName: "Oak & River", organizationId: "344cfaa8-2b0c-4971-854a-9694614816f2" },
  }),
}));
jest.mock("@ai-matrx/rich-content/code-block/CodeBlock", () => ({
  __esModule: true,
  default: ({ code }: { code: string }) => <pre data-testid="code">{code}</pre>,
}));

const ANSWER = {
  [KIND_KEY]: APPLET_BUILD_RESULT_KIND,
  applet: {
    name: "Client Approvals",
    slug: "client-approvals",
    description: "See each client's posts and approve the ones in review.",
    entry: "App.tsx",
    files: [
      { name: "App.tsx", source: 'import { Pages } from "@ai-matrx/applets/react";\nexport default function App() { return <Pages layout="tabs" />; }' },
      { name: "Approvals.tsx", source: 'import { useRows } from "@ai-matrx/applets/react";\nexport default function Approvals() { const posts = useRows("posts"); return <ul />; }' },
    ],
    pages: [{ path: "/", title: "Approvals", file: "Approvals.tsx" }],
    sources: [{ alias: "posts", table_id: "0b6f6a2e-4c1d-4f7a-9f55-3e2b1c9d8a71", organization_id: "344cfaa8-2b0c-4971-854a-9694614816f2" }],
    mandates: [],
  },
  note: "Built a one-page approvals list on your Posts table.",
};

describe("applet_build_result", () => {
  it("is registered partial-ready with its render key", () => {
    const def = SYSTEM_KIND_DEFINITIONS.find((d) => d.kind === APPLET_BUILD_RESULT_KIND);
    expect(def?.legacyBlockType).toBe("applet_build_result");
    expect(def?.partialReady).toBe(true);
  });

  it("bridges a complete answer to the component's data", () => {
    const data = appletBuildResultServerDataFromEnvelope(envelopeFromCompleteValue(ANSWER, APPLET_BUILD_RESULT_KIND));
    expect(data?.isComplete).toBe(true);
    expect(data?.name).toBe("Client Approvals");
    expect(data?.pages).toEqual([{ path: "/", title: "Approvals" }]);
    expect(data?.sources).toEqual([{ alias: "posts", type: "table", entity: null, tableId: "0b6f6a2e-4c1d-4f7a-9f55-3e2b1c9d8a71" }]);
    expect(data?.files).toHaveLength(2);
  });

  it("shows words, not code, until 'Show the code' is pressed", () => {
    const data = appletBuildResultServerDataFromEnvelope(envelopeFromCompleteValue(ANSWER, APPLET_BUILD_RESULT_KIND));
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<AppletBuildResultBlock serverData={data} />));
    const text = host.textContent ?? "";
    expect(text).toContain("Client Approvals");
    expect(text).toContain("Approvals");
    expect(text).toContain("Client Posts · Oak & River");
    expect(text).toContain(ANSWER.note);
    expect(host.querySelectorAll('[data-testid="code"]')).toHaveLength(0);
    expect(text).not.toContain("useRows");
    const toggle = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Show the code"));
    expect(toggle).toBeTruthy();
    act(() => toggle!.click());
    expect(host.querySelectorAll('[data-testid="code"]')).toHaveLength(2);
    act(() => root.unmount());
  });

  it("declines a value with no app yet (the skeleton stays up)", () => {
    expect(
      appletBuildResultServerDataFromEnvelope(
        envelopeFromCompleteValue({ [KIND_KEY]: APPLET_BUILD_RESULT_KIND, note: "" }, APPLET_BUILD_RESULT_KIND),
      ),
    ).toBeUndefined();
  });

  it("markdown names the app and its pages, never the source", () => {
    const md = appletBuildResultMarkdownFromValue(ANSWER);
    expect(md).toContain("# Client Approvals");
    expect(md).toContain("- Approvals (/)");
    expect(md).not.toContain("useRows");
  });

  it("the save path still accepts the kinded answer and keeps every source", () => {
    const answer = checkBuildAnswer(ANSWER, coerceBuildAnswer(ANSWER));
    expect(answer.applet.sources).toEqual([
      { alias: "posts", table_id: "0b6f6a2e-4c1d-4f7a-9f55-3e2b1c9d8a71", organization_id: "344cfaa8-2b0c-4971-854a-9694614816f2" },
    ]);
    expect(answer.note).toBe(ANSWER.note);
  });

  // The 2026-10-07 social-post planner: she had no tables for it, so the answer DECLARES them.
  const PLANNER = {
    ...ANSWER,
    applet: {
      ...ANSWER.applet,
      files: [
        ANSWER.applet.files[0]!,
        { name: "Approvals.tsx", source: 'import { useRows } from "@ai-matrx/applets/react";\nexport default function Approvals() { const posts = useRows("posts"); const brands = useRows("brands"); return <ul />; }' },
      ],
      sources: [
        {
          alias: "posts",
          new_table: {
            name: "Posts",
            title_field: "title",
            fields: [
              { key: "title", label: "Title", type: "text" },
              { key: "brand", label: "Brand", type: "relation", links_to: { alias: "brands" } },
              { key: "status", label: "Status", type: "select", options: ["Idea", "Planned", "Assets ready", "Posted"] },
            ],
          },
        },
        { alias: "brands", new_table: { name: "Brands", fields: [{ key: "name", label: "Name", type: "text" }] } },
      ],
    },
  };

  it("keeps new_table sources, names them in the window, and refuses a broken declaration before saving", () => {
    const answer = checkBuildAnswer(PLANNER, coerceBuildAnswer(PLANNER), { organizationId: "344cfaa8-2b0c-4971-854a-9694614816f2", tables: [] });
    expect(answer.applet.sources.map((s) => ("new_table" in s ? s.new_table.name : s.alias))).toEqual(["Posts", "Brands"]);
    const data = appletBuildResultServerDataFromEnvelope(envelopeFromCompleteValue(PLANNER, APPLET_BUILD_RESULT_KIND));
    expect(data?.sources.map((s) => s.newTable?.name)).toEqual(["Posts", "Brands"]);
    const broken = JSON.parse(JSON.stringify(PLANNER));
    broken.applet.sources[0].new_table.fields[2].options = [];
    expect(() => checkBuildAnswer(broken, coerceBuildAnswer(broken), { organizationId: "o" })).toThrow(/"status" is a choice and lists no options/);
    const repeats = () => checkBuildAnswer(PLANNER, coerceBuildAnswer(PLANNER), { organizationId: "o", tables: [{ table_id: "t", organization_id: "o", name: "Brands" }] });
    expect(repeats).toThrow(/already has a table called "Brands"/);
  });

  // Observed live (run over Cedar Ridge PT's own tables): every optional arm arrives filled — empty strings and an
  // EMPTY declaration beside the bound table. The bound table decides; nothing is "made".
  it("reads a bound source carrying an empty strict-wire declaration as the bound table", () => {
    const wire = {
      ...ANSWER,
      applet: {
        ...ANSWER.applet,
        sources: [{ alias: "posts", entity: "", table_id: "0b6f6a2e-4c1d-4f7a-9f55-3e2b1c9d8a71", organization_id: "344cfaa8-2b0c-4971-854a-9694614816f2", new_table: { name: "", label_singular: "", title_field: "", fields: [] } }],
      },
    };
    const answer = checkBuildAnswer(wire, coerceBuildAnswer(wire), { organizationId: "344cfaa8-2b0c-4971-854a-9694614816f2", tables: [] });
    expect(answer.applet.sources).toEqual([{ alias: "posts", table_id: "0b6f6a2e-4c1d-4f7a-9f55-3e2b1c9d8a71", organization_id: "344cfaa8-2b0c-4971-854a-9694614816f2" }]);
    expect(appletBuildResultServerDataFromEnvelope(envelopeFromCompleteValue(wire, APPLET_BUILD_RESULT_KIND))?.sources[0]?.type).toBe("table");
  });

  // Audit 2026-10-07: an Applet built in "AI Matrx" was bound to a blank "Untitled database" of "Oak & River".
  it("refuses an answer that binds a table of another organization, naming it", () => {
    const crossOrg = { ...ANSWER, applet: { ...ANSWER.applet, sources: [{ alias: "posts", table_id: "0b6f6a2e-4c1d-4f7a-9f55-3e2b1c9d8a71", organization_id: "oak-and-river" }] } };
    const bind = () =>
      checkBuildAnswer(crossOrg, coerceBuildAnswer(crossOrg), {
        organizationId: "ai-matrx",
        tables: [{ table_id: "0b6f6a2e-4c1d-4f7a-9f55-3e2b1c9d8a71", organization_id: "oak-and-river", name: "Untitled database" }],
      });
    expect(bind).toThrow(/binds "Untitled database", a table of another organization/);
  });
});
