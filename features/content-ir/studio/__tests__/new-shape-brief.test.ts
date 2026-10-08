import {
  composeNewShapeBrief,
  NEW_SHAPE_EMPTY_ANSWERS,
  type NewShapeAnswers,
} from "../new-shape-options";

const answers: NewShapeAnswers = {
  ...NEW_SHAPE_EMPTY_ANSWERS,
  name: "Tasting note",
  contents: "  A wine tasting note with aroma and finish.  ",
  sample: "",
  cardinality: "collection",
  renderStyle: "card",
  disposition: "record",
  web: "published_to_web",
  assets: ["component", "sample"],
};

describe("composeNewShapeBrief", () => {
  it("sends the typed sentence verbatim and each answer as its own raw variable", () => {
    const { userInput, variables } = composeNewShapeBrief(answers);
    expect(userInput).toBe("A wine tasting note with aroma and finish.");
    expect(variables).toEqual({
      shape_name: "Tasting note",
      shape_cardinality: "collection",
      shape_render_style: "card",
      shape_visibility: "published_to_web",
      shape_assets: ["component", "sample"],
      shape_disposition: "record",
    });
  });

  it("composes no prose: no task_brief, pasted data on its own variable", () => {
    const { variables } = composeNewShapeBrief({ ...answers, sample: '{"a":1}' });
    expect(variables).not.toHaveProperty("task_brief");
    expect(variables.user_data_sample).toBe('{"a":1}');
  });

  it("says none when no assets were asked for", () => {
    expect(composeNewShapeBrief({ ...answers, assets: [] }).variables.shape_assets).toBe("none");
  });
});
