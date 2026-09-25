import { parseStructuredCellValue, structuredCellSummary } from "./structuredCellValue";

it("recognizes objects and arrays without treating malformed prose as JSON", () => {
  const array = parseStructuredCellValue('[{"a":1}]');
  const object = parseStructuredCellValue('{"a":1,"b":2}');
  expect(array && structuredCellSummary(array)).toBe("1 item");
  expect(object && structuredCellSummary(object)).toBe("a, b");
  expect(parseStructuredCellValue("[not valid JSON]")).toBeNull();
  expect(parseStructuredCellValue("ordinary prose")).toBeNull();
});
