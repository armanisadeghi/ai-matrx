import { safeEmbedUrl } from "../embed-url";
it.each([
  null,
  {},
  "",
  "  ",
  "<h1>Workshop agenda</h1>",
  "Workshop <script>alert(1)</script>",
  "javascript:alert(1)",
  "data:text/html,hi",
  "ftp://files.example/x",
  "an agenda",
])("does not frame HTML, prose or non-web input %s", (value) => {
  expect(safeEmbedUrl(value)).toBeNull();
});
it.each([
  "https://www.youtube.com/embed/M7lc1UVf-VE",
  "http://example.com/a",
  "//example.com/a",
  "/p/agenda",
  "./agenda",
  "../agenda",
  "?preview=1",
  "#agenda",
])("recognizes an explicit web or relative address %s", (value) => {
  expect(safeEmbedUrl(value)).toBe(value);
});
it("normalizes surrounding whitespace before origin classification", () => {
  expect(safeEmbedUrl("  https://example.com/a  ")).toBe(
    "https://example.com/a",
  );
});
