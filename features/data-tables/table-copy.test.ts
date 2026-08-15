import {
  buildDataTableAgentInput,
  dataTableRowsToMarkdown,
  projectDataTableRows,
  type DataTableCopyField,
  type DataTableCopyRow,
} from "./table-copy";
import { buildAgentPayload } from "@/components/agent-copy/buildAgentPayload";

const fields: DataTableCopyField[] = [
  { id: "f-name", field_name: "name", display_name: "Name" },
  { id: "f-note", field_name: "note", display_name: "Notes" },
];

const rows: DataTableCopyRow[] = [
  { id: "r-1", data: { name: "Alpha", note: "one | two" } },
  { id: "r-2", data: { name: "Beta", note: "line 1\nline 2" } },
];

describe("user data table copy", () => {
  it("projects only the chosen columns with friendly labels", () => {
    expect(projectDataTableRows(rows, [fields[1]])).toEqual([
      { Notes: "one | two" },
      { Notes: "line 1\nline 2" },
    ]);
  });

  it("builds safe Markdown for the chosen rows and columns", () => {
    expect(dataTableRowsToMarkdown("Example", [rows[0]], fields)).toBe(
      [
        "# Example",
        "",
        "| Name | Notes |",
        "| --- | --- |",
        "| Alpha | one \\| two |",
      ].join("\n"),
    );
    expect(dataTableRowsToMarkdown("Example", [rows[1]], fields)).toContain(
      "line 1<br>line 2",
    );
  });

  it("wraps selected data in the canonical AI envelope input", () => {
    const input = buildDataTableAgentInput({
      tableId: "table-1",
      tableName: "Example",
      rows: [rows[1]],
      fields: [fields[0]],
      scope: "selected",
    });

    expect(input.kind).toBe("user-data-table");
    expect(input.data).toEqual([{ Name: "Beta" }]);
    expect(input.attributes).toMatchObject({
      table_id: "table-1",
      row_count: 1,
      column_count: 1,
      scope: "selected",
    });
    expect(input.context).toHaveProperty("instruction");

    const payload = buildAgentPayload(input);
    expect(payload).toContain("<user-data-table");
    expect(payload).toContain('scope="selected"');
    expect(payload).toContain("<instruction>");
  });
});
