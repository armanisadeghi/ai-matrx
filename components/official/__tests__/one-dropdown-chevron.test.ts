/**
 * ONE DROPDOWN CHEVRON (page-pass 2026-09-27, /crm/<id>). Dropdown triggers drew
 * three glyphs side by side — a down chevron, an up-down pair, a larger up-down —
 * so one form read as three kinds of control. Every dropdown trigger draws
 * design-system `SelectChevron`. The up-down glyph stays only where it is NOT a
 * dropdown: expand/collapse-all toggles and sortable column headers.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.join(__dirname, "..", "..", "..");

/** Not dropdowns — expand/collapse-all and sort indicators. Each is a reason, not an exemption. */
const NOT_A_DROPDOWN: Record<string, string> = {
  "components/official/org-chart/OrgChart.tsx": "expand-all control",
  "components/mardown-display/blocks/transcripts/TranscriptViewer.tsx": "compact/expanded view toggle",
  "components/mardown-display/blocks/transcripts/AdvancedTranscriptViewer.tsx": "compact/expanded view toggle",
  "features/notes/components/NoteSidebar.tsx": "expand/collapse all folders",
  "features/marketing/content-plan/components/PlanTreeToolbar.tsx": "expand all",
  "features/marketing/seo/topical-map/views/outline/OutlineToolbar.tsx": "expand all",
  "features/vision-interview/components/ExpertFeedPanel.tsx": "expand all",
  "features/data-tables/pick-lists/components/ListsTreeNav.tsx": "expand all",
  "features/window-panels/WindowTray.tsx": "restore window",
  "features/projects/components/ProjectsHub.tsx": "sortable column header",
  "features/tasks/components/TasksTableView.tsx": "sortable column header",
  "features/documents/components/DocumentsHubTable.tsx": "sortable column header",
  "features/ai-models/components/ProviderSyncDashboard.tsx": "sortable column header",
};

it("no dropdown trigger draws the up-down chevron", () => {
  const files = execFileSync("git", ["grep", "-l", "ChevronsUpDown", "--", "*.tsx"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => f && !f.includes("__tests__") && !f.startsWith("node_modules"));
  const offenders = files.filter((f) => !(f in NOT_A_DROPDOWN));
  expect(offenders).toEqual([]);
});

// The official combobox (OptionCombobox) moved into @ai-matrx/design-system/controls (2026-10-08);
// it draws the package's one SelectChevron there.
