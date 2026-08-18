/**
 * Render smoke test.
 *
 * The engine has its own tests; this one exists to prove the SURFACE actually
 * mounts and shows the numbers the engine computed — the class of failure a
 * pure-logic test cannot see (a missing context provider, a bad import, a
 * component that throws on first paint).
 */

import { renderToString } from "react-dom/server";

import { LinkValuationWorkspace } from "../components/LinkValuationWorkspace";

describe("LinkValuationWorkspace renders", () => {
  const html = renderToString(<LinkValuationWorkspace />);

  it("mounts without throwing and shows its own chrome", () => {
    expect(html).toContain("Total score");
    expect(html).toContain("Max link value");
    expect(html).toContain("Evidence confidence");
    expect(html).toContain("Tune the algorithm");
  });

  it("renders the input form, including the target the original model never had", () => {
    expect(html).toContain("Our target keyword");
    expect(html).toContain("Candidate domain");
  });

  it("shows a computed price rather than a placeholder", () => {
    expect(html).toMatch(/\$\d/);
  });

  it("explains each term instead of only scoring it", () => {
    expect(html).toContain("of bucket");
    expect(html).toContain("Composite signals");
  });
});
