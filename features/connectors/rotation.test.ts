import { drawConnectorRotation, parseConnectorRotationState } from "./rotation";

const middle = () => 0.5;

describe("connector rotation", () => {
  it("draws without replacement until every eligible connector is shown", () => {
    const eligible = ["a", "b", "c", "d", "e", "f"];
    const first = drawConnectorRotation(eligible, null, 3, middle);
    const second = drawConnectorRotation(eligible, first.state, 3, middle);

    expect(first.selectedIds).toHaveLength(3);
    expect(second.selectedIds).toHaveLength(3);
    expect(
      first.selectedIds.filter((id) => second.selectedIds.includes(id)),
    ).toEqual([]);
    expect(new Set([...first.selectedIds, ...second.selectedIds])).toEqual(
      new Set(eligible),
    );
  });

  it("does not duplicate an id within one selection", () => {
    const result = drawConnectorRotation(
      ["a", "a", "b", "c", "d"],
      null,
      3,
      middle,
    );
    expect(new Set(result.selectedIds).size).toBe(result.selectedIds.length);
  });

  it("recovers safely from malformed persisted state", () => {
    expect(parseConnectorRotationState("not-json")).toBeNull();
    expect(parseConnectorRotationState('{"eligibleSignature":"a"}')).toBeNull();
  });
});
