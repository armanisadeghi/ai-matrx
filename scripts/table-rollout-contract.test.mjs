import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const source = (path) => readFileSync(new URL(path, root), "utf8");

test("AI Tasks declares the incomplete source window and retains its loader", () => {
  const page = source("app/(admin)/administration/ai/ai-tasks/page.tsx");
  assert.match(page, /<MatrxDataTable/);
  assert.match(page, /coverage=\{\{ total, matched: total, answeredBy: "source"/);
  assert.match(page, /Load more/);
  assert.match(page, /void loadMore\(\)/);
});

test("Announcements use the canonical table without inventing server paging", () => {
  const page = source("app/(admin)/administration/users/feedback/components/AnnouncementTable.tsx");
  assert.match(page, /<MatrxDataTable/);
  assert.match(page, /hidePagination/);
  assert.match(page, /localPagination=\{\{ mode: 'progressive' \}\}/);
  assert.match(page, /onRowOpen=\{handleEdit\}/);
});
