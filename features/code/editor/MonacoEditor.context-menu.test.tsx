import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MonacoEditor } from "./MonacoEditor";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("./monaco-config", () => ({
  configureMonaco: jest.fn(() => new Promise<void>(() => {})),
}));

jest.mock("./useMonacoTheme", () => ({
  useMonacoTheme: () => false,
}));

jest.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

describe("MonacoEditor context-menu trigger boundary", () => {
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

  it("forwards a slotted context-menu handler and ref to its editor shell", () => {
    const onContextMenu = jest.fn();
    const ref = React.createRef<HTMLDivElement>();

    act(() => {
      root.render(
        <MonacoEditor
          ref={ref}
          value="const answer = 42;"
          language="typescript"
          onContextMenu={onContextMenu}
        />,
      );
    });

    const shell = container.firstElementChild as HTMLDivElement;
    expect(ref.current).toBe(shell);

    act(() => {
      shell.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
    });
    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });
});
