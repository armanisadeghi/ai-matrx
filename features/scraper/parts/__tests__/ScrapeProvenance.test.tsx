/**
 * A scrape result must say which engine produced it — and must NEVER invent one
 * (2026-09-17).
 *
 * SUT: `ScrapeProvenance`. It OWNS the whole contract between the backend's
 * three new fields (`engine`, `escalated`, `escalation_reason`) and what the
 * person reads.
 *
 * Real here: the component and the sentence table. The only doubles are the
 * prop values, which ARE the backend's declared vocabulary.
 *
 * The rule this guard exists for: these fields are absent on every response the
 * backend produced before 2026-09-17, so a page that renders an old response
 * must render nothing rather than a default — "http" would be a lie whenever
 * the browser or the cache actually answered.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ScrapeProvenance,
  escalationSentence,
} from "@/features/scraper/parts/ScrapeProvenance";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function render(node: React.ReactNode): string {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return container.textContent ?? "";
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ScrapeProvenance", () => {
  it("renders NOTHING when the response carries no provenance (pre-2026-09-17 rows)", () => {
    render(
      <ScrapeProvenance
        engine={null}
        escalated={null}
        escalationReason={null}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it.each([
    ["http", "Direct fetch"],
    ["browser", "Server browser"],
    ["cache", "From cache"],
  ] as const)("names the %s engine as %s", (engine, label) => {
    const text = render(
      <ScrapeProvenance
        engine={engine}
        escalated={false}
        escalationReason={null}
      />,
    );
    expect(text).toContain(label);
    // Not escalated → no escalation sentence at all.
    expect(text).not.toContain("server browser.");
  });

  it("explains an escalation in one plain sentence, naming the real reason", () => {
    const text = render(
      <ScrapeProvenance
        engine="browser"
        escalated
        escalationReason="cloudflare_block"
      />,
    );
    expect(text).toContain("Server browser");
    expect(text).toContain(
      "The normal fetch was blocked (Cloudflare), so we rendered the page in our server browser.",
    );
    // The raw reason code never reaches the person.
    expect(text).not.toContain("cloudflare_block");
  });

  it("still writes a sentence for an escalation reason nobody has seen before", () => {
    const text = render(
      <ScrapeProvenance
        engine="browser"
        escalated
        escalationReason="some_reason_invented_next_month"
      />,
    );
    expect(text).toContain("The normal fetch did not work");
    expect(text).not.toContain("some_reason_invented_next_month");
  });

  it("maps every reason the backend declared", () => {
    for (const reason of [
      "proxy_error",
      "cloudflare_block",
      "bad_status",
      "empty_content",
    ]) {
      const sentence = escalationSentence(reason);
      expect(sentence).toContain("server browser");
      expect(sentence).not.toContain("_");
    }
  });
});
