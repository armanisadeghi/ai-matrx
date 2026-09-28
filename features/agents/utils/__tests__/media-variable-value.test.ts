/**
 * Guard for the "raw file id shown instead of the file" bug: a media
 * variable's collapsed row (`AgentVariablesInline`) must resolve a stored
 * file_id through `readMediaVariableFileId` and render a `FileResourceChip`,
 * never the bare UUID as text. This proves the resolver's contract; the
 * component wiring is verified live (run form, battle shared input, chat
 * composer — all share `AgentVariablesInline`).
 */

import {
  isMediaFileId,
  readMediaVariableFileId,
  readMediaVariableValue,
} from "../media-variable-value";

const FILE_ID = "c04cdeea-fb9f-4482-a423-961a84dd8d57";

describe("isMediaFileId", () => {
  it("recognizes a canonical cld_files UUID", () => {
    expect(isMediaFileId(FILE_ID)).toBe(true);
  });

  it("rejects a URL or arbitrary text", () => {
    expect(isMediaFileId("https://example.com/image.png")).toBe(false);
    expect(isMediaFileId("not-a-uuid")).toBe(false);
    expect(isMediaFileId("")).toBe(false);
  });
});

describe("readMediaVariableValue", () => {
  it("passes through a plain string value", () => {
    expect(readMediaVariableValue(FILE_ID)).toBe(FILE_ID);
    expect(readMediaVariableValue("https://example.com/a.png")).toBe(
      "https://example.com/a.png",
    );
  });

  it("reads a MediaRef-shaped object's file_id / fileId / resource_id / url", () => {
    expect(readMediaVariableValue({ file_id: FILE_ID })).toBe(FILE_ID);
    expect(readMediaVariableValue({ fileId: FILE_ID })).toBe(FILE_ID);
    expect(readMediaVariableValue({ resource_id: FILE_ID })).toBe(FILE_ID);
    expect(readMediaVariableValue({ url: "https://example.com/a.png" })).toBe(
      "https://example.com/a.png",
    );
  });

  it("returns empty string for null/undefined/unrecognized shapes", () => {
    expect(readMediaVariableValue(null)).toBe("");
    expect(readMediaVariableValue(undefined)).toBe("");
    expect(readMediaVariableValue({})).toBe("");
  });
});

describe("readMediaVariableFileId", () => {
  it("resolves a file id from a bare UUID value — the run-form bug case", () => {
    expect(readMediaVariableFileId(FILE_ID)).toBe(FILE_ID);
  });

  it("resolves a file id from a MediaRef-shaped runtime value", () => {
    expect(readMediaVariableFileId({ file_id: FILE_ID })).toBe(FILE_ID);
  });

  it("returns null for a URL value — never mistaken for a library file", () => {
    expect(readMediaVariableFileId("https://example.com/image.png")).toBeNull();
  });

  it("returns null for an empty value", () => {
    expect(readMediaVariableFileId("")).toBeNull();
    expect(readMediaVariableFileId(null)).toBeNull();
  });
});
