/**
 * A SCOPE BADGE NEVER SAYS ZERO BEFORE IT HAS COUNTED.
 *
 * 🚨 THE DEFECT (Masterwork cold walk 5, finding 6 / the Encore "Mine 0"
 * pattern several walks logged). The rows and the scope counts are fetched by
 * two independent effects keyed on different dependencies. Whenever the rows
 * resolved first — which on Encore they routinely do — the shelf painted a
 * populated list of the person's own Masterworks under a "Mine" tab whose own
 * badge read `0`. One screen, one paint, two contradictory claims about the
 * same records, and the wrong one was the confident-looking number.
 *
 * THE ROOT CAUSE: `counts.byKind[kind] ?? 0` cannot tell "not counted yet" from
 * "counted, and it is zero". The fix is the distinction, not a spinner: an
 * unmeasured count renders NOTHING — a screen is absent or honest, never
 * confidently wrong.
 *
 * RED against `?? 0`: the badge renders "0" beside a populated list.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EntityScopeTabs } from "../components/EntityScopeTabs";
import { makeScope } from "@/lib/list-scope/types";
import type { EntityScopeCounts } from "@/lib/entity-list/types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const EMPTY: EntityScopeCounts = { byKind: {}, narrow: {} };
const COUNTED: EntityScopeCounts = { byKind: { mine: 0, orgs: 3 }, narrow: {} };

async function render(node: React.ReactNode): Promise<{
  container: HTMLElement;
  root: Root;
}> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(node);
  });
  return { container, root };
}

describe("a scope badge never says zero before it has counted", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows no number at all while the counts are still being read", async () => {
    const { container, root } = await render(
      <EntityScopeTabs
        scope={makeScope("mine")}
        scopes={["mine", "orgs"]}
        counts={EMPTY}
        countsLoading
        onChange={() => undefined}
      />,
    );
    expect(container.textContent).toContain("Mine");
    expect(container.textContent).not.toContain("0");
    await act(async () => root.unmount());
  });

  it("shows a real zero once it has actually been counted", async () => {
    const { container, root } = await render(
      <EntityScopeTabs
        scope={makeScope("mine")}
        scopes={["mine", "orgs"]}
        counts={COUNTED}
        countsLoading={false}
        onChange={() => undefined}
      />,
    );
    expect(container.textContent).toContain("0");
    expect(container.textContent).toContain("3");
    await act(async () => root.unmount());
  });

  it("a caller that never passes the flag keeps its old, measured behaviour", async () => {
    const { container, root } = await render(
      <EntityScopeTabs
        scope={makeScope("mine")}
        scopes={["mine"]}
        counts={COUNTED}
        onChange={() => undefined}
      />,
    );
    expect(container.textContent).toContain("0");
    await act(async () => root.unmount());
  });
});
