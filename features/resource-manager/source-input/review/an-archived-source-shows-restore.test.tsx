/**
 * An archived Source shows STATE: an "Archived" badge and a Restore button — never the old
 * sentence that sent the person to "Trash", a place the app no longer offers (archived items come
 * back from each list's own archived filter, or right here). The server says "archived" only to
 * someone who may restore it (aidream `archived_reason.py`); anyone else sees "Can't be used".
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { SourceManifestEntry } from "@ai-matrx/agents/sources";
import { createSourceRef } from "@ai-matrx/agents/sources";
import type { SourcePlanEntry } from "@ai-matrx/agents/sources/runtime";
import { SourceReviewRow } from "./SourceReviewRow";

const NOTE = "b9e2809a-9001-40ac-afe9-b735ddb539a4";

function planEntry(reason: string | null): SourcePlanEntry {
  const ref = createSourceRef("note", NOTE);
  const entry = {
    ref,
    label: "Kitchen quote notes",
    resource_type: "note",
    state: "unavailable",
    state_detail:
      reason === "archived"
        ? "Archived. Restore it to use it, or remove it."
        : "You do not have access to this Source.",
    reason,
    forms: [],
    default_form: "content",
  } as SourceManifestEntry;
  return {
    index: 0,
    ref,
    entry,
    status: "unusable",
    formLabel: "",
    formChars: 0,
    chars: 0,
    sentChars: 0,
    sentTokens: 0,
    exact: true,
    partsSent: null,
    partsTotal: null,
    capped: false,
  };
}

const render = (reason: string | null) =>
  renderToStaticMarkup(
    <SourceReviewRow
      plan={planEntry(reason)}
      onChange={() => {}}
      onFormChange={() => {}}
      onRemove={() => {}}
      onRestored={() => {}}
    />,
  );

describe("an archived Source in Review", () => {
  it("says Archived and offers Restore, with no sentence and no Trash", () => {
    const html = render("archived");
    expect(html).toContain(">Archived<");
    expect(html).toContain("Restore");
    expect(html).not.toContain("Trash");
    expect(html).not.toContain("Can&#x27;t be used");
    expect(html).not.toContain("Restore it to use it");
  });

  it("is still plainly unusable, with no Restore, for someone without access", () => {
    const html = render("no_access");
    expect(html).toContain("Can&#x27;t be used");
    expect(html).not.toContain(">Archived<");
    expect(html).not.toContain(">Restore<");
  });
});
