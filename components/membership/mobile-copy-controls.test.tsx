/**
 * 🚨 A COPY OR EXPORT TRIGGER IS AT LEAST 44px UNDER A THUMB.
 *
 * The named break: a phone user cannot reliably hit a 24–28px icon button, so
 * every standalone copy/export control keeps a 44px touch box on mobile even
 * when its visible pill is smaller.
 *
 * This guard used to assert the literal Tailwind string
 * `"h-11 w-11 shrink-0 lg:h-7 lg:w-7"` inside `ExportMenu.tsx`. That stopped
 * being the seam: the menu now delegates to `MatrxCopyMenu` from
 * `@ai-matrx/design-system/content-transfer`, which renders the package's
 * `TapTargetButton` — an invisible 44px outer target around a 28px pill. The
 * class literal was a change detector on a file that no longer owns the size.
 *
 * So the contract is asserted where it actually lives, in two halves that must
 * BOTH hold:
 *   1. the package ships a >= 44px tap target (read out of the stylesheet the
 *      package publishes, not out of a string we also wrote), and
 *   2. the host renders its trigger AS that tap target, at full size — the
 *      compact (28px) trigger the package also offers would fail here.
 * Hand-rolled triggers that never went through the package are held to the
 * same 44px box in their own rendered markup.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { AiCopyMenu } from "@/components/agent-copy/AiCopyMenu";
import { ReferencesBulkCopyButton } from "@/features/matrx-envelope/components/ReferencesBulkCopyButton";

/** The smallest box a finger hits reliably (iOS HIG / Material). */
const MIN_TOUCH_PX = 44;

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

/**
 * The size the PACKAGE gives `.matrx-tap-target`, read out of the stylesheet
 * it publishes. Returns px. A package that shrinks the target below a thumb
 * fails here even though nothing in this repo changed.
 */
function packageTapTargetPx(): number {
  const css = source(
    "node_modules/@ai-matrx/design-system/dist/tap-target.css",
  );
  const rule = css.match(/\.matrx-tap-target\s*\{([^}]*)\}/);
  if (!rule) throw new Error(".matrx-tap-target is not in the package stylesheet");
  const height = rule[1].match(
    /height:\s*var\(--matrx-tap-target-size,\s*([\d.]+)(rem|px)\)/,
  );
  if (!height) throw new Error(`.matrx-tap-target declares no default height: ${rule[1]}`);
  const value = Number(height[1]);
  return height[2] === "rem" ? value * 16 : value;
}

/** Every `class="…"` in the markup, split into class lists. */
function classLists(markup: string): string[][] {
  return [...markup.matchAll(/class="([^"]*)"/g)].map((m) => m[1].split(/\s+/));
}

/** The one element that IS the package tap target, or null. */
function tapTarget(markup: string): string[] | null {
  return (
    classLists(markup).find((list) => list.includes("matrx-tap-target")) ?? null
  );
}

describe("membership copy mobile control contract", () => {
  it("ships a package tap target no smaller than a thumb", () => {
    expect(packageTapTargetPx()).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
  });

  it.each([
    [
      "standalone export",
      <ExportMenu
        key="export"
        label="Members"
        items={[{ id: "csv", label: "CSV", filename: "members.csv", build: () => "" }]}
      />,
    ],
    [
      "standalone copy-for-AI",
      <AiCopyMenu
        key="ai"
        label="Members"
        variants={[{ id: "rows", label: "Rows", build: () => "" }]}
      />,
    ],
  ])("renders the %s trigger at the package's full tap target", (_name, element) => {
    const markup = renderToStaticMarkup(<>{element}</>);
    const target = tapTarget(markup);
    expect(target).not.toBeNull();
    // `-sm` is the 32px in-group geometry and `compact` the 28px toolbar
    // trigger; either under a thumb is the defect this guard exists for.
    expect(target).not.toContain("matrx-tap-target-sm");
    expect(markup).not.toContain('data-alchemy-size="compact"');
  });

  it("keeps the hand-rolled bulk-reference trigger at a 44px box on mobile", () => {
    for (const size of ["sm", "md"] as const) {
      const markup = renderToStaticMarkup(
        <ReferencesBulkCopyButton
          referenceType="project"
          records={[{ id: "p1", label: "One" }]}
          toastLabel="1 project"
          size={size}
        />,
      );
      const button = classLists(markup).find((list) => list.includes("h-11"));
      expect(button).not.toBeNull();
      expect(button).toContain("w-11");
      expect(button).toContain("shrink-0");
    }
  });

  it("keeps invitation row actions at 44px on mobile", () => {
    const invitations = source("components/membership/InvitationsPanel.tsx");
    expect(invitations).toContain('className="h-11 lg:h-8"');
    expect(invitations).toContain('className="h-11 min-w-11 px-0 text-red-600');
  });
});
