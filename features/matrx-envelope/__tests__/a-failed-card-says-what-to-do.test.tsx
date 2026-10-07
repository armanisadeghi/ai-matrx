/**
 * An action card the server cannot run says so in plain words, in THIS app.
 *
 * THE DEFECT (G5 review, 2026-10-02, nightly clone): the card showed
 * "unknown / non-writable noun 'task'. Writable: [...]" to the person. The
 * package (content-ir-react 0.17.0) now keeps raw text behind "Details"; this
 * proves the app's host names the non-writable case — what failed and what to
 * do — through the real package card and the real host's `explainFailure`.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  DirectiveHostProvider,
  DirectiveRender,
  type DirectiveHost,
} from "@ai-matrx/content-ir-react";
import { matrxDirectiveHost } from "@/features/matrx-envelope/directiveHost";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const RAW =
  "unknown / non-writable noun 'task'. Writable: ['agent', 'conversation', 'note'].";

async function failedCard(raw = RAW, kind = "directive_v1_create_task"): Promise<HTMLElement> {
  const host: DirectiveHost = {
    confirm: async () => {
      throw new Error(raw);
    },
  };
  if (matrxDirectiveHost.nouns) host.nouns = matrxDirectiveHost.nouns;
  if (matrxDirectiveHost.explainFailure) host.explainFailure = matrxDirectiveHost.explainFailure;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <DirectiveHostProvider host={host}>
        <DirectiveRender
          content={{ __kind: kind, items: [{ title: "G5 card" }] }}
        />
      </DirectiveHostProvider>,
    );
  });
  const apply = [...container.querySelectorAll("button")].find((b) => b.textContent === "Apply")!;
  await act(async () => {
    apply.click();
  });
  return container;
}

describe("a failed action card in this app", () => {
  it("names the non-writable case in plain words; the server text waits behind Details", async () => {
    const card = await failedCard();
    const notice = card.querySelector("[data-apply-failure]")!;
    expect(notice.textContent).toContain("This button can't create a task yet. Do it by hand for now.");
    expect(notice.textContent).not.toContain("non-writable");
    const toggle = card.querySelector<HTMLButtonElement>("[data-apply-failure-details-toggle]")!;
    await act(async () => {
      toggle.click();
    });
    expect(card.querySelector("[data-apply-failure-details]")!.textContent).toBe(RAW);
  });

  it("a planned type (no writer yet) reads the same way, never 'try again'", async () => {
    const card = await failedCard(
      "Nothing was applied — this block isn't a valid action as written.",
      "directive_v1_create_agent_template",
    );
    const text = card.querySelector("[data-apply-failure]")!.textContent!;
    expect(text).toContain("This button can't create an agent template yet. Do it by hand for now.");
    expect(text).not.toContain("Try again");
  });

  it("a person-ready server reason is the sentence, with the remedy", async () => {
    const card = await failedCard("Nothing was applied — title is required.");
    expect(card.querySelector("[data-apply-failure]")!.textContent).toContain(
      "Nothing was applied — Title is required. Correct it, then apply again.",
    );
  });

  it("a hand-inserted button's failure assumes no AI, and Details use the form's field names (G15)", async () => {
    const card = await failedCard("Nothing was applied — name is required.", "directive_v1_create_project");
    const text = card.querySelector("[data-apply-failure]")!.textContent!;
    expect(text).toContain("Nothing was applied — Title is required. Correct it, then apply again.");
    expect(text).not.toMatch(/Ask for|corrected version/);
    const toggle = card.querySelector<HTMLButtonElement>("[data-apply-failure-details-toggle]")!;
    await act(async () => {
      toggle.click();
    });
    expect(card.querySelector("[data-apply-failure-details]")!.textContent).toBe(
      "Nothing was applied — Title is required.",
    );
  });
});
