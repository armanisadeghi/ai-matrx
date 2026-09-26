/**
 * The mode pill's labels must key off the width its HOST HEADER has, never the
 * viewport. On 2026-09-26 the viewport-keyed labels (`2xl:inline`) rendered at
 * 1440px while "Choose org" and "Review answers" also sat in the header, and the
 * pill overflowed onto "Choose org" (measured: 1229px of content in a 1160px
 * slot). The labels now use `@container/agent-header`, so every desktop host of
 * `AgentModeController` must declare that container — a host that forgets it
 * silently never shows the labels.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const CONTROLLER = "features/agents/components/shared/AgentModeController.tsx";
const HOSTS = [
  "features/agents/components/shared/AgentHeader.tsx",
  "features/agents/components/run/AgentRunHeader.tsx",
  "features/agents/components/widgets/AgentWidgetsPage.tsx",
];

describe("agent mode labels follow the header's own width", () => {
  it("never keys the labels to a viewport breakpoint", () => {
    const src = read(CONTROLLER);
    expect(src).toMatch(/@min-\[\d+px\]\/agent-header:inline/);
    expect(src).not.toMatch(/\b(?:sm|md|lg|xl|2xl):inline\b/);
  });

  it.each(HOSTS)("%s declares the agent-header container", (rel) => {
    const src = read(rel);
    expect(src).toContain("<AgentModeController");
    expect(src).toContain("@container/agent-header");
  });
});
