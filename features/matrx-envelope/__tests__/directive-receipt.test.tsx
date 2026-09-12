/**
 * DD-118 — THE THREE OUTCOMES MUST READ AS THREE DIFFERENT THINGS.
 *
 * THE RED THIS CLOSES (walk K-1, live, 2026-09-12): a directive that wrote one
 * project and four tasks, the identical re-send the ledger deduped to nothing,
 * and a proposal nobody had confirmed all left the SAME thing on screen — the
 * request re-rendered as a card badged `Ready`. "A user who sends the same
 * request twice sees two identical cards and cannot tell that the second one
 * wrote nothing." There was no receipt surface at all; that absence IS the red,
 * and this file fails to even compile against the pre-DD-118 tree.
 *
 * What is pinned here:
 *   1. the three outcomes render three DIFFERENT sentences;
 *   2. each sentence is the SERVER's, verbatim — this test feeds a message no
 *      client could compose and expects it back character-for-character, so any
 *      future "let's just derive the wording in the component" change fails;
 *   3. `already_applied` never reads like a fresh write.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import DirectiveReceiptBlock, {
  type DirectiveReceiptOutcome,
} from "@/components/mardown-display/blocks/data-events/DirectiveReceiptBlock";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SLUG = "directive_v1_action_create_project_with_tasks";

/** The exact sentences aidream's receipt_words.py produced for walk K-1's item. */
const SERVER_SENTENCES: Record<DirectiveReceiptOutcome, string> = {
  proposed: "Proposed — confirm to run 1 create project with tasks.",
  applied: "Created project “K-1 Walk Test Project” with 3 task(s) and 1 subtask(s).",
  already_applied:
    "Already applied — nothing new was created. Originally: Created project “K-1 Walk Test Project” with 3 task(s) and 1 subtask(s).",
  failed: "Could not run create project with tasks — the project name was already taken",
  blocked:
    "Not applied — nothing was written. Permission to run create project with tasks was refused: resolved apply policy is 'off'",
};

function renderReceipt(outcome: DirectiveReceiptOutcome, ids: string[] = []): string {
  const host = document.createElement("div");
  document.body.appendChild(host);
  let root: Root | null = null;
  act(() => {
    root = createRoot(host);
    root.render(
      <DirectiveReceiptBlock
        directive={SLUG}
        outcome={outcome}
        message={SERVER_SENTENCES[outcome]}
        resourceKind="project"
        resourceIds={ids}
      />,
    );
  });
  const text = host.textContent ?? "";
  act(() => {
    root?.unmount();
  });
  host.remove();
  return text;
}

describe("the directive receipt says what happened", () => {
  it("renders three DIFFERENT sentences for proposed / applied / already applied", () => {
    const proposed = renderReceipt("proposed");
    const applied = renderReceipt("applied", ["p", "t1", "t2", "t3", "t4"]);
    const already = renderReceipt("already_applied", ["p", "t1", "t2", "t3", "t4"]);

    expect(new Set([proposed, applied, already]).size).toBe(3);
    // And specifically: the deduped re-send does not read like a fresh write.
    expect(already).not.toBe(applied);
  });

  it("renders the SERVER's sentence verbatim — never a client-composed one", () => {
    for (const outcome of Object.keys(SERVER_SENTENCES) as DirectiveReceiptOutcome[]) {
      expect(renderReceipt(outcome)).toContain(SERVER_SENTENCES[outcome]);
    }
  });

  it("says up front that an already-applied re-send created nothing", () => {
    const already = renderReceipt("already_applied", ["p", "t1"]);
    expect(already).toContain("Already applied — nothing new was created.");
  });

  it("counts NOTHING on screen — the sentence is the whole card (V-19)", () => {
    // The first cut printed "{N} {resource_kind}s affected" from
    // `resource_ids.length`. For the real create_project_with_tasks receipt —
    // five ids, all under resource_kind "project", for ONE project and FOUR
    // tasks — that read "5 projects affected" beneath a correct sentence. The
    // same false derivation the server refuses to make, made on the client.
    const applied = renderReceipt("applied", ["p", "t1", "t2", "t3", "t4"]);
    expect(applied).not.toMatch(/\d+\s+projects?\s+affected/);
    expect(applied).not.toMatch(/affected/);
    expect(renderReceipt("proposed")).not.toMatch(/affected/);
    expect(renderReceipt("blocked")).not.toMatch(/affected/);
    // What IS on screen: the server's sentence, and the outcome label.
    expect(applied).toContain(SERVER_SENTENCES.applied);
  });

  it("pins the RED: the pre-DD-118 client-composed line could not tell the outcomes apart", () => {
    // What the client used to say, from the only fields it had. `already_applied`
    // counts as `applied` in the batch totals, so a deduped re-send and a fresh
    // write produced BYTE-IDENTICAL text — and a proposal produced none at all.
    const clientComposed = (applied: number, failed: number) =>
      `Applied ${SLUG}: ${applied} created${failed > 0 ? `, ${failed} failed` : ""}`;
    const freshWrite = clientComposed(1, 0);
    const dedupedResend = clientComposed(1, 0);
    expect(dedupedResend).toBe(freshWrite); // ← the defect, reproduced

    // The server's sentences, for the same two events, are not the same string.
    expect(SERVER_SENTENCES.already_applied).not.toBe(SERVER_SENTENCES.applied);
    expect(renderReceipt("already_applied")).not.toBe(renderReceipt("applied"));
  });

  it("marks the outcome on the element, so a screenshot diff can see it too", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    let root: Root | null = null;
    act(() => {
      root = createRoot(host);
      root.render(
        <DirectiveReceiptBlock
          directive={SLUG}
          outcome="already_applied"
          message={SERVER_SENTENCES.already_applied}
        />,
      );
    });
    const el = host.querySelector(`[data-directive="${SLUG}"]`);
    expect(el?.getAttribute("data-outcome")).toBe("already_applied");
    act(() => {
      root?.unmount();
    });
    host.remove();
  });
});
