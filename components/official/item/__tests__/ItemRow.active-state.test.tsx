/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ItemRow } from "../ItemRow";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

describe("ItemRow selected state", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("uses the shared blue selected treatment instead of a neutral accent", () => {
    act(() =>
      root.render(
        <ItemRow label="Selected chat" active sourceFeature="conversation" />,
      ),
    );

    const row = host.querySelector<HTMLElement>('[data-active="true"]');
    expect(row).not.toBeNull();
    expect(row?.className).toContain("bg-primary/10");
    expect(row?.className).toContain("text-primary");
    expect(row?.className).not.toMatch(/(?:^|\s)bg-accent(?:\s|$)/);
  });
});
