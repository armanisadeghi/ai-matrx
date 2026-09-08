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

  it("the workspace folds the run panel's surface notes on the system perspective only", () => {
    const source = readFileSync(
      join(REPO_ROOT, "features/mandates/workspace/MandateWorkspace.tsx"),
      "utf8",
    );
    expect(source).toContain('foldSurfaceNotes={perspective === "system"}');
  });

  it("the run panel passes it through to the block", () => {
    const source = readFileSync(
      join(REPO_ROOT, "features/mandates/workspace/RunThisJobSection.tsx"),
      "utf8",
    );
    expect(source).toContain("folded={foldSurfaceNotes}");
  });
});
