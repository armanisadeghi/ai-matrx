/**
 * ── A TAB ACTIVATES ON `click` ───────────────────────────────────────────────
 *
 * 🚨 THE DEFECT THIS GUARDS (production walk of `manage.aimatrx.com`,
 * 2026-09-12): the admin mandate detail page's tab bar stayed on Definition —
 * `aria-selected="true"`, no panel change — through repeated activation, while
 * an ordinary React `onClick` button on the same page moved the same state
 * instantly.
 *
 * THE CAUSE IS IN THIS PRIMITIVE, NOT ON THAT PAGE. Radix's `TabsTrigger`
 * selects from `mousedown`, `focus` and Enter/Space only. A `click` with no
 * mouse sequence in front of it — `element.click()`, a screen reader's
 * "perform default action", any driver that synthesises a click — is silently
 * swallowed by a control that looks live. Law 4: a control is absent or
 * honest, never dead.
 *
 * This runs on the REAL host primitive (`@/components/ui/tabs`), which is the
 * seam every one of its consumers imports, so the guard covers the class and
 * not the page that surfaced it. Revert `components/ui/tabs.tsx` to a bare
 * re-export of `@ai-matrx/design-system` and this test goes red.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../tabs";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  return (
    <Tabs defaultValue="one">
      <TabsList aria-label="Sections">
        <TabsTrigger value="one">One</TabsTrigger>
        <TabsTrigger value="two">Two</TabsTrigger>
        <TabsTrigger value="three" disabled>
          Three
        </TabsTrigger>
      </TabsList>
      <TabsContent value="one">First panel</TabsContent>
      <TabsContent value="two">Second panel</TabsContent>
      <TabsContent value="three">Third panel</TabsContent>
    </Tabs>
  );
}

describe("tabs — click activation", () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<Harness />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const tab = (label: string) =>
    [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (t) => t.textContent === label,
    )!;
  const selected = () =>
    [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (t) => t.getAttribute("aria-selected") === "true",
    )?.textContent;

  it("selects the tab a plain click lands on, with no mousedown in front of it", async () => {
    expect(selected()).toBe("One");
    await act(async () => tab("Two").click());
    expect(selected()).toBe("Two");
    expect(container.textContent).toContain("Second panel");
    expect(container.textContent).not.toContain("First panel");
  });

  it("still selects on mousedown, the path a real mouse takes", async () => {
    await act(async () =>
      tab("Two").dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 }),
      ),
    );
    expect(selected()).toBe("Two");
  });

  it("leaves a disabled tab disabled — a click must not reach past `disabled`", async () => {
    await act(async () => tab("Three").click());
    expect(selected()).toBe("One");
    expect(container.textContent).not.toContain("Third panel");
  });

  it("respects a consumer's own onClick that prevents the default action", async () => {
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () =>
      root.render(
        <Tabs defaultValue="one">
          <TabsList aria-label="Sections">
            <TabsTrigger value="one">One</TabsTrigger>
            <TabsTrigger
              value="two"
              onClick={(event) => event.preventDefault()}
            >
              Two
            </TabsTrigger>
          </TabsList>
          <TabsContent value="one">First panel</TabsContent>
          <TabsContent value="two">Second panel</TabsContent>
        </Tabs>,
      ),
    );
    await act(async () => tab("Two").click());
    expect(selected()).toBe("One");
  });
});

/**
 * THE CENSUS, AS A GUARD. The fix above lives in the host wrapper, so it
 * reaches a screen only if that screen imports its tabs from the wrapper. Two
 * files were importing `TabsTrigger` straight from the package when this was
 * found (`features/admin/spend/explorer/DimensionTables.tsx`,
 * `features/content-ir/studio/records/RelatedRecordsPanel.tsx`); both were
 * re-pointed. This keeps the third from being written.
 */
describe("tabs — one import path", () => {
  it("no screen imports TabsTrigger straight from @ai-matrx/design-system", () => {
    const repo = path.resolve(__dirname, "../../..");
    const files = execFileSync(
      "grep",
      [
        "-rl",
        "--include=*.tsx",
        "TabsTrigger",
        "app",
        "components",
        "features",
        "lib",
        "providers",
      ],
      { cwd: repo, encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean);

    const offenders = files.filter((file) => {
      if (file === "components/ui/tabs.tsx") return false; // the wrapper itself
      const source = require("node:fs").readFileSync(
        path.join(repo, file),
        "utf8",
      ) as string;
      const imports = [
        ...source.matchAll(
          /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/gs,
        ),
      ];
      return imports.some(
        ([, names, from]) =>
          /\bTabsTrigger(Core)?\b/.test(names) &&
          from.startsWith("@ai-matrx/design-system"),
      );
    });

    expect(offenders).toEqual([]);
  });
});
