/**
 * Real-world table HTML as it arrives on the clipboard, one entry per source.
 * The shapes (not the exact bytes) of what each product puts on the clipboard:
 * Wikipedia's `<p>` inside a header cell and citation superscripts, Google
 * Docs' `<b id="docs-internal-guid…">` wrapper and `<p dir=ltr><span>` cells,
 * Notion's `<div>` lines, Google Sheets' and Excel's merged cells, Word's
 * `MsoNormal` paragraphs with `<o:p>`. `expect` names cells that must land in
 * a given row/column (row 0 = the header), so a shifted column fails.
 */
export interface PastedTableFixture {
  name: string;
  html: string;
  columns: number;
  rows: number;
  expect: Array<{ row: number; column: number; text: string }>;
  mergedCellsSplit: number;
}

export const PASTED_TABLES: readonly PastedTableFixture[] = [
  {
    name: "Wikipedia — Pallet (a <p> inside a header cell, citations, a <br>)",
    html: `<table class="wikitable sortable"><caption>ISO pallets</caption><tbody><tr><th>Dimensions, mm (W × L)</th><th>Dimensions, in (W × L)</th><th>Wasted floor, <p>ISO container</p></th><th>Region most used in</th></tr><tr><td>1,016 × 1,219</td><td>40.00 × 48.00</td><td>3.7% (20 ft)<br>3.7% (40 ft)</td><td>North America<sup id="cite_ref-3" class="reference"><a href="#cite_note-3">[3]</a></sup></td></tr><tr><td>1,000 × 1,200</td><td>39.37 × 47.24</td><td>6.7%</td><td>Europe, Asia; similar to 40 × 48</td></tr><tr><td>1,165 × 1,165</td><td>45.9 × 45.9</td><td>8.1%</td><td><p>Australia</p><p>(standard)</p></td></tr></tbody></table>`,
    columns: 4,
    rows: 4,
    expect: [
      { row: 0, column: 2, text: "Wasted floor, ISO container" },
      { row: 0, column: 3, text: "Region most used in" },
      { row: 1, column: 2, text: "3.7% (20 ft) 3.7% (40 ft)" },
      { row: 2, column: 0, text: "1,000 × 1,200" },
      { row: 2, column: 2, text: "6.7%" },
      { row: 3, column: 3, text: "Australia (standard)" },
    ],
    mergedCellsSplit: 0,
  },
  {
    name: "Google Docs (docs-internal-guid wrapper, two <p> in one cell)",
    html: `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-6b1c2d3e-7fff-1a2b-3c4d-5e6f7a8b9c0d"><div dir="ltr" style="margin-left:0pt;" align="left"><table style="border:none;border-collapse:collapse;"><colgroup><col width="200"><col width="200"></colgroup><tbody><tr style="height:0pt"><td style="border-left:solid #000000 1pt;"><p dir="ltr" style="line-height:1.38;"><span style="font-size:11pt;font-weight:700;">Site</span></p></td><td style="border-left:solid #000000 1pt;"><p dir="ltr"><span style="font-size:11pt;font-weight:700;">Pickup window</span></p></td></tr><tr style="height:0pt"><td><p dir="ltr"><span style="font-size:11pt;">Alton</span></p></td><td><p dir="ltr"><span style="font-size:11pt;">Mon 06:00</span></p><p dir="ltr"><span style="font-size:11pt;">Thu 14:00</span></p></td></tr><tr style="height:0pt"><td><p dir="ltr"><span>Barranca</span></p></td><td><p dir="ltr"><span>Tue 08:00</span></p></td></tr></tbody></table></div></b>`,
    columns: 2,
    rows: 3,
    expect: [
      { row: 0, column: 1, text: "**Pickup window**" },
      { row: 1, column: 1, text: "Mon 06:00 Thu 14:00" },
      { row: 2, column: 0, text: "Barranca" },
      { row: 2, column: 1, text: "Tue 08:00" },
    ],
    mergedCellsSplit: 0,
  },
  {
    name: "Notion (<div> lines and a bulleted list in a cell)",
    html: `<table><thead><tr><th>Task</th><th>Owner</th><th>Checks</th></tr></thead><tbody><tr><td><div>Check dock plate</div><div>before shift</div></td><td>Dana</td><td><ul><li>Restraint light</li><li>Chocks</li></ul></td></tr><tr><td>Sweep bay 4</td><td>Marco</td><td>None</td></tr></tbody></table>`,
    columns: 3,
    rows: 3,
    expect: [
      { row: 1, column: 0, text: "Check dock plate before shift" },
      { row: 1, column: 1, text: "Dana" },
      { row: 1, column: 2, text: "Restraint light; Chocks" },
      { row: 2, column: 2, text: "None" },
    ],
    mergedCellsSplit: 0,
  },
  {
    name: "Google Sheets (a header merged across two columns)",
    html: `<google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #cccccc;}br {mso-data-placement:same-cell;}--></style><table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1" data-sheets-root="1"><colgroup><col width="100"/><col width="100"/><col width="100"/></colgroup><tbody><tr style="height:21px;"><td style="overflow:hidden;">Bay</td><td style="overflow:hidden;" colspan="2" rowspan="1">Shift</td></tr><tr style="height:21px;"><td>3</td><td>AM</td><td>PM</td></tr><tr style="height:21px;"><td>4</td><td>Dana</td><td>Marco</td></tr></tbody></table>`,
    columns: 3,
    rows: 3,
    expect: [
      { row: 0, column: 1, text: "Shift" },
      { row: 0, column: 2, text: "" },
      { row: 2, column: 2, text: "Marco" },
    ],
    mergedCellsSplit: 1,
  },
  {
    name: "Excel (a cell merged down two rows)",
    html: `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><body><!--StartFragment--><table border=0 cellpadding=0 cellspacing=0 width=256><col width=64 span=3><tr height=20><td height=20 class=xl65 width=64>Dock</td><td class=xl65 width=64>Bay</td><td class=xl65 width=64>Door</td></tr><tr height=20><td rowspan=2 height=40 class=xl66>Dock A</td><td>3</td><td>1142</td></tr><tr height=20><td height=20>4</td><td>1187</td></tr><tr height=20><td height=20>Dock B</td><td>7</td><td>2210</td></tr><!--EndFragment--></table></body></html>`,
    columns: 3,
    rows: 4,
    expect: [
      { row: 1, column: 0, text: "Dock A" },
      { row: 2, column: 0, text: "" },
      { row: 2, column: 1, text: "4" },
      { row: 2, column: 2, text: "1187" },
      { row: 3, column: 0, text: "Dock B" },
    ],
    mergedCellsSplit: 1,
  },
  {
    name: "Word (MsoNormal paragraphs with <o:p>, bold spans)",
    html: `<table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0 style='border-collapse:collapse;border:none'><tr><td width=156 valign=top><p class=MsoNormal><b><span lang=EN-US>Item<o:p></o:p></span></b></p></td><td width=156 valign=top><p class=MsoNormal><b><span lang=EN-US>Notes<o:p></o:p></span></b></p></td></tr><tr><td width=156 valign=top><p class=MsoNormal><span lang=EN-US>Vest<o:p></o:p></span></p></td><td width=156 valign=top><p class=MsoNormal><span lang=EN-US>Line one<o:p></o:p></span></p><p class=MsoNormal><span lang=EN-US>Line two<o:p></o:p></span></p></td></tr></table>`,
    columns: 2,
    rows: 2,
    expect: [
      { row: 0, column: 1, text: "**Notes**" },
      { row: 1, column: 0, text: "Vest" },
      { row: 1, column: 1, text: "Line one Line two" },
    ],
    mergedCellsSplit: 0,
  },
  {
    name: "A web table with a link, an image and a short row",
    html: `<table><tr><th>Part</th><th>Spec</th><th>Photo</th></tr><tr><td>Plate</td><td><a href="https://example.com/spec">Spec sheet</a></td><td><img src="https://files.matrxserver.com/files/abc/download?inline=1" alt="plate"></td></tr><tr><td>Chock</td></tr></table>`,
    columns: 3,
    rows: 3,
    expect: [
      { row: 1, column: 1, text: "[Spec sheet](https://example.com/spec)" },
      { row: 1, column: 2, text: "![plate](https://files.matrxserver.com/files/abc/download?inline=1)" },
      { row: 2, column: 0, text: "Chock" },
      { row: 2, column: 2, text: "" },
    ],
    mergedCellsSplit: 0,
  },
];
