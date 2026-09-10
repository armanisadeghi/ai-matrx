/**
 * ── A SECOND COPY OF ONE DEFECT IS FOLDED, NEVER SWALLOWED ───────────────────
 *
 * 🚨 THE DEFECT (FIX-R9-UI round 3, re-walk of production v0.4.1734). The
 * re-walk closed two of three findings and failed the third: the mandate admin
 * page stated the SAME defect in three places. One of them was this block — the
 * input surface's server notes, printed in full under *"What the server could
 * not read"*, restating the holder problem the Holder section states four inches
 * above, in the server's longer words:
 *
 *   "No Holder fulfils this job yet (Mandate 'research_client.output_slides':
 *    resolved system agent 8f0bbfc2-… breaks the mandate contract: declares no
 *    structured output_schema, but this mandate's consumers require output keys
 *    ['title', 'slides']), so the agent's own declarations could not inform this
 *    form. Bind a Holder and it will."
 *
 * Arman: *"the repitition makes it more and more complex for no reason."*
 *
 * The fix is NOT to drop the note — a swallowed server sentence is the fourth
 * law's silence, and this block exists precisely because those sentences used to
 * reach the browser and appear nowhere. It is FOLDED on a host that already
 * states the defect: the counted heading still says a note exists, and the
 * server's exact words are one click away.
 *
 * RED against the shipped component: `folded` does not exist, so the notes are
 * always in an open `<div>` with no `<details>` and no `<summary>`.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/components/official/entity-ref/TextWithDoors", () => ({
  TextWithDoors: ({ text }: { text: string }) => <span>{text}</span>,
}));

import { ServerNotes } from "../ServerNotes";

/** The sentence the re-walk actually read, verbatim. */
const THE_NOTE =
  "No Holder fulfils this job yet (Mandate 'research_client.output_slides': " +
  "resolved system agent 8f0bbfc2-85d9-4913-8cea-b09a50c62be6 breaks the " +
  "mandate contract), so the agent's own declarations could not inform this " +
  "form. Bind a Holder and it will.";

function render(folded: boolean) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ServerNotes
        heading="What the server could not read"
        notes={[THE_NOTE]}
        folded={folded}
      />,
    );
  });
  return { container, root };
}

describe("a host that already states the defect folds the server's second copy", () => {
  it("folds into a details/summary carrying the COUNT, not a bare toggle", () => {
    const { container, root } = render(true);
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    const summary = container.querySelector("summary");
    expect(summary?.textContent).toBe("What the server could not read — 1 note");
    act(() => root.unmount());
  });

  it("keeps the server's sentence VERBATIM inside the fold — nothing paraphrased, nothing dropped", () => {
    const { container, root } = render(true);
    expect(container.textContent).toContain(THE_NOTE);
    act(() => root.unmount());
  });

  it("is OPEN by default everywhere else — the fold is a host's decision, never this block's", () => {
    const { container, root } = render(false);
    expect(container.querySelector("details")).toBeNull();
    expect(container.textContent).toContain(THE_NOTE);
    act(() => root.unmount());
  });

  it("still renders NOTHING when there is nothing to say", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <ServerNotes heading="What the server could not read" notes={[]} folded />,
      );
    });
    expect(container.textContent).toBe("");
    act(() => root.unmount());
  });
});

describe("the admin mandate host is the one that folds it", () => {
  const REPO_ROOT = join(__dirname, "..", "..", "..");

  /**
   * WHERE THE HOST MOVED (816ea88701, "refactor(mandates): separate
   * configuration concerns into tabs", 2026-09-08 — one day after the fold).
   * The admin mandate screen became tabs, and the ad-hoc run left the always-on
   * workspace body: it is the super-admin-only **Test** tab now
   * (`MandateWorkspace` `adminContent` → `MandateDetailView section="test"` →
   * `MandateTestBench` → `TryItNowPanel`). So `MandateWorkspace` no longer
   * carries `foldSurfaceNotes={perspective === "system"}` — the perspective
   * condition went away with the host, because the tab that runs the job is
   * admin-only in the first place, and the panel folds the server's second
   * telling UNCONDITIONALLY. That is the same ruling, stated once and more
   * strongly, so this guard follows the fold to its live host rather than
   * pinning a line the refactor deliberately deleted.
   */
  it("the admin run panel folds the input-declaration notes it re-states", () => {
    const source = readFileSync(
      join(REPO_ROOT, "features/mandates/admin/TryItNowPanel.tsx"),
      "utf8",
    );
    const block = source.slice(source.indexOf('testId="test-input-surface-notes"'));
    expect(block.slice(0, 200)).toContain("folded");
  });

  it("the workspace run panel still passes its host's decision through", () => {
    const source = readFileSync(
      join(REPO_ROOT, "features/mandates/workspace/RunThisJobSection.tsx"),
      "utf8",
    );
    expect(source).toContain("folded={foldSurfaceNotes}");
  });
});
