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
    expect(data?.sources).toEqual([{ alias: "posts", type: "table", entity: null }]);
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
    expect(text).toContain("posts");
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
});
