import {
  SKIP,
  USER_INPUT_ROW_ID,
  buildInputRows,
  buildMappedRuntime,
  buildValueSources,
} from "../custom-agent-plan";

const scope = {
  selection: "the highlighted bit",
  content: "the whole page",
  text_before: "",
  note_title: "Q3 plan",
  active_organization_id: "org-1",
  surface_name: "matrx-user/chat",
  context: { a: 1 },
};

describe("buildValueSources", () => {
  it("offers every non-empty text value the menu captured, known ones first, app facts never", () => {
    expect(buildValueSources(scope).map((s) => [s.id, s.label])).toEqual([
      ["selection", "Selected text"],
      ["content", "Whole content"],
      ["note_title", "Note title"],
    ]);
  });

  it("falls back to the document content when the scope has none (a bar, not the menu)", () => {
    expect(buildValueSources(undefined, "doc text")).toEqual([
      { id: "content", label: "Whole content", value: "doc text" },
    ]);
  });
});

describe("buildInputRows", () => {
  it("lists the message, then every variable — a control or bound variable disabled with its reason", () => {
    const rows = buildInputRows([
      { name: "information", defaultValue: "", helpText: "What to work on" },
      { name: "temperature", defaultValue: 0.7, control: {} as never },
      { name: "client", defaultValue: "", binding: {} as never },
    ]);
    expect(rows.map((r) => [r.id, r.disabledReason])).toEqual([
      [USER_INPUT_ROW_ID, undefined],
      ["information", undefined],
      ["temperature", "Model setting"],
      ["client", "Filled automatically"],
    ]);
  });
});

describe("buildMappedRuntime", () => {
  const sources = buildValueSources(scope);
  const rows = buildInputRows([
    { name: "information", defaultValue: "" },
    { name: "temperature", defaultValue: 0.7, control: {} as never },
  ]);

  it("fills each mapped input, leaves Skip alone, and always carries the whole scope as context", () => {
    const runtime = buildMappedRuntime(
      { information: "selection", [USER_INPUT_ROW_ID]: SKIP },
      sources,
      rows,
      scope,
    );
    expect(runtime).toEqual({
      applicationScope: scope,
      variables: { information: "the highlighted bit" },
    });
  });

  it("maps content to the message when the person chooses it, and never fills a disabled input", () => {
    const runtime = buildMappedRuntime(
      { [USER_INPUT_ROW_ID]: "content", temperature: "selection" },
      sources,
      rows,
      scope,
    );
    expect(runtime).toEqual({ applicationScope: scope, userInput: "the whole page" });
  });

  it("all Skip: nothing but the scope", () => {
    expect(buildMappedRuntime({}, sources, rows, scope)).toEqual({ applicationScope: scope });
  });
});
