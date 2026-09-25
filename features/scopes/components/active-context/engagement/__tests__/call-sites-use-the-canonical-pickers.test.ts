/**
 * Every call site of the retired bespoke pickers renders the canonical one
 * (lane HIERARCHY-CASCADE, 2026-09-25). The adapters' write paths are proven
 * behaviourally in engagementHosts / useActiveEngagementSelection /
 * BindingTargetPicker; this census proves each site is wired to them and that
 * the bespoke files cannot come back under their old paths.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const ENGAGEMENT = "@/features/scopes/components/active-context/engagement/EngagementPicker";
const ENTITY = "@/features/scopes/components/active-context/engagement/EntityEngagementPicker";
const ACTIVE = "@/features/scopes/components/active-context/engagement/useActiveEngagementSelection";
const TARGET = "@/features/scopes/components/active-context/binding-target/BindingTargetPicker";

const SITES: Array<[file: string, module: string, tag: string, surfaceA?: boolean]> = [
  ["features/research/components/init/ResearchInitForm.tsx", ENGAGEMENT, "<EngagementPicker", true],
  ["features/tasks/components/TaskContentNew.tsx", ENGAGEMENT, "<EngagementPicker", true],
  ["features/agent-apps/route/AgentAppSettingsContent.tsx", ENTITY, "<EntityEngagementPicker"],
  ["features/tasks/components/QuickTasksWorkspace.tsx", ENGAGEMENT, "<EngagementPicker"],
  ["features/tasks/components/ImportTasksModal.tsx", ENGAGEMENT, "<EngagementPicker"],
  ["features/tasks/components/mobile/MobileProjectSelector.tsx", ENGAGEMENT, "<EngagementPicker"],
  ["features/projects/components/ProjectsWorkspace.tsx", ENGAGEMENT, "<EngagementPicker"],
  ["features/agents/components/settings/AgentSettingsForm.tsx", ENGAGEMENT, "<EngagementPicker"],
  ["features/research/components/landing/TopicList.tsx", ENGAGEMENT, "<EngagementPicker"],
  ["app/(dev)/demos/api-tests/tool-testing/components/ContextScopeModal.tsx", ENGAGEMENT, "<EngagementPicker"],
  ["app/(dev)/demos/selection-demo/page.dev.tsx", ENGAGEMENT, "<EngagementPicker"],
  ["features/agent-shortcuts/components/ShortcutForm.tsx", TARGET, "<BindingTargetPicker"],
  ["features/bindings/ScopeHolderBar.tsx", TARGET, "<BindingTargetPicker"],
  ["features/surfaces/admin/batch/SurfaceBindingsBatchEditor.tsx", TARGET, "<BindingTargetPicker"],
  ["features/surfaces/admin/columns/BindingColumn.tsx", TARGET, "<BindingTargetPicker"],
  ["features/surfaces/components/AgentSurfacesPanel.tsx", TARGET, "<BindingTargetPicker"],
  ["features/surfaces/components/bind/SurfaceAgentBindPanel.tsx", TARGET, "<BindingTargetPicker"],
];

describe.each(SITES)("%s", (file, module, tag, surfaceA) => {
  const src = read(file);
  it("imports and renders the canonical picker", () => {
    expect(src).toContain(`from "${module}"`);
    expect(src).toContain(tag);
  });
  it("no longer reaches the bespoke pickers", () => {
    expect(src).not.toMatch(/hierarchy-selection|ShortcutScopePicker"|AgentAppHierarchyCascade"/);
  });
  if (surfaceA) {
    it("writes the active context through the Surface-A adapter", () => {
      expect(src).toContain(`from "${ACTIVE}"`);
    });
  }
});

it("the bespoke files are gone", () => {
  for (const rel of [
    "features/agent-context/components/hierarchy-selection/HierarchyCascade.tsx",
    "features/agent-context/components/hierarchy-selection/HierarchyPills.tsx",
    "features/agent-context/components/hierarchy-selection/HierarchyTree.tsx",
    "features/agent-context/components/hierarchy-selection/useHierarchySelection.ts",
    "features/agent-context/components/hierarchy-selection/useReduxBridge.ts",
    "features/agent-apps/components/inputs/AgentAppHierarchyCascade.tsx",
    "features/agent-shortcuts/components/ShortcutScopePicker.tsx",
    "features/agent-context/redux/scope/scopeAssignmentsSlice.ts",
    "features/agent-context/redux/scope/selectors.ts",
  ]) {
    expect(existsSync(join(ROOT, rel))).toBe(false);
  }
});
