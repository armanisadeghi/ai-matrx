import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  Credenza,
  CredenzaContent,
  CredenzaTitle,
} from "./credenza";
import { useMediaQuery } from "@/hooks/use-media-query";

jest.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: jest.fn(),
}));

const mockedUseMediaQuery = jest.mocked(useMediaQuery);

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("Credenza primitive selection", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.replaceChildren();
    mockedUseMediaQuery.mockReset();
  });

  it("selects Dialog or Drawer once at the root for the whole composition", () => {
    // This models the breakpoint race that used to let the root choose Drawer
    // while a child independently chose DialogContent. Radix then threw
    // "DialogPortal must be used within Dialog". Children must consume the
    // root's decision instead of querying the viewport again.
    mockedUseMediaQuery.mockReturnValueOnce(false).mockReturnValue(true);

    expect(() => {
      act(() => {
        root.render(
          <Credenza open>
            <CredenzaContent>
              <CredenzaTitle>Credential</CredenzaTitle>
            </CredenzaContent>
          </Credenza>,
        );
      });
    }).not.toThrow();

    expect(mockedUseMediaQuery).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("Credential");
  });
});
