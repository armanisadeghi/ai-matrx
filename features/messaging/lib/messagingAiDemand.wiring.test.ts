/**
 * THE WIRING GUARD for "a page must not resolve what it does not run".
 *
 * The demand mechanism only works if BOTH ends stay wired: the app-wide host
 * must gate resolution on the demand, and the one component that renders the
 * conversation AI bar must declare it. Either end silently dropped gives you
 * back one of the two failures this closed —
 *
 *   host stops gating  → four resolutions and four errors on every route again
 *   pane stops asking  → the AI chips never appear, anywhere, with nothing said
 *
 * Both are invisible in a type check and invisible in a diff read quickly,
 * which is why they are asserted here instead of trusted.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (relative: string): string =>
  readFileSync(join(process.cwd(), relative), "utf8");

describe("messaging AI demand wiring", () => {
  it("MessagingHost resolves the intelligences only on demand", () => {
    const host = read("providers/MessagingHost.tsx");
    expect(host).toContain("useMessagingAiDemandCounter");
    expect(host).toContain("MessagingAiDemandProvider");
    // The gate itself — not merely the import.
    expect(host).toMatch(/enabled:\s*aiDemand\.demanded/);
  });

  it("ConversationPane declares the demand", () => {
    const pane = read("features/messaging/components/ConversationPane.tsx");
    expect(pane).toContain("useMessagingAiDemand()");
  });

  it("ConversationPane is still the ONLY renderer of ConversationView", () => {
    // The demand is declared in exactly one place because the pane is the only
    // component that renders the package's view. If that stops being true, the
    // new renderer needs its own `useMessagingAiDemand()` — this is how you
    // find out, rather than by noticing the chips are missing in production.
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const hits = execSync(
      // A real JSX render, not the prose in these files' doc comments: the
      // element opens its own line and its props follow.
      "grep -rlE '^[[:space:]]*<ConversationView$' --include=*.tsx . || true",
      { cwd: process.cwd(), encoding: "utf8" },
    )
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.includes("node_modules"));
    expect(hits).toEqual(["./features/messaging/components/ConversationPane.tsx"]);
  });
});
