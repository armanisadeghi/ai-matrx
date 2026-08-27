import {
  FileAccessDeniedError,
  FileDeletedError,
  FileNotFoundError,
} from "../errors";
import { isExpectedUnavailableState } from "./useFileAs";

describe("isExpectedUnavailableState", () => {
  it.each([
    new FileAccessDeniedError(),
    new FileNotFoundError(),
    new FileDeletedError(),
  ])("recognizes typed unavailable file states", (error) => {
    expect(isExpectedUnavailableState(error)).toBe(true);
  });

  it("keeps unexpected resolver failures loud", () => {
    expect(isExpectedUnavailableState(new Error("transport failed"))).toBe(false);
  });
});
