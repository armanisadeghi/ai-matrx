import { filterEducationCollection } from "./EducationCollectionSearch";

type Row = {
  title: string;
  sourceTitle: string | null;
  status: string;
};

const rows: Row[] = [
  { title: "Cell division map", sourceTitle: "Biology 101", status: "ready" },
  { title: "Calculus review", sourceTitle: "Exam prep", status: "generating" },
];

describe("filterEducationCollection", () => {
  const terms = (row: Row) => [row.title, row.sourceTitle, row.status];

  it("finds loaded rows by title, source, or available metadata", () => {
    expect(filterEducationCollection(rows, "division", terms)).toEqual([rows[0]]);
    expect(filterEducationCollection(rows, "biology", terms)).toEqual([rows[0]]);
    expect(filterEducationCollection(rows, "GENERATING", terms)).toEqual([rows[1]]);
  });

  it("returns the full collection for blank queries and no rows for unmatched queries", () => {
    expect(filterEducationCollection(rows, "   ", terms)).toEqual(rows);
    expect(filterEducationCollection(rows, "chemistry", terms)).toEqual([]);
  });
});
