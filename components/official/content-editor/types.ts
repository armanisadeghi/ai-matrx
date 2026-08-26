// components/content-editor/types.ts

import type { SourceFeature } from "@/features/agents/types/instance.types";
import type { ContentSource } from "@/features/rich-document/types";
import type { ContextMenuEntityRef } from "@/features/context-menu-v3/types";

export type EditorMode =
  "plain" | "wysiwyg" | "markdown" | "matrx-split" | "preview";

export interface HeaderAction {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: (content: string) => void;
}

export interface ContentEditorProps {
  // Content
  value: string;
  onChange: (value: string) => void;

  // Editor modes
  availableModes?: EditorMode[];
  initialMode?: EditorMode;
  mode?: EditorMode; // Controlled mode from parent
  onModeChange?: (mode: EditorMode) => void;

  // Auto-save
  autoSave?: boolean;
  autoSaveDelay?: number;
  onSave?: (content: string) => Promise<void> | void;

  // Collapsible
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  /**
   * How the collapse animates when collapsible is true:
   * - "hide"  (default): content is fully hidden, only the header remains
   * - "fade": content is clipped to `collapsedPreviewHeight` with a bottom
   *   fade-out gradient and a pull-down chevron affordance
   */
  collapseMode?: "hide" | "fade";
  /** Height of the visible preview strip when collapseMode === "fade". */
  collapsedPreviewHeight?: number | string;
  title?: string;

  // Header actions
  headerActions?: HeaderAction[];

  // Built-in features
  showCopyButton?: boolean;
  showContentManager?: boolean;
  onShowHtmlPreview?: (html: string, title?: string) => void;

  // UI
  placeholder?: string;
  showModeSelector?: boolean;
  className?: string;

  // Context menu (v3) — a caller with a real record passes these so
  // Copy-as / Export / Convert / Attach To / Share resolve the actual
  // document instead of rendering an inert menu. Omit `entity` for a
  // scratch/no-record editor; `contentSource` still lights up Export.
  sourceFeature?: SourceFeature;
  surfaceName?: string;
  contentSource?: ContentSource;
  entity?: ContextMenuEntityRef;
}

export interface EditorModeConfig {
  value: EditorMode;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
}
