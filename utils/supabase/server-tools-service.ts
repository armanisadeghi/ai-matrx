// utils/supabase/server-tools-service.ts
// Server-side only - do not import in client components

import { getScriptSupabaseClient } from './getScriptClient';
import { buildSearchOr } from '@/utils/supabase-search';
import { DatabaseTool } from './tools-service';

/**
 * What this service can actually return. Every read here runs as `anon` (the
 * publishable key), which may not read `tool.definition`'s identity or
 * bookkeeping columns at all (DD-186) — so the narrowed shape is a compile-time
 * fact, not a cast that would let a caller reach for a field that is never there.
 */
export type PublicDatabaseTool = Omit<
  DatabaseTool,
  'created_by' | 'updated_by' | 'organization_id' | 'metadata' | 'version'
>;

/**
 * Server-side service for fetching tools (for SSR and API routes)
 */
/**
 * The columns `anon` may read on `tool.definition`. Every read in this file uses
 * the PUBLISHABLE key (getScriptSupabaseClient), so it runs as `anon` and `*` is
 * refused (42501) — and `created_by`, `updated_by`, `organization_id`, `metadata`
 * and `version` are not a tool catalogue's data. Register:
 * lib/security/public-exposure.ts#ANON_COLUMN_SURFACE, kept true to the live
 * grants by `pnpm check:anon-column-surface` (DD-186).
 */
const ANON_TOOL_COLUMNS =
  "id,name,description,parameters,output_schema,annotations,category,tags,icon,semver,admin_only,tier,gating,dedupe_exempt,validation_exempt,source_kind,managed_by_server_id,max_client_wait_seconds,tool_group,is_active,deactivated_at,created_at,updated_at,visibility,deleted_at,updated_by_tier,updated_by_system,side_effect_class";

export class ServerToolsService {
  /**
   * Fetch all active tools from the database (server-side)
   */
  async fetchTools(): Promise<PublicDatabaseTool[]> {
    try {
      const supabase = getScriptSupabaseClient();
      const { data, error } = await supabase
        .schema('tool').from('definition')
        .select(ANON_TOOL_COLUMNS)
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching tools (server):', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to fetch tools (server):', error);
      throw error;
    }
  }

  /**
   * Fetch tools by category (server-side)
   */
  async fetchToolsByCategory(category: string): Promise<PublicDatabaseTool[]> {
    try {
      const supabase = getScriptSupabaseClient();
      const { data, error } = await supabase
        .schema('tool').from('definition')
        .select(ANON_TOOL_COLUMNS)
        .eq('is_active', true)
        .eq('category', category)
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching tools by category (server):', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to fetch tools by category (server):', error);
      throw error;
    }
  }

  /**
   * Search tools by name or description (server-side)
   */
  async searchTools(query: string): Promise<PublicDatabaseTool[]> {
    if (!query.trim()) return this.fetchTools();

    try {
      const supabase = getScriptSupabaseClient();
      const { data, error } = await supabase
        .schema('tool').from('definition')
        .select(ANON_TOOL_COLUMNS)
        .eq('is_active', true)
        .or(buildSearchOr(query, ["name", "description"]))
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (error) {
        console.error('Error searching tools (server):', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to search tools (server):', error);
      throw error;
    }
  }

  /**
   * Fetch tools by tool identifiers (names) (server-side)
   */
  async fetchToolsByIds(toolIdentifiers: string[]): Promise<PublicDatabaseTool[]> {
    if (toolIdentifiers.length === 0) return [];

    try {
      const supabase = getScriptSupabaseClient();
      const { data, error } = await supabase
        .schema('tool').from('definition')
        .select(ANON_TOOL_COLUMNS)
        .in('name', toolIdentifiers)  // Query by 'name' field which contains the tool identifiers
        .eq('is_active', true);

      if (error) {
        console.error('Error fetching tools by identifiers (server):', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to fetch tools by identifiers (server):', error);
      throw error;
    }
  }
}

// Export singleton instance
export const serverToolsService = new ServerToolsService();
