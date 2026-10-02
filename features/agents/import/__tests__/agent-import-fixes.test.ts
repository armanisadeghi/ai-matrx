import {
  applyImportFix,
  applyOfferingPin,
  readOfferingIdFromPaste,
  parseImportObject,
  patchModelId,
  stringifyImportObject,
} from "../agent-import-fixes";

describe("agent-import-fixes", () => {
  const base = {
    agent_type: "user",
    name: "Test",
    messages: [],
    model_id: "",
  };

  it("patchModelId replaces empty model_id", () => {
    const obj = { ...base };
    patchModelId(obj, "e2150d2f-7dd3-4fad-9d81-6e6ea41d4afd");
    expect(obj.model_id).toBe("e2150d2f-7dd3-4fad-9d81-6e6ea41d4afd");
  });

  it("applyImportFix updates pasted JSON text", () => {
    const raw = JSON.stringify(base, null, 2);
    const next = applyImportFix(
      raw,
      { kind: "pick-model" },
      "e2150d2f-7dd3-4fad-9d81-6e6ea41d4afd",
    );
    expect(next).not.toBeNull();
    const parsed = parseImportObject(next!);
    expect(parsed?.model_id).toBe("e2150d2f-7dd3-4fad-9d81-6e6ea41d4afd");
  });

  it("fix-text-block renames content to text", () => {
    const obj = {
      name: "X",
      messages: [
        {
          role: "system",
          content: [{ type: "text", content: "hello" }],
        },
      ],
    };
    const raw = stringifyImportObject(obj);
    const next = applyImportFix(raw, {
      kind: "fix-text-block",
      messageIndex: 0,
      blockIndex: 0,
    });
    const parsed = parseImportObject(next!);
    const block = (
      (parsed!.messages as Record<string, unknown>[])[0].content as Record<
        string,
        unknown
      >[]
    )[0];
    expect(block.text).toBe("hello");
    expect(block.content).toBeUndefined();
  });
});

describe("class pin beside the model", () => {
  const LIGHTNING = "29874e67-5683-40c2-9adb-fb797ea9a176";
  const raw = JSON.stringify({ name: "A", settings: { temperature: 0.3 } });

  it("writes settings.offering_id and reads it back", () => {
    const next = applyOfferingPin(raw, LIGHTNING);
    expect(next).not.toBeNull();
    expect(readOfferingIdFromPaste(next as string)).toBe(LIGHTNING);
    expect(parseImportObject(next as string)?.settings).toEqual({
      temperature: 0.3,
      offering_id: LIGHTNING,
    });
  });

  it("clearing removes the key, keeping other settings", () => {
    const pinned = applyOfferingPin(raw, LIGHTNING) as string;
    const cleared = applyOfferingPin(pinned, undefined) as string;
    expect(parseImportObject(cleared)?.settings).toEqual({ temperature: 0.3 });
    expect(readOfferingIdFromPaste(cleared)).toBeNull();
  });
});
