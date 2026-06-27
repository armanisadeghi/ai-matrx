// utils/supabase/tools-service.ts

import type { Database } from "@/types/database.types";
import { buildSearchOr } from "@/utils/supabase-search";
import { createClient } from "./client";

// Source of truth: the DB row. Any schema change surfaces here automatically.
export type DatabaseTool = Database["tool"]["Tables"]["definition"]["Row"];

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: React.ReactNode;
}

/**
 * Client-side service for fetching tools
 */
export class ToolsService {
  private supabase;

  constructor() {
    this.supabase = createClient();
  }

  /**
   * Fetch all active tools from the database
   */
  async fetchTools(): Promise<DatabaseTool[]> {
    try {
      const { data, error } = await this.supabase
        .schema("tool").from("definition")
        .select("*")
        .eq("is_active", true)
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (error) {
        console.error("Error fetching tools:", error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error("Failed to fetch tools:", error);
      throw error;
    }
  }

  /**
   * Fetch tools by category
   */
  async fetchToolsByCategory(category: string): Promise<DatabaseTool[]> {
    try {
      const { data, error } = await this.supabase
        .schema("tool").from("definition")
        .select("*")
        .eq("is_active", true)
        .eq("category", category)
        .order("name", { ascending: true });

      if (error) {
        console.error("Error fetching tools by category:", error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error("Failed to fetch tools by category:", error);
      throw error;
    }
  }

  /**
   * Fetch tools by UUID
   */
  async fetchToolsByIds(toolIds: string[]): Promise<DatabaseTool[]> {
    if (toolIds.length === 0) return [];

    try {
      const { data, error } = await this.supabase
        .schema("tool").from("definition")
        .select("*")
        .in("id", toolIds)
        .eq("is_active", true);

      if (error) {
        console.error("Error fetching tools by identifiers:", error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error("Failed to fetch tools by identifiers:", error);
      throw error;
    }
  }

  /**
   * Fetch tools by UUID including inactive ones — used for diagnosing
   * orphaned tool references (deactivated/replaced tools still on agents).
   */
  async fetchToolsByIdsIncludingInactive(
    toolIds: string[],
  ): Promise<DatabaseTool[]> {
    if (toolIds.length === 0) return [];

    try {
      const { data, error } = await this.supabase
        .schema("tool").from("definition")
        .select("*")
        .in("id", toolIds);

      if (error) {
        console.error(
          "Error fetching tools by identifiers (incl. inactive):",
          error,
        );
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error(
        "Failed to fetch tools by identifiers (incl. inactive):",
        error,
      );
      throw error;
    }
  }

  /**
   * Search tools by name or description
   */
  async searchTools(query: string): Promise<DatabaseTool[]> {
    if (!query.trim()) return this.fetchTools();

    try {
      const { data, error } = await this.supabase
        .schema("tool").from("definition")
        .select("*")
        .eq("is_active", true)
        .or(buildSearchOr(query, ["name", "description"]))
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (error) {
        console.error("Error searching tools:", error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error("Failed to search tools:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const toolsService = new ToolsService();
