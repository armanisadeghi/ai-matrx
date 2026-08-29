import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { DiffNode, ViewMode } from "@ai-matrx/diff/structural";

export interface EnrichmentContext {
  resolveModelId: (id: string) => string | undefined;
  resolveToolId: (id: string) => string | undefined;
  resolveMcpServerId: (id: string) => string | undefined;
}

export interface FieldDiffProps {
  node: DiffNode;
  viewMode: ViewMode;
  enrichment?: EnrichmentContext;
  oldLabel?: string;
  newLabel?: string;
}

export interface FieldAdapter {
  label: string;
  icon?: LucideIcon;
  renderDiff: ComponentType<FieldDiffProps>;
  toSummaryText?: (node: DiffNode, ctx?: EnrichmentContext) => string;
  toDisplayText?: (value: unknown, ctx?: EnrichmentContext) => string;
}

export interface AdapterRegistry {
  register: (fieldPath: string, adapter: FieldAdapter) => void;
  get: (fieldPath: string) => FieldAdapter | undefined;
  getAll: () => Map<string, FieldAdapter>;
}
