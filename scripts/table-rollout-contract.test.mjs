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
    /coverage=\{\{ total, cap: 50, answeredBy: "client", noun: "task"/,
  );
  assert.doesNotMatch(page, /matched: tasks\.length/);
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
    /coverage=\{\{ answeredBy: 'client', noun: 'system announcement'/,
  );
  assert.doesNotMatch(page, /matched: announcements\.length/);
  assert.doesNotMatch(page, /cap: announcements\.length/);
  assert.doesNotMatch(page, /All system announcements/);
  assert.match(page, /localPagination=\{\{ mode: 'progressive' \}\}/);
  assert.match(page, /onRowOpen=\{handleEdit\}/);
  assert.match(page, /copy=\{false\}/);
  assert.match(page, /detail=\{\{ enabled: false \}\}/);
  assert.match(page, /window=\{\{ enabled: false \}\}/);
});

test("System apps use canonical controls and only claim a complete source below its cap", () => {
  const page = source(
    "app/(admin)/administration/agents/system-agents/apps/page.tsx",
  );
  assert.match(page, /<MatrxDataTable/);
  assert.match(
    page,
    /coverage=\{\{\s*total: apps\.length < 500 \? apps\.length : undefined,\s*cap: 500,\s*answeredBy: "client"/,
  );
  assert.match(page, /searchPlaceholder: "Search system apps…"/);
  assert.match(page, /searchText=\{\(app\) => app\.id\}/);
  assert.match(page, /onViewChange=\{setVisibleApps\}/);
  assert.match(page, /copy=\{false\}/);
  assert.match(page, /detail=\{\{ enabled: false \}\}/);
  assert.match(page, /window=\{\{ enabled: false \}\}/);
  assert.match(page, /agentAppExecutionsHref\(app\.id\)/);
  assert.match(page, /setDeleteTarget\(app\)/);
  assert.match(page, /JSON \(visible loaded view\)/);
  assert.match(page, /json=\{\(\) => visibleApps\}/);
  assert.match(page, /refresh: \{\s*onRefresh: \(\) => load\(true\)/);
  assert.match(page, /add: \{\s*onAdd: \(\) =>/);
  assert.doesNotMatch(page, /New system app/);
  assert.doesNotMatch(page, /const \[search, setSearch\]/);
});
