/**
 * Types for the Dynamic Tool UI Components system.
 *
 * This system allows tool renderers to be stored in the database and
 * compiled at runtime, so new tool UIs can be added without code deploys.
 *
 * Dynamic components consume the same canonical contract as hardcoded
 * renderers: { entry: ToolLifecycleEntry, events?: ToolEventPayload[], ... }
 */

import type { Database } from "@/types/database.types";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import type { ToolEventPayload } from "@/types/python-generated/stream-events";

// ---------------------------------------------------------------------------
// Database row types
// ---------------------------------------------------------------------------

export type ToolUiComponentRow =
    Database["public"]["Tables"]["tool_ui"]["Row"];

export type ToolUiIncidentRow =
    Database["public"]["Tables"]["tool_ui_incident"]["Row"];

// ---------------------------------------------------------------------------
// Enums / unions
// ---------------------------------------------------------------------------

export type ComponentSlot =
    | "inline"
    | "overlay"
    | "header_extras"
    | "header_subtitle"
    | "utility"
    | "fetch";

export type IncidentErrorType =
    | "compilation"
    | "runtime"
    | "fetch"
    | "timeout"
    | "unknown";

/** Contract version for stored components.  v1 = legacy ToolCallObject-based.
 *  v2 = canonical ToolLifecycleEntry + ToolEventPayload. */
export type ContractVersion = 1 | 2;

// ---------------------------------------------------------------------------
// Compiled component types
// ---------------------------------------------------------------------------

export interface CompiledToolRenderer {
    toolName: string;
    displayName: string;
    resultsLabel: string | null;
    keepExpandedOnStream: boolean;
    version: string;
    componentId: string;
    contractVersion: ContractVersion;

    InlineComponent: React.ComponentType<DynamicRendererProps>;

    OverlayComponent: React.ComponentType<DynamicRendererProps> | null;

    getHeaderExtras:
        | ((entry: ToolLifecycleEntry, events?: ToolEventPayload[]) => React.ReactNode)
        | null;

    getHeaderSubtitle:
        | ((entry: ToolLifecycleEntry, events?: ToolEventPayload[]) => string | null)
        | null;
}

/**
 * Props passed to dynamically compiled components.
 *
 * Mirrors ToolRendererProps exactly. Kept as a separate type so the compiler
 * layer doesn't have a structural dependency on features/ folders.
 */
export interface DynamicRendererProps {
    entry: ToolLifecycleEntry;
    events?: ToolEventPayload[];
    onOpenOverlay?: (initialTab?: string) => void;
    toolGroupId?: string;
    isPersisted?: boolean;
}

// ---------------------------------------------------------------------------
// Cache types
// ---------------------------------------------------------------------------

export interface CacheEntry {
    compiled: CompiledToolRenderer;
    fetchedAt: number;
    version: string;
}

// ---------------------------------------------------------------------------
// Incident reporting payload
// ---------------------------------------------------------------------------

export interface IncidentPayload {
    tool_name: string;
    component_id?: string;
    component_type: ComponentSlot;
    error_type: IncidentErrorType;
    error_message: string;
    error_stack?: string;
    tool_update_snapshot?: unknown;
    component_version?: string;
    session_id?: string;
}
