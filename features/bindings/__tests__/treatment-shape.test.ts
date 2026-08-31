// features/bindings/__tests__/treatment-shape.test.ts
//
// THE GUARD ON THE PRESENTATION CODEC.
//
// `treatment-shape.ts` is a client-side twin of two things that live in the
// database: `mandate.shortcut_treatment_config(p_row)` (which BUILDS the config
// object) and `mandate.vw_shortcut` (which READS it back with an explicit
// COALESCE default per column). A twin that drifts is a fork, and a fork here
// means a job authored in the one binding UI and a shortcut authored in the
// Gen-A editor stop being the same record shape.
//
// So every literal below is copied from the live SQL, not from the TS. If a
// migration changes the shape, these fail — which is the point.
//
// The SQL, verbatim (migrations/mandate_shortcut_write_policies_on_treatment.sql):
//   COALESCE(t.config ->> 'display_mode',                'modal-full')
//   COALESCE((t.config ->> 'allow_chat')::boolean,        true)
//   COALESCE(t.config ->> 'response_density',            'comfortable')
//   COALESCE((t.config->'variables'->>'show_panel')::bool, false)
//   COALESCE(t.config->'variables'->>'panel_style',      'inline')
//   COALESCE((t.config->'reveal'->>'…')::boolean,         false)   ×4
//   COALESCE((t.config->'gate'->>'enabled')::boolean,     false)
//   COALESCE((t.config->'gate'->>'bypass_seconds')::int,  3)
//   COALESCE((t.config->'menu'->>'sort_order')::int,      0)
//   COALESCE(t.config->'menu'->'enabled_features',        '["general"]')
//   COALESCE(t.config->'write_policies',                  '{}')

import {
  TREATMENT_SCHEMA_VERSION,
  buildTreatmentConfig,
  defaultPresentation,
  parseTreatmentConfig,
  presentationIsDefault,
} from "../treatment-shape";

describe("treatment-shape — the client codec for mandate.treatment.config", () => {
  it("defaults match the view's own COALESCE, column for column", () => {
    const base = defaultPresentation();
    expect(base.displayMode).toBe("modal-full");
    expect(base.allowChat).toBe(true);
    expect(base.responseDensity).toBe("comfortable");
    expect(base.showVariablePanel).toBe(false);
    expect(base.variablesPanelStyle).toBe("inline");
    expect(base.showDefinitionMessages).toBe(false);
    expect(base.showDefinitionMessageContent).toBe(false);
    expect(base.hideReasoning).toBe(false);
    expect(base.hideToolResults).toBe(false);
    expect(base.showPreExecutionGate).toBe(false);
    expect(base.bypassGateSeconds).toBe(3);
    expect(base.sortOrder).toBe(0);
    expect(base.enabledFeatures).toEqual(["general"]);
    expect(base.writePolicies).toEqual({});
  });

  it("an ABSENT config reads as the defaults — a job with no row and a job with a default row are indistinguishable", () => {
    expect(parseTreatmentConfig(null)).toEqual(defaultPresentation());
    expect(parseTreatmentConfig(undefined)).toEqual(defaultPresentation());
    expect(parseTreatmentConfig("not an object")).toEqual(defaultPresentation());
  });

  it("writes the SQL twin's key layout, nested exactly where the view looks", () => {
    const config = buildTreatmentConfig(defaultPresentation());
    expect(config).toMatchObject({
      schema_version: TREATMENT_SCHEMA_VERSION,
      display_mode: "modal-full",
      allow_chat: true,
      response_density: "comfortable",
      variables: { show_panel: false, panel_style: "inline" },
      reveal: {
        show_definition_messages: false,
        show_definition_message_content: false,
        hide_reasoning: false,
        hide_tool_results: false,
      },
      gate: { enabled: false, bypass_seconds: 3 },
      seeds: {},
      menu: { sort_order: 0, enabled_features: ["general"] },
    });
  });

  it("OMITS what the SQL twin omits — an absent seed, gate message or empty policy map stores nothing", () => {
    const config = buildTreatmentConfig(defaultPresentation()) as Record<
      string,
      unknown
    >;
    expect(config.seeds).toEqual({});
    expect(Object.keys(config.gate as object)).not.toContain("message");
    expect(config).not.toHaveProperty("write_policies");
    expect(config).not.toHaveProperty("icon_name");
    expect(config).not.toHaveProperty("keyboard_shortcut");
    expect(config).not.toHaveProperty("json_extraction");
    expect(config.menu).not.toHaveProperty("category_id");
    expect(config.menu).not.toHaveProperty("surface_name");
  });

  it("round-trips every field a person can set in the drawer", () => {
    const filled = {
      ...defaultPresentation(),
      displayMode: "sidebar" as const,
      allowChat: false,
      responseDensity: "compact" as const,
      showVariablePanel: true,
      variablesPanelStyle: "wizard" as const,
      showDefinitionMessages: true,
      showDefinitionMessageContent: true,
      hideReasoning: true,
      hideToolResults: true,
      showPreExecutionGate: true,
      preExecutionMessage: "Runs in 3s — click to stop it.",
      bypassGateSeconds: 7,
      defaultUserInput: "Summarise the transcript",
      defaultVariables: { language: "en" },
      contextOverrides: { page: "notes" },
      llmOverrides: { temperature: 0.2 },
      jsonExtraction: { mode: "stream" },
      categoryId: "5f1d6c4e-0000-4000-8000-000000000001",
      sortOrder: 12,
      enabledFeatures: ["general", "notes"],
      surfaceName: "matrx-user/transcripts-clean",
      iconName: "BrainCircuit",
      keyboardShortcut: "Cmd+Shift+K",
      writePolicies: { cleaned_transcript: "ask" as const },
    };
    expect(parseTreatmentConfig(buildTreatmentConfig(filled))).toEqual(filled);
  });

  it("`false` survives the round trip — a switched-off option is an ANSWER, not an absence", () => {
    const off = { ...defaultPresentation(), allowChat: false };
    const read = parseTreatmentConfig(buildTreatmentConfig(off));
    expect(read.allowChat).toBe(false);
    expect(presentationIsDefault(off)).toBe(false);
  });

  it("`auto_run` is pinned, never authored here — the binding owns that promise", () => {
    const config = buildTreatmentConfig(defaultPresentation()) as Record<
      string,
      unknown
    >;
    // The view's own default. The drawer offers no control for it, so the codec
    // must never emit a second, divergent answer.
    expect(config.auto_run).toBe(true);
  });

  it("an untouched presentation stores NOTHING — a row that says nothing is never created", () => {
    expect(presentationIsDefault(defaultPresentation())).toBe(true);
    expect(
      presentationIsDefault({ ...defaultPresentation(), sortOrder: 4 }),
    ).toBe(false);
  });

  it("a config carrying unknown keys still reads — a newer writer never breaks an older reader", () => {
    const read = parseTreatmentConfig({
      schema_version: 1,
      display_mode: "inline",
      something_from_the_future: { nested: true },
      menu: { sort_order: 3, future_key: 1 },
    });
    expect(read.displayMode).toBe("inline");
    expect(read.sortOrder).toBe(3);
    expect(read.allowChat).toBe(true);
  });
});
