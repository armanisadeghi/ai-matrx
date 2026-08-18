import { registerUniverFacadeDependencies } from "../registerUniverFacadeDependencies";

class ExistingService {}
class MissingService {}

describe("registerUniverFacadeDependencies", () => {
  it("adds only observer dependencies absent from the injector", () => {
    const add = jest.fn();
    const has = jest.fn((dependency: unknown) => dependency === ExistingService);

    registerUniverFacadeDependencies(
      { has, add },
      [ExistingService, MissingService],
    );

    expect(has).toHaveBeenCalledWith(ExistingService);
    expect(has).toHaveBeenCalledWith(MissingService);
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith([MissingService]);
  });
});
