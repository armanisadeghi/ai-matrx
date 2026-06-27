// utils/supabase/server-tools-service.ts
// Server-side only - do not import in client components

import { getScriptSupabaseClient } from './getScriptClient';
import { buildSearchOr } from '@/utils/supabase-search';
import { DatabaseTool } from './tools-service';

/**
 * Server-side service for fetching tools (for SSR and API routes)
 */
export class ServerToolsService {
  /**
   * Fetch all active tools from the database (server-side)
   */
  async fetchTools(): Promise<DatabaseTool[]> {
    try {
      const supabase = getScriptSupabaseClient();
      const { data, error } = await supabase
        .schema('tool').from('definition')
        .select('*')
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
  async fetchToolsByCategory(category: string): Promise<DatabaseTool[]> {
    try {
      const supabase = getScriptSupabaseClient();
      const { data, error } = await supabase
        .schema('tool').from('definition')
        .select('*')
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
  async searchTools(query: string): Promise<DatabaseTool[]> {
    if (!query.trim()) return this.fetchTools();

    try {
      const supabase = getScriptSupabaseClient();
      const { data, error } = await supabase
        .schema('tool').from('definition')
        .select('*')
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
  async fetchToolsByIds(toolIdentifiers: string[]): Promise<DatabaseTool[]> {
    if (toolIdentifiers.length === 0) return [];

    try {
      const supabase = getScriptSupabaseClient();
      const { data, error } = await supabase
        .schema('tool').from('definition')
        .select('*')
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
