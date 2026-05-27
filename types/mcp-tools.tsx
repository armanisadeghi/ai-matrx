// Tool type definition

export interface Tool {
    id: string;           // The actual tool identifier used for tool calls (from database 'name' field)
    name: string;         // Same as id for backward compatibility
    displayName: string;  // Human-readable name for display (formatted from tool identifier)
    description: string;
    category: string;
    icon: React.ReactNode;
}

// Extended interface for database tools (includes additional fields from database)
// NOTE: The canonical `DatabaseTool` lives in `utils/supabase/tools-service.ts`
// (derived from `Database["public"]["Tables"]["tool_def"]["Row"]`). This local
// copy is retained for historical callers that imported from `@/types/mcp-tools`.
export interface DatabaseTool {
    id: string;
    name: string;
    description: string;
    parameters: any;
    output_schema?: any;
    annotations?: any[];
    category?: string;
    tags?: string[];
    icon?: string;
    is_active?: boolean;
    version?: string;
    source_kind?: "native" | "mcp_discovered" | "admin_authored" | "agent_authored";
    managed_by_server_id?: string | null;
    created_at?: string;
    updated_at?: string;
}

