import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const source = (path) => readFileSync(new URL(path, root), "utf8");

test("AI Tasks retains its fixed first source window without implicit table doors", () => {
  const page = source("app/(admin)/administration/ai/ai-tasks/page.tsx");
  assert.match(page, /<MatrxDataTable/);
  assert.match(
    page,
    /coverage=\{\{ total, matched: tasks\.length, cap: 50, answeredBy: "client"/,
  );
  assert.match(page, /copy=\{false\}/);
  assert.match(page, /detail=\{\{ enabled: false \}\}/);
  assert.match(page, /window=\{\{ enabled: false \}\}/);
  assert.doesNotMatch(page, /loadMore/);
});

test("Announcements disclose their loaded window and retain only explicit actions", () => {
  const page = source(
    "app/(admin)/administration/users/feedback/components/AnnouncementTable.tsx",
  );
  assert.match(page, /<MatrxDataTable/);
  assert.match(
    page,
    /coverage=\{\{ matched: announcements\.length, cap: announcements\.length, answeredBy: 'client'/,
  );
  assert.match(page, /localPagination=\{\{ mode: 'progressive' \}\}/);
  assert.match(page, /onRowOpen=\{handleEdit\}/);
  assert.match(page, /copy=\{false\}/);
  assert.match(page, /detail=\{\{ enabled: false \}\}/);
  assert.match(page, /window=\{\{ enabled: false \}\}/);
});

test("System apps use the canonical table without inventing a source total or generic doors", () => {
  const page = source(
    "app/(admin)/administration/agents/system-agents/apps/page.tsx",
  );
  assert.match(page, /<MatrxDataTable/);
  assert.match(
    page,
    /coverage=\{\{\s*matched: apps\.length,\s*cap: 500,\s*answeredBy: "client"/,
  );
  assert.match(page, /searchPlaceholder: "Search system apps…"/);
  assert.match(page, /copy=\{false\}/);
  assert.match(page, /detail=\{\{ enabled: false \}\}/);
  assert.match(page, /window=\{\{ enabled: false \}\}/);
  assert.match(page, /agentAppExecutionsHref\(app\.id\)/);
  assert.match(page, /setDeleteTarget\(app\)/);
  assert.match(page, /JSON \(loaded window\)/);
  assert.doesNotMatch(page, /const \[search, setSearch\]/);
});
