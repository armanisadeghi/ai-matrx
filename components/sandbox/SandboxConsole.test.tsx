/** @jest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { SandboxConsole, formatConsoleEntry, sandboxPrompt, shortCwd } from "./SandboxConsole";

describe("sandbox console drawing", () => {
  it("the prompt shows the directory like a shell, amber and underlined while an agent proposed it", () => {
    expect(shortCwd("/home/agent")).toBe("~");
    expect(shortCwd("/home/agent/site")).toBe("~/site");
    expect(shortCwd("/tmp")).toBe("/tmp");
    expect(sandboxPrompt("/home/agent/site", false)).toBe("\x1b[32magent@sandbox\x1b[0m:\x1b[34m~/site\x1b[0m$ ");
    expect(sandboxPrompt("/srv", true)).toBe("\x1b[32magent@sandbox\x1b[0m:\x1b[33;4m/srv\x1b[0m$ ");
  });

  it("output keeps the program's own colour; errors red; notes dim", () => {
    expect(formatConsoleEntry({ type: "stdout", text: "\x1b[1;32mPASS\x1b[0m" })).toBe("\x1b[1;32mPASS\x1b[0m\n");
    expect(formatConsoleEntry({ type: "stdout", text: "a\n" })).toBe("a\n");
    expect(formatConsoleEntry({ type: "stderr", text: "boom" })).toBe("\x1b[31mboom\n\x1b[0m");
    expect(formatConsoleEntry({ type: "info", text: "(exit code: 2)" })).toBe("\x1b[2m(exit code: 2)\n\x1b[0m");
  });

  it("a command line is drawn only when replaying onto a fresh screen (live, the editor echoed it)", () => {
    const entry = { type: "command" as const, text: "ls", cwd: "/home/agent" };
    expect(formatConsoleEntry(entry)).toBe("");
    expect(formatConsoleEntry(entry, true)).toBe("\x1b[32magent@sandbox\x1b[0m:\x1b[34m~\x1b[0m$ ls\n");
  });
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("agent-staged markers on the terminal", () => {
  function mount(lineStaged: boolean, cwdStaged: boolean) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <SandboxConsole
          entries={[]}
          executing={false}
          active
          cwd="/srv/app"
          cwdStaged={cwdStaged}
          line="git status"
          lineStaged={lineStaged}
          history={[]}
          onLineChange={() => undefined}
          onSubmit={() => undefined}
        />,
      );
    });
    return { host, unmount: () => act(() => root.unmount()) };
  }

  it("say a staged command and a staged folder are the agent's, not the person's", () => {
    const m = mount(true, true);
    expect(m.host.querySelector('[data-testid="agent-staged-command-marker"]')?.textContent).toBe("staged by agent · not run");
    expect(m.host.querySelector('[data-testid="agent-staged-cwd-marker"]')?.getAttribute("title")).toContain("/srv/app");
    m.unmount();
  });

  it("are absent once the line and folder are the person's", () => {
    const m = mount(false, false);
    expect(m.host.querySelector('[data-testid="agent-staged-command-marker"]')).toBeNull();
    expect(m.host.querySelector('[data-testid="agent-staged-cwd-marker"]')).toBeNull();
    m.unmount();
  });
});
