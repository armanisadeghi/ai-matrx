import { formatTranscriptEntry } from "./SandboxTranscript";

describe("sandbox transcript lines", () => {
  it("draws the prompt, output, errors and notes the way the page always showed them, in colour", () => {
    expect(formatTranscriptEntry({ type: "command", text: "ls", cwd: "/home/agent" })).toBe("\x1b[34m/home/agent\x1b[0m\x1b[2m $ \x1b[0m\x1b[32mls\x1b[0m\n");
    expect(formatTranscriptEntry({ type: "stdout", text: "a\nb" })).toBe("a\nb\n");
    expect(formatTranscriptEntry({ type: "stdout", text: "done\n" })).toBe("done\n");
    expect(formatTranscriptEntry({ type: "stderr", text: "boom" })).toBe("\x1b[31mboom\n\x1b[0m");
    expect(formatTranscriptEntry({ type: "info", text: "(exit code: 2)" })).toBe("\x1b[2m(exit code: 2)\n\x1b[0m");
  });

  it("keeps a program's own ANSI colour instead of printing the escape codes", () => {
    expect(formatTranscriptEntry({ type: "stdout", text: "\x1b[1;32mPASS\x1b[0m" })).toBe("\x1b[1;32mPASS\x1b[0m\n");
  });
});
