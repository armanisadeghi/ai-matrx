/**
 * toolsGridTiles.ts
 *
 * Declarative configuration for the Tools-grid tiles in the shell sidebar.
 *
 * Each tile references a registered overlayId and supplies the grid-facing
 * presentation (label / icon / category / admin-gate / optional seed data and
 * instance strategy). Replaces the ~570 lines of hand-written JSX that used
 * to live inside `SidebarWindowToggle.tsx`.
 *
 * Order within a category determines render order. Moving a tile → re-order
 * here. Adding a new tile for a registered overlay → one entry here.
 *
 * This file is the single source of truth for "what appears in the Tools
 * grid" — it does NOT duplicate any registry data (label is usually pulled
 * from the registry unless overridden for a tile-specific name).
 *
 * **Agent-family tiles:** each `label` should match the `label` on the
 * matching entry in `features/window-panels/registry/windowRegistry.ts`
 * (same `overlayId`). New grid-only entries are suffixed with ` (new)`.
 */
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AppWindow,
  ArrowUp,
  AudioLines,
  BookMarked,
  SquareStack,
  Box,
  Boxes,
  Brackets,
  Brain,
  Bug,
  BugPlay,
  Building2,
  CheckSquare,
  Clapperboard,
  Cpu,
  Crop,
  Crown,
  Database,
  DoorOpen,
  FileCode2,
  FileJson,
  FileScan,
  FileStack,
  FolderSearch,
  Frame,
  GalleryHorizontalEnd,
  Globe,
  History,
  KeyRound,
  LayoutDashboard,
  Layers,
  List,
  ListFilter,
  Mail,
  MessageCircle,
  MessageSquare,
  Mic,
  Milestone,
  Minimize2,
  MonitorPlay,
  Network,
  Newspaper,
  Orbit,
  PanelRight,
  Radio,
  Captions,
  ScrollText,
  Search,
  Settings,
  Share2,
  Shrink,
  SlidersHorizontal,
  CircleDot,
  StickyNote,
  TestTube2,
  ToyBrick,
  Upload,
  Zap,
} from "lucide-react";

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { selectActiveAgentId } from "@/lib/redux/slices/agent-settings/selectors";
import { selectOwnedAgentIds } from "@/lib/redux/slices/agentCacheSlice";
import type { OverlayId } from "@/features/window-panels/registry/overlay-ids";
import { DEFAULT_NEW_CHAT_AGENT_ID } from "@/features/agents/components/chat/chat-quick-actions.config";

/**
 * Grid-tab buckets. "admin" is gated on `isAdmin`; the rest show for every
 * authenticated user. Ordered here for display order in the tab.
 */
export type ToolsCategory =
  | "voice"
  | "notes"
  | "content"
  | "agents"
  | "files-web"
  | "general"
  | "creator"
  | "admin";

export const TOOLS_CATEGORIES: ReadonlyArray<{
  id: ToolsCategory;
  label: string;
  gate?: "admin" | "creator";
}> = [
  { id: "voice", label: "Voice" },
  { id: "notes", label: "Notes" },
  { id: "content", label: "Content" },
  { id: "agents", label: "Agents" },
  { id: "files-web", label: "Files & Web" },
  { id: "general", label: "General" },
  { id: "creator", label: "Creator", gate: "creator" },
  { id: "admin", label: "Admin", gate: "admin" },
];

/**
 * Context passed to each tile's optional `seedData` / `onActivate` callback.
 * Keeps the tile callbacks pure (no useSelector/useDispatch churn per tile)
 * while still giving them access to store + dispatch + router.
 */
export interface TileContext {
  dispatch: AppDispatch;
  getState: () => RootState;
  router: { push: (path: string) => void };
}

/** Seeds `agentId` from the in-editor active agent or the first owned agent. */
function seedAgentId(ctx: TileContext): { agentId: string } | undefined {
  const state = ctx.getState();
  const id =
    selectActiveAgentId(state) ?? selectOwnedAgentIds(state)[0] ?? null;
  return id ? { agentId: id } : undefined;
}

/** Same as `seedAgentId` for overlays whose data uses `initialAgentId`. */
function seedInitialAgentId(
  ctx: TileContext,
): { initialAgentId: string } | undefined {
  const state = ctx.getState();
  const id =
    selectActiveAgentId(state) ?? selectOwnedAgentIds(state)[0] ?? null;
  return id ? { initialAgentId: id } : undefined;
}

/** Default agent for the Chat window panel — mirrors `/chat/new`. */
function seedDefaultChatWindowAgent(): {
  initialAgentId: string;
  initialSelectedConversationId: null;
} {
  return {
    initialAgentId: DEFAULT_NEW_CHAT_AGENT_ID,
    initialSelectedConversationId: null,
  };
}

export interface ToolsGridTile {
  /** Stable id for React keys + analytics. */
  id: string;
  /** Display label on the tile. */
  label: string;
  /** Lucide icon component. */
  icon: LucideIcon;
  /** Category bucket. */
  category: ToolsCategory;
  /** Visibility gate. Default: shown to everyone in the category's audience. */
  gate?: "admin" | "creator";
  /**
   * EITHER declarative (overlayId + optional seedData + instanceStrategy) —
   * covers ~95% of tiles.
   */
  overlayId?: OverlayId;
  /**
   * Instance strategy for multi-instance overlays.
   *   "singleton-default" — use instanceId "default" (shared / pinned tile).
   *   "fresh-per-click"   — generate a unique instanceId each click.
   * Default: "singleton-default" for singleton overlays, "fresh-per-click"
   * for multi overlays (auto-detected from registry).
   */
  instanceStrategy?: "singleton-default" | "fresh-per-click";
  /** Optional data seed for the openOverlay payload. */
  seedData?: (ctx: TileContext) => Record<string, unknown> | undefined;
  /**
   * OR imperative — escape hatch for tiles that don't open an overlay
   * (e.g. "Image Studio" routes to /image-studio).
   */
  onActivate?: (ctx: TileContext) => void;
}

/**
 * Default boilerplate source for Code Editor / Smart Multi-file tiles.
 * Matches what the legacy SidebarWindowToggle seeded on click — moving the
 * large string literals out of the component file.
 */
const CODE_EDITOR_DEMO_FILES = [
  {
    name: "index.tsx",
    path: "src/index.tsx",
    language: "typescript",
    content:
      'import React from "react";\n\nexport default function App() {\n  return (\n    <div className="flex items-center justify-center h-dvh">\n      <h1 className="text-2xl font-bold">Hello, World!</h1>\n    </div>\n  );\n}\n',
  },
  {
    name: "styles.css",
    path: "src/styles.css",
    language: "css",
    content:
      "/* Global styles */\nbody {\n  margin: 0;\n  font-family: system-ui, sans-serif;\n}\n",
  },
  {
    name: "README.md",
    path: "README.md",
    language: "markdown",
    content:
      "# My Project\n\nA sample project.\n\n## Getting Started\n\n```bash\nnpm install\nnpm start\n```\n",
  },
];

const SMART_CODE_EDITOR_STARTER =
  '// Start typing, then ask the agent to refactor.\n\nasync function getUser(id) {\n  const res = await fetch("/api/users/" + id);\n  return res.json();\n}\n';

// Default agent for Smart Code Editor tiles — the legacy "Code Editor"
// builtin-prompt clone. Seeds `current_code` so the tile is fireable with
// no extra wiring.
const SMART_CODE_EDITOR_DEFAULT_AGENT_ID =
  "55cc4ad1-bafd-4b82-af0b-4b4f40406ca3";

export const TOOLS_GRID_TILES: ReadonlyArray<ToolsGridTile> = [
  // ── Voice ──────────────────────────────────────────────────────────────
  {
    id: "tile.ai-voice",
    label: "AI Voice",
    icon: Mic,
    category: "voice",
    overlayId: "aiVoiceWindow",
  },
  {
    id: "tile.transcription-cleanup",
    label: "Transcription Cleanup",
    icon: CircleDot,
    category: "voice",
    overlayId: "transcriptionCleanup",
  },
  {
    id: "tile.voice-pad-advanced",
    label: "Advanced Voice Pad",
    icon: AudioLines,
    category: "voice",
    overlayId: "voicePadAdvanced",
  },
  {
    id: "tile.voice-pad",
    label: "Voice Pad",
    icon: AudioLines,
    category: "voice",
    overlayId: "voicePad",
  },
  {
    id: "tile.transcript-studio",
    label: "Transcript Studio",
    icon: Captions,
    category: "voice",
    overlayId: "transcriptStudioWindow",
  },

  // ── Notes ──────────────────────────────────────────────────────────────
  {
    // Pins a default instance of the Notes window so it behaves
    // like a singleton home-notes surface.
    id: "tile.notes-pinned",
    label: "Notes",
    icon: StickyNote,
    category: "notes",
    overlayId: "notesWindow",
    instanceStrategy: "singleton-default",
    seedData: () => ({ title: "Notes" }),
  },

  // ── Content ────────────────────────────────────────────────────────────
  {
    id: "tile.code-editor",
    label: "Code Editor",
    icon: FileCode2,
    category: "content",
    overlayId: "codeEditorWindow",
    instanceStrategy: "fresh-per-click",
    seedData: () => ({
      title: "Code Editor",
      files: CODE_EDITOR_DEMO_FILES,
    }),
  },
  {
    id: "tile.smart-code-editor",
    label: "Smart Code Editor",
    icon: CircleDot,
    category: "content",
    overlayId: "smartCodeEditorWindow",
    instanceStrategy: "fresh-per-click",
    seedData: () => ({
      agentId: SMART_CODE_EDITOR_DEFAULT_AGENT_ID,
      language: "typescript",
      initialCode: SMART_CODE_EDITOR_STARTER,
      title: "Smart Code Editor",
      variables: { current_code: SMART_CODE_EDITOR_STARTER },
    }),
  },
  {
    id: "tile.smart-multi-file",
    label: "Smart Multi-file",
    icon: CircleDot,
    category: "content",
    overlayId: "multiFileSmartCodeEditorWindow",
    instanceStrategy: "fresh-per-click",
    seedData: () => ({
      agentId: SMART_CODE_EDITOR_DEFAULT_AGENT_ID,
      title: "Smart Multi-file Editor",
      files: CODE_EDITOR_DEMO_FILES,
    }),
  },
  {
    id: "tile.code-files",
    label: "Code Files",
    icon: FolderSearch,
    category: "content",
    overlayId: "codeFileManagerWindow",
    instanceStrategy: "fresh-per-click",
  },
  {
    id: "tile.content-editor",
    label: "Content Editor",
    icon: FileCode2,
    category: "content",
    overlayId: "contentEditorWindow",
    instanceStrategy: "fresh-per-click",
    seedData: () => ({
      documentId: "scratch",
      documentTitle: "Scratch",
      initialValue: "",
    }),
  },
  {
    id: "tile.content-list",
    label: "Content List",
    icon: FileStack,
    category: "content",
    overlayId: "contentEditorListWindow",
    instanceStrategy: "fresh-per-click",
    seedData: () => ({ documents: [] }),
  },
  {
    id: "tile.content-workspace",
    label: "Content Workspace",
    icon: Layers,
    category: "content",
    overlayId: "contentEditorWorkspaceWindow",
    instanceStrategy: "fresh-per-click",
    seedData: () => ({ documents: [], openDocumentIds: [] }),
  },
  {
    id: "tile.markdown",
    label: "Markdown",
    icon: FileCode2,
    category: "content",
    overlayId: "markdownEditorWindow",
    seedData: () => ({ instanceId: "default" }),
  },

  // ── Agents (labels match windowRegistry `label` for each overlayId) ───
  {
    id: "tile.agent-run",
    label: "Chat",
    icon: MessageSquare,
    category: "agents",
    overlayId: "agentRunWindow",
    seedData: () => seedDefaultChatWindowAgent(),
  },
  {
    id: "tile.agent-advanced-editor",
    label: "Agent Advanced Editor",
    icon: Brackets,
    category: "agents",
    overlayId: "agentAdvancedEditorWindow",
    seedData: (ctx) => seedInitialAgentId(ctx),
  },
  {
    id: "tile.agent-settings",
    label: "Agent Settings",
    icon: SlidersHorizontal,
    category: "agents",
    overlayId: "agentSettingsWindow",
  },
  {
    id: "tile.agent-run-history",
    label: "Run History",
    icon: History,
    category: "agents",
    overlayId: "agentRunHistoryWindow",
  },
  {
    id: "tile.agent-import",
    label: "Import Agent",
    icon: Upload,
    category: "agents",
    overlayId: "agentImportWindow",
  },
  {
    id: "tile.agent-connections",
    label: "Agent Connections",
    icon: Network,
    category: "agents",
    overlayId: "agentConnectionsWindow",
  },
  {
    id: "tile.ai-results",
    label: "Chat History",
    icon: Zap,
    category: "agents",
    overlayId: "quickChatHistory",
  },
  {
    id: "tile.agent-optimizer",
    label: "Matrx Agent Optimizer (new)",
    icon: CircleDot,
    category: "agents",
    overlayId: "agentOptimizerWindow",
    seedData: (ctx) => seedAgentId(ctx),
  },
  {
    id: "tile.agent-interface-variations",
    label: "Interface Variations (new)",
    icon: AppWindow,
    category: "agents",
    overlayId: "agentInterfaceVariationsWindow",
    seedData: (ctx) => seedAgentId(ctx),
  },
  {
    id: "tile.agent-create-app",
    label: "Create Agent App (new)",
    icon: Clapperboard,
    category: "agents",
    overlayId: "agentCreateAppWindow",
    seedData: (ctx) => seedAgentId(ctx),
  },
  {
    id: "tile.agent-data-storage",
    label: "Data Storage Support (new)",
    icon: Boxes,
    category: "agents",
    overlayId: "agentDataStorageWindow",
    seedData: (ctx) => seedAgentId(ctx),
  },
  {
    id: "tile.agent-find-usages",
    label: "Find Usages (new)",
    icon: Search,
    category: "agents",
    overlayId: "agentFindUsagesWindow",
    seedData: (ctx) => seedAgentId(ctx),
  },
  {
    id: "tile.agent-convert-system",
    label: "Convert to System Agent (new)",
    icon: DoorOpen,
    category: "agents",
    overlayId: "agentConvertSystemWindow",
    seedData: (ctx) => seedAgentId(ctx),
  },
  {
    id: "tile.agent-gate",
    label: "Agent Gate (new)",
    icon: Milestone,
    category: "agents",
    overlayId: "agentGateWindow",
  },

  // ── Files & Web ────────────────────────────────────────────────────────
  {
    // Repoints the legacy "quick-files" tile at the new cloud-files window
    // registered in Phase 6. The legacy `quickFilesWindow` overlay id was
    // removed in Phase 11.
    id: "tile.quick-files",
    label: "Files",
    icon: FolderSearch,
    category: "files-web",
    overlayId: "cloudFilesWindow",
  },
  {
    id: "tile.gallery",
    label: "Gallery",
    icon: GalleryHorizontalEnd,
    category: "files-web",
    overlayId: "galleryWindow",
  },
  {
    id: "tile.pdf-extractor",
    label: "PDF Extractor",
    icon: FileScan,
    category: "files-web",
    overlayId: "pdfExtractorWindow",
  },
  {
    id: "tile.site-frame",
    label: "Site Frame",
    icon: Frame,
    category: "files-web",
    overlayId: "browserFrameWindow",
    seedData: () => ({
      url: "https://lucide.dev/icons/",
      windowTitle: "Lucide",
    }),
  },
  {
    id: "tile.site-workbench",
    label: "Site Workbench",
    icon: BookMarked,
    category: "files-web",
    overlayId: "browserWorkbenchWindow",
  },
  {
    // The legacy `fileUploadWindow` was removed in Phase 11. Upload now
    // happens inside the main Cloud Files window via the dropzone, so this
    // tile opens the same window as `tile.quick-files`.
    id: "tile.file-upload",
    label: "Upload",
    icon: ArrowUp,
    category: "files-web",
    overlayId: "cloudFilesWindow",
  },
  {
    // Route-navigation tile — escapes the overlay model entirely.
    id: "tile.image-studio",
    label: "Images",
    icon: Zap,
    category: "files-web",
    onActivate: ({ router }) => router.push("/images"),
  },
  {
    id: "tile.crop-studio",
    label: "Crop Studio",
    icon: Crop,
    category: "files-web",
    overlayId: "cropStudioWindow",
  },
  {
    id: "tile.scraper",
    label: "Web Scraper",
    icon: Globe,
    category: "files-web",
    overlayId: "scraperWindow",
  },

  // ── General ────────────────────────────────────────────────────────────
  {
    id: "tile.canvas-viewer",
    label: "Canvas Viewer",
    icon: MonitorPlay,
    category: "general",
    overlayId: "canvasViewerWindow",
  },
  {
    id: "tile.context-switcher",
    label: "Context Switcher",
    icon: Layers,
    category: "general",
    overlayId: "contextSwitcherWindow",
  },
  {
    id: "tile.quick-data",
    label: "Data Tables",
    icon: Database,
    category: "general",
    overlayId: "quickDataWindow",
  },
  {
    id: "tile.email",
    label: "Email",
    icon: Mail,
    category: "general",
    overlayId: "emailDialogWindow",
  },
  {
    id: "tile.feedback",
    label: "Feedback",
    icon: MessageSquare,
    category: "general",
    overlayId: "feedbackDialog",
  },
  {
    id: "tile.messages",
    label: "Messages",
    icon: MessageSquare,
    category: "general",
    overlayId: "messagesWindow",
  },
  {
    id: "tile.json-truncator",
    label: "JSON Truncator",
    icon: FileJson,
    category: "general",
    overlayId: "jsonTruncator",
  },
  {
    id: "tile.list-manager",
    label: "List Manager",
    icon: ListFilter,
    category: "general",
    overlayId: "listManagerWindow",
  },
  {
    id: "tile.new-organization",
    label: "New Organization",
    icon: Building2,
    category: "general",
    overlayId: "hierarchyCreationWindow",
    seedData: () => ({ entityType: "organization" }),
  },
  {
    id: "tile.news",
    label: "News",
    icon: Newspaper,
    category: "general",
    overlayId: "newsWindow",
  },
  {
    id: "tile.preferences",
    label: "Preferences",
    icon: Settings,
    category: "general",
    overlayId: "userPreferencesWindow",
  },
  {
    id: "tile.share-modal",
    label: "Share Modal",
    icon: Share2,
    category: "general",
    overlayId: "shareModalWindow",
    seedData: () => ({ resourceType: "note" }),
  },
  {
    id: "tile.quick-tasks",
    label: "Tasks",
    icon: CheckSquare,
    category: "general",
    overlayId: "quickTasksWindow",
  },

  // ── Creator ──────────────────────────────────────────────────────────────
  {
    id: "tile.creator-hub",
    label: "Creator Hub",
    icon: Crown,
    category: "creator",
    gate: "creator",
    overlayId: "creatorHub",
  },

  // ── Admin (incl. agent debug / widgets — labels match windowRegistry) ──
  {
    id: "tile.agent-debug",
    label: "Agent Debug",
    icon: BugPlay,
    category: "admin",
    gate: "admin",
    overlayId: "agentDebugWindow",
    seedData: (ctx) => seedInitialAgentId(ctx),
  },
  {
    id: "tile.memory-inspector",
    label: "Memory Inspector",
    icon: Brain,
    category: "admin",
    gate: "admin",
    overlayId: "observationalMemoryWindow",
  },
  {
    id: "tile.create-shortcut",
    label: "Create Shortcut (new)",
    icon: KeyRound,
    category: "admin",
    gate: "admin",
    overlayId: "agentAdminShortcutWindow",
    seedData: (ctx) => seedAgentId(ctx),
  },
  {
    id: "tile.find-usages-admin",
    label: "Find Usages (Admin) (new)",
    icon: Search,
    category: "admin",
    gate: "admin",
    overlayId: "agentAdminFindUsagesWindow",
    seedData: (ctx) => seedAgentId(ctx),
  },
  {
    id: "tile.message-analysis",
    label: "Response Analysis (new)",
    icon: TestTube2,
    category: "admin",
    gate: "admin",
    overlayId: "messageAnalysisWindow",
  },
  {
    id: "tile.ui-state",
    label: "Instance UI State",
    icon: LayoutDashboard,
    category: "admin",
    gate: "admin",
    overlayId: "instanceUIStateWindow",
  },
  {
    id: "tile.exec-inspector",
    label: "Execution Inspector",
    icon: Cpu,
    category: "admin",
    gate: "admin",
    overlayId: "executionInspectorWindow",
  },
  {
    id: "tile.state-analyzer",
    label: "State Analyzer",
    icon: Activity,
    category: "admin",
    gate: "admin",
    overlayId: "adminStateAnalyzerWindow",
  },
  {
    id: "tile.stream-debug",
    label: "Stream Debug",
    icon: Bug,
    category: "admin",
    gate: "admin",
    overlayId: "streamDebug",
    seedData: () => ({ conversationId: "default" }),
  },
  {
    id: "tile.stream-history",
    label: "Stream History",
    icon: List,
    category: "admin",
    gate: "admin",
    overlayId: "streamDebugHistoryWindow",
    seedData: () => ({ initialConversationId: null }),
  },
  {
    id: "tile.md-debug",
    label: "MD Debug",
    icon: ScrollText,
    category: "admin",
    gate: "admin",
    overlayId: "agentAssistantMarkdownDebugWindow",
  },
  {
    id: "tile.undo-history",
    label: "Undo History (new)",
    icon: History,
    category: "admin",
    gate: "admin",
    overlayId: "undoHistory",
  },
  {
    id: "tile.agent-full-modal",
    label: "Agent (full modal) (new)",
    icon: AppWindow,
    category: "admin",
    gate: "admin",
    overlayId: "agentFullModal",
  },
  {
    id: "tile.agent-compact-modal",
    label: "Agent (compact) (new)",
    icon: Shrink,
    category: "admin",
    gate: "admin",
    overlayId: "agentCompactModal",
  },
  {
    id: "tile.agent-chat-bubble",
    label: "Agent Chat Bubble (new)",
    icon: MessageCircle,
    category: "admin",
    gate: "admin",
    overlayId: "agentChatBubble",
  },
  {
    id: "tile.agent-inline-overlay",
    label: "Agent (inline) (new)",
    icon: Box,
    category: "admin",
    gate: "admin",
    overlayId: "agentInlineOverlay",
  },
  {
    id: "tile.agent-sidebar-overlay",
    label: "Agent (sidebar) (new)",
    icon: PanelRight,
    category: "admin",
    gate: "admin",
    overlayId: "agentSidebarOverlay",
  },
  {
    id: "tile.agent-flexible-panel",
    label: "Agent (flexible) (new)",
    icon: Orbit,
    category: "admin",
    gate: "admin",
    overlayId: "agentFlexiblePanel",
  },
  {
    id: "tile.agent-panel-overlay",
    label: "Agent (panel) (new)",
    icon: ToyBrick,
    category: "admin",
    gate: "admin",
    overlayId: "agentPanelOverlay",
  },
  {
    id: "tile.agent-toast-overlay",
    label: "Agent (toast) (new)",
    icon: Radio,
    category: "admin",
    gate: "admin",
    overlayId: "agentToastOverlay",
  },
  {
    id: "tile.agent-floating-chat",
    label: "Agent (floating chat) (new)",
    icon: MessageSquare,
    category: "admin",
    gate: "admin",
    overlayId: "agentFloatingChat",
  },
  {
    id: "tile.agent-chat-collapsible",
    label: "Agent Chat (collapsible) (new)",
    icon: Minimize2,
    category: "admin",
    gate: "admin",
    overlayId: "agentChatCollapsible",
  },
  {
    id: "tile.agent-chat-assistant",
    label: "Agent Chat Assistant (new)",
    icon: SquareStack,
    category: "admin",
    gate: "admin",
    overlayId: "agentChatAssistant",
  },
];
