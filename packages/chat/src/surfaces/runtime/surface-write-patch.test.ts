/**
 * THE ANCHORED EDIT, AND EVERY WAY IT IS ALLOWED TO FAIL.
 *
 * `resolveSurfaceWritePatch` is pure, so this suite needs no mocks and no
 * runtime: current text in, finished text out, or a refusal that says why.
 *
 * The refusals carry the weight here. A whole-value write cannot really go
 * wrong — the string either arrives or it does not. A patch can MISS, and a
 * patch that misses quietly is the one genuinely dangerous outcome in this
 * feature: the tool reports success, the model believes the prompt now says
 * something it does not say, and nobody finds out until the agent misbehaves
 * in production. So most of what follows is about making misses loud.
 */
import {
  isSurfaceWritePatch,
  resolveSurfaceWritePatch,
  surfacePatchContractLine,
} from "@/features/surfaces/runtime/surface-write-patch";

const PROMPT = [
  "You are a careful assistant.",
  "",
  "## Rules",
  "- Never guess at a fact you can verify.",
  "- Say when you are unsure.",
  "",
  "## Tone",
  "- Plain words, short sentences.",
].join("\n");

describe("isSurfaceWritePatch", () => {
  it("recognises a patch envelope", () => {
    expect(
      isSurfaceWritePatch({ command: "str_replace", old_str: "a", new_str: "b" }),
    ).toBe(true);
  });

  it("leaves ordinary values alone", () => {
    // The whole design rests on this: a patchable target still takes a plain
    // string, so anything that is not clearly an envelope must pass through
    // untouched rather than be coerced into a patch.
    expect(isSurfaceWritePatch("a plain new prompt")).toBe(false);
    expect(isSurfaceWritePatch(null)).toBe(false);
    expect(isSurfaceWritePatch(42)).toBe(false);
    expect(isSurfaceWritePatch(["a"])).toBe(false);
    expect(isSurfaceWritePatch({ text: "no command here" })).toBe(false);
  });
});

describe("resolveSurfaceWritePatch — the happy paths", () => {
  it("replaces an exact, unique anchor and leaves the rest byte-identical", () => {
    const out = resolveSurfaceWritePatch(PROMPT, {
      command: "str_replace",
      old_str: "- Say when you are unsure.",
      new_str: "- Say when you are unsure, and say what would settle it.",
    });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.next).toContain("and say what would settle it.");
    expect(out.next).toContain("You are a careful assistant.");
    expect(out.next).toContain("- Plain words, short sentences.");
    // The bytes before the anchor are untouched — this is the entire point of
    // patching rather than re-sending.
    expect(out.next.slice(0, PROMPT.indexOf("- Say"))).toBe(
      PROMPT.slice(0, PROMPT.indexOf("- Say")),
    );
  });

  it("appends with a blank line by default", () => {
    const out = resolveSurfaceWritePatch(PROMPT, {
      command: "append",
      new_str: "## Escalation\n- Ask before deleting anything.",
    });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.next.startsWith(PROMPT)).toBe(true);
    expect(out.next).toBe(`${PROMPT}\n\n## Escalation\n- Ask before deleting anything.`);
  });

  it("appends the first text without a leading separator", () => {
    const out = resolveSurfaceWritePatch("", {
      command: "append",
      new_str: "first",
    });

    expect(out.ok && out.next).toBe("first");
  });

  it("honours an explicit separator", () => {
    const out = resolveSurfaceWritePatch("one", {
      command: "append",
      new_str: "two",
      separator: "\n",
    });
    expect(out.ok && out.next).toBe("one\ntwo");
  });

  it("prepends", () => {
    const out = resolveSurfaceWritePatch("body", {
      command: "prepend",
      new_str: "header",
    });
    expect(out.ok && out.next).toBe("header\n\nbody");
  });

  it("prepends the first text without a trailing separator", () => {
    const out = resolveSurfaceWritePatch("", {
      command: "prepend",
      new_str: "first",
    });

    expect(out.ok && out.next).toBe("first");
  });

  it("overwrites — the escape hatch that is still a patch on the wire", () => {
    const out = resolveSurfaceWritePatch(PROMPT, {
      command: "overwrite",
      new_str: "Start again.",
    });
    expect(out.ok && out.next).toBe("Start again.");
  });

  it("deletes when new_str is empty", () => {
    // An empty new_str is a legitimate edit (cut this line), which is exactly
    // why emptiness cannot be used as the "missing argument" signal.
    const out = resolveSurfaceWritePatch(PROMPT, {
      command: "str_replace",
      old_str: "\n- Say when you are unsure.",
      new_str: "",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.next).not.toContain("Say when you are unsure");
    expect(out.next).toContain("Never guess at a fact");
  });
});

describe("resolveSurfaceWritePatch — the refusals", () => {
  it("refuses an anchor that is not there, and says so", () => {
    const out = resolveSurfaceWritePatch(PROMPT, {
      command: "str_replace",
      old_str: "- Always guess.",
      new_str: "- Never guess.",
    });

    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/old_str/);
    expect(out.reason.toLowerCase()).toMatch(/not found|no match/);
  });

  it("refuses an AMBIGUOUS anchor rather than picking one", () => {
    // Two identical lines. Choosing either would be a coin flip against the
    // user's prompt, so the only safe answer is to decline and ask for more
    // context in the anchor.
    const doubled = "- Be brief.\nsomething else\n- Be brief.";
    const out = resolveSurfaceWritePatch(doubled, {
      command: "str_replace",
      old_str: "- Be brief.",
      new_str: "- Be very brief.",
    });

    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason.toLowerCase()).toMatch(/ambiguous|more than once|2/);
  });

  it("refuses str_replace with no old_str", () => {
    const out = resolveSurfaceWritePatch(PROMPT, {
      command: "str_replace",
      new_str: "x",
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/old_str/);
  });

  it("refuses a missing new_str (absent, not empty)", () => {
    const out = resolveSurfaceWritePatch(PROMPT, {
      command: "append",
    } as never);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/new_str/);
  });

  it("refuses a command outside the safe subset, by name", () => {
    // `insert`, `json_patch` and `json_merge` exist in the backend ctx_patch
    // vocabulary. They are deliberately NOT honoured against a live surface
    // value, and the refusal has to name the command so the caller can tell
    // this from a typo.
    for (const command of ["insert", "json_patch", "json_merge"]) {
      const out = resolveSurfaceWritePatch(PROMPT, {
        command,
        new_str: "x",
      } as never);
      expect(out.ok).toBe(false);
      if (out.ok) continue;
      expect(out.reason).toContain(command);
    }
  });

  it("refuses to patch a value that is not text", () => {
    // An anchored edit into `undefined` is the stale-read case: the surface
    // has not produced the value yet. Appending to "" would silently invent
    // a prompt out of nothing.
    for (const current of [undefined, null, 42, { a: 1 }]) {
      const out = resolveSurfaceWritePatch(current, {
        command: "append",
        new_str: "x",
      });
      expect(out.ok).toBe(false);
    }
  });
});

describe("the wire contract", () => {
  it("teaches every command it actually accepts", () => {
    // The sentence the model reads and the switch that honours it are in one
    // file so they cannot drift; this asserts they have not.
    const line = surfacePatchContractLine();
    for (const command of ["str_replace", "append", "prepend", "overwrite"]) {
      expect(line).toContain(command);
    }
    expect(line).toContain("old_str");
    expect(line).toContain("new_str");
  });
});
