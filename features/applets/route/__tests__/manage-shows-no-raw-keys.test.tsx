/**
 * @jest-environment jsdom
 *
 * The manage pages name things in words: Settings › Pages never shows a page's file name
 * ("Calendar.tsx"), Settings › Jobs never shows a job's dotted key ("brand.voice_rewrite").
 * 2026-10-08 audit (lane Z1) found both on screen.
 */
// The repo has no @testing-library/react (test-utils/renderHook.tsx): a plain root under act.
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function render(ui: React.ReactElement): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(ui);
  });
  // Let the catalogue read and the describe calls settle.
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
  return container;
}

const describeJob = jest.fn(async (key: string) => ({ ok: true, data: { label: key === "brand.voice_rewrite" ? "Rewrite in our voice" : "", goal: "" } }));
jest.mock("@ai-matrx/agents/intelligence", () => ({ createIntelligencePort: () => ({ describe: (k: string) => describeJob(k) }) }));
jest.mock("@/lib/api/matrx-transport", () => ({ createMatrxTransport: () => ({}) }));
// The real store is one object for the app's life; the mock is too.
const STORE = { getState: () => ({}) };
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => jest.fn(), useAppStore: () => STORE }));
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/toast-service", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("@/features/agents/redux/applets/thunks", () => ({ saveAppletRecord: jest.fn() }));
jest.mock("@/components/official/ProInput", () => ({
  ProInput: (p: { value: string; "aria-label"?: string }) => <input aria-label={p["aria-label"]} value={p.value} readOnly />,
}));
// The catalogue knows one job, unlabelled; the Applet also uses a job outside it.
jest.mock("@ai-matrx/applets/catalogue", () => ({
  readAppletCatalogue: async () => ({ jobs: [{ key: "notes.summarize", label: "", own: true }], tables: [], entities: [], gaps: [] }),
}));

import { AppletJobsEditor, AppletPagesEditor, fileLabel } from "../AppletRecordEditors";
import type { AppletDefinition } from "@/features/applets/types";

const app = {
  id: "a1",
  organization_id: "o1",
  version: 1,
  files: { "entry.tsx": "x", "Calendar.tsx": "x", "Approvals.tsx": "x" },
  pages: [
    { path: "/", title: "Calendar", file: "Calendar.tsx" },
    { path: "/approvals", title: "Approvals", file: "Approvals.tsx" },
  ],
  mandates: [{ alias: "rewrite", key: "brand.voice_rewrite" }],
} as unknown as AppletDefinition;

// textContent runs siblings together ("Calendar.tsxApprovals.tsx"), so no trailing \b.
const RAW_FILE = /\.(tsx|jsx|ts|js)(?![a-z])/;
const DOTTED_KEY = /[a-z_]+\.[a-z_]{3,}/;

describe("manage pages show words, never file names or job keys", () => {
  it("fileLabel: the page's title, else the file's name in words", () => {
    expect(fileLabel("Calendar.tsx", [{ title: "My calendar", file: "Calendar.tsx" }])).toBe("My calendar");
    expect(fileLabel("client_portal.tsx", [])).toBe("Client portal");
    expect(fileLabel("entry.tsx", [])).toBe("Entry");
  });

  it("Settings › Pages renders no .tsx file name", async () => {
    const container = await render(<AppletPagesEditor app={app} />);
    expect(container.textContent ?? "").not.toMatch(RAW_FILE);
    expect(container.textContent ?? "").toContain("Calendar");
  });

  it("Settings › Jobs renders the job's described label, never its dotted key", async () => {
    const container = await render(<AppletJobsEditor app={app} />);
    expect(container.textContent ?? "").toContain("Rewrite in our voice");
    expect(container.textContent ?? "").not.toMatch(DOTTED_KEY);
    expect(describeJob).toHaveBeenCalledWith("brand.voice_rewrite");
  });
});
