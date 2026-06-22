// app/(core)/tool-call-visualization/admin/page.tsx
//
// Per-feature admin map for Tool Call Visualization. Renders via the platform
// primitive <FeatureAdminPage> (super-admin gated, utilitarian). The config
// below is the single index for everything the feature owns — the canonical
// shell, the field library, the generic renderer, the DB-loaded renderer path,
// the authoring kit (skill + agent + admin editor), demos, and the API routes.
// When you add a route / renderer / API / demo, update this file.

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const TOOL_VIZ_ADMIN_MAP: FeatureAdminMap = {
  name: "Tool Call Visualization",
  slug: "tool-call-visualization",
  description:
    "The UI that renders what an agent's tools are doing — a collapsed transcript line that expands into a type-aware, themed view (never a raw JSON dump). One canonical shell; resolution is in-code registry → DB-loaded renderer (agent-authored code in tool_ui, compiled at runtime) → the type-aware GenericRenderer fallback (~97% of tools). Long-term most renderers load from the DB, not the codebase. Authored by the create-tool-renderer skill, the 'Tool Renderer Author' AI Matrx agent, or the admin editor.",
  docs: [
    { label: "FEATURE.md", href: "/features/tool-call-visualization/FEATURE.md" },
    { label: "Renderer status (by stage)", href: "/features/tool-call-visualization/RENDERER_STATUS.md" },
    { label: "Overhaul status / roadmap", href: "/features/tool-call-visualization/OVERHAUL_STATUS.md" },
    { label: "create-tool-renderer skill", href: "/.cursor/skills/create-tool-renderer/SKILL.md" },
  ],

  routes: [
    {
      url: "/administration/mcp-tools",
      label: "MCP Tools admin",
      description: "Browse every tool definition; jump to a tool's renderer editor, test samples, and render incidents.",
      filePath: "app/(admin)/administration/mcp-tools",
      status: "Live",
    },
    {
      url: "/administration/mcp-tools/[toolId]/ui",
      label: "Renderer editor (authoring)",
      description: "Author a tool's DB renderer: Generate (AI) / Edit Code / Preview-against-fixtures tabs. Saves to tool_ui on the canonical surface.",
      filePath: "features/tool-call-visualization/admin/mcp-tools/ToolUiPage.tsx",
      status: "Live",
      notes: [
        "Generate tab uses the 629-line contract prompt",
        "Preview tab renders against tool_test_sample fixtures",
        "Saves via POST /api/admin/tool-ui-components",
      ],
    },
  ],

  demoRoutes: [
    {
      url: "/demos/tool-viz/result-fields",
      label: "Field library + DB renderer gallery",
      description: "Every result shape through the field library + the generic renderer + all DB-loaded renderers + a live stream simulator.",
      filePath: "app/(dev)/demos/tool-viz/result-fields/page.dev.tsx",
      status: "Demo only",
    },
    {
      url: "/demos/tool-viz/in-action",
      label: "Tool in action (simulated turn + real runs)",
      description: "Pick a tool → watch a realistic assistant turn (write → tool call → write), or load the tool's REAL saved cx_tool_call runs.",
      filePath: "app/(dev)/demos/tool-viz/in-action/page.dev.tsx",
      status: "Demo only",
    },
  ],

  components: [
    {
      name: "ToolCallVisualization (canonical shell)",
      filePath: "features/tool-call-visualization/components/ToolCallVisualization.tsx",
      description: "The single shell every tool renders through — collapsed verb-phrase line, 3-layer collapse (auto / stay-open / never-open), self-describing label+subtitle, overlay + window buttons.",
      status: "Live",
    },
    {
      name: "ToolCallBatch",
      filePath: "features/tool-call-visualization/components/ToolCallBatch.tsx",
      description: "Folds a run of ≥2 consecutive tool calls into one expandable line that reveals the normal cards flat below.",
      status: "Live",
    },
    {
      name: "GenericRenderer + result-fields library",
      filePath: "features/tool-call-visualization/result-fields/ResultValue.tsx",
      description: "Type-aware fallback for any unregistered tool: shape detection → table / key-value / markdown / durable media / json tree / url chips / scalar / UUID / empty / error.",
      status: "Live",
      tier: "candidate",
    },
    {
      name: "DB renderer runtime (db-renderer/)",
      filePath: "features/tool-call-visualization/db-renderer/DbToolRenderer.tsx",
      description: "Fetches a tool's agent-written code from tool_ui (surface matrx-default/default) and compiles it at runtime via the Agent Apps Babel sandbox; cache + meta (label/subtitle/displayMode) via useDbToolMeta.",
      status: "Live",
    },
    {
      name: "Stream simulator (simulator/)",
      filePath: "features/tool-call-visualization/simulator/useSimulatedToolEntry.ts",
      description: "Replays a realistic StreamRecording into a live-evolving ToolLifecycleEntry — exercises renderers + the shell with no backend. Powers the in-action demo.",
      status: "Live",
    },
    {
      name: "ToolCallWindowPanel",
      filePath: "features/tool-call-visualization/window-panel/ToolCallWindowPanel.tsx",
      description: "The draggable window surface for a request's tool calls (live + snapshot).",
      status: "Live",
    },
    {
      name: "ToolRendererPreview (testing harness)",
      filePath: "features/tool-call-visualization/testing/ToolRendererPreview.tsx",
      description: "Renders a renderer in isolation from captured stream events / fixtures — no live backend.",
      status: "Live",
    },
  ],

  apiRoutes: [
    {
      url: "/api/admin/tool-ui-components",
      method: "Multiple",
      description: "Admin CRUD for tool_ui rows (the DB renderers). POST defaults to the canonical web surface so author → render is coherent.",
      filePath: "app/api/admin/tool-ui-components/route.ts",
    },
    {
      url: "/api/admin/tool-ui-incidents",
      method: "Multiple",
      description: "Render-failure incidents logged from the client error boundaries.",
      filePath: "app/api/admin/tool-ui-incidents/route.ts",
    },
  ],

  relatedFeatures: [
    {
      name: "Agents / Chat",
      description: "The live transcript that hosts tool calls (AgentConversationDisplay → EnhancedChatMarkdown → InlineToolCard/DbToolCard → this shell).",
    },
    {
      name: "Agent Apps",
      description: "Owns compileSlotComponent — the Babel sandbox the DB renderer runtime reuses to run agent-written code.",
    },
  ],
};

export default function ToolCallVisualizationAdminPage() {
  return <FeatureAdminPage map={TOOL_VIZ_ADMIN_MAP} />;
}
