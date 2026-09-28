import {
  buildAutoCreateFormOffer,
  buildCodeRunVariables,
  buildMetadataRunVariables,
} from "./auto-create-offer-values";

const agent = {
  id: "agent-1",
  name: "Lease Reviewer",
  description: "Reviews commercial leases for risky clauses.",
  variable_definitions: [{ name: "lease_text" }, { name: "jurisdiction" }],
};

const builtinVariables = {
  prompt_object: JSON.stringify(agent),
  sample_response: "s",
  input_fields_to_include: "i",
  page_layout_format: "Form layout ...",
  response_display_component: "c",
  response_display_mode: "Stream ...",
  color_pallet_options: "p",
  custom_instructions: "CONTRACT\n\nMake it calm.",
};

const metadata = {
  name: "Lease Check",
  tagline: "Spot risky clauses",
  description: "Paste a lease, get the risks.",
  slug_options: ["lease-check"],
  category: null,
  tags: [],
};

describe("auto-create offer values", () => {
  it("code run keeps every existing key/value and only adds offers", () => {
    const formOffer = buildAutoCreateFormOffer({
      agent,
      format: "form",
      displayMode: "custom",
      responseMode: "loader",
      includedVariables: { lease_text: true, jurisdiction: false },
      colorMode: "custom",
      primaryColor: "emerald",
      creatorInstructions: "  Make it calm. ",
      creationMode: "select",
    });
    const vars = buildCodeRunVariables({
      builtinVariables,
      formOffer,
      builderMode: "lightning",
      metadata,
      slug: "lease-check",
    });
    for (const [k, v] of Object.entries(builtinVariables)) expect(vars[k]).toBe(v);
    expect(Object.keys(vars).sort()).toEqual(
      [
        ...Object.keys(builtinVariables),
        "page_layout", "display_mode", "response_mode", "primary_color",
        "included_variable_names", "creator_instructions", "creation_mode",
        "agent_id", "agent_name", "builder_mode", "app_name", "app_tagline",
        "app_description", "app_slug",
      ].sort(),
    );
    expect(vars.included_variable_names).toEqual(["lease_text"]);
    expect(vars.creator_instructions).toBe("Make it calm.");
    expect(vars).not.toHaveProperty("app_category"); // null category omitted
  });

  it("auto path omits creator-only facts and includes every agent input", () => {
    const offer = buildAutoCreateFormOffer({
      agent,
      format: "form",
      displayMode: "matrx-format",
      responseMode: "stream",
      includedVariables: {},
      colorMode: "auto",
    });
    expect(offer).not.toHaveProperty("primary_color");
    expect(offer).not.toHaveProperty("creator_instructions");
    expect(offer).not.toHaveProperty("creation_mode");
    expect(offer.included_variable_names).toEqual(["lease_text", "jurisdiction"]);
  });

  it("metadata run keeps prompt_config verbatim and adds offers", () => {
    const vars = buildMetadataRunVariables({
      promptConfig: builtinVariables.prompt_object,
      agent,
      pageLayoutFormat: builtinVariables.page_layout_format,
      responseDisplayMode: builtinVariables.response_display_mode,
      creatorInstructions: undefined,
      builderMode: "standard",
    });
    expect(vars.prompt_config).toBe(builtinVariables.prompt_object);
    expect(Object.keys(vars).sort()).toEqual(
      [
        "prompt_config", "agent_name", "agent_description", "agent_variable_names",
        "page_layout_format", "response_display_mode", "builder_mode",
      ].sort(),
    );
    expect(vars.agent_variable_names).toEqual(["lease_text", "jurisdiction"]);
  });
});
