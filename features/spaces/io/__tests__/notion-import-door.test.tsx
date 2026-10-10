/**
 * NOTION-DOOR: "Import from Notion" opens from outside Spaces. The door is lazy (nothing mounts until
 * `open()`), `open()` mounts the importer, `onClose` unmounts it, and the table menu lists the entry in
 * the Share group (disabled with a reason when the page cannot open it).
 * Break it (mount the importer eagerly, drop the entry, lose the close) and these go red.
 */
import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";

jest.mock("next/dynamic", () => () => function Impl({ onClose }: { onClose: () => void }) {
  return (
    <button data-impl="" onClick={onClose}>
      importer
    </button>
  );
});

import { notionImportEntry } from "@/features/unified-data/actions/tableMenuExtensions";
import { useOpenNotionImport } from "../NotionImportDoor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Entry() {
  const notion = useOpenNotionImport();
  return (
    <>
      <button data-entry="" onClick={notion.open}>
        Import from Notion
      </button>
      {notion.door}
    </>
  );
}

describe("the Notion import door", () => {
  it("mounts nothing until the entry is pressed, mounts the importer on press, and unmounts on close", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<Entry />));
    expect(host.querySelector("[data-impl]")).toBeNull();
    act(() => (host.querySelector("[data-entry]") as HTMLElement).click());
    expect(host.querySelector("[data-impl]")).not.toBeNull();
    act(() => (host.querySelector("[data-impl]") as HTMLElement).click());
    expect(host.querySelector("[data-impl]")).toBeNull();
    act(() => root.unmount());
  });

  it("is in the table menu's Share group beside Import…, runs the opener, and says why when it cannot", () => {
    let opened = 0;
    const entry = notionImportEntry(() => void (opened += 1));
    expect(entry.label).toBe("Import from Notion…");
    expect(entry.group).toBe("share");
    expect(entry.disabledReason).toBeUndefined();
    entry.run();
    expect(opened).toBe(1);
    expect(notionImportEntry().disabledReason).toBeTruthy();
  });
});
