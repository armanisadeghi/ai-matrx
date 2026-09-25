/**
 * One failure, one message: `useMicField` shows the dictation error toast itself
 * (showVoiceInputErrorToast, with the troubleshooting action). A consumer that
 * also toasts from `onTranscriptionError` shows the person two toasts for one
 * denied microphone — the rich editor did (verify-RC-B4 F8e).
 *
 * SUT: every source file that calls useMicField. The handler passed as
 * `onTranscriptionError` must not call a toast.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");

function consumers(): string[] {
  const out = execFileSync("git", ["grep", "-l", "useMicField(", "--", "*.ts", "*.tsx"], { cwd: ROOT, encoding: "utf8" });
  return out
    .split("\n")
    .filter(Boolean)
    .filter((file) => !file.includes("__tests__") && !file.endsWith("hooks/useMicField.ts"));
}

/** The text of the `onTranscriptionError:` handler up to the next top-level property. */
function errorHandlers(source: string): string[] {
  const found: string[] = [];
  const re = /onTranscriptionError\s*:\s*/g;
  for (let match = re.exec(source); match; match = re.exec(source)) {
    let depth = 0;
    let end = match.index + match[0].length;
    for (; end < source.length; end += 1) {
      const ch = source[end];
      if (ch === "(" || ch === "{" || ch === "[") depth += 1;
      else if (ch === ")" || ch === "}" || ch === "]") {
        if (depth === 0) break;
        depth -= 1;
      } else if (ch === "," && depth === 0) break;
    }
    found.push(source.slice(match.index, end));
  }
  return found;
}

describe("useMicField consumers never add a second error toast", () => {
  it("finds the consumers (the scan is live)", () => {
    expect(consumers()).toContain("components/rich-editor/RichEditorImpl.tsx");
  });

  it("no onTranscriptionError handler calls a toast", () => {
    const offenders = consumers().flatMap((file) =>
      errorHandlers(readFileSync(path.join(ROOT, file), "utf8"))
        .filter((handler) => /\btoast\b|showVoiceInputErrorToast/.test(handler))
        .map((handler) => `${file}: ${handler.replace(/\s+/g, " ").slice(0, 120)}`),
    );
    expect(offenders).toEqual([]);
  });

  it("the scanner catches the shape it guards against", () => {
    const planted = "useMicField({ onTranscriptionError: (message) => toast.error(`Dictation stopped: ${message}`), label: 'x' })";
    expect(errorHandlers(planted).some((handler) => /\btoast\b/.test(handler))).toBe(true);
  });
});
