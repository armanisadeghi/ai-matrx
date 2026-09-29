/**
 * V2-F #5 (verify-2): one citation named a PDF by the document's own title
 * instead of the file name its card showed. The one client handler hands every
 * generator the name the person saw.
 */
import { createSourceRef, type ResolvedSourceSet } from "@ai-matrx/agents/sources";
import { withDisplayNames } from "./useSourceSet";

const PDF = "e7c4d481-6b4d-430a-9c5e-330b464e6c8f";
const OTHER = "0d0b92dc-a02d-42cc-af40-5bd9a476e137";

const resolved = {
  __kind: "resolved_source_set",
  sources: [
    { ref: createSourceRef("file", PDF), label: "Campbell Biology, 12th Edition", form_used: "clean", text: "x", segments: [], state: "ready", truncated: false, notes: [] },
    { ref: createSourceRef("note", OTHER), label: "Server name", form_used: "content", text: "y", segments: [], state: "ready", truncated: false, notes: [] },
  ],
  dropped: [],
} as unknown as ResolvedSourceSet;

it("names each Source as its card did, and keeps the server's name only where the input has none", () => {
  const out = withDisplayNames(resolved, [
    { draft: { kind: "files", label: "official-ap-biology.pdf", ref: createSourceRef("file", PDF, { include_segments: ["a"] }) } },
  ]);
  expect(out.sources[0]!.label).toBe("official-ap-biology.pdf");
  expect(out.sources[1]!.label).toBe("Server name");
});
