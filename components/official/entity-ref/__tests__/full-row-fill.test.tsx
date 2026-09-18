/**
 * 🚨 BUGBOT ROUND 23 (frontend PR 228, comment 4042451873) — A ROW-CARRYING
 * LINK TURNED INTO AN EntityRef LOSES THE ROW.
 *
 * `EntityRef`'s outer wrapper is `inline-flex` — it hugs its own text, which
 * is correct for a table cell but wrong for a row whose OLD markup was the
 * row itself (`block`/`flex-1`/`w-full` on the `<Link>` that F-43 replaced).
 * Three F-43 sites regressed this way:
 *
 *   - `features/research/components/experts/TopicExperts.tsx` roster: the old
 *     `<Link className="flex items-center gap-2 …">` was a full-width block
 *     row inside a `divide-y` stack. `EntityRef` without `flex w-full` in its
 *     `className` stays inline-flex, so several rows wrap onto one line
 *     instead of stacking.
 *   - `features/marketing/content-plan/components/EntityManager.tsx` and
 *     `NodeAssociations.tsx`: the old `<Link className="min-w-0 flex-1 …">`
 *     WAS the flex item that took the row's remaining width, pushing the
 *     unlink/detach control to the far edge. `fill` alone only grows the
 *     LABEL inside `EntityRef`'s own wrapper — the wrapper itself must also
 *     carry `flex-1` (`className="min-w-0 flex-1"`) to take that width away
 *     from its siblings in the OUTER row.
 *
 * These assertions render the real `EntityRef` component (no shallow mock of
 * its class-merging) with the exact props each site now passes, so a
 * regression that drops `flex w-full` or the outer `min-w-0 flex-1` fails
 * here before it ships. RED on HEAD (c3eee4c8): the roster wrapper stayed
 * `inline-flex` (no `flex`/`w-full` override) and the content-plan wrapper
 * carried no `flex-1` of its own. GREEN after this fix.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EntityRef } from "../EntityRef";

jest.mock("@/utils/supabase/client", () => ({
  __esModule: true,
  createClient: () => ({ rpc: async () => ({ data: [], error: null }) }),
  supabase: {},
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

jest.mock("@/features/organizations/peek/ResourcePeekHost", () => ({
  __esModule: true,
  ResourcePeekHost: () => null,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const PARTIES = [
  { id: "7c9e6679-7425-40de-944b-e07fc1f90ae7", name: "Dana Whitfield" },
  { id: "1b0d5f2a-8f3c-4f1a-9c2e-5f6a7b8c9d0e", name: "Marco Reyes" },
  { id: "3e4f5a6b-7c8d-49e0-9f1a-2b3c4d5e6f7a", name: "Priya Nandan" },
];

describe("TopicExperts roster: each person keeps its own stacked row", () => {
  it("renders one full-width row per person inside the divide-y stack", () => {
    act(() =>
      root.render(
        <div className="divide-y divide-border/60">
          {PARTIES.map((party) => (
            <EntityRef
              key={party.id}
              token="party"
              id={party.id}
              name={party.name}
              showIcon={false}
              fill
              alwaysShowActions
              className="flex w-full gap-2 px-1 py-1.5 hover:bg-accent"
              labelClassName="min-w-0 flex-1 truncate text-sm text-foreground"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{party.name}</span>
              </span>
            </EntityRef>
          ))}
        </div>,
      ),
    );

    // One row wrapper per person — never fewer (rows collapsing onto a
    // shared line does not change the element count, but the wrapper's own
    // display MUST be a full-width block-flex row, checked below).
    const rows = container.querySelectorAll(".group\\/entity-ref");
    expect(rows).toHaveLength(PARTIES.length);

    rows.forEach((row) => {
      const cls = row.className;
      // `inline-flex` (EntityRef's own default) must be overridden by the
      // call site's `flex`, and the row must span the full row width —
      // both are what stack the people instead of letting them wrap onto
      // one line.
      expect(cls.split(/\s+/)).toContain("flex");
      expect(cls.split(/\s+/)).not.toContain("inline-flex");
      expect(cls).toMatch(/\bw-full\b/);
    });
  });
});

describe("Content-plan party rows: the name takes the remaining row width", () => {
  function renderPartyRow() {
    act(() =>
      root.render(
        <div className="group flex items-center gap-3 border-b border-border px-3 py-2">
          <span data-testid="kind-chip" className="flex w-16 shrink-0">
            person
          </span>
          <EntityRef
            token="party"
            id={PARTIES[0].id}
            name={PARTIES[0].name}
            showIcon={false}
            fill
            alwaysShowActions
            className="min-w-0 flex-1"
            labelClassName="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
          />
          <button type="button" data-testid="unlink" aria-label="Unlink">
            x
          </button>
        </div>,
      ),
    );
  }

  it("EntityManager.tsx: the wrapper itself carries flex-1 so the name fills the row and the unlink control lands on the far edge", () => {
    renderPartyRow();
    const wrapper = container.querySelector(".group\\/entity-ref");
    expect(wrapper).not.toBeNull();
    const cls = wrapper!.className.split(/\s+/);
    expect(cls).toContain("flex-1");
    expect(cls).toContain("min-w-0");

    // The far-edge control is still the last element in the row — proof the
    // filled name pushed nothing out of place.
    const row = container.querySelector(".group");
    const controls = row!.querySelectorAll('[data-testid="unlink"]');
    expect(controls).toHaveLength(1);
    expect(row!.lastElementChild?.getAttribute("data-testid")).toBe("unlink");
  });
});

describe("source pins the fill classes at each fixed call site", () => {
  const read = (relPath: string) =>
    readFileSync(join(process.cwd(), relPath), "utf8");

  it("TopicExperts.tsx roster EntityRef carries a block-level, full-width className", () => {
    const source = read(
      "features/research/components/experts/TopicExperts.tsx",
    );
    expect(source).toContain(
      'className="flex w-full gap-2 px-1 py-1.5 hover:bg-accent"',
    );
  });

  it("EntityManager.tsx party row EntityRef carries the outer flex-1 className", () => {
    const source = read(
      "features/marketing/content-plan/components/EntityManager.tsx",
    );
    expect(source).toContain('className="min-w-0 flex-1"');
  });

  it("NodeAssociations.tsx party edge EntityRef carries the outer flex-1 className", () => {
    const source = read(
      "features/marketing/content-plan/components/NodeAssociations.tsx",
    );
    expect(source).toContain('className="min-w-0 flex-1"');
  });
});
