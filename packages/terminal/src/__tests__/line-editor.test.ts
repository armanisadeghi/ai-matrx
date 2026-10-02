import { createLineEditor } from "../index";

/** A faithful stand-in for the terminal: it records every byte the editor writes. */
function harness(history: string[] = []) {
  const out: string[] = [];
  const submitted: string[] = [];
  const changes: string[] = [];
  let interrupts = 0;
  let clears = 0;
  const editor = createLineEditor({
    write: (d) => void out.push(d),
    prompt: () => "$ ",
    history: () => history,
    onSubmit: (l) => void submitted.push(l),
    onInterrupt: () => void interrupts++,
    onClearScreen: () => void clears++,
    onChange: (l) => void changes.push(l),
  });
  return {
    editor,
    out,
    submitted,
    changes,
    type: (s: string) => {
      for (const ch of s) editor.input(ch);
    },
    get interrupts() {
      return interrupts;
    },
    get clears() {
      return clears;
    },
    screen: () => out.join(""),
  };
}

describe("line editor", () => {
  it("echoes typing, submits on Enter, and stays busy until the host is done", () => {
    const h = harness();
    h.editor.prompt();
    h.type("ls -la");
    h.editor.input("\r");
    expect(h.submitted).toEqual(["ls -la"]);
    expect(h.screen()).toBe("$ ls -la\r\n");
    expect(h.editor.busy).toBe(true);
    h.type("next");
    expect(h.editor.line).toBe(""); // held as typeahead, not drawn mid-output
    h.editor.done();
    expect(h.editor.busy).toBe(false);
    expect(h.editor.line).toBe("next");
    expect(h.screen().endsWith("$ next")).toBe(true);
  });

  it("Ctrl-C while a command runs asks the host to stop it; idle it cancels the line", () => {
    const h = harness();
    h.type("sleep 10\r");
    h.editor.input("\x03");
    expect(h.interrupts).toBe(1);
    h.editor.done();
    h.type("half");
    h.editor.input("\x03");
    expect(h.editor.line).toBe("");
    expect(h.screen()).toContain("half^C\r\n$ ");
  });

  it("edits mid-line: left arrow, insert, backspace, delete, Home/End, kill to end and start", () => {
    const h = harness();
    h.type("echo world");
    for (let i = 0; i < 5; i++) h.editor.input("\x1b[D");
    h.type("big ");
    expect(h.editor.line).toBe("echo big world");
    h.editor.input("\x7f");
    expect(h.editor.line).toBe("echo bigworld");
    h.editor.input("\x1b[3~");
    expect(h.editor.line).toBe("echo bigorld");
    h.editor.input("\x01");
    h.editor.input("\x0b");
    expect(h.editor.line).toBe("");
    h.type("abc");
    h.editor.input("\x1b[D");
    h.editor.input("\x15");
    expect(h.editor.line).toBe("c");
  });

  it("↑/↓ recall history, newest first, and back to an empty line; recall is a user change", () => {
    const h = harness(["pwd", "ls"]);
    h.editor.input("\x1b[A");
    expect(h.editor.line).toBe("ls");
    h.editor.input("\x1b[A");
    expect(h.editor.line).toBe("pwd");
    h.editor.input("\x1b[A");
    expect(h.editor.line).toBe("pwd");
    h.editor.input("\x1bOB"); // application cursor mode works too
    expect(h.editor.line).toBe("ls");
    h.editor.input("\x1b[B");
    expect(h.editor.line).toBe("");
    expect(h.changes).toEqual(["ls", "pwd", "pwd", "ls", ""]);
  });

  it("a multi-line paste runs one line per command, in order", () => {
    const h = harness();
    h.editor.input("cd site\nnpm test\n\necho done\n");
    expect(h.submitted).toEqual(["cd site"]);
    h.editor.done();
    expect(h.submitted).toEqual(["cd site", "npm test"]);
    h.editor.done(); // the blank line just prompts, then echo runs
    expect(h.submitted).toEqual(["cd site", "npm test", "echo done"]);
    h.editor.done();
    expect(h.editor.busy).toBe(false);
  });

  it("setLine stages text without counting as the person's edit, and Enter runs it", () => {
    const h = harness();
    h.editor.prompt();
    h.editor.setLine("git status");
    expect(h.changes).toEqual([]);
    expect(h.screen()).toContain("\r\x1b[K$ git status");
    h.editor.input("\r");
    expect(h.submitted).toEqual(["git status"]);
  });

  it("Ctrl-L clears through the host and redraws the line", () => {
    const h = harness();
    h.type("abc");
    h.editor.input("\x0c");
    expect(h.clears).toBe(1);
    expect(h.screen().endsWith("\r\x1b[K$ abc")).toBe(true);
  });

  it("bracketed paste markers are stripped, not echoed", () => {
    const h = harness();
    h.editor.input("\x1b[200~ls\x1b[201~");
    expect(h.editor.line).toBe("ls");
  });
});

describe("line editor typeahead", () => {
  it("what is typed while a command runs is kept and runs after it, like a shell", () => {
    const h = harness();
    h.type("sleep 1\r");
    h.type("echo two\r");
    expect(h.submitted).toEqual(["sleep 1"]);
    h.editor.done();
    expect(h.submitted).toEqual(["sleep 1", "echo two"]);
  });

  it("typeahead without Enter waits on the prompt line; Ctrl-C drops it", () => {
    const h = harness();
    h.type("make\r");
    h.type("git st");
    h.editor.done();
    expect(h.editor.line).toBe("git st");
    h.type("atus\r");
    h.type("nope");
    h.editor.input("\x03");
    h.editor.done();
    expect(h.editor.line).toBe("");
  });
});
