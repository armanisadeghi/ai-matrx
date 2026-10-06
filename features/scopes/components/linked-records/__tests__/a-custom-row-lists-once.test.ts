// A custom row that links to a record shows ONCE on that record's page: in "Linked records"
// (EntityBackLinks, with the row's title), never again in the older "Linked" panel as "Untitled Record".
import { isLinkEdge, isStoreReferenceBackEdge, type LinkEdgeLike } from "../LinkedRecordsSection";

const fieldLink: LinkEdgeLike = { direction: "incoming", otherType: "record", otherId: "r1", role: "reports_to_field" };
const anchored: LinkEdgeLike = { direction: "incoming", otherType: "record", otherId: "r2", role: "anchored_to" };
const note: LinkEdgeLike = { direction: "incoming", otherType: "note", otherId: "n1", role: "anchored_to" };

describe("a custom row that links here", () => {
  it("is a Linked edge the older panel would list, and a back-link edge the page lists once", () => {
    expect(isLinkEdge("hr_employee", fieldLink)).toBe(true);
    expect(isStoreReferenceBackEdge("hr_employee", fieldLink)).toBe(true);
  });
  it("leaves direct links to the Linked panel", () => {
    expect(isStoreReferenceBackEdge("hr_employee", anchored)).toBe(false);
    expect(isStoreReferenceBackEdge("hr_employee", note)).toBe(false);
  });
});
