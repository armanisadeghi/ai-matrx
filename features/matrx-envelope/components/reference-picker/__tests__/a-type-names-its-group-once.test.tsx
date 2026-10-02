/**
 * One record type carries ONE group name, said ONCE.
 *
 * THE DEFECTS (G6B review, 2026-10-02, nightly clone):
 *   1. Under "All types", every row repeated its group heading on the right
 *      ("Workspace" heading, then "Note … Workspace", "Task … Workspace").
 *   2. A Note action card was labelled "Sources & Outputs" while the picker
 *      filed Note under "Workspace": the card read the catalog's `family`
 *      (`platform.entity_types.category`), the picker read its own group rule.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { isEntityTypeToken } from "@ai-matrx/associations";
import { File as FileIcon } from "lucide-react";
import {
  TypeStep,
  type TypeOption,
} from "@/features/matrx-envelope/components/reference-picker/TypeStep";
import {
  CATALOG_ALIASES,
  CATALOG_NOUN_DISPLAY,
} from "@/features/matrx-envelope/catalog-nouns.generated";
import { referenceTypeGroup } from "@/features/scopes/utils/referenceTypeGroups";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const option = (token: string, label: string, family: string): TypeOption => ({
  token,
  label,
  family,
  Icon: FileIcon,
});

describe("a type names its group once", () => {
  it("rows under a group heading do not repeat the heading", () => {
    const all = [
      option("note", "Note", "Workspace"),
      option("task", "Task", "Workspace"),
      option("file", "File", "Files"),
    ];
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(
        <TypeStep
          all={all}
          common={[]}
          commonLoading={false}
          allSettled
          commonUnavailable // opens "All types" expanded
          onChoose={() => undefined}
          onCancel={() => undefined}
        />,
      );
    });
    const rows = [...container.querySelectorAll("button")].filter((b) =>
      ["Note", "Task", "File"].some((l) => b.textContent?.startsWith(l)),
    );
    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(row.textContent).not.toMatch(/Workspace|Files/);
    }
    // The heading itself is still there, once.
    const text = container.textContent ?? "";
    expect(text.match(/Workspace/g)?.length).toBe(1);
    act(() => root.unmount());
  });

  it("an action card's group is the picker's group, for every record type", () => {
    const mismatched: string[] = [];
    for (const [noun, display] of Object.entries(CATALOG_NOUN_DISPLAY)) {
      // A legacy wire noun shows as the record type it aliases.
      const alias = CATALOG_ALIASES[noun];
      const token = alias && isEntityTypeToken(alias) ? alias : noun;
      if (!isEntityTypeToken(token)) continue;
      const group = referenceTypeGroup(token);
      if (display.family !== group) {
        mismatched.push(`${noun}: card "${display.family}" vs picker "${group}"`);
      }
    }
    expect(mismatched).toEqual([]);
  });
});
