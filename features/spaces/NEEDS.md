# Spaces — needs from outside the fence

Builder adds one row per need; the owner session clears it (adds it in the package) the same day and deletes the row.

| Need | Why (parity ID) | Where it belongs |
|---|---|---|
| A full-bleed workspace page-top template the Notion top bar can sit in (breadcrumb, edited-ago, Share, star, •••) | A6 — the template is "not yet a single component"; the bar is built inside the fence (`page/SpacePage.tsx` `.spaces-topbar`) under the shell header | `features/shell` page-top templates (owner: deferred to switch-over) |
| `ChartBlock` donut draws no value in the middle, and ChartBlock always draws its own figure border + caption (no bare mode) | G1/G3 — Notion's ring shows the total in the middle inside the view's own tile; the donut is drawn in `data/ChartView.tsx` until then | `@ai-matrx/records-ui` ChartBlock (`centerValue`, `variant="bare"`) |
| The in-memory template preview does not answer `record_aggregate` | G1 — sample charts are aggregated over read rows in `data/ChartView.tsx` (`aggregateRows`); live tables use the store's door | `@ai-matrx/records/memory` |
| `ViewSwitcher` grid ignores `presentation.hiddenFields` for reverse-link columns (`linked:<table>__<field>`) | F4 / acceptance page — the client table shows NPS SURVEYS / CLIENT WINS / TASKS columns screenshot 1 does not, and the TASKS cell lists ~90 titles so the table is ~8000px tall | `@ai-matrx/records-ui` Grid |
| A row's linked-records cell wraps every title (no one-line clamp) | F7 / screenshot 1 rows are one line | `@ai-matrx/records-ui` Grid |
| Built-in sources (`{kind:"entity", token}`) in records-ui | F10 / C25 picker — the block shows "Built-in sources are not connected yet." for an entity source; picker lists real tables + the sample only | `@ai-matrx/records-ui` (data chair) |
