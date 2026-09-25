import React, { act } from "react";
import { createRoot } from "react-dom/client";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("@/components/markdown-core/MarkdownCore", () => ({ __esModule: true, default: jest.requireActual("@/components/markdown-core/MarkdownCoreImpl").default }));
jest.mock("@/components/matrx/buttons/MarkdownCopyButton", () => ({ InlineCopyButton: () => null }));
import BasicMarkdownContent from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
const SRC = ["Cone 6 is mid-fire.[^1]\n\n[^1]: About 1,222 °C.", "[^m]: Kiln manual, page 4.", "See the manual.[^m]", "$$\n\\ce{2H2 + O2 -> 2H2O}\n$$\n\n$$\nE = mc^2 \\label{eq:energy}\n$$\n\nBy \\eqref{eq:energy} we know."];
it("dbg", async () => {
  for (const s of SRC) {
    const c = document.createElement("div"); document.body.appendChild(c);
    const r = createRoot(c);
    await act(async () => r.render(<BasicMarkdownContent content={s} showCopyButton={false} />));
    c.querySelectorAll("style").forEach((x) => x.remove());
    console.log("SRC:", JSON.stringify(s), "\nHTML:", c.innerHTML.replace(/ class="[^"]*"/g, "").replace(/<span aria-hidden="true">.*?<\/p>/g, "…</p>"));
  }
});
