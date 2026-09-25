/**
 * EVERYTHING A TEXT SLOT RECEIVES IS TEXT (Arman, 2026-09-24).
 *
 * A structured offered value delivered on a prompt variable arrives as its
 * JSON text (`textFormOf`, mirror of aidream `provisions.text_form_of`). The
 * mapping editor used to print a red refusal ("…can only feed a context
 * policy, never a prompt variable") for a mapping the server accepts and
 * delivers — a screen that lies. It now states what happens instead.
 */

import { readFileSync } from "fs";
import path from "path";

import { structuredVariableNote } from "@/features/bindings/offered-adapter";
import { textFormOf } from "@/features/mandates/provision-shapes";

describe("structuredVariableNote", () => {
  it("says a structured value on a variable arrives as its JSON text", () => {
    const note = structuredVariableNote("json", "variable");
    expect(note).toBe(
      "This is a structured shape — it arrives in the prompt as its JSON text.",
    );
    expect(structuredVariableNote("research_brief", undefined)).toMatch(
      /arrives in the prompt as its JSON text/,
    );
  });

  it("says nothing for scalars, media, or the context channel", () => {
    expect(structuredVariableNote("text", "variable")).toBeNull();
    expect(structuredVariableNote("number", "variable")).toBeNull();
    expect(structuredVariableNote("file", "variable")).toBeNull();
    expect(structuredVariableNote("json", "context")).toBeNull();
  });

  it("the JSON text it promises is the one textFormOf produces", () => {
    expect(textFormOf({ subject: "Wildfire smoke" })).toBe(
      '{\n  "subject": "Wildfire smoke"\n}',
    );
  });
});

describe("the mapping editor never refuses a structured value on a variable", () => {
  const source = readFileSync(
    path.join(
      process.cwd(),
      "features/surfaces/components/ValueMappingEditor.tsx",
    ),
    "utf8",
  );

  it("carries no fake refusal sentence", () => {
    expect(source).not.toMatch(/never a prompt variable/);
    expect(source).not.toMatch(/can only feed a context/);
  });

  it("speaks through the one note helper", () => {
    expect(source).toMatch(/structuredVariableNote\(/);
  });
});
