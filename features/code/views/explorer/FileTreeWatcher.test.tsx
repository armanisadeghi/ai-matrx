import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { FilesystemAdapter } from "../../adapters/FilesystemAdapter";
import type { FilesystemWatchEvent } from "../../types";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let watchCallback: ((event: FilesystemWatchEvent) => void) | undefined;
const filesystem = {
  id: "sandbox:row",
  label: "Sandbox",
  rootPath: "/home/agent",
  writable: true,
  listChildren: jest.fn(),
  readFile: jest.fn(),
  watch: jest.fn((_path: string, callback: (event: FilesystemWatchEvent) => void) => {
    watchCallback = callback;
    return jest.fn();
  }),
} satisfies FilesystemAdapter;

jest.mock("../../CodeWorkspaceProvider", () => ({
  useCodeWorkspace: () => ({ filesystem }),
}));

import {
  FileTreeWatcherProvider,
  useDirectoryVersion,
} from "./FileTreeWatcher";

function Versions() {
  const root = useDirectoryVersion("/home/agent");
  const nested = useDirectoryVersion("/home/agent/src/components");
  return <output>{`${root}:${nested}`}</output>;
}

describe("FileTreeWatcherProvider transport recovery", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    watchCallback = undefined;
    filesystem.watch.mockClear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("reloads root and mounted nested directories when the direct watch reconnects", async () => {
    await act(async () => {
      root.render(
        <FileTreeWatcherProvider rootPath="/home/agent">
          <Versions />
        </FileTreeWatcherProvider>,
      );
    });
    expect(host.textContent).toBe("0:0");

    await act(async () => {
      watchCallback?.({ type: "resync", path: "/home/agent" });
    });
    expect(host.textContent).toBe("1:1");
  });
});
