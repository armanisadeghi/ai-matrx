/**
 * AF-D door #3 — the admin `create_agent` directive on the Agent Factory answers with a
 * `pending` receipt naming a build (`resource_kind: "agent_factory_build"`). The chat
 * must show the server's sentence AND the build's live progress (the ONE BuildProgress
 * primitive) — never a "Done" check over an agent that does not exist yet.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";

jest.mock("@/features/agents/factory/components/BuildProgress", () => ({
  BuildProgress: ({ buildId }: { buildId: string }) => <div data-testid="build-progress">{`progress:${buildId}`}</div>,
}));

import DirectiveReceiptBlock, {
  FACTORY_BUILD_RESOURCE,
  type DirectiveReceiptOutcome,
} from "@/components/mardown-display/blocks/data-events/DirectiveReceiptBlock";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SENTENCE = "Building agent Listing Summarizer. It is kept only if it passes its proof.";

async function render(outcome: DirectiveReceiptOutcome, resourceKind: string): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    createRoot(host).render(
      <DirectiveReceiptBlock
        directive="create_agent"
        outcome={outcome}
        message={SENTENCE}
        resourceKind={resourceKind}
        resourceIds={["build-7"]}
      />,
    );
  });
  // The progress is lazy: let the import settle.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return host;
}

describe("a create_agent receipt that started an Agent Factory build", () => {
  it("is pending, says the server's sentence, and mounts the build's progress", async () => {
    const host = await render("pending", FACTORY_BUILD_RESOURCE);
    expect(host.textContent).toContain(SENTENCE);
    expect(host.querySelector("[data-outcome]")?.getAttribute("data-outcome")).toBe("pending");
    expect(host.textContent).not.toContain("Done");
    expect(host.textContent).toContain("Building");
    expect(host.querySelector('[data-testid="build-progress"]')?.textContent).toBe("progress:build-7");
  });

  it("a replayed receipt names the same build and shows the same progress", async () => {
    const host = await render("already_applied", FACTORY_BUILD_RESOURCE);
    expect(host.querySelector('[data-testid="build-progress"]')?.textContent).toBe("progress:build-7");
  });

  it("a receipt for anything else mounts no build progress", async () => {
    const host = await render("applied", "agent");
    expect(host.querySelector('[data-testid="build-progress"]')).toBeNull();
  });
});
