/**
 * NO KEY OR INTERNAL NAME EVER REACHES A PERSON (Arman's ruling, 2026-09-29; lane DATA-V2-BASICS-2).
 * MEASURED: Add Column printed "Internal field name: stock_status" under the name a person typed;
 * Configure Table printed "#3 • stock_status" under each column; Get reference printed
 * "(stock_status)" beside each column's name; New table and New template printed the same line.
 * The store mints the key; the person only ever sees the column's own name.
 *
 * A census over every dialog the table page opens: none of them may draw a column's key as text.
 * An id=/htmlFor=/value= attribute is not drawn and is allowed; text between tags is not.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const DIALOGS = [
  "components/user-generated-table-data/AddColumnModal.tsx",
  "components/user-generated-table-data/AddRowModal.tsx",
  "components/user-generated-table-data/EditRowModal.tsx",
  "components/user-generated-table-data/ColumnSettingsDialog.tsx",
  "components/user-generated-table-data/TableConfigModal.tsx",
  "components/user-generated-table-data/TableReferenceModal.tsx",
  "components/user-generated-table-data/TableReferenceOverlay.tsx",
  "components/user-generated-table-data/CreateTableModal.tsx",
  "components/user-generated-table-data/CreateTemplateModal.tsx",
  "components/user-generated-table-data/DeleteRowModal.tsx",
  "components/user-generated-table-data/RowOrderingModal.tsx",
  "components/user-generated-table-data/PasteRowsDialog.tsx",
  "features/data-tables/components/ColorRulesDialog.tsx",
  "features/data-tables/components/BulkRowActions.tsx",
  "features/sharing/components/ShareButton.tsx",
];

/** Lines that draw a key as text: the words, or a `field_name` interpolated between tags. */
function drawnKeys(source: string): string[] {
  return source
    .split("\n")
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .filter(({ line }) => {
      if (/Internal field name/i.test(line)) return true;
      // `{x.field_name}` as JSX text: not inside an attribute (`=` right before the brace),
      // not inside a template literal or a call.
      const text = line.replace(/\w+=\{[^}]*\}/g, "").replace(/`[^`]*`/g, "");
      return /(^|>|\s|•|\()\{\s*[\w.[\]]*field_name(\s*\|\|[^}]*)?\}/.test(text) && !/=>|\(\s*\w+\s*\)\s*=>/.test(text);
    })
    .map(({ line, n }) => `${n}: ${line.trim()}`);
}

describe("no key or internal name reaches a person", () => {
  it.each(DIALOGS)("%s draws no column key as text", (file) => {
    const source = readFileSync(join(ROOT, file), "utf8");
    expect(drawnKeys(source)).toEqual([]);
  });

  it("the census catches the shapes it was built from", () => {
    expect(drawnKeys('<p>Internal field name: <code>{fieldName}</code></p>')).toHaveLength(1);
    expect(drawnKeys("  #{field.field_order} • {field.field_name}")).toHaveLength(1);
    expect(drawnKeys("  ({field.field_name})")).toHaveLength(1);
    expect(drawnKeys('  <Input id={field.field_name} value={x} />')).toHaveLength(0);
    expect(drawnKeys('  <SelectItem key={f.id} value={f.field_name}>')).toHaveLength(0);
  });
});
