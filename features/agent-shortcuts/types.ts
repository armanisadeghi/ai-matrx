import type { AgentShortcut } from "@/features/agents/redux/agent-shortcuts/types";
import type { AgentShortcutCategoryDef } from "@/features/agents/redux/agent-shortcut-categories/types";
import type { AgentContentBlockDef } from "@/features/agent-connections/redux/skl/content-block-compat";
import type { AgentScope, PlacementType, ScopeLevel } from "./constants";
import type { ShortcutContext } from "@/features/agents/utils/shortcut-context-utils";

export type {
  AgentShortcut,
  AgentShortcutRecord,
} from "@/features/agents/redux/agent-shortcuts/types";

export type {
  AgentShortcutCategoryDef,
  AgentShortcutCategoryRecord,
} from "@/features/agents/redux/agent-shortcut-categories/types";

// Content blocks are canonical `skill.render_definition` rows (skl slice).
export type {
  AgentContentBlockDef,
  AgentContentBlockRecord,
} from "@/features/agent-connections/redux/skl/content-block-compat";

export type { AgentScope, PlacementType, ScopeLevel } from "./constants";

export type AgentShortcutCategory = AgentShortcutCategoryDef;
export type AgentContentBlock = AgentContentBlockDef;

export interface ScopeProps {
  scope: AgentScope;
  scopeId?: string;
}

export interface CategoryFormData {
  label: string;
  placementType: PlacementType;
  parentCategoryId: string | null;
  description: string;
  iconName: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
  enabledFeatures: ShortcutContext[];
  metadata: Record<string, unknown>;
}

export type ShortcutFormData = Omit<
  AgentShortcut,
  "id" | "createdAt" | "updatedAt"
>;

export interface ScopeValidationResult {
  isValid: boolean;
  error?: string;
}
