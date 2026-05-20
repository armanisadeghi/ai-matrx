// Original generated type (replaced by patch-db-types.sh):
// export type Json =
//   | string
//   | number
//   | boolean
//   | null
//   | { [key: string]: Json | undefined }
//   | Json[]
export type Json = unknown

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      _schema_migrations: {
        Row: {
          applied_at: string
          checksum: string
          duration_ms: number
          filename: string
          source: string
        }
        Insert: {
          applied_at?: string
          checksum: string
          duration_ms: number
          filename: string
          source: string
        }
        Update: {
          applied_at?: string
          checksum?: string
          duration_ms?: number
          filename?: string
          source?: string
        }
        Relationships: []
      }
      action: {
        Row: {
          id: string
          matrix: string
          name: string
          node_type: string
          reference_id: string
          transformer: string | null
        }
        Insert: {
          id?: string
          matrix: string
          name: string
          node_type: string
          reference_id: string
          transformer?: string | null
        }
        Update: {
          id?: string
          matrix?: string
          name?: string
          node_type?: string
          reference_id?: string
          transformer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_matrix_fkey"
            columns: ["matrix"]
            isOneToOne: false
            referencedRelation: "automation_matrix"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_transformer_fkey"
            columns: ["transformer"]
            isOneToOne: false
            referencedRelation: "transformer"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          target_user_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          target_user_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          target_user_id?: string
        }
        Relationships: []
      }
      admin_email_logs: {
        Row: {
          created_at: string | null
          failed_count: number | null
          id: string
          recipient_count: number
          sent_by: string
          subject: string
          successful_count: number | null
        }
        Insert: {
          created_at?: string | null
          failed_count?: number | null
          id?: string
          recipient_count: number
          sent_by: string
          subject: string
          successful_count?: number | null
        }
        Update: {
          created_at?: string | null
          failed_count?: number | null
          id?: string
          recipient_count?: number
          sent_by?: string
          subject?: string
          successful_count?: number | null
        }
        Relationships: []
      }
      admin_markdown_samples: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          description: string
          detected_blocks: string[]
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          created_by?: string | null
          description?: string
          detected_blocks?: string[]
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          description?: string
          detected_blocks?: string[]
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      admins: {
        Row: {
          created_at: string | null
          level: Database["public"]["Enums"]["admin_level"]
          metadata: Json
          permissions: Json
          user_id: string
        }
        Insert: {
          created_at?: string | null
          level?: Database["public"]["Enums"]["admin_level"]
          metadata?: Json
          permissions?: Json
          user_id: string
        }
        Update: {
          created_at?: string | null
          level?: Database["public"]["Enums"]["admin_level"]
          metadata?: Json
          permissions?: Json
          user_id?: string
        }
        Relationships: []
      }
      aga_apps: {
        Row: {
          agent_id: string
          agent_version_id: string | null
          allowed_imports: Json | null
          app_kind: string
          avg_execution_time_ms: number | null
          category: string | null
          component_code: string
          component_language: string
          created_at: string
          description: string | null
          favicon_url: string | null
          id: string
          is_featured: boolean | null
          is_public: boolean
          is_verified: boolean | null
          last_execution_at: string | null
          layout_config: Json | null
          metadata: Json | null
          name: string
          organization_id: string | null
          pinned_version: number | null
          preview_image_url: string | null
          project_id: string | null
          published_at: string | null
          rate_limit_authenticated: number | null
          rate_limit_per_ip: number | null
          rate_limit_window_hours: number | null
          search_tsv: unknown
          shared_context_slots: Json | null
          shell_config: Json
          shell_kind: string
          slot_code: Json
          slot_overrides: Json
          slug: string
          status: string
          styling_config: Json | null
          success_rate: number | null
          tagline: string | null
          tags: string[] | null
          task_id: string | null
          total_cost: number | null
          total_executions: number | null
          total_tokens_used: number | null
          unique_users_count: number | null
          updated_at: string
          use_latest: boolean
          user_id: string | null
          variable_schema: Json | null
          version: number
        }
        Insert: {
          agent_id: string
          agent_version_id?: string | null
          allowed_imports?: Json | null
          app_kind?: string
          avg_execution_time_ms?: number | null
          category?: string | null
          component_code: string
          component_language?: string
          created_at?: string
          description?: string | null
          favicon_url?: string | null
          id?: string
          is_featured?: boolean | null
          is_public?: boolean
          is_verified?: boolean | null
          last_execution_at?: string | null
          layout_config?: Json | null
          metadata?: Json | null
          name: string
          organization_id?: string | null
          pinned_version?: number | null
          preview_image_url?: string | null
          project_id?: string | null
          published_at?: string | null
          rate_limit_authenticated?: number | null
          rate_limit_per_ip?: number | null
          rate_limit_window_hours?: number | null
          search_tsv?: unknown
          shared_context_slots?: Json | null
          shell_config?: Json
          shell_kind?: string
          slot_code?: Json
          slot_overrides?: Json
          slug: string
          status?: string
          styling_config?: Json | null
          success_rate?: number | null
          tagline?: string | null
          tags?: string[] | null
          task_id?: string | null
          total_cost?: number | null
          total_executions?: number | null
          total_tokens_used?: number | null
          unique_users_count?: number | null
          updated_at?: string
          use_latest?: boolean
          user_id?: string | null
          variable_schema?: Json | null
          version?: number
        }
        Update: {
          agent_id?: string
          agent_version_id?: string | null
          allowed_imports?: Json | null
          app_kind?: string
          avg_execution_time_ms?: number | null
          category?: string | null
          component_code?: string
          component_language?: string
          created_at?: string
          description?: string | null
          favicon_url?: string | null
          id?: string
          is_featured?: boolean | null
          is_public?: boolean
          is_verified?: boolean | null
          last_execution_at?: string | null
          layout_config?: Json | null
          metadata?: Json | null
          name?: string
          organization_id?: string | null
          pinned_version?: number | null
          preview_image_url?: string | null
          project_id?: string | null
          published_at?: string | null
          rate_limit_authenticated?: number | null
          rate_limit_per_ip?: number | null
          rate_limit_window_hours?: number | null
          search_tsv?: unknown
          shared_context_slots?: Json | null
          shell_config?: Json
          shell_kind?: string
          slot_code?: Json
          slot_overrides?: Json
          slug?: string
          status?: string
          styling_config?: Json | null
          success_rate?: number | null
          tagline?: string | null
          tags?: string[] | null
          task_id?: string | null
          total_cost?: number | null
          total_executions?: number | null
          total_tokens_used?: number | null
          unique_users_count?: number | null
          updated_at?: string
          use_latest?: boolean
          user_id?: string | null
          variable_schema?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "aga_apps_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agx_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aga_apps_agent_version_id_fkey"
            columns: ["agent_version_id"]
            isOneToOne: false
            referencedRelation: "agx_version"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aga_apps_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      aga_categories: {
        Row: {
          description: string | null
          icon: string | null
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          description?: string | null
          icon?: string | null
          id: string
          name: string
          sort_order?: number | null
        }
        Update: {
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      aga_errors: {
        Row: {
          app_id: string
          created_at: string
          error_code: string | null
          error_details: Json | null
          error_message: string | null
          error_type: string
          execution_id: string | null
          expected_variables: Json | null
          id: string
          resolution_notes: string | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          variables_sent: Json | null
        }
        Insert: {
          app_id: string
          created_at?: string
          error_code?: string | null
          error_details?: Json | null
          error_message?: string | null
          error_type: string
          execution_id?: string | null
          expected_variables?: Json | null
          id?: string
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          variables_sent?: Json | null
        }
        Update: {
          app_id?: string
          created_at?: string
          error_code?: string | null
          error_details?: Json | null
          error_message?: string | null
          error_type?: string
          execution_id?: string | null
          expected_variables?: Json | null
          id?: string
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          variables_sent?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "aga_errors_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "aga_apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aga_errors_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "aga_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      aga_executions: {
        Row: {
          app_id: string
          cost: number | null
          created_at: string
          error_message: string | null
          error_type: string | null
          execution_time_ms: number | null
          fingerprint: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          referer: string | null
          success: boolean | null
          task_id: string
          tokens_used: number | null
          user_agent: string | null
          user_id: string | null
          variables_provided: Json | null
          variables_used: Json | null
        }
        Insert: {
          app_id: string
          cost?: number | null
          created_at?: string
          error_message?: string | null
          error_type?: string | null
          execution_time_ms?: number | null
          fingerprint?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          referer?: string | null
          success?: boolean | null
          task_id: string
          tokens_used?: number | null
          user_agent?: string | null
          user_id?: string | null
          variables_provided?: Json | null
          variables_used?: Json | null
        }
        Update: {
          app_id?: string
          cost?: number | null
          created_at?: string
          error_message?: string | null
          error_type?: string | null
          execution_time_ms?: number | null
          fingerprint?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          referer?: string | null
          success?: boolean | null
          task_id?: string
          tokens_used?: number | null
          user_agent?: string | null
          user_id?: string | null
          variables_provided?: Json | null
          variables_used?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "aga_executions_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "aga_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      aga_rate_limits: {
        Row: {
          app_id: string
          blocked_reason: string | null
          blocked_until: string | null
          created_at: string
          execution_count: number
          fingerprint: string | null
          first_execution_at: string
          id: string
          ip_address: unknown
          is_blocked: boolean | null
          last_execution_at: string
          updated_at: string
          user_id: string | null
          window_start_at: string
        }
        Insert: {
          app_id: string
          blocked_reason?: string | null
          blocked_until?: string | null
          created_at?: string
          execution_count?: number
          fingerprint?: string | null
          first_execution_at?: string
          id?: string
          ip_address?: unknown
          is_blocked?: boolean | null
          last_execution_at?: string
          updated_at?: string
          user_id?: string | null
          window_start_at?: string
        }
        Update: {
          app_id?: string
          blocked_reason?: string | null
          blocked_until?: string | null
          created_at?: string
          execution_count?: number
          fingerprint?: string | null
          first_execution_at?: string
          id?: string
          ip_address?: unknown
          is_blocked?: boolean | null
          last_execution_at?: string
          updated_at?: string
          user_id?: string | null
          window_start_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aga_rate_limits_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "aga_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      aga_versions: {
        Row: {
          agent_id: string | null
          agent_version_id: string | null
          allowed_imports: Json | null
          app_id: string
          category: string | null
          change_note: string | null
          changed_at: string
          component_code: string | null
          component_language: string | null
          description: string | null
          id: string
          layout_config: Json | null
          name: string | null
          pinned_version: number | null
          status: string | null
          styling_config: Json | null
          tagline: string | null
          tags: string[] | null
          variable_schema: Json | null
          version_number: number
        }
        Insert: {
          agent_id?: string | null
          agent_version_id?: string | null
          allowed_imports?: Json | null
          app_id: string
          category?: string | null
          change_note?: string | null
          changed_at?: string
          component_code?: string | null
          component_language?: string | null
          description?: string | null
          id?: string
          layout_config?: Json | null
          name?: string | null
          pinned_version?: number | null
          status?: string | null
          styling_config?: Json | null
          tagline?: string | null
          tags?: string[] | null
          variable_schema?: Json | null
          version_number: number
        }
        Update: {
          agent_id?: string | null
          agent_version_id?: string | null
          allowed_imports?: Json | null
          app_id?: string
          category?: string | null
          change_note?: string | null
          changed_at?: string
          component_code?: string | null
          component_language?: string | null
          description?: string | null
          id?: string
          layout_config?: Json | null
          name?: string | null
          pinned_version?: number | null
          status?: string | null
          styling_config?: Json | null
          tagline?: string | null
          tags?: string[] | null
          variable_schema?: Json | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "aga_versions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agx_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aga_versions_agent_version_id_fkey"
            columns: ["agent_version_id"]
            isOneToOne: false
            referencedRelation: "agx_version"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aga_versions_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "aga_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_user_kv: {
        Row: {
          key: string
          updated_at: string
          user_id: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          user_id: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: []
      }
      agx_agent: {
        Row: {
          agent_type: string
          category: string | null
          context_slots: Json
          created_at: string
          custom_tools: Json
          default_rag_boost: number
          description: string | null
          id: string
          is_active: boolean
          is_archived: boolean
          is_favorite: boolean
          is_public: boolean
          mcp_servers: string[]
          messages: Json
          model_id: string | null
          model_tiers: Json | null
          name: string
          organization_id: string | null
          output_schema: Json | null
          project_id: string | null
          rag_awareness_fragment: string | null
          rag_awareness_mode: string
          rag_awareness_refreshed_at: string | null
          settings: Json
          source_agent_id: string | null
          source_snapshot_at: string | null
          tags: string[]
          task_id: string | null
          tool_config: Json
          tools: string[]
          updated_at: string
          user_id: string | null
          variable_definitions: Json | null
          version: number
        }
        Insert: {
          agent_type?: string
          category?: string | null
          context_slots?: Json
          created_at?: string
          custom_tools?: Json
          default_rag_boost?: number
          description?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          is_favorite?: boolean
          is_public?: boolean
          mcp_servers?: string[]
          messages?: Json
          model_id?: string | null
          model_tiers?: Json | null
          name: string
          organization_id?: string | null
          output_schema?: Json | null
          project_id?: string | null
          rag_awareness_fragment?: string | null
          rag_awareness_mode?: string
          rag_awareness_refreshed_at?: string | null
          settings?: Json
          source_agent_id?: string | null
          source_snapshot_at?: string | null
          tags?: string[]
          task_id?: string | null
          tool_config?: Json
          tools?: string[]
          updated_at?: string
          user_id?: string | null
          variable_definitions?: Json | null
          version?: number
        }
        Update: {
          agent_type?: string
          category?: string | null
          context_slots?: Json
          created_at?: string
          custom_tools?: Json
          default_rag_boost?: number
          description?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          is_favorite?: boolean
          is_public?: boolean
          mcp_servers?: string[]
          messages?: Json
          model_id?: string | null
          model_tiers?: Json | null
          name?: string
          organization_id?: string | null
          output_schema?: Json | null
          project_id?: string | null
          rag_awareness_fragment?: string | null
          rag_awareness_mode?: string
          rag_awareness_refreshed_at?: string | null
          settings?: Json
          source_agent_id?: string | null
          source_snapshot_at?: string | null
          tags?: string[]
          task_id?: string | null
          tool_config?: Json
          tools?: string[]
          updated_at?: string
          user_id?: string | null
          variable_definitions?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agx_agent_model_fk"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "ai_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agx_agent_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agx_agent_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agx_agent_source_fk"
            columns: ["source_agent_id"]
            isOneToOne: false
            referencedRelation: "agx_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agx_agent_task_fk"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ctx_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      agx_agent_surface: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          organization_id: string | null
          project_id: string | null
          surface_name: string
          task_id: string | null
          user_id: string | null
          value_mappings: Json
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          organization_id?: string | null
          project_id?: string | null
          surface_name: string
          task_id?: string | null
          user_id?: string | null
          value_mappings?: Json
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          organization_id?: string | null
          project_id?: string | null
          surface_name?: string
          task_id?: string | null
          user_id?: string | null
          value_mappings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "agx_agent_surface_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agx_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agx_agent_surface_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agx_agent_surface_surface_name_fkey"
            columns: ["surface_name"]
            isOneToOne: false
            referencedRelation: "ui_surface"
            referencedColumns: ["name"]
          },
        ]
      }
      agx_agent_templates: {
        Row: {
          category: string | null
          context_slots: Json
          created_at: string
          custom_tools: Json
          description: string | null
          id: string
          is_archived: boolean
          is_featured: boolean
          is_public: boolean
          mcp_servers: string[]
          messages: Json
          model_id: string | null
          model_tiers: Json | null
          name: string
          organization_id: string | null
          output_schema: Json | null
          project_id: string | null
          settings: Json
          source_agent_id: string | null
          tags: string[]
          task_id: string | null
          tool_config: Json
          tools: string[]
          updated_at: string
          use_count: number
          user_id: string | null
          variable_definitions: Json | null
          version: number
        }
        Insert: {
          category?: string | null
          context_slots?: Json
          created_at?: string
          custom_tools?: Json
          description?: string | null
          id?: string
          is_archived?: boolean
          is_featured?: boolean
          is_public?: boolean
          mcp_servers?: string[]
          messages?: Json
          model_id?: string | null
          model_tiers?: Json | null
          name: string
          organization_id?: string | null
          output_schema?: Json | null
          project_id?: string | null
          settings?: Json
          source_agent_id?: string | null
          tags?: string[]
          task_id?: string | null
          tool_config?: Json
          tools?: string[]
          updated_at?: string
          use_count?: number
          user_id?: string | null
          variable_definitions?: Json | null
          version?: number
        }
        Update: {
          category?: string | null
          context_slots?: Json
          created_at?: string
          custom_tools?: Json
          description?: string | null
          id?: string
          is_archived?: boolean
          is_featured?: boolean
          is_public?: boolean
          mcp_servers?: string[]
          messages?: Json
          model_id?: string | null
          model_tiers?: Json | null
          name?: string
          organization_id?: string | null
          output_schema?: Json | null
          project_id?: string | null
          settings?: Json
          source_agent_id?: string | null
          tags?: string[]
          task_id?: string | null
          tool_config?: Json
          tools?: string[]
          updated_at?: string
          use_count?: number
          user_id?: string | null
          variable_definitions?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agx_agent_templates_model_fk"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "ai_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agx_agent_templates_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agx_agent_templates_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agx_agent_templates_source_agent_fk"
            columns: ["source_agent_id"]
            isOneToOne: false
            referencedRelation: "agx_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agx_agent_templates_task_fk"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ctx_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      agx_shortcut: {
        Row: {
          agent_id: string | null
          agent_version_id: string | null
          allow_chat: boolean | null
          auto_run: boolean | null
          bypass_gate_seconds: number
          category_id: string
          context_mappings: Json | null
          context_overrides: Json | null
          created_at: string
          default_user_input: string | null
          default_variables: Json | null
          description: string | null
          display_mode: string | null
          enabled_features: Json | null
          hide_reasoning: boolean
          hide_tool_results: boolean
          icon_name: string | null
          id: string
          is_active: boolean
          json_extraction: Json | null
          keyboard_shortcut: string | null
          label: string
          llm_overrides: Json | null
          organization_id: string | null
          pre_execution_message: string | null
          project_id: string | null
          response_density: string
          scope_mappings: Json | null
          show_definition_message_content: boolean
          show_definition_messages: boolean
          show_pre_execution_gate: boolean | null
          show_variable_panel: boolean
          sort_order: number
          surface_name: string | null
          task_id: string | null
          updated_at: string
          use_latest: boolean
          user_id: string | null
          value_mappings: Json | null
          variables_panel_style: string
        }
        Insert: {
          agent_id?: string | null
          agent_version_id?: string | null
          allow_chat?: boolean | null
          auto_run?: boolean | null
          bypass_gate_seconds?: number
          category_id: string
          context_mappings?: Json | null
          context_overrides?: Json | null
          created_at?: string
          default_user_input?: string | null
          default_variables?: Json | null
          description?: string | null
          display_mode?: string | null
          enabled_features?: Json | null
          hide_reasoning?: boolean
          hide_tool_results?: boolean
          icon_name?: string | null
          id?: string
          is_active?: boolean
          json_extraction?: Json | null
          keyboard_shortcut?: string | null
          label: string
          llm_overrides?: Json | null
          organization_id?: string | null
          pre_execution_message?: string | null
          project_id?: string | null
          response_density?: string
          scope_mappings?: Json | null
          show_definition_message_content?: boolean
          show_definition_messages?: boolean
          show_pre_execution_gate?: boolean | null
          show_variable_panel?: boolean
          sort_order?: number
          surface_name?: string | null
          task_id?: string | null
          updated_at?: string
          use_latest?: boolean
          user_id?: string | null
          value_mappings?: Json | null
          variables_panel_style?: string
        }
        Update: {
          agent_id?: string | null
          agent_version_id?: string | null
          allow_chat?: boolean | null
          auto_run?: boolean | null
          bypass_gate_seconds?: number
          category_id?: string
          context_mappings?: Json | null
          context_overrides?: Json | null
          created_at?: string
          default_user_input?: string | null
          default_variables?: Json | null
          description?: string | null
          display_mode?: string | null
          enabled_features?: Json | null
          hide_reasoning?: boolean
          hide_tool_results?: boolean
          icon_name?: string | null
          id?: string
          is_active?: boolean
          json_extraction?: Json | null
          keyboard_shortcut?: string | null
          label?: string
          llm_overrides?: Json | null
          organization_id?: string | null
          pre_execution_message?: string | null
          project_id?: string | null
          response_density?: string
          scope_mappings?: Json | null
          show_definition_message_content?: boolean
          show_definition_messages?: boolean
          show_pre_execution_gate?: boolean | null
          show_variable_panel?: boolean
          sort_order?: number
          surface_name?: string | null
          task_id?: string | null
          updated_at?: string
          use_latest?: boolean
          user_id?: string | null
          value_mappings?: Json | null
          variables_panel_style?: string
        }
        Relationships: [
          {
            foreignKeyName: "agx_shortcut_agent_fk"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agx_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agx_shortcut_category_fk"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "shortcut_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agx_shortcut_category_fk"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "shortcuts_by_placement_view"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "agx_shortcut_org_fk"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agx_shortcut_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agx_shortcut_surface_fk"
            columns: ["surface_name"]
            isOneToOne: false
            referencedRelation: "ui_surface"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "agx_shortcut_task_fk"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ctx_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agx_shortcut_version_fk"
            columns: ["agent_version_id"]
            isOneToOne: false
            referencedRelation: "agx_version"
            referencedColumns: ["id"]
          },
        ]
      }
      agx_version: {
        Row: {
          agent_id: string
          agent_type: string | null
          category: string | null
          change_note: string | null
          changed_at: string
          context_slots: Json | null
          custom_tools: Json | null
          description: string | null
          id: string
          is_active: boolean | null
          mcp_servers: string[]
          messages: Json | null
          model_id: string | null
          model_tiers: Json | null
          name: string | null
          output_schema: Json | null
          settings: Json | null
          tags: string[] | null
          tool_config: Json
          tools: string[] | null
          variable_definitions: Json | null
          version_number: number
        }
        Insert: {
          agent_id: string
          agent_type?: string | null
          category?: string | null
          change_note?: string | null
          changed_at?: string
          context_slots?: Json | null
          custom_tools?: Json | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          mcp_servers?: string[]
          messages?: Json | null
          model_id?: string | null
          model_tiers?: Json | null
          name?: string | null
          output_schema?: Json | null
          settings?: Json | null
          tags?: string[] | null
          tool_config?: Json
          tools?: string[] | null
          variable_definitions?: Json | null
          version_number: number
        }
        Update: {
          agent_id?: string
          agent_type?: string | null
          category?: string | null
          change_note?: string | null
          changed_at?: string
          context_slots?: Json | null
          custom_tools?: Json | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          mcp_servers?: string[]
          messages?: Json | null
          model_id?: string | null
          model_tiers?: Json | null
          name?: string | null
          output_schema?: Json | null
          settings?: Json | null
          tags?: string[] | null
          tool_config?: Json
          tools?: string[] | null
          variable_definitions?: Json | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "agx_version_agent_fk"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agx_agent"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent: {
        Row: {
          ai_settings_id: string | null
          id: string
          name: string
          recipe_id: string | null
          system_message_override: string | null
        }
        Insert: {
          ai_settings_id?: string | null
          id?: string
          name: string
          recipe_id?: string | null
          system_message_override?: string | null
        }
        Update: {
          ai_settings_id?: string | null
          id?: string
          name?: string
          recipe_id?: string | null
          system_message_override?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_ai_settings_id_fkey"
            columns: ["ai_settings_id"]
            isOneToOne: false
            referencedRelation: "ai_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_complete"
            referencedColumns: ["recipe_id"]
          },
        ]
      }
      ai_endpoint: {
        Row: {
          additional_cost: boolean | null
          cost_details: Json | null
          description: string | null
          id: string
          name: string
          params: Json | null
          provider: string | null
        }
        Insert: {
          additional_cost?: boolean | null
          cost_details?: Json | null
          description?: string | null
          id?: string
          name: string
          params?: Json | null
          provider?: string | null
        }
        Update: {
          additional_cost?: boolean | null
          cost_details?: Json | null
          description?: string | null
          id?: string
          name?: string
          params?: Json | null
          provider?: string | null
        }
        Relationships: []
      }
      ai_model: {
        Row: {
          api_class: string | null
          capabilities: Json | null
          common_name: string | null
          constraints: Json | null
          context_window: number | null
          controls: Json | null
          endpoints: Json | null
          guest_fallback_id: string | null
          id: string
          is_deprecated: boolean | null
          is_premium: boolean | null
          is_primary: boolean | null
          max_tokens: number | null
          mid_fallback_id: string | null
          model_class: string
          model_provider: string | null
          name: string
          pricing: Json | null
          provider: string | null
        }
        Insert: {
          api_class?: string | null
          capabilities?: Json | null
          common_name?: string | null
          constraints?: Json | null
          context_window?: number | null
          controls?: Json | null
          endpoints?: Json | null
          guest_fallback_id?: string | null
          id?: string
          is_deprecated?: boolean | null
          is_premium?: boolean | null
          is_primary?: boolean | null
          max_tokens?: number | null
          mid_fallback_id?: string | null
          model_class: string
          model_provider?: string | null
          name: string
          pricing?: Json | null
          provider?: string | null
        }
        Update: {
          api_class?: string | null
          capabilities?: Json | null
          common_name?: string | null
          constraints?: Json | null
          context_window?: number | null
          controls?: Json | null
          endpoints?: Json | null
          guest_fallback_id?: string | null
          id?: string
          is_deprecated?: boolean | null
          is_premium?: boolean | null
          is_primary?: boolean | null
          max_tokens?: number | null
          mid_fallback_id?: string | null
          model_class?: string
          model_provider?: string | null
          name?: string
          pricing?: Json | null
          provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_model_guest_fallback_id_fkey"
            columns: ["guest_fallback_id"]
            isOneToOne: false
            referencedRelation: "ai_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_model_mid_fallback_id_fkey"
            columns: ["mid_fallback_id"]
            isOneToOne: false
            referencedRelation: "ai_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_model_model_provider_fkey"
            columns: ["model_provider"]
            isOneToOne: false
            referencedRelation: "ai_provider"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_model_endpoint: {
        Row: {
          ai_endpoint_id: string | null
          ai_model_id: string | null
          available: boolean
          configuration: Json | null
          created_at: string
          endpoint_priority: number | null
          id: string
          notes: string | null
        }
        Insert: {
          ai_endpoint_id?: string | null
          ai_model_id?: string | null
          available?: boolean
          configuration?: Json | null
          created_at?: string
          endpoint_priority?: number | null
          id?: string
          notes?: string | null
        }
        Update: {
          ai_endpoint_id?: string | null
          ai_model_id?: string | null
          available?: boolean
          configuration?: Json | null
          created_at?: string
          endpoint_priority?: number | null
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_model_endpoint_ai_endpoint_id_fkey"
            columns: ["ai_endpoint_id"]
            isOneToOne: false
            referencedRelation: "ai_endpoint"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_model_endpoint_ai_model_id_fkey"
            columns: ["ai_model_id"]
            isOneToOne: false
            referencedRelation: "ai_model"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider: {
        Row: {
          company_description: string | null
          documentation_link: string | null
          id: string
          models_link: string | null
          name: string | null
          provider_models_cache: Json | null
        }
        Insert: {
          company_description?: string | null
          documentation_link?: string | null
          id?: string
          models_link?: string | null
          name?: string | null
          provider_models_cache?: Json | null
        }
        Update: {
          company_description?: string | null
          documentation_link?: string | null
          id?: string
          models_link?: string | null
          name?: string | null
          provider_models_cache?: Json | null
        }
        Relationships: []
      }
      ai_runs: {
        Row: {
          attachments: Json | null
          broker_values: Json | null
          created_at: string
          description: string | null
          dynamic_contexts: Json | null
          id: string
          is_public: boolean
          is_starred: boolean | null
          last_message_at: string
          message_count: number | null
          messages: Json
          metadata: Json | null
          name: string | null
          organization_id: string | null
          project_id: string | null
          settings: Json
          source_id: string | null
          source_type: string
          status: string | null
          tags: string[] | null
          task_count: number | null
          total_cost: number | null
          total_tokens: number | null
          updated_at: string
          user_id: string
          variable_values: Json | null
        }
        Insert: {
          attachments?: Json | null
          broker_values?: Json | null
          created_at?: string
          description?: string | null
          dynamic_contexts?: Json | null
          id?: string
          is_public?: boolean
          is_starred?: boolean | null
          last_message_at?: string
          message_count?: number | null
          messages?: Json
          metadata?: Json | null
          name?: string | null
          organization_id?: string | null
          project_id?: string | null
          settings?: Json
          source_id?: string | null
          source_type: string
          status?: string | null
          tags?: string[] | null
          task_count?: number | null
          total_cost?: number | null
          total_tokens?: number | null
          updated_at?: string
          user_id: string
          variable_values?: Json | null
        }
        Update: {
          attachments?: Json | null
          broker_values?: Json | null
          created_at?: string
          description?: string | null
          dynamic_contexts?: Json | null
          id?: string
          is_public?: boolean
          is_starred?: boolean | null
          last_message_at?: string
          message_count?: number | null
          messages?: Json
          metadata?: Json | null
          name?: string | null
          organization_id?: string | null
          project_id?: string | null
          settings?: Json
          source_id?: string | null
          source_type?: string
          status?: string | null
          tags?: string[] | null
          task_count?: number | null
          total_cost?: number | null
          total_tokens?: number | null
          updated_at?: string
          user_id?: string
          variable_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_settings: {
        Row: {
          ai_endpoint: string | null
          ai_model: string | null
          ai_provider: string | null
          audio_format: string | null
          audio_voice: string | null
          count: number | null
          frequency_penalty: number | null
          id: string
          max_tokens: number | null
          modalities: Json | null
          presence_penalty: number | null
          preset_name: string | null
          quality: string | null
          response_format: string | null
          size: string | null
          stream: boolean | null
          temperature: number | null
          tools: Json | null
          top_p: number | null
        }
        Insert: {
          ai_endpoint?: string | null
          ai_model?: string | null
          ai_provider?: string | null
          audio_format?: string | null
          audio_voice?: string | null
          count?: number | null
          frequency_penalty?: number | null
          id?: string
          max_tokens?: number | null
          modalities?: Json | null
          presence_penalty?: number | null
          preset_name?: string | null
          quality?: string | null
          response_format?: string | null
          size?: string | null
          stream?: boolean | null
          temperature?: number | null
          tools?: Json | null
          top_p?: number | null
        }
        Update: {
          ai_endpoint?: string | null
          ai_model?: string | null
          ai_provider?: string | null
          audio_format?: string | null
          audio_voice?: string | null
          count?: number | null
          frequency_penalty?: number | null
          id?: string
          max_tokens?: number | null
          modalities?: Json | null
          presence_penalty?: number | null
          preset_name?: string | null
          quality?: string | null
          response_format?: string | null
          size?: string | null
          stream?: boolean | null
          temperature?: number | null
          tools?: Json | null
          top_p?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_settings_ai_endpoint_fkey"
            columns: ["ai_endpoint"]
            isOneToOne: false
            referencedRelation: "ai_endpoint"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_settings_ai_model_fkey"
            columns: ["ai_model"]
            isOneToOne: false
            referencedRelation: "ai_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_settings_ai_provider_fkey"
            columns: ["ai_provider"]
            isOneToOne: false
            referencedRelation: "ai_provider"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_tasks: {
        Row: {
          completed_at: string | null
          cost: number | null
          created_at: string
          endpoint: string | null
          id: string
          is_public: boolean
          model: string | null
          model_id: string | null
          organization_id: string | null
          project_id: string | null
          provider: string | null
          request_data: Json
          response_complete: boolean | null
          response_data: Json | null
          response_errors: Json | null
          response_info: Json | null
          response_metadata: Json | null
          response_text: string | null
          run_id: string
          service: string
          status: string | null
          task_id: string
          task_name: string
          time_to_first_token: number | null
          tokens_input: number | null
          tokens_output: number | null
          tokens_total: number | null
          tool_updates: Json | null
          total_time: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          cost?: number | null
          created_at?: string
          endpoint?: string | null
          id?: string
          is_public?: boolean
          model?: string | null
          model_id?: string | null
          organization_id?: string | null
          project_id?: string | null
          provider?: string | null
          request_data?: Json
          response_complete?: boolean | null
          response_data?: Json | null
          response_errors?: Json | null
          response_info?: Json | null
          response_metadata?: Json | null
          response_text?: string | null
          run_id: string
          service: string
          status?: string | null
          task_id: string
          task_name: string
          time_to_first_token?: number | null
          tokens_input?: number | null
          tokens_output?: number | null
          tokens_total?: number | null
          tool_updates?: Json | null
          total_time?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          cost?: number | null
          created_at?: string
          endpoint?: string | null
          id?: string
          is_public?: boolean
          model?: string | null
          model_id?: string | null
          organization_id?: string | null
          project_id?: string | null
          provider?: string | null
          request_data?: Json
          response_complete?: boolean | null
          response_data?: Json | null
          response_errors?: Json | null
          response_info?: Json | null
          response_metadata?: Json | null
          response_text?: string | null
          run_id?: string
          service?: string
          status?: string | null
          task_id?: string
          task_name?: string
          time_to_first_token?: number | null
          tokens_input?: number | null
          tokens_output?: number | null
          tokens_total?: number | null
          tool_updates?: Json | null
          total_time?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tasks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tasks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_training_data: {
        Row: {
          created_at: string
          id: string
          is_public: boolean | null
          metadata: Json | null
          quality_score: number | null
          questions_content: string | null
          questions_thinking: string | null
          reflection_content: string | null
          reflection_thinking: string | null
          response_content: string | null
          source: string | null
          structured_questions: Json | null
          system_prompt: string | null
          thinking_content: string | null
          updated_at: string | null
          user_id: string | null
          user_query: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_public?: boolean | null
          metadata?: Json | null
          quality_score?: number | null
          questions_content?: string | null
          questions_thinking?: string | null
          reflection_content?: string | null
          reflection_thinking?: string | null
          response_content?: string | null
          source?: string | null
          structured_questions?: Json | null
          system_prompt?: string | null
          thinking_content?: string | null
          updated_at?: string | null
          user_id?: string | null
          user_query?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_public?: boolean | null
          metadata?: Json | null
          quality_score?: number | null
          questions_content?: string | null
          questions_thinking?: string | null
          reflection_content?: string | null
          reflection_thinking?: string | null
          response_content?: string | null
          source?: string | null
          structured_questions?: Json | null
          system_prompt?: string | null
          thinking_content?: string | null
          updated_at?: string | null
          user_id?: string | null
          user_query?: string | null
        }
        Relationships: []
      }
      analysis_recipes: {
        Row: {
          created_at: string
          default_tiers: Json
          description: string | null
          detector_overrides: Json
          id: string
          is_active: boolean
          match_rules: Json
          name: string
          owner_account_id: string | null
          owner_team_id: string | null
          owner_user_id: string | null
          pattern_overrides: Json
          priority: number
          redaction_mode: string | null
          substitute_formats: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_tiers?: Json
          description?: string | null
          detector_overrides?: Json
          id?: string
          is_active?: boolean
          match_rules?: Json
          name: string
          owner_account_id?: string | null
          owner_team_id?: string | null
          owner_user_id?: string | null
          pattern_overrides?: Json
          priority?: number
          redaction_mode?: string | null
          substitute_formats?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_tiers?: Json
          description?: string | null
          detector_overrides?: Json
          id?: string
          is_active?: boolean
          match_rules?: Json
          name?: string
          owner_account_id?: string | null
          owner_team_id?: string | null
          owner_user_id?: string | null
          pattern_overrides?: Json
          priority?: number
          redaction_mode?: string | null
          substitute_formats?: Json
          updated_at?: string
        }
        Relationships: []
      }
      api_field_warnings: {
        Row: {
          created_at: string
          detail: string | null
          field_name: string
          id: string
          path: string
          replacement: string | null
          request_id: string | null
          user_id: string | null
          warning_type: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          field_name: string
          id?: string
          path: string
          replacement?: string | null
          request_id?: string | null
          user_id?: string | null
          warning_type: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          field_name?: string
          id?: string
          path?: string
          replacement?: string | null
          request_id?: string | null
          user_id?: string | null
          warning_type?: string
        }
        Relationships: []
      }
      api_request_log: {
        Row: {
          auth_type: string
          created_at: string
          duration_ms: number | null
          error: string | null
          fingerprint_id: string | null
          id: string
          ip_address: string | null
          method: string
          path: string
          request_id: string
          status_code: number | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          auth_type?: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          fingerprint_id?: string | null
          id?: string
          ip_address?: string | null
          method: string
          path: string
          request_id: string
          status_code?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          auth_type?: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          fingerprint_id?: string | null
          id?: string
          ip_address?: string | null
          method?: string
          path?: string
          request_id?: string
          status_code?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      app_instances: {
        Row: {
          architecture: string | null
          board_id: string | null
          cpu_cores: number | null
          cpu_model: string | null
          created_at: string
          hardware_detected_at: string | null
          hardware_uuid: string | null
          home_dir: string | null
          hostname: string | null
          id: string
          instance_id: string
          instance_name: string
          is_active: boolean
          last_seen: string
          organization_id: string | null
          os_version: string | null
          platform: string | null
          project_id: string | null
          python_version: string | null
          ram_total_gb: number | null
          serial_number: string | null
          system_hardware: Json | null
          task_id: string | null
          tunnel_active: boolean
          tunnel_updated_at: string | null
          tunnel_url: string | null
          tunnel_ws_url: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          architecture?: string | null
          board_id?: string | null
          cpu_cores?: number | null
          cpu_model?: string | null
          created_at?: string
          hardware_detected_at?: string | null
          hardware_uuid?: string | null
          home_dir?: string | null
          hostname?: string | null
          id?: string
          instance_id: string
          instance_name?: string
          is_active?: boolean
          last_seen?: string
          organization_id?: string | null
          os_version?: string | null
          platform?: string | null
          project_id?: string | null
          python_version?: string | null
          ram_total_gb?: number | null
          serial_number?: string | null
          system_hardware?: Json | null
          task_id?: string | null
          tunnel_active?: boolean
          tunnel_updated_at?: string | null
          tunnel_url?: string | null
          tunnel_ws_url?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          architecture?: string | null
          board_id?: string | null
          cpu_cores?: number | null
          cpu_model?: string | null
          created_at?: string
          hardware_detected_at?: string | null
          hardware_uuid?: string | null
          home_dir?: string | null
          hostname?: string | null
          id?: string
          instance_id?: string
          instance_name?: string
          is_active?: boolean
          last_seen?: string
          organization_id?: string | null
          os_version?: string | null
          platform?: string | null
          project_id?: string | null
          python_version?: string | null
          ram_total_gb?: number | null
          serial_number?: string | null
          system_hardware?: Json | null
          task_id?: string | null
          tunnel_active?: boolean
          tunnel_updated_at?: string | null
          tunnel_url?: string | null
          tunnel_ws_url?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_instances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_instances_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_instances_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ctx_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          created_at: string
          id: string
          instance_id: string
          settings_json: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_id: string
          settings_json?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_id?: string
          settings_json?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_sync_status: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          instance_id: string
          last_sync_at: string | null
          last_sync_direction: string | null
          last_sync_result: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          instance_id: string
          last_sync_at?: string | null
          last_sync_direction?: string | null
          last_sync_result?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          instance_id?: string
          last_sync_at?: string | null
          last_sync_direction?: string | null
          last_sync_result?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      applet: {
        Row: {
          compiled_recipe_id: string | null
          created_at: string
          creator: string | null
          cta_text: string | null
          data_source_config: Json | null
          description: string | null
          id: string
          is_public: boolean | null
          name: string
          next_step_config: Json | null
          result_component_config: Json | null
          slug: string
          subcategory_id: string | null
          theme: string | null
          type: Database["public"]["Enums"]["app_type"]
          user_id: string | null
        }
        Insert: {
          compiled_recipe_id?: string | null
          created_at?: string
          creator?: string | null
          cta_text?: string | null
          data_source_config?: Json | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          next_step_config?: Json | null
          result_component_config?: Json | null
          slug: string
          subcategory_id?: string | null
          theme?: string | null
          type: Database["public"]["Enums"]["app_type"]
          user_id?: string | null
        }
        Update: {
          compiled_recipe_id?: string | null
          created_at?: string
          creator?: string | null
          cta_text?: string | null
          data_source_config?: Json | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          next_step_config?: Json | null
          result_component_config?: Json | null
          slug?: string
          subcategory_id?: string | null
          theme?: string | null
          type?: Database["public"]["Enums"]["app_type"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applet_compiled_recipe_id_fkey"
            columns: ["compiled_recipe_id"]
            isOneToOne: false
            referencedRelation: "compiled_recipe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applet_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategory"
            referencedColumns: ["id"]
          },
        ]
      }
      applet_containers: {
        Row: {
          applet_id: string
          container_id: string
          created_at: string
          id: string
          order: number
          updated_at: string | null
        }
        Insert: {
          applet_id: string
          container_id: string
          created_at?: string
          id?: string
          order?: number
          updated_at?: string | null
        }
        Update: {
          applet_id?: string
          container_id?: string
          created_at?: string
          id?: string
          order?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applet_containers_applet_id_fkey"
            columns: ["applet_id"]
            isOneToOne: false
            referencedRelation: "custom_applet_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applet_containers_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "component_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      arg: {
        Row: {
          data_type: Database["public"]["Enums"]["data_type"]
          default_junk: string | null
          default_value: Json
          description: string | null
          examples: string | null
          id: string
          name: string
          ready: boolean
          registered_function: string
          required: boolean
        }
        Insert: {
          data_type?: Database["public"]["Enums"]["data_type"]
          default_junk?: string | null
          default_value?: Json
          description?: string | null
          examples?: string | null
          id?: string
          name: string
          ready?: boolean
          registered_function: string
          required?: boolean
        }
        Update: {
          data_type?: Database["public"]["Enums"]["data_type"]
          default_junk?: string | null
          default_value?: Json
          description?: string | null
          examples?: string | null
          id?: string
          name?: string
          ready?: boolean
          registered_function?: string
          required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "arg_registered_function_fkey"
            columns: ["registered_function"]
            isOneToOne: false
            referencedRelation: "registered_function"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arg_registered_function_fkey"
            columns: ["registered_function"]
            isOneToOne: false
            referencedRelation: "view_registered_function"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arg_registered_function_fkey"
            columns: ["registered_function"]
            isOneToOne: false
            referencedRelation: "view_registered_function_all_rels"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          created_at: string
          file_name: string | null
          file_size: number | null
          file_type: string | null
          file_url: string
          height: number | null
          id: string
          message_id: string
          thumbnail_url: string | null
          width: number | null
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url: string
          height?: number | null
          id?: string
          message_id: string
          thumbnail_url?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          height?: number | null
          id?: string
          message_id?: string
          thumbnail_url?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      audio_label: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      audio_recording: {
        Row: {
          created_at: string
          duration: number | null
          file_url: string
          id: string
          is_public: boolean
          label: string | null
          local_path: string | null
          name: string
          size: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          duration?: number | null
          file_url: string
          id?: string
          is_public?: boolean
          label?: string | null
          local_path?: string | null
          name: string
          size?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          duration?: number | null
          file_url?: string
          id?: string
          is_public?: boolean
          label?: string | null
          local_path?: string | null
          name?: string
          size?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audio_recording_label_fkey"
            columns: ["label"]
            isOneToOne: false
            referencedRelation: "audio_label"
            referencedColumns: ["id"]
          },
        ]
      }
      audio_recording_users: {
        Row: {
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
        }
        Relationships: []
      }
      audio_transcription_errors: {
        Row: {
          api_route: string
          attempt_number: number | null
          chunk_index: number | null
          created_at: string
          error_code: string
          error_message: string
          file_size_bytes: number | null
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          api_route: string
          attempt_number?: number | null
          chunk_index?: number | null
          created_at?: string
          error_code: string
          error_message: string
          file_size_bytes?: number | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          api_route?: string
          attempt_number?: number | null
          chunk_index?: number | null
          created_at?: string
          error_code?: string
          error_message?: string
          file_size_bytes?: number | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      automation_boundary_broker: {
        Row: {
          beacon_destination:
            | Database["public"]["Enums"]["data_destination"]
            | null
          broker: string | null
          id: string
          matrix: string | null
          spark_source: Database["public"]["Enums"]["data_source"] | null
        }
        Insert: {
          beacon_destination?:
            | Database["public"]["Enums"]["data_destination"]
            | null
          broker?: string | null
          id?: string
          matrix?: string | null
          spark_source?: Database["public"]["Enums"]["data_source"] | null
        }
        Update: {
          beacon_destination?:
            | Database["public"]["Enums"]["data_destination"]
            | null
          broker?: string | null
          id?: string
          matrix?: string | null
          spark_source?: Database["public"]["Enums"]["data_source"] | null
        }
        Relationships: [
          {
            foreignKeyName: "boundary_brokers_broker_fkey"
            columns: ["broker"]
            isOneToOne: false
            referencedRelation: "broker"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boundary_brokers_broker_fkey"
            columns: ["broker"]
            isOneToOne: false
            referencedRelation: "view_registered_function_all_rels"
            referencedColumns: ["broker_id"]
          },
          {
            foreignKeyName: "boundary_brokers_matrix_fkey"
            columns: ["matrix"]
            isOneToOne: false
            referencedRelation: "automation_matrix"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_matrix: {
        Row: {
          average_seconds: number | null
          cognition_matrices:
            | Database["public"]["Enums"]["cognition_matrices"]
            | null
          description: string | null
          id: string
          is_automated: boolean | null
          name: string
        }
        Insert: {
          average_seconds?: number | null
          cognition_matrices?:
            | Database["public"]["Enums"]["cognition_matrices"]
            | null
          description?: string | null
          id?: string
          is_automated?: boolean | null
          name: string
        }
        Update: {
          average_seconds?: number | null
          cognition_matrices?:
            | Database["public"]["Enums"]["cognition_matrices"]
            | null
          description?: string | null
          id?: string
          is_automated?: boolean | null
          name?: string
        }
        Relationships: []
      }
      broker: {
        Row: {
          additional_params: Json | null
          custom_source_component: string | null
          data_type: Database["public"]["Enums"]["data_type"]
          default_destination:
            | Database["public"]["Enums"]["data_destination"]
            | null
          default_source: Database["public"]["Enums"]["data_source"] | null
          description: string | null
          display_name: string | null
          id: string
          name: string
          other_source_params: Json | null
          output_component:
            | Database["public"]["Enums"]["destination_component"]
            | null
          ready: boolean | null
          sample_entries: string | null
          string_value: string | null
          tags: Json | null
          tooltip: string | null
          validation_rules: Json | null
          value: Json | null
        }
        Insert: {
          additional_params?: Json | null
          custom_source_component?: string | null
          data_type?: Database["public"]["Enums"]["data_type"]
          default_destination?:
            | Database["public"]["Enums"]["data_destination"]
            | null
          default_source?: Database["public"]["Enums"]["data_source"] | null
          description?: string | null
          display_name?: string | null
          id?: string
          name: string
          other_source_params?: Json | null
          output_component?:
            | Database["public"]["Enums"]["destination_component"]
            | null
          ready?: boolean | null
          sample_entries?: string | null
          string_value?: string | null
          tags?: Json | null
          tooltip?: string | null
          validation_rules?: Json | null
          value?: Json | null
        }
        Update: {
          additional_params?: Json | null
          custom_source_component?: string | null
          data_type?: Database["public"]["Enums"]["data_type"]
          default_destination?:
            | Database["public"]["Enums"]["data_destination"]
            | null
          default_source?: Database["public"]["Enums"]["data_source"] | null
          description?: string | null
          display_name?: string | null
          id?: string
          name?: string
          other_source_params?: Json | null
          output_component?:
            | Database["public"]["Enums"]["destination_component"]
            | null
          ready?: boolean | null
          sample_entries?: string | null
          string_value?: string | null
          tags?: Json | null
          tooltip?: string | null
          validation_rules?: Json | null
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "broker_custom_component_fkey"
            columns: ["custom_source_component"]
            isOneToOne: false
            referencedRelation: "data_input_component"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_value: {
        Row: {
          category: string | null
          comments: string | null
          created_at: string
          data: Json | null
          data_broker: string | null
          id: string
          sub_category: string | null
          tags: string[] | null
          user_id: string | null
        }
        Insert: {
          category?: string | null
          comments?: string | null
          created_at?: string
          data?: Json | null
          data_broker?: string | null
          id?: string
          sub_category?: string | null
          tags?: string[] | null
          user_id?: string | null
        }
        Update: {
          category?: string | null
          comments?: string | null
          created_at?: string
          data?: Json | null
          data_broker?: string | null
          id?: string
          sub_category?: string | null
          tags?: string[] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broker_value_data_broker_fkey"
            columns: ["data_broker"]
            isOneToOne: false
            referencedRelation: "data_broker"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_values: {
        Row: {
          ai_runs_id: string | null
          ai_tasks_id: string | null
          broker_id: string
          created_at: string | null
          created_by: string | null
          id: string
          is_global: boolean | null
          organization_id: string | null
          project_id: string | null
          task_id: string | null
          updated_at: string | null
          user_id: string | null
          value: Json
        }
        Insert: {
          ai_runs_id?: string | null
          ai_tasks_id?: string | null
          broker_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_global?: boolean | null
          organization_id?: string | null
          project_id?: string | null
          task_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          value: Json
        }
        Update: {
          ai_runs_id?: string | null
          ai_tasks_id?: string | null
          broker_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_global?: boolean | null
          organization_id?: string | null
          project_id?: string | null
          task_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "broker_values_ai_runs_id_fkey"
            columns: ["ai_runs_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_values_ai_runs_id_fkey"
            columns: ["ai_runs_id"]
            isOneToOne: false
            referencedRelation: "ai_runs_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_values_ai_tasks_id_fkey"
            columns: ["ai_tasks_id"]
            isOneToOne: false
            referencedRelation: "ai_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_values_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "data_broker"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_values_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_values_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_values_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ctx_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      bucket_structures: {
        Row: {
          bucket_id: string
          last_updated: string | null
          structure: Json | null
        }
        Insert: {
          bucket_id: string
          last_updated?: string | null
          structure?: Json | null
        }
        Update: {
          bucket_id?: string
          last_updated?: string | null
          structure?: Json | null
        }
        Relationships: []
      }
      bucket_tree_structures: {
        Row: {
          bucket_id: string
          last_updated: string | null
          tree_structure: Json | null
        }
        Insert: {
          bucket_id: string
          last_updated?: string | null
          tree_structure?: Json | null
        }
        Update: {
          bucket_id?: string
          last_updated?: string | null
          tree_structure?: Json | null
        }
        Relationships: []
      }
      canvas_comment_likes: {
        Row: {
          comment_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvas_comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "canvas_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_comments: {
        Row: {
          avatar_url: string | null
          canvas_id: string
          content: string
          created_at: string | null
          deleted: boolean | null
          display_name: string | null
          edited: boolean | null
          flag_count: number | null
          flagged: boolean | null
          id: string
          like_count: number | null
          parent_comment_id: string | null
          reply_count: number | null
          updated_at: string | null
          user_id: string | null
          username: string
        }
        Insert: {
          avatar_url?: string | null
          canvas_id: string
          content: string
          created_at?: string | null
          deleted?: boolean | null
          display_name?: string | null
          edited?: boolean | null
          flag_count?: number | null
          flagged?: boolean | null
          id?: string
          like_count?: number | null
          parent_comment_id?: string | null
          reply_count?: number | null
          updated_at?: string | null
          user_id?: string | null
          username: string
        }
        Update: {
          avatar_url?: string | null
          canvas_id?: string
          content?: string
          created_at?: string | null
          deleted?: boolean | null
          display_name?: string | null
          edited?: boolean | null
          flag_count?: number | null
          flagged?: boolean | null
          id?: string
          like_count?: number | null
          parent_comment_id?: string | null
          reply_count?: number | null
          updated_at?: string | null
          user_id?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvas_comments_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "shared_canvas_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvas_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "canvas_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_items: {
        Row: {
          artifact_index: number | null
          content: Json
          content_hash: string | null
          conversation_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_archived: boolean | null
          is_favorited: boolean | null
          is_public: boolean | null
          last_accessed_at: string | null
          organization_id: string | null
          parent_canvas_id: string | null
          project_id: string | null
          session_id: string | null
          share_token: string | null
          source_message_id: string | null
          source_type: string
          tags: string[] | null
          task_id: string | null
          title: string | null
          type: string
          updated_at: string | null
          user_id: string
          version: number
        }
        Insert: {
          artifact_index?: number | null
          content: Json
          content_hash?: string | null
          conversation_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean | null
          is_favorited?: boolean | null
          is_public?: boolean | null
          last_accessed_at?: string | null
          organization_id?: string | null
          parent_canvas_id?: string | null
          project_id?: string | null
          session_id?: string | null
          share_token?: string | null
          source_message_id?: string | null
          source_type?: string
          tags?: string[] | null
          task_id?: string | null
          title?: string | null
          type: string
          updated_at?: string | null
          user_id: string
          version?: number
        }
        Update: {
          artifact_index?: number | null
          content?: Json
          content_hash?: string | null
          conversation_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean | null
          is_favorited?: boolean | null
          is_public?: boolean | null
          last_accessed_at?: string | null
          organization_id?: string | null
          parent_canvas_id?: string | null
          project_id?: string | null
          session_id?: string | null
          share_token?: string | null
          source_message_id?: string | null
          source_type?: string
          tags?: string[] | null
          task_id?: string | null
          title?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "canvas_items_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvas_items_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvas_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvas_items_parent_canvas_id_fkey"
            columns: ["parent_canvas_id"]
            isOneToOne: false
            referencedRelation: "canvas_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvas_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_canvas_items_source_message"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "cx_message"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_likes: {
        Row: {
          canvas_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          canvas_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          canvas_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvas_likes_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "shared_canvas_items"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_scores: {
        Row: {
          attempt_number: number | null
          canvas_id: string
          completed: boolean | null
          created_at: string | null
          data: Json | null
          display_name: string | null
          id: string
          max_score: number
          percentage: number | null
          score: number
          time_taken: number | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          attempt_number?: number | null
          canvas_id: string
          completed?: boolean | null
          created_at?: string | null
          data?: Json | null
          display_name?: string | null
          id?: string
          max_score: number
          percentage?: number | null
          score: number
          time_taken?: number | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          attempt_number?: number | null
          canvas_id?: string
          completed?: boolean | null
          created_at?: string | null
          data?: Json | null
          display_name?: string | null
          id?: string
          max_score?: number
          percentage?: number | null
          score?: number
          time_taken?: number | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "canvas_scores_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "shared_canvas_items"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_views: {
        Row: {
          canvas_id: string
          completed: boolean | null
          id: string
          interacted: boolean | null
          referrer: string | null
          session_id: string | null
          time_spent: number | null
          user_agent: string | null
          user_id: string | null
          viewed_at: string | null
        }
        Insert: {
          canvas_id: string
          completed?: boolean | null
          id?: string
          interacted?: boolean | null
          referrer?: string | null
          session_id?: string | null
          time_spent?: number | null
          user_agent?: string | null
          user_id?: string | null
          viewed_at?: string | null
        }
        Update: {
          canvas_id?: string
          completed?: boolean | null
          id?: string
          interacted?: boolean | null
          referrer?: string | null
          session_id?: string | null
          time_spent?: number | null
          user_agent?: string | null
          user_id?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "canvas_views_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "shared_canvas_items"
            referencedColumns: ["id"]
          },
        ]
      }
      category: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      cld_account_tiers: {
        Row: {
          created_at: string
          features: Json
          id: string
          is_default_for_guests: boolean
          is_default_for_users: boolean
          max_bulk_items: number | null
          max_daily_upload_bytes: number | null
          max_daily_uploads: number | null
          max_file_size_bytes: number | null
          max_files: number | null
          max_share_links_per_resource: number | null
          max_storage_bytes: number | null
          max_versions_per_file: number | null
          name: string
          rate_limit_downloads_per_min: number | null
          rate_limit_general_per_min: number | null
          rate_limit_uploads_per_min: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          features?: Json
          id: string
          is_default_for_guests?: boolean
          is_default_for_users?: boolean
          max_bulk_items?: number | null
          max_daily_upload_bytes?: number | null
          max_daily_uploads?: number | null
          max_file_size_bytes?: number | null
          max_files?: number | null
          max_share_links_per_resource?: number | null
          max_storage_bytes?: number | null
          max_versions_per_file?: number | null
          name: string
          rate_limit_downloads_per_min?: number | null
          rate_limit_general_per_min?: number | null
          rate_limit_uploads_per_min?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          features?: Json
          id?: string
          is_default_for_guests?: boolean
          is_default_for_users?: boolean
          max_bulk_items?: number | null
          max_daily_upload_bytes?: number | null
          max_daily_uploads?: number | null
          max_file_size_bytes?: number | null
          max_files?: number | null
          max_share_links_per_resource?: number | null
          max_storage_bytes?: number | null
          max_versions_per_file?: number | null
          name?: string
          rate_limit_downloads_per_min?: number | null
          rate_limit_general_per_min?: number | null
          rate_limit_uploads_per_min?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      cld_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          event_type: string
          id: string
          ip_address: unknown
          occurred_at: string
          payload: Json
          processed_at: string | null
          request_id: string | null
          resource_id: string | null
          resource_type: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          event_type: string
          id?: string
          ip_address?: unknown
          occurred_at?: string
          payload?: Json
          processed_at?: string | null
          request_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          event_type?: string
          id?: string
          ip_address?: unknown
          occurred_at?: string
          payload?: Json
          processed_at?: string | null
          request_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
        }
        Relationships: []
      }
      cld_file_permissions: {
        Row: {
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          grantee_id: string
          grantee_type: string
          id: string
          organization_id: string | null
          permission_level: string
          resource_id: string
          resource_type: string
        }
        Insert: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          grantee_id: string
          grantee_type?: string
          id?: string
          organization_id?: string | null
          permission_level: string
          resource_id: string
          resource_type: string
        }
        Update: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          grantee_id?: string
          grantee_type?: string
          id?: string
          organization_id?: string | null
          permission_level?: string
          resource_id?: string
          resource_type?: string
        }
        Relationships: []
      }
      cld_file_versions: {
        Row: {
          change_summary: string | null
          checksum: string | null
          created_at: string
          created_by: string | null
          file_id: string
          id: string
          organization_id: string | null
          size_bytes: number | null
          storage_uri: string
          version_number: number
        }
        Insert: {
          change_summary?: string | null
          checksum?: string | null
          created_at?: string
          created_by?: string | null
          file_id: string
          id?: string
          organization_id?: string | null
          size_bytes?: number | null
          storage_uri: string
          version_number: number
        }
        Update: {
          change_summary?: string | null
          checksum?: string | null
          created_at?: string
          created_by?: string | null
          file_id?: string
          id?: string
          organization_id?: string | null
          size_bytes?: number | null
          storage_uri?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "cld_file_versions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "cld_files"
            referencedColumns: ["id"]
          },
        ]
      }
      cld_files: {
        Row: {
          canonical_processed_document_id: string | null
          canonical_storage_uri: string | null
          checksum: string | null
          created_at: string
          current_version: number
          deleted_at: string | null
          derivation_kind: string | null
          derivation_metadata: Json
          duplicate_of_file_id: string | null
          duration_ms: number | null
          file_name: string
          file_path: string
          height: number | null
          id: string
          metadata: Json
          mime_type: string | null
          organization_id: string | null
          owner_id: string
          parent_file_id: string | null
          parent_folder_id: string | null
          size_bytes: number | null
          storage_uri: string
          updated_at: string
          visibility: string
          width: number | null
        }
        Insert: {
          canonical_processed_document_id?: string | null
          canonical_storage_uri?: string | null
          checksum?: string | null
          created_at?: string
          current_version?: number
          deleted_at?: string | null
          derivation_kind?: string | null
          derivation_metadata?: Json
          duplicate_of_file_id?: string | null
          duration_ms?: number | null
          file_name: string
          file_path: string
          height?: number | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          organization_id?: string | null
          owner_id: string
          parent_file_id?: string | null
          parent_folder_id?: string | null
          size_bytes?: number | null
          storage_uri: string
          updated_at?: string
          visibility?: string
          width?: number | null
        }
        Update: {
          canonical_processed_document_id?: string | null
          canonical_storage_uri?: string | null
          checksum?: string | null
          created_at?: string
          current_version?: number
          deleted_at?: string | null
          derivation_kind?: string | null
          derivation_metadata?: Json
          duplicate_of_file_id?: string | null
          duration_ms?: number | null
          file_name?: string
          file_path?: string
          height?: number | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          organization_id?: string | null
          owner_id?: string
          parent_file_id?: string | null
          parent_folder_id?: string | null
          size_bytes?: number | null
          storage_uri?: string
          updated_at?: string
          visibility?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cld_files_canonical_processed_document_id_fkey"
            columns: ["canonical_processed_document_id"]
            isOneToOne: false
            referencedRelation: "extracted_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cld_files_canonical_processed_document_id_fkey"
            columns: ["canonical_processed_document_id"]
            isOneToOne: false
            referencedRelation: "processed_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cld_files_duplicate_of_file_id_fkey"
            columns: ["duplicate_of_file_id"]
            isOneToOne: false
            referencedRelation: "cld_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cld_files_parent_file_id_fkey"
            columns: ["parent_file_id"]
            isOneToOne: false
            referencedRelation: "cld_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cld_files_parent_folder_id_fkey"
            columns: ["parent_folder_id"]
            isOneToOne: false
            referencedRelation: "cld_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      cld_folders: {
        Row: {
          created_at: string
          deleted_at: string | null
          folder_name: string
          folder_path: string
          id: string
          is_system: boolean
          metadata: Json
          organization_id: string | null
          owner_id: string
          parent_id: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          folder_name: string
          folder_path: string
          id?: string
          is_system?: boolean
          metadata?: Json
          organization_id?: string | null
          owner_id: string
          parent_id?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          folder_name?: string
          folder_path?: string
          id?: string
          is_system?: boolean
          metadata?: Json
          organization_id?: string | null
          owner_id?: string
          parent_id?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "cld_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cld_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      cld_guest_migrations: {
        Row: {
          fingerprint_hash: string
          guest_id: string
          migrated_at: string
          migrated_to: string
          payload: Json
        }
        Insert: {
          fingerprint_hash: string
          guest_id: string
          migrated_at?: string
          migrated_to: string
          payload?: Json
        }
        Update: {
          fingerprint_hash?: string
          guest_id?: string
          migrated_at?: string
          migrated_to?: string
          payload?: Json
        }
        Relationships: []
      }
      cld_rate_limit_buckets: {
        Row: {
          actor_id: string
          bucket_kind: string
          counter: number
          minute_bucket: string
        }
        Insert: {
          actor_id: string
          bucket_kind: string
          counter?: number
          minute_bucket: string
        }
        Update: {
          actor_id?: string
          bucket_kind?: string
          counter?: number
          minute_bucket?: string
        }
        Relationships: []
      }
      cld_share_links: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          organization_id: string | null
          permission_level: string
          resource_id: string
          resource_type: string
          share_token: string
          use_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          organization_id?: string | null
          permission_level?: string
          resource_id: string
          resource_type: string
          share_token?: string
          use_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          organization_id?: string | null
          permission_level?: string
          resource_id?: string
          resource_type?: string
          share_token?: string
          use_count?: number
        }
        Relationships: []
      }
      cld_uploads_inflight: {
        Row: {
          bucket: string
          created_at: string
          expires_at: string
          file_id: string
          file_name: string
          file_path: string
          id: string
          idempotency_key: string | null
          key: string
          metadata: Json
          mime_type: string | null
          multipart_upload_id: string
          owner_id: string
          parts: Json
          status: string
          updated_at: string
          upload_length: number
          upload_offset: number
          visibility: string
        }
        Insert: {
          bucket: string
          created_at?: string
          expires_at?: string
          file_id: string
          file_name: string
          file_path: string
          id?: string
          idempotency_key?: string | null
          key: string
          metadata?: Json
          mime_type?: string | null
          multipart_upload_id: string
          owner_id: string
          parts?: Json
          status?: string
          updated_at?: string
          upload_length: number
          upload_offset?: number
          visibility?: string
        }
        Update: {
          bucket?: string
          created_at?: string
          expires_at?: string
          file_id?: string
          file_name?: string
          file_path?: string
          id?: string
          idempotency_key?: string | null
          key?: string
          metadata?: Json
          mime_type?: string | null
          multipart_upload_id?: string
          owner_id?: string
          parts?: Json
          status?: string
          updated_at?: string
          upload_length?: number
          upload_offset?: number
          visibility?: string
        }
        Relationships: []
      }
      cld_user_account: {
        Row: {
          blocked_reason: string | null
          created_at: string
          custom_limits: Json
          is_blocked: boolean
          notes: string | null
          tier_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          blocked_reason?: string | null
          created_at?: string
          custom_limits?: Json
          is_blocked?: boolean
          notes?: string | null
          tier_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          blocked_reason?: string | null
          created_at?: string
          custom_limits?: Json
          is_blocked?: boolean
          notes?: string | null
          tier_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cld_user_account_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "cld_account_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      cld_user_group_members: {
        Row: {
          added_at: string
          added_by: string | null
          group_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          group_id: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          group_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cld_user_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "cld_user_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      cld_user_groups: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string | null
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id?: string | null
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string | null
          owner_id?: string
        }
        Relationships: []
      }
      cld_user_storage_usage: {
        Row: {
          bytes_used: number
          daily_reset_at: string
          daily_upload_bytes: number
          daily_upload_count: number
          files_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bytes_used?: number
          daily_reset_at?: string
          daily_upload_bytes?: number
          daily_upload_count?: number
          files_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bytes_used?: number
          daily_reset_at?: string
          daily_upload_bytes?: number
          daily_upload_count?: number
          files_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cld_webhook_deliveries: {
        Row: {
          attempt: number
          completed_at: string | null
          created_at: string
          error_message: string | null
          event_id: string
          http_status: number | null
          id: string
          latency_ms: number | null
          next_attempt_at: string | null
          status: string
          webhook_id: string
        }
        Insert: {
          attempt?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          event_id: string
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          next_attempt_at?: string | null
          status?: string
          webhook_id: string
        }
        Update: {
          attempt?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          event_id?: string
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          next_attempt_at?: string | null
          status?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cld_webhook_deliveries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "cld_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cld_webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "cld_webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      cld_webhooks: {
        Row: {
          consecutive_failures: number
          created_at: string
          description: string | null
          event_types: string[] | null
          id: string
          is_active: boolean
          last_attempt_at: string | null
          last_success_at: string | null
          max_consecutive_failures: number
          owner_id: string
          resource_types: string[] | null
          secret: string
          target_url: string
          updated_at: string
        }
        Insert: {
          consecutive_failures?: number
          created_at?: string
          description?: string | null
          event_types?: string[] | null
          id?: string
          is_active?: boolean
          last_attempt_at?: string | null
          last_success_at?: string | null
          max_consecutive_failures?: number
          owner_id: string
          resource_types?: string[] | null
          secret: string
          target_url: string
          updated_at?: string
        }
        Update: {
          consecutive_failures?: number
          created_at?: string
          description?: string | null
          event_types?: string[] | null
          id?: string
          is_active?: boolean
          last_attempt_at?: string | null
          last_success_at?: string | null
          max_consecutive_failures?: number
          owner_id?: string
          resource_types?: string[] | null
          secret?: string
          target_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      cmp_comparison_entries: {
        Row: {
          agent_id: string
          agent_version: number | null
          agent_version_snapshot_id: string | null
          comparison_set_id: string
          conversation_id: string
          created_at: string
          display_order: number
          id: string
          metadata: Json
        }
        Insert: {
          agent_id: string
          agent_version?: number | null
          agent_version_snapshot_id?: string | null
          comparison_set_id: string
          conversation_id: string
          created_at?: string
          display_order: number
          id?: string
          metadata?: Json
        }
        Update: {
          agent_id?: string
          agent_version?: number | null
          agent_version_snapshot_id?: string | null
          comparison_set_id?: string
          conversation_id?: string
          created_at?: string
          display_order?: number
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "cmp_comparison_entries_comparison_set_id_fkey"
            columns: ["comparison_set_id"]
            isOneToOne: false
            referencedRelation: "cmp_comparison_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      cmp_comparison_sets: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          name: string
          organization_id: string | null
          project_id: string | null
          task_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          organization_id?: string | null
          project_id?: string | null
          task_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          organization_id?: string | null
          project_id?: string | null
          task_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cmp_response_feedback: {
        Row: {
          comment: string | null
          comparison_set_id: string | null
          conversation_id: string
          created_at: string
          id: string
          metadata: Json
          overall: number | null
          rank: number | null
          rating: string | null
          request_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          comparison_set_id?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json
          overall?: number | null
          rank?: number | null
          rating?: string | null
          request_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          comparison_set_id?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          overall?: number | null
          rank?: number | null
          rating?: string | null
          request_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cmp_response_feedback_comparison_set_id_fkey"
            columns: ["comparison_set_id"]
            isOneToOne: false
            referencedRelation: "cmp_comparison_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      code_file_folders: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon_name: string
          id: string
          is_active: boolean
          is_public: boolean
          metadata: Json
          name: string
          organization_id: string | null
          parent_folder_id: string | null
          project_id: string | null
          sort_order: number | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon_name?: string
          id?: string
          is_active?: boolean
          is_public?: boolean
          metadata?: Json
          name: string
          organization_id?: string | null
          parent_folder_id?: string | null
          project_id?: string | null
          sort_order?: number | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon_name?: string
          id?: string
          is_active?: boolean
          is_public?: boolean
          metadata?: Json
          name?: string
          organization_id?: string | null
          parent_folder_id?: string | null
          project_id?: string | null
          sort_order?: number | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "code_file_folders_parent_folder_id_fkey"
            columns: ["parent_folder_id"]
            isOneToOne: false
            referencedRelation: "code_file_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_file_folders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      code_file_versions: {
        Row: {
          change_note: string | null
          change_source: string
          change_type: string | null
          changed_at: string
          code_file_id: string
          content: string | null
          diff_metadata: Json
          id: string
          language: string | null
          name: string | null
          user_id: string
          version_number: number
        }
        Insert: {
          change_note?: string | null
          change_source?: string
          change_type?: string | null
          changed_at?: string
          code_file_id: string
          content?: string | null
          diff_metadata?: Json
          id?: string
          language?: string | null
          name?: string | null
          user_id: string
          version_number: number
        }
        Update: {
          change_note?: string | null
          change_source?: string
          change_type?: string | null
          changed_at?: string
          code_file_id?: string
          content?: string | null
          diff_metadata?: Json
          id?: string
          language?: string | null
          name?: string | null
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "code_file_versions_code_file_id_fkey"
            columns: ["code_file_id"]
            isOneToOne: false
            referencedRelation: "code_files"
            referencedColumns: ["id"]
          },
        ]
      }
      code_files: {
        Row: {
          content: string
          content_hash: string | null
          created_at: string
          folder_id: string | null
          id: string
          is_deleted: boolean
          is_public: boolean
          is_readonly: boolean
          language: string
          metadata: Json
          name: string
          organization_id: string | null
          path: string
          project_id: string | null
          repository_id: string | null
          s3_bucket: string | null
          s3_key: string | null
          tags: string[]
          task_id: string | null
          updated_at: string
          user_id: string
          version: number
          workspace_id: string | null
        }
        Insert: {
          content?: string
          content_hash?: string | null
          created_at?: string
          folder_id?: string | null
          id?: string
          is_deleted?: boolean
          is_public?: boolean
          is_readonly?: boolean
          language?: string
          metadata?: Json
          name: string
          organization_id?: string | null
          path?: string
          project_id?: string | null
          repository_id?: string | null
          s3_bucket?: string | null
          s3_key?: string | null
          tags?: string[]
          task_id?: string | null
          updated_at?: string
          user_id: string
          version?: number
          workspace_id?: string | null
        }
        Update: {
          content?: string
          content_hash?: string | null
          created_at?: string
          folder_id?: string | null
          id?: string
          is_deleted?: boolean
          is_public?: boolean
          is_readonly?: boolean
          language?: string
          metadata?: Json
          name?: string
          organization_id?: string | null
          path?: string
          project_id?: string | null
          repository_id?: string | null
          s3_bucket?: string | null
          s3_key?: string | null
          tags?: string[]
          task_id?: string | null
          updated_at?: string
          user_id?: string
          version?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "code_files_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "code_file_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_files_repository_id_fkey"
            columns: ["repository_id"]
            isOneToOne: false
            referencedRelation: "code_repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      code_repositories: {
        Row: {
          created_at: string
          description: string | null
          git_branch: string | null
          git_commit_sha: string | null
          git_provider: string | null
          git_url: string | null
          id: string
          is_active: boolean
          is_public: boolean
          last_synced_at: string | null
          metadata: Json
          name: string
          organization_id: string | null
          project_id: string | null
          root_folder_id: string | null
          s3_bucket: string | null
          s3_prefix: string | null
          sync_error: string | null
          sync_status: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          git_branch?: string | null
          git_commit_sha?: string | null
          git_provider?: string | null
          git_url?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          last_synced_at?: string | null
          metadata?: Json
          name: string
          organization_id?: string | null
          project_id?: string | null
          root_folder_id?: string | null
          s3_bucket?: string | null
          s3_prefix?: string | null
          sync_error?: string | null
          sync_status?: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          git_branch?: string | null
          git_commit_sha?: string | null
          git_provider?: string | null
          git_url?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          last_synced_at?: string | null
          metadata?: Json
          name?: string
          organization_id?: string | null
          project_id?: string | null
          root_folder_id?: string | null
          s3_bucket?: string | null
          s3_prefix?: string | null
          sync_error?: string | null
          sync_status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "code_repositories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_repositories_root_folder_id_fkey"
            columns: ["root_folder_id"]
            isOneToOne: false
            referencedRelation: "code_file_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      compiled_recipe: {
        Row: {
          compiled_recipe: Json
          created_at: string
          id: string
          is_public: boolean
          recipe_id: string | null
          updated_at: string
          user_id: string | null
          version: number | null
        }
        Insert: {
          compiled_recipe: Json
          created_at?: string
          id?: string
          is_public?: boolean
          recipe_id?: string | null
          updated_at?: string
          user_id?: string | null
          version?: number | null
        }
        Update: {
          compiled_recipe?: Json
          created_at?: string
          id?: string
          is_public?: boolean
          recipe_id?: string | null
          updated_at?: string
          user_id?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "compiled_recipe_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compiled_recipe_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compiled_recipe_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_complete"
            referencedColumns: ["recipe_id"]
          },
        ]
      }
      component_groups: {
        Row: {
          created_at: string
          description: string | null
          fields: Json | null
          help_text: string | null
          hide_description: boolean | null
          id: string
          is_public: boolean | null
          label: string
          public_read: boolean | null
          short_label: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          fields?: Json | null
          help_text?: string | null
          hide_description?: boolean | null
          id?: string
          is_public?: boolean | null
          label?: string
          public_read?: boolean | null
          short_label?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          fields?: Json | null
          help_text?: string | null
          hide_description?: boolean | null
          id?: string
          is_public?: boolean | null
          label?: string
          public_read?: boolean | null
          short_label?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      contact_submissions: {
        Row: {
          admin_notes: string | null
          created_at: string | null
          email: string
          id: string
          message: string
          name: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          subject: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string | null
          email: string
          id?: string
          message: string
          name: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subject: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string | null
          email?: string
          id?: string
          message?: string
          name?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subject?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      container_fields: {
        Row: {
          container_id: string
          created_at: string
          field_id: string
          id: string
          order: number
          updated_at: string | null
        }
        Insert: {
          container_id: string
          created_at?: string
          field_id: string
          id?: string
          order?: number
          updated_at?: string | null
        }
        Update: {
          container_id?: string
          created_at?: string
          field_id?: string
          id?: string
          order?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "container_fields_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "component_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "container_fields_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "field_components"
            referencedColumns: ["id"]
          },
        ]
      }
      content_blocks: {
        Row: {
          block_id: string
          category_id: string | null
          created_at: string | null
          description: string | null
          icon_name: string
          id: string
          is_active: boolean | null
          label: string
          organization_id: string | null
          project_id: string | null
          sort_order: number | null
          task_id: string | null
          template: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          block_id: string
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          icon_name: string
          id?: string
          is_active?: boolean | null
          label: string
          organization_id?: string | null
          project_id?: string | null
          sort_order?: number | null
          task_id?: string | null
          template: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          block_id?: string
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          icon_name?: string
          id?: string
          is_active?: boolean | null
          label?: string
          organization_id?: string | null
          project_id?: string | null
          sort_order?: number | null
          task_id?: string | null
          template?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_blocks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "shortcut_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_blocks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "shortcuts_by_placement_view"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "content_blocks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      content_template: {
        Row: {
          content: string | null
          created_at: string
          id: string
          is_public: boolean | null
          label: string | null
          metadata: Json | null
          organization_id: string | null
          project_id: string | null
          role: Database["public"]["Enums"]["message_role"] | null
          tags: string[] | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          is_public?: boolean | null
          label?: string | null
          metadata?: Json | null
          organization_id?: string | null
          project_id?: string | null
          role?: Database["public"]["Enums"]["message_role"] | null
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          is_public?: boolean | null
          label?: string | null
          metadata?: Json | null
          organization_id?: string | null
          project_id?: string | null
          role?: Database["public"]["Enums"]["message_role"] | null
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_template_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_template_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation: {
        Row: {
          created_at: string
          description: string | null
          group: string | null
          id: string
          is_public: boolean | null
          keywords: Json | null
          label: string | null
          metadata: Json | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          group?: string | null
          id?: string
          is_public?: boolean | null
          keywords?: Json | null
          label?: string | null
          metadata?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          group?: string | null
          id?: string
          is_public?: boolean | null
          keywords?: Json | null
          label?: string | null
          metadata?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          is_muted: boolean
          is_pinned: boolean
          joined_at: string
          last_read_message_id: string | null
          role: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          is_muted?: boolean
          is_pinned?: boolean
          joined_at?: string
          last_read_message_id?: string | null
          role?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          is_muted?: boolean
          is_pinned?: boolean
          joined_at?: string
          last_read_message_id?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_last_read_message"
            columns: ["last_read_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string
          id: string
          name: string | null
          type: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by: string
          id?: string
          name?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ctx_context_access_log: {
        Row: {
          accessed_at: string
          agent_id: string | null
          app_source: string | null
          char_count_served: number | null
          context_item_id: string
          fetch_reason: string | null
          id: string
          latency_ms: number | null
          request_id: string | null
          user_id: string | null
          value_id: string | null
          value_version: number | null
          was_useful: boolean | null
        }
        Insert: {
          accessed_at?: string
          agent_id?: string | null
          app_source?: string | null
          char_count_served?: number | null
          context_item_id: string
          fetch_reason?: string | null
          id?: string
          latency_ms?: number | null
          request_id?: string | null
          user_id?: string | null
          value_id?: string | null
          value_version?: number | null
          was_useful?: boolean | null
        }
        Update: {
          accessed_at?: string
          agent_id?: string | null
          app_source?: string | null
          char_count_served?: number | null
          context_item_id?: string
          fetch_reason?: string | null
          id?: string
          latency_ms?: number | null
          request_id?: string | null
          user_id?: string | null
          value_id?: string | null
          value_version?: number | null
          was_useful?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "context_access_log_context_item_id_fkey"
            columns: ["context_item_id"]
            isOneToOne: false
            referencedRelation: "ctx_context_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "context_access_log_value_id_fkey"
            columns: ["value_id"]
            isOneToOne: false
            referencedRelation: "ctx_context_item_values"
            referencedColumns: ["id"]
          },
        ]
      }
      ctx_context_item_values: {
        Row: {
          authored_by: string | null
          change_summary: string | null
          char_count: number | null
          context_item_id: string
          created_at: string
          data_point_count: number | null
          has_nested_objects: boolean
          id: string
          is_current: boolean
          scope_id: string
          source_type: Database["public"]["Enums"]["context_source_type"]
          value_boolean: boolean | null
          value_document_size_bytes: number | null
          value_document_url: string | null
          value_json: Json | null
          value_number: number | null
          value_reference_id: string | null
          value_reference_type: string | null
          value_text: string | null
          version: number
        }
        Insert: {
          authored_by?: string | null
          change_summary?: string | null
          char_count?: number | null
          context_item_id: string
          created_at?: string
          data_point_count?: number | null
          has_nested_objects?: boolean
          id?: string
          is_current?: boolean
          scope_id: string
          source_type?: Database["public"]["Enums"]["context_source_type"]
          value_boolean?: boolean | null
          value_document_size_bytes?: number | null
          value_document_url?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_reference_id?: string | null
          value_reference_type?: string | null
          value_text?: string | null
          version?: number
        }
        Update: {
          authored_by?: string | null
          change_summary?: string | null
          char_count?: number | null
          context_item_id?: string
          created_at?: string
          data_point_count?: number | null
          has_nested_objects?: boolean
          id?: string
          is_current?: boolean
          scope_id?: string
          source_type?: Database["public"]["Enums"]["context_source_type"]
          value_boolean?: boolean | null
          value_document_size_bytes?: number | null
          value_document_url?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_reference_id?: string | null
          value_reference_type?: string | null
          value_text?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "context_item_values_context_item_id_fkey"
            columns: ["context_item_id"]
            isOneToOne: false
            referencedRelation: "ctx_context_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ctx_context_item_values_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "ctx_scopes"
            referencedColumns: ["id"]
          },
        ]
      }
      ctx_context_items: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          depends_on: string[]
          description: string
          display_name: string
          fetch_hint: Database["public"]["Enums"]["context_fetch_hint"]
          id: string
          is_active: boolean
          key: string
          last_verified_at: string | null
          next_review_at: string | null
          review_interval_days: number | null
          scope_type_id: string
          sensitivity: Database["public"]["Enums"]["context_sensitivity"]
          source_type: Database["public"]["Enums"]["context_source_type"]
          status: Database["public"]["Enums"]["context_item_status"]
          status_note: string | null
          status_updated_at: string
          status_updated_by: string | null
          tags: string[]
          template_item_key: string | null
          updated_at: string
          value_type: Database["public"]["Enums"]["context_value_type"]
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          depends_on?: string[]
          description?: string
          display_name: string
          fetch_hint?: Database["public"]["Enums"]["context_fetch_hint"]
          id?: string
          is_active?: boolean
          key: string
          last_verified_at?: string | null
          next_review_at?: string | null
          review_interval_days?: number | null
          scope_type_id: string
          sensitivity?: Database["public"]["Enums"]["context_sensitivity"]
          source_type?: Database["public"]["Enums"]["context_source_type"]
          status?: Database["public"]["Enums"]["context_item_status"]
          status_note?: string | null
          status_updated_at?: string
          status_updated_by?: string | null
          tags?: string[]
          template_item_key?: string | null
          updated_at?: string
          value_type?: Database["public"]["Enums"]["context_value_type"]
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          depends_on?: string[]
          description?: string
          display_name?: string
          fetch_hint?: Database["public"]["Enums"]["context_fetch_hint"]
          id?: string
          is_active?: boolean
          key?: string
          last_verified_at?: string | null
          next_review_at?: string | null
          review_interval_days?: number | null
          scope_type_id?: string
          sensitivity?: Database["public"]["Enums"]["context_sensitivity"]
          source_type?: Database["public"]["Enums"]["context_source_type"]
          status?: Database["public"]["Enums"]["context_item_status"]
          status_note?: string | null
          status_updated_at?: string
          status_updated_by?: string | null
          tags?: string[]
          template_item_key?: string | null
          updated_at?: string
          value_type?: Database["public"]["Enums"]["context_value_type"]
        }
        Relationships: [
          {
            foreignKeyName: "ctx_context_items_scope_type_id_fkey"
            columns: ["scope_type_id"]
            isOneToOne: false
            referencedRelation: "ctx_scope_types"
            referencedColumns: ["id"]
          },
        ]
      }
      ctx_context_variables: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          inject_as: string
          is_active: boolean
          is_secret: boolean
          is_system: boolean
          key: string
          organization_id: string | null
          project_id: string | null
          scope_id: string | null
          tags: string[]
          task_id: string | null
          updated_at: string
          user_id: string | null
          value: Json
          value_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          inject_as?: string
          is_active?: boolean
          is_secret?: boolean
          is_system?: boolean
          key: string
          organization_id?: string | null
          project_id?: string | null
          scope_id?: string | null
          tags?: string[]
          task_id?: string | null
          updated_at?: string
          user_id?: string | null
          value: Json
          value_type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          inject_as?: string
          is_active?: boolean
          is_secret?: boolean
          is_system?: boolean
          key?: string
          organization_id?: string | null
          project_id?: string | null
          scope_id?: string | null
          tags?: string[]
          task_id?: string | null
          updated_at?: string
          user_id?: string | null
          value?: Json
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "context_variables_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "context_variables_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "context_variables_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "ctx_scopes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "context_variables_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ctx_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      ctx_project_invitations: {
        Row: {
          email: string
          email_sent: boolean | null
          email_sent_at: string | null
          expires_at: string
          id: string
          invited_at: string | null
          invited_by: string | null
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
          token: string
        }
        Insert: {
          email: string
          email_sent?: boolean | null
          email_sent_at?: string | null
          expires_at: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          project_id: string
          role?: Database["public"]["Enums"]["project_role"]
          token: string
        }
        Update: {
          email?: string
          email_sent?: boolean | null
          email_sent_at?: string | null
          expires_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          project_id?: string
          role?: Database["public"]["Enums"]["project_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_invitations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ctx_project_members: {
        Row: {
          created_at: string | null
          id: string
          invited_by: string | null
          joined_at: string | null
          project_id: string | null
          role: Database["public"]["Enums"]["project_role"]
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          project_id?: string | null
          role?: Database["public"]["Enums"]["project_role"]
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          project_id?: string | null
          role?: Database["public"]["Enums"]["project_role"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ctx_projects: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_personal: boolean | null
          name: string
          organization_id: string | null
          settings: Json | null
          slug: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_personal?: boolean | null
          name: string
          organization_id?: string | null
          settings?: Json | null
          slug?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_personal?: boolean | null
          name?: string
          organization_id?: string | null
          settings?: Json | null
          slug?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ctx_scope_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          id: string
          scope_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          scope_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          scope_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ctx_scope_assignments_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "ctx_scopes"
            referencedColumns: ["id"]
          },
        ]
      }
      ctx_scope_types: {
        Row: {
          color: string
          created_at: string
          default_variable_keys: string[]
          description: string
          icon: string
          id: string
          label_plural: string
          label_singular: string
          max_assignments_per_entity: number | null
          organization_id: string
          parent_type_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          default_variable_keys?: string[]
          description?: string
          icon?: string
          id?: string
          label_plural: string
          label_singular: string
          max_assignments_per_entity?: number | null
          organization_id: string
          parent_type_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          default_variable_keys?: string[]
          description?: string
          icon?: string
          id?: string
          label_plural?: string
          label_singular?: string
          max_assignments_per_entity?: number | null
          organization_id?: string
          parent_type_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ctx_scope_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ctx_scope_types_parent_type_id_fkey"
            columns: ["parent_type_id"]
            isOneToOne: false
            referencedRelation: "ctx_scope_types"
            referencedColumns: ["id"]
          },
        ]
      }
      ctx_scopes: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          name: string
          organization_id: string
          parent_scope_id: string | null
          scope_type_id: string
          settings: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name: string
          organization_id: string
          parent_scope_id?: string | null
          scope_type_id: string
          settings?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name?: string
          organization_id?: string
          parent_scope_id?: string | null
          scope_type_id?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ctx_scopes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ctx_scopes_parent_scope_id_fkey"
            columns: ["parent_scope_id"]
            isOneToOne: false
            referencedRelation: "ctx_scopes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ctx_scopes_scope_type_id_fkey"
            columns: ["scope_type_id"]
            isOneToOne: false
            referencedRelation: "ctx_scope_types"
            referencedColumns: ["id"]
          },
        ]
      }
      ctx_task_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          id: string
          task_id: string | null
          user_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          task_id?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          task_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_assignments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ctx_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      ctx_task_associations: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          id: string
          label: string | null
          metadata: Json
          task_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          label?: string | null
          metadata?: Json
          task_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          label?: string | null
          metadata?: Json
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ctx_task_associations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ctx_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      ctx_task_attachments: {
        Row: {
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          task_id: string | null
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          task_id?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          task_id?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ctx_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      ctx_task_comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          task_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          task_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          task_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ctx_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      ctx_tasks: {
        Row: {
          assignee_id: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          is_public: boolean
          organization_id: string | null
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["task_priority"] | null
          project_id: string | null
          settings: Json
          status: string
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_public?: boolean
          organization_id?: string | null
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          project_id?: string | null
          settings?: Json
          status?: string
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          assignee_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_public?: boolean
          organization_id?: string | null
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          project_id?: string | null
          settings?: Json
          status?: string
          title?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "ctx_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ctx_template_context_items: {
        Row: {
          description: string
          display_name: string
          id: string
          key: string
          sort_order: number
          template_scope_type_id: string
          value_type: Database["public"]["Enums"]["context_value_type"]
        }
        Insert: {
          description?: string
          display_name: string
          id?: string
          key: string
          sort_order?: number
          template_scope_type_id: string
          value_type?: Database["public"]["Enums"]["context_value_type"]
        }
        Update: {
          description?: string
          display_name?: string
          id?: string
          key?: string
          sort_order?: number
          template_scope_type_id?: string
          value_type?: Database["public"]["Enums"]["context_value_type"]
        }
        Relationships: [
          {
            foreignKeyName: "ctx_template_context_items_template_scope_type_id_fkey"
            columns: ["template_scope_type_id"]
            isOneToOne: false
            referencedRelation: "ctx_template_scope_types"
            referencedColumns: ["id"]
          },
        ]
      }
      ctx_template_scope_types: {
        Row: {
          description: string
          icon: string
          id: string
          key: string
          label_plural: string
          label_singular: string
          max_assignments_per_entity: number | null
          parent_template_type_id: string | null
          sort_order: number
          template_id: string
        }
        Insert: {
          description?: string
          icon?: string
          id?: string
          key: string
          label_plural: string
          label_singular: string
          max_assignments_per_entity?: number | null
          parent_template_type_id?: string | null
          sort_order?: number
          template_id: string
        }
        Update: {
          description?: string
          icon?: string
          id?: string
          key?: string
          label_plural?: string
          label_singular?: string
          max_assignments_per_entity?: number | null
          parent_template_type_id?: string | null
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ctx_template_scope_types_parent_template_type_id_fkey"
            columns: ["parent_template_type_id"]
            isOneToOne: false
            referencedRelation: "ctx_template_scope_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ctx_template_scope_types_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "ctx_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      ctx_templates: {
        Row: {
          category: string
          created_at: string
          description: string
          icon: string
          id: string
          is_active: boolean
          is_personal: boolean
          key: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string
          icon?: string
          id?: string
          is_active?: boolean
          is_personal?: boolean
          key: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          icon?: string
          id?: string
          is_active?: boolean
          is_personal?: boolean
          key?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      ctx_user_active_context: {
        Row: {
          active_entity_id: string | null
          active_entity_type: string | null
          app_source: string
          last_activity: string
          organization_id: string | null
          project_id: string | null
          task_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_entity_id?: string | null
          active_entity_type?: string | null
          app_source?: string
          last_activity?: string
          organization_id?: string | null
          project_id?: string | null
          task_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_entity_id?: string | null
          active_entity_type?: string | null
          app_source?: string
          last_activity?: string
          organization_id?: string | null
          project_id?: string | null
          task_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_active_context_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_active_context_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_active_context_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ctx_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_app_configs: {
        Row: {
          accent_color: string | null
          app_data_context: Json | null
          applet_list: Json | null
          created_at: string
          creator: string | null
          description: string | null
          extra_buttons: Json | null
          id: string
          image_url: string | null
          is_public: boolean | null
          layout_type: string | null
          main_app_icon: string | null
          main_app_submit_icon: string | null
          name: string
          primary_color: string | null
          public_read: boolean | null
          slug: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          accent_color?: string | null
          app_data_context?: Json | null
          applet_list?: Json | null
          created_at?: string
          creator?: string | null
          description?: string | null
          extra_buttons?: Json | null
          id?: string
          image_url?: string | null
          is_public?: boolean | null
          layout_type?: string | null
          main_app_icon?: string | null
          main_app_submit_icon?: string | null
          name: string
          primary_color?: string | null
          public_read?: boolean | null
          slug: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          accent_color?: string | null
          app_data_context?: Json | null
          applet_list?: Json | null
          created_at?: string
          creator?: string | null
          description?: string | null
          extra_buttons?: Json | null
          id?: string
          image_url?: string | null
          is_public?: boolean | null
          layout_type?: string | null
          main_app_icon?: string | null
          main_app_submit_icon?: string | null
          name?: string
          primary_color?: string | null
          public_read?: boolean | null
          slug?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      custom_applet_configs: {
        Row: {
          accent_color: string | null
          app_id: string | null
          applet_icon: string | null
          applet_submit_text: string | null
          broker_map: Json | null
          compiled_recipe_id: string | null
          containers: Json | null
          created_at: string
          creator: string | null
          data_destination_config: Json | null
          data_source_config: Json | null
          description: string | null
          id: string
          image_url: string | null
          is_public: boolean | null
          layout_type: string | null
          name: string
          next_step_config: Json | null
          overview_label: string | null
          primary_color: string | null
          public_read: boolean | null
          result_component_config: Json | null
          slug: string
          subcategory_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          accent_color?: string | null
          app_id?: string | null
          applet_icon?: string | null
          applet_submit_text?: string | null
          broker_map?: Json | null
          compiled_recipe_id?: string | null
          containers?: Json | null
          created_at?: string
          creator?: string | null
          data_destination_config?: Json | null
          data_source_config?: Json | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_public?: boolean | null
          layout_type?: string | null
          name: string
          next_step_config?: Json | null
          overview_label?: string | null
          primary_color?: string | null
          public_read?: boolean | null
          result_component_config?: Json | null
          slug: string
          subcategory_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          accent_color?: string | null
          app_id?: string | null
          applet_icon?: string | null
          applet_submit_text?: string | null
          broker_map?: Json | null
          compiled_recipe_id?: string | null
          containers?: Json | null
          created_at?: string
          creator?: string | null
          data_destination_config?: Json | null
          data_source_config?: Json | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_public?: boolean | null
          layout_type?: string | null
          name?: string
          next_step_config?: Json | null
          overview_label?: string | null
          primary_color?: string | null
          public_read?: boolean | null
          result_component_config?: Json | null
          slug?: string
          subcategory_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_applet_configs_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "custom_app_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_applet_configs_compiled_recipe_id_fkey"
            columns: ["compiled_recipe_id"]
            isOneToOne: false
            referencedRelation: "compiled_recipe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_applet_configs_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategory"
            referencedColumns: ["id"]
          },
        ]
      }
      cx_agent_memory: {
        Row: {
          access_count: number | null
          content: string
          created_at: string
          deleted_at: string | null
          expires_at: string | null
          id: string
          importance: number | null
          key: string
          last_accessed_at: string | null
          memory_type: string
          metadata: Json
          scope: string
          scope_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_count?: number | null
          content: string
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          importance?: number | null
          key: string
          last_accessed_at?: string | null
          memory_type: string
          metadata?: Json
          scope?: string
          scope_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_count?: number | null
          content?: string
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          importance?: number | null
          key?: string
          last_accessed_at?: string | null
          memory_type?: string
          metadata?: Json
          scope?: string
          scope_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cx_agent_plan: {
        Row: {
          conversation_id: string
          created_at: string
          domains: string[] | null
          estimated_minutes: number | null
          id: string
          project_id: string | null
          reasoning: string | null
          status: Database["public"]["Enums"]["cx_plan_status"]
          steps: Json
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          domains?: string[] | null
          estimated_minutes?: number | null
          id?: string
          project_id?: string | null
          reasoning?: string | null
          status?: Database["public"]["Enums"]["cx_plan_status"]
          steps?: Json
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          domains?: string[] | null
          estimated_minutes?: number | null
          id?: string
          project_id?: string | null
          reasoning?: string | null
          status?: Database["public"]["Enums"]["cx_plan_status"]
          steps?: Json
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cx_agent_plan_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_agent_plan_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_agent_plan_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cx_agent_task: {
        Row: {
          conversation_id: string
          created_at: string
          created_by: Database["public"]["Enums"]["cx_agent_task_creator"]
          id: string
          note: string | null
          plan_id: string | null
          position: number
          status: Database["public"]["Enums"]["cx_agent_task_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          created_by?: Database["public"]["Enums"]["cx_agent_task_creator"]
          id?: string
          note?: string | null
          plan_id?: string | null
          position?: number
          status?: Database["public"]["Enums"]["cx_agent_task_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          created_by?: Database["public"]["Enums"]["cx_agent_task_creator"]
          id?: string
          note?: string | null
          plan_id?: string | null
          position?: number
          status?: Database["public"]["Enums"]["cx_agent_task_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cx_agent_task_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_agent_task_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_agent_task_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "cx_agent_plan"
            referencedColumns: ["id"]
          },
        ]
      }
      cx_artifact: {
        Row: {
          artifact_type: Database["public"]["Enums"]["artifact_type"]
          conversation_id: string
          created_at: string
          deleted_at: string | null
          description: string | null
          external_id: string | null
          external_system: string | null
          external_url: string | null
          id: string
          message_id: string
          metadata: Json
          organization_id: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["artifact_status"]
          task_id: string | null
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          artifact_type: Database["public"]["Enums"]["artifact_type"]
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          external_id?: string | null
          external_system?: string | null
          external_url?: string | null
          id?: string
          message_id: string
          metadata?: Json
          organization_id?: string | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["artifact_status"]
          task_id?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          artifact_type?: Database["public"]["Enums"]["artifact_type"]
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          external_id?: string | null
          external_system?: string | null
          external_url?: string | null
          id?: string
          message_id?: string
          metadata?: Json
          organization_id?: string | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["artifact_status"]
          task_id?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cx_artifact_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_artifact_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_artifact_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "cx_message"
            referencedColumns: ["id"]
          },
        ]
      }
      cx_code_edit: {
        Row: {
          applied_at: string | null
          block_index: number
          conversation_id: string
          created_at: string
          id: string
          message_file_id: string
          message_id: string
          reject_reason: string | null
          rejected_at: string | null
          replace_text: string
          reverted_at: string | null
          search_text: string
          status: Database["public"]["Enums"]["code_edit_status"]
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          block_index: number
          conversation_id: string
          created_at?: string
          id?: string
          message_file_id: string
          message_id: string
          reject_reason?: string | null
          rejected_at?: string | null
          replace_text: string
          reverted_at?: string | null
          search_text: string
          status: Database["public"]["Enums"]["code_edit_status"]
          user_id: string
        }
        Update: {
          applied_at?: string | null
          block_index?: number
          conversation_id?: string
          created_at?: string
          id?: string
          message_file_id?: string
          message_id?: string
          reject_reason?: string | null
          rejected_at?: string | null
          replace_text?: string
          reverted_at?: string | null
          search_text?: string
          status?: Database["public"]["Enums"]["code_edit_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cx_code_edit_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_code_edit_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_code_edit_message_file_id_fkey"
            columns: ["message_file_id"]
            isOneToOne: false
            referencedRelation: "cx_code_message_file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_code_edit_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "cx_message"
            referencedColumns: ["id"]
          },
        ]
      }
      cx_code_message_file: {
        Row: {
          after_content: string
          before_content: string
          conversation_id: string
          created_at: string
          edits_applied_count: number
          edits_pending_count: number
          edits_rejected_count: number
          file_adapter: string
          file_path: string
          git_branch: string | null
          git_commit_sha: string | null
          id: string
          library_file_id: string | null
          message_id: string
          organization_id: string | null
          reverted_at: string | null
          status: Database["public"]["Enums"]["code_message_file_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          after_content: string
          before_content: string
          conversation_id: string
          created_at?: string
          edits_applied_count?: number
          edits_pending_count?: number
          edits_rejected_count?: number
          file_adapter: string
          file_path: string
          git_branch?: string | null
          git_commit_sha?: string | null
          id?: string
          library_file_id?: string | null
          message_id: string
          organization_id?: string | null
          reverted_at?: string | null
          status?: Database["public"]["Enums"]["code_message_file_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          after_content?: string
          before_content?: string
          conversation_id?: string
          created_at?: string
          edits_applied_count?: number
          edits_pending_count?: number
          edits_rejected_count?: number
          file_adapter?: string
          file_path?: string
          git_branch?: string | null
          git_commit_sha?: string | null
          id?: string
          library_file_id?: string | null
          message_id?: string
          organization_id?: string | null
          reverted_at?: string | null
          status?: Database["public"]["Enums"]["code_message_file_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cx_code_message_file_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_code_message_file_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_code_message_file_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "cx_message"
            referencedColumns: ["id"]
          },
        ]
      }
      cx_conversation: {
        Row: {
          cache_state: Json
          config: Json
          created_at: string
          deleted_at: string | null
          description: string | null
          forked_at_position: number | null
          forked_from_id: string | null
          id: string
          initial_agent_id: string | null
          initial_agent_version_id: string | null
          is_ephemeral: boolean
          is_favorite: boolean
          is_public: boolean
          keywords: string[] | null
          last_context_breakdown: Json | null
          last_model_id: string | null
          message_count: number
          metadata: Json
          organization_id: string | null
          overrides: Json
          parent_conversation_id: string | null
          project_id: string | null
          source_app: string
          source_feature: string
          status: string
          system_instruction: string | null
          task_id: string | null
          title: string | null
          updated_at: string
          user_id: string
          variables: Json
        }
        Insert: {
          cache_state?: Json
          config?: Json
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          forked_at_position?: number | null
          forked_from_id?: string | null
          id?: string
          initial_agent_id?: string | null
          initial_agent_version_id?: string | null
          is_ephemeral?: boolean
          is_favorite?: boolean
          is_public?: boolean
          keywords?: string[] | null
          last_context_breakdown?: Json | null
          last_model_id?: string | null
          message_count?: number
          metadata?: Json
          organization_id?: string | null
          overrides?: Json
          parent_conversation_id?: string | null
          project_id?: string | null
          source_app?: string
          source_feature?: string
          status?: string
          system_instruction?: string | null
          task_id?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
          variables?: Json
        }
        Update: {
          cache_state?: Json
          config?: Json
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          forked_at_position?: number | null
          forked_from_id?: string | null
          id?: string
          initial_agent_id?: string | null
          initial_agent_version_id?: string | null
          is_ephemeral?: boolean
          is_favorite?: boolean
          is_public?: boolean
          keywords?: string[] | null
          last_context_breakdown?: Json | null
          last_model_id?: string | null
          message_count?: number
          metadata?: Json
          organization_id?: string | null
          overrides?: Json
          parent_conversation_id?: string | null
          project_id?: string | null
          source_app?: string
          source_feature?: string
          status?: string
          system_instruction?: string | null
          task_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "cx_conversation_forked_from_id_fkey"
            columns: ["forked_from_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_conversation_forked_from_id_fkey"
            columns: ["forked_from_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_conversation_initial_agent_fk"
            columns: ["initial_agent_id"]
            isOneToOne: false
            referencedRelation: "agx_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_conversation_initial_agent_version_fk"
            columns: ["initial_agent_version_id"]
            isOneToOne: false
            referencedRelation: "agx_version"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_conversation_last_model_id_fkey"
            columns: ["last_model_id"]
            isOneToOne: false
            referencedRelation: "ai_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_conversation_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_conversation_parent_conversation_id_fkey"
            columns: ["parent_conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_conversation_parent_conversation_id_fkey"
            columns: ["parent_conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_conversation_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_conversation_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ctx_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      cx_media: {
        Row: {
          conversation_id: string | null
          created_at: string
          deleted_at: string | null
          file_size_bytes: number | null
          file_uri: string | null
          id: string
          kind: string
          metadata: Json
          mime_type: string | null
          url: string
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          file_size_bytes?: number | null
          file_uri?: string | null
          id?: string
          kind: string
          metadata?: Json
          mime_type?: string | null
          url: string
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          file_size_bytes?: number | null
          file_uri?: string | null
          id?: string
          kind?: string
          metadata?: Json
          mime_type?: string | null
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cx_media_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_media_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      cx_message: {
        Row: {
          agent_id: string | null
          content: Json
          content_chars: number
          content_history: Json | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          id: string
          is_visible_to_model: boolean
          is_visible_to_user: boolean
          metadata: Json
          position: number
          role: string
          source: string
          status: string
          tool_results_chars: number
          user_content: Json | null
        }
        Insert: {
          agent_id?: string | null
          content?: Json
          content_chars?: number
          content_history?: Json | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_visible_to_model?: boolean
          is_visible_to_user?: boolean
          metadata?: Json
          position: number
          role: string
          source?: string
          status?: string
          tool_results_chars?: number
          user_content?: Json | null
        }
        Update: {
          agent_id?: string | null
          content?: Json
          content_chars?: number
          content_history?: Json | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_visible_to_model?: boolean
          is_visible_to_user?: boolean
          metadata?: Json
          position?: number
          role?: string
          source?: string
          status?: string
          tool_results_chars?: number
          user_content?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "cx_message_agx_agent_fk"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agx_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_message_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_message_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      cx_observational_memory: {
        Row: {
          active_observations: string | null
          buffered_observations: Json
          buffered_reflection: string | null
          buffered_reflection_input_tokens: number
          buffered_reflection_tokens: number
          config: Json | null
          conversation_id: string | null
          created_at: string
          current_task: string | null
          deleted_at: string | null
          generation_count: number
          id: string
          is_buffering_observation: boolean
          is_buffering_reflection: boolean
          last_buffered_at_time: string | null
          last_buffered_at_tokens: number
          last_observed_at: string | null
          metadata: Json
          observation_token_count: number
          observed_message_ids: Json
          observed_timezone: string | null
          pending_message_tokens: number
          reflected_observation_line_count: number
          scope: string
          suggested_response: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_observations?: string | null
          buffered_observations?: Json
          buffered_reflection?: string | null
          buffered_reflection_input_tokens?: number
          buffered_reflection_tokens?: number
          config?: Json | null
          conversation_id?: string | null
          created_at?: string
          current_task?: string | null
          deleted_at?: string | null
          generation_count?: number
          id?: string
          is_buffering_observation?: boolean
          is_buffering_reflection?: boolean
          last_buffered_at_time?: string | null
          last_buffered_at_tokens?: number
          last_observed_at?: string | null
          metadata?: Json
          observation_token_count?: number
          observed_message_ids?: Json
          observed_timezone?: string | null
          pending_message_tokens?: number
          reflected_observation_line_count?: number
          scope?: string
          suggested_response?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_observations?: string | null
          buffered_observations?: Json
          buffered_reflection?: string | null
          buffered_reflection_input_tokens?: number
          buffered_reflection_tokens?: number
          config?: Json | null
          conversation_id?: string | null
          created_at?: string
          current_task?: string | null
          deleted_at?: string | null
          generation_count?: number
          id?: string
          is_buffering_observation?: boolean
          is_buffering_reflection?: boolean
          last_buffered_at_time?: string | null
          last_buffered_at_tokens?: number
          last_observed_at?: string | null
          metadata?: Json
          observation_token_count?: number
          observed_message_ids?: Json
          observed_timezone?: string | null
          pending_message_tokens?: number
          reflected_observation_line_count?: number
          scope?: string
          suggested_response?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cx_observational_memory_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_observational_memory_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      cx_observational_memory_event: {
        Row: {
          completed_at: string | null
          conversation_id: string | null
          cost: number
          created_at: string
          duration_ms: number | null
          error: string | null
          event_type: string
          id: string
          input_tokens: number
          memory_record_id: string | null
          metadata: Json
          model: string | null
          output_tokens: number
          success: boolean
          trigger_reason: string | null
          triggered_at: string
          user_id: string
          user_request_id: string | null
        }
        Insert: {
          completed_at?: string | null
          conversation_id?: string | null
          cost?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          event_type: string
          id?: string
          input_tokens?: number
          memory_record_id?: string | null
          metadata?: Json
          model?: string | null
          output_tokens?: number
          success?: boolean
          trigger_reason?: string | null
          triggered_at?: string
          user_id: string
          user_request_id?: string | null
        }
        Update: {
          completed_at?: string | null
          conversation_id?: string | null
          cost?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          event_type?: string
          id?: string
          input_tokens?: number
          memory_record_id?: string | null
          metadata?: Json
          model?: string | null
          output_tokens?: number
          success?: boolean
          trigger_reason?: string | null
          triggered_at?: string
          user_id?: string
          user_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cx_observational_memory_event_memory_record_id_fkey"
            columns: ["memory_record_id"]
            isOneToOne: false
            referencedRelation: "cx_observational_memory"
            referencedColumns: ["id"]
          },
        ]
      }
      cx_request: {
        Row: {
          ai_model_id: string
          api_class: string | null
          api_duration_ms: number | null
          cached_tokens: number | null
          conversation_id: string
          cost: number | null
          created_at: string
          deleted_at: string | null
          finish_reason: string | null
          id: string
          input_tokens: number | null
          iteration: number
          metadata: Json
          output_tokens: number | null
          raw_usage: Json | null
          response_id: string | null
          tool_calls_count: number | null
          tool_calls_details: Json | null
          tool_duration_ms: number | null
          total_duration_ms: number | null
          total_tokens: number | null
          trim_summary: Json | null
          user_request_id: string
        }
        Insert: {
          ai_model_id: string
          api_class?: string | null
          api_duration_ms?: number | null
          cached_tokens?: number | null
          conversation_id: string
          cost?: number | null
          created_at?: string
          deleted_at?: string | null
          finish_reason?: string | null
          id?: string
          input_tokens?: number | null
          iteration?: number
          metadata?: Json
          output_tokens?: number | null
          raw_usage?: Json | null
          response_id?: string | null
          tool_calls_count?: number | null
          tool_calls_details?: Json | null
          tool_duration_ms?: number | null
          total_duration_ms?: number | null
          total_tokens?: number | null
          trim_summary?: Json | null
          user_request_id: string
        }
        Update: {
          ai_model_id?: string
          api_class?: string | null
          api_duration_ms?: number | null
          cached_tokens?: number | null
          conversation_id?: string
          cost?: number | null
          created_at?: string
          deleted_at?: string | null
          finish_reason?: string | null
          id?: string
          input_tokens?: number | null
          iteration?: number
          metadata?: Json
          output_tokens?: number | null
          raw_usage?: Json | null
          response_id?: string | null
          tool_calls_count?: number | null
          tool_calls_details?: Json | null
          tool_duration_ms?: number | null
          total_duration_ms?: number | null
          total_tokens?: number | null
          trim_summary?: Json | null
          user_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cx_request_ai_model_id_fkey"
            columns: ["ai_model_id"]
            isOneToOne: false
            referencedRelation: "ai_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_request_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_request_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_request_user_request_id_fkey"
            columns: ["user_request_id"]
            isOneToOne: false
            referencedRelation: "cx_user_request"
            referencedColumns: ["id"]
          },
        ]
      }
      cx_request_snapshot: {
        Row: {
          conversation_id: string
          created_at: string
          cx_request_id: string | null
          id: string
          iteration: number
          model: string | null
          provider: string
          request_payload: Json
          response_message_id: string | null
          response_payload: Json | null
          trigger_message_id: string | null
          unified_payload: Json | null
          user_request_id: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          cx_request_id?: string | null
          id?: string
          iteration?: number
          model?: string | null
          provider: string
          request_payload: Json
          response_message_id?: string | null
          response_payload?: Json | null
          trigger_message_id?: string | null
          unified_payload?: Json | null
          user_request_id?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          cx_request_id?: string | null
          id?: string
          iteration?: number
          model?: string | null
          provider?: string
          request_payload?: Json
          response_message_id?: string | null
          response_payload?: Json | null
          trigger_message_id?: string | null
          unified_payload?: Json | null
          user_request_id?: string | null
        }
        Relationships: []
      }
      cx_tl_call: {
        Row: {
          arguments: Json
          call_id: string
          completed_at: string
          conversation_id: string
          cost_usd: number | null
          created_at: string
          deleted_at: string | null
          duration_ms: number
          error_message: string | null
          error_type: string | null
          execution_events: Json | null
          expires_at: string | null
          file_path: string | null
          id: string
          input_tokens: number | null
          is_client_delegated: boolean
          is_error: boolean | null
          iteration: number
          message_id: string | null
          metadata: Json
          output: string | null
          output_chars: number
          output_preview: Json | null
          output_tokens: number | null
          output_type: string | null
          parent_call_id: string | null
          persist_key: string | null
          resolution_source: string | null
          resolved_at: string | null
          retry_count: number | null
          started_at: string
          status: string
          success: boolean
          tool_name: string
          tool_name_as_called: string | null
          tool_type: string
          total_tokens: number | null
          user_id: string
          user_request_id: string | null
        }
        Insert: {
          arguments?: Json
          call_id: string
          completed_at?: string
          conversation_id: string
          cost_usd?: number | null
          created_at?: string
          deleted_at?: string | null
          duration_ms?: number
          error_message?: string | null
          error_type?: string | null
          execution_events?: Json | null
          expires_at?: string | null
          file_path?: string | null
          id?: string
          input_tokens?: number | null
          is_client_delegated?: boolean
          is_error?: boolean | null
          iteration?: number
          message_id?: string | null
          metadata?: Json
          output?: string | null
          output_chars?: number
          output_preview?: Json | null
          output_tokens?: number | null
          output_type?: string | null
          parent_call_id?: string | null
          persist_key?: string | null
          resolution_source?: string | null
          resolved_at?: string | null
          retry_count?: number | null
          started_at?: string
          status?: string
          success?: boolean
          tool_name: string
          tool_name_as_called?: string | null
          tool_type?: string
          total_tokens?: number | null
          user_id: string
          user_request_id?: string | null
        }
        Update: {
          arguments?: Json
          call_id?: string
          completed_at?: string
          conversation_id?: string
          cost_usd?: number | null
          created_at?: string
          deleted_at?: string | null
          duration_ms?: number
          error_message?: string | null
          error_type?: string | null
          execution_events?: Json | null
          expires_at?: string | null
          file_path?: string | null
          id?: string
          input_tokens?: number | null
          is_client_delegated?: boolean
          is_error?: boolean | null
          iteration?: number
          message_id?: string | null
          metadata?: Json
          output?: string | null
          output_chars?: number
          output_preview?: Json | null
          output_tokens?: number | null
          output_type?: string | null
          parent_call_id?: string | null
          persist_key?: string | null
          resolution_source?: string | null
          resolved_at?: string | null
          retry_count?: number | null
          started_at?: string
          status?: string
          success?: boolean
          tool_name?: string
          tool_name_as_called?: string | null
          tool_type?: string
          total_tokens?: number | null
          user_id?: string
          user_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cx_tool_call_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_tool_call_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_tool_call_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "cx_message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_tool_call_user_request_id_fkey"
            columns: ["user_request_id"]
            isOneToOne: false
            referencedRelation: "cx_user_request"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cx_tool_call_parent"
            columns: ["parent_call_id"]
            isOneToOne: false
            referencedRelation: "cx_tl_call"
            referencedColumns: ["id"]
          },
        ]
      }
      cx_tool_trace: {
        Row: {
          args: Json | null
          call_id: string | null
          conversation_id: string | null
          created_at: string
          duration_ms: number | null
          err_msg: string | null
          err_type: string | null
          event: string
          id: string
          kind: string | null
          metadata: Json
          process_pid: number | null
          process_started_at: string | null
          result_preview: string | null
          tool_name: string
          ts: string
          user_id: string | null
        }
        Insert: {
          args?: Json | null
          call_id?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          err_msg?: string | null
          err_type?: string | null
          event: string
          id?: string
          kind?: string | null
          metadata?: Json
          process_pid?: number | null
          process_started_at?: string | null
          result_preview?: string | null
          tool_name: string
          ts?: string
          user_id?: string | null
        }
        Update: {
          args?: Json | null
          call_id?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          err_msg?: string | null
          err_type?: string | null
          event?: string
          id?: string
          kind?: string | null
          metadata?: Json
          process_pid?: number | null
          process_started_at?: string | null
          result_preview?: string | null
          tool_name?: string
          ts?: string
          user_id?: string | null
        }
        Relationships: []
      }
      cx_user_request: {
        Row: {
          agent_id: string | null
          agent_version_id: string | null
          api_duration_ms: number | null
          completed_at: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          error: string | null
          finish_reason: string | null
          id: string
          iterations: number
          metadata: Json
          result_end_position: number | null
          result_start_position: number | null
          source_app: string
          source_feature: string
          status: string
          tool_duration_ms: number | null
          total_cached_tokens: number
          total_cost: number | null
          total_duration_ms: number | null
          total_input_tokens: number
          total_output_tokens: number
          total_tokens: number
          total_tool_calls: number
          trigger_message_position: number | null
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          agent_version_id?: string | null
          api_duration_ms?: number | null
          completed_at?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          error?: string | null
          finish_reason?: string | null
          id?: string
          iterations?: number
          metadata?: Json
          result_end_position?: number | null
          result_start_position?: number | null
          source_app?: string
          source_feature?: string
          status?: string
          tool_duration_ms?: number | null
          total_cached_tokens?: number
          total_cost?: number | null
          total_duration_ms?: number | null
          total_input_tokens?: number
          total_output_tokens?: number
          total_tokens?: number
          total_tool_calls?: number
          trigger_message_position?: number | null
          user_id: string
        }
        Update: {
          agent_id?: string | null
          agent_version_id?: string | null
          api_duration_ms?: number | null
          completed_at?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          error?: string | null
          finish_reason?: string | null
          id?: string
          iterations?: number
          metadata?: Json
          result_end_position?: number | null
          result_start_position?: number | null
          source_app?: string
          source_feature?: string
          status?: string
          tool_duration_ms?: number | null
          total_cached_tokens?: number
          total_cost?: number | null
          total_duration_ms?: number | null
          total_input_tokens?: number
          total_output_tokens?: number
          total_tokens?: number
          total_tool_calls?: number
          trigger_message_position?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cx_user_request_agent_fk"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agx_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_user_request_agent_version_fk"
            columns: ["agent_version_id"]
            isOneToOne: false
            referencedRelation: "agx_version"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_user_request_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_user_request_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      cx_user_todo: {
        Row: {
          context: string | null
          conversation_id: string
          created_at: string
          ctx_task_id: string | null
          done: boolean
          done_at: string | null
          due: string | null
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          context?: string | null
          conversation_id: string
          created_at?: string
          ctx_task_id?: string | null
          done?: boolean
          done_at?: string | null
          due?: string | null
          id?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          context?: string | null
          conversation_id?: string
          created_at?: string
          ctx_task_id?: string | null
          done?: boolean
          done_at?: string | null
          due?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cx_user_todo_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_user_todo_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_user_todo_ctx_task_id_fkey"
            columns: ["ctx_task_id"]
            isOneToOne: false
            referencedRelation: "ctx_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      cx_user_usage_summary: {
        Row: {
          auth_type: string
          blocked_reason: string | null
          cost_24h_mcents: number
          cost_6h_mcents: number
          daily_blocked: boolean
          last_request_at: string | null
          requests_24h: number
          requests_6h: number
          tokens_24h: number
          tokens_6h: number
          updated_at: string
          user_id: string
          window_24h_starts_at: string | null
          window_6h_starts_at: string | null
          window_blocked: boolean
        }
        Insert: {
          auth_type?: string
          blocked_reason?: string | null
          cost_24h_mcents?: number
          cost_6h_mcents?: number
          daily_blocked?: boolean
          last_request_at?: string | null
          requests_24h?: number
          requests_6h?: number
          tokens_24h?: number
          tokens_6h?: number
          updated_at?: string
          user_id: string
          window_24h_starts_at?: string | null
          window_6h_starts_at?: string | null
          window_blocked?: boolean
        }
        Update: {
          auth_type?: string
          blocked_reason?: string | null
          cost_24h_mcents?: number
          cost_6h_mcents?: number
          daily_blocked?: boolean
          last_request_at?: string | null
          requests_24h?: number
          requests_6h?: number
          tokens_24h?: number
          tokens_6h?: number
          updated_at?: string
          user_id?: string
          window_24h_starts_at?: string | null
          window_6h_starts_at?: string | null
          window_blocked?: boolean
        }
        Relationships: []
      }
      dashboard_saved_views: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          table_name: string
          updated_at: string
          url_params: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          table_name: string
          updated_at?: string
          url_params?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          table_name?: string
          updated_at?: string
          url_params?: string
          user_id?: string
        }
        Relationships: []
      }
      data_broker: {
        Row: {
          color: Database["public"]["Enums"]["color"] | null
          created_at: string | null
          data_type: Database["public"]["Enums"]["data_type"] | null
          default_scope: string | null
          default_value: string | null
          description: string | null
          field_component_id: string | null
          id: string
          input_component: string | null
          is_public: boolean | null
          name: string
          output_component: string | null
          public_read: boolean | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          color?: Database["public"]["Enums"]["color"] | null
          created_at?: string | null
          data_type?: Database["public"]["Enums"]["data_type"] | null
          default_scope?: string | null
          default_value?: string | null
          description?: string | null
          field_component_id?: string | null
          id?: string
          input_component?: string | null
          is_public?: boolean | null
          name: string
          output_component?: string | null
          public_read?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          color?: Database["public"]["Enums"]["color"] | null
          created_at?: string | null
          data_type?: Database["public"]["Enums"]["data_type"] | null
          default_scope?: string | null
          default_value?: string | null
          description?: string | null
          field_component_id?: string | null
          id?: string
          input_component?: string | null
          is_public?: boolean | null
          name?: string
          output_component?: string | null
          public_read?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_broker_default_component_fkey"
            columns: ["input_component"]
            isOneToOne: false
            referencedRelation: "data_input_component"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_broker_field_component_id_fkey"
            columns: ["field_component_id"]
            isOneToOne: false
            referencedRelation: "field_components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_broker_output_component_fkey"
            columns: ["output_component"]
            isOneToOne: false
            referencedRelation: "data_output_component"
            referencedColumns: ["id"]
          },
        ]
      }
      data_input_component: {
        Row: {
          acceptable_filetypes: Json | null
          additional_params: Json | null
          collapsible_class_name: string | null
          color_overrides: Json | null
          component: Database["public"]["Enums"]["default_component"]
          component_class_name: string | null
          container_class_name: string | null
          description: string | null
          description_class_name: string | null
          height: Database["public"]["Enums"]["size"] | null
          id: string
          include_other: boolean | null
          label_class_name: string | null
          max: number | null
          max_height: Database["public"]["Enums"]["size"] | null
          max_width: Database["public"]["Enums"]["size"] | null
          min: number | null
          min_height: Database["public"]["Enums"]["size"] | null
          min_width: Database["public"]["Enums"]["size"] | null
          name: string | null
          options: string[] | null
          orientation: Database["public"]["Enums"]["orientation"] | null
          placeholder: string | null
          size: Database["public"]["Enums"]["size"] | null
          src: string | null
          step: number | null
          sub_component: string | null
          width: Database["public"]["Enums"]["size"] | null
        }
        Insert: {
          acceptable_filetypes?: Json | null
          additional_params?: Json | null
          collapsible_class_name?: string | null
          color_overrides?: Json | null
          component?: Database["public"]["Enums"]["default_component"]
          component_class_name?: string | null
          container_class_name?: string | null
          description?: string | null
          description_class_name?: string | null
          height?: Database["public"]["Enums"]["size"] | null
          id?: string
          include_other?: boolean | null
          label_class_name?: string | null
          max?: number | null
          max_height?: Database["public"]["Enums"]["size"] | null
          max_width?: Database["public"]["Enums"]["size"] | null
          min?: number | null
          min_height?: Database["public"]["Enums"]["size"] | null
          min_width?: Database["public"]["Enums"]["size"] | null
          name?: string | null
          options?: string[] | null
          orientation?: Database["public"]["Enums"]["orientation"] | null
          placeholder?: string | null
          size?: Database["public"]["Enums"]["size"] | null
          src?: string | null
          step?: number | null
          sub_component?: string | null
          width?: Database["public"]["Enums"]["size"] | null
        }
        Update: {
          acceptable_filetypes?: Json | null
          additional_params?: Json | null
          collapsible_class_name?: string | null
          color_overrides?: Json | null
          component?: Database["public"]["Enums"]["default_component"]
          component_class_name?: string | null
          container_class_name?: string | null
          description?: string | null
          description_class_name?: string | null
          height?: Database["public"]["Enums"]["size"] | null
          id?: string
          include_other?: boolean | null
          label_class_name?: string | null
          max?: number | null
          max_height?: Database["public"]["Enums"]["size"] | null
          max_width?: Database["public"]["Enums"]["size"] | null
          min?: number | null
          min_height?: Database["public"]["Enums"]["size"] | null
          min_width?: Database["public"]["Enums"]["size"] | null
          name?: string | null
          options?: string[] | null
          orientation?: Database["public"]["Enums"]["orientation"] | null
          placeholder?: string | null
          size?: Database["public"]["Enums"]["size"] | null
          src?: string | null
          step?: number | null
          sub_component?: string | null
          width?: Database["public"]["Enums"]["size"] | null
        }
        Relationships: []
      }
      data_output_component: {
        Row: {
          additional_params: Json | null
          component_type:
            | Database["public"]["Enums"]["destination_component"]
            | null
          id: string
          props: Json | null
          ui_component: string | null
        }
        Insert: {
          additional_params?: Json | null
          component_type?:
            | Database["public"]["Enums"]["destination_component"]
            | null
          id?: string
          props?: Json | null
          ui_component?: string | null
        }
        Update: {
          additional_params?: Json | null
          component_type?:
            | Database["public"]["Enums"]["destination_component"]
            | null
          id?: string
          props?: Json | null
          ui_component?: string | null
        }
        Relationships: []
      }
      dev_login_audit: {
        Row: {
          id: string
          jwt_jti: string
          metadata: Json
          requested_at: string
          requester_ip: string | null
          requester_secret_hash: string
          target_user_id: string
          ttl_seconds: number
        }
        Insert: {
          id: string
          jwt_jti: string
          metadata?: Json
          requested_at?: string
          requester_ip?: string | null
          requester_secret_hash: string
          target_user_id: string
          ttl_seconds?: number
        }
        Update: {
          id?: string
          jwt_jti?: string
          metadata?: Json
          requested_at?: string
          requester_ip?: string | null
          requester_secret_hash?: string
          target_user_id?: string
          ttl_seconds?: number
        }
        Relationships: []
      }
      display_option: {
        Row: {
          additional_params: Json | null
          customizable_params: Json | null
          default_params: Json | null
          id: string
          name: string | null
        }
        Insert: {
          additional_params?: Json | null
          customizable_params?: Json | null
          default_params?: Json | null
          id?: string
          name?: string | null
        }
        Update: {
          additional_params?: Json | null
          customizable_params?: Json | null
          default_params?: Json | null
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      dm_conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          is_archived: boolean | null
          is_muted: boolean | null
          joined_at: string | null
          last_read_at: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          is_archived?: boolean | null
          is_muted?: boolean | null
          joined_at?: string | null
          last_read_at?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          is_archived?: boolean | null
          is_muted?: boolean | null
          joined_at?: string | null
          last_read_at?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "dm_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_conversations: {
        Row: {
          created_at: string | null
          created_by: string | null
          group_image_url: string | null
          group_name: string | null
          id: string
          type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          group_image_url?: string | null
          group_name?: string | null
          id?: string
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          group_image_url?: string | null
          group_name?: string | null
          id?: string
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      dm_messages: {
        Row: {
          client_message_id: string | null
          content: string
          conversation_id: string
          created_at: string | null
          deleted_at: string | null
          deleted_for_everyone: boolean | null
          edited_at: string | null
          id: string
          media_metadata: Json | null
          media_thumbnail_url: string | null
          media_url: string | null
          message_type: string | null
          reply_to_id: string | null
          sender_id: string
          status: string | null
        }
        Insert: {
          client_message_id?: string | null
          content: string
          conversation_id: string
          created_at?: string | null
          deleted_at?: string | null
          deleted_for_everyone?: boolean | null
          edited_at?: string | null
          id?: string
          media_metadata?: Json | null
          media_thumbnail_url?: string | null
          media_url?: string | null
          message_type?: string | null
          reply_to_id?: string | null
          sender_id: string
          status?: string | null
        }
        Update: {
          client_message_id?: string | null
          content?: string
          conversation_id?: string
          created_at?: string | null
          deleted_at?: string | null
          deleted_for_everyone?: boolean | null
          edited_at?: string | null
          id?: string
          media_metadata?: Json | null
          media_thumbnail_url?: string | null
          media_url?: string | null
          message_type?: string | null
          reply_to_id?: string | null
          sender_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dm_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "dm_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "dm_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      emails: {
        Row: {
          body: string
          id: string
          is_read: boolean | null
          recipient: string
          sender: string
          subject: string
          timestamp: string | null
        }
        Insert: {
          body: string
          id?: string
          is_read?: boolean | null
          recipient: string
          sender: string
          subject: string
          timestamp?: string | null
        }
        Update: {
          body?: string
          id?: string
          is_read?: boolean | null
          recipient?: string
          sender?: string
          subject?: string
          timestamp?: string | null
        }
        Relationships: []
      }
      extension_auth_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          used: boolean
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          id?: string
          used?: boolean
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          used?: boolean
          user_id?: string
        }
        Relationships: []
      }
      extracted_documents_legacy: {
        Row: {
          clean_content: string | null
          content: string | null
          created_at: string
          id: string
          name: string
          source: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          clean_content?: string | null
          content?: string | null
          created_at?: string
          id?: string
          name: string
          source?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          clean_content?: string | null
          content?: string | null
          created_at?: string
          id?: string
          name?: string
          source?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      extractor: {
        Row: {
          default_identifier: string | null
          default_index: number | null
          id: string
          name: string
          output_type: Database["public"]["Enums"]["data_type"] | null
        }
        Insert: {
          default_identifier?: string | null
          default_index?: number | null
          id?: string
          name: string
          output_type?: Database["public"]["Enums"]["data_type"] | null
        }
        Update: {
          default_identifier?: string | null
          default_index?: number | null
          id?: string
          name?: string
          output_type?: Database["public"]["Enums"]["data_type"] | null
        }
        Relationships: []
      }
      feedback_categories: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      feedback_comments: {
        Row: {
          author_name: string | null
          author_type: string
          content: string
          created_at: string
          feedback_id: string
          id: string
        }
        Insert: {
          author_name?: string | null
          author_type: string
          content: string
          created_at?: string
          feedback_id: string
          id?: string
        }
        Update: {
          author_name?: string | null
          author_type?: string
          content?: string
          created_at?: string
          feedback_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_comments_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "user_feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_user_messages: {
        Row: {
          content: string
          created_at: string
          email_sent: boolean
          feedback_id: string
          id: string
          image_urls: string[] | null
          sender_name: string | null
          sender_type: string
        }
        Insert: {
          content: string
          created_at?: string
          email_sent?: boolean
          feedback_id: string
          id?: string
          image_urls?: string[] | null
          sender_name?: string | null
          sender_type: string
        }
        Update: {
          content?: string
          created_at?: string
          email_sent?: boolean
          feedback_id?: string
          id?: string
          image_urls?: string[] | null
          sender_name?: string | null
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_user_messages_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "user_feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      field_components: {
        Row: {
          component: string | null
          component_group: string | null
          component_props: Json | null
          created_at: string
          default_value: string | null
          description: string | null
          help_text: string | null
          icon_name: string | null
          id: string
          include_other: boolean | null
          is_public: boolean | null
          label: string | null
          options: Json | null
          placeholder: string | null
          public_read: boolean | null
          required: boolean | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          component?: string | null
          component_group?: string | null
          component_props?: Json | null
          created_at?: string
          default_value?: string | null
          description?: string | null
          help_text?: string | null
          icon_name?: string | null
          id?: string
          include_other?: boolean | null
          is_public?: boolean | null
          label?: string | null
          options?: Json | null
          placeholder?: string | null
          public_read?: boolean | null
          required?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          component?: string | null
          component_group?: string | null
          component_props?: Json | null
          created_at?: string
          default_value?: string | null
          description?: string | null
          help_text?: string | null
          icon_name?: string | null
          id?: string
          include_other?: boolean | null
          is_public?: boolean | null
          label?: string | null
          options?: Json | null
          placeholder?: string | null
          public_read?: boolean | null
          required?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      file_analysis: {
        Row: {
          analyzer_version: string
          classification: Json | null
          completed_at: string | null
          detectors_run: Json
          file_id: string
          metadata: Json
          mime_type: string | null
          owner_id: string
          page_count: number | null
          progress: Json
          started_at: string
          status: string
          summary_counts: Json
          text_source_map: Json | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          analyzer_version?: string
          classification?: Json | null
          completed_at?: string | null
          detectors_run?: Json
          file_id: string
          metadata?: Json
          mime_type?: string | null
          owner_id: string
          page_count?: number | null
          progress?: Json
          started_at?: string
          status?: string
          summary_counts?: Json
          text_source_map?: Json | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          analyzer_version?: string
          classification?: Json | null
          completed_at?: string | null
          detectors_run?: Json
          file_id?: string
          metadata?: Json
          mime_type?: string | null
          owner_id?: string
          page_count?: number | null
          progress?: Json
          started_at?: string
          status?: string
          summary_counts?: Json
          text_source_map?: Json | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_analysis_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: true
            referencedRelation: "cld_files"
            referencedColumns: ["id"]
          },
        ]
      }
      file_analysis_result: {
        Row: {
          confidence_tier: string
          created_at: string
          detector_kind: string
          detector_version: string
          elapsed_ms: number
          error: string | null
          file_id: string
          id: string
          page_id: string | null
          payload: Json | null
          payload_bytes: number
          payload_uri: string | null
          status: string
          summary: Json
          text_sources: string[]
        }
        Insert: {
          confidence_tier?: string
          created_at?: string
          detector_kind: string
          detector_version?: string
          elapsed_ms?: number
          error?: string | null
          file_id: string
          id?: string
          page_id?: string | null
          payload?: Json | null
          payload_bytes?: number
          payload_uri?: string | null
          status?: string
          summary?: Json
          text_sources?: string[]
        }
        Update: {
          confidence_tier?: string
          created_at?: string
          detector_kind?: string
          detector_version?: string
          elapsed_ms?: number
          error?: string | null
          file_id?: string
          id?: string
          page_id?: string | null
          payload?: Json | null
          payload_bytes?: number
          payload_uri?: string | null
          status?: string
          summary?: Json
          text_sources?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "file_analysis_result_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "cld_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_analysis_result_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "file_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      file_entities: {
        Row: {
          canonical_value: string
          created_at: string
          file_id: string
          id: string
          is_user_named: boolean
          label: string
          label_category: string
          normalized_value: Json | null
          owner_id: string
          source_annotation_id: string | null
          updated_at: string
        }
        Insert: {
          canonical_value: string
          created_at?: string
          file_id: string
          id?: string
          is_user_named?: boolean
          label: string
          label_category?: string
          normalized_value?: Json | null
          owner_id: string
          source_annotation_id?: string | null
          updated_at?: string
        }
        Update: {
          canonical_value?: string
          created_at?: string
          file_id?: string
          id?: string
          is_user_named?: boolean
          label?: string
          label_category?: string
          normalized_value?: Json | null
          owner_id?: string
          source_annotation_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_entities_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "cld_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_entities_source_annotation_id_fkey"
            columns: ["source_annotation_id"]
            isOneToOne: false
            referencedRelation: "file_page_annotations"
            referencedColumns: ["id"]
          },
        ]
      }
      file_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          file_id: string
          id: string
          notes: string | null
          override_kind: string
          override_value: Json
          owner_id: string
          page_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_id: string
          id?: string
          notes?: string | null
          override_kind: string
          override_value: Json
          owner_id: string
          page_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_id?: string
          id?: string
          notes?: string | null
          override_kind?: string
          override_value?: Json
          owner_id?: string
          page_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_overrides_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "cld_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_overrides_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "file_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      file_page_annotations: {
        Row: {
          bbox: Json
          created_at: string
          created_by: string | null
          entity_id: string | null
          extracted_text: string | null
          extracted_text_source: string
          file_id: string
          id: string
          is_user_locked: boolean
          label: string
          label_category: string
          last_edited_by: string | null
          normalized_value: Json | null
          notes: string | null
          owner_id: string
          page_id: string | null
          page_number: number
          parent_result_id: string | null
          redact: boolean
          redaction_span_id: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          bbox: Json
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          extracted_text?: string | null
          extracted_text_source?: string
          file_id: string
          id?: string
          is_user_locked?: boolean
          label: string
          label_category?: string
          last_edited_by?: string | null
          normalized_value?: Json | null
          notes?: string | null
          owner_id: string
          page_id?: string | null
          page_number: number
          parent_result_id?: string | null
          redact?: boolean
          redaction_span_id?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          bbox?: Json
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          extracted_text?: string | null
          extracted_text_source?: string
          file_id?: string
          id?: string
          is_user_locked?: boolean
          label?: string
          label_category?: string
          last_edited_by?: string | null
          normalized_value?: Json | null
          notes?: string | null
          owner_id?: string
          page_id?: string | null
          page_number?: number
          parent_result_id?: string | null
          redact?: boolean
          redaction_span_id?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_page_annotations_entity_fk"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "file_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_page_annotations_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "cld_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_page_annotations_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "file_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_page_annotations_parent_result_id_fkey"
            columns: ["parent_result_id"]
            isOneToOne: false
            referencedRelation: "file_analysis_result"
            referencedColumns: ["id"]
          },
        ]
      }
      file_pages: {
        Row: {
          created_at: string
          excluded_at: string | null
          excluded_by: string | null
          excluded_reason: string | null
          file_id: string
          height_pt: number | null
          id: string
          metadata: Json
          ocr_confidence: number | null
          owner_id: string
          page_index: number
          rotation: number
          source_page_index: number
          status: string
          text_source: string
          thumbnail_url: string | null
          updated_at: string
          user_modified: boolean
          width_pt: number | null
        }
        Insert: {
          created_at?: string
          excluded_at?: string | null
          excluded_by?: string | null
          excluded_reason?: string | null
          file_id: string
          height_pt?: number | null
          id?: string
          metadata?: Json
          ocr_confidence?: number | null
          owner_id: string
          page_index: number
          rotation?: number
          source_page_index: number
          status?: string
          text_source?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_modified?: boolean
          width_pt?: number | null
        }
        Update: {
          created_at?: string
          excluded_at?: string | null
          excluded_by?: string | null
          excluded_reason?: string | null
          file_id?: string
          height_pt?: number | null
          id?: string
          metadata?: Json
          ocr_confidence?: number | null
          owner_id?: string
          page_index?: number
          rotation?: number
          source_page_index?: number
          status?: string
          text_source?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_modified?: boolean
          width_pt?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "file_pages_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "cld_files"
            referencedColumns: ["id"]
          },
        ]
      }
      file_structure: {
        Row: {
          bucket_id: string
          created_at: string | null
          file_id: string | null
          id: number
          is_folder: boolean
          metadata: Json | null
          name: string
          parent_path: string | null
          path: string
          updated_at: string | null
        }
        Insert: {
          bucket_id: string
          created_at?: string | null
          file_id?: string | null
          id?: number
          is_folder: boolean
          metadata?: Json | null
          name: string
          parent_path?: string | null
          path: string
          updated_at?: string | null
        }
        Update: {
          bucket_id?: string
          created_at?: string | null
          file_id?: string | null
          id?: number
          is_folder?: boolean
          metadata?: Json | null
          name?: string
          parent_path?: string | null
          path?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      flashcard_data: {
        Row: {
          audio_explanation: string | null
          back: string
          created_at: string | null
          detailed_explanation: string | null
          difficulty: string | null
          example: string | null
          front: string
          id: string
          is_deleted: boolean | null
          lesson: string | null
          organization_id: string | null
          personal_notes: string | null
          project_id: string | null
          public: boolean | null
          shared_with: string[] | null
          topic: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          audio_explanation?: string | null
          back: string
          created_at?: string | null
          detailed_explanation?: string | null
          difficulty?: string | null
          example?: string | null
          front: string
          id?: string
          is_deleted?: boolean | null
          lesson?: string | null
          organization_id?: string | null
          personal_notes?: string | null
          project_id?: string | null
          public?: boolean | null
          shared_with?: string[] | null
          topic?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          audio_explanation?: string | null
          back?: string
          created_at?: string | null
          detailed_explanation?: string | null
          difficulty?: string | null
          example?: string | null
          front?: string
          id?: string
          is_deleted?: boolean | null
          lesson?: string | null
          organization_id?: string | null
          personal_notes?: string | null
          project_id?: string | null
          public?: boolean | null
          shared_with?: string[] | null
          topic?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_data_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_data_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcard_history: {
        Row: {
          correct_count: number | null
          created_at: string | null
          flashcard_id: string | null
          id: string
          incorrect_count: number | null
          review_count: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          correct_count?: number | null
          created_at?: string | null
          flashcard_id?: string | null
          id?: string
          incorrect_count?: number | null
          review_count?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          correct_count?: number | null
          created_at?: string | null
          flashcard_id?: string | null
          id?: string
          incorrect_count?: number | null
          review_count?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_history_flashcard_id_fkey"
            columns: ["flashcard_id"]
            isOneToOne: false
            referencedRelation: "flashcard_data"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcard_images: {
        Row: {
          created_at: string | null
          file_name: string
          file_path: string
          flashcard_id: string | null
          id: string
          mime_type: string
          size: number
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_path: string
          flashcard_id?: string | null
          id?: string
          mime_type: string
          size: number
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_path?: string
          flashcard_id?: string | null
          id?: string
          mime_type?: string
          size?: number
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_images_flashcard_id_fkey"
            columns: ["flashcard_id"]
            isOneToOne: false
            referencedRelation: "flashcard_data"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcard_set_relations: {
        Row: {
          flashcard_id: string
          order: number | null
          set_id: string
        }
        Insert: {
          flashcard_id: string
          order?: number | null
          set_id: string
        }
        Update: {
          flashcard_id?: string
          order?: number | null
          set_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_set_relations_flashcard_id_fkey"
            columns: ["flashcard_id"]
            isOneToOne: false
            referencedRelation: "flashcard_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_set_relations_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "flashcard_sets"
            referencedColumns: ["set_id"]
          },
        ]
      }
      flashcard_sets: {
        Row: {
          audio_overview: string | null
          created_at: string | null
          difficulty: string | null
          lesson: string | null
          name: string
          organization_id: string | null
          project_id: string | null
          public: boolean | null
          set_id: string
          shared_with: string[] | null
          topic: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          audio_overview?: string | null
          created_at?: string | null
          difficulty?: string | null
          lesson?: string | null
          name: string
          organization_id?: string | null
          project_id?: string | null
          public?: boolean | null
          set_id?: string
          shared_with?: string[] | null
          topic?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          audio_overview?: string | null
          created_at?: string | null
          difficulty?: string | null
          lesson?: string | null
          name?: string
          organization_id?: string | null
          project_id?: string | null
          public?: boolean | null
          set_id?: string
          shared_with?: string[] | null
          topic?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_sets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_sets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      forbidden_urls: {
        Row: {
          created_at: string
          id: string
          pattern: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pattern: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pattern?: string
          user_id?: string
        }
        Relationships: []
      }
      full_spectrum_positions: {
        Row: {
          additional_details: string | null
          alternate_titles: string | null
          created_at: string
          description: string | null
          id: string
          qualifications: string | null
          red_flags: string | null
          sizzle_questions: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          additional_details?: string | null
          alternate_titles?: string | null
          created_at?: string
          description?: string | null
          id?: string
          qualifications?: string | null
          red_flags?: string | null
          sizzle_questions?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          additional_details?: string | null
          alternate_titles?: string | null
          created_at?: string
          description?: string | null
          id?: string
          qualifications?: string | null
          red_flags?: string | null
          sizzle_questions?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      guest_execution_log: {
        Row: {
          cost: number | null
          created_at: string | null
          error_message: string | null
          execution_time_ms: number | null
          fingerprint: string
          guest_id: string
          id: string
          ip_address: unknown
          referer: string | null
          resource_id: string | null
          resource_name: string | null
          resource_type: string
          success: boolean | null
          task_id: string | null
          tokens_used: number | null
          user_agent: string | null
        }
        Insert: {
          cost?: number | null
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          fingerprint: string
          guest_id: string
          id?: string
          ip_address?: unknown
          referer?: string | null
          resource_id?: string | null
          resource_name?: string | null
          resource_type: string
          success?: boolean | null
          task_id?: string | null
          tokens_used?: number | null
          user_agent?: string | null
        }
        Update: {
          cost?: number | null
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          fingerprint?: string
          guest_id?: string
          id?: string
          ip_address?: unknown
          referer?: string | null
          resource_id?: string | null
          resource_name?: string | null
          resource_type?: string
          success?: boolean | null
          task_id?: string | null
          tokens_used?: number | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_execution_log_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_executions: {
        Row: {
          auth_user_id: string | null
          blocked_reason: string | null
          blocked_until: string | null
          converted_at: string | null
          converted_to_user_id: string | null
          created_at: string | null
          daily_executions: number | null
          daily_reset_at: string | null
          fingerprint: string
          first_execution_at: string | null
          id: string
          ip_address: unknown
          is_blocked: boolean | null
          last_execution_at: string | null
          metadata: Json | null
          total_executions: number | null
          updated_at: string | null
          user_agent: string | null
        }
        Insert: {
          auth_user_id?: string | null
          blocked_reason?: string | null
          blocked_until?: string | null
          converted_at?: string | null
          converted_to_user_id?: string | null
          created_at?: string | null
          daily_executions?: number | null
          daily_reset_at?: string | null
          fingerprint: string
          first_execution_at?: string | null
          id?: string
          ip_address?: unknown
          is_blocked?: boolean | null
          last_execution_at?: string | null
          metadata?: Json | null
          total_executions?: number | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Update: {
          auth_user_id?: string | null
          blocked_reason?: string | null
          blocked_until?: string | null
          converted_at?: string | null
          converted_to_user_id?: string | null
          created_at?: string | null
          daily_executions?: number | null
          daily_reset_at?: string | null
          fingerprint?: string
          first_execution_at?: string | null
          id?: string
          ip_address?: unknown
          is_blocked?: boolean | null
          last_execution_at?: string | null
          metadata?: Json | null
          total_executions?: number | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      heatmap_saves: {
        Row: {
          created_at: string | null
          data: Json
          description: string | null
          id: string
          is_public: boolean | null
          title: string
          updated_at: string | null
          user_id: string | null
          view_settings: Json | null
        }
        Insert: {
          created_at?: string | null
          data: Json
          description?: string | null
          id?: string
          is_public?: boolean | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
          view_settings?: Json | null
        }
        Update: {
          created_at?: string | null
          data?: Json
          description?: string | null
          id?: string
          is_public?: boolean | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
          view_settings?: Json | null
        }
        Relationships: []
      }
      html_extractions: {
        Row: {
          content_length: number | null
          created_at: string | null
          extracted_at: string | null
          html_content: string
          id: number
          meta_description: string | null
          meta_keywords: string | null
          title: string | null
          url: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          content_length?: number | null
          created_at?: string | null
          extracted_at?: string | null
          html_content: string
          id?: number
          meta_description?: string | null
          meta_keywords?: string | null
          title?: string | null
          url: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          content_length?: number | null
          created_at?: string | null
          extracted_at?: string | null
          html_content?: string
          id?: number
          meta_description?: string | null
          meta_keywords?: string | null
          title?: string | null
          url?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      invitation_codes: {
        Row: {
          code: string
          created_at: string | null
          created_by: string | null
          current_uses: number
          expires_at: string | null
          id: string
          invitation_request_id: string | null
          max_uses: number
          notes: string | null
          status: string
          updated_at: string | null
          used_at: string | null
          used_by_user_id: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by?: string | null
          current_uses?: number
          expires_at?: string | null
          id?: string
          invitation_request_id?: string | null
          max_uses?: number
          notes?: string | null
          status?: string
          updated_at?: string | null
          used_at?: string | null
          used_by_user_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by?: string | null
          current_uses?: number
          expires_at?: string | null
          id?: string
          invitation_request_id?: string | null
          max_uses?: number
          notes?: string | null
          status?: string
          updated_at?: string | null
          used_at?: string | null
          used_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitation_codes_invitation_request_id_fkey"
            columns: ["invitation_request_id"]
            isOneToOne: false
            referencedRelation: "invitation_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation_requests: {
        Row: {
          biggest_obstacle: string | null
          company: string
          created_at: string | null
          current_ai_systems: string | null
          email: string
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          recent_project: string | null
          referral_source: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          step_completed: number
          updated_at: string | null
          use_case: string
          user_type: string
          user_type_other: string | null
        }
        Insert: {
          biggest_obstacle?: string | null
          company: string
          created_at?: string | null
          current_ai_systems?: string | null
          email: string
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          recent_project?: string | null
          referral_source?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          step_completed?: number
          updated_at?: string | null
          use_case: string
          user_type: string
          user_type_other?: string | null
        }
        Update: {
          biggest_obstacle?: string | null
          company?: string
          created_at?: string | null
          current_ai_systems?: string | null
          email?: string
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          recent_project?: string | null
          referral_source?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          step_completed?: number
          updated_at?: string | null
          use_case?: string
          user_type?: string
          user_type_other?: string | null
        }
        Relationships: []
      }
      math_course_structure: {
        Row: {
          course_name: string
          created_at: string | null
          id: string
          lesson_content: Json | null
          lesson_name: string | null
          lesson_objectives: string | null
          module_description: string | null
          module_name: string
          sort_order: number | null
          topic_name: string
          updated_at: string | null
        }
        Insert: {
          course_name: string
          created_at?: string | null
          id?: string
          lesson_content?: Json | null
          lesson_name?: string | null
          lesson_objectives?: string | null
          module_description?: string | null
          module_name: string
          sort_order?: number | null
          topic_name: string
          updated_at?: string | null
        }
        Update: {
          course_name?: string
          created_at?: string | null
          id?: string
          lesson_content?: Json | null
          lesson_name?: string | null
          lesson_objectives?: string | null
          module_description?: string | null
          module_name?: string
          sort_order?: number | null
          topic_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      math_problems: {
        Row: {
          course_name: string
          created_at: string | null
          created_by: string | null
          description: string | null
          difficulty_level: string | null
          final_statement: string | null
          hint: string | null
          id: string
          intro_text: string | null
          is_published: boolean | null
          module_name: string
          problem_statement: Json
          related_content: Json | null
          resources: Json | null
          solutions: Json
          sort_order: number | null
          title: string
          topic_name: string
          updated_at: string | null
        }
        Insert: {
          course_name: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          difficulty_level?: string | null
          final_statement?: string | null
          hint?: string | null
          id?: string
          intro_text?: string | null
          is_published?: boolean | null
          module_name: string
          problem_statement: Json
          related_content?: Json | null
          resources?: Json | null
          solutions: Json
          sort_order?: number | null
          title: string
          topic_name: string
          updated_at?: string | null
        }
        Update: {
          course_name?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          difficulty_level?: string | null
          final_statement?: string | null
          hint?: string | null
          id?: string
          intro_text?: string | null
          is_published?: boolean | null
          module_name?: string
          problem_statement?: Json
          related_content?: Json | null
          resources?: Json | null
          solutions?: Json
          sort_order?: number | null
          title?: string
          topic_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      message: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          display_order: number | null
          id: string
          is_public: boolean | null
          metadata: Json | null
          role: Database["public"]["Enums"]["message_role"]
          system_order: number | null
          type: Database["public"]["Enums"]["message_type"]
          user_id: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_public?: boolean | null
          metadata?: Json | null
          role: Database["public"]["Enums"]["message_role"]
          system_order?: number | null
          type: Database["public"]["Enums"]["message_type"]
          user_id?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_public?: boolean | null
          metadata?: Json | null
          role?: Database["public"]["Enums"]["message_role"]
          system_order?: number | null
          type?: Database["public"]["Enums"]["message_type"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversation"
            referencedColumns: ["id"]
          },
        ]
      }
      message_broker: {
        Row: {
          broker_id: string
          default_component: string | null
          default_value: string | null
          id: string
          message_id: string
        }
        Insert: {
          broker_id: string
          default_component?: string | null
          default_value?: string | null
          id?: string
          message_id: string
        }
        Update: {
          broker_id?: string
          default_component?: string | null
          default_value?: string | null
          id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_broker_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "data_broker"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_broker_default_component_fkey"
            columns: ["default_component"]
            isOneToOne: false
            referencedRelation: "data_input_component"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_broker_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "message_template"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_template: {
        Row: {
          content: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["message_role"]
          type: Database["public"]["Enums"]["message_type"]
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["message_role"]
          type?: Database["public"]["Enums"]["message_type"]
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["message_role"]
          type?: Database["public"]["Enums"]["message_type"]
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          is_deleted: boolean
          is_edited: boolean
          reply_to_id: string | null
          sender_id: string
          type: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          is_edited?: boolean
          reply_to_id?: string | null
          sender_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          is_edited?: boolean
          reply_to_id?: string | null
          sender_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      microservice_project: {
        Row: {
          created_at: string
          id: string
          is_system: boolean
          project_code: string
          project_description: string
          project_name: string
          public_read: boolean
          repo_id: number
          repo_name: string
          repo_org_name: string
          repo_url: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_system?: boolean
          project_code: string
          project_description: string
          project_name: string
          public_read?: boolean
          repo_id: number
          repo_name: string
          repo_org_name: string
          repo_url: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_system?: boolean
          project_code?: string
          project_description?: string
          project_name?: string
          public_read?: boolean
          repo_id?: number
          repo_name?: string
          repo_org_name?: string
          repo_url?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      node_category: {
        Row: {
          color: Database["public"]["Enums"]["color"] | null
          created_at: string
          description: string | null
          icon: Database["public"]["Enums"]["icon_type"] | null
          id: string
          label: string | null
          name: string | null
          updated_at: string | null
        }
        Insert: {
          color?: Database["public"]["Enums"]["color"] | null
          created_at?: string
          description?: string | null
          icon?: Database["public"]["Enums"]["icon_type"] | null
          id?: string
          label?: string | null
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          color?: Database["public"]["Enums"]["color"] | null
          created_at?: string
          description?: string | null
          icon?: Database["public"]["Enums"]["icon_type"] | null
          id?: string
          label?: string | null
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      note_devices: {
        Row: {
          base_path: string | null
          created_at: string
          device_id: string
          device_name: string
          id: string
          is_active: boolean
          last_seen: string
          platform: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          base_path?: string | null
          created_at?: string
          device_id: string
          device_name?: string
          id?: string
          is_active?: boolean
          last_seen?: string
          platform?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          base_path?: string | null
          created_at?: string
          device_id?: string
          device_name?: string
          id?: string
          is_active?: boolean
          last_seen?: string
          platform?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      note_directory_mappings: {
        Row: {
          created_at: string
          device_id: string
          folder_id: string
          id: string
          is_active: boolean
          local_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          folder_id: string
          id?: string
          is_active?: boolean
          local_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          folder_id?: string
          id?: string
          is_active?: boolean
          local_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_directory_mappings_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "note_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      note_folders: {
        Row: {
          created_at: string
          id: string
          is_deleted: boolean
          name: string
          parent_id: string | null
          path: string
          position: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_deleted?: boolean
          name: string
          parent_id?: string | null
          path?: string
          position?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_deleted?: boolean
          name?: string
          parent_id?: string | null
          path?: string
          position?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "note_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      note_shares: {
        Row: {
          created_at: string
          folder_id: string | null
          id: string
          is_public: boolean
          note_id: string | null
          owner_id: string
          permission: string
          public_token: string | null
          shared_with_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          folder_id?: string | null
          id?: string
          is_public?: boolean
          note_id?: string | null
          owner_id: string
          permission?: string
          public_token?: string | null
          shared_with_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          folder_id?: string | null
          id?: string
          is_public?: boolean
          note_id?: string | null
          owner_id?: string
          permission?: string
          public_token?: string | null
          shared_with_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_shares_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "note_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_shares_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      note_sync_log: {
        Row: {
          action: string
          content_hash: string | null
          created_at: string
          details: Json | null
          device_id: string
          folder_id: string | null
          id: string
          note_id: string | null
          sync_version: number | null
          user_id: string
        }
        Insert: {
          action: string
          content_hash?: string | null
          created_at?: string
          details?: Json | null
          device_id: string
          folder_id?: string | null
          id?: string
          note_id?: string | null
          sync_version?: number | null
          user_id: string
        }
        Update: {
          action?: string
          content_hash?: string | null
          created_at?: string
          details?: Json | null
          device_id?: string
          folder_id?: string | null
          id?: string
          note_id?: string | null
          sync_version?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_sync_log_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "note_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_sync_log_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      note_versions: {
        Row: {
          change_note: string | null
          change_source: string
          change_type: string | null
          content: string
          created_at: string
          diff_metadata: Json | null
          id: string
          label: string
          note_id: string
          user_id: string
          version_number: number
        }
        Insert: {
          change_note?: string | null
          change_source?: string
          change_type?: string | null
          content: string
          created_at?: string
          diff_metadata?: Json | null
          id?: string
          label: string
          note_id: string
          user_id: string
          version_number: number
        }
        Update: {
          change_note?: string | null
          change_source?: string
          change_type?: string | null
          content?: string
          created_at?: string
          diff_metadata?: Json | null
          id?: string
          label?: string
          note_id?: string
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "note_versions_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          content: string | null
          content_hash: string | null
          created_at: string | null
          file_path: string | null
          folder_id: string | null
          folder_name: string | null
          id: string
          is_deleted: boolean | null
          is_public: boolean
          label: string
          last_device_id: string | null
          metadata: Json | null
          organization_id: string | null
          position: number | null
          project_id: string | null
          shared_with: Json | null
          sync_version: number
          tags: string[] | null
          task_id: string | null
          updated_at: string | null
          user_id: string
          version: number
        }
        Insert: {
          content?: string | null
          content_hash?: string | null
          created_at?: string | null
          file_path?: string | null
          folder_id?: string | null
          folder_name?: string | null
          id?: string
          is_deleted?: boolean | null
          is_public?: boolean
          label?: string
          last_device_id?: string | null
          metadata?: Json | null
          organization_id?: string | null
          position?: number | null
          project_id?: string | null
          shared_with?: Json | null
          sync_version?: number
          tags?: string[] | null
          task_id?: string | null
          updated_at?: string | null
          user_id: string
          version?: number
        }
        Update: {
          content?: string | null
          content_hash?: string | null
          created_at?: string | null
          file_path?: string | null
          folder_id?: string | null
          folder_name?: string | null
          id?: string
          is_deleted?: boolean | null
          is_public?: boolean
          label?: string
          last_device_id?: string | null
          metadata?: Json | null
          organization_id?: string | null
          position?: number | null
          project_id?: string | null
          shared_with?: Json | null
          sync_version?: number
          tags?: string[] | null
          task_id?: string | null
          updated_at?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "notes_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "note_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ctx_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_issue_class: {
        Row: {
          alert_threshold: number | null
          alert_window_minutes: number | null
          category: string
          created_at: string
          description: string | null
          disposition: string
          id: string
          is_active: boolean
          key: string
          name: string
          provider: string | null
          resolution_notes: string | null
          severity: string
          updated_at: string
        }
        Insert: {
          alert_threshold?: number | null
          alert_window_minutes?: number | null
          category: string
          created_at?: string
          description?: string | null
          disposition?: string
          id?: string
          is_active?: boolean
          key: string
          name: string
          provider?: string | null
          resolution_notes?: string | null
          severity?: string
          updated_at?: string
        }
        Update: {
          alert_threshold?: number | null
          alert_window_minutes?: number | null
          category?: string
          created_at?: string
          description?: string | null
          disposition?: string
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          provider?: string | null
          resolution_notes?: string | null
          severity?: string
          updated_at?: string
        }
        Relationships: []
      }
      ops_issue_event: {
        Row: {
          conversation_id: string | null
          created_at: string
          detail: Json
          error_type: string
          id: string
          is_retryable: boolean
          issue_class_id: string
          model: string | null
          occurred_at: string
          provider: string | null
          request_id: string | null
          retry_count: number
          status_code: number | null
          user_id: string | null
          was_recovered: boolean
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          detail?: Json
          error_type: string
          id?: string
          is_retryable?: boolean
          issue_class_id: string
          model?: string | null
          occurred_at?: string
          provider?: string | null
          request_id?: string | null
          retry_count?: number
          status_code?: number | null
          user_id?: string | null
          was_recovered?: boolean
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          detail?: Json
          error_type?: string
          id?: string
          is_retryable?: boolean
          issue_class_id?: string
          model?: string | null
          occurred_at?: string
          provider?: string | null
          request_id?: string | null
          retry_count?: number
          status_code?: number | null
          user_id?: string | null
          was_recovered?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ops_issue_event_issue_class_id_fkey"
            columns: ["issue_class_id"]
            isOneToOne: false
            referencedRelation: "ops_issue_class"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          email: string
          email_sent: boolean | null
          email_sent_at: string | null
          expires_at: string
          id: string
          invited_at: string | null
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          token: string
        }
        Insert: {
          email: string
          email_sent?: boolean | null
          email_sent_at?: string | null
          expires_at: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          token: string
        }
        Update: {
          email?: string
          email_sent?: boolean | null
          email_sent_at?: string | null
          expires_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          id: string
          invited_by: string | null
          joined_at: string | null
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_personal: boolean | null
          logo_url: string | null
          name: string
          settings: Json | null
          slug: string
          updated_at: string | null
          website: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_personal?: boolean | null
          logo_url?: string | null
          name: string
          settings?: Json | null
          slug: string
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_personal?: boolean | null
          logo_url?: string | null
          name?: string
          settings?: Json | null
          slug?: string
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      page_extraction_jobs: {
        Row: {
          agent_id: string | null
          archived_at: string | null
          chunk_overlap: number
          chunk_size: number
          chunking_strategy: string
          created_at: string
          description: string | null
          extra_inputs: Json
          file_id: string
          id: string
          is_saved: boolean
          latest_run_id: string | null
          max_concurrent: number
          model_overrides: Json | null
          name: string
          organization_id: string | null
          output_schema: Json
          owner_id: string
          processed_document_id: string | null
          project_id: string | null
          rag_boost: number | null
          scope_pages: number[] | null
          shortcut_id: string | null
          source_variations: Json
          updated_at: string
          variable_mapping: Json
        }
        Insert: {
          agent_id?: string | null
          archived_at?: string | null
          chunk_overlap?: number
          chunk_size?: number
          chunking_strategy?: string
          created_at?: string
          description?: string | null
          extra_inputs?: Json
          file_id: string
          id?: string
          is_saved?: boolean
          latest_run_id?: string | null
          max_concurrent?: number
          model_overrides?: Json | null
          name: string
          organization_id?: string | null
          output_schema: Json
          owner_id: string
          processed_document_id?: string | null
          project_id?: string | null
          rag_boost?: number | null
          scope_pages?: number[] | null
          shortcut_id?: string | null
          source_variations?: Json
          updated_at?: string
          variable_mapping?: Json
        }
        Update: {
          agent_id?: string | null
          archived_at?: string | null
          chunk_overlap?: number
          chunk_size?: number
          chunking_strategy?: string
          created_at?: string
          description?: string | null
          extra_inputs?: Json
          file_id?: string
          id?: string
          is_saved?: boolean
          latest_run_id?: string | null
          max_concurrent?: number
          model_overrides?: Json | null
          name?: string
          organization_id?: string | null
          output_schema?: Json
          owner_id?: string
          processed_document_id?: string | null
          project_id?: string | null
          rag_boost?: number | null
          scope_pages?: number[] | null
          shortcut_id?: string | null
          source_variations?: Json
          updated_at?: string
          variable_mapping?: Json
        }
        Relationships: [
          {
            foreignKeyName: "page_extraction_jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agx_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_extraction_jobs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "cld_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_extraction_jobs_latest_run_fk"
            columns: ["latest_run_id"]
            isOneToOne: false
            referencedRelation: "page_extraction_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_extraction_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_extraction_jobs_processed_document_id_fkey"
            columns: ["processed_document_id"]
            isOneToOne: false
            referencedRelation: "extracted_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_extraction_jobs_processed_document_id_fkey"
            columns: ["processed_document_id"]
            isOneToOne: false
            referencedRelation: "processed_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_extraction_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_extraction_jobs_shortcut_id_fkey"
            columns: ["shortcut_id"]
            isOneToOne: false
            referencedRelation: "agx_shortcut"
            referencedColumns: ["id"]
          },
        ]
      }
      page_extraction_page_runs: {
        Row: {
          chunk_index: number
          cost: number | null
          duration_ms: number | null
          error: string | null
          file_id: string
          finished_at: string | null
          id: string
          job_id: string
          page_ids: string[] | null
          page_numbers: number[]
          parse_error: string | null
          parsed_payload: Json | null
          raw_response: string | null
          request_id: string | null
          run_id: string
          started_at: string | null
          status: string
          tokens: number | null
        }
        Insert: {
          chunk_index: number
          cost?: number | null
          duration_ms?: number | null
          error?: string | null
          file_id: string
          finished_at?: string | null
          id?: string
          job_id: string
          page_ids?: string[] | null
          page_numbers: number[]
          parse_error?: string | null
          parsed_payload?: Json | null
          raw_response?: string | null
          request_id?: string | null
          run_id: string
          started_at?: string | null
          status?: string
          tokens?: number | null
        }
        Update: {
          chunk_index?: number
          cost?: number | null
          duration_ms?: number | null
          error?: string | null
          file_id?: string
          finished_at?: string | null
          id?: string
          job_id?: string
          page_ids?: string[] | null
          page_numbers?: number[]
          parse_error?: string | null
          parsed_payload?: Json | null
          raw_response?: string | null
          request_id?: string | null
          run_id?: string
          started_at?: string | null
          status?: string
          tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "page_extraction_page_runs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "cld_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_extraction_page_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "page_extraction_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_extraction_page_runs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "page_extraction_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      page_extraction_results: {
        Row: {
          canonical_page: number | null
          created_at: string
          file_id: string
          id: string
          job_id: string
          page_run_id: string
          payload: Json
          run_id: string
          source_pages: number[]
        }
        Insert: {
          canonical_page?: number | null
          created_at?: string
          file_id: string
          id?: string
          job_id: string
          page_run_id: string
          payload: Json
          run_id: string
          source_pages: number[]
        }
        Update: {
          canonical_page?: number | null
          created_at?: string
          file_id?: string
          id?: string
          job_id?: string
          page_run_id?: string
          payload?: Json
          run_id?: string
          source_pages?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "page_extraction_results_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "cld_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_extraction_results_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "page_extraction_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_extraction_results_page_run_id_fkey"
            columns: ["page_run_id"]
            isOneToOne: false
            referencedRelation: "page_extraction_page_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_extraction_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "page_extraction_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      page_extraction_runs: {
        Row: {
          chunk_count: number
          completed_chunks: number
          created_at: string
          error: string | null
          failed_chunks: number
          finished_at: string | null
          id: string
          job_id: string
          metadata: Json
          result_count: number
          started_at: string | null
          status: string
          total_cost: number
          total_tokens: number
          trigger_source: string
          triggered_by: string | null
        }
        Insert: {
          chunk_count?: number
          completed_chunks?: number
          created_at?: string
          error?: string | null
          failed_chunks?: number
          finished_at?: string | null
          id?: string
          job_id: string
          metadata?: Json
          result_count?: number
          started_at?: string | null
          status?: string
          total_cost?: number
          total_tokens?: number
          trigger_source?: string
          triggered_by?: string | null
        }
        Update: {
          chunk_count?: number
          completed_chunks?: number
          created_at?: string
          error?: string | null
          failed_chunks?: number
          finished_at?: string | null
          id?: string
          job_id?: string
          metadata?: Json
          result_count?: number
          started_at?: string | null
          status?: string
          total_cost?: number
          total_tokens?: number
          trigger_source?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_extraction_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "page_extraction_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      pc_episodes: {
        Row: {
          audio_url: string
          created_at: string
          description: string | null
          display_mode: string
          duration_seconds: number | null
          episode_number: number | null
          id: string
          image_url: string | null
          is_published: boolean
          og_image_url: string | null
          show_id: string | null
          slug: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          audio_url: string
          created_at?: string
          description?: string | null
          display_mode?: string
          duration_seconds?: number | null
          episode_number?: number | null
          id?: string
          image_url?: string | null
          is_published?: boolean
          og_image_url?: string | null
          show_id?: string | null
          slug: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          audio_url?: string
          created_at?: string
          description?: string | null
          display_mode?: string
          duration_seconds?: number | null
          episode_number?: number | null
          id?: string
          image_url?: string | null
          is_published?: boolean
          og_image_url?: string | null
          show_id?: string | null
          slug?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pc_episodes_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "pc_shows"
            referencedColumns: ["id"]
          },
        ]
      }
      pc_shows: {
        Row: {
          author: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_published: boolean
          og_image_url: string | null
          slug: string
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_published?: boolean
          og_image_url?: string | null
          slug: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_published?: boolean
          og_image_url?: string | null
          slug?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          created_at: string | null
          created_by: string | null
          granted_to_organization_id: string | null
          granted_to_user_id: string | null
          id: string
          is_public: boolean | null
          permission_level: Database["public"]["Enums"]["permission_level"]
          resource_id: string
          resource_type: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          granted_to_organization_id?: string | null
          granted_to_user_id?: string | null
          id?: string
          is_public?: boolean | null
          permission_level?: Database["public"]["Enums"]["permission_level"]
          resource_id: string
          resource_type: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          granted_to_organization_id?: string | null
          granted_to_user_id?: string | null
          id?: string
          is_public?: boolean | null
          permission_level?: Database["public"]["Enums"]["permission_level"]
          resource_id?: string
          resource_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_reference"
            columns: ["granted_to_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_document_pages: {
        Row: {
          blocks: Json | null
          cleaned_char_count: number
          cleaned_text: string
          created_at: string
          extraction_confidence: number | null
          extraction_method: string | null
          height: number | null
          id: string
          image_cld_file_id: string | null
          image_dpi: number | null
          is_continuation: boolean
          metadata: Json
          page_index: number
          page_number: number
          processed_document_id: string
          raw_char_count: number
          raw_text: string
          rotation: number | null
          section_kind: string | null
          section_title: string | null
          used_ocr: boolean
          width: number | null
          words: Json | null
        }
        Insert: {
          blocks?: Json | null
          cleaned_char_count?: number
          cleaned_text?: string
          created_at?: string
          extraction_confidence?: number | null
          extraction_method?: string | null
          height?: number | null
          id?: string
          image_cld_file_id?: string | null
          image_dpi?: number | null
          is_continuation?: boolean
          metadata?: Json
          page_index: number
          page_number: number
          processed_document_id: string
          raw_char_count?: number
          raw_text?: string
          rotation?: number | null
          section_kind?: string | null
          section_title?: string | null
          used_ocr?: boolean
          width?: number | null
          words?: Json | null
        }
        Update: {
          blocks?: Json | null
          cleaned_char_count?: number
          cleaned_text?: string
          created_at?: string
          extraction_confidence?: number | null
          extraction_method?: string | null
          height?: number | null
          id?: string
          image_cld_file_id?: string | null
          image_dpi?: number | null
          is_continuation?: boolean
          metadata?: Json
          page_index?: number
          page_number?: number
          processed_document_id?: string
          raw_char_count?: number
          raw_text?: string
          rotation?: number | null
          section_kind?: string | null
          section_title?: string | null
          used_ocr?: boolean
          width?: number | null
          words?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "processed_document_pages_image_cld_file_id_fkey"
            columns: ["image_cld_file_id"]
            isOneToOne: false
            referencedRelation: "cld_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processed_document_pages_processed_document_id_fkey"
            columns: ["processed_document_id"]
            isOneToOne: false
            referencedRelation: "extracted_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processed_document_pages_processed_document_id_fkey"
            columns: ["processed_document_id"]
            isOneToOne: false
            referencedRelation: "processed_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_documents: {
        Row: {
          archived_at: string | null
          archived_reason: string | null
          canonical_clean_id: string | null
          clean_content: string | null
          clean_content_completed_at: string | null
          clean_content_cost_usd: number | null
          cleaner_name: string | null
          cleaner_version: string | null
          content: string | null
          created_at: string
          derivation_kind: string
          derivation_metadata: Json
          extractor_name: string
          extractor_version: string
          file_content_hash: string | null
          id: string
          metadata: Json
          mime_type: string | null
          name: string
          organization_id: string | null
          owner_id: string
          params_hash: string | null
          parent_processed_id: string | null
          rag_boost: number
          replace_reason: string | null
          source_hash: string
          source_id: string
          source_kind: string
          storage_uri: string | null
          structured_json: Json | null
          total_pages: number | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_reason?: string | null
          canonical_clean_id?: string | null
          clean_content?: string | null
          clean_content_completed_at?: string | null
          clean_content_cost_usd?: number | null
          cleaner_name?: string | null
          cleaner_version?: string | null
          content?: string | null
          created_at?: string
          derivation_kind?: string
          derivation_metadata?: Json
          extractor_name?: string
          extractor_version?: string
          file_content_hash?: string | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          name: string
          organization_id?: string | null
          owner_id: string
          params_hash?: string | null
          parent_processed_id?: string | null
          rag_boost?: number
          replace_reason?: string | null
          source_hash: string
          source_id: string
          source_kind: string
          storage_uri?: string | null
          structured_json?: Json | null
          total_pages?: number | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_reason?: string | null
          canonical_clean_id?: string | null
          clean_content?: string | null
          clean_content_completed_at?: string | null
          clean_content_cost_usd?: number | null
          cleaner_name?: string | null
          cleaner_version?: string | null
          content?: string | null
          created_at?: string
          derivation_kind?: string
          derivation_metadata?: Json
          extractor_name?: string
          extractor_version?: string
          file_content_hash?: string | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          name?: string
          organization_id?: string | null
          owner_id?: string
          params_hash?: string | null
          parent_processed_id?: string | null
          rag_boost?: number
          replace_reason?: string | null
          source_hash?: string
          source_id?: string
          source_kind?: string
          storage_uri?: string | null
          structured_json?: Json | null
          total_pages?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "processed_documents_canonical_clean_id_fkey"
            columns: ["canonical_clean_id"]
            isOneToOne: false
            referencedRelation: "extracted_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processed_documents_canonical_clean_id_fkey"
            columns: ["canonical_clean_id"]
            isOneToOne: false
            referencedRelation: "processed_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processed_documents_parent_processed_id_fkey"
            columns: ["parent_processed_id"]
            isOneToOne: false
            referencedRelation: "extracted_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processed_documents_parent_processed_id_fkey"
            columns: ["parent_processed_id"]
            isOneToOne: false
            referencedRelation: "processed_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      processor: {
        Row: {
          default_extractors: Json | null
          depends_default: string | null
          id: string
          name: string
          params: Json | null
        }
        Insert: {
          default_extractors?: Json | null
          depends_default?: string | null
          id?: string
          name: string
          params?: Json | null
        }
        Update: {
          default_extractors?: Json | null
          depends_default?: string | null
          id?: string
          name?: string
          params?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "processors_depends_default_fkey"
            columns: ["depends_default"]
            isOneToOne: false
            referencedRelation: "processor"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          is_online: boolean
          last_seen_at: string | null
          status_text: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id: string
          is_online?: boolean
          last_seen_at?: string | null
          status_text?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          is_online?: boolean
          last_seen_at?: string | null
          status_text?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      prompt_actions: {
        Row: {
          broker_mappings: Json
          context_scopes: string[]
          created_at: string
          description: string | null
          execution_config: Json
          hardcoded_values: Json
          icon_name: string | null
          id: string
          is_active: boolean
          is_public: boolean
          name: string
          organization_id: string | null
          project_id: string | null
          prompt_builtin_id: string | null
          prompt_id: string | null
          tags: string[]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          broker_mappings?: Json
          context_scopes?: string[]
          created_at?: string
          description?: string | null
          execution_config?: Json
          hardcoded_values?: Json
          icon_name?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          name: string
          organization_id?: string | null
          project_id?: string | null
          prompt_builtin_id?: string | null
          prompt_id?: string | null
          tags?: string[]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          broker_mappings?: Json
          context_scopes?: string[]
          created_at?: string
          description?: string | null
          execution_config?: Json
          hardcoded_values?: Json
          icon_name?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          name?: string
          organization_id?: string | null
          project_id?: string | null
          prompt_builtin_id?: string | null
          prompt_id?: string | null
          tags?: string[]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prompt_actions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_actions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_actions_prompt_builtin_id_fkey"
            columns: ["prompt_builtin_id"]
            isOneToOne: false
            referencedRelation: "prompt_builtins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_actions_prompt_builtin_id_fkey"
            columns: ["prompt_builtin_id"]
            isOneToOne: false
            referencedRelation: "prompt_builtins_with_source_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_actions_prompt_builtin_id_fkey"
            columns: ["prompt_builtin_id"]
            isOneToOne: false
            referencedRelation: "shortcuts_by_placement_view"
            referencedColumns: ["builtin_id"]
          },
          {
            foreignKeyName: "prompt_actions_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_app_categories: {
        Row: {
          description: string | null
          icon: string | null
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          description?: string | null
          icon?: string | null
          id: string
          name: string
          sort_order?: number | null
        }
        Update: {
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      prompt_app_errors: {
        Row: {
          app_id: string
          created_at: string | null
          error_code: string | null
          error_details: Json | null
          error_message: string | null
          error_type: string
          execution_id: string | null
          expected_variables: Json | null
          id: string
          resolution_notes: string | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          variables_sent: Json | null
        }
        Insert: {
          app_id: string
          created_at?: string | null
          error_code?: string | null
          error_details?: Json | null
          error_message?: string | null
          error_type: string
          execution_id?: string | null
          expected_variables?: Json | null
          id?: string
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          variables_sent?: Json | null
        }
        Update: {
          app_id?: string
          created_at?: string | null
          error_code?: string | null
          error_details?: Json | null
          error_message?: string | null
          error_type?: string
          execution_id?: string | null
          expected_variables?: Json | null
          id?: string
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          variables_sent?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "prompt_app_errors_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "prompt_app_analytics"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "prompt_app_errors_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "prompt_apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_app_errors_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "prompt_app_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_app_executions: {
        Row: {
          app_id: string
          cost: number | null
          created_at: string | null
          error_message: string | null
          error_type: string | null
          execution_time_ms: number | null
          fingerprint: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          referer: string | null
          success: boolean | null
          task_id: string
          tokens_used: number | null
          user_agent: string | null
          user_id: string | null
          variables_provided: Json | null
          variables_used: Json | null
        }
        Insert: {
          app_id: string
          cost?: number | null
          created_at?: string | null
          error_message?: string | null
          error_type?: string | null
          execution_time_ms?: number | null
          fingerprint?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          referer?: string | null
          success?: boolean | null
          task_id: string
          tokens_used?: number | null
          user_agent?: string | null
          user_id?: string | null
          variables_provided?: Json | null
          variables_used?: Json | null
        }
        Update: {
          app_id?: string
          cost?: number | null
          created_at?: string | null
          error_message?: string | null
          error_type?: string | null
          execution_time_ms?: number | null
          fingerprint?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          referer?: string | null
          success?: boolean | null
          task_id?: string
          tokens_used?: number | null
          user_agent?: string | null
          user_id?: string | null
          variables_provided?: Json | null
          variables_used?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "prompt_app_executions_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "prompt_app_analytics"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "prompt_app_executions_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "prompt_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_app_rate_limits: {
        Row: {
          app_id: string
          blocked_reason: string | null
          blocked_until: string | null
          created_at: string | null
          execution_count: number | null
          fingerprint: string | null
          first_execution_at: string | null
          id: string
          ip_address: unknown
          is_blocked: boolean | null
          last_execution_at: string | null
          updated_at: string | null
          user_id: string | null
          window_start_at: string | null
        }
        Insert: {
          app_id: string
          blocked_reason?: string | null
          blocked_until?: string | null
          created_at?: string | null
          execution_count?: number | null
          fingerprint?: string | null
          first_execution_at?: string | null
          id?: string
          ip_address?: unknown
          is_blocked?: boolean | null
          last_execution_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          window_start_at?: string | null
        }
        Update: {
          app_id?: string
          blocked_reason?: string | null
          blocked_until?: string | null
          created_at?: string | null
          execution_count?: number | null
          fingerprint?: string | null
          first_execution_at?: string | null
          id?: string
          ip_address?: unknown
          is_blocked?: boolean | null
          last_execution_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          window_start_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prompt_app_rate_limits_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "prompt_app_analytics"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "prompt_app_rate_limits_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "prompt_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_app_versions: {
        Row: {
          allowed_imports: Json | null
          app_id: string
          category: string | null
          change_note: string | null
          changed_at: string
          component_code: string | null
          component_language: string | null
          description: string | null
          id: string
          layout_config: Json | null
          name: string | null
          pinned_version: number | null
          prompt_id: string | null
          prompt_source_type: string | null
          prompt_version_id: string | null
          status: string | null
          styling_config: Json | null
          tagline: string | null
          tags: string[] | null
          variable_schema: Json | null
          version_number: number
        }
        Insert: {
          allowed_imports?: Json | null
          app_id: string
          category?: string | null
          change_note?: string | null
          changed_at?: string
          component_code?: string | null
          component_language?: string | null
          description?: string | null
          id?: string
          layout_config?: Json | null
          name?: string | null
          pinned_version?: number | null
          prompt_id?: string | null
          prompt_source_type?: string | null
          prompt_version_id?: string | null
          status?: string | null
          styling_config?: Json | null
          tagline?: string | null
          tags?: string[] | null
          variable_schema?: Json | null
          version_number: number
        }
        Update: {
          allowed_imports?: Json | null
          app_id?: string
          category?: string | null
          change_note?: string | null
          changed_at?: string
          component_code?: string | null
          component_language?: string | null
          description?: string | null
          id?: string
          layout_config?: Json | null
          name?: string | null
          pinned_version?: number | null
          prompt_id?: string | null
          prompt_source_type?: string | null
          prompt_version_id?: string | null
          status?: string | null
          styling_config?: Json | null
          tagline?: string | null
          tags?: string[] | null
          variable_schema?: Json | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_app_versions_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "prompt_app_analytics"
            referencedColumns: ["app_id"]
          },
          {
            foreignKeyName: "prompt_app_versions_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "prompt_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_apps: {
        Row: {
          allowed_imports: Json | null
          avg_execution_time_ms: number | null
          category: string | null
          component_code: string
          component_language: string
          created_at: string | null
          description: string | null
          favicon_url: string | null
          id: string
          is_featured: boolean | null
          is_public: boolean
          is_verified: boolean | null
          last_execution_at: string | null
          layout_config: Json | null
          metadata: Json | null
          name: string
          organization_id: string | null
          pinned_version: number | null
          preview_image_url: string | null
          project_id: string | null
          prompt_id: string
          prompt_source_type: string
          prompt_version_id: string | null
          published_at: string | null
          rate_limit_authenticated: number | null
          rate_limit_per_ip: number | null
          rate_limit_window_hours: number | null
          search_tsv: unknown
          slug: string
          status: string
          styling_config: Json | null
          success_rate: number | null
          tagline: string | null
          tags: string[] | null
          total_cost: number | null
          total_executions: number | null
          total_tokens_used: number | null
          unique_users_count: number | null
          updated_at: string | null
          user_id: string
          variable_schema: Json | null
          version: number
        }
        Insert: {
          allowed_imports?: Json | null
          avg_execution_time_ms?: number | null
          category?: string | null
          component_code: string
          component_language?: string
          created_at?: string | null
          description?: string | null
          favicon_url?: string | null
          id?: string
          is_featured?: boolean | null
          is_public?: boolean
          is_verified?: boolean | null
          last_execution_at?: string | null
          layout_config?: Json | null
          metadata?: Json | null
          name: string
          organization_id?: string | null
          pinned_version?: number | null
          preview_image_url?: string | null
          project_id?: string | null
          prompt_id: string
          prompt_source_type?: string
          prompt_version_id?: string | null
          published_at?: string | null
          rate_limit_authenticated?: number | null
          rate_limit_per_ip?: number | null
          rate_limit_window_hours?: number | null
          search_tsv?: unknown
          slug: string
          status?: string
          styling_config?: Json | null
          success_rate?: number | null
          tagline?: string | null
          tags?: string[] | null
          total_cost?: number | null
          total_executions?: number | null
          total_tokens_used?: number | null
          unique_users_count?: number | null
          updated_at?: string | null
          user_id: string
          variable_schema?: Json | null
          version?: number
        }
        Update: {
          allowed_imports?: Json | null
          avg_execution_time_ms?: number | null
          category?: string | null
          component_code?: string
          component_language?: string
          created_at?: string | null
          description?: string | null
          favicon_url?: string | null
          id?: string
          is_featured?: boolean | null
          is_public?: boolean
          is_verified?: boolean | null
          last_execution_at?: string | null
          layout_config?: Json | null
          metadata?: Json | null
          name?: string
          organization_id?: string | null
          pinned_version?: number | null
          preview_image_url?: string | null
          project_id?: string | null
          prompt_id?: string
          prompt_source_type?: string
          prompt_version_id?: string | null
          published_at?: string | null
          rate_limit_authenticated?: number | null
          rate_limit_per_ip?: number | null
          rate_limit_window_hours?: number | null
          search_tsv?: unknown
          slug?: string
          status?: string
          styling_config?: Json | null
          success_rate?: number | null
          tagline?: string | null
          tags?: string[] | null
          total_cost?: number | null
          total_executions?: number | null
          total_tokens_used?: number | null
          unique_users_count?: number | null
          updated_at?: string | null
          user_id?: string
          variable_schema?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_apps_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_apps_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_apps_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_apps_prompt_version_id_fkey"
            columns: ["prompt_version_id"]
            isOneToOne: false
            referencedRelation: "prompt_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_builtin_versions: {
        Row: {
          builtin_id: string
          category: string | null
          change_note: string | null
          changed_at: string
          context_slots: Json | null
          description: string | null
          dynamic_model: boolean | null
          id: string
          is_active: boolean | null
          messages: Json | null
          model_id: string | null
          name: string | null
          output_format: string | null
          output_schema: Json | null
          settings: Json | null
          tags: string[] | null
          tools: Json | null
          variable_defaults: Json | null
          version_number: number
        }
        Insert: {
          builtin_id: string
          category?: string | null
          change_note?: string | null
          changed_at?: string
          context_slots?: Json | null
          description?: string | null
          dynamic_model?: boolean | null
          id?: string
          is_active?: boolean | null
          messages?: Json | null
          model_id?: string | null
          name?: string | null
          output_format?: string | null
          output_schema?: Json | null
          settings?: Json | null
          tags?: string[] | null
          tools?: Json | null
          variable_defaults?: Json | null
          version_number: number
        }
        Update: {
          builtin_id?: string
          category?: string | null
          change_note?: string | null
          changed_at?: string
          context_slots?: Json | null
          description?: string | null
          dynamic_model?: boolean | null
          id?: string
          is_active?: boolean | null
          messages?: Json | null
          model_id?: string | null
          name?: string | null
          output_format?: string | null
          output_schema?: Json | null
          settings?: Json | null
          tags?: string[] | null
          tools?: Json | null
          variable_defaults?: Json | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_builtin_versions_builtin_id_fkey"
            columns: ["builtin_id"]
            isOneToOne: false
            referencedRelation: "prompt_builtins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_builtin_versions_builtin_id_fkey"
            columns: ["builtin_id"]
            isOneToOne: false
            referencedRelation: "prompt_builtins_with_source_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_builtin_versions_builtin_id_fkey"
            columns: ["builtin_id"]
            isOneToOne: false
            referencedRelation: "shortcuts_by_placement_view"
            referencedColumns: ["builtin_id"]
          },
        ]
      }
      prompt_builtins: {
        Row: {
          category: string | null
          context_slots: Json
          created_at: string
          created_by_user_id: string | null
          description: string | null
          dynamic_model: boolean | null
          id: string
          is_active: boolean
          is_archived: boolean
          is_favorite: boolean
          messages: Json
          model_id: string | null
          name: string
          output_format: string | null
          output_schema: Json | null
          settings: Json | null
          source_prompt_id: string | null
          source_prompt_snapshot_at: string | null
          tags: string[] | null
          tools: Json | null
          updated_at: string
          variable_defaults: Json | null
          version: number
        }
        Insert: {
          category?: string | null
          context_slots?: Json
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          dynamic_model?: boolean | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          is_favorite?: boolean
          messages: Json
          model_id?: string | null
          name: string
          output_format?: string | null
          output_schema?: Json | null
          settings?: Json | null
          source_prompt_id?: string | null
          source_prompt_snapshot_at?: string | null
          tags?: string[] | null
          tools?: Json | null
          updated_at?: string
          variable_defaults?: Json | null
          version?: number
        }
        Update: {
          category?: string | null
          context_slots?: Json
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          dynamic_model?: boolean | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          is_favorite?: boolean
          messages?: Json
          model_id?: string | null
          name?: string
          output_format?: string | null
          output_schema?: Json | null
          settings?: Json | null
          source_prompt_id?: string | null
          source_prompt_snapshot_at?: string | null
          tags?: string[] | null
          tools?: Json | null
          updated_at?: string
          variable_defaults?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_builtins_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "ai_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_builtins_source_prompt_id_fkey"
            columns: ["source_prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_shortcuts: {
        Row: {
          allow_chat: boolean | null
          apply_variables: boolean | null
          auto_run: boolean | null
          available_scopes: string[] | null
          category_id: string
          created_at: string
          created_by_user_id: string | null
          description: string | null
          enabled_contexts: Json | null
          icon_name: string | null
          id: string
          is_active: boolean
          keyboard_shortcut: string | null
          label: string
          prompt_builtin_id: string | null
          result_display: string | null
          scope_mappings: Json | null
          show_variables: boolean | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          allow_chat?: boolean | null
          apply_variables?: boolean | null
          auto_run?: boolean | null
          available_scopes?: string[] | null
          category_id: string
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          enabled_contexts?: Json | null
          icon_name?: string | null
          id?: string
          is_active?: boolean
          keyboard_shortcut?: string | null
          label: string
          prompt_builtin_id?: string | null
          result_display?: string | null
          scope_mappings?: Json | null
          show_variables?: boolean | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          allow_chat?: boolean | null
          apply_variables?: boolean | null
          auto_run?: boolean | null
          available_scopes?: string[] | null
          category_id?: string
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          enabled_contexts?: Json | null
          icon_name?: string | null
          id?: string
          is_active?: boolean
          keyboard_shortcut?: string | null
          label?: string
          prompt_builtin_id?: string | null
          result_display?: string | null
          scope_mappings?: Json | null
          show_variables?: boolean | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_shortcuts_category_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "shortcut_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_shortcuts_category_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "shortcuts_by_placement_view"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "prompt_shortcuts_prompt_fkey"
            columns: ["prompt_builtin_id"]
            isOneToOne: false
            referencedRelation: "prompt_builtins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_shortcuts_prompt_fkey"
            columns: ["prompt_builtin_id"]
            isOneToOne: false
            referencedRelation: "prompt_builtins_with_source_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_shortcuts_prompt_fkey"
            columns: ["prompt_builtin_id"]
            isOneToOne: false
            referencedRelation: "shortcuts_by_placement_view"
            referencedColumns: ["builtin_id"]
          },
        ]
      }
      prompt_templates: {
        Row: {
          category: string | null
          created_at: string
          created_by_user_id: string | null
          description: string | null
          id: string
          is_featured: boolean | null
          messages: Json | null
          name: string
          settings: Json | null
          tools: Json | null
          updated_at: string
          use_count: number | null
          variable_defaults: Json | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          id?: string
          is_featured?: boolean | null
          messages?: Json | null
          name: string
          settings?: Json | null
          tools?: Json | null
          updated_at?: string
          use_count?: number | null
          variable_defaults?: Json | null
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          id?: string
          is_featured?: boolean | null
          messages?: Json | null
          name?: string
          settings?: Json | null
          tools?: Json | null
          updated_at?: string
          use_count?: number | null
          variable_defaults?: Json | null
        }
        Relationships: []
      }
      prompt_versions: {
        Row: {
          category: string | null
          change_note: string | null
          changed_at: string
          context_slots: Json | null
          description: string | null
          dynamic_model: boolean | null
          id: string
          messages: Json | null
          model_id: string | null
          name: string | null
          output_format: string | null
          output_schema: Json | null
          prompt_id: string
          settings: Json | null
          tags: string[] | null
          tools: Json | null
          variable_defaults: Json | null
          version_number: number
        }
        Insert: {
          category?: string | null
          change_note?: string | null
          changed_at?: string
          context_slots?: Json | null
          description?: string | null
          dynamic_model?: boolean | null
          id?: string
          messages?: Json | null
          model_id?: string | null
          name?: string | null
          output_format?: string | null
          output_schema?: Json | null
          prompt_id: string
          settings?: Json | null
          tags?: string[] | null
          tools?: Json | null
          variable_defaults?: Json | null
          version_number: number
        }
        Update: {
          category?: string | null
          change_note?: string | null
          changed_at?: string
          context_slots?: Json | null
          description?: string | null
          dynamic_model?: boolean | null
          id?: string
          messages?: Json | null
          model_id?: string | null
          name?: string | null
          output_format?: string | null
          output_schema?: Json | null
          prompt_id?: string
          settings?: Json | null
          tags?: string[] | null
          tools?: Json | null
          variable_defaults?: Json | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_versions_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      prompts: {
        Row: {
          category: string | null
          context_slots: Json
          created_at: string
          description: string | null
          dynamic_model: boolean | null
          id: string
          is_archived: boolean
          is_favorite: boolean
          is_public: boolean
          messages: Json | null
          model_id: string | null
          name: string | null
          organization_id: string | null
          output_format: string | null
          output_schema: Json | null
          project_id: string | null
          settings: Json | null
          tags: string[] | null
          task_id: string | null
          tools: Json | null
          updated_at: string
          user_id: string | null
          variable_defaults: Json | null
          version: number
        }
        Insert: {
          category?: string | null
          context_slots?: Json
          created_at?: string
          description?: string | null
          dynamic_model?: boolean | null
          id?: string
          is_archived?: boolean
          is_favorite?: boolean
          is_public?: boolean
          messages?: Json | null
          model_id?: string | null
          name?: string | null
          organization_id?: string | null
          output_format?: string | null
          output_schema?: Json | null
          project_id?: string | null
          settings?: Json | null
          tags?: string[] | null
          task_id?: string | null
          tools?: Json | null
          updated_at?: string
          user_id?: string | null
          variable_defaults?: Json | null
          version?: number
        }
        Update: {
          category?: string | null
          context_slots?: Json
          created_at?: string
          description?: string | null
          dynamic_model?: boolean | null
          id?: string
          is_archived?: boolean
          is_favorite?: boolean
          is_public?: boolean
          messages?: Json | null
          model_id?: string | null
          name?: string | null
          organization_id?: string | null
          output_format?: string | null
          output_schema?: Json | null
          project_id?: string | null
          settings?: Json | null
          tags?: string[] | null
          task_id?: string | null
          tools?: Json | null
          updated_at?: string
          user_id?: string | null
          variable_defaults?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompts_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "ai_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompts_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ctx_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_sessions: {
        Row: {
          category: string | null
          completed_at: string | null
          created_at: string
          id: string
          is_completed: boolean | null
          is_public: boolean
          organization_id: string | null
          project_id: string | null
          quiz_content_hash: string | null
          quiz_metadata: Json | null
          state: Json
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean | null
          is_public?: boolean
          organization_id?: string | null
          project_id?: string | null
          quiz_content_hash?: string | null
          quiz_metadata?: Json | null
          state: Json
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean | null
          is_public?: boolean
          organization_id?: string | null
          project_id?: string | null
          quiz_content_hash?: string | null
          quiz_metadata?: Json | null
          state?: Json
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe: {
        Row: {
          description: string | null
          id: string
          is_public: boolean | null
          metadata: Json | null
          name: string
          post_result_options: Json | null
          sample_output: string | null
          status: Database["public"]["Enums"]["recipe_status"]
          tags: Json | null
          user_id: string | null
          version: number | null
        }
        Insert: {
          description?: string | null
          id?: string
          is_public?: boolean | null
          metadata?: Json | null
          name: string
          post_result_options?: Json | null
          sample_output?: string | null
          status?: Database["public"]["Enums"]["recipe_status"]
          tags?: Json | null
          user_id?: string | null
          version?: number | null
        }
        Update: {
          description?: string | null
          id?: string
          is_public?: boolean | null
          metadata?: Json | null
          name?: string
          post_result_options?: Json | null
          sample_output?: string | null
          status?: Database["public"]["Enums"]["recipe_status"]
          tags?: Json | null
          user_id?: string | null
          version?: number | null
        }
        Relationships: []
      }
      recipe_broker: {
        Row: {
          broker: string
          broker_role: Database["public"]["Enums"]["broker_role"]
          id: string
          recipe: string
          required: boolean | null
        }
        Insert: {
          broker: string
          broker_role: Database["public"]["Enums"]["broker_role"]
          id?: string
          recipe: string
          required?: boolean | null
        }
        Update: {
          broker?: string
          broker_role?: Database["public"]["Enums"]["broker_role"]
          id?: string
          recipe?: string
          required?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_broker_broker_fkey"
            columns: ["broker"]
            isOneToOne: false
            referencedRelation: "broker"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_broker_broker_fkey"
            columns: ["broker"]
            isOneToOne: false
            referencedRelation: "view_registered_function_all_rels"
            referencedColumns: ["broker_id"]
          },
          {
            foreignKeyName: "recipe_broker_recipe_fkey"
            columns: ["recipe"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_broker_recipe_fkey"
            columns: ["recipe"]
            isOneToOne: false
            referencedRelation: "recipe_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_broker_recipe_fkey"
            columns: ["recipe"]
            isOneToOne: false
            referencedRelation: "recipe_complete"
            referencedColumns: ["recipe_id"]
          },
        ]
      }
      recipe_display: {
        Row: {
          display: string
          display_settings: Json | null
          id: string
          priority: number | null
          recipe: string
        }
        Insert: {
          display: string
          display_settings?: Json | null
          id?: string
          priority?: number | null
          recipe: string
        }
        Update: {
          display?: string
          display_settings?: Json | null
          id?: string
          priority?: number | null
          recipe?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_display_display_fkey"
            columns: ["display"]
            isOneToOne: false
            referencedRelation: "display_option"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_display_recipe_fkey"
            columns: ["recipe"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_display_recipe_fkey"
            columns: ["recipe"]
            isOneToOne: false
            referencedRelation: "recipe_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_display_recipe_fkey"
            columns: ["recipe"]
            isOneToOne: false
            referencedRelation: "recipe_complete"
            referencedColumns: ["recipe_id"]
          },
        ]
      }
      recipe_message: {
        Row: {
          id: string
          message_id: string
          order: number
          recipe_id: string
        }
        Insert: {
          id?: string
          message_id: string
          order?: number
          recipe_id: string
        }
        Update: {
          id?: string
          message_id?: string
          order?: number
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_message_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "message_template"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_message_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_message_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_message_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_complete"
            referencedColumns: ["recipe_id"]
          },
        ]
      }
      recipe_message_reorder_queue: {
        Row: {
          last_modified: string | null
          recipe_id: string
        }
        Insert: {
          last_modified?: string | null
          recipe_id: string
        }
        Update: {
          last_modified?: string | null
          recipe_id?: string
        }
        Relationships: []
      }
      recipe_model: {
        Row: {
          ai_model: string
          id: string
          priority: number | null
          recipe: string
          role: Database["public"]["Enums"]["model_role"]
        }
        Insert: {
          ai_model: string
          id?: string
          priority?: number | null
          recipe: string
          role?: Database["public"]["Enums"]["model_role"]
        }
        Update: {
          ai_model?: string
          id?: string
          priority?: number | null
          recipe?: string
          role?: Database["public"]["Enums"]["model_role"]
        }
        Relationships: [
          {
            foreignKeyName: "recipe_model_ai_model_fkey"
            columns: ["ai_model"]
            isOneToOne: false
            referencedRelation: "ai_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_model_recipe_fkey"
            columns: ["recipe"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_model_recipe_fkey"
            columns: ["recipe"]
            isOneToOne: false
            referencedRelation: "recipe_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_model_recipe_fkey"
            columns: ["recipe"]
            isOneToOne: false
            referencedRelation: "recipe_complete"
            referencedColumns: ["recipe_id"]
          },
        ]
      }
      recipe_processor: {
        Row: {
          id: string
          params: Json | null
          processor: string
          recipe: string
        }
        Insert: {
          id?: string
          params?: Json | null
          processor: string
          recipe: string
        }
        Update: {
          id?: string
          params?: Json | null
          processor?: string
          recipe?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_processor_processor_fkey"
            columns: ["processor"]
            isOneToOne: false
            referencedRelation: "processor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_processor_recipe_fkey"
            columns: ["recipe"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_processor_recipe_fkey"
            columns: ["recipe"]
            isOneToOne: false
            referencedRelation: "recipe_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_processor_recipe_fkey"
            columns: ["recipe"]
            isOneToOne: false
            referencedRelation: "recipe_complete"
            referencedColumns: ["recipe_id"]
          },
        ]
      }
      redaction_mapping: {
        Row: {
          cipher: string
          ciphertext: string | null
          confidence_tier: string
          created_at: string
          detector_kind: string
          detector_version: string
          expires_at: string | null
          file_id: string
          id: string
          location: Json
          mode: string
          nonce: string | null
          owner_id: string
          page_id: string | null
          pattern_id: string
          revoked_at: string | null
          session_id: string
          span_id: string
          substitute_value: string
        }
        Insert: {
          cipher?: string
          ciphertext?: string | null
          confidence_tier?: string
          created_at?: string
          detector_kind?: string
          detector_version?: string
          expires_at?: string | null
          file_id: string
          id?: string
          location?: Json
          mode: string
          nonce?: string | null
          owner_id: string
          page_id?: string | null
          pattern_id: string
          revoked_at?: string | null
          session_id: string
          span_id: string
          substitute_value: string
        }
        Update: {
          cipher?: string
          ciphertext?: string | null
          confidence_tier?: string
          created_at?: string
          detector_kind?: string
          detector_version?: string
          expires_at?: string | null
          file_id?: string
          id?: string
          location?: Json
          mode?: string
          nonce?: string | null
          owner_id?: string
          page_id?: string | null
          pattern_id?: string
          revoked_at?: string | null
          session_id?: string
          span_id?: string
          substitute_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "redaction_mapping_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "cld_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redaction_mapping_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "file_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      registered_function: {
        Row: {
          category: Database["public"]["Enums"]["reg_func_category"] | null
          class_name: string | null
          description: string | null
          func_name: string
          icon: Database["public"]["Enums"]["icon_type"] | null
          id: string
          module_path: string
          name: string
          node_description: string | null
          return_broker: string
          tags: Json | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["reg_func_category"] | null
          class_name?: string | null
          description?: string | null
          func_name: string
          icon?: Database["public"]["Enums"]["icon_type"] | null
          id?: string
          module_path: string
          name: string
          node_description?: string | null
          return_broker?: string
          tags?: Json | null
        }
        Update: {
          category?: Database["public"]["Enums"]["reg_func_category"] | null
          class_name?: string | null
          description?: string | null
          func_name?: string
          icon?: Database["public"]["Enums"]["icon_type"] | null
          id?: string
          module_path?: string
          name?: string
          node_description?: string | null
          return_broker?: string
          tags?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "registered_function_return_broker_fkey"
            columns: ["return_broker"]
            isOneToOne: false
            referencedRelation: "data_broker"
            referencedColumns: ["id"]
          },
        ]
      }
      registered_node: {
        Row: {
          arguments: Json | null
          category: string | null
          color: Database["public"]["Enums"]["color"] | null
          created_at: string
          custom_editor: Json | null
          depedency_function: string | null
          dependencies: Json | null
          description: string | null
          dynamic_broker_args: Json | null
          dynamic_outputs: Json | null
          function_description: string | null
          icon: Database["public"]["Enums"]["icon_type"] | null
          id: string
          inputs: Json | null
          is_active: boolean | null
          metadata: Json | null
          name: string | null
          node_type: string | null
          outputs: Json | null
          registered_function_id: string | null
          styles: Json | null
          tags: Json | null
          updated_at: string | null
        }
        Insert: {
          arguments?: Json | null
          category?: string | null
          color?: Database["public"]["Enums"]["color"] | null
          created_at?: string
          custom_editor?: Json | null
          depedency_function?: string | null
          dependencies?: Json | null
          description?: string | null
          dynamic_broker_args?: Json | null
          dynamic_outputs?: Json | null
          function_description?: string | null
          icon?: Database["public"]["Enums"]["icon_type"] | null
          id?: string
          inputs?: Json | null
          is_active?: boolean | null
          metadata?: Json | null
          name?: string | null
          node_type?: string | null
          outputs?: Json | null
          registered_function_id?: string | null
          styles?: Json | null
          tags?: Json | null
          updated_at?: string | null
        }
        Update: {
          arguments?: Json | null
          category?: string | null
          color?: Database["public"]["Enums"]["color"] | null
          created_at?: string
          custom_editor?: Json | null
          depedency_function?: string | null
          dependencies?: Json | null
          description?: string | null
          dynamic_broker_args?: Json | null
          dynamic_outputs?: Json | null
          function_description?: string | null
          icon?: Database["public"]["Enums"]["icon_type"] | null
          id?: string
          inputs?: Json | null
          is_active?: boolean | null
          metadata?: Json | null
          name?: string | null
          node_type?: string | null
          outputs?: Json | null
          registered_function_id?: string | null
          styles?: Json | null
          tags?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registered_node_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "node_category"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registered_node_registered_function_id_fkey"
            columns: ["registered_function_id"]
            isOneToOne: false
            referencedRelation: "registered_function"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registered_node_registered_function_id_fkey"
            columns: ["registered_function_id"]
            isOneToOne: false
            referencedRelation: "view_registered_function"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registered_node_registered_function_id_fkey"
            columns: ["registered_function_id"]
            isOneToOne: false
            referencedRelation: "view_registered_function_all_rels"
            referencedColumns: ["id"]
          },
        ]
      }
      registered_node_results: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          is_public: boolean | null
          metadata: Json | null
          registered_node_id: string | null
          user_id: string | null
          workflow_id: string | null
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          is_public?: boolean | null
          metadata?: Json | null
          registered_node_id?: string | null
          user_id?: string | null
          workflow_id?: string | null
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          is_public?: boolean | null
          metadata?: Json | null
          registered_node_id?: string | null
          user_id?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registered_node_results_registered_node_id_fkey"
            columns: ["registered_node_id"]
            isOneToOne: false
            referencedRelation: "registered_node"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registered_node_results_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflow_data"
            referencedColumns: ["id"]
          },
        ]
      }
      rs_analysis: {
        Row: {
          agent_id: string | null
          agent_type: string
          content_id: string
          created_at: string | null
          error: string | null
          id: string
          instructions: string | null
          model_id: string | null
          result: string | null
          result_structured: Json | null
          source_id: string
          status: string
          token_usage: Json | null
          topic_id: string
        }
        Insert: {
          agent_id?: string | null
          agent_type: string
          content_id: string
          created_at?: string | null
          error?: string | null
          id?: string
          instructions?: string | null
          model_id?: string | null
          result?: string | null
          result_structured?: Json | null
          source_id: string
          status?: string
          token_usage?: Json | null
          topic_id: string
        }
        Update: {
          agent_id?: string | null
          agent_type?: string
          content_id?: string
          created_at?: string | null
          error?: string | null
          id?: string
          instructions?: string | null
          model_id?: string | null
          result?: string | null
          result_structured?: Json | null
          source_id?: string
          status?: string
          token_usage?: Json | null
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rs_analysis_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "rs_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rs_analysis_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "rs_source"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rs_analysis_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "rs_source_keywords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rs_analysis_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "rs_topic"
            referencedColumns: ["id"]
          },
        ]
      }
      rs_content: {
        Row: {
          capture_level: number | null
          capture_method: string | null
          char_count: number | null
          content: string | null
          content_hash: string | null
          content_type: string | null
          extracted_images: Json | null
          extracted_links: Json | null
          failure_reason: string | null
          id: string
          is_current: boolean | null
          is_good_scrape: boolean | null
          linked_extraction_id: string | null
          linked_transcript_id: string | null
          modified_at: string | null
          published_at: string | null
          quality_override: string | null
          scraped_at: string | null
          source_id: string
          topic_id: string
          version: number | null
        }
        Insert: {
          capture_level?: number | null
          capture_method?: string | null
          char_count?: number | null
          content?: string | null
          content_hash?: string | null
          content_type?: string | null
          extracted_images?: Json | null
          extracted_links?: Json | null
          failure_reason?: string | null
          id?: string
          is_current?: boolean | null
          is_good_scrape?: boolean | null
          linked_extraction_id?: string | null
          linked_transcript_id?: string | null
          modified_at?: string | null
          published_at?: string | null
          quality_override?: string | null
          scraped_at?: string | null
          source_id: string
          topic_id: string
          version?: number | null
        }
        Update: {
          capture_level?: number | null
          capture_method?: string | null
          char_count?: number | null
          content?: string | null
          content_hash?: string | null
          content_type?: string | null
          extracted_images?: Json | null
          extracted_links?: Json | null
          failure_reason?: string | null
          id?: string
          is_current?: boolean | null
          is_good_scrape?: boolean | null
          linked_extraction_id?: string | null
          linked_transcript_id?: string | null
          modified_at?: string | null
          published_at?: string | null
          quality_override?: string | null
          scraped_at?: string | null
          source_id?: string
          topic_id?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rs_content_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "rs_source"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rs_content_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "rs_source_keywords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rs_content_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "rs_topic"
            referencedColumns: ["id"]
          },
        ]
      }
      rs_document: {
        Row: {
          agent_id: string | null
          agent_type: string | null
          content: string | null
          content_structured: Json | null
          created_at: string | null
          error: string | null
          id: string
          is_current: boolean
          model_id: string | null
          source_consolidation_ids: Json | null
          status: string
          title: string | null
          token_usage: Json | null
          topic_id: string
          version: number | null
        }
        Insert: {
          agent_id?: string | null
          agent_type?: string | null
          content?: string | null
          content_structured?: Json | null
          created_at?: string | null
          error?: string | null
          id?: string
          is_current?: boolean
          model_id?: string | null
          source_consolidation_ids?: Json | null
          status?: string
          title?: string | null
          token_usage?: Json | null
          topic_id: string
          version?: number | null
        }
        Update: {
          agent_id?: string | null
          agent_type?: string | null
          content?: string | null
          content_structured?: Json | null
          created_at?: string | null
          error?: string | null
          id?: string
          is_current?: boolean
          model_id?: string | null
          source_consolidation_ids?: Json | null
          status?: string
          title?: string | null
          token_usage?: Json | null
          topic_id?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rs_document_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "rs_topic"
            referencedColumns: ["id"]
          },
        ]
      }
      rs_keyword: {
        Row: {
          created_at: string | null
          id: string
          is_stale: boolean | null
          keyword: string
          last_searched_at: string | null
          position: number
          raw_api_response: Json | null
          result_count: number | null
          search_params: Json
          search_provider: string
          topic_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_stale?: boolean | null
          keyword: string
          last_searched_at?: string | null
          position?: number
          raw_api_response?: Json | null
          result_count?: number | null
          search_params?: Json
          search_provider?: string
          topic_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_stale?: boolean | null
          keyword?: string
          last_searched_at?: string | null
          position?: number
          raw_api_response?: Json | null
          result_count?: number | null
          search_params?: Json
          search_provider?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rs_keyword_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "rs_topic"
            referencedColumns: ["id"]
          },
        ]
      }
      rs_keyword_source: {
        Row: {
          created_at: string | null
          id: string
          keyword_id: string
          rank_for_keyword: number | null
          source_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          keyword_id: string
          rank_for_keyword?: number | null
          source_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          keyword_id?: string
          rank_for_keyword?: number | null
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rs_keyword_source_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "rs_keyword"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rs_keyword_source_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "rs_source"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rs_keyword_source_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "rs_source_keywords"
            referencedColumns: ["id"]
          },
        ]
      }
      rs_media: {
        Row: {
          alt_text: string | null
          caption: string | null
          created_at: string | null
          height: number | null
          id: string
          is_relevant: boolean | null
          media_type: string
          metadata: Json | null
          source_id: string
          thumbnail_url: string | null
          topic_id: string
          url: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          caption?: string | null
          created_at?: string | null
          height?: number | null
          id?: string
          is_relevant?: boolean | null
          media_type: string
          metadata?: Json | null
          source_id: string
          thumbnail_url?: string | null
          topic_id: string
          url: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          caption?: string | null
          created_at?: string | null
          height?: number | null
          id?: string
          is_relevant?: boolean | null
          media_type?: string
          metadata?: Json | null
          source_id?: string
          thumbnail_url?: string | null
          topic_id?: string
          url?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rs_media_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "rs_source"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rs_media_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "rs_source_keywords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rs_media_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "rs_topic"
            referencedColumns: ["id"]
          },
        ]
      }
      rs_source: {
        Row: {
          description: string | null
          discovered_at: string | null
          extra_snippets: Json | null
          hostname: string | null
          id: string
          is_included: boolean | null
          is_stale: boolean | null
          last_seen_at: string | null
          last_server_attempt_at: string | null
          last_server_failure_reason: string | null
          origin: string
          page_age: string | null
          rank: number | null
          raw_search_result: Json | null
          scrape_status: string
          server_attempts: number
          server_gave_up: boolean
          source_type: string
          thumbnail_url: string | null
          title: string | null
          topic_id: string
          url: string
          user_verdict: string | null
          user_verdict_at: string | null
          user_verdict_notes: string | null
        }
        Insert: {
          description?: string | null
          discovered_at?: string | null
          extra_snippets?: Json | null
          hostname?: string | null
          id?: string
          is_included?: boolean | null
          is_stale?: boolean | null
          last_seen_at?: string | null
          last_server_attempt_at?: string | null
          last_server_failure_reason?: string | null
          origin?: string
          page_age?: string | null
          rank?: number | null
          raw_search_result?: Json | null
          scrape_status?: string
          server_attempts?: number
          server_gave_up?: boolean
          source_type?: string
          thumbnail_url?: string | null
          title?: string | null
          topic_id: string
          url: string
          user_verdict?: string | null
          user_verdict_at?: string | null
          user_verdict_notes?: string | null
        }
        Update: {
          description?: string | null
          discovered_at?: string | null
          extra_snippets?: Json | null
          hostname?: string | null
          id?: string
          is_included?: boolean | null
          is_stale?: boolean | null
          last_seen_at?: string | null
          last_server_attempt_at?: string | null
          last_server_failure_reason?: string | null
          origin?: string
          page_age?: string | null
          rank?: number | null
          raw_search_result?: Json | null
          scrape_status?: string
          server_attempts?: number
          server_gave_up?: boolean
          source_type?: string
          thumbnail_url?: string | null
          title?: string | null
          topic_id?: string
          url?: string
          user_verdict?: string | null
          user_verdict_at?: string | null
          user_verdict_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rs_source_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "rs_topic"
            referencedColumns: ["id"]
          },
        ]
      }
      rs_source_tag: {
        Row: {
          assigned_by: string | null
          confidence: number | null
          created_at: string | null
          id: string
          is_primary_source: boolean | null
          source_id: string
          tag_id: string
        }
        Insert: {
          assigned_by?: string | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          is_primary_source?: boolean | null
          source_id: string
          tag_id: string
        }
        Update: {
          assigned_by?: string | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          is_primary_source?: boolean | null
          source_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rs_source_tag_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "rs_source"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rs_source_tag_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "rs_source_keywords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rs_source_tag_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "rs_tag"
            referencedColumns: ["id"]
          },
        ]
      }
      rs_synthesis: {
        Row: {
          agent_id: string | null
          agent_type: string
          created_at: string | null
          error: string | null
          id: string
          input_analysis_ids: Json | null
          input_source_ids: Json | null
          instructions: string | null
          is_current: boolean | null
          iteration_mode: string | null
          keyword_id: string | null
          model_id: string | null
          previous_synthesis_id: string | null
          result: string | null
          result_structured: Json | null
          scope: string
          status: string
          tag_id: string | null
          token_usage: Json | null
          topic_id: string
          version: number | null
        }
        Insert: {
          agent_id?: string | null
          agent_type: string
          created_at?: string | null
          error?: string | null
          id?: string
          input_analysis_ids?: Json | null
          input_source_ids?: Json | null
          instructions?: string | null
          is_current?: boolean | null
          iteration_mode?: string | null
          keyword_id?: string | null
          model_id?: string | null
          previous_synthesis_id?: string | null
          result?: string | null
          result_structured?: Json | null
          scope: string
          status?: string
          tag_id?: string | null
          token_usage?: Json | null
          topic_id: string
          version?: number | null
        }
        Update: {
          agent_id?: string | null
          agent_type?: string
          created_at?: string | null
          error?: string | null
          id?: string
          input_analysis_ids?: Json | null
          input_source_ids?: Json | null
          instructions?: string | null
          is_current?: boolean | null
          iteration_mode?: string | null
          keyword_id?: string | null
          model_id?: string | null
          previous_synthesis_id?: string | null
          result?: string | null
          result_structured?: Json | null
          scope?: string
          status?: string
          tag_id?: string | null
          token_usage?: Json | null
          topic_id?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rs_synthesis_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "rs_keyword"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rs_synthesis_previous_synthesis_id_fkey"
            columns: ["previous_synthesis_id"]
            isOneToOne: false
            referencedRelation: "rs_synthesis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rs_synthesis_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "rs_tag"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rs_synthesis_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "rs_topic"
            referencedColumns: ["id"]
          },
        ]
      }
      rs_tag: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          sort_order: number | null
          topic_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          sort_order?: number | null
          topic_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rs_tag_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "rs_topic"
            referencedColumns: ["id"]
          },
        ]
      }
      rs_template: {
        Row: {
          agent_config: Json | null
          autonomy_level: string
          created_at: string
          created_by: string | null
          default_search_params: Json | null
          default_tags: Json | null
          description: string | null
          id: string
          is_system: boolean
          keyword_templates: Json | null
          metadata: Json | null
          name: string
        }
        Insert: {
          agent_config?: Json | null
          autonomy_level?: string
          created_at?: string
          created_by?: string | null
          default_search_params?: Json | null
          default_tags?: Json | null
          description?: string | null
          id?: string
          is_system?: boolean
          keyword_templates?: Json | null
          metadata?: Json | null
          name: string
        }
        Update: {
          agent_config?: Json | null
          autonomy_level?: string
          created_at?: string
          created_by?: string | null
          default_search_params?: Json | null
          default_tags?: Json | null
          description?: string | null
          id?: string
          is_system?: boolean
          keyword_templates?: Json | null
          metadata?: Json | null
          name?: string
        }
        Relationships: []
      }
      rs_topic: {
        Row: {
          agent_config: Json
          analyses_per_keyword: number
          autonomy_level: string
          created_at: string | null
          created_by: string | null
          default_search_params: Json
          default_search_provider: string
          description: string | null
          good_scrape_threshold: number
          id: string
          max_auto_tag_calls: number
          max_documents: number
          max_keyword_syntheses: number
          max_keywords: number
          max_project_syntheses: number
          max_tag_consolidations: number
          metadata: Json
          name: string
          project_id: string
          scrapes_per_keyword: number
          status: string
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          agent_config?: Json
          analyses_per_keyword?: number
          autonomy_level?: string
          created_at?: string | null
          created_by?: string | null
          default_search_params?: Json
          default_search_provider?: string
          description?: string | null
          good_scrape_threshold?: number
          id?: string
          max_auto_tag_calls?: number
          max_documents?: number
          max_keyword_syntheses?: number
          max_keywords?: number
          max_project_syntheses?: number
          max_tag_consolidations?: number
          metadata?: Json
          name?: string
          project_id: string
          scrapes_per_keyword?: number
          status?: string
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_config?: Json
          analyses_per_keyword?: number
          autonomy_level?: string
          created_at?: string | null
          created_by?: string | null
          default_search_params?: Json
          default_search_provider?: string
          description?: string | null
          good_scrape_threshold?: number
          id?: string
          max_auto_tag_calls?: number
          max_documents?: number
          max_keyword_syntheses?: number
          max_keywords?: number
          max_project_syntheses?: number
          max_tag_consolidations?: number
          metadata?: Json
          name?: string
          project_id?: string
          scrapes_per_keyword?: number
          status?: string
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rs_topic_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rs_topic_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "rs_template"
            referencedColumns: ["id"]
          },
        ]
      }
      sandbox_instances: {
        Row: {
          cold_path: string | null
          config: Json | null
          container_id: string | null
          created_at: string
          deleted_at: string | null
          expires_at: string | null
          hot_path: string | null
          id: string
          is_public: boolean
          labels: Json | null
          last_heartbeat_at: string | null
          organization_id: string | null
          persistence_volume: string | null
          project_id: string | null
          sandbox_id: string
          status: string
          stop_reason: string | null
          stopped_at: string | null
          task_id: string | null
          template: string | null
          template_version: string | null
          tier: string | null
          ttl_seconds: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cold_path?: string | null
          config?: Json | null
          container_id?: string | null
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          hot_path?: string | null
          id?: string
          is_public?: boolean
          labels?: Json | null
          last_heartbeat_at?: string | null
          organization_id?: string | null
          persistence_volume?: string | null
          project_id?: string | null
          sandbox_id: string
          status?: string
          stop_reason?: string | null
          stopped_at?: string | null
          task_id?: string | null
          template?: string | null
          template_version?: string | null
          tier?: string | null
          ttl_seconds?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cold_path?: string | null
          config?: Json | null
          container_id?: string | null
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          hot_path?: string | null
          id?: string
          is_public?: boolean
          labels?: Json | null
          last_heartbeat_at?: string | null
          organization_id?: string | null
          persistence_volume?: string | null
          project_id?: string | null
          sandbox_id?: string
          status?: string
          stop_reason?: string | null
          stopped_at?: string | null
          task_id?: string | null
          template?: string | null
          template_version?: string | null
          tier?: string | null
          ttl_seconds?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sandbox_instances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sandbox_instances_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sandbox_instances_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ctx_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      sch_agent_task: {
        Row: {
          agent_id: string | null
          auth_mode: string
          id: string
          max_concurrent: number
          max_runtime_seconds: number
          persistent_conversation_id: string | null
          prompt: string
          variables: Json
        }
        Insert: {
          agent_id?: string | null
          auth_mode?: string
          id: string
          max_concurrent?: number
          max_runtime_seconds?: number
          persistent_conversation_id?: string | null
          prompt: string
          variables?: Json
        }
        Update: {
          agent_id?: string | null
          auth_mode?: string
          id?: string
          max_concurrent?: number
          max_runtime_seconds?: number
          persistent_conversation_id?: string | null
          prompt?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "sch_agent_task_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "sch_task"
            referencedColumns: ["id"]
          },
        ]
      }
      sch_run: {
        Row: {
          claim_expires_at: string | null
          claim_token: string | null
          claimed_at: string | null
          created_at: string
          due_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          output_ref: Json | null
          queue: string | null
          result_metadata: Json | null
          result_summary: string | null
          started_at: string | null
          status: string
          surface: string | null
          task_id: string
          trigger_id: string | null
          user_id: string
        }
        Insert: {
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          created_at?: string
          due_at: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          output_ref?: Json | null
          queue?: string | null
          result_metadata?: Json | null
          result_summary?: string | null
          started_at?: string | null
          status?: string
          surface?: string | null
          task_id: string
          trigger_id?: string | null
          user_id?: string
        }
        Update: {
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          created_at?: string
          due_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          output_ref?: Json | null
          queue?: string | null
          result_metadata?: Json | null
          result_summary?: string | null
          started_at?: string | null
          status?: string
          surface?: string | null
          task_id?: string
          trigger_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sch_run_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "sch_task"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sch_run_trigger_id_fkey"
            columns: ["trigger_id"]
            isOneToOne: false
            referencedRelation: "sch_trigger"
            referencedColumns: ["id"]
          },
        ]
      }
      sch_task: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          enabled: boolean
          expires_at: string | null
          id: string
          kind: string
          last_run_at: string | null
          next_due_at: string | null
          queue: string
          surfaces: string[]
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          enabled?: boolean
          expires_at?: string | null
          id?: string
          kind: string
          last_run_at?: string | null
          next_due_at?: string | null
          queue?: string
          surfaces?: string[]
          tags?: string[]
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          enabled?: boolean
          expires_at?: string | null
          id?: string
          kind?: string
          last_run_at?: string | null
          next_due_at?: string | null
          queue?: string
          surfaces?: string[]
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sch_trigger: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          id: string
          last_fired_at: string | null
          next_due_at: string | null
          task_id: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          last_fired_at?: string | null
          next_due_at?: string | null
          task_id: string
          type: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          last_fired_at?: string | null
          next_due_at?: string | null
          task_id?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sch_trigger_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "sch_task"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_templates: {
        Row: {
          created_at: string | null
          description: string | null
          fields: Json
          id: string
          template_name: string
          version: number
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          fields: Json
          id?: string
          template_name: string
          version?: number
        }
        Update: {
          created_at?: string | null
          description?: string | null
          fields?: Json
          id?: string
          template_name?: string
          version?: number
        }
        Relationships: []
      }
      scrape_base_config: {
        Row: {
          created_at: string
          exact: Json | null
          id: string
          is_public: boolean | null
          partial: Json | null
          regex: Json | null
          selector_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          exact?: Json | null
          id?: string
          is_public?: boolean | null
          partial?: Json | null
          regex?: Json | null
          selector_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          exact?: Json | null
          id?: string
          is_public?: boolean | null
          partial?: Json | null
          regex?: Json | null
          selector_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      scrape_cache_policy: {
        Row: {
          created_at: string
          id: string
          is_public: boolean | null
          rescrape_after: number
          stale_after: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_public?: boolean | null
          rescrape_after?: number
          stale_after?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_public?: boolean | null
          rescrape_after?: number
          stale_after?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      scrape_configuration: {
        Row: {
          created_at: string | null
          id: string
          interaction_settings_id: string | null
          is_active: boolean | null
          is_public: boolean | null
          scrape_mode: string
          scrape_path_pattern_id: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          interaction_settings_id?: string | null
          is_active?: boolean | null
          is_public?: boolean | null
          scrape_mode?: string
          scrape_path_pattern_id: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          interaction_settings_id?: string | null
          is_active?: boolean | null
          is_public?: boolean | null
          scrape_mode?: string
          scrape_path_pattern_id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scrape_configuration_scrape_path_pattern_id_fkey"
            columns: ["scrape_path_pattern_id"]
            isOneToOne: false
            referencedRelation: "scrape_path_pattern"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_cycle_run: {
        Row: {
          allow_pattern: string | null
          completed_at: string | null
          created_at: string
          disallow_patterns: Json | null
          id: string
          is_public: boolean | null
          run_number: number
          scrape_cycle_tracker_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          allow_pattern?: string | null
          completed_at?: string | null
          created_at?: string
          disallow_patterns?: Json | null
          id?: string
          is_public?: boolean | null
          run_number: number
          scrape_cycle_tracker_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          allow_pattern?: string | null
          completed_at?: string | null
          created_at?: string
          disallow_patterns?: Json | null
          id?: string
          is_public?: boolean | null
          run_number?: number
          scrape_cycle_tracker_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scrape_cycle_run_scrape_cycle_tracker_id_fkey"
            columns: ["scrape_cycle_tracker_id"]
            isOneToOne: false
            referencedRelation: "scrape_cycle_tracker"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_cycle_tracker: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          is_public: boolean | null
          last_run_at: string | null
          next_run_at: string | null
          page_name: string | null
          scrape_job_id: string | null
          scrape_path_pattern_cache_policy_id: string | null
          target_url: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          last_run_at?: string | null
          next_run_at?: string | null
          page_name?: string | null
          scrape_job_id?: string | null
          scrape_path_pattern_cache_policy_id?: string | null
          target_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          last_run_at?: string | null
          next_run_at?: string | null
          page_name?: string | null
          scrape_job_id?: string | null
          scrape_path_pattern_cache_policy_id?: string | null
          target_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scrape_cycle_tracker_scrape_job_id_fkey"
            columns: ["scrape_job_id"]
            isOneToOne: false
            referencedRelation: "scrape_job"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrape_cycle_tracker_scrape_path_pattern_cache_policy_id_fkey"
            columns: ["scrape_path_pattern_cache_policy_id"]
            isOneToOne: false
            referencedRelation: "scrape_path_pattern_cache_policy"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_domain: {
        Row: {
          common_name: string | null
          content_selector: string | null
          created_at: string | null
          id: string
          is_public: boolean | null
          min_content_chars: number | null
          min_real_content_chars: number | null
          policy_action: string | null
          policy_notes: string | null
          scrape_allowed: boolean | null
          updated_at: string | null
          url: string | null
        }
        Insert: {
          common_name?: string | null
          content_selector?: string | null
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          min_content_chars?: number | null
          min_real_content_chars?: number | null
          policy_action?: string | null
          policy_notes?: string | null
          scrape_allowed?: boolean | null
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          common_name?: string | null
          content_selector?: string | null
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          min_content_chars?: number | null
          min_real_content_chars?: number | null
          policy_action?: string | null
          policy_notes?: string | null
          scrape_allowed?: boolean | null
          updated_at?: string | null
          url?: string | null
        }
        Relationships: []
      }
      scrape_domain_disallowed_notes: {
        Row: {
          created_at: string | null
          id: string
          is_public: boolean | null
          notes: string | null
          scrape_domain_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          notes?: string | null
          scrape_domain_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          notes?: string | null
          scrape_domain_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scrape_domain_disallowed_notes_scrape_domain_id_fkey"
            columns: ["scrape_domain_id"]
            isOneToOne: false
            referencedRelation: "scrape_domain"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_domain_notes: {
        Row: {
          created_at: string | null
          id: string
          is_public: boolean | null
          notes: string | null
          scrape_domain_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          notes?: string | null
          scrape_domain_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          notes?: string | null
          scrape_domain_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scrape_domain_notes_scrape_domain_id_fkey"
            columns: ["scrape_domain_id"]
            isOneToOne: false
            referencedRelation: "scrape_domain"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_domain_quick_scrape_settings: {
        Row: {
          created_at: string | null
          enabled: boolean
          id: string
          is_public: boolean | null
          proxy_type: string | null
          scrape_domain_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean
          id?: string
          is_public?: boolean | null
          proxy_type?: string | null
          scrape_domain_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          enabled?: boolean
          id?: string
          is_public?: boolean | null
          proxy_type?: string | null
          scrape_domain_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scrape_domain_quick_scrape_settings_scrape_domain_id_fkey"
            columns: ["scrape_domain_id"]
            isOneToOne: false
            referencedRelation: "scrape_domain"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_domain_robots_txt: {
        Row: {
          created_at: string | null
          id: string
          is_public: boolean | null
          robots_txt: string | null
          scrape_domain_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          robots_txt?: string | null
          scrape_domain_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          robots_txt?: string | null
          scrape_domain_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scrape_domain_robots_txt_scrape_domain_id_fkey"
            columns: ["scrape_domain_id"]
            isOneToOne: false
            referencedRelation: "scrape_domain"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_domain_settings: {
        Row: {
          created_at: string
          domain_id: string
          enabled: boolean
          id: string
          proxy_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain_id: string
          enabled?: boolean
          id?: string
          proxy_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain_id?: string
          enabled?: boolean
          id?: string
          proxy_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrape_domain_settings_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: true
            referencedRelation: "scrape_domain"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_domain_sitemap: {
        Row: {
          created_at: string | null
          id: string
          is_public: boolean | null
          scrape_domain_id: string | null
          sitemap: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          scrape_domain_id?: string | null
          sitemap?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          scrape_domain_id?: string | null
          sitemap?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scrape_domain_sitemap_scrape_domain_id_fkey"
            columns: ["scrape_domain_id"]
            isOneToOne: false
            referencedRelation: "scrape_domain"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_failure_log: {
        Row: {
          attempt_count: number
          created_at: string
          domain_name: string
          error_log: string | null
          failure_category: string | null
          failure_reason: string
          id: string
          proxy_type: string | null
          proxy_used: boolean
          status_code: number | null
          target_url: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          domain_name: string
          error_log?: string | null
          failure_category?: string | null
          failure_reason: string
          id?: string
          proxy_type?: string | null
          proxy_used?: boolean
          status_code?: number | null
          target_url: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          domain_name?: string
          error_log?: string | null
          failure_category?: string | null
          failure_reason?: string
          id?: string
          proxy_type?: string | null
          proxy_used?: boolean
          status_code?: number | null
          target_url?: string
        }
        Relationships: []
      }
      scrape_job: {
        Row: {
          attempt_limit: number
          created_at: string
          description: string | null
          finished_at: string | null
          id: string
          is_public: boolean | null
          name: string | null
          parse_status: string
          scrape_domain_id: string
          scrape_status: string
          start_urls: string[]
          started_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attempt_limit?: number
          created_at?: string
          description?: string | null
          finished_at?: string | null
          id?: string
          is_public?: boolean | null
          name?: string | null
          parse_status: string
          scrape_domain_id: string
          scrape_status: string
          start_urls: string[]
          started_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attempt_limit?: number
          created_at?: string
          description?: string | null
          finished_at?: string | null
          id?: string
          is_public?: boolean | null
          name?: string | null
          parse_status?: string
          scrape_domain_id?: string
          scrape_status?: string
          start_urls?: string[]
          started_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scrape_job_scrape_domain_id_fkey"
            columns: ["scrape_domain_id"]
            isOneToOne: false
            referencedRelation: "scrape_domain"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_override: {
        Row: {
          action: string
          config_type: string
          created_at: string | null
          id: string
          is_public: boolean | null
          match_type: string | null
          name: string
          selector_type: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          config_type: string
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          match_type?: string | null
          name: string
          selector_type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          config_type?: string
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          match_type?: string | null
          name?: string
          selector_type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      scrape_override_value: {
        Row: {
          created_at: string | null
          id: string
          is_public: boolean | null
          scrape_override_id: string
          updated_at: string | null
          user_id: string | null
          value: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          scrape_override_id: string
          updated_at?: string | null
          user_id?: string | null
          value: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          scrape_override_id?: string
          updated_at?: string | null
          user_id?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrape_override_value_scrape_override_id_fkey"
            columns: ["scrape_override_id"]
            isOneToOne: false
            referencedRelation: "scrape_override"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_parsed_page: {
        Row: {
          char_count: number | null
          content: Json | null
          content_type: string | null
          created_at: string | null
          domain: string | null
          expires_at: string | null
          id: string
          is_public: boolean | null
          local_path: string | null
          page_name: string
          remote_path: string | null
          scrape_configuration_id: string | null
          scrape_cycle_run_id: string | null
          scrape_cycle_tracker_id: string | null
          scrape_path_pattern_cache_policy_id: string | null
          scrape_path_pattern_override_id: string | null
          scrape_task_id: string | null
          scrape_task_response_id: string | null
          scraped_at: string | null
          updated_at: string | null
          url: string | null
          user_id: string | null
          validity: string
        }
        Insert: {
          char_count?: number | null
          content?: Json | null
          content_type?: string | null
          created_at?: string | null
          domain?: string | null
          expires_at?: string | null
          id?: string
          is_public?: boolean | null
          local_path?: string | null
          page_name: string
          remote_path?: string | null
          scrape_configuration_id?: string | null
          scrape_cycle_run_id?: string | null
          scrape_cycle_tracker_id?: string | null
          scrape_path_pattern_cache_policy_id?: string | null
          scrape_path_pattern_override_id?: string | null
          scrape_task_id?: string | null
          scrape_task_response_id?: string | null
          scraped_at?: string | null
          updated_at?: string | null
          url?: string | null
          user_id?: string | null
          validity: string
        }
        Update: {
          char_count?: number | null
          content?: Json | null
          content_type?: string | null
          created_at?: string | null
          domain?: string | null
          expires_at?: string | null
          id?: string
          is_public?: boolean | null
          local_path?: string | null
          page_name?: string
          remote_path?: string | null
          scrape_configuration_id?: string | null
          scrape_cycle_run_id?: string | null
          scrape_cycle_tracker_id?: string | null
          scrape_path_pattern_cache_policy_id?: string | null
          scrape_path_pattern_override_id?: string | null
          scrape_task_id?: string | null
          scrape_task_response_id?: string | null
          scraped_at?: string | null
          updated_at?: string | null
          url?: string | null
          user_id?: string | null
          validity?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrape_parsed_page_scrape_configuration_id_fkey"
            columns: ["scrape_configuration_id"]
            isOneToOne: false
            referencedRelation: "scrape_configuration"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrape_parsed_page_scrape_cycle_run_id_fkey"
            columns: ["scrape_cycle_run_id"]
            isOneToOne: false
            referencedRelation: "scrape_cycle_run"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrape_parsed_page_scrape_cycle_tracker_id_fkey"
            columns: ["scrape_cycle_tracker_id"]
            isOneToOne: false
            referencedRelation: "scrape_cycle_tracker"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrape_parsed_page_scrape_path_pattern_cache_policy_id_fkey"
            columns: ["scrape_path_pattern_cache_policy_id"]
            isOneToOne: false
            referencedRelation: "scrape_path_pattern_cache_policy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrape_parsed_page_scrape_path_pattern_override_id_fkey"
            columns: ["scrape_path_pattern_override_id"]
            isOneToOne: false
            referencedRelation: "scrape_path_pattern_override"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrape_parsed_page_scrape_task_id_fkey"
            columns: ["scrape_task_id"]
            isOneToOne: false
            referencedRelation: "scrape_task"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrape_parsed_page_scrape_task_response_id_fkey"
            columns: ["scrape_task_response_id"]
            isOneToOne: false
            referencedRelation: "scrape_task_response"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_path_override: {
        Row: {
          action: string
          config_type: string
          created_at: string
          id: string
          is_active: boolean
          match_type: string
          path_pattern_id: string
          selector_type: string
          values: Json
        }
        Insert: {
          action: string
          config_type: string
          created_at?: string
          id?: string
          is_active?: boolean
          match_type: string
          path_pattern_id: string
          selector_type: string
          values?: Json
        }
        Update: {
          action?: string
          config_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          match_type?: string
          path_pattern_id?: string
          selector_type?: string
          values?: Json
        }
        Relationships: [
          {
            foreignKeyName: "scrape_path_override_path_pattern_id_fkey"
            columns: ["path_pattern_id"]
            isOneToOne: false
            referencedRelation: "scrape_path_pattern"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_path_pattern: {
        Row: {
          content_selector: string | null
          created_at: string | null
          id: string
          is_public: boolean | null
          min_content_chars: number | null
          min_real_content_chars: number | null
          path_pattern: string | null
          policy_action: string | null
          policy_notes: string | null
          scrape_domain_id: string | null
          updated_at: string | null
        }
        Insert: {
          content_selector?: string | null
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          min_content_chars?: number | null
          min_real_content_chars?: number | null
          path_pattern?: string | null
          policy_action?: string | null
          policy_notes?: string | null
          scrape_domain_id?: string | null
          updated_at?: string | null
        }
        Update: {
          content_selector?: string | null
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          min_content_chars?: number | null
          min_real_content_chars?: number | null
          path_pattern?: string | null
          policy_action?: string | null
          policy_notes?: string | null
          scrape_domain_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scrape_path_pattern_scrape_domain_id_fkey"
            columns: ["scrape_domain_id"]
            isOneToOne: false
            referencedRelation: "scrape_domain"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_path_pattern_cache_policy: {
        Row: {
          created_at: string
          id: string
          is_public: boolean | null
          scrape_cache_policy_id: string
          scrape_path_pattern_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_public?: boolean | null
          scrape_cache_policy_id: string
          scrape_path_pattern_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_public?: boolean | null
          scrape_cache_policy_id?: string
          scrape_path_pattern_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scrape_path_pattern_cache_policy_scrape_cache_policy_id_fkey"
            columns: ["scrape_cache_policy_id"]
            isOneToOne: false
            referencedRelation: "scrape_cache_policy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrape_path_pattern_cache_policy_scrape_path_pattern_id_fkey"
            columns: ["scrape_path_pattern_id"]
            isOneToOne: false
            referencedRelation: "scrape_path_pattern"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_path_pattern_override: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_public: boolean
          name: string
          scrape_override_id: string
          scrape_path_pattern_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_public?: boolean
          name: string
          scrape_override_id: string
          scrape_path_pattern_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_public?: boolean
          name?: string
          scrape_override_id?: string
          scrape_path_pattern_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scrape_path_pattern_override_scrape_override_id_fkey"
            columns: ["scrape_override_id"]
            isOneToOne: false
            referencedRelation: "scrape_override"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrape_path_pattern_override_scrape_path_pattern_id_fkey"
            columns: ["scrape_path_pattern_id"]
            isOneToOne: false
            referencedRelation: "scrape_path_pattern"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_quick_failure_log: {
        Row: {
          created_at: string | null
          domain_name: string | null
          error_log: string | null
          failure_reason: string | null
          id: string
          is_public: boolean | null
          scrape_domain_id: string | null
          target_url: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          domain_name?: string | null
          error_log?: string | null
          failure_reason?: string | null
          id?: string
          is_public?: boolean | null
          scrape_domain_id?: string | null
          target_url: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          domain_name?: string | null
          error_log?: string | null
          failure_reason?: string | null
          id?: string
          is_public?: boolean | null
          scrape_domain_id?: string | null
          target_url?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scrape_quick_failure_log_scrape_domain_id_fkey"
            columns: ["scrape_domain_id"]
            isOneToOne: false
            referencedRelation: "scrape_domain"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_retry_queue: {
        Row: {
          attempt_count: number
          claim_expires_at: string | null
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          created_at: string
          domain_name: string
          failure_log_id: string | null
          failure_reason: string
          id: string
          last_error: string | null
          original_failure_at: string
          request_context: Json
          status: string
          target_url: string
          tier: string
        }
        Insert: {
          attempt_count?: number
          claim_expires_at?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          domain_name: string
          failure_log_id?: string | null
          failure_reason: string
          id?: string
          last_error?: string | null
          original_failure_at?: string
          request_context?: Json
          status?: string
          target_url: string
          tier?: string
        }
        Update: {
          attempt_count?: number
          claim_expires_at?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          domain_name?: string
          failure_log_id?: string | null
          failure_reason?: string
          id?: string
          last_error?: string | null
          original_failure_at?: string
          request_context?: Json
          status?: string
          target_url?: string
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrape_retry_queue_failure_log_id_fkey"
            columns: ["failure_log_id"]
            isOneToOne: false
            referencedRelation: "scrape_failure_log"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_task: {
        Row: {
          attempts_left: number
          cancel_message: string | null
          created_at: string
          discovered_links: Json | null
          failure_reason: string | null
          id: string
          interaction_config: Json | null
          is_public: boolean | null
          page_name: string
          parent_task: string | null
          parse_status: string | null
          priority: number | null
          scrape_cycle_run_id: string | null
          scrape_domain_id: string | null
          scrape_job_id: string | null
          scrape_mode: string
          scrape_status: string | null
          spawned_concurrent_tasks: boolean | null
          target_url: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attempts_left: number
          cancel_message?: string | null
          created_at?: string
          discovered_links?: Json | null
          failure_reason?: string | null
          id?: string
          interaction_config?: Json | null
          is_public?: boolean | null
          page_name: string
          parent_task?: string | null
          parse_status?: string | null
          priority?: number | null
          scrape_cycle_run_id?: string | null
          scrape_domain_id?: string | null
          scrape_job_id?: string | null
          scrape_mode?: string
          scrape_status?: string | null
          spawned_concurrent_tasks?: boolean | null
          target_url: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attempts_left?: number
          cancel_message?: string | null
          created_at?: string
          discovered_links?: Json | null
          failure_reason?: string | null
          id?: string
          interaction_config?: Json | null
          is_public?: boolean | null
          page_name?: string
          parent_task?: string | null
          parse_status?: string | null
          priority?: number | null
          scrape_cycle_run_id?: string | null
          scrape_domain_id?: string | null
          scrape_job_id?: string | null
          scrape_mode?: string
          scrape_status?: string | null
          spawned_concurrent_tasks?: boolean | null
          target_url?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scrape_task_scrape_cycle_run_id_fkey"
            columns: ["scrape_cycle_run_id"]
            isOneToOne: false
            referencedRelation: "scrape_cycle_run"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrape_task_scrape_domain_id_fkey"
            columns: ["scrape_domain_id"]
            isOneToOne: false
            referencedRelation: "scrape_domain"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrape_task_scrape_job_id_fkey"
            columns: ["scrape_job_id"]
            isOneToOne: false
            referencedRelation: "scrape_job"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_task_response: {
        Row: {
          content_path: string
          content_size: number | null
          content_type: string | null
          created_at: string
          error_log: string | null
          failure_reason: string | null
          id: string
          is_public: boolean | null
          response_headers: Json
          response_url: string
          scrape_task_id: string
          status_code: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          content_path: string
          content_size?: number | null
          content_type?: string | null
          created_at?: string
          error_log?: string | null
          failure_reason?: string | null
          id?: string
          is_public?: boolean | null
          response_headers: Json
          response_url: string
          scrape_task_id: string
          status_code?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          content_path?: string
          content_size?: number | null
          content_type?: string | null
          created_at?: string
          error_log?: string | null
          failure_reason?: string | null
          id?: string
          is_public?: boolean | null
          response_headers?: Json
          response_url?: string
          scrape_task_id?: string
          status_code?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scrape_task_response_scrape_task_id_fkey"
            columns: ["scrape_task_id"]
            isOneToOne: false
            referencedRelation: "scrape_task"
            referencedColumns: ["id"]
          },
        ]
      }
      shareable_resource_registry: {
        Row: {
          created_at: string
          display_label: string
          id_column: string
          is_active: boolean
          is_public_column: string | null
          notes: string | null
          owner_column: string
          resource_type: string
          rls_uses_has_permission: boolean
          table_name: string
          updated_at: string
          url_path_template: string
        }
        Insert: {
          created_at?: string
          display_label: string
          id_column?: string
          is_active?: boolean
          is_public_column?: string | null
          notes?: string | null
          owner_column?: string
          resource_type: string
          rls_uses_has_permission?: boolean
          table_name: string
          updated_at?: string
          url_path_template: string
        }
        Update: {
          created_at?: string
          display_label?: string
          id_column?: string
          is_active?: boolean
          is_public_column?: string | null
          notes?: string | null
          owner_column?: string
          resource_type?: string
          rls_uses_has_permission?: boolean
          table_name?: string
          updated_at?: string
          url_path_template?: string
        }
        Relationships: []
      }
      shared_canvas_items: {
        Row: {
          allow_remixes: boolean | null
          average_score: number | null
          canvas_data: Json
          canvas_type: string
          categories: string[] | null
          comment_count: number | null
          completion_rate: number | null
          created_at: string | null
          created_by: string | null
          creator_display_name: string | null
          creator_username: string | null
          description: string | null
          featured: boolean | null
          fork_count: number | null
          forked_from: string | null
          has_scoring: boolean | null
          high_score: number | null
          high_score_user: string | null
          id: string
          last_played_at: string | null
          like_count: number | null
          original_id: string | null
          play_count: number | null
          published_at: string | null
          require_attribution: boolean | null
          search_vector: unknown
          share_count: number | null
          share_token: string
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          total_attempts: number | null
          trending_score: number | null
          updated_at: string | null
          version_number: number | null
          view_count: number | null
          visibility: string | null
        }
        Insert: {
          allow_remixes?: boolean | null
          average_score?: number | null
          canvas_data: Json
          canvas_type: string
          categories?: string[] | null
          comment_count?: number | null
          completion_rate?: number | null
          created_at?: string | null
          created_by?: string | null
          creator_display_name?: string | null
          creator_username?: string | null
          description?: string | null
          featured?: boolean | null
          fork_count?: number | null
          forked_from?: string | null
          has_scoring?: boolean | null
          high_score?: number | null
          high_score_user?: string | null
          id?: string
          last_played_at?: string | null
          like_count?: number | null
          original_id?: string | null
          play_count?: number | null
          published_at?: string | null
          require_attribution?: boolean | null
          search_vector?: unknown
          share_count?: number | null
          share_token: string
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          total_attempts?: number | null
          trending_score?: number | null
          updated_at?: string | null
          version_number?: number | null
          view_count?: number | null
          visibility?: string | null
        }
        Update: {
          allow_remixes?: boolean | null
          average_score?: number | null
          canvas_data?: Json
          canvas_type?: string
          categories?: string[] | null
          comment_count?: number | null
          completion_rate?: number | null
          created_at?: string | null
          created_by?: string | null
          creator_display_name?: string | null
          creator_username?: string | null
          description?: string | null
          featured?: boolean | null
          fork_count?: number | null
          forked_from?: string | null
          has_scoring?: boolean | null
          high_score?: number | null
          high_score_user?: string | null
          id?: string
          last_played_at?: string | null
          like_count?: number | null
          original_id?: string | null
          play_count?: number | null
          published_at?: string | null
          require_attribution?: boolean | null
          search_vector?: unknown
          share_count?: number | null
          share_token?: string
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          total_attempts?: number | null
          trending_score?: number | null
          updated_at?: string | null
          version_number?: number | null
          view_count?: number | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shared_canvas_items_forked_from_fkey"
            columns: ["forked_from"]
            isOneToOne: false
            referencedRelation: "shared_canvas_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_canvas_items_original_id_fkey"
            columns: ["original_id"]
            isOneToOne: false
            referencedRelation: "shared_canvas_items"
            referencedColumns: ["id"]
          },
        ]
      }
      shortcut_categories: {
        Row: {
          color: string | null
          description: string | null
          enabled_features: Json | null
          icon_name: string
          id: string
          is_active: boolean | null
          label: string
          metadata: Json | null
          organization_id: string | null
          parent_category_id: string | null
          placement_type: string
          project_id: string | null
          sort_order: number | null
          task_id: string | null
          user_id: string | null
        }
        Insert: {
          color?: string | null
          description?: string | null
          enabled_features?: Json | null
          icon_name?: string
          id?: string
          is_active?: boolean | null
          label: string
          metadata?: Json | null
          organization_id?: string | null
          parent_category_id?: string | null
          placement_type: string
          project_id?: string | null
          sort_order?: number | null
          task_id?: string | null
          user_id?: string | null
        }
        Update: {
          color?: string | null
          description?: string | null
          enabled_features?: Json | null
          icon_name?: string
          id?: string
          is_active?: boolean | null
          label?: string
          metadata?: Json | null
          organization_id?: string | null
          parent_category_id?: string | null
          placement_type?: string
          project_id?: string | null
          sort_order?: number | null
          task_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shortcut_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shortcut_categories_parent_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "shortcut_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shortcut_categories_parent_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "shortcuts_by_placement_view"
            referencedColumns: ["category_id"]
          },
        ]
      }
      site_metadata: {
        Row: {
          contact_email: string | null
          copyright_holder: string | null
          created_at: string | null
          default_author_name: string | null
          default_author_type: string | null
          default_language: string | null
          default_share_image_height: number | null
          default_share_image_url: string | null
          default_share_image_width: number | null
          facebook_page_url: string | null
          google_analytics_id: string | null
          google_tag_manager_id: string | null
          gsc_property_url: string | null
          id: string
          is_active: boolean | null
          logo_height: number | null
          logo_url: string | null
          logo_width: number | null
          organization_type: string | null
          site_key: string
          site_name: string
          site_url: string | null
          twitter_handle: string | null
          updated_at: string | null
        }
        Insert: {
          contact_email?: string | null
          copyright_holder?: string | null
          created_at?: string | null
          default_author_name?: string | null
          default_author_type?: string | null
          default_language?: string | null
          default_share_image_height?: number | null
          default_share_image_url?: string | null
          default_share_image_width?: number | null
          facebook_page_url?: string | null
          google_analytics_id?: string | null
          google_tag_manager_id?: string | null
          gsc_property_url?: string | null
          id?: string
          is_active?: boolean | null
          logo_height?: number | null
          logo_url?: string | null
          logo_width?: number | null
          organization_type?: string | null
          site_key: string
          site_name: string
          site_url?: string | null
          twitter_handle?: string | null
          updated_at?: string | null
        }
        Update: {
          contact_email?: string | null
          copyright_holder?: string | null
          created_at?: string | null
          default_author_name?: string | null
          default_author_type?: string | null
          default_language?: string | null
          default_share_image_height?: number | null
          default_share_image_url?: string | null
          default_share_image_width?: number | null
          facebook_page_url?: string | null
          google_analytics_id?: string | null
          google_tag_manager_id?: string | null
          gsc_property_url?: string | null
          id?: string
          is_active?: boolean | null
          logo_height?: number | null
          logo_url?: string | null
          logo_width?: number | null
          organization_type?: string | null
          site_key?: string
          site_name?: string
          site_url?: string | null
          twitter_handle?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      skl_categories: {
        Row: {
          category_key: string
          color: string | null
          created_at: string
          description: string | null
          icon_name: string | null
          id: string
          is_active: boolean
          label: string
          metadata: Json | null
          organization_id: string | null
          parent_category_id: string | null
          project_id: string | null
          sort_order: number
          task_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category_key: string
          color?: string | null
          created_at?: string
          description?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean
          label: string
          metadata?: Json | null
          organization_id?: string | null
          parent_category_id?: string | null
          project_id?: string | null
          sort_order?: number
          task_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category_key?: string
          color?: string | null
          created_at?: string
          description?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean
          label?: string
          metadata?: Json | null
          organization_id?: string | null
          parent_category_id?: string | null
          project_id?: string | null
          sort_order?: number
          task_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "skl_categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "skl_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      skl_definitions: {
        Row: {
          allowed_tools: Json | null
          body: string | null
          category_id: string | null
          config: Json | null
          created_at: string
          description: string
          disable_auto_invocation: boolean
          icon_name: string | null
          id: string
          is_active: boolean
          is_public: boolean
          is_system: boolean
          label: string
          model_preference: string | null
          organization_id: string | null
          parent_skill_id: string | null
          platform_targets: Json | null
          project_id: string | null
          skill_id: string
          skill_type: Database["public"]["Enums"]["skl_skill_type"]
          sort_order: number
          task_id: string | null
          trigger_patterns: Json | null
          updated_at: string
          user_id: string | null
          version: string | null
        }
        Insert: {
          allowed_tools?: Json | null
          body?: string | null
          category_id?: string | null
          config?: Json | null
          created_at?: string
          description: string
          disable_auto_invocation?: boolean
          icon_name?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          is_system?: boolean
          label: string
          model_preference?: string | null
          organization_id?: string | null
          parent_skill_id?: string | null
          platform_targets?: Json | null
          project_id?: string | null
          skill_id: string
          skill_type?: Database["public"]["Enums"]["skl_skill_type"]
          sort_order?: number
          task_id?: string | null
          trigger_patterns?: Json | null
          updated_at?: string
          user_id?: string | null
          version?: string | null
        }
        Update: {
          allowed_tools?: Json | null
          body?: string | null
          category_id?: string | null
          config?: Json | null
          created_at?: string
          description?: string
          disable_auto_invocation?: boolean
          icon_name?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          is_system?: boolean
          label?: string
          model_preference?: string | null
          organization_id?: string | null
          parent_skill_id?: string | null
          platform_targets?: Json | null
          project_id?: string | null
          skill_id?: string
          skill_type?: Database["public"]["Enums"]["skl_skill_type"]
          sort_order?: number
          task_id?: string | null
          trigger_patterns?: Json | null
          updated_at?: string
          user_id?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "skl_definitions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "skl_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skl_definitions_parent_skill_id_fkey"
            columns: ["parent_skill_id"]
            isOneToOne: false
            referencedRelation: "skl_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      skl_render_components: {
        Row: {
          component_key: string
          created_at: string
          id: string
          import_path: string | null
          is_active: boolean
          parser_config: Json | null
          parser_key: string | null
          platform: string
          props_schema: Json | null
          render_definition_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          component_key: string
          created_at?: string
          id?: string
          import_path?: string | null
          is_active?: boolean
          parser_config?: Json | null
          parser_key?: string | null
          platform?: string
          props_schema?: Json | null
          render_definition_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          component_key?: string
          created_at?: string
          id?: string
          import_path?: string | null
          is_active?: boolean
          parser_config?: Json | null
          parser_key?: string | null
          platform?: string
          props_schema?: Json | null
          render_definition_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "skl_render_components_render_definition_id_fkey"
            columns: ["render_definition_id"]
            isOneToOne: false
            referencedRelation: "skl_render_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      skl_render_definitions: {
        Row: {
          block_id: string
          category_id: string | null
          created_at: string
          description: string | null
          icon_name: string
          id: string
          is_active: boolean
          is_public: boolean
          label: string
          organization_id: string | null
          project_id: string | null
          skill_id: string | null
          sort_order: number
          task_id: string | null
          template: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          block_id: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          icon_name: string
          id?: string
          is_active?: boolean
          is_public?: boolean
          label: string
          organization_id?: string | null
          project_id?: string | null
          skill_id?: string | null
          sort_order?: number
          task_id?: string | null
          template: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          block_id?: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          icon_name?: string
          id?: string
          is_active?: boolean
          is_public?: boolean
          label?: string
          organization_id?: string | null
          project_id?: string | null
          skill_id?: string | null
          sort_order?: number
          task_id?: string | null
          template?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "skl_render_definitions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "shortcut_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skl_render_definitions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "shortcuts_by_placement_view"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "skl_render_definitions_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skl_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      skl_resources: {
        Row: {
          content: string | null
          created_at: string
          filename: string
          id: string
          is_active: boolean
          mime_type: string | null
          resource_type: string
          skill_id: string
          sort_order: number
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          filename: string
          id?: string
          is_active?: boolean
          mime_type?: string | null
          resource_type?: string
          skill_id: string
          sort_order?: number
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          filename?: string
          id?: string
          is_active?: boolean
          mime_type?: string | null
          resource_type?: string
          skill_id?: string
          sort_order?: number
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "skl_resources_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skl_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_consent: {
        Row: {
          consent_type: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          opt_in_keyword: string | null
          opt_in_method: string | null
          opt_out_keyword: string | null
          opt_out_method: string | null
          opted_in_at: string | null
          opted_out_at: string | null
          phone_number: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          consent_type: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          opt_in_keyword?: string | null
          opt_in_method?: string | null
          opt_out_keyword?: string | null
          opt_out_method?: string | null
          opted_in_at?: string | null
          opted_out_at?: string | null
          phone_number: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          consent_type?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          opt_in_keyword?: string | null
          opt_in_method?: string | null
          opt_out_keyword?: string | null
          opt_out_method?: string | null
          opted_in_at?: string | null
          opted_out_at?: string | null
          phone_number?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      sms_conversations: {
        Row: {
          ai_agent_id: string | null
          conversation_type: string
          created_at: string
          external_phone_number: string
          id: string
          last_message_at: string | null
          last_message_direction: string | null
          last_message_preview: string | null
          message_count: number
          metadata: Json | null
          our_phone_number: string
          status: string
          unread_count: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ai_agent_id?: string | null
          conversation_type?: string
          created_at?: string
          external_phone_number: string
          id?: string
          last_message_at?: string | null
          last_message_direction?: string | null
          last_message_preview?: string | null
          message_count?: number
          metadata?: Json | null
          our_phone_number: string
          status?: string
          unread_count?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ai_agent_id?: string | null
          conversation_type?: string
          created_at?: string
          external_phone_number?: string
          id?: string
          last_message_at?: string | null
          last_message_direction?: string | null
          last_message_preview?: string | null
          message_count?: number
          metadata?: Json | null
          our_phone_number?: string
          status?: string
          unread_count?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      sms_media: {
        Row: {
          content_type: string
          created_at: string
          file_name: string | null
          file_size: number | null
          id: string
          message_id: string
          metadata: Json | null
          original_url: string
          storage_path: string | null
          stored_url: string | null
          twilio_media_sid: string | null
        }
        Insert: {
          content_type: string
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          id?: string
          message_id: string
          metadata?: Json | null
          original_url: string
          storage_path?: string | null
          stored_url?: string | null
          twilio_media_sid?: string | null
        }
        Update: {
          content_type?: string
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          id?: string
          message_id?: string
          metadata?: Json | null
          original_url?: string
          storage_path?: string | null
          stored_url?: string | null
          twilio_media_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_media_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "sms_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_messages: {
        Row: {
          ai_processed: boolean
          ai_processing_status: string | null
          ai_response_id: string | null
          body: string | null
          conversation_id: string | null
          created_at: string
          direction: string
          error_code: string | null
          error_message: string | null
          from_number: string
          id: string
          media_content_types: string[] | null
          media_urls: string[] | null
          metadata: Json | null
          num_media: number
          num_segments: number | null
          price: number | null
          price_unit: string | null
          sent_by_type: string
          sent_by_user_id: string | null
          status: string
          to_number: string
          twilio_sid: string | null
          updated_at: string
        }
        Insert: {
          ai_processed?: boolean
          ai_processing_status?: string | null
          ai_response_id?: string | null
          body?: string | null
          conversation_id?: string | null
          created_at?: string
          direction: string
          error_code?: string | null
          error_message?: string | null
          from_number: string
          id?: string
          media_content_types?: string[] | null
          media_urls?: string[] | null
          metadata?: Json | null
          num_media?: number
          num_segments?: number | null
          price?: number | null
          price_unit?: string | null
          sent_by_type?: string
          sent_by_user_id?: string | null
          status?: string
          to_number: string
          twilio_sid?: string | null
          updated_at?: string
        }
        Update: {
          ai_processed?: boolean
          ai_processing_status?: string | null
          ai_response_id?: string | null
          body?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: string
          error_code?: string | null
          error_message?: string | null
          from_number?: string
          id?: string
          media_content_types?: string[] | null
          media_urls?: string[] | null
          metadata?: Json | null
          num_media?: number
          num_segments?: number | null
          price?: number | null
          price_unit?: string | null
          sent_by_type?: string
          sent_by_user_id?: string | null
          status?: string
          to_number?: string
          twilio_sid?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "sms_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_notification_preferences: {
        Row: {
          ai_agent_messages: boolean
          created_at: string
          dm_notifications: boolean
          id: string
          job_completion_notifications: boolean
          marketing_messages: boolean
          max_messages_per_day: number
          max_messages_per_hour: number
          metadata: Json | null
          phone_number: string | null
          quiet_hours_enabled: boolean
          quiet_hours_end: string
          quiet_hours_start: string
          sms_enabled: boolean
          system_alerts: boolean
          task_notifications: boolean
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_agent_messages?: boolean
          created_at?: string
          dm_notifications?: boolean
          id?: string
          job_completion_notifications?: boolean
          marketing_messages?: boolean
          max_messages_per_day?: number
          max_messages_per_hour?: number
          metadata?: Json | null
          phone_number?: string | null
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          sms_enabled?: boolean
          system_alerts?: boolean
          task_notifications?: boolean
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_agent_messages?: boolean
          created_at?: string
          dm_notifications?: boolean
          id?: string
          job_completion_notifications?: boolean
          marketing_messages?: boolean
          max_messages_per_day?: number
          max_messages_per_hour?: number
          metadata?: Json | null
          phone_number?: string | null
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          sms_enabled?: boolean
          system_alerts?: boolean
          task_notifications?: boolean
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sms_notifications: {
        Row: {
          category: string
          created_at: string
          failure_reason: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          notification_type: string
          reference_id: string | null
          reference_type: string | null
          scheduled_for: string | null
          sent_at: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          notification_type: string
          reference_id?: string | null
          reference_type?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          notification_type?: string
          reference_id?: string | null
          reference_type?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_notifications_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "sms_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_phone_numbers: {
        Row: {
          assigned_at: string | null
          capabilities: Json | null
          created_at: string
          friendly_name: string | null
          id: string
          is_active: boolean
          metadata: Json | null
          number_type: string
          phone_number: string
          released_at: string | null
          twilio_sid: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          capabilities?: Json | null
          created_at?: string
          friendly_name?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json | null
          number_type?: string
          phone_number: string
          released_at?: string | null
          twilio_sid: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          capabilities?: Json | null
          created_at?: string
          friendly_name?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json | null
          number_type?: string
          phone_number?: string
          released_at?: string | null
          twilio_sid?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      sms_rate_limits: {
        Row: {
          id: string
          message_count: number
          phone_number: string
          window_start: string
          window_type: string
        }
        Insert: {
          id?: string
          message_count?: number
          phone_number: string
          window_start: string
          window_type: string
        }
        Update: {
          id?: string
          message_count?: number
          phone_number?: string
          window_start?: string
          window_type?: string
        }
        Relationships: []
      }
      sms_webhook_logs: {
        Row: {
          created_at: string
          id: string
          processed: boolean
          processing_error: string | null
          raw_payload: Json
          twilio_sid: string | null
          webhook_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          processed?: boolean
          processing_error?: string | null
          raw_payload: Json
          twilio_sid?: string | null
          webhook_type: string
        }
        Update: {
          created_at?: string
          id?: string
          processed?: boolean
          processing_error?: string | null
          raw_payload?: Json
          twilio_sid?: string | null
          webhook_type?: string
        }
        Relationships: []
      }
      studio_cleaned_segments: {
        Row: {
          created_at: string
          id: string
          pass_index: number
          run_id: string | null
          session_id: string
          superseded_at: string | null
          t_end: number
          t_start: number
          text: string
          trigger_cause: string
        }
        Insert: {
          created_at?: string
          id?: string
          pass_index: number
          run_id?: string | null
          session_id: string
          superseded_at?: string | null
          t_end: number
          t_start: number
          text: string
          trigger_cause: string
        }
        Update: {
          created_at?: string
          id?: string
          pass_index?: number
          run_id?: string | null
          session_id?: string
          superseded_at?: string | null
          t_end?: number
          t_start?: number
          text?: string
          trigger_cause?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_cleaned_segments_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "studio_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_cleaned_segments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "studio_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_concept_items: {
        Row: {
          confidence: number | null
          created_at: string
          description: string | null
          id: string
          kind: string
          label: string
          pass_index: number
          run_id: string | null
          session_id: string
          t_end: number | null
          t_start: number | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          label: string
          pass_index: number
          run_id?: string | null
          session_id: string
          t_end?: number | null
          t_start?: number | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          label?: string
          pass_index?: number
          run_id?: string | null
          session_id?: string
          t_end?: number | null
          t_start?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "studio_concept_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "studio_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_concept_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "studio_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_module_segments: {
        Row: {
          block_type: string
          created_at: string
          id: string
          module_id: string
          pass_index: number
          payload: Json
          run_id: string | null
          session_id: string
          t_end: number | null
          t_start: number | null
        }
        Insert: {
          block_type: string
          created_at?: string
          id?: string
          module_id: string
          pass_index: number
          payload?: Json
          run_id?: string | null
          session_id: string
          t_end?: number | null
          t_start?: number | null
        }
        Update: {
          block_type?: string
          created_at?: string
          id?: string
          module_id?: string
          pass_index?: number
          payload?: Json
          run_id?: string | null
          session_id?: string
          t_end?: number | null
          t_start?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "studio_module_segments_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "studio_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_module_segments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "studio_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_raw_segments: {
        Row: {
          chunk_index: number
          created_at: string
          id: string
          recording_segment_id: string | null
          session_id: string
          source: string
          speaker: string | null
          t_end: number
          t_start: number
          text: string
        }
        Insert: {
          chunk_index: number
          created_at?: string
          id?: string
          recording_segment_id?: string | null
          session_id: string
          source?: string
          speaker?: string | null
          t_end: number
          t_start: number
          text: string
        }
        Update: {
          chunk_index?: number
          created_at?: string
          id?: string
          recording_segment_id?: string | null
          session_id?: string
          source?: string
          speaker?: string | null
          t_end?: number
          t_start?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_raw_segments_recording_segment_id_fkey"
            columns: ["recording_segment_id"]
            isOneToOne: false
            referencedRelation: "studio_recording_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_raw_segments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "studio_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_recording_segments: {
        Row: {
          audio_path: string | null
          created_at: string
          ended_at: string | null
          id: string
          segment_index: number
          session_id: string
          started_at: string
          t_end: number | null
          t_start: number
          updated_at: string
        }
        Insert: {
          audio_path?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          segment_index: number
          session_id: string
          started_at: string
          t_end?: number | null
          t_start: number
          updated_at?: string
        }
        Update: {
          audio_path?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          segment_index?: number
          session_id?: string
          started_at?: string
          t_end?: number | null
          t_start?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_recording_segments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "studio_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_runs: {
        Row: {
          column_idx: number
          conversation_id: string | null
          created_at: string
          ended_at: string | null
          error: string | null
          id: string
          input_char_range: unknown
          resume_marker: string | null
          session_id: string
          shortcut_id: string | null
          started_at: string | null
          status: string
          trigger_cause: string
        }
        Insert: {
          column_idx: number
          conversation_id?: string | null
          created_at?: string
          ended_at?: string | null
          error?: string | null
          id?: string
          input_char_range?: unknown
          resume_marker?: string | null
          session_id: string
          shortcut_id?: string | null
          started_at?: string | null
          status?: string
          trigger_cause: string
        }
        Update: {
          column_idx?: number
          conversation_id?: string | null
          created_at?: string
          ended_at?: string | null
          error?: string | null
          id?: string
          input_char_range?: unknown
          resume_marker?: string | null
          session_id?: string
          shortcut_id?: string | null
          started_at?: string | null
          status?: string
          trigger_cause?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_runs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "studio_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_session_settings: {
        Row: {
          cleaning_interval_ms: number
          cleaning_shortcut_id: string | null
          column_widths: Json | null
          concept_interval_ms: number
          concept_shortcut_id: string | null
          created_at: string
          module_id: string
          module_interval_ms: number | null
          module_shortcut_id: string | null
          session_id: string
          show_prior_modules: boolean
          updated_at: string
        }
        Insert: {
          cleaning_interval_ms?: number
          cleaning_shortcut_id?: string | null
          column_widths?: Json | null
          concept_interval_ms?: number
          concept_shortcut_id?: string | null
          created_at?: string
          module_id?: string
          module_interval_ms?: number | null
          module_shortcut_id?: string | null
          session_id: string
          show_prior_modules?: boolean
          updated_at?: string
        }
        Update: {
          cleaning_interval_ms?: number
          cleaning_shortcut_id?: string | null
          column_widths?: Json | null
          concept_interval_ms?: number
          concept_shortcut_id?: string | null
          created_at?: string
          module_id?: string
          module_interval_ms?: number | null
          module_shortcut_id?: string | null
          session_id?: string
          show_prior_modules?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_session_settings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "studio_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_sessions: {
        Row: {
          audio_storage_path: string | null
          created_at: string
          ended_at: string | null
          id: string
          is_deleted: boolean
          is_public: boolean
          module_id: string
          organization_id: string | null
          project_id: string | null
          started_at: string
          status: string
          title: string
          total_duration_ms: number
          transcript_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_storage_path?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          is_deleted?: boolean
          is_public?: boolean
          module_id?: string
          organization_id?: string | null
          project_id?: string | null
          started_at?: string
          status?: string
          title?: string
          total_duration_ms?: number
          transcript_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          audio_storage_path?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          is_deleted?: boolean
          is_public?: boolean
          module_id?: string
          organization_id?: string | null
          project_id?: string | null
          started_at?: string
          status?: string
          title?: string
          total_duration_ms?: number
          transcript_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_sessions_transcript_id_fkey"
            columns: ["transcript_id"]
            isOneToOne: false
            referencedRelation: "transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      study_source_chunk: {
        Row: {
          chunk_index: number
          content: string
          content_hash: string
          created_at: string
          embedding_model: string | null
          embedding_pending: boolean
          id: string
          kind: string
          owner_id: string
          source_media_ref_id: string | null
          source_metadata: Json
          source_offset_end: number | null
          source_offset_start: number | null
          structured_section_id: string | null
          updated_at: string
        }
        Insert: {
          chunk_index?: number
          content: string
          content_hash: string
          created_at?: string
          embedding_model?: string | null
          embedding_pending?: boolean
          id?: string
          kind: string
          owner_id: string
          source_media_ref_id?: string | null
          source_metadata?: Json
          source_offset_end?: number | null
          source_offset_start?: number | null
          structured_section_id?: string | null
          updated_at?: string
        }
        Update: {
          chunk_index?: number
          content?: string
          content_hash?: string
          created_at?: string
          embedding_model?: string | null
          embedding_pending?: boolean
          id?: string
          kind?: string
          owner_id?: string
          source_media_ref_id?: string | null
          source_metadata?: Json
          source_offset_end?: number | null
          source_offset_start?: number | null
          structured_section_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_source_chunk_structured_section_id_fkey"
            columns: ["structured_section_id"]
            isOneToOne: false
            referencedRelation: "study_structured_section"
            referencedColumns: ["id"]
          },
        ]
      }
      study_structured_section: {
        Row: {
          body: string
          claims: Json
          created_at: string
          id: string
          metadata: Json
          organization_id: string | null
          owner_id: string
          project_id: string | null
          summary: string | null
          title: string
          topic: string
          updated_at: string
        }
        Insert: {
          body: string
          claims?: Json
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string | null
          owner_id: string
          project_id?: string | null
          summary?: string | null
          title: string
          topic: string
          updated_at?: string
        }
        Update: {
          body?: string
          claims?: Json
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string | null
          owner_id?: string
          project_id?: string | null
          summary?: string | null
          title?: string
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      subcategory: {
        Row: {
          category_id: string
          created_at: string
          description: string | null
          features: string[]
          icon: string | null
          id: string
          name: string
          slug: string | null
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          features: string[]
          icon?: string | null
          id?: string
          name: string
          slug?: string | null
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          features?: string[]
          icon?: string | null
          id?: string
          name?: string
          slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subcategory_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "category"
            referencedColumns: ["id"]
          },
        ]
      }
      system_announcements: {
        Row: {
          announcement_type: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          message: string
          min_display_seconds: number | null
          title: string
          updated_at: string
        }
        Insert: {
          announcement_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          message: string
          min_display_seconds?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          announcement_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          message?: string
          min_display_seconds?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_error: {
        Row: {
          agent_id: string | null
          context: Json | null
          conversation_id: string | null
          error_text: string
          error_type: string | null
          id: string
          kind: string
          occurred_at: string
          payload: Json | null
          request_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          route: string | null
          source_app: string | null
          traceback: string | null
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          context?: Json | null
          conversation_id?: string | null
          error_text: string
          error_type?: string | null
          id?: string
          kind: string
          occurred_at?: string
          payload?: Json | null
          request_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          route?: string | null
          source_app?: string | null
          traceback?: string | null
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          context?: Json | null
          conversation_id?: string | null
          error_text?: string
          error_type?: string | null
          id?: string
          kind?: string
          occurred_at?: string
          payload?: Json | null
          request_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          route?: string | null
          source_app?: string | null
          traceback?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      system_function: {
        Row: {
          description: string | null
          id: string
          input_params: Json | null
          name: string
          output_options: Json | null
          rf_id: string
          sample: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          input_params?: Json | null
          name: string
          output_options?: Json | null
          rf_id: string
          sample?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          input_params?: Json | null
          name?: string
          output_options?: Json | null
          rf_id?: string
          sample?: string | null
        }
        Relationships: []
      }
      system_prompt_executions: {
        Row: {
          created_at: string | null
          error_message: string | null
          execution_time_ms: number | null
          id: string
          metadata: Json | null
          success: boolean | null
          system_prompt_id: string
          trigger_type: string
          user_id: string | null
          variables_used: Json | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          metadata?: Json | null
          success?: boolean | null
          system_prompt_id: string
          trigger_type: string
          user_id?: string | null
          variables_used?: Json | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          metadata?: Json | null
          success?: boolean | null
          system_prompt_id?: string
          trigger_type?: string
          user_id?: string | null
          variables_used?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "system_prompt_executions_system_prompt_id_fkey"
            columns: ["system_prompt_id"]
            isOneToOne: false
            referencedRelation: "system_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      system_prompts: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          display_config: Json | null
          functionality_id: string | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          last_updated_at: string | null
          last_updated_by: string | null
          metadata: Json | null
          name: string
          placement_settings: Json | null
          placement_type: string
          prompt_snapshot: Json
          published_at: string | null
          published_by: string | null
          sort_order: number | null
          source_prompt_id: string | null
          status: string | null
          subcategory: string | null
          system_prompt_id: string
          tags: string[] | null
          update_notes: string | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          display_config?: Json | null
          functionality_id?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          last_updated_at?: string | null
          last_updated_by?: string | null
          metadata?: Json | null
          name: string
          placement_settings?: Json | null
          placement_type?: string
          prompt_snapshot: Json
          published_at?: string | null
          published_by?: string | null
          sort_order?: number | null
          source_prompt_id?: string | null
          status?: string | null
          subcategory?: string | null
          system_prompt_id: string
          tags?: string[] | null
          update_notes?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          display_config?: Json | null
          functionality_id?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          last_updated_at?: string | null
          last_updated_by?: string | null
          metadata?: Json | null
          name?: string
          placement_settings?: Json | null
          placement_type?: string
          prompt_snapshot?: Json
          published_at?: string | null
          published_by?: string | null
          sort_order?: number | null
          source_prompt_id?: string | null
          status?: string | null
          subcategory?: string | null
          system_prompt_id?: string
          tags?: string[] | null
          update_notes?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "system_prompts_source_prompt_id_fkey"
            columns: ["source_prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      system_prompts_new: {
        Row: {
          category_id: string
          created_at: string | null
          description: string | null
          icon_name: string
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          label: string
          last_updated_at: string | null
          last_updated_by: string | null
          metadata: Json | null
          prompt_id: string
          prompt_snapshot: Json
          published_at: string | null
          published_by: string | null
          sort_order: number | null
          source_prompt_id: string | null
          status: string | null
          tags: string[] | null
          update_notes: string | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          category_id: string
          created_at?: string | null
          description?: string | null
          icon_name: string
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          label: string
          last_updated_at?: string | null
          last_updated_by?: string | null
          metadata?: Json | null
          prompt_id: string
          prompt_snapshot: Json
          published_at?: string | null
          published_by?: string | null
          sort_order?: number | null
          source_prompt_id?: string | null
          status?: string | null
          tags?: string[] | null
          update_notes?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          category_id?: string
          created_at?: string | null
          description?: string | null
          icon_name?: string
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          label?: string
          last_updated_at?: string | null
          last_updated_by?: string | null
          metadata?: Json | null
          prompt_id?: string
          prompt_snapshot?: Json
          published_at?: string | null
          published_by?: string | null
          sort_order?: number | null
          source_prompt_id?: string | null
          status?: string | null
          tags?: string[] | null
          update_notes?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "system_prompts_new_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "shortcut_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_prompts_new_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "shortcuts_by_placement_view"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "system_prompts_new_source_prompt_fkey"
            columns: ["source_prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      system_write_failure: {
        Row: {
          conversation_id: string | null
          depends_on: Json | null
          error_text: string
          failed_at: string
          id: string
          op_id: string
          op_type: string
          payload: Json
          primary_key: Json
          recovered_at: string | null
          recovery_op_id: string | null
          request_id: string | null
          retry_count: number
          table_target: string
          traceback: string | null
          user_id: string | null
        }
        Insert: {
          conversation_id?: string | null
          depends_on?: Json | null
          error_text: string
          failed_at?: string
          id?: string
          op_id: string
          op_type: string
          payload: Json
          primary_key: Json
          recovered_at?: string | null
          recovery_op_id?: string | null
          request_id?: string | null
          retry_count?: number
          table_target: string
          traceback?: string | null
          user_id?: string | null
        }
        Update: {
          conversation_id?: string | null
          depends_on?: Json | null
          error_text?: string
          failed_at?: string
          id?: string
          op_id?: string
          op_type?: string
          payload?: Json
          primary_key?: Json
          recovered_at?: string | null
          recovery_op_id?: string | null
          request_id?: string | null
          retry_count?: number
          table_target?: string
          traceback?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      tl_bundle: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          is_active: boolean
          is_system: boolean
          lister_tool_id: string | null
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          lister_tool_id?: string | null
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          lister_tool_id?: string | null
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tl_bundle_lister_tool_id_fkey"
            columns: ["lister_tool_id"]
            isOneToOne: false
            referencedRelation: "tl_def"
            referencedColumns: ["id"]
          },
        ]
      }
      tl_bundle_member: {
        Row: {
          bundle_id: string
          created_at: string
          local_alias: string
          sort_order: number
          tool_id: string
        }
        Insert: {
          bundle_id: string
          created_at?: string
          local_alias: string
          sort_order?: number
          tool_id: string
        }
        Update: {
          bundle_id?: string
          created_at?: string
          local_alias?: string
          sort_order?: number
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tl_bundle_member_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "tl_bundle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tl_bundle_member_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tl_def"
            referencedColumns: ["id"]
          },
        ]
      }
      tl_def: {
        Row: {
          admin_only: boolean
          annotations: Json | null
          category: string | null
          created_at: string | null
          deactivated_at: string | null
          dedupe_exempt: boolean
          description: string
          function_path: string
          gating: Json
          icon: string | null
          id: string
          is_active: boolean | null
          max_client_wait_seconds: number | null
          name: string
          output_schema: Json | null
          parameters: Json
          privileged: boolean
          semver: string | null
          source_app: string
          tags: string[] | null
          tier: string | null
          tool_group: string
          updated_at: string | null
          version: number
        }
        Insert: {
          admin_only?: boolean
          annotations?: Json | null
          category?: string | null
          created_at?: string | null
          deactivated_at?: string | null
          dedupe_exempt?: boolean
          description: string
          function_path?: string
          gating?: Json
          icon?: string | null
          id?: string
          is_active?: boolean | null
          max_client_wait_seconds?: number | null
          name: string
          output_schema?: Json | null
          parameters: Json
          privileged?: boolean
          semver?: string | null
          source_app?: string
          tags?: string[] | null
          tier?: string | null
          tool_group?: string
          updated_at?: string | null
          version?: number
        }
        Update: {
          admin_only?: boolean
          annotations?: Json | null
          category?: string | null
          created_at?: string | null
          deactivated_at?: string | null
          dedupe_exempt?: boolean
          description?: string
          function_path?: string
          gating?: Json
          icon?: string | null
          id?: string
          is_active?: boolean | null
          max_client_wait_seconds?: number | null
          name?: string
          output_schema?: Json | null
          parameters?: Json
          privileged?: boolean
          semver?: string | null
          source_app?: string
          tags?: string[] | null
          tier?: string | null
          tool_group?: string
          updated_at?: string | null
          version?: number
        }
        Relationships: []
      }
      tl_def_surface: {
        Row: {
          arg_mappings: Json
          created_at: string
          surface_name: string
          tool_id: string
        }
        Insert: {
          arg_mappings?: Json
          created_at?: string
          surface_name: string
          tool_id: string
        }
        Update: {
          arg_mappings?: Json
          created_at?: string
          surface_name?: string
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tl_def_surface_surface_name_fkey"
            columns: ["surface_name"]
            isOneToOne: false
            referencedRelation: "ui_surface"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "tl_def_surface_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tl_def"
            referencedColumns: ["id"]
          },
        ]
      }
      tl_def_version: {
        Row: {
          annotations: Json | null
          category: string | null
          change_note: string | null
          changed_at: string
          description: string | null
          function_path: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string | null
          output_schema: Json | null
          parameters: Json | null
          semver: string | null
          source_app: string | null
          tags: string[] | null
          tool_id: string
          version_number: number
        }
        Insert: {
          annotations?: Json | null
          category?: string | null
          change_note?: string | null
          changed_at?: string
          description?: string | null
          function_path?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          output_schema?: Json | null
          parameters?: Json | null
          semver?: string | null
          source_app?: string | null
          tags?: string[] | null
          tool_id: string
          version_number: number
        }
        Update: {
          annotations?: Json | null
          category?: string | null
          change_note?: string | null
          changed_at?: string
          description?: string | null
          function_path?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          output_schema?: Json | null
          parameters?: Json | null
          semver?: string | null
          source_app?: string | null
          tags?: string[] | null
          tool_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "tool_versions_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tl_def"
            referencedColumns: ["id"]
          },
        ]
      }
      tl_executor: {
        Row: {
          auto_load: boolean
          created_at: string
          delegated: boolean
          function_path: string | null
          id: string
          is_active: boolean
          priority: number
          source_app: string | null
          surface: string
          tool_id: string
          updated_at: string
        }
        Insert: {
          auto_load?: boolean
          created_at?: string
          delegated?: boolean
          function_path?: string | null
          id?: string
          is_active?: boolean
          priority?: number
          source_app?: string | null
          surface: string
          tool_id: string
          updated_at?: string
        }
        Update: {
          auto_load?: boolean
          created_at?: string
          delegated?: boolean
          function_path?: string | null
          id?: string
          is_active?: boolean
          priority?: number
          source_app?: string | null
          surface?: string
          tool_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_handlers_surface_fkey"
            columns: ["surface"]
            isOneToOne: false
            referencedRelation: "tl_executor_kind"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "tool_handlers_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tl_def"
            referencedColumns: ["id"]
          },
        ]
      }
      tl_executor_kind: {
        Row: {
          config: Json
          created_at: string
          description: string
          is_active: boolean
          is_client_side: boolean
          name: string
          payload_schema: Json
          payload_validator_path: string | null
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          description?: string
          is_active?: boolean
          is_client_side: boolean
          name: string
          payload_schema?: Json
          payload_validator_path?: string | null
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          description?: string
          is_active?: boolean
          is_client_side?: boolean
          name?: string
          payload_schema?: Json
          payload_validator_path?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tl_gate: {
        Row: {
          applies_to: string[]
          arg_schema: Json
          created_at: string
          description: string
          function_path: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          applies_to?: string[]
          arg_schema?: Json
          created_at?: string
          description?: string
          function_path: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          applies_to?: string[]
          arg_schema?: Json
          created_at?: string
          description?: string
          function_path?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      tl_mcp_config: {
        Row: {
          args: string[]
          command: string
          config_type: string
          created_at: string
          env_schema: Json
          id: string
          is_default: boolean
          label: string
          min_node_version: string | null
          notes: string | null
          npm_package: string | null
          pip_package: string | null
          requires_docker: boolean
          server_id: string
          updated_at: string
        }
        Insert: {
          args?: string[]
          command: string
          config_type?: string
          created_at?: string
          env_schema?: Json
          id?: string
          is_default?: boolean
          label: string
          min_node_version?: string | null
          notes?: string | null
          npm_package?: string | null
          pip_package?: string | null
          requires_docker?: boolean
          server_id: string
          updated_at?: string
        }
        Update: {
          args?: string[]
          command?: string
          config_type?: string
          created_at?: string
          env_schema?: Json
          id?: string
          is_default?: boolean
          label?: string
          min_node_version?: string | null
          notes?: string | null
          npm_package?: string | null
          pip_package?: string | null
          requires_docker?: boolean
          server_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_server_configs_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "tl_mcp_server"
            referencedColumns: ["id"]
          },
        ]
      }
      tl_mcp_server: {
        Row: {
          auth_strategy: Database["public"]["Enums"]["mcp_auth_strategy"]
          category: Database["public"]["Enums"]["mcp_server_category"]
          color: string | null
          created_at: string
          description: string | null
          discovery_ttl_seconds: number
          docs_url: string | null
          endpoint_url: string | null
          has_local: boolean
          has_remote: boolean
          icon_url: string | null
          id: string
          is_featured: boolean
          is_official: boolean
          last_sync_error: string | null
          last_synced_at: string | null
          last_test_error: string | null
          last_test_latency_ms: number | null
          last_test_ok: boolean | null
          last_test_status_code: number | null
          last_tested_at: string | null
          metadata: Json
          name: string
          oauth_client_id: string | null
          oauth_scopes: string[] | null
          slug: string
          sort_order: number
          status: Database["public"]["Enums"]["mcp_server_status"]
          supports_mcp_apps: boolean
          transport: Database["public"]["Enums"]["mcp_transport"]
          updated_at: string
          vendor: string
          website_url: string | null
        }
        Insert: {
          auth_strategy?: Database["public"]["Enums"]["mcp_auth_strategy"]
          category?: Database["public"]["Enums"]["mcp_server_category"]
          color?: string | null
          created_at?: string
          description?: string | null
          discovery_ttl_seconds?: number
          docs_url?: string | null
          endpoint_url?: string | null
          has_local?: boolean
          has_remote?: boolean
          icon_url?: string | null
          id?: string
          is_featured?: boolean
          is_official?: boolean
          last_sync_error?: string | null
          last_synced_at?: string | null
          last_test_error?: string | null
          last_test_latency_ms?: number | null
          last_test_ok?: boolean | null
          last_test_status_code?: number | null
          last_tested_at?: string | null
          metadata?: Json
          name: string
          oauth_client_id?: string | null
          oauth_scopes?: string[] | null
          slug: string
          sort_order?: number
          status?: Database["public"]["Enums"]["mcp_server_status"]
          supports_mcp_apps?: boolean
          transport?: Database["public"]["Enums"]["mcp_transport"]
          updated_at?: string
          vendor: string
          website_url?: string | null
        }
        Update: {
          auth_strategy?: Database["public"]["Enums"]["mcp_auth_strategy"]
          category?: Database["public"]["Enums"]["mcp_server_category"]
          color?: string | null
          created_at?: string
          description?: string | null
          discovery_ttl_seconds?: number
          docs_url?: string | null
          endpoint_url?: string | null
          has_local?: boolean
          has_remote?: boolean
          icon_url?: string | null
          id?: string
          is_featured?: boolean
          is_official?: boolean
          last_sync_error?: string | null
          last_synced_at?: string | null
          last_test_error?: string | null
          last_test_latency_ms?: number | null
          last_test_ok?: boolean | null
          last_test_status_code?: number | null
          last_tested_at?: string | null
          metadata?: Json
          name?: string
          oauth_client_id?: string | null
          oauth_scopes?: string[] | null
          slug?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["mcp_server_status"]
          supports_mcp_apps?: boolean
          transport?: Database["public"]["Enums"]["mcp_transport"]
          updated_at?: string
          vendor?: string
          website_url?: string | null
        }
        Relationships: []
      }
      tl_mcp_user_conn: {
        Row: {
          access_token_encrypted: string | null
          config_id: string | null
          connected_at: string | null
          created_at: string
          credentials_encrypted: string | null
          display_name: string
          endpoint_url_override: string | null
          error_count: number
          id: string
          is_default: boolean
          last_error: string | null
          last_used_at: string | null
          last_verified_at: string | null
          last_verified_error: string | null
          last_verified_status: string | null
          metadata: Json
          oauth_client_id: string | null
          oauth_scopes_granted: string[] | null
          oauth_token_endpoint: string | null
          provider: string
          refresh_token_encrypted: string | null
          server_id: string | null
          status: Database["public"]["Enums"]["mcp_connection_status"]
          token_expires_at: string | null
          transport_used: Database["public"]["Enums"]["mcp_transport"]
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          config_id?: string | null
          connected_at?: string | null
          created_at?: string
          credentials_encrypted?: string | null
          display_name: string
          endpoint_url_override?: string | null
          error_count?: number
          id?: string
          is_default?: boolean
          last_error?: string | null
          last_used_at?: string | null
          last_verified_at?: string | null
          last_verified_error?: string | null
          last_verified_status?: string | null
          metadata?: Json
          oauth_client_id?: string | null
          oauth_scopes_granted?: string[] | null
          oauth_token_endpoint?: string | null
          provider?: string
          refresh_token_encrypted?: string | null
          server_id?: string | null
          status?: Database["public"]["Enums"]["mcp_connection_status"]
          token_expires_at?: string | null
          transport_used?: Database["public"]["Enums"]["mcp_transport"]
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          config_id?: string | null
          connected_at?: string | null
          created_at?: string
          credentials_encrypted?: string | null
          display_name?: string
          endpoint_url_override?: string | null
          error_count?: number
          id?: string
          is_default?: boolean
          last_error?: string | null
          last_used_at?: string | null
          last_verified_at?: string | null
          last_verified_error?: string | null
          last_verified_status?: string | null
          metadata?: Json
          oauth_client_id?: string | null
          oauth_scopes_granted?: string[] | null
          oauth_token_endpoint?: string | null
          provider?: string
          refresh_token_encrypted?: string | null
          server_id?: string | null
          status?: Database["public"]["Enums"]["mcp_connection_status"]
          token_expires_at?: string | null
          transport_used?: Database["public"]["Enums"]["mcp_transport"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_user_connections_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "tl_mcp_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcp_user_connections_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "tl_mcp_server"
            referencedColumns: ["id"]
          },
        ]
      }
      tl_test_sample: {
        Row: {
          admin_comments: string | null
          arguments: Json
          created_at: string
          final_payload: Json | null
          id: string
          is_success: boolean | null
          raw_stream_events: Json
          tested_by: string | null
          tool_id: string | null
          tool_name: string
          updated_at: string
          use_for_component: boolean
        }
        Insert: {
          admin_comments?: string | null
          arguments?: Json
          created_at?: string
          final_payload?: Json | null
          id?: string
          is_success?: boolean | null
          raw_stream_events?: Json
          tested_by?: string | null
          tool_id?: string | null
          tool_name: string
          updated_at?: string
          use_for_component?: boolean
        }
        Update: {
          admin_comments?: string | null
          arguments?: Json
          created_at?: string
          final_payload?: Json | null
          id?: string
          is_success?: boolean | null
          raw_stream_events?: Json
          tested_by?: string | null
          tool_id?: string | null
          tool_name?: string
          updated_at?: string
          use_for_component?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tool_test_samples_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tl_def"
            referencedColumns: ["id"]
          },
        ]
      }
      tl_ui: {
        Row: {
          allowed_imports: string[]
          contract_version: number
          created_at: string
          created_by: string | null
          display_name: string
          header_extras_code: string | null
          header_subtitle_code: string | null
          id: string
          inline_code: string
          is_active: boolean
          keep_expanded_on_stream: boolean
          language: string
          notes: string | null
          overlay_code: string | null
          results_label: string | null
          semver: string
          surface_name: string
          tool_id: string | null
          tool_name: string
          updated_at: string
          utility_code: string | null
          version: number
        }
        Insert: {
          allowed_imports?: string[]
          contract_version?: number
          created_at?: string
          created_by?: string | null
          display_name: string
          header_extras_code?: string | null
          header_subtitle_code?: string | null
          id?: string
          inline_code: string
          is_active?: boolean
          keep_expanded_on_stream?: boolean
          language?: string
          notes?: string | null
          overlay_code?: string | null
          results_label?: string | null
          semver?: string
          surface_name: string
          tool_id?: string | null
          tool_name: string
          updated_at?: string
          utility_code?: string | null
          version?: number
        }
        Update: {
          allowed_imports?: string[]
          contract_version?: number
          created_at?: string
          created_by?: string | null
          display_name?: string
          header_extras_code?: string | null
          header_subtitle_code?: string | null
          id?: string
          inline_code?: string
          is_active?: boolean
          keep_expanded_on_stream?: boolean
          language?: string
          notes?: string | null
          overlay_code?: string | null
          results_label?: string | null
          semver?: string
          surface_name?: string
          tool_id?: string | null
          tool_name?: string
          updated_at?: string
          utility_code?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tool_ui_components_surface_name_fkey"
            columns: ["surface_name"]
            isOneToOne: false
            referencedRelation: "ui_surface"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "tool_ui_components_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tl_def"
            referencedColumns: ["id"]
          },
        ]
      }
      tl_ui_incident: {
        Row: {
          browser_info: string | null
          component_id: string | null
          component_type: string
          component_version: string | null
          created_at: string
          error_message: string
          error_stack: string | null
          error_type: string
          id: string
          resolution_notes: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          session_id: string | null
          tool_name: string
          tool_update_snapshot: Json | null
        }
        Insert: {
          browser_info?: string | null
          component_id?: string | null
          component_type: string
          component_version?: string | null
          created_at?: string
          error_message: string
          error_stack?: string | null
          error_type: string
          id?: string
          resolution_notes?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string | null
          tool_name: string
          tool_update_snapshot?: Json | null
        }
        Update: {
          browser_info?: string | null
          component_id?: string | null
          component_type?: string
          component_version?: string | null
          created_at?: string
          error_message?: string
          error_stack?: string | null
          error_type?: string
          id?: string
          resolution_notes?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string | null
          tool_name?: string
          tool_update_snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "tool_ui_incidents_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "tl_ui"
            referencedColumns: ["id"]
          },
        ]
      }
      tl_ui_version: {
        Row: {
          allowed_imports: string[] | null
          change_note: string | null
          changed_at: string
          component_id: string
          display_name: string | null
          header_extras_code: string | null
          header_subtitle_code: string | null
          id: string
          inline_code: string | null
          is_active: boolean | null
          keep_expanded_on_stream: boolean | null
          language: string | null
          notes: string | null
          overlay_code: string | null
          results_label: string | null
          semver: string | null
          tool_id: string | null
          tool_name: string | null
          utility_code: string | null
          version_number: number
        }
        Insert: {
          allowed_imports?: string[] | null
          change_note?: string | null
          changed_at?: string
          component_id: string
          display_name?: string | null
          header_extras_code?: string | null
          header_subtitle_code?: string | null
          id?: string
          inline_code?: string | null
          is_active?: boolean | null
          keep_expanded_on_stream?: boolean | null
          language?: string | null
          notes?: string | null
          overlay_code?: string | null
          results_label?: string | null
          semver?: string | null
          tool_id?: string | null
          tool_name?: string | null
          utility_code?: string | null
          version_number: number
        }
        Update: {
          allowed_imports?: string[] | null
          change_note?: string | null
          changed_at?: string
          component_id?: string
          display_name?: string | null
          header_extras_code?: string | null
          header_subtitle_code?: string | null
          id?: string
          inline_code?: string | null
          is_active?: boolean | null
          keep_expanded_on_stream?: boolean | null
          language?: string | null
          notes?: string | null
          overlay_code?: string | null
          results_label?: string | null
          semver?: string | null
          tool_id?: string | null
          tool_name?: string | null
          utility_code?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "tool_ui_component_versions_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "tl_ui"
            referencedColumns: ["id"]
          },
        ]
      }
      transcripts: {
        Row: {
          audio_file_path: string | null
          created_at: string | null
          description: string | null
          draft_saved_at: string | null
          folder_name: string | null
          id: string
          is_deleted: boolean | null
          is_draft: boolean | null
          is_public: boolean
          metadata: Json | null
          organization_id: string | null
          project_id: string | null
          segments: Json
          source_type: string | null
          tags: string[] | null
          task_id: string | null
          title: string
          updated_at: string | null
          user_id: string
          video_file_path: string | null
        }
        Insert: {
          audio_file_path?: string | null
          created_at?: string | null
          description?: string | null
          draft_saved_at?: string | null
          folder_name?: string | null
          id?: string
          is_deleted?: boolean | null
          is_draft?: boolean | null
          is_public?: boolean
          metadata?: Json | null
          organization_id?: string | null
          project_id?: string | null
          segments?: Json
          source_type?: string | null
          tags?: string[] | null
          task_id?: string | null
          title?: string
          updated_at?: string | null
          user_id: string
          video_file_path?: string | null
        }
        Update: {
          audio_file_path?: string | null
          created_at?: string | null
          description?: string | null
          draft_saved_at?: string | null
          folder_name?: string | null
          id?: string
          is_deleted?: boolean | null
          is_draft?: boolean | null
          is_public?: boolean
          metadata?: Json | null
          organization_id?: string | null
          project_id?: string | null
          segments?: Json
          source_type?: string | null
          tags?: string[] | null
          task_id?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
          video_file_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcripts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcripts_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ctx_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      transformer: {
        Row: {
          id: string
          input_params: Json | null
          name: string | null
          output_params: Json | null
        }
        Insert: {
          id?: string
          input_params?: Json | null
          name?: string | null
          output_params?: Json | null
        }
        Update: {
          id?: string
          input_params?: Json | null
          name?: string | null
          output_params?: Json | null
        }
        Relationships: []
      }
      udt_dataset_fields: {
        Row: {
          created_at: string
          data_type: Database["public"]["Enums"]["field_data_type"]
          default_value: Json | null
          display_name: string
          field_name: string
          field_order: number
          id: string
          is_public: boolean
          is_required: boolean
          table_id: string
          updated_at: string
          user_id: string
          validation_rules: Json | null
        }
        Insert: {
          created_at?: string
          data_type?: Database["public"]["Enums"]["field_data_type"]
          default_value?: Json | null
          display_name: string
          field_name: string
          field_order?: number
          id?: string
          is_public?: boolean
          is_required?: boolean
          table_id: string
          updated_at?: string
          user_id: string
          validation_rules?: Json | null
        }
        Update: {
          created_at?: string
          data_type?: Database["public"]["Enums"]["field_data_type"]
          default_value?: Json | null
          display_name?: string
          field_name?: string
          field_order?: number
          id?: string
          is_public?: boolean
          is_required?: boolean
          table_id?: string
          updated_at?: string
          user_id?: string
          validation_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "udt_dataset_fields_dataset_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "udt_datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      udt_dataset_rows: {
        Row: {
          created_at: string
          data: Json
          id: string
          is_public: boolean
          table_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
          is_public?: boolean
          table_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          is_public?: boolean
          table_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "udt_dataset_rows_dataset_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "udt_datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      udt_datasets: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          organization_id: string | null
          project_id: string | null
          row_ordering_config: Json | null
          table_name: string
          task_id: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          organization_id?: string | null
          project_id?: string | null
          row_ordering_config?: Json | null
          table_name: string
          task_id?: string | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          organization_id?: string | null
          project_id?: string | null
          row_ordering_config?: Json | null
          table_name?: string
          task_id?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "udt_datasets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "udt_datasets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "udt_datasets_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ctx_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      udt_picklist_items: {
        Row: {
          created_at: string
          description: string | null
          group_name: string | null
          help_text: string | null
          icon_name: string | null
          id: string
          is_public: boolean | null
          label: string | null
          list_id: string | null
          public_read: boolean | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          group_name?: string | null
          help_text?: string | null
          icon_name?: string | null
          id?: string
          is_public?: boolean | null
          label?: string | null
          list_id?: string | null
          public_read?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          group_name?: string | null
          help_text?: string | null
          icon_name?: string | null
          id?: string
          is_public?: boolean | null
          label?: string | null
          list_id?: string | null
          public_read?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "udt_picklist_items_picklist_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "udt_picklists"
            referencedColumns: ["id"]
          },
        ]
      }
      udt_picklists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_public: boolean | null
          list_name: string | null
          public_read: boolean | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean | null
          list_name?: string | null
          public_read?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean | null
          list_name?: string | null
          public_read?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ui_client: {
        Row: {
          created_at: string
          description: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      ui_surface: {
        Row: {
          client_name: string
          created_at: string
          description: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          url_pattern: string | null
        }
        Insert: {
          client_name: string
          created_at?: string
          description?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          url_pattern?: string | null
        }
        Update: {
          client_name?: string
          created_at?: string
          description?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          url_pattern?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ui_surface_client_name_fkey"
            columns: ["client_name"]
            isOneToOne: false
            referencedRelation: "ui_client"
            referencedColumns: ["name"]
          },
        ]
      }
      ui_surface_value: {
        Row: {
          always_available: boolean
          created_at: string
          description: string
          label: string
          name: string
          sort_order: number
          surface_name: string
          typical_char_count: number
          updated_at: string
          value_type: string
        }
        Insert: {
          always_available?: boolean
          created_at?: string
          description?: string
          label?: string
          name: string
          sort_order?: number
          surface_name: string
          typical_char_count?: number
          updated_at?: string
          value_type?: string
        }
        Update: {
          always_available?: boolean
          created_at?: string
          description?: string
          label?: string
          name?: string
          sort_order?: number
          surface_name?: string
          typical_char_count?: number
          updated_at?: string
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ui_surface_value_surface_fkey"
            columns: ["surface_name"]
            isOneToOne: false
            referencedRelation: "ui_surface"
            referencedColumns: ["name"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_data: Json | null
          achievement_type: string
          id: string
          unlocked_at: string | null
          user_id: string
        }
        Insert: {
          achievement_data?: Json | null
          achievement_type: string
          id?: string
          unlocked_at?: string | null
          user_id: string
        }
        Update: {
          achievement_data?: Json | null
          achievement_type?: string
          id?: string
          unlocked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_analysis_preferences: {
        Row: {
          custom_patterns: Json
          default_redaction_mode: string
          default_tier_per_detector: Json
          per_detector_enabled: Json
          per_file_type_overrides: Json
          substitute_formats: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          custom_patterns?: Json
          default_redaction_mode?: string
          default_tier_per_detector?: Json
          per_detector_enabled?: Json
          per_file_type_overrides?: Json
          substitute_formats?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          custom_patterns?: Json
          default_redaction_mode?: string
          default_tier_per_detector?: Json
          per_detector_enabled?: Json
          per_file_type_overrides?: Json
          substitute_formats?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_bookmarks: {
        Row: {
          canvas_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          canvas_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          canvas_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_bookmarks_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "shared_canvas_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_email_preferences: {
        Row: {
          comment_notifications: boolean | null
          created_at: string | null
          feedback_notifications: boolean
          id: string
          marketing_emails: boolean | null
          message_digest: boolean | null
          message_notifications: boolean | null
          organization_invitations: boolean | null
          resource_updates: boolean | null
          sharing_notifications: boolean | null
          task_notifications: boolean | null
          updated_at: string | null
          user_id: string
          weekly_digest: boolean | null
        }
        Insert: {
          comment_notifications?: boolean | null
          created_at?: string | null
          feedback_notifications?: boolean
          id?: string
          marketing_emails?: boolean | null
          message_digest?: boolean | null
          message_notifications?: boolean | null
          organization_invitations?: boolean | null
          resource_updates?: boolean | null
          sharing_notifications?: boolean | null
          task_notifications?: boolean | null
          updated_at?: string | null
          user_id: string
          weekly_digest?: boolean | null
        }
        Update: {
          comment_notifications?: boolean | null
          created_at?: string | null
          feedback_notifications?: boolean
          id?: string
          marketing_emails?: boolean | null
          message_digest?: boolean | null
          message_notifications?: boolean | null
          organization_invitations?: boolean | null
          resource_updates?: boolean | null
          sharing_notifications?: boolean | null
          task_notifications?: boolean | null
          updated_at?: string | null
          user_id?: string
          weekly_digest?: boolean | null
        }
        Relationships: []
      }
      user_feedback: {
        Row: {
          admin_decision: string
          admin_direction: string | null
          admin_notes: string | null
          ai_assessment: string | null
          ai_complexity: string | null
          ai_estimated_files: string[] | null
          ai_solution_proposal: string | null
          ai_suggested_priority: string | null
          assigned_to: string | null
          autonomy_score: number | null
          category_id: string | null
          created_at: string
          description: string
          feedback_type: string
          has_open_issues: boolean
          id: string
          image_urls: string[] | null
          parent_id: string | null
          priority: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          route: string
          status: string
          testing_instructions: string | null
          testing_result: string | null
          testing_url: string | null
          updated_at: string
          user_confirmed_at: string | null
          user_id: string
          username: string | null
          work_priority: number | null
        }
        Insert: {
          admin_decision?: string
          admin_direction?: string | null
          admin_notes?: string | null
          ai_assessment?: string | null
          ai_complexity?: string | null
          ai_estimated_files?: string[] | null
          ai_solution_proposal?: string | null
          ai_suggested_priority?: string | null
          assigned_to?: string | null
          autonomy_score?: number | null
          category_id?: string | null
          created_at?: string
          description: string
          feedback_type: string
          has_open_issues?: boolean
          id?: string
          image_urls?: string[] | null
          parent_id?: string | null
          priority?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          route: string
          status?: string
          testing_instructions?: string | null
          testing_result?: string | null
          testing_url?: string | null
          updated_at?: string
          user_confirmed_at?: string | null
          user_id: string
          username?: string | null
          work_priority?: number | null
        }
        Update: {
          admin_decision?: string
          admin_direction?: string | null
          admin_notes?: string | null
          ai_assessment?: string | null
          ai_complexity?: string | null
          ai_estimated_files?: string[] | null
          ai_solution_proposal?: string | null
          ai_suggested_priority?: string | null
          assigned_to?: string | null
          autonomy_score?: number | null
          category_id?: string | null
          created_at?: string
          description?: string
          feedback_type?: string
          has_open_issues?: boolean
          id?: string
          image_urls?: string[] | null
          parent_id?: string | null
          priority?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          route?: string
          status?: string
          testing_instructions?: string | null
          testing_result?: string | null
          testing_url?: string | null
          updated_at?: string
          user_confirmed_at?: string | null
          user_id?: string
          username?: string | null
          work_priority?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_feedback_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "feedback_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_feedback_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "user_feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      user_files: {
        Row: {
          created_at: string
          file_id: string
          filename: string
          folder_path: string
          id: string
          is_public: boolean
          metadata: Json | null
          mime_type: string | null
          organization_id: string | null
          project_id: string | null
          size: number
          storage_path: string
          task_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_id: string
          filename: string
          folder_path?: string
          id?: string
          is_public?: boolean
          metadata?: Json | null
          mime_type?: string | null
          organization_id?: string | null
          project_id?: string | null
          size: number
          storage_path: string
          task_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_id?: string
          filename?: string
          folder_path?: string
          id?: string
          is_public?: boolean
          metadata?: Json | null
          mime_type?: string | null
          organization_id?: string | null
          project_id?: string | null
          size?: number
          storage_path?: string
          task_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_files_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ctx_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_flashcard_reviews: {
        Row: {
          card_index: number
          id: string
          result: string
          reviewed_at: string
          set_id: string
          user_id: string
        }
        Insert: {
          card_index: number
          id?: string
          result: string
          reviewed_at?: string
          set_id: string
          user_id: string
        }
        Update: {
          card_index?: number
          id?: string
          result?: string
          reviewed_at?: string
          set_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_flashcard_reviews_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "user_flashcard_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_flashcard_sets: {
        Row: {
          card_count: number
          cards: Json
          conversation_id: string | null
          created_at: string
          id: string
          is_archived: boolean
          last_studied_at: string | null
          message_id: string | null
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          card_count?: number
          cards?: Json
          conversation_id?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          last_studied_at?: string | null
          message_id?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          card_count?: number
          cards?: Json
          conversation_id?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          last_studied_at?: string | null
          message_id?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_flashcard_sets_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_flashcard_sets_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "cx_conversation_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_flashcard_sets_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "cx_message"
            referencedColumns: ["id"]
          },
        ]
      }
      user_follows: {
        Row: {
          created_at: string | null
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string | null
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string | null
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      user_form_profile: {
        Row: {
          billing_city: string | null
          billing_country: string | null
          billing_line1: string | null
          billing_line2: string | null
          billing_postal_code: string | null
          billing_region: string | null
          billing_same_as_shipping: boolean
          company_name: string | null
          created_at: string
          custom_fields: Json
          date_of_birth: string | null
          emails: Json
          emergency_contacts: Json
          images: Json
          job_title: string | null
          legal_first_name: string | null
          legal_last_name: string | null
          legal_middle_name: string | null
          name_suffix: string | null
          phones: Json
          preferred_name: string | null
          pronouns: string | null
          shipping_city: string | null
          shipping_country: string | null
          shipping_line1: string | null
          shipping_line2: string | null
          shipping_postal_code: string | null
          shipping_region: string | null
          social_handles: Json
          updated_at: string
          user_id: string
          website_url: string | null
        }
        Insert: {
          billing_city?: string | null
          billing_country?: string | null
          billing_line1?: string | null
          billing_line2?: string | null
          billing_postal_code?: string | null
          billing_region?: string | null
          billing_same_as_shipping?: boolean
          company_name?: string | null
          created_at?: string
          custom_fields?: Json
          date_of_birth?: string | null
          emails?: Json
          emergency_contacts?: Json
          images?: Json
          job_title?: string | null
          legal_first_name?: string | null
          legal_last_name?: string | null
          legal_middle_name?: string | null
          name_suffix?: string | null
          phones?: Json
          preferred_name?: string | null
          pronouns?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_line1?: string | null
          shipping_line2?: string | null
          shipping_postal_code?: string | null
          shipping_region?: string | null
          social_handles?: Json
          updated_at?: string
          user_id: string
          website_url?: string | null
        }
        Update: {
          billing_city?: string | null
          billing_country?: string | null
          billing_line1?: string | null
          billing_line2?: string | null
          billing_postal_code?: string | null
          billing_region?: string | null
          billing_same_as_shipping?: boolean
          company_name?: string | null
          created_at?: string
          custom_fields?: Json
          date_of_birth?: string | null
          emails?: Json
          emergency_contacts?: Json
          images?: Json
          job_title?: string | null
          legal_first_name?: string | null
          legal_last_name?: string | null
          legal_middle_name?: string | null
          name_suffix?: string | null
          phones?: Json
          preferred_name?: string | null
          pronouns?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_line1?: string | null
          shipping_line2?: string | null
          shipping_postal_code?: string | null
          shipping_region?: string | null
          social_handles?: Json
          updated_at?: string
          user_id?: string
          website_url?: string | null
        }
        Relationships: []
      }
      user_markdown_samples: {
        Row: {
          content: string
          created_at: string
          description: string
          detected_blocks: string[]
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          description?: string
          detected_blocks?: string[]
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          description?: string
          detected_blocks?: string[]
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          preferences: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          preferences: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          preferences?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_sensitive_items: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          kind: string
          label: string | null
          metadata: Json
          preview: string | null
          secret_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          kind: string
          label?: string | null
          metadata?: Json
          preview?: string | null
          secret_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          kind?: string
          label?: string | null
          metadata?: Json
          preview?: string | null
          secret_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_stats: {
        Row: {
          average_score: number | null
          best_score: number | null
          follower_count: number | null
          following_count: number | null
          last_active_date: string | null
          level: number | null
          longest_streak: number | null
          streak_days: number | null
          total_comments: number | null
          total_created: number | null
          total_forks_received: number | null
          total_high_scores: number | null
          total_likes_given: number | null
          total_likes_received: number | null
          total_plays: number | null
          total_views_received: number | null
          total_xp: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          average_score?: number | null
          best_score?: number | null
          follower_count?: number | null
          following_count?: number | null
          last_active_date?: string | null
          level?: number | null
          longest_streak?: number | null
          streak_days?: number | null
          total_comments?: number | null
          total_created?: number | null
          total_forks_received?: number | null
          total_high_scores?: number | null
          total_likes_given?: number | null
          total_likes_received?: number | null
          total_plays?: number | null
          total_views_received?: number | null
          total_xp?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          average_score?: number | null
          best_score?: number | null
          follower_count?: number | null
          following_count?: number | null
          last_active_date?: string | null
          level?: number | null
          longest_streak?: number | null
          streak_days?: number | null
          total_comments?: number | null
          total_created?: number | null
          total_forks_received?: number | null
          total_high_scores?: number | null
          total_likes_given?: number | null
          total_likes_received?: number | null
          total_plays?: number | null
          total_views_received?: number | null
          total_xp?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      wbx_capture: {
        Row: {
          captured_at: string
          description: string | null
          id: string
          lang: string | null
          ld_json: Json | null
          markdown: string | null
          media_count: number
          metadata: Json | null
          pattern_id: string | null
          soup: Json
          title: string | null
          url: string
          user_id: string
        }
        Insert: {
          captured_at?: string
          description?: string | null
          id?: string
          lang?: string | null
          ld_json?: Json | null
          markdown?: string | null
          media_count?: number
          metadata?: Json | null
          pattern_id?: string | null
          soup: Json
          title?: string | null
          url: string
          user_id?: string
        }
        Update: {
          captured_at?: string
          description?: string | null
          id?: string
          lang?: string | null
          ld_json?: Json | null
          markdown?: string | null
          media_count?: number
          metadata?: Json | null
          pattern_id?: string | null
          soup?: Json
          title?: string | null
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wbx_capture_pattern_fk"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "wbx_pattern"
            referencedColumns: ["id"]
          },
        ]
      }
      wbx_pattern: {
        Row: {
          config: Json
          created_at: string
          domain: string
          fields: Json
          id: string
          kind: string
          last_run_at: string | null
          last_run_count: number | null
          last_status: string | null
          last_used_at: string | null
          list_root_selector: string | null
          name: string
          route_pattern: string | null
          target_user_table_id: string | null
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          domain: string
          fields: Json
          id?: string
          kind?: string
          last_run_at?: string | null
          last_run_count?: number | null
          last_status?: string | null
          last_used_at?: string | null
          list_root_selector?: string | null
          name: string
          route_pattern?: string | null
          target_user_table_id?: string | null
          user_id?: string
        }
        Update: {
          config?: Json
          created_at?: string
          domain?: string
          fields?: Json
          id?: string
          kind?: string
          last_run_at?: string | null
          last_run_count?: number | null
          last_status?: string | null
          last_used_at?: string | null
          list_root_selector?: string | null
          name?: string
          route_pattern?: string | null
          target_user_table_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wbx_pattern_target_user_table_id_fkey"
            columns: ["target_user_table_id"]
            isOneToOne: false
            referencedRelation: "udt_datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      wbx_screenshot: {
        Row: {
          byte_length: number | null
          captured_at: string
          file_id: string
          file_url: string | null
          height: number | null
          id: string
          mime_type: string | null
          page_title: string | null
          page_url_canonical: string
          page_url_full: string
          source: string
          user_id: string
          width: number | null
        }
        Insert: {
          byte_length?: number | null
          captured_at?: string
          file_id: string
          file_url?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          page_title?: string | null
          page_url_canonical: string
          page_url_full: string
          source?: string
          user_id?: string
          width?: number | null
        }
        Update: {
          byte_length?: number | null
          captured_at?: string
          file_id?: string
          file_url?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          page_title?: string | null
          page_url_canonical?: string
          page_url_full?: string
          source?: string
          user_id?: string
          width?: number | null
        }
        Relationships: []
      }
      wbx_seo_audit: {
        Row: {
          audited_at: string
          flesch_reading_ease: number | null
          id: string
          notes: string | null
          recommendations: Json | null
          signals: Json
          url: string
          user_id: string
          word_count: number | null
        }
        Insert: {
          audited_at?: string
          flesch_reading_ease?: number | null
          id?: string
          notes?: string | null
          recommendations?: Json | null
          signals: Json
          url: string
          user_id?: string
          word_count?: number | null
        }
        Update: {
          audited_at?: string
          flesch_reading_ease?: number | null
          id?: string
          notes?: string | null
          recommendations?: Json | null
          signals?: Json
          url?: string
          user_id?: string
          word_count?: number | null
        }
        Relationships: []
      }
      wc_claim: {
        Row: {
          age_at_doi: number | null
          applicant_name: string | null
          case_number: string | null
          comments: string | null
          created_at: string
          date_of_birth: string | null
          date_of_injury: string | null
          evaluator_name: string | null
          gender: string | null
          id: string
          is_public: boolean
          job_offer_date: string | null
          large_employer: boolean
          metadata: Json
          occupational_code: number | null
          organization_id: string | null
          p_s_date: string | null
          person_id: string | null
          project_id: string | null
          tags: string[]
          updated_at: string
          user_id: string | null
          weekly_earnings: number | null
        }
        Insert: {
          age_at_doi?: number | null
          applicant_name?: string | null
          case_number?: string | null
          comments?: string | null
          created_at?: string
          date_of_birth?: string | null
          date_of_injury?: string | null
          evaluator_name?: string | null
          gender?: string | null
          id?: string
          is_public?: boolean
          job_offer_date?: string | null
          large_employer?: boolean
          metadata?: Json
          occupational_code?: number | null
          organization_id?: string | null
          p_s_date?: string | null
          person_id?: string | null
          project_id?: string | null
          tags?: string[]
          updated_at?: string
          user_id?: string | null
          weekly_earnings?: number | null
        }
        Update: {
          age_at_doi?: number | null
          applicant_name?: string | null
          case_number?: string | null
          comments?: string | null
          created_at?: string
          date_of_birth?: string | null
          date_of_injury?: string | null
          evaluator_name?: string | null
          gender?: string | null
          id?: string
          is_public?: boolean
          job_offer_date?: string | null
          large_employer?: boolean
          metadata?: Json
          occupational_code?: number | null
          organization_id?: string | null
          p_s_date?: string | null
          person_id?: string | null
          project_id?: string | null
          tags?: string[]
          updated_at?: string
          user_id?: string | null
          weekly_earnings?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wc_claim_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wc_claim_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      wc_impairment_definition: {
        Row: {
          attributes: Json | null
          fec_rank: number | null
          finger_type: Database["public"]["Enums"]["wc_finger_type"] | null
          id: string
          impairment_number: string | null
          name: string | null
          search_aliases: string[]
        }
        Insert: {
          attributes?: Json | null
          fec_rank?: number | null
          finger_type?: Database["public"]["Enums"]["wc_finger_type"] | null
          id?: string
          impairment_number?: string | null
          name?: string | null
          search_aliases?: string[]
        }
        Update: {
          attributes?: Json | null
          fec_rank?: number | null
          finger_type?: Database["public"]["Enums"]["wc_finger_type"] | null
          id?: string
          impairment_number?: string | null
          name?: string | null
          search_aliases?: string[]
        }
        Relationships: []
      }
      wc_injury: {
        Row: {
          ag: boolean
          created_at: string
          digit: number | null
          formula: string | null
          id: string
          impairment_definition_id: string | null
          industrial: number | null
          le: number | null
          pain: number | null
          rating: number | null
          report_id: string | null
          side: Database["public"]["Enums"]["wc_side"] | null
          ue: number | null
          updated_at: string | null
          wpi: number | null
        }
        Insert: {
          ag?: boolean
          created_at?: string
          digit?: number | null
          formula?: string | null
          id?: string
          impairment_definition_id?: string | null
          industrial?: number | null
          le?: number | null
          pain?: number | null
          rating?: number | null
          report_id?: string | null
          side?: Database["public"]["Enums"]["wc_side"] | null
          ue?: number | null
          updated_at?: string | null
          wpi?: number | null
        }
        Update: {
          ag?: boolean
          created_at?: string
          digit?: number | null
          formula?: string | null
          id?: string
          impairment_definition_id?: string | null
          industrial?: number | null
          le?: number | null
          pain?: number | null
          rating?: number | null
          report_id?: string | null
          side?: Database["public"]["Enums"]["wc_side"] | null
          ue?: number | null
          updated_at?: string | null
          wpi?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wc_injury_impairment_definition_id_fkey"
            columns: ["impairment_definition_id"]
            isOneToOne: false
            referencedRelation: "wc_impairment_definition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wc_injury_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "wc_report"
            referencedColumns: ["id"]
          },
        ]
      }
      wc_report: {
        Row: {
          claim_id: string
          compensation_amount: number | null
          compensation_days: number | null
          compensation_weeks: number | null
          created_at: string
          daily_rate: number | null
          default_side_total: number | null
          final_rating: number | null
          id: string
          left_side_total: number | null
          life_pension_weekly: number | null
          pd_adjustment_pct: number | null
          pd_adjustment_reason: string | null
          right_side_total: number | null
          weekly_payment: number | null
        }
        Insert: {
          claim_id: string
          compensation_amount?: number | null
          compensation_days?: number | null
          compensation_weeks?: number | null
          created_at?: string
          daily_rate?: number | null
          default_side_total?: number | null
          final_rating?: number | null
          id?: string
          left_side_total?: number | null
          life_pension_weekly?: number | null
          pd_adjustment_pct?: number | null
          pd_adjustment_reason?: string | null
          right_side_total?: number | null
          weekly_payment?: number | null
        }
        Update: {
          claim_id?: string
          compensation_amount?: number | null
          compensation_days?: number | null
          compensation_weeks?: number | null
          created_at?: string
          daily_rate?: number | null
          default_side_total?: number | null
          final_rating?: number | null
          id?: string
          left_side_total?: number | null
          life_pension_weekly?: number | null
          pd_adjustment_pct?: number | null
          pd_adjustment_reason?: string | null
          right_side_total?: number | null
          weekly_payment?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wc_report_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "wc_claim"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_checkpoint: {
        Row: {
          channel_values: Json
          created_at: string
          id: string
          interrupt_payload: Json | null
          metadata: Json
          next_invocations: Json
          parent_checkpoint_id: string | null
          pending_writes: Json
          run_id: string
          step: number
          thread_id: string
        }
        Insert: {
          channel_values?: Json
          created_at?: string
          id?: string
          interrupt_payload?: Json | null
          metadata?: Json
          next_invocations?: Json
          parent_checkpoint_id?: string | null
          pending_writes?: Json
          run_id: string
          step: number
          thread_id: string
        }
        Update: {
          channel_values?: Json
          created_at?: string
          id?: string
          interrupt_payload?: Json | null
          metadata?: Json
          next_invocations?: Json
          parent_checkpoint_id?: string | null
          pending_writes?: Json
          run_id?: string
          step?: number
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wf_checkpoint_parent_checkpoint_id_fkey"
            columns: ["parent_checkpoint_id"]
            isOneToOne: false
            referencedRelation: "wf_checkpoint"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_checkpoint_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "wf_run"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_definition: {
        Row: {
          category: string | null
          channels: Json
          created_at: string
          description: string | null
          edges: Json
          entry_nodes: Json
          id: string
          is_active: boolean
          is_archived: boolean
          is_favorite: boolean
          is_public: boolean
          max_concurrent_runs: number | null
          metadata: Json
          name: string
          nodes: Json
          organization_id: string | null
          project_id: string | null
          source_definition_id: string | null
          source_snapshot_at: string | null
          strict_channels: boolean
          tags: string[]
          task_id: string | null
          updated_at: string
          user_id: string
          version: number
          viewport: Json
        }
        Insert: {
          category?: string | null
          channels?: Json
          created_at?: string
          description?: string | null
          edges?: Json
          entry_nodes?: Json
          id?: string
          is_active?: boolean
          is_archived?: boolean
          is_favorite?: boolean
          is_public?: boolean
          max_concurrent_runs?: number | null
          metadata?: Json
          name: string
          nodes?: Json
          organization_id?: string | null
          project_id?: string | null
          source_definition_id?: string | null
          source_snapshot_at?: string | null
          strict_channels?: boolean
          tags?: string[]
          task_id?: string | null
          updated_at?: string
          user_id: string
          version?: number
          viewport?: Json
        }
        Update: {
          category?: string | null
          channels?: Json
          created_at?: string
          description?: string | null
          edges?: Json
          entry_nodes?: Json
          id?: string
          is_active?: boolean
          is_archived?: boolean
          is_favorite?: boolean
          is_public?: boolean
          max_concurrent_runs?: number | null
          metadata?: Json
          name?: string
          nodes?: Json
          organization_id?: string | null
          project_id?: string | null
          source_definition_id?: string | null
          source_snapshot_at?: string | null
          strict_channels?: boolean
          tags?: string[]
          task_id?: string | null
          updated_at?: string
          user_id?: string
          version?: number
          viewport?: Json
        }
        Relationships: []
      }
      wf_definition_version: {
        Row: {
          category: string | null
          change_note: string | null
          changed_at: string
          changed_by_user_id: string | null
          channels: Json | null
          definition_id: string
          description: string | null
          edges: Json | null
          entry_nodes: Json | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          name: string | null
          nodes: Json | null
          strict_channels: boolean | null
          tags: string[] | null
          version_number: number
          viewport: Json | null
        }
        Insert: {
          category?: string | null
          change_note?: string | null
          changed_at?: string
          changed_by_user_id?: string | null
          channels?: Json | null
          definition_id: string
          description?: string | null
          edges?: Json | null
          entry_nodes?: Json | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name?: string | null
          nodes?: Json | null
          strict_channels?: boolean | null
          tags?: string[] | null
          version_number: number
          viewport?: Json | null
        }
        Update: {
          category?: string | null
          change_note?: string | null
          changed_at?: string
          changed_by_user_id?: string | null
          channels?: Json | null
          definition_id?: string
          description?: string | null
          edges?: Json | null
          entry_nodes?: Json | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name?: string | null
          nodes?: Json | null
          strict_channels?: boolean | null
          tags?: string[] | null
          version_number?: number
          viewport?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "wf_definition_version_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "wf_definition"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_idempotency: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          idempotency_key: string
          route_path: string
          run_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key: string
          route_path: string
          run_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          route_path?: string
          run_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wf_idempotency_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "wf_run"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_job: {
        Row: {
          attempt: number
          checkpoint_id: string | null
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          id: string
          inputs: Json
          kind: string
          last_error: Json | null
          max_attempts: number
          max_steps: number
          priority: number
          resume_value: Json | null
          run_id: string
          updated_at: string
          visible_at: string
        }
        Insert: {
          attempt?: number
          checkpoint_id?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          inputs?: Json
          kind: string
          last_error?: Json | null
          max_attempts?: number
          max_steps?: number
          priority?: number
          resume_value?: Json | null
          run_id: string
          updated_at?: string
          visible_at?: string
        }
        Update: {
          attempt?: number
          checkpoint_id?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          inputs?: Json
          kind?: string
          last_error?: Json | null
          max_attempts?: number
          max_steps?: number
          priority?: number
          resume_value?: Json | null
          run_id?: string
          updated_at?: string
          visible_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wf_job_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "wf_run"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_node_events: {
        Row: {
          attempt: number | null
          checkpoint_id: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          error_type: string | null
          event_ts: string
          event_type: string
          id: string
          node_id: string | null
          payload: Json
          run_id: string
          spec_type: string | null
          step: number | null
        }
        Insert: {
          attempt?: number | null
          checkpoint_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          error_type?: string | null
          event_ts?: string
          event_type: string
          id?: string
          node_id?: string | null
          payload: Json
          run_id: string
          spec_type?: string | null
          step?: number | null
        }
        Update: {
          attempt?: number | null
          checkpoint_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          error_type?: string | null
          event_ts?: string
          event_type?: string
          id?: string
          node_id?: string | null
          payload?: Json
          run_id?: string
          spec_type?: string | null
          step?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wf_node_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "wf_run"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_node_outcome: {
        Row: {
          attempt: number
          channel_writes: Json
          completed_at: string
          duration_ms: number
          error: Json | null
          id: string
          node_id: string
          output: Json
          run_id: string
          sends: Json
          source: string
          step: number
        }
        Insert: {
          attempt?: number
          channel_writes?: Json
          completed_at?: string
          duration_ms?: number
          error?: Json | null
          id?: string
          node_id: string
          output?: Json
          run_id: string
          sends?: Json
          source?: string
          step: number
        }
        Update: {
          attempt?: number
          channel_writes?: Json
          completed_at?: string
          duration_ms?: number
          error?: Json | null
          id?: string
          node_id?: string
          output?: Json
          run_id?: string
          sends?: Json
          source?: string
          step?: number
        }
        Relationships: [
          {
            foreignKeyName: "wf_node_outcome_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "wf_run"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_recovery_audit: {
        Row: {
          agent_confidence: number | null
          agent_reasoning: string | null
          created_at: string
          id: string
          proposal_action: string
          proposal_payload: Json
          run_id: string | null
          surface: string
          user_id: string
          was_applied: boolean
          was_overridden: boolean
          workflow_id: string | null
        }
        Insert: {
          agent_confidence?: number | null
          agent_reasoning?: string | null
          created_at?: string
          id?: string
          proposal_action: string
          proposal_payload?: Json
          run_id?: string | null
          surface: string
          user_id: string
          was_applied?: boolean
          was_overridden?: boolean
          workflow_id?: string | null
        }
        Update: {
          agent_confidence?: number | null
          agent_reasoning?: string | null
          created_at?: string
          id?: string
          proposal_action?: string
          proposal_payload?: Json
          run_id?: string | null
          surface?: string
          user_id?: string
          was_applied?: boolean
          was_overridden?: boolean
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wf_recovery_audit_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "wf_run"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_recovery_audit_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "wf_definition"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_run: {
        Row: {
          agent_id: string | null
          agent_version_id: string | null
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          definition_hash: string
          definition_id: string
          definition_version_id: string | null
          error: Json | null
          id: string
          input: Json
          interrupt_payload: Json | null
          last_checkpoint_id: string | null
          max_recovery_retries: number
          metadata: Json
          organization_id: string | null
          output: Json | null
          parent_run_id: string | null
          project_id: string | null
          recovery_retry_count: number
          started_at: string | null
          status: string
          steps_executed: number
          task_id: string | null
          thread_id: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          agent_version_id?: string | null
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          definition_hash: string
          definition_id: string
          definition_version_id?: string | null
          error?: Json | null
          id?: string
          input?: Json
          interrupt_payload?: Json | null
          last_checkpoint_id?: string | null
          max_recovery_retries?: number
          metadata?: Json
          organization_id?: string | null
          output?: Json | null
          parent_run_id?: string | null
          project_id?: string | null
          recovery_retry_count?: number
          started_at?: string | null
          status?: string
          steps_executed?: number
          task_id?: string | null
          thread_id: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          agent_version_id?: string | null
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          definition_hash?: string
          definition_id?: string
          definition_version_id?: string | null
          error?: Json | null
          id?: string
          input?: Json
          interrupt_payload?: Json | null
          last_checkpoint_id?: string | null
          max_recovery_retries?: number
          metadata?: Json
          organization_id?: string | null
          output?: Json | null
          parent_run_id?: string | null
          project_id?: string | null
          recovery_retry_count?: number
          started_at?: string | null
          status?: string
          steps_executed?: number
          task_id?: string | null
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wf_run_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "wf_definition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_run_definition_version_id_fkey"
            columns: ["definition_version_id"]
            isOneToOne: false
            referencedRelation: "wf_definition_version"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_run_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "wf_run"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_template: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          definition: Json
          description: string | null
          id: string
          is_published: boolean
          name: string
          popularity: number
          preview_image_url: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          definition: Json
          description?: string | null
          id?: string
          is_published?: boolean
          name: string
          popularity?: number
          preview_image_url?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          definition?: Json
          description?: string | null
          id?: string
          is_published?: boolean
          name?: string
          popularity?: number
          preview_image_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      wf_trigger: {
        Row: {
          created_at: string
          cron_expression: string | null
          default_inputs: Json
          definition_id: string
          definition_version_id: string | null
          description: string | null
          fire_count: number
          id: string
          is_active: boolean
          kind: string
          last_fired_at: string | null
          last_run_id: string | null
          max_steps: number
          name: string
          next_run_at: string | null
          organization_id: string | null
          project_id: string | null
          task_id: string | null
          timezone: string
          updated_at: string
          user_id: string
          webhook_secret: string | null
        }
        Insert: {
          created_at?: string
          cron_expression?: string | null
          default_inputs?: Json
          definition_id: string
          definition_version_id?: string | null
          description?: string | null
          fire_count?: number
          id?: string
          is_active?: boolean
          kind: string
          last_fired_at?: string | null
          last_run_id?: string | null
          max_steps?: number
          name: string
          next_run_at?: string | null
          organization_id?: string | null
          project_id?: string | null
          task_id?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
          webhook_secret?: string | null
        }
        Update: {
          created_at?: string
          cron_expression?: string | null
          default_inputs?: Json
          definition_id?: string
          definition_version_id?: string | null
          description?: string | null
          fire_count?: number
          id?: string
          is_active?: boolean
          kind?: string
          last_fired_at?: string | null
          last_run_id?: string | null
          max_steps?: number
          name?: string
          next_run_at?: string | null
          organization_id?: string | null
          project_id?: string | null
          task_id?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wf_trigger_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "wf_definition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_trigger_definition_version_id_fkey"
            columns: ["definition_version_id"]
            isOneToOne: false
            referencedRelation: "wf_definition_version"
            referencedColumns: ["id"]
          },
        ]
      }
      window_sessions: {
        Row: {
          created_at: string | null
          data: Json
          id: string
          label: string | null
          panel_state: Json
          updated_at: string | null
          user_id: string
          window_type: string
        }
        Insert: {
          created_at?: string | null
          data?: Json
          id?: string
          label?: string | null
          panel_state?: Json
          updated_at?: string | null
          user_id: string
          window_type: string
        }
        Update: {
          created_at?: string | null
          data?: Json
          id?: string
          label?: string | null
          panel_state?: Json
          updated_at?: string | null
          user_id?: string
          window_type?: string
        }
        Relationships: []
      }
      workflow: {
        Row: {
          auto_execute: boolean | null
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          is_deleted: boolean | null
          is_public: boolean | null
          metadata: Json | null
          name: string
          organization_id: string | null
          project_id: string | null
          public_read: boolean | null
          tags: Json | null
          task_id: string | null
          updated_at: string | null
          user_id: string | null
          version: number | null
          viewport: Json | null
        }
        Insert: {
          auto_execute?: boolean | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_deleted?: boolean | null
          is_public?: boolean | null
          metadata?: Json | null
          name: string
          organization_id?: string | null
          project_id?: string | null
          public_read?: boolean | null
          tags?: Json | null
          task_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          version?: number | null
          viewport?: Json | null
        }
        Update: {
          auto_execute?: boolean | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_deleted?: boolean | null
          is_public?: boolean | null
          metadata?: Json | null
          name?: string
          organization_id?: string | null
          project_id?: string | null
          public_read?: boolean | null
          tags?: Json | null
          task_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          version?: number | null
          viewport?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ctx_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_data: {
        Row: {
          actions: Json | null
          auto_execute: boolean | null
          category: string | null
          created_at: string | null
          dependencies: Json | null
          description: string | null
          destinations: Json | null
          id: string
          inputs: Json | null
          is_active: boolean | null
          is_deleted: boolean | null
          is_public: boolean | null
          metadata: Json | null
          name: string
          outputs: Json | null
          public_read: boolean | null
          sources: Json | null
          tags: Json | null
          updated_at: string | null
          user_id: string | null
          version: number | null
          viewport: Json | null
          workflow_type: string | null
        }
        Insert: {
          actions?: Json | null
          auto_execute?: boolean | null
          category?: string | null
          created_at?: string | null
          dependencies?: Json | null
          description?: string | null
          destinations?: Json | null
          id?: string
          inputs?: Json | null
          is_active?: boolean | null
          is_deleted?: boolean | null
          is_public?: boolean | null
          metadata?: Json | null
          name: string
          outputs?: Json | null
          public_read?: boolean | null
          sources?: Json | null
          tags?: Json | null
          updated_at?: string | null
          user_id?: string | null
          version?: number | null
          viewport?: Json | null
          workflow_type?: string | null
        }
        Update: {
          actions?: Json | null
          auto_execute?: boolean | null
          category?: string | null
          created_at?: string | null
          dependencies?: Json | null
          description?: string | null
          destinations?: Json | null
          id?: string
          inputs?: Json | null
          is_active?: boolean | null
          is_deleted?: boolean | null
          is_public?: boolean | null
          metadata?: Json | null
          name?: string
          outputs?: Json | null
          public_read?: boolean | null
          sources?: Json | null
          tags?: Json | null
          updated_at?: string | null
          user_id?: string | null
          version?: number | null
          viewport?: Json | null
          workflow_type?: string | null
        }
        Relationships: []
      }
      workflow_edge: {
        Row: {
          animated: boolean | null
          connection_type: string | null
          created_at: string
          edge_type: string | null
          id: string
          label: string | null
          metadata: Json | null
          source_handle_id: string | null
          source_node_id: string | null
          style: Json | null
          target_handle_id: string | null
          target_node_id: string | null
          workflow_id: string | null
        }
        Insert: {
          animated?: boolean | null
          connection_type?: string | null
          created_at?: string
          edge_type?: string | null
          id?: string
          label?: string | null
          metadata?: Json | null
          source_handle_id?: string | null
          source_node_id?: string | null
          style?: Json | null
          target_handle_id?: string | null
          target_node_id?: string | null
          workflow_id?: string | null
        }
        Update: {
          animated?: boolean | null
          connection_type?: string | null
          created_at?: string
          edge_type?: string | null
          id?: string
          label?: string | null
          metadata?: Json | null
          source_handle_id?: string | null
          source_node_id?: string | null
          style?: Json | null
          target_handle_id?: string | null
          target_node_id?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_edge_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "workflow_node_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_edge_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "workflow_node_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_edge_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflow_data"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_node: {
        Row: {
          additional_dependencies: Json | null
          arg_mapping: Json | null
          arg_overrides: Json | null
          created_at: string
          execution_required: boolean | null
          function_id: string | null
          function_type: string | null
          id: string
          is_public: boolean | null
          metadata: Json | null
          node_type: string | null
          public_read: boolean | null
          return_broker_overrides: Json | null
          status: string | null
          step_name: string | null
          ui_node_data: Json | null
          updated_at: string | null
          user_id: string | null
          workflow_id: string | null
        }
        Insert: {
          additional_dependencies?: Json | null
          arg_mapping?: Json | null
          arg_overrides?: Json | null
          created_at?: string
          execution_required?: boolean | null
          function_id?: string | null
          function_type?: string | null
          id?: string
          is_public?: boolean | null
          metadata?: Json | null
          node_type?: string | null
          public_read?: boolean | null
          return_broker_overrides?: Json | null
          status?: string | null
          step_name?: string | null
          ui_node_data?: Json | null
          updated_at?: string | null
          user_id?: string | null
          workflow_id?: string | null
        }
        Update: {
          additional_dependencies?: Json | null
          arg_mapping?: Json | null
          arg_overrides?: Json | null
          created_at?: string
          execution_required?: boolean | null
          function_id?: string | null
          function_type?: string | null
          id?: string
          is_public?: boolean | null
          metadata?: Json | null
          node_type?: string | null
          public_read?: boolean | null
          return_broker_overrides?: Json | null
          status?: string | null
          step_name?: string | null
          ui_node_data?: Json | null
          updated_at?: string | null
          user_id?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_node_function_id_fkey"
            columns: ["function_id"]
            isOneToOne: false
            referencedRelation: "registered_function"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_node_function_id_fkey"
            columns: ["function_id"]
            isOneToOne: false
            referencedRelation: "view_registered_function"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_node_function_id_fkey"
            columns: ["function_id"]
            isOneToOne: false
            referencedRelation: "view_registered_function_all_rels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_node_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflow"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_node_data: {
        Row: {
          arguments: Json | null
          created_at: string
          dependencies: Json | null
          execution_required: boolean | null
          function_id: string | null
          id: string
          inputs: Json | null
          is_active: boolean | null
          is_public: boolean | null
          metadata: Json | null
          node_type: string | null
          outputs: Json | null
          public_read: boolean | null
          step_name: string | null
          type: string | null
          ui_data: Json | null
          updated_at: string | null
          user_id: string | null
          workflow_id: string | null
        }
        Insert: {
          arguments?: Json | null
          created_at?: string
          dependencies?: Json | null
          execution_required?: boolean | null
          function_id?: string | null
          id?: string
          inputs?: Json | null
          is_active?: boolean | null
          is_public?: boolean | null
          metadata?: Json | null
          node_type?: string | null
          outputs?: Json | null
          public_read?: boolean | null
          step_name?: string | null
          type?: string | null
          ui_data?: Json | null
          updated_at?: string | null
          user_id?: string | null
          workflow_id?: string | null
        }
        Update: {
          arguments?: Json | null
          created_at?: string
          dependencies?: Json | null
          execution_required?: boolean | null
          function_id?: string | null
          id?: string
          inputs?: Json | null
          is_active?: boolean | null
          is_public?: boolean | null
          metadata?: Json | null
          node_type?: string | null
          outputs?: Json | null
          public_read?: boolean | null
          step_name?: string | null
          type?: string | null
          ui_data?: Json | null
          updated_at?: string | null
          user_id?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_node_data_function_id_fkey"
            columns: ["function_id"]
            isOneToOne: false
            referencedRelation: "registered_function"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_node_data_function_id_fkey"
            columns: ["function_id"]
            isOneToOne: false
            referencedRelation: "view_registered_function"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_node_data_function_id_fkey"
            columns: ["function_id"]
            isOneToOne: false
            referencedRelation: "view_registered_function_all_rels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_node_data_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflow_data"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_relay: {
        Row: {
          created_at: string
          id: string
          label: string | null
          metadata: Json | null
          source_broker_id: string
          target_broker_ids: Json | null
          ui_node_data: Json | null
          updated_at: string | null
          user_id: string | null
          workflow_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          metadata?: Json | null
          source_broker_id: string
          target_broker_ids?: Json | null
          ui_node_data?: Json | null
          updated_at?: string | null
          user_id?: string | null
          workflow_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          metadata?: Json | null
          source_broker_id?: string
          target_broker_ids?: Json | null
          ui_node_data?: Json | null
          updated_at?: string | null
          user_id?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_relay_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflow"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_user_input: {
        Row: {
          broker_id: string
          created_at: string
          data_type: string | null
          default_value: string | null
          field_component_id: string | null
          id: string
          is_required: boolean | null
          label: string | null
          metadata: Json | null
          ui_node_data: Json | null
          updated_at: string | null
          user_id: string | null
          workflow_id: string
        }
        Insert: {
          broker_id: string
          created_at?: string
          data_type?: string | null
          default_value?: string | null
          field_component_id?: string | null
          id?: string
          is_required?: boolean | null
          label?: string | null
          metadata?: Json | null
          ui_node_data?: Json | null
          updated_at?: string | null
          user_id?: string | null
          workflow_id: string
        }
        Update: {
          broker_id?: string
          created_at?: string
          data_type?: string | null
          default_value?: string | null
          field_component_id?: string | null
          id?: string
          is_required?: boolean | null
          label?: string | null
          metadata?: Json | null
          ui_node_data?: Json | null
          updated_at?: string | null
          user_id?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_user_input_field_component_id_fkey"
            columns: ["field_component_id"]
            isOneToOne: false
            referencedRelation: "field_components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_user_input_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflow"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      agent_context_menu_view: {
        Row: {
          categories_flat: Json | null
          placement_type: string | null
        }
        Relationships: []
      }
      agx_context_menu_view: {
        Row: {
          categories_flat: Json | null
          placement_type: string | null
        }
        Relationships: []
      }
      ai_runs_summary: {
        Row: {
          created_at: string | null
          id: string | null
          is_starred: boolean | null
          last_message_at: string | null
          message_count: number | null
          name: string | null
          source_id: string | null
          source_type: string | null
          status: string | null
          task_count: number | null
          total_cost: number | null
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          is_starred?: boolean | null
          last_message_at?: string | null
          message_count?: number | null
          name?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          task_count?: number | null
          total_cost?: number | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          is_starred?: boolean | null
          last_message_at?: string | null
          message_count?: number | null
          name?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          task_count?: number | null
          total_cost?: number | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_tasks_analytics: {
        Row: {
          avg_time_to_first_token: number | null
          avg_total_time: number | null
          day: string | null
          service: string | null
          task_name: string | null
          total_cost: number | null
          total_tasks: number | null
          total_tokens: number | null
          user_id: string | null
        }
        Relationships: []
      }
      category_items_view: {
        Row: {
          category_id: string | null
          description: string | null
          icon_name: string | null
          id: string | null
          is_active: boolean | null
          item_type: string | null
          label: string | null
          prompt_builtin_id: string | null
          sort_order: number | null
          template: string | null
        }
        Relationships: []
      }
      context_menu_unified_view: {
        Row: {
          categories_flat: Json | null
          placement_type: string | null
        }
        Relationships: []
      }
      current_user_is_admin: {
        Row: {
          admin_level: Database["public"]["Enums"]["admin_level"] | null
          is_admin: boolean | null
          user_id: string | null
        }
        Insert: {
          admin_level?: Database["public"]["Enums"]["admin_level"] | null
          is_admin?: never
          user_id?: string | null
        }
        Update: {
          admin_level?: Database["public"]["Enums"]["admin_level"] | null
          is_admin?: never
          user_id?: string | null
        }
        Relationships: []
      }
      cx_conversation_summary: {
        Row: {
          created_at: string | null
          description: string | null
          error_count: number | null
          id: string | null
          is_ephemeral: boolean | null
          is_favorite: boolean | null
          is_public: boolean | null
          last_model_id: string | null
          last_model_name: string | null
          last_model_provider: string | null
          last_request_at: string | null
          last_request_status: string | null
          message_count: number | null
          organization_id: string | null
          project_id: string | null
          request_count: number | null
          snapshot_count: number | null
          source_app: string | null
          source_feature: string | null
          status: string | null
          task_id: string | null
          title: string | null
          tool_call_count: number | null
          total_cost: number | null
          total_duration_ms: number | null
          total_tokens: number | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cx_conversation_last_model_id_fkey"
            columns: ["last_model_id"]
            isOneToOne: false
            referencedRelation: "ai_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_conversation_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_conversation_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ctx_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cx_conversation_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ctx_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      extracted_documents: {
        Row: {
          clean_content: string | null
          content: string | null
          created_at: string | null
          id: string | null
          name: string | null
          source: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          clean_content?: string | null
          content?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          source?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          clean_content?: string | null
          content?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          source?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      prompt_app_analytics: {
        Row: {
          app_id: string | null
          avg_cost_per_execution: number | null
          avg_execution_time_ms: number | null
          creator_id: string | null
          executions_24h: number | null
          executions_30d: number | null
          executions_7d: number | null
          failed_executions: number | null
          first_execution_at: string | null
          last_execution_at: string | null
          median_execution_time_ms: number | null
          name: string | null
          p95_execution_time_ms: number | null
          slug: string | null
          status: string | null
          success_rate_percent: number | null
          successful_executions: number | null
          total_cost: number | null
          total_executions: number | null
          total_tokens: number | null
          unique_anonymous_users: number | null
          unique_authenticated_users: number | null
        }
        Relationships: []
      }
      prompt_builtins_with_source_view: {
        Row: {
          category: string | null
          created_at: string | null
          created_by_user_id: string | null
          description: string | null
          id: string | null
          is_active: boolean | null
          is_archived: boolean | null
          is_favorite: boolean | null
          messages: Json | null
          model_id: string | null
          name: string | null
          output_format: string | null
          output_schema: Json | null
          settings: Json | null
          source_prompt_description: string | null
          source_prompt_id: string | null
          source_prompt_name: string | null
          source_prompt_snapshot_at: string | null
          source_prompt_updated_at: string | null
          tags: string[] | null
          tools: Json | null
          updated_at: string | null
          variable_defaults: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "prompt_builtins_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "ai_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_builtins_source_prompt_id_fkey"
            columns: ["source_prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_complete: {
        Row: {
          ai_agent: Json | null
          description: string | null
          id: string | null
          is_public: boolean | null
          messages: Json | null
          metadata: Json | null
          name: string | null
          post_result_options: Json | null
          recipe_id: string | null
          sample_output: string | null
          status: Database["public"]["Enums"]["recipe_status"] | null
          tags: Json | null
          user_id: string | null
          version: number | null
        }
        Relationships: []
      }
      rs_source_keywords: {
        Row: {
          description: string | null
          discovered_at: string | null
          extra_snippets: Json | null
          hostname: string | null
          id: string | null
          is_included: boolean | null
          is_stale: boolean | null
          keyword_id: string | null
          last_seen_at: string | null
          origin: string | null
          page_age: string | null
          rank: number | null
          rank_for_keyword: number | null
          raw_search_result: Json | null
          scrape_status: string | null
          source_type: string | null
          thumbnail_url: string | null
          title: string | null
          topic_id: string | null
          url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rs_keyword_source_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "rs_keyword"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rs_source_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "rs_topic"
            referencedColumns: ["id"]
          },
        ]
      }
      shortcuts_by_placement_view: {
        Row: {
          allow_chat: boolean | null
          apply_variables: boolean | null
          auto_run: boolean | null
          available_scopes: string[] | null
          builtin_description: string | null
          builtin_id: string | null
          builtin_is_active: boolean | null
          builtin_messages: Json | null
          builtin_name: string | null
          builtin_settings: Json | null
          builtin_tools: Json | null
          builtin_variable_defaults: Json | null
          category_color: string | null
          category_description: string | null
          category_icon: string | null
          category_id: string | null
          category_is_active: boolean | null
          category_label: string | null
          category_metadata: Json | null
          category_sort_order: number | null
          keyboard_shortcut: string | null
          parent_category_id: string | null
          placement_type: string | null
          prompt_builtin_id: string | null
          result_display: string | null
          scope_mappings: Json | null
          shortcut_created_at: string | null
          shortcut_description: string | null
          shortcut_icon: string | null
          shortcut_id: string | null
          shortcut_is_active: boolean | null
          shortcut_label: string | null
          shortcut_sort_order: number | null
          shortcut_updated_at: string | null
          show_variables: boolean | null
          source_prompt_id: string | null
          source_prompt_snapshot_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prompt_builtins_source_prompt_id_fkey"
            columns: ["source_prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_shortcuts_prompt_fkey"
            columns: ["prompt_builtin_id"]
            isOneToOne: false
            referencedRelation: "prompt_builtins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_shortcuts_prompt_fkey"
            columns: ["prompt_builtin_id"]
            isOneToOne: false
            referencedRelation: "prompt_builtins_with_source_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_shortcuts_prompt_fkey"
            columns: ["prompt_builtin_id"]
            isOneToOne: false
            referencedRelation: "shortcuts_by_placement_view"
            referencedColumns: ["builtin_id"]
          },
          {
            foreignKeyName: "shortcut_categories_parent_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "shortcut_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shortcut_categories_parent_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "shortcuts_by_placement_view"
            referencedColumns: ["category_id"]
          },
        ]
      }
      view_registered_function: {
        Row: {
          args: Json | null
          class_name: string | null
          description: string | null
          id: string | null
          module_path: string | null
          name: string | null
          return_broker: string | null
          return_brokers: Json | null
          system_functions: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "registered_function_return_broker_fkey"
            columns: ["return_broker"]
            isOneToOne: false
            referencedRelation: "data_broker"
            referencedColumns: ["id"]
          },
        ]
      }
      view_registered_function_all_rels: {
        Row: {
          args: Json | null
          broker_additional_params: Json | null
          broker_custom_source_component: string | null
          broker_data_type: Database["public"]["Enums"]["data_type"] | null
          broker_default_destination:
            | Database["public"]["Enums"]["data_destination"]
            | null
          broker_default_source:
            | Database["public"]["Enums"]["data_source"]
            | null
          broker_description: string | null
          broker_display_name: string | null
          broker_id: string | null
          broker_name: string | null
          broker_other_source_params: Json | null
          broker_output_component:
            | Database["public"]["Enums"]["destination_component"]
            | null
          broker_ready: boolean | null
          broker_sample_entries: string | null
          broker_tags: Json | null
          broker_tooltip: string | null
          broker_validation_rules: Json | null
          broker_value: Json | null
          class_name: string | null
          description: string | null
          id: string | null
          module_path: string | null
          name: string | null
          return_broker: string | null
          system_functions: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "broker_custom_component_fkey"
            columns: ["broker_custom_source_component"]
            isOneToOne: false
            referencedRelation: "data_input_component"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registered_function_return_broker_fkey"
            columns: ["return_broker"]
            isOneToOne: false
            referencedRelation: "data_broker"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _count_super_admins: { Args: never; Returns: number }
      accept_organization_invitation: {
        Args: { accepting_user_id: string; invitation_token: string }
        Returns: string
      }
      add_column_to_user_table: {
        Args: {
          p_data_type: string
          p_default_value?: Json
          p_display_name: string
          p_field_name: string
          p_field_order?: number
          p_is_required?: boolean
          p_table_id: string
          p_validation_rules?: Json
        }
        Returns: Json
      }
      add_data_row_to_user_table: {
        Args: { p_data: Json; p_table_id: string }
        Returns: Json
      }
      add_enum_values: {
        Args: { p_new_values: string[]; p_type_name: string }
        Returns: string[]
      }
      add_feedback_comment: {
        Args: {
          p_author_name: string
          p_author_type: string
          p_content: string
          p_feedback_id: string
        }
        Returns: {
          author_name: string | null
          author_type: string
          content: string
          created_at: string
          feedback_id: string
          id: string
        }
        SetofOptions: {
          from: "*"
          to: "feedback_comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_field_to_group: {
        Args: { p_field_id: string; p_group_id: string }
        Returns: boolean
      }
      add_groups_to_applet: {
        Args: { p_applet_id: string; p_group_ids: string[] }
        Returns: {
          accent_color: string | null
          app_id: string | null
          applet_icon: string | null
          applet_submit_text: string | null
          broker_map: Json | null
          compiled_recipe_id: string | null
          containers: Json | null
          created_at: string
          creator: string | null
          data_destination_config: Json | null
          data_source_config: Json | null
          description: string | null
          id: string
          image_url: string | null
          is_public: boolean | null
          layout_type: string | null
          name: string
          next_step_config: Json | null
          overview_label: string | null
          primary_color: string | null
          public_read: boolean | null
          result_component_config: Json | null
          slug: string
          subcategory_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "custom_applet_configs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_one_action: {
        Args: {
          p_id: string
          p_matrix: string
          p_name: string
          p_node_type: string
          p_reference_id: string
          p_transformer?: string
        }
        Returns: {
          id: string
          matrix: string
          name: string
          node_type: string
          reference_id: string
          transformer: string
        }[]
      }
      add_one_ai_endpoint: {
        Args: {
          p_additional_cost?: boolean
          p_cost_details?: Json
          p_description?: string
          p_id: string
          p_name: string
          p_params?: Json
          p_provider?: string
        }
        Returns: {
          additional_cost: boolean
          cost_details: Json
          description: string
          id: string
          name: string
          params: Json
          provider: string
        }[]
      }
      add_one_ai_model: {
        Args: {
          p_capabilities?: Json
          p_class: string
          p_common_name?: string
          p_context_window?: number
          p_controls?: Json
          p_endpoints?: Json
          p_id: string
          p_max_tokens?: number
          p_name: string
          p_provider?: string
        }
        Returns: {
          capabilities: Json
          class: string
          common_name: string
          context_window: number
          controls: Json
          endpoints: Json
          id: string
          max_tokens: number
          name: string
          provider: string
        }[]
      }
      add_one_arg: {
        Args: {
          p_data_type?: Database["public"]["Enums"]["data_type"]
          p_default?: string
          p_id: string
          p_name: string
          p_ready?: boolean
          p_registered_function?: string
          p_required?: boolean
        }
        Returns: {
          data_type: Database["public"]["Enums"]["data_type"]
          default: string
          id: string
          name: string
          ready: boolean
          registered_function: string
          required: boolean
        }[]
      }
      add_one_automation_boundary_brokers: {
        Args: {
          p_beacon_destination?: Database["public"]["Enums"]["data_destination"]
          p_broker?: string
          p_id: string
          p_matrix?: string
          p_spark_source?: Database["public"]["Enums"]["data_source"]
        }
        Returns: {
          beacon_destination: Database["public"]["Enums"]["data_destination"]
          broker: string
          id: string
          matrix: string
          spark_source: Database["public"]["Enums"]["data_source"]
        }[]
      }
      add_one_automation_matrix: {
        Args: {
          p_average_seconds?: number
          p_cognition_matrices?: Database["public"]["Enums"]["cognition_matrices"]
          p_description?: string
          p_id: string
          p_is_automated?: boolean
          p_name: string
        }
        Returns: {
          average_seconds: number
          cognition_matrices: Database["public"]["Enums"]["cognition_matrices"]
          description: string
          id: string
          is_automated: boolean
          name: string
        }[]
      }
      add_one_broker: {
        Args: {
          p_additional_params?: Json
          p_custom_source_component?: string
          p_data_type: Database["public"]["Enums"]["data_type"]
          p_default_destination?: Database["public"]["Enums"]["data_destination"]
          p_default_source?: Database["public"]["Enums"]["data_source"]
          p_description?: string
          p_display_name?: string
          p_id: string
          p_name: string
          p_other_source_params?: Json
          p_output_component?: Database["public"]["Enums"]["destination_component"]
          p_ready?: boolean
          p_sample_entries?: string
          p_tags?: Json
          p_tooltip?: string
          p_validation_rules?: Json
          p_value?: Json
        }
        Returns: {
          additional_params: Json
          custom_source_component: string
          data_type: Database["public"]["Enums"]["data_type"]
          default_destination: Database["public"]["Enums"]["data_destination"]
          default_source: Database["public"]["Enums"]["data_source"]
          description: string
          display_name: string
          id: string
          name: string
          other_source_params: Json
          output_component: Database["public"]["Enums"]["destination_component"]
          ready: boolean
          sample_entries: string
          tags: Json
          tooltip: string
          validation_rules: Json
          value: Json
        }[]
      }
      add_one_data_output_component: {
        Args: {
          p_additional_params?: Json
          p_component_type?: Database["public"]["Enums"]["destination_component"]
          p_id: string
          p_props?: Json
          p_ui_component?: string
        }
        Returns: {
          additional_params: Json
          component_type: Database["public"]["Enums"]["destination_component"]
          id: string
          props: Json
          ui_component: string
        }[]
      }
      add_one_display_option: {
        Args: {
          p_additional_params?: Json
          p_customizable_params?: Json
          p_default_params?: Json
          p_id: string
          p_name?: string
        }
        Returns: {
          additional_params: Json
          customizable_params: Json
          default_params: Json
          id: string
          name: string
        }[]
      }
      add_one_entry: {
        Args: {
          p_create_function?: string
          p_payload: Json
          p_table_name: string
        }
        Returns: Json
      }
      add_one_extractor: {
        Args: {
          p_default_identifier?: string
          p_default_index?: number
          p_id: string
          p_name: string
          p_output_type?: Database["public"]["Enums"]["data_type"]
        }
        Returns: {
          default_identifier: string
          default_index: number
          id: string
          name: string
          output_type: Database["public"]["Enums"]["data_type"]
        }[]
      }
      add_one_processors: {
        Args: {
          p_default_extractors?: Json
          p_depends_default?: string
          p_id: string
          p_name: string
          p_params?: Json
        }
        Returns: {
          default_extractors: Json
          depends_default: string
          id: string
          name: string
          params: Json
        }[]
      }
      add_one_public_registered_function: {
        Args: {
          p_class_name?: string
          p_description?: string
          p_id: string
          p_module_path: string
          p_name: string
          p_return_broker?: string
        }
        Returns: {
          class_name: string
          description: string
          id: string
          module_path: string
          name: string
          return_broker: string
        }[]
      }
      add_one_recipe:
        | {
            Args: {
              p_description?: string
              p_id: string
              p_is_public?: boolean
              p_messages?: Json[]
              p_name: string
              p_post_result_options?: Json
              p_sample_output?: string
              p_status: Database["public"]["Enums"]["recipe_status"]
              p_tags?: Json
              p_version?: number
            }
            Returns: {
              description: string
              id: string
              is_public: boolean
              messages: Json[]
              name: string
              post_result_options: Json
              sample_output: string
              status: Database["public"]["Enums"]["recipe_status"]
              tags: Json
              version: number
            }[]
          }
        | {
            Args: {
              p_description?: string
              p_id: string
              p_is_public?: boolean
              p_messages?: Json[]
              p_name: string
              p_post_result_options?: Json
              p_sample_output?: string
              p_status: Database["public"]["Enums"]["recipe_status"]
              p_tags?: Json
              p_varsion: number
            }
            Returns: {
              description: string
              id: string
              is_public: boolean
              messages: Json[]
              name: string
              post_result_options: Json
              sample_output: string
              status: Database["public"]["Enums"]["recipe_status"]
              tags: Json
              varsion: number
            }[]
          }
      add_one_recipe_broker: {
        Args: {
          p_broker: string
          p_broker_role: Database["public"]["Enums"]["broker_role"]
          p_id: string
          p_recipe: string
          p_required?: boolean
        }
        Returns: {
          broker: string
          broker_role: Database["public"]["Enums"]["broker_role"]
          id: string
          recipe: string
          required: boolean
        }[]
      }
      add_one_recipe_display: {
        Args: {
          p_display: string
          p_display_settings?: Json
          p_id: string
          p_priority?: number
          p_recipe: string
        }
        Returns: {
          display: string
          display_settings: Json
          id: string
          priority: number
          recipe: string
        }[]
      }
      add_one_recipe_function: {
        Args: {
          p_function: string
          p_id: string
          p_params?: Json
          p_recipe: string
          p_role: Database["public"]["Enums"]["function_role"]
        }
        Returns: {
          function: string
          id: string
          params: Json
          recipe: string
          role: Database["public"]["Enums"]["function_role"]
        }[]
      }
      add_one_recipe_model: {
        Args: {
          p_ai_model: string
          p_id: string
          p_priority?: number
          p_recipe: string
          p_role: Database["public"]["Enums"]["model_role"]
        }
        Returns: {
          ai_model: string
          id: string
          priority: number
          recipe: string
          role: Database["public"]["Enums"]["model_role"]
        }[]
      }
      add_one_recipe_processors: {
        Args: {
          p_id: string
          p_params?: Json
          p_processor: string
          p_recipe: string
        }
        Returns: {
          id: string
          params: Json
          processor: string
          recipe: string
        }[]
      }
      add_one_recipe_tools: {
        Args: {
          p_id: string
          p_params?: Json
          p_recipe: string
          p_tool: string
        }
        Returns: {
          id: string
          params: Json
          recipe: string
          tool: string
        }[]
      }
      add_one_registered_function:
        | { Args: { input_json: Json }; Returns: Json }
        | {
            Args: {
              p_class_name?: string
              p_description?: string
              p_id: string
              p_module_path: string
              p_name: string
              p_return_broker?: string
            }
            Returns: {
              class_name: string
              description: string
              id: string
              module_path: string
              name: string
              return_broker: string
            }[]
          }
        | { Args: { p_payload: Json }; Returns: Json }
      add_one_system_function: {
        Args: {
          p_description?: string
          p_id: string
          p_input_params?: Json
          p_output_options?: Json
          p_public_name: string
          p_rf_id: string
          p_sample?: string
        }
        Returns: {
          description: string
          id: string
          input_params: Json
          output_options: Json
          public_name: string
          rf_id: string
          sample: string
        }[]
      }
      add_one_tool: {
        Args: {
          p_additional_params?: Json
          p_description?: string
          p_id: string
          p_name: string
          p_parameters?: Json
          p_required_args?: Json
          p_source: Json
          p_system_function?: string
        }
        Returns: {
          additional_params: Json
          description: string
          id: string
          name: string
          parameters: Json
          required_args: Json
          source: Json
          system_function: string
        }[]
      }
      add_one_transformers: {
        Args: {
          p_id: string
          p_input_params?: Json
          p_name?: string
          p_ourput_params?: Json
        }
        Returns: {
          id: string
          input_params: Json
          name: string
          ourput_params: Json
        }[]
      }
      admin_find_user_by_email: {
        Args: { p_email: string }
        Returns: {
          admin_level: Database["public"]["Enums"]["admin_level"]
          email: string
          is_admin: boolean
          user_id: string
        }[]
      }
      admin_get_columns: {
        Args: { p_table_name: string }
        Returns: {
          column_default: string
          column_name: string
          data_type: string
          is_nullable: boolean
          is_primary_key: boolean
          name: string
        }[]
      }
      admin_list: {
        Args: never
        Returns: {
          admin_created_at: string
          email: string
          last_sign_in_at: string
          level: Database["public"]["Enums"]["admin_level"]
          metadata: Json
          permissions: Json
          user_created_at: string
          user_id: string
        }[]
      }
      admin_list_audit: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          action: string
          actor_email: string
          actor_user_id: string
          after: Json
          before: Json
          created_at: string
          id: string
          target_email: string
          target_user_id: string
        }[]
      }
      admin_list_for_assignment: {
        Args: never
        Returns: {
          display_name: string
          email: string
          level: Database["public"]["Enums"]["admin_level"]
          user_id: string
        }[]
      }
      admin_list_tables: {
        Args: never
        Returns: {
          name: string
          row_count: number
          table_name: string
          table_schema: string
        }[]
      }
      admin_promote: {
        Args: {
          target_level?: Database["public"]["Enums"]["admin_level"]
          target_metadata?: Json
          target_permissions?: Json
          target_user_id: string
        }
        Returns: {
          created_at: string | null
          level: Database["public"]["Enums"]["admin_level"]
          metadata: Json
          permissions: Json
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "admins"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_reply_user_review:
        | {
            Args: {
              p_feedback_id: string
              p_message: string
              p_sender_name?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_feedback_id: string
              p_image_urls?: string[]
              p_message: string
              p_sender_name?: string
            }
            Returns: Json
          }
      admin_revoke: {
        Args: { target_user_id: string }
        Returns: {
          created_at: string | null
          level: Database["public"]["Enums"]["admin_level"]
          metadata: Json
          permissions: Json
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "admins"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_update: {
        Args: {
          target_level?: Database["public"]["Enums"]["admin_level"]
          target_metadata?: Json
          target_permissions?: Json
          target_user_id: string
        }
        Returns: {
          created_at: string | null
          level: Database["public"]["Enums"]["admin_level"]
          metadata: Json
          permissions: Json
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "admins"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      agx_accept_version: {
        Args: { p_reference_id: string; p_reference_type: string }
        Returns: Json
      }
      agx_build_shortcut_menu: {
        Args: { p_placement_types: string[] }
        Returns: {
          menu_data: Json
          placement_type: string
        }[]
      }
      agx_check_drift: {
        Args: { p_agent_id?: string }
        Returns: {
          agent_id: string
          agent_name: string
          current_version: number
          reference_id: string
          reference_name: string
          reference_type: string
          version_pinned_to: number
          versions_behind: number
        }[]
      }
      agx_check_references: {
        Args: { p_agent_id: string }
        Returns: {
          is_behind: boolean
          reference_id: string
          reference_name: string
          reference_type: string
          use_latest: boolean
        }[]
      }
      agx_create_agent_from_template: {
        Args: { p_template_id: string }
        Returns: string
      }
      agx_create_shortcut: {
        Args: {
          p_agent_id: string
          p_category_id: string
          p_label: string
          p_organization_id?: string
          p_project_id?: string
          p_task_id?: string
          p_use_latest?: boolean
          p_user_id?: string
        }
        Returns: string
      }
      agx_duplicate_agent: {
        Args: { p_agent_id: string; p_as_system?: boolean }
        Returns: string
      }
      agx_duplicate_shortcut: {
        Args: { p_shortcut_id: string }
        Returns: string
      }
      agx_get_access_level: {
        Args: { p_agent_id: string }
        Returns: {
          access_level: string
          agent_id: string
          agent_name: string
          is_owner: boolean
          owner_email: string
          owner_id: string
        }[]
      }
      agx_get_defined_data: {
        Args: { p_agent_id: string }
        Returns: {
          definition_messages: number
          variable_definition_count: number
        }[]
      }
      agx_get_execution_full: {
        Args: { p_agent_id: string }
        Returns: {
          context_slots: Json
          custom_tools: Json
          id: string
          model_id: string
          settings: Json
          tools: string[]
          variable_definitions: Json
        }[]
      }
      agx_get_execution_minimal: {
        Args: { p_agent_id: string }
        Returns: {
          context_slots: Json
          id: string
          variable_definitions: Json
        }[]
      }
      agx_get_list: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          access_level: string
          agent_type: string
          category: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          is_archived: boolean
          is_favorite: boolean
          is_owner: boolean
          model_id: string
          name: string
          organization_id: string
          project_id: string
          shared_by_email: string
          source_agent_id: string
          tags: string[]
          task_id: string
          updated_at: string
          user_id: string
        }[]
      }
      agx_get_list_full: {
        Args: never
        Returns: {
          access_level: string
          agent_type: string
          category: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          is_archived: boolean
          is_favorite: boolean
          is_owner: boolean
          model_id: string
          name: string
          organization_id: string
          project_id: string
          shared_by_email: string
          source_agent_id: string
          tags: string[]
          task_id: string
          updated_at: string
          user_id: string
        }[]
      }
      agx_get_shared_for_chat: {
        Args: never
        Returns: {
          id: string
          name: string
          owner_email: string
          permission_level: string
        }[]
      }
      agx_get_shared_with_me: {
        Args: never
        Returns: {
          agent_type: string
          category: string
          created_at: string
          description: string
          id: string
          name: string
          owner_email: string
          owner_id: string
          permission_level: string
          tags: string[]
          updated_at: string
        }[]
      }
      agx_get_shortcuts_for_context: {
        Args: { p_project_id?: string; p_task_id?: string }
        Returns: {
          agent_context_slots: Json
          agent_id: string
          agent_name: string
          agent_variable_definitions: Json
          agent_version_id: string
          allow_chat: boolean
          auto_run: boolean
          bypass_gate_seconds: number
          category_id: string
          context_mappings: Json
          context_overrides: Json
          current_version: number
          default_user_input: string
          default_variables: Json
          description: string
          display_mode: string
          enabled_features: Json
          hide_reasoning: boolean
          hide_tool_results: boolean
          icon_name: string
          is_behind: boolean
          is_version: boolean
          keyboard_shortcut: string
          label: string
          llm_overrides: Json
          pre_execution_message: string
          resolved_id: string
          scope_mappings: Json
          shortcut_id: string
          shortcut_org_id: string
          shortcut_project_id: string
          shortcut_task_id: string
          shortcut_user_id: string
          show_definition_message_content: boolean
          show_definition_messages: boolean
          show_pre_execution_gate: boolean
          show_variable_panel: boolean
          sort_order: number
          use_latest: boolean
          variables_panel_style: string
        }[]
      }
      agx_get_shortcuts_initial: {
        Args: never
        Returns: {
          agent_context_slots: Json
          agent_id: string
          agent_name: string
          agent_variable_definitions: Json
          agent_version_id: string
          allow_chat: boolean
          auto_run: boolean
          bypass_gate_seconds: number
          category_id: string
          context_mappings: Json
          context_overrides: Json
          current_version: number
          default_user_input: string
          default_variables: Json
          description: string
          display_mode: string
          enabled_features: Json
          hide_reasoning: boolean
          hide_tool_results: boolean
          icon_name: string
          is_behind: boolean
          is_version: boolean
          keyboard_shortcut: string
          label: string
          llm_overrides: Json
          pre_execution_message: string
          resolved_id: string
          scope_mappings: Json
          shortcut_id: string
          shortcut_org_id: string
          shortcut_user_id: string
          show_definition_message_content: boolean
          show_definition_messages: boolean
          show_pre_execution_gate: boolean
          show_variable_panel: boolean
          sort_order: number
          use_latest: boolean
          variables_panel_style: string
        }[]
      }
      agx_get_user_context_tree: { Args: never; Returns: Json }
      agx_get_user_shortcuts: {
        Args: never
        Returns: {
          agent_id: string
          agent_name: string
          agent_version_id: string
          allow_chat: boolean
          auto_run: boolean
          bypass_gate_seconds: number
          category_id: string
          category_label: string
          context_mappings: Json
          context_overrides: Json
          created_at: string
          default_user_input: string
          default_variables: Json
          description: string
          display_mode: string
          enabled_features: Json
          hide_reasoning: boolean
          hide_tool_results: boolean
          icon_name: string
          id: string
          is_active: boolean
          keyboard_shortcut: string
          label: string
          llm_overrides: Json
          organization_id: string
          pre_execution_message: string
          project_id: string
          scope_mappings: Json
          scope_name: string
          scope_type: string
          show_definition_message_content: boolean
          show_definition_messages: boolean
          show_pre_execution_gate: boolean
          show_variable_panel: boolean
          sort_order: number
          task_id: string
          updated_at: string
          use_latest: boolean
          user_id: string
          variables_panel_style: string
        }[]
      }
      agx_get_version_history: {
        Args: { p_agent_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          change_note: string
          changed_at: string
          name: string
          version_id: string
          version_number: number
        }[]
      }
      agx_get_version_snapshot: {
        Args: { p_agent_id: string; p_version_number: number }
        Returns: {
          agent_type: string
          category: string
          change_note: string
          changed_at: string
          context_slots: Json
          custom_tools: Json
          description: string
          is_active: boolean
          mcp_servers: string[]
          messages: Json
          model_id: string
          model_tiers: Json
          name: string
          output_schema: Json
          settings: Json
          tags: string[]
          tools: string[]
          variable_definitions: Json
          version_id: string
          version_number: number
        }[]
      }
      agx_list_non_global_shortcuts_for_admin: {
        Args: never
        Returns: {
          agent_id: string
          agent_version_id: string
          allow_chat: boolean
          auto_run: boolean
          bypass_gate_seconds: number
          category_id: string
          context_mappings: Json
          context_overrides: Json
          created_at: string
          default_user_input: string
          default_variables: Json
          description: string
          display_mode: string
          enabled_features: Json
          hide_reasoning: boolean
          hide_tool_results: boolean
          icon_name: string
          id: string
          is_active: boolean
          keyboard_shortcut: string
          label: string
          llm_overrides: Json
          organization_id: string
          owner_display: string
          owner_email: string
          pre_execution_message: string
          project_id: string
          scope_mappings: Json
          scope_type: string
          show_definition_message_content: boolean
          show_definition_messages: boolean
          show_pre_execution_gate: boolean
          show_variable_panel: boolean
          sort_order: number
          task_id: string
          updated_at: string
          use_latest: boolean
          user_id: string
          variables_panel_style: string
        }[]
      }
      agx_promote_shortcut_to_global: {
        Args: {
          p_label?: string
          p_shortcut_id: string
          p_target_category_id: string
        }
        Returns: string
      }
      agx_promote_version: {
        Args: { p_agent_id: string; p_version_number: number }
        Returns: Json
      }
      agx_purge_versions: {
        Args: { p_agent_id: string; p_keep_count?: number }
        Returns: Json
      }
      agx_update_from_source: { Args: { p_agent_id: string }; Returns: Json }
      append_rows_to_user_table: {
        Args: { p_rows: Json; p_table_id: string }
        Returns: number
      }
      apply_template: {
        Args: { p_org_id: string; p_template_id: string }
        Returns: Json
      }
      apply_template_by_key: {
        Args: { p_org_id: string; p_template_key: string }
        Returns: Json
      }
      apply_template_definition: {
        Args: { p_definition: Json; p_org_id: string }
        Returns: Json
      }
      assign_random_colors_to_node_all_nodes: {
        Args: never
        Returns: undefined
      }
      assign_random_colors_to_nodes: { Args: never; Returns: undefined }
      assign_random_colors_to_nodes_without_color: {
        Args: never
        Returns: undefined
      }
      associate_with_task: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_label?: string
          p_metadata?: Json
          p_task_id: string
        }
        Returns: Json
      }
      auth_is_org_admin: {
        Args: { org_id: string; user_id: string }
        Returns: boolean
      }
      auth_is_org_member: {
        Args: { org_id: string; user_id: string }
        Returns: boolean
      }
      auth_is_org_owner: {
        Args: { org_id: string; user_id: string }
        Returns: boolean
      }
      auth_is_project_admin: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      auth_is_project_member: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      auth_is_project_owner: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      batch_update_rows_in_user_table: {
        Args: { p_table_id: string; p_updates: Json }
        Returns: Json
      }
      build_category_hierarchy: {
        Args: { p_placement_types: string[] }
        Returns: {
          menu_structure: Json
          placement_type: string
        }[]
      }
      bulk_upsert_broker_values: {
        Args: {
          p_ai_runs_id?: string
          p_ai_tasks_id?: string
          p_broker_value_pairs: Json
          p_created_by?: string
          p_is_global?: boolean
          p_organization_id?: string
          p_project_id?: string
          p_task_id?: string
          p_user_id?: string
        }
        Returns: {
          broker_id: string
          broker_value_id: string
          success: boolean
        }[]
      }
      calculate_trending_score: {
        Args: {
          p_comment_count: number
          p_completion_rate: number
          p_created_at: string
          p_featured: boolean
          p_fork_count: number
          p_like_count: number
          p_play_count: number
          p_share_count: number
          p_view_count: number
        }
        Returns: number
      }
      check_builtin_drift: {
        Args: { p_builtin_id?: string }
        Returns: {
          builtin_id: string
          builtin_name: string
          builtin_snapshot_at: string
          has_drift: boolean
          source_prompt_id: string
          source_prompt_name: string
          source_updated_at: string
        }[]
      }
      check_guest_execution_limit: {
        Args: { p_fingerprint: string; p_max_executions?: number }
        Returns: {
          allowed: boolean
          guest_id: string
          is_blocked: boolean
          remaining: number
          total_used: number
        }[]
      }
      check_org_slug_available: {
        Args: { slug_to_check: string }
        Returns: boolean
      }
      check_prompt_app_drift: {
        Args: { p_user_id?: string }
        Returns: {
          app_id: string
          app_name: string
          current_version: number
          pinned_version: number
          prompt_id: string
          prompt_name: string
          prompt_source_type: string
          versions_behind: number
        }[]
      }
      check_rate_limit: {
        Args: {
          p_app_id: string
          p_fingerprint?: string
          p_ip_address?: unknown
          p_user_id?: string
        }
        Returns: {
          allowed: boolean
          is_blocked: boolean
          remaining: number
          reset_at: string
        }[]
      }
      check_resource_access: {
        Args: {
          p_assignee_id?: string
          p_organization_id?: string
          p_owner_id?: string
          p_project_id?: string
          p_required_level: Database["public"]["Enums"]["permission_level"]
          p_resource_id: string
          p_resource_type: string
        }
        Returns: boolean
      }
      claim_feedback_item: {
        Args: {
          p_admin_notes?: string
          p_ai_assessment?: string
          p_autonomy_score?: number
          p_id: string
        }
        Returns: {
          admin_decision: string
          admin_direction: string | null
          admin_notes: string | null
          ai_assessment: string | null
          ai_complexity: string | null
          ai_estimated_files: string[] | null
          ai_solution_proposal: string | null
          ai_suggested_priority: string | null
          assigned_to: string | null
          autonomy_score: number | null
          category_id: string | null
          created_at: string
          description: string
          feedback_type: string
          has_open_issues: boolean
          id: string
          image_urls: string[] | null
          parent_id: string | null
          priority: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          route: string
          status: string
          testing_instructions: string | null
          testing_result: string | null
          testing_url: string | null
          updated_at: string
          user_confirmed_at: string | null
          user_id: string
          username: string | null
          work_priority: number | null
        }
        SetofOptions: {
          from: "*"
          to: "user_feedback"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cld_apply_usage_delta: {
        Args: {
          p_bytes_delta: number
          p_files_delta: number
          p_record_upload?: boolean
          p_upload_bytes?: number
          p_user_id: string
        }
        Returns: undefined
      }
      cld_bump_version: { Args: { p_file_id: string }; Returns: number }
      cld_check_rate_limit: {
        Args: { p_actor_id: string; p_kind: string; p_limit: number }
        Returns: Json
      }
      cld_check_upload_quota: {
        Args: { p_is_guest?: boolean; p_size_bytes: number; p_user_id: string }
        Returns: Json
      }
      cld_consume_share_link: { Args: { p_token: string }; Returns: Json }
      cld_count_user_files: {
        Args: {
          p_include_deleted?: boolean
          p_include_folders?: boolean
          p_user_id: string
        }
        Returns: Json
      }
      cld_ensure_folder_chain: {
        Args: { p_folder_path: string; p_owner_id: string }
        Returns: string
      }
      cld_get_effective_permission: {
        Args: { p_resource_id: string; p_user_id: string }
        Returns: string
      }
      cld_get_usage_status: {
        Args: { p_is_guest?: boolean; p_user_id: string }
        Returns: Json
      }
      cld_get_user_file_tree: {
        Args: {
          p_include_deleted?: boolean
          p_include_folders?: boolean
          p_limit?: number
          p_offset?: number
          p_order_by?: string
          p_user_id: string
        }
        Returns: Json
      }
      cld_get_user_limits: {
        Args: { p_is_guest?: boolean; p_user_id: string }
        Returns: Json
      }
      cld_hard_delete_file: { Args: { p_file_id: string }; Returns: Json }
      cld_list_trash: {
        Args: { p_limit?: number; p_offset?: number; p_user_id: string }
        Returns: Json
      }
      cld_migrate_guest_to_user: {
        Args: { p_guest_id: string; p_new_user_id: string }
        Returns: Json
      }
      cld_migrate_guest_to_user_safe: {
        Args: {
          p_fingerprint_hash: string
          p_guest_id: string
          p_new_user_id: string
        }
        Returns: Json
      }
      cld_prune_old_versions: {
        Args: { p_file_id: string; p_keep: number }
        Returns: Json
      }
      cld_rename_folder: {
        Args: {
          p_folder_id: string
          p_new_parent_id?: string
          p_new_path: string
        }
        Returns: Json
      }
      cld_restore_file: { Args: { p_file_id: string }; Returns: boolean }
      cld_restore_folder: { Args: { p_folder_id: string }; Returns: Json }
      cld_search_files: {
        Args: {
          p_limit?: number
          p_mime_prefix?: string
          p_offset?: number
          p_query: string
          p_user_id: string
        }
        Returns: Json
      }
      cld_soft_delete_file: { Args: { p_file_id: string }; Returns: boolean }
      cld_soft_delete_folder: { Args: { p_folder_id: string }; Returns: Json }
      cld_user_has_permission_grant: {
        Args: {
          p_min_level?: string
          p_resource_id: string
          p_resource_type: string
        }
        Returns: boolean
      }
      cld_user_in_group: { Args: { p_group_id: string }; Returns: boolean }
      cld_user_owns_file: { Args: { p_file_id: string }; Returns: boolean }
      cld_user_owns_folder: { Args: { p_folder_id: string }; Returns: boolean }
      cld_user_owns_group: { Args: { p_group_id: string }; Returns: boolean }
      cleanup_deleted_sandboxes: {
        Args: { retention_days?: number }
        Returns: number
      }
      cleanup_old_guest_records: { Args: never; Returns: number }
      cleanup_recipe_message_order: {
        Args: { recipe_id_param: string }
        Returns: undefined
      }
      close_feedback_item: {
        Args: { p_admin_notes?: string; p_id: string; p_status: string }
        Returns: {
          admin_decision: string
          admin_direction: string | null
          admin_notes: string | null
          ai_assessment: string | null
          ai_complexity: string | null
          ai_estimated_files: string[] | null
          ai_solution_proposal: string | null
          ai_suggested_priority: string | null
          assigned_to: string | null
          autonomy_score: number | null
          category_id: string | null
          created_at: string
          description: string
          feedback_type: string
          has_open_issues: boolean
          id: string
          image_urls: string[] | null
          parent_id: string | null
          priority: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          route: string
          status: string
          testing_instructions: string | null
          testing_result: string | null
          testing_url: string | null
          updated_at: string
          user_confirmed_at: string | null
          user_id: string
          username: string | null
          work_priority: number | null
        }
        SetofOptions: {
          from: "*"
          to: "user_feedback"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      convert_compiled_recipe_to_prompt: {
        Args: {
          p_compiled_recipe_id?: string
          p_recipe_id?: string
          p_user_id?: string
          p_version?: number
        }
        Returns: string
      }
      convert_db_fields_frontend_registered_function: {
        Args: {
          input_rows: Database["public"]["Tables"]["registered_function"]["Row"][]
        }
        Returns: Json
      }
      convert_db_fields_to_frontend_registered_function:
        | {
            Args: { input_json: Json }
            Returns: {
              p_class_name: string
              p_description: string
              p_id: string
              p_module_path: string
              p_name: string
              p_return_broker: string
            }[]
          }
        | {
            Args: {
              input_rows: Database["public"]["Tables"]["registered_function"]["Row"][]
            }
            Returns: Json
          }
      convert_frontend_fields_to_db_registered_function: {
        Args: { input_json: Json }
        Returns: {
          p_class_name: string
          p_description: string
          p_id: string
          p_module_path: string
          p_name: string
          p_return_broker: string
        }[]
      }
      convert_frontend_to_db_fields: {
        Args: { input_json: Json }
        Returns: {
          p_class_name: string
          p_description: string
          p_id: string
          p_module_path: string
          p_name: string
          p_return_broker: string
        }[]
      }
      convert_frontend_to_db_fields_registered_function: {
        Args: { input_json: Json }
        Returns: {
          p_class_name: string
          p_description: string
          p_id: string
          p_module_path: string
          p_name: string
          p_return_broker: string
        }[]
      }
      convert_prompt_to_builtin: {
        Args: { p_created_by_user_id?: string; p_prompt_id: string }
        Returns: string
      }
      convert_public_registered_function_fields: {
        Args: {
          input_rows: Database["public"]["Tables"]["registered_function"]["Row"][]
        }
        Returns: Json
      }
      convert_recipe_and_bind_to_applet: {
        Args: {
          p_applet_config_id: string
          p_compiled_recipe_id?: string
          p_recipe_id?: string
          p_user_id: string
          p_version?: number
        }
        Returns: Json
      }
      convert_registered_function_to_frontend: {
        Args: {
          input_row: Database["public"]["Tables"]["registered_function"]["Row"]
        }
        Returns: Json
      }
      create_agent_task: {
        Args: {
          p_agent_id?: string
          p_auth_mode?: string
          p_description?: string
          p_expires_at?: string
          p_max_concurrent?: number
          p_max_runtime_seconds?: number
          p_next_due_at?: string
          p_persistent_conversation_id?: string
          p_prompt: string
          p_queue?: string
          p_surfaces?: string[]
          p_tags?: string[]
          p_title: string
          p_trigger_config: Json
          p_trigger_type: string
          p_variables?: Json
        }
        Returns: string
      }
      create_arg: {
        Args: {
          p_data_type: Database["public"]["Enums"]["data_type"]
          p_default_value: string
          p_name: string
          p_ready: boolean
          p_registered_function: string
          p_required: boolean
        }
        Returns: string
      }
      create_bundle_with_lister: {
        Args: {
          p_bundle_name: string
          p_description?: string
          p_is_system?: boolean
          p_members?: Json
          p_metadata?: Json
        }
        Returns: Json
      }
      create_component_group: {
        Args: {
          p_description?: string
          p_field_ids?: string[]
          p_help_text?: string
          p_hide_description?: boolean
          p_label: string
          p_short_label?: string
        }
        Returns: string
      }
      create_context_item: {
        Args: {
          p_category?: string
          p_description?: string
          p_display_name: string
          p_fetch_hint?: Database["public"]["Enums"]["context_fetch_hint"]
          p_key: string
          p_scope_type_id: string
          p_sensitivity?: Database["public"]["Enums"]["context_sensitivity"]
          p_tags?: string[]
          p_value_type: Database["public"]["Enums"]["context_value_type"]
        }
        Returns: Json
      }
      create_new_user_table: {
        Args: {
          p_authenticated_read?: boolean
          p_description: string
          p_initial_fields?: Json
          p_is_public: boolean
          p_table_name: string
        }
        Returns: Json
      }
      create_new_user_table_dynamic: {
        Args: {
          p_authenticated_read?: boolean
          p_description: string
          p_initial_fields?: Json
          p_is_public: boolean
          p_table_name: string
        }
        Returns: Json
      }
      create_new_user_table_wrapper: {
        Args: {
          p_authenticated_read?: boolean
          p_description: string
          p_initial_fields?: Json
          p_is_public: boolean
          p_table_name: string
        }
        Returns: Json
      }
      create_registered_function: {
        Args: {
          p_class_name: string
          p_description: string
          p_module_path: string
          p_name: string
          p_return_broker: string
        }
        Returns: string
      }
      create_registered_function_with_args: {
        Args: {
          p_args: Json
          p_class_name: string
          p_description: string
          p_module_path: string
          p_name: string
          p_return_broker: string
        }
        Returns: string
      }
      create_related_records: { Args: { input_data: Json }; Returns: Json }
      create_scope: {
        Args: {
          p_description?: string
          p_name: string
          p_org_id: string
          p_parent_scope_id?: string
          p_settings?: Json
          p_type_id: string
        }
        Returns: Json
      }
      create_scope_type: {
        Args: {
          p_default_variable_keys?: string[]
          p_description?: string
          p_icon?: string
          p_label_plural: string
          p_label_singular: string
          p_max_assignments?: number
          p_org_id: string
          p_parent_type_id?: string
          p_sort_order?: number
        }
        Returns: Json
      }
      create_shortcut_from_agent_surface: {
        Args: {
          p_agent_surface_id: string
          p_category_id: string
          p_organization_id?: string
          p_overrides?: Json
          p_project_id?: string
          p_task_id?: string
          p_user_id?: string
        }
        Returns: string
      }
      create_task_with_association: {
        Args: {
          p_description?: string
          p_due_date?: string
          p_entity_id?: string
          p_entity_type?: string
          p_label?: string
          p_metadata?: Json
          p_organization_id?: string
          p_priority?: string
          p_project_id?: string
          p_scope_ids?: string[]
          p_title: string
        }
        Returns: Json
      }
      create_tasks_bulk: {
        Args: {
          p_entity_id?: string
          p_entity_type?: string
          p_items: Json
          p_metadata?: Json
          p_organization_id?: string
          p_project_id?: string
          p_scope_ids?: string[]
        }
        Returns: Json
      }
      create_user_list: {
        Args: {
          p_authenticated_read?: boolean
          p_description: string
          p_is_public: boolean
          p_items?: Json
          p_list_name: string
          p_public_read?: boolean
          p_user_id: string
        }
        Returns: Json
      }
      create_user_table_with_fields: {
        Args: {
          p_description?: string
          p_fields?: Json
          p_is_public?: boolean
          p_organization_id?: string
          p_project_id?: string
          p_table_name: string
          p_task_id?: string
        }
        Returns: string
      }
      ctx_seed_template: { Args: { p_template: Json }; Returns: string }
      cx_canvas_archive: {
        Args: { p_canvas_id: string; p_include_versions?: boolean }
        Returns: undefined
      }
      cx_canvas_create_manual: {
        Args: {
          p_content: Json
          p_conversation_id?: string
          p_source_message_id?: string
          p_source_type?: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: {
          artifact_index: number | null
          content: Json
          content_hash: string | null
          conversation_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_archived: boolean | null
          is_favorited: boolean | null
          is_public: boolean | null
          last_accessed_at: string | null
          organization_id: string | null
          parent_canvas_id: string | null
          project_id: string | null
          session_id: string | null
          share_token: string | null
          source_message_id: string | null
          source_type: string
          tags: string[] | null
          task_id: string | null
          title: string | null
          type: string
          updated_at: string | null
          user_id: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "canvas_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cx_canvas_get_by_message: {
        Args: { p_message_id: string }
        Returns: {
          artifact_index: number | null
          content: Json
          content_hash: string | null
          conversation_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_archived: boolean | null
          is_favorited: boolean | null
          is_public: boolean | null
          last_accessed_at: string | null
          organization_id: string | null
          parent_canvas_id: string | null
          project_id: string | null
          session_id: string | null
          share_token: string | null
          source_message_id: string | null
          source_type: string
          tags: string[] | null
          task_id: string | null
          title: string | null
          type: string
          updated_at: string | null
          user_id: string
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "canvas_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cx_canvas_get_conversation_latest: {
        Args: { p_conversation_id: string }
        Returns: {
          artifact_index: number | null
          content: Json
          content_hash: string | null
          conversation_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_archived: boolean | null
          is_favorited: boolean | null
          is_public: boolean | null
          last_accessed_at: string | null
          organization_id: string | null
          parent_canvas_id: string | null
          project_id: string | null
          session_id: string | null
          share_token: string | null
          source_message_id: string | null
          source_type: string
          tags: string[] | null
          task_id: string | null
          title: string | null
          type: string
          updated_at: string | null
          user_id: string
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "canvas_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cx_canvas_get_version_history: {
        Args: { p_canvas_id: string }
        Returns: {
          artifact_index: number | null
          content: Json
          content_hash: string | null
          conversation_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_archived: boolean | null
          is_favorited: boolean | null
          is_public: boolean | null
          last_accessed_at: string | null
          organization_id: string | null
          parent_canvas_id: string | null
          project_id: string | null
          session_id: string | null
          share_token: string | null
          source_message_id: string | null
          source_type: string
          tags: string[] | null
          task_id: string | null
          title: string | null
          type: string
          updated_at: string | null
          user_id: string
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "canvas_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cx_canvas_list_by_user: {
        Args: {
          p_is_favorited?: boolean
          p_limit?: number
          p_offset?: number
          p_source_type?: string
          p_type?: string
          p_user_id: string
        }
        Returns: {
          artifact_index: number | null
          content: Json
          content_hash: string | null
          conversation_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_archived: boolean | null
          is_favorited: boolean | null
          is_public: boolean | null
          last_accessed_at: string | null
          organization_id: string | null
          parent_canvas_id: string | null
          project_id: string | null
          session_id: string | null
          share_token: string | null
          source_message_id: string | null
          source_type: string
          tags: string[] | null
          task_id: string | null
          title: string | null
          type: string
          updated_at: string | null
          user_id: string
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "canvas_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cx_canvas_publish: {
        Args: { p_canvas_id: string; p_visibility?: string }
        Returns: {
          allow_remixes: boolean | null
          average_score: number | null
          canvas_data: Json
          canvas_type: string
          categories: string[] | null
          comment_count: number | null
          completion_rate: number | null
          created_at: string | null
          created_by: string | null
          creator_display_name: string | null
          creator_username: string | null
          description: string | null
          featured: boolean | null
          fork_count: number | null
          forked_from: string | null
          has_scoring: boolean | null
          high_score: number | null
          high_score_user: string | null
          id: string
          last_played_at: string | null
          like_count: number | null
          original_id: string | null
          play_count: number | null
          published_at: string | null
          require_attribution: boolean | null
          search_vector: unknown
          share_count: number | null
          share_token: string
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          total_attempts: number | null
          trending_score: number | null
          updated_at: string | null
          version_number: number | null
          view_count: number | null
          visibility: string | null
        }
        SetofOptions: {
          from: "*"
          to: "shared_canvas_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cx_canvas_toggle_favorite: {
        Args: { p_canvas_id: string }
        Returns: boolean
      }
      cx_canvas_update_version: {
        Args: {
          p_artifact_index: number
          p_content: Json
          p_new_message_id: string
          p_original_canvas_id: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: {
          artifact_index: number | null
          content: Json
          content_hash: string | null
          conversation_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_archived: boolean | null
          is_favorited: boolean | null
          is_public: boolean | null
          last_accessed_at: string | null
          organization_id: string | null
          parent_canvas_id: string | null
          project_id: string | null
          session_id: string | null
          share_token: string | null
          source_message_id: string | null
          source_type: string
          tags: string[] | null
          task_id: string | null
          title: string | null
          type: string
          updated_at: string | null
          user_id: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "canvas_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cx_canvas_upsert: {
        Args: {
          p_artifact_index: number
          p_content: Json
          p_conversation_id?: string
          p_message_id: string
          p_source_type?: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: {
          artifact_index: number | null
          content: Json
          content_hash: string | null
          conversation_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_archived: boolean | null
          is_favorited: boolean | null
          is_public: boolean | null
          last_accessed_at: string | null
          organization_id: string | null
          parent_canvas_id: string | null
          project_id: string | null
          session_id: string | null
          share_token: string | null
          source_message_id: string | null
          source_type: string
          tags: string[] | null
          task_id: string | null
          title: string | null
          type: string
          updated_at: string | null
          user_id: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "canvas_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cx_code_history_upsert: { Args: { p_payload: Json }; Returns: Json }
      cx_fork_conversation: {
        Args: { p_at_position: number; p_conversation_id: string }
        Returns: Json
      }
      cx_message_edit: {
        Args: { p_message_id: string; p_new_content: Json }
        Returns: {
          agent_id: string | null
          content: Json
          content_chars: number
          content_history: Json | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          id: string
          is_visible_to_model: boolean
          is_visible_to_user: boolean
          metadata: Json
          position: number
          role: string
          source: string
          status: string
          tool_results_chars: number
          user_content: Json | null
        }
        SetofOptions: {
          from: "*"
          to: "cx_message"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cx_soft_delete_conversation: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      decrypt_mcp_token: { Args: { p_encrypted: string }; Returns: string }
      delete_arg: { Args: { p_arg_id: string }; Returns: undefined }
      delete_by_id: {
        Args: { p_ids: string[]; p_table_name: string }
        Returns: Json
      }
      delete_conversation_for_user: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      delete_data_row_from_user_table: {
        Args: { p_row_id: string }
        Returns: Json
      }
      delete_registered_function: {
        Args: { p_function_id: string }
        Returns: undefined
      }
      delete_scope: { Args: { p_scope_id: string }; Returns: Json }
      delete_scope_type: { Args: { p_type_id: string }; Returns: Json }
      delete_sensitive_item: { Args: { p_item_id: string }; Returns: boolean }
      delete_unused_message_templates: {
        Args: never
        Returns: {
          deleted_count: number
          deleted_templates: Database["public"]["Tables"]["message_template"]["Row"][]
        }[]
      }
      delete_user_table: { Args: { p_table_id: string }; Returns: Json }
      disconnect_mcp_server: {
        Args: { p_server_id: string }
        Returns: undefined
      }
      dissociate_from_task: {
        Args: { p_entity_id: string; p_entity_type: string; p_task_id: string }
        Returns: Json
      }
      duplicate_row: {
        Args: {
          p_excluded_columns?: string[]
          p_source_id: string
          p_table_name: string
        }
        Returns: Json
      }
      dynamic_search: {
        Args: {
          p_page_number?: number
          p_page_size?: number
          p_search_field: string
          p_search_value: string
          p_table_name: string
        }
        Returns: {
          result: Json
          total_count: number
        }[]
      }
      encrypt_mcp_token: { Args: { p_plaintext: string }; Returns: string }
      execute_admin_query: { Args: { query: string }; Returns: Json }
      execute_complex_save: {
        Args: { operations: Json; options?: Json }
        Returns: Json
      }
      execute_safe_query: { Args: { query: string }; Returns: Json }
      expand_archetype: {
        Args: { p_archetype: string; p_choices?: Json }
        Returns: Json
      }
      expire_stale_tunnels: { Args: never; Returns: undefined }
      export_user_table_as_csv:
        | { Args: { p_table_id: string }; Returns: string }
        | {
            Args: {
              p_sort_direction?: string
              p_sort_field?: string
              p_table_id: string
            }
            Returns: string
          }
      feedback_get_admin_info: {
        Args: { p_user_id: string }
        Returns: {
          display_name: string
          email: string
          level: Database["public"]["Enums"]["admin_level"]
          user_id: string
        }[]
      }
      fetch_all_action: {
        Args: never
        Returns: {
          id: string
          matrix: string
          name: string
          node_type: string
          reference_id: string
          transformer: string
        }[]
      }
      fetch_all_ai_endpoint: {
        Args: never
        Returns: {
          additional_cost: boolean
          cost_details: Json
          description: string
          id: string
          name: string
          params: Json
          provider: string
        }[]
      }
      fetch_all_ai_model: {
        Args: never
        Returns: {
          capabilities: Json
          class: string
          common_name: string
          context_window: number
          controls: Json
          endpoints: Json
          id: string
          max_tokens: number
          name: string
          provider: string
        }[]
      }
      fetch_all_arg: {
        Args: never
        Returns: {
          data_type: Database["public"]["Enums"]["data_type"]
          default: string
          id: string
          name: string
          ready: boolean
          registered_function: string
          required: boolean
        }[]
      }
      fetch_all_automation_boundary_brokers: {
        Args: never
        Returns: {
          beacon_destination: Database["public"]["Enums"]["data_destination"]
          broker: string
          id: string
          matrix: string
          spark_source: Database["public"]["Enums"]["data_source"]
        }[]
      }
      fetch_all_automation_matrix: {
        Args: never
        Returns: {
          average_seconds: number
          cognition_matrices: Database["public"]["Enums"]["cognition_matrices"]
          description: string
          id: string
          is_automated: boolean
          name: string
        }[]
      }
      fetch_all_broker: {
        Args: never
        Returns: {
          additional_params: Json
          custom_source_component: string
          data_type: Database["public"]["Enums"]["data_type"]
          default_destination: Database["public"]["Enums"]["data_destination"]
          default_source: Database["public"]["Enums"]["data_source"]
          description: string
          display_name: string
          id: string
          name: string
          other_source_params: Json
          output_component: Database["public"]["Enums"]["destination_component"]
          ready: boolean
          sample_entries: string
          tags: Json
          tooltip: string
          validation_rules: Json
          value: Json
        }[]
      }
      fetch_all_data_output_component: {
        Args: never
        Returns: {
          additional_params: Json
          component_type: Database["public"]["Enums"]["destination_component"]
          id: string
          props: Json
          ui_component: string
        }[]
      }
      fetch_all_display_option: {
        Args: never
        Returns: {
          additional_params: Json
          customizable_params: Json
          default_params: Json
          id: string
          name: string
        }[]
      }
      fetch_all_extractor: {
        Args: never
        Returns: {
          default_identifier: string
          default_index: number
          id: string
          name: string
          output_type: Database["public"]["Enums"]["data_type"]
        }[]
      }
      fetch_all_fk_ifk: {
        Args: { p_primary_key_values: Json; p_table_name: string }
        Returns: Json
      }
      fetch_all_fk_ifk_direct: {
        Args: { p_primary_key_values: Json; p_table_name: string }
        Returns: Json
      }
      fetch_all_fk_ifk_with_list: {
        Args: { p_id: string; p_table_name: string }
        Returns: Json
      }
      fetch_all_id_name_arg: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      fetch_all_id_name_broker: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      fetch_all_id_name_registered_function: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      fetch_all_processors: {
        Args: never
        Returns: {
          default_extractors: Json
          depends_default: string
          id: string
          name: string
          params: Json
        }[]
      }
      fetch_all_recipe: {
        Args: never
        Returns: {
          description: string
          id: string
          is_public: boolean
          messages: Json[]
          name: string
          post_result_options: Json
          sample_output: string
          status: Database["public"]["Enums"]["recipe_status"]
          tags: Json
          version: number
        }[]
      }
      fetch_all_recipe_broker: {
        Args: never
        Returns: {
          broker: string
          broker_role: Database["public"]["Enums"]["broker_role"]
          id: string
          recipe: string
          required: boolean
        }[]
      }
      fetch_all_recipe_display: {
        Args: never
        Returns: {
          display: string
          display_settings: Json
          id: string
          priority: number
          recipe: string
        }[]
      }
      fetch_all_recipe_function: {
        Args: never
        Returns: {
          function: string
          id: string
          params: Json
          recipe: string
          role: Database["public"]["Enums"]["function_role"]
        }[]
      }
      fetch_all_recipe_model: {
        Args: never
        Returns: {
          ai_model: string
          id: string
          priority: number
          recipe: string
          role: Database["public"]["Enums"]["model_role"]
        }[]
      }
      fetch_all_recipe_processors: {
        Args: never
        Returns: {
          id: string
          params: Json
          processor: string
          recipe: string
        }[]
      }
      fetch_all_recipe_tools: {
        Args: never
        Returns: {
          id: string
          params: Json
          recipe: string
          tool: string
        }[]
      }
      fetch_all_registered_function: {
        Args: never
        Returns: {
          class_name: string
          description: string
          id: string
          module_path: string
          name: string
          return_broker: string
        }[]
      }
      fetch_all_registered_function_formatted: { Args: never; Returns: Json }
      fetch_all_registered_functions: { Args: never; Returns: Json }
      fetch_all_system_function: {
        Args: never
        Returns: {
          description: string
          id: string
          input_params: Json
          output_options: Json
          public_name: string
          rf_id: string
          sample: string
        }[]
      }
      fetch_all_tool: {
        Args: never
        Returns: {
          additional_params: Json
          description: string
          id: string
          name: string
          parameters: Json
          required_args: Json
          source: Json
          system_function: string
        }[]
      }
      fetch_all_transformers: {
        Args: never
        Returns: {
          id: string
          input_params: Json
          name: string
          ourput_params: Json
        }[]
      }
      fetch_all_with_children: { Args: { p_table_name: string }; Returns: Json }
      fetch_app_and_applet_config: {
        Args: { p_id?: string; p_slug?: string }
        Returns: Json
      }
      fetch_by_id_action: {
        Args: { record_id: string }
        Returns: {
          id: string
          matrix: string
          name: string
          node_type: string
          reference_id: string
          transformer: string
        }[]
      }
      fetch_by_id_ai_endpoint: {
        Args: { record_id: string }
        Returns: {
          additional_cost: boolean
          cost_details: Json
          description: string
          id: string
          name: string
          params: Json
          provider: string
        }[]
      }
      fetch_by_id_ai_model: {
        Args: { record_id: string }
        Returns: {
          capabilities: Json
          class: string
          common_name: string
          context_window: number
          controls: Json
          endpoints: Json
          id: string
          max_tokens: number
          name: string
          provider: string
        }[]
      }
      fetch_by_id_arg: {
        Args: { record_id: string }
        Returns: {
          data_type: Database["public"]["Enums"]["data_type"]
          default: string
          id: string
          name: string
          ready: boolean
          registered_function: string
          required: boolean
        }[]
      }
      fetch_by_id_automation_boundary_brokers: {
        Args: { record_id: string }
        Returns: {
          beacon_destination: Database["public"]["Enums"]["data_destination"]
          broker: string
          id: string
          matrix: string
          spark_source: Database["public"]["Enums"]["data_source"]
        }[]
      }
      fetch_by_id_automation_matrix: {
        Args: { record_id: string }
        Returns: {
          average_seconds: number
          cognition_matrices: Database["public"]["Enums"]["cognition_matrices"]
          description: string
          id: string
          is_automated: boolean
          name: string
        }[]
      }
      fetch_by_id_broker: {
        Args: { record_id: string }
        Returns: {
          additional_params: Json
          custom_source_component: string
          data_type: Database["public"]["Enums"]["data_type"]
          default_destination: Database["public"]["Enums"]["data_destination"]
          default_source: Database["public"]["Enums"]["data_source"]
          description: string
          display_name: string
          id: string
          name: string
          other_source_params: Json
          output_component: Database["public"]["Enums"]["destination_component"]
          ready: boolean
          sample_entries: string
          tags: Json
          tooltip: string
          validation_rules: Json
          value: Json
        }[]
      }
      fetch_by_id_broker_simple: {
        Args: { p_record_id: string }
        Returns: {
          id: string
        }[]
      }
      fetch_by_id_data_output_component: {
        Args: { record_id: string }
        Returns: {
          additional_params: Json
          component_type: Database["public"]["Enums"]["destination_component"]
          id: string
          props: Json
          ui_component: string
        }[]
      }
      fetch_by_id_display_option: {
        Args: { record_id: string }
        Returns: {
          additional_params: Json
          customizable_params: Json
          default_params: Json
          id: string
          name: string
        }[]
      }
      fetch_by_id_extractor: {
        Args: { record_id: string }
        Returns: {
          default_identifier: string
          default_index: number
          id: string
          name: string
          output_type: Database["public"]["Enums"]["data_type"]
        }[]
      }
      fetch_by_id_fe_registered_function: {
        Args: { record_id: string }
        Returns: Json
      }
      fetch_by_id_processors: {
        Args: { record_id: string }
        Returns: {
          default_extractors: Json
          depends_default: string
          id: string
          name: string
          params: Json
        }[]
      }
      fetch_by_id_recipe: {
        Args: { record_id: string }
        Returns: {
          description: string
          id: string
          is_public: boolean
          messages: Json[]
          name: string
          post_result_options: Json
          sample_output: string
          status: Database["public"]["Enums"]["recipe_status"]
          tags: Json
          version: number
        }[]
      }
      fetch_by_id_recipe_broker: {
        Args: { record_id: string }
        Returns: {
          broker: string
          broker_role: Database["public"]["Enums"]["broker_role"]
          id: string
          recipe: string
          required: boolean
        }[]
      }
      fetch_by_id_recipe_display: {
        Args: { record_id: string }
        Returns: {
          display: string
          display_settings: Json
          id: string
          priority: number
          recipe: string
        }[]
      }
      fetch_by_id_recipe_function: {
        Args: { record_id: string }
        Returns: {
          function: string
          id: string
          params: Json
          recipe: string
          role: Database["public"]["Enums"]["function_role"]
        }[]
      }
      fetch_by_id_recipe_model: {
        Args: { record_id: string }
        Returns: {
          ai_model: string
          id: string
          priority: number
          recipe: string
          role: Database["public"]["Enums"]["model_role"]
        }[]
      }
      fetch_by_id_recipe_processors: {
        Args: { record_id: string }
        Returns: {
          id: string
          params: Json
          processor: string
          recipe: string
        }[]
      }
      fetch_by_id_recipe_tools: {
        Args: { record_id: string }
        Returns: {
          id: string
          params: Json
          recipe: string
          tool: string
        }[]
      }
      fetch_by_id_registered_function: {
        Args: { record_id: string }
        Returns: {
          class_name: string
          description: string
          id: string
          module_path: string
          name: string
          return_broker: string
        }[]
      }
      fetch_by_id_registered_function_formatted: {
        Args: { record_id: string }
        Returns: Json
      }
      fetch_by_id_system_function: {
        Args: { record_id: string }
        Returns: {
          description: string
          id: string
          input_params: Json
          output_options: Json
          public_name: string
          rf_id: string
          sample: string
        }[]
      }
      fetch_by_id_tool: {
        Args: { record_id: string }
        Returns: {
          additional_params: Json
          description: string
          id: string
          name: string
          parameters: Json
          required_args: Json
          source: Json
          system_function: string
        }[]
      }
      fetch_by_id_transformers: {
        Args: { record_id: string }
        Returns: {
          id: string
          input_params: Json
          name: string
          ourput_params: Json
        }[]
      }
      fetch_custom_rels: {
        Args: { p_id: string; p_table_list: string[]; p_table_name: string }
        Returns: Json
      }
      fetch_emails: {
        Args: never
        Returns: {
          body: string
          id: string
          is_read: boolean | null
          recipient: string
          sender: string
          subject: string
          timestamp: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "emails"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fetch_filtered: {
        Args: { p_filters: Json; p_table_name: string }
        Returns: Json
      }
      fetch_filtered_with_fk_ifk:
        | { Args: { p_filters: Json; p_table_name: string }; Returns: Json }
        | {
            Args: {
              p_filters: Json
              p_include_fk?: boolean
              p_include_ifk?: boolean
              p_table_name: string
            }
            Returns: Json
          }
      fetch_foreign_key_info: {
        Args: never
        Returns: {
          source_column: string
          source_table: string
          target_column: string
          target_data: Json
          target_table: string
        }[]
      }
      fetch_id_name_arg: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      fetch_id_name_public_registered_function: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      fetch_id_name_registered_function: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      fetch_paginated: {
        Args: { p_page: number; p_page_size: number; p_table_name: string }
        Returns: Json[]
      }
      fetch_paginated_registered_functions: {
        Args: { count: number; page: number }
        Returns: Json
      }
      fetch_paginated_with_all_ids: {
        Args: {
          p_conversion_function?: string
          p_include_all_ids?: boolean
          p_page: number
          p_page_size: number
          p_table_name: string
        }
        Returns: Json
      }
      fetch_paginated_with_ids_names: {
        Args: {
          p_conversion_function?: string
          p_include_all_ids?: boolean
          p_page: number
          p_page_size: number
          p_table_name: string
        }
        Returns: Json
      }
      fetch_with_all_fk_and_ifk_children: {
        Args: { p_id: string; p_table_name: string }
        Returns: Json
      }
      fetch_with_children: {
        Args: { p_id: string; p_table_name: string }
        Returns: Json
      }
      fetch_with_children_and_parents_new: {
        Args: { p_id: string; p_table_name: string }
        Returns: Json
      }
      fetch_with_children_new: {
        Args: { p_id: string; p_table_name: string }
        Returns: Json
      }
      fetch_with_fk: {
        Args: { p_id: string; p_table_name: string }
        Returns: Json
      }
      fetch_with_ifk: {
        Args: { p_id: string; p_table_name: string }
        Returns: Json
      }
      find_dm_direct_conversation: {
        Args: { p_user1_id: string; p_user2_id: string }
        Returns: string
      }
      find_fk_entries: {
        Args: { p_id: string; p_table_name: string }
        Returns: {
          fk_column_name: string
          referenced_column_name: string
          referenced_entry: Json
          referenced_table_name: string
        }[]
      }
      find_ifk_entries: {
        Args: { p_id: string; p_limit?: number; p_table_name: string }
        Returns: {
          related_column_name: string
          related_entry: Json
          related_table_name: string
        }[]
      }
      fn_get_user_usage_snapshot: {
        Args: { p_user_id: string }
        Returns: {
          auth_type: string
          blocked_reason: string
          cost_24h_mcents: number
          cost_6h_mcents: number
          daily_blocked: boolean
          requests_24h: number
          requests_6h: number
          tokens_24h: number
          tokens_6h: number
          window_24h_starts_at: string
          window_6h_starts_at: string
          window_blocked: boolean
        }[]
      }
      generate_canvas_content_hash: {
        Args: { content_data: Json }
        Returns: string
      }
      generate_invitation_code: { Args: never; Returns: string }
      generate_invitation_token: { Args: never; Returns: string }
      get_admin_status: {
        Args: never
        Returns: {
          admin_level: Database["public"]["Enums"]["admin_level"]
          is_admin: boolean
        }[]
      }
      get_aga_public_data: {
        Args: { p_app_id?: string; p_slug?: string }
        Returns: {
          agent_id: string
          agent_version_id: string
          allowed_imports: Json
          category: string
          component_code: string
          component_language: string
          description: string
          favicon_url: string
          id: string
          layout_config: Json
          name: string
          preview_image_url: string
          shell_config: Json
          shell_kind: string
          slot_code: Json
          slot_overrides: Json
          slug: string
          styling_config: Json
          success_rate: number
          tagline: string
          tags: string[]
          total_executions: number
          use_latest: boolean
          variable_schema: Json
        }[]
      }
      get_agent_conversations: {
        Args: {
          p_agent_id: string
          p_limit?: number
          p_offset?: number
          p_version_number?: number
        }
        Returns: {
          agent_version_number: number
          conversation_id: string
          created_at: string
          description: string
          initial_agent_version_id: string
          is_favorite: boolean
          last_model_id: string
          message_count: number
          source_app: string
          source_feature: string
          status: string
          title: string
          updated_at: string
        }[]
      }
      get_agent_core_batch: {
        Args: { p_ids: string[]; p_sources: string[] }
        Returns: {
          category: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          is_archived: boolean
          is_favorite: boolean
          name: string
          output_format: string
          source: string
          tags: string[]
          updated_at: string
          version: number
        }[]
      }
      get_agent_operational: {
        Args: { p_id: string; p_source: string }
        Returns: {
          dynamic_model: boolean
          id: string
          settings: Json
          source: string
          variable_defaults: Json
        }[]
      }
      get_agent_usage_stats: {
        Args: { p_agent_id: string; p_version_number?: number }
        Returns: {
          avg_duration_ms: number
          first_used_at: string
          last_used_at: string
          total_conversations: number
          total_cost: number
          total_executions: number
          total_input_tokens: number
          total_output_tokens: number
          total_tokens: number
        }[]
      }
      get_agent_work_queue: {
        Args: never
        Returns: {
          admin_decision: string
          admin_direction: string | null
          admin_notes: string | null
          ai_assessment: string | null
          ai_complexity: string | null
          ai_estimated_files: string[] | null
          ai_solution_proposal: string | null
          ai_suggested_priority: string | null
          assigned_to: string | null
          autonomy_score: number | null
          category_id: string | null
          created_at: string
          description: string
          feedback_type: string
          has_open_issues: boolean
          id: string
          image_urls: string[] | null
          parent_id: string | null
          priority: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          route: string
          status: string
          testing_instructions: string | null
          testing_result: string | null
          testing_url: string | null
          updated_at: string
          user_confirmed_at: string | null
          user_id: string
          username: string | null
          work_priority: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "user_feedback"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_agents_for_chat: {
        Args: { p_cursor?: string; p_limit?: number }
        Returns: {
          id: string
          name: string
          source: string
        }[]
      }
      get_applet_with_recipe: {
        Args: { p_applet_id: string; p_compiled_recipe_id: string }
        Returns: Json
      }
      get_arg_by_id: {
        Args: { p_arg_id: string }
        Returns: {
          data_type: Database["public"]["Enums"]["data_type"]
          default_value: string
          id: string
          name: string
          ready: boolean
          registered_function: string
          required: boolean
        }[]
      }
      get_args_for_function: {
        Args: { p_function_id: string }
        Returns: {
          data_type: Database["public"]["Enums"]["data_type"]
          default_value: string
          id: string
          name: string
          ready: boolean
          required: boolean
        }[]
      }
      get_broker_values_for_context:
        | {
            Args: {
              p_broker_ids: string[]
              p_organization_id?: string
              p_project_id?: string
              p_task_id?: string
            }
            Returns: {
              broker_id: string
              scope_id: string
              scope_level: string
              value: Json
            }[]
          }
        | {
            Args: {
              p_ai_runs_id?: string
              p_ai_tasks_id?: string
              p_broker_ids: string[]
              p_organization_id?: string
              p_project_id?: string
              p_task_id?: string
              p_user_id?: string
            }
            Returns: {
              broker_id: string
              scope_id: string
              scope_level: string
              value: Json
            }[]
          }
      get_canvas_leaderboard: {
        Args: { p_canvas_id: string; p_limit?: number }
        Returns: {
          created_at: string
          display_name: string
          rank: number
          score: number
          time_taken: number
          username: string
        }[]
      }
      get_complete_broker_data_for_context:
        | {
            Args: {
              p_broker_ids: string[]
              p_organization_id?: string
              p_project_id?: string
              p_task_id?: string
            }
            Returns: {
              broker_id: string
              broker_name: string
              data_type: string
              default_value: string
              description: string
              has_value: boolean
              scope_id: string
              scope_level: string
              value: Json
            }[]
          }
        | {
            Args: {
              p_ai_runs_id?: string
              p_ai_tasks_id?: string
              p_broker_ids: string[]
              p_organization_id?: string
              p_project_id?: string
              p_task_id?: string
              p_user_id?: string
            }
            Returns: {
              broker_id: string
              broker_name: string
              data_type: string
              default_value: string
              description: string
              has_value: boolean
              scope_id: string
              scope_level: string
              value: Json
            }[]
          }
      get_conversation_for_display: {
        Args: { p_conversation_id: string }
        Returns: {
          conv_created_at: string
          conv_description: string
          conv_id: string
          conv_is_public: boolean
          conv_last_model_id: string
          conv_message_count: number
          conv_status: string
          conv_title: string
          conv_updated_at: string
          conv_variables: Json
          msg_agent_id: string
          msg_created_at: string
          msg_display_content: Json
          msg_id: string
          msg_metadata: Json
          msg_position: number
          msg_role: string
          msg_source: string
          msg_status: string
        }[]
      }
      get_conversation_messages_for_display: {
        Args: { p_conversation_id: string }
        Returns: {
          display_content: Json
          msg_agent_id: string
          msg_conversation_id: string
          msg_created_at: string
          msg_id: string
          msg_metadata: Json
          msg_position: number
          msg_role: string
          msg_source: string
          msg_status: string
        }[]
      }
      get_conversation_messages_for_model: {
        Args: { p_conversation_id: string }
        Returns: {
          msg_content: Json
          msg_conversation_id: string
          msg_created_at: string
          msg_id: string
          msg_metadata: Json
          msg_position: number
          msg_role: string
          msg_source: string
          msg_status: string
        }[]
      }
      get_conversations_for_user: {
        Args: { p_user_id: string }
        Returns: {
          conversation_avatar_url: string
          conversation_id: string
          conversation_name: string
          conversation_type: string
          conversation_updated_at: string
          is_muted: boolean
          is_pinned: boolean
          last_message_content: string
          last_message_created_at: string
          last_message_id: string
          last_message_sender_id: string
          last_message_sender_name: string
          last_message_type: string
          unread_count: number
        }[]
      }
      get_custom_app_with_applets: {
        Args: { p_id?: string; p_slug?: string }
        Returns: Json
      }
      get_cx_conversation_bundle: {
        Args: {
          p_before_position?: number
          p_conversation_id: string
          p_message_limit?: number
        }
        Returns: Json
      }
      get_cx_conversations_shared_with_me: {
        Args: never
        Returns: {
          created_at: string
          id: string
          message_count: number
          owner_email: string
          permission_level: string
          status: string
          title: string
          updated_at: string
        }[]
      }
      get_database_enums: {
        Args: never
        Returns: {
          description: string
          name: string
          schema: string
          values: string[]
        }[]
      }
      get_database_function_by_id: {
        Args: { function_id: string }
        Returns: {
          arguments: string
          definition: string
          name: string
          returns: string
          schema: string
          security_type: string
        }[]
      }
      get_database_functions: {
        Args: never
        Returns: {
          arguments: string
          definition: string
          name: string
          returns: string
          schema: string
          security_type: string
        }[]
      }
      get_database_permissions: {
        Args: never
        Returns: {
          object_name: string
          object_type: string
          privileges: string[]
          role: string
        }[]
      }
      get_database_schema_json: { Args: never; Returns: Json }
      get_dm_conversations_with_details: {
        Args: { p_user_id: string }
        Returns: {
          conversation_created_at: string
          conversation_id: string
          conversation_type: string
          conversation_updated_at: string
          group_image_url: string
          group_name: string
          last_message_at: string
          last_message_content: string
          last_message_sender_id: string
          unread_count: number
        }[]
      }
      get_dm_unread_count: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: number
      }
      get_dm_user_info: {
        Args: { p_user_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          email: string
          user_id: string
        }[]
      }
      get_entity_scopes: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: Json
      }
      get_enum_by_name: {
        Args: { p_name: string; p_schema: string }
        Returns: {
          description: string
          name: string
          schema: string
          values: string[]
        }[]
      }
      get_enum_usage: {
        Args: { p_name: string; p_schema: string }
        Returns: {
          column_default: string
          column_name: string
          table_name: string
          table_schema: string
        }[]
      }
      get_feedback_by_status: {
        Args: { p_status: string }
        Returns: {
          admin_decision: string
          admin_direction: string | null
          admin_notes: string | null
          ai_assessment: string | null
          ai_complexity: string | null
          ai_estimated_files: string[] | null
          ai_solution_proposal: string | null
          ai_suggested_priority: string | null
          assigned_to: string | null
          autonomy_score: number | null
          category_id: string | null
          created_at: string
          description: string
          feedback_type: string
          has_open_issues: boolean
          id: string
          image_urls: string[] | null
          parent_id: string | null
          priority: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          route: string
          status: string
          testing_instructions: string | null
          testing_result: string | null
          testing_url: string | null
          updated_at: string
          user_confirmed_at: string | null
          user_id: string
          username: string | null
          work_priority: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "user_feedback"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_feedback_comments: {
        Args: { p_feedback_id: string }
        Returns: {
          author_name: string | null
          author_type: string
          content: string
          created_at: string
          feedback_id: string
          id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "feedback_comments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_feedback_summary: { Args: never; Returns: Json }
      get_full_table: { Args: { ref: Json }; Returns: Json }
      get_inverse_fk_relationships: {
        Args: { p_table_name: string }
        Returns: {
          referenced_column_name: string
          referencing_column_name: string
          referencing_table_name: string
        }[]
      }
      get_mcp_catalog_for_user: {
        Args: never
        Returns: {
          auth_strategy: Database["public"]["Enums"]["mcp_auth_strategy"]
          category: Database["public"]["Enums"]["mcp_server_category"]
          color: string
          connected_at: string
          connection_id: string
          connection_status: Database["public"]["Enums"]["mcp_connection_status"]
          description: string
          docs_url: string
          endpoint_url: string
          has_local: boolean
          has_remote: boolean
          icon_url: string
          is_featured: boolean
          is_official: boolean
          last_used_at: string
          name: string
          server_id: string
          server_status: Database["public"]["Enums"]["mcp_server_status"]
          slug: string
          supports_mcp_apps: boolean
          token_expires_at: string
          transport: Database["public"]["Enums"]["mcp_transport"]
          transport_used: Database["public"]["Enums"]["mcp_transport"]
          vendor: string
          website_url: string
        }[]
      }
      get_mcp_credentials: {
        Args: { p_server_id: string; p_user_id: string }
        Returns: {
          access_token: string
          auth_strategy: Database["public"]["Enums"]["mcp_auth_strategy"]
          connection_id: string
          credentials_json: string
          endpoint_url: string
          oauth_client_id: string
          oauth_token_endpoint: string
          refresh_token: string
          server_slug: string
          status: Database["public"]["Enums"]["mcp_connection_status"]
          token_expires_at: string
          transport: Database["public"]["Enums"]["mcp_transport"]
        }[]
      }
      get_missing_broker_ids:
        | {
            Args: {
              p_broker_ids: string[]
              p_organization_id?: string
              p_project_id?: string
              p_task_id?: string
            }
            Returns: string[]
          }
        | {
            Args: {
              p_ai_runs_id?: string
              p_ai_tasks_id?: string
              p_broker_ids: string[]
              p_organization_id?: string
              p_project_id?: string
              p_task_id?: string
              p_user_id?: string
            }
            Returns: string[]
          }
      get_note_versions: {
        Args: { p_note_id: string }
        Returns: {
          change_source: string
          change_type: string
          content: string
          created_at: string
          diff_metadata: Json
          id: string
          label: string
          version_number: number
        }[]
      }
      get_or_create_direct_conversation: {
        Args: { p_other_user_id: string }
        Returns: string
      }
      get_org_structure: { Args: { p_org_id: string }; Returns: Json }
      get_organization_members: {
        Args: { org_id: string }
        Returns: {
          email: string
          full_name: string
          joined_at: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }[]
      }
      get_organization_members_with_users: {
        Args: { p_org_id: string }
        Returns: {
          id: string
          invited_by: string
          joined_at: string
          organization_id: string
          role: string
          user_avatar_url: string
          user_display_name: string
          user_email: string
          user_id: string
        }[]
      }
      get_pending_feedback: {
        Args: never
        Returns: {
          admin_decision: string
          admin_direction: string | null
          admin_notes: string | null
          ai_assessment: string | null
          ai_complexity: string | null
          ai_estimated_files: string[] | null
          ai_solution_proposal: string | null
          ai_suggested_priority: string | null
          assigned_to: string | null
          autonomy_score: number | null
          category_id: string | null
          created_at: string
          description: string
          feedback_type: string
          has_open_issues: boolean
          id: string
          image_urls: string[] | null
          parent_id: string | null
          priority: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          route: string
          status: string
          testing_instructions: string | null
          testing_result: string | null
          testing_url: string | null
          updated_at: string
          user_confirmed_at: string | null
          user_id: string
          username: string | null
          work_priority: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "user_feedback"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_project_members_with_users: {
        Args: { p_project_id: string }
        Returns: {
          id: string
          invited_by: string
          joined_at: string
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
          user_avatar_url: string
          user_display_name: string
          user_email: string
          user_id: string
        }[]
      }
      get_project_references: {
        Args: { p_project_id: string }
        Returns: {
          column_name: string
          row_count: number
          schema_name: string
          table_name: string
        }[]
      }
      get_project_references_detailed: {
        Args: { p_project_id: string; p_sample_limit?: number }
        Returns: {
          column_name: string
          row_count: number
          sample_ids: string[]
          schema_name: string
          table_name: string
        }[]
      }
      get_prompt_access_level: {
        Args: { prompt_id: string }
        Returns: {
          can_delete: boolean
          can_edit: boolean
          is_owner: boolean
          owner_email: string
          permission_level: string
        }[]
      }
      get_prompt_app_execution_payload: {
        Args: { p_app_id: string }
        Returns: Json
      }
      get_prompt_app_public_data: {
        Args: { p_app_id?: string; p_slug?: string }
        Returns: {
          allowed_imports: Json
          category: string
          component_code: string
          component_language: string
          description: string
          favicon_url: string
          id: string
          layout_config: Json
          name: string
          preview_image_url: string
          slug: string
          styling_config: Json
          success_rate: number
          tagline: string
          tags: string[]
          total_executions: number
          variable_schema: Json
        }[]
      }
      get_prompt_execution_data: {
        Args: { p_shortcut_id: string }
        Returns: {
          available_scopes: string[]
          messages: Json
          prompt_builtin_id: string
          prompt_name: string
          scope_mappings: Json
          settings: Json
          shortcut_id: string
          shortcut_label: string
          tools: Json
          variable_defaults: Json
        }[]
      }
      get_prompts_shared_with_me: {
        Args: never
        Returns: {
          created_at: string
          description: string
          id: string
          messages: Json
          name: string
          owner_email: string
          permission_level: string
          settings: Json
          updated_at: string
          user_id: string
          variable_defaults: Json
        }[]
      }
      get_published_app_with_prompt: {
        Args: { p_app_id?: string; p_slug?: string }
        Returns: {
          allowed_imports: Json
          category: string
          component_code: string
          component_language: string
          description: string
          favicon_url: string
          id: string
          layout_config: Json
          name: string
          preview_image_url: string
          prompt_id: string
          prompt_messages: Json
          prompt_settings: Json
          prompt_variable_defaults: Json
          slug: string
          status: string
          styling_config: Json
          success_rate: number
          tagline: string
          tags: string[]
          total_executions: number
          user_id: string
          variable_schema: Json
        }[]
      }
      get_recipe_complete: {
        Args: { recipe_uuid: string }
        Returns: {
          ai_agent: Json
          messages: Json
          recipe_id: string
        }[]
      }
      get_recipe_messages: {
        Args: { recipe_uuid: string }
        Returns: {
          message_id: string
          message_order: number
        }[]
      }
      get_registered_function_with_args: {
        Args: { p_function_id: string }
        Returns: {
          args: Json
          class_name: string
          description: string
          function_id: string
          function_name: string
          module_path: string
          return_broker: string
        }[]
      }
      get_resource_permissions: {
        Args: { p_resource_id: string; p_resource_type: string }
        Returns: {
          created_at: string
          granted_to_organization: Json
          granted_to_organization_id: string
          granted_to_user: Json
          granted_to_user_id: string
          id: string
          is_public: boolean
          permission_level: string
          resource_id: string
          resource_type: string
        }[]
      }
      get_schema: { Args: never; Returns: Json }
      get_scope_context: {
        Args: {
          p_include_empty?: boolean
          p_item_ids?: string[]
          p_scope_id: string
        }
        Returns: Json
      }
      get_scope_tree: {
        Args: { p_org_id: string; p_type_id?: string }
        Returns: Json
      }
      get_sensitive_item_value: { Args: { p_item_id: string }; Returns: string }
      get_ssr_agent_shell_data: { Args: { p_user_id: string }; Returns: Json }
      get_ssr_shell_data: { Args: { p_user_id: string }; Returns: Json }
      get_storage_object: {
        Args: { p_bucket_id: string; p_name: string }
        Returns: Json
      }
      get_table_cell: { Args: { ref: Json }; Returns: Json }
      get_table_column: { Args: { ref: Json }; Returns: Json }
      get_table_info: {
        Args: { table_name: string }
        Returns: {
          column_name: string
          data_type: string
          foreign_column: string
          foreign_table: string
          is_nullable: string
        }[]
      }
      get_table_row: { Args: { ref: Json }; Returns: Json }
      get_tables_and_columns: {
        Args: never
        Returns: {
          column_name: string
          data_type: string
          table_name: string
        }[]
      }
      get_task_associations: { Args: { p_task_id: string }; Returns: Json }
      get_tasks_for_entity: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: Json
      }
      get_tool_detail: { Args: { p_tool_id: string }; Returns: Json }
      get_tools_list: {
        Args: {
          p_category?: string
          p_is_active?: boolean
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_source_app?: string
          p_tags?: string[]
        }
        Returns: Json
      }
      get_tools_metadata: { Args: { p_source_app?: string }; Returns: Json }
      get_topic_overview: { Args: { p_topic_id: string }; Returns: Json }
      get_triage_batch: { Args: { p_batch_size?: number }; Returns: Json }
      get_untriaged_feedback: {
        Args: never
        Returns: {
          admin_decision: string
          admin_direction: string | null
          admin_notes: string | null
          ai_assessment: string | null
          ai_complexity: string | null
          ai_estimated_files: string[] | null
          ai_solution_proposal: string | null
          ai_suggested_priority: string | null
          assigned_to: string | null
          autonomy_score: number | null
          category_id: string | null
          created_at: string
          description: string
          feedback_type: string
          has_open_issues: boolean
          id: string
          image_urls: string[] | null
          parent_id: string | null
          priority: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          route: string
          status: string
          testing_instructions: string | null
          testing_result: string | null
          testing_url: string | null
          updated_at: string
          user_confirmed_at: string | null
          user_id: string
          username: string | null
          work_priority: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "user_feedback"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_unused_message_templates: {
        Args: never
        Returns: {
          content: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["message_role"]
          type: Database["public"]["Enums"]["message_type"]
        }[]
        SetofOptions: {
          from: "*"
          to: "message_template"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_email_preferences: {
        Args: { p_user_id: string }
        Returns: {
          comment_notifications: boolean | null
          created_at: string | null
          feedback_notifications: boolean
          id: string
          marketing_emails: boolean | null
          message_digest: boolean | null
          message_notifications: boolean | null
          organization_invitations: boolean | null
          resource_updates: boolean | null
          sharing_notifications: boolean | null
          task_notifications: boolean | null
          updated_at: string | null
          user_id: string
          weekly_digest: boolean | null
        }
        SetofOptions: {
          from: "*"
          to: "user_email_preferences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_user_emails_by_ids: {
        Args: { user_ids: string[] }
        Returns: {
          display_name: string
          email: string
          id: string
        }[]
      }
      get_user_feed: {
        Args: { p_limit?: number; p_offset?: number; p_user_id: string }
        Returns: {
          canvas_id: string
          canvas_type: string
          created_at: string
          creator_username: string
          like_count: number
          title: string
          view_count: number
        }[]
      }
      get_user_form_context: { Args: { p_user_id: string }; Returns: Json }
      get_user_full_context: { Args: { p_user_id?: string }; Returns: Json }
      get_user_hierarchy: { Args: never; Returns: Json }
      get_user_list_with_items: { Args: { p_list_id: string }; Returns: Json }
      get_user_lists_summary: { Args: { p_user_id: string }; Returns: Json }
      get_user_messages: {
        Args: { p_feedback_id: string }
        Returns: {
          content: string
          created_at: string
          email_sent: boolean
          feedback_id: string
          id: string
          image_urls: string[] | null
          sender_name: string | null
          sender_type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "feedback_user_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_nav_tree: { Args: { p_user_id?: string }; Returns: Json }
      get_user_organizations: {
        Args: { user_id: string }
        Returns: {
          id: string
          is_personal: boolean
          name: string
          role: Database["public"]["Enums"]["org_role"]
          slug: string
        }[]
      }
      get_user_own_feedback: {
        Args: { p_user_id: string }
        Returns: {
          admin_decision: string
          admin_direction: string | null
          admin_notes: string | null
          ai_assessment: string | null
          ai_complexity: string | null
          ai_estimated_files: string[] | null
          ai_solution_proposal: string | null
          ai_suggested_priority: string | null
          assigned_to: string | null
          autonomy_score: number | null
          category_id: string | null
          created_at: string
          description: string
          feedback_type: string
          has_open_issues: boolean
          id: string
          image_urls: string[] | null
          parent_id: string | null
          priority: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          route: string
          status: string
          testing_instructions: string | null
          testing_result: string | null
          testing_url: string | null
          updated_at: string
          user_confirmed_at: string | null
          user_id: string
          username: string | null
          work_priority: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "user_feedback"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_projects: {
        Args: { p_org_id?: string }
        Returns: {
          created_at: string
          created_by: string
          description: string
          id: string
          is_personal: boolean
          member_count: number
          name: string
          organization_id: string
          role: Database["public"]["Enums"]["project_role"]
          settings: Json
          slug: string
          updated_at: string
        }[]
      }
      get_user_scopes: { Args: { p_user_id?: string }; Returns: Json }
      get_user_scopes_with_projects: {
        Args: { p_user_id?: string }
        Returns: Json
      }
      get_user_session_data: {
        Args: { p_user_id: string }
        Returns: {
          is_admin: boolean
          preferences: Json
          preferences_exists: boolean
        }[]
      }
      get_user_stats: { Args: { p_user_id: string }; Returns: Json }
      get_user_table_complete: {
        Args: {
          p_sort_direction?: string
          p_sort_field?: string
          p_table_id: string
        }
        Returns: Json
      }
      get_user_table_data_paginated: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search_term?: string
          p_sort_direction?: string
          p_sort_field?: string
          p_table_id: string
        }
        Returns: Json
      }
      get_user_table_data_paginated_v2: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search_term?: string
          p_sort_direction?: string
          p_sort_field?: string
          p_table_id: string
        }
        Returns: Json
      }
      get_user_tables: { Args: never; Returns: Json }
      get_value_history: {
        Args: {
          p_context_item_id: string
          p_limit?: number
          p_scope_id: string
        }
        Returns: Json
      }
      get_version_diff: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_version_a: number
          p_version_b: number
        }
        Returns: Json
      }
      get_version_history: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_limit?: number
          p_offset?: number
        }
        Returns: {
          change_note: string
          changed_at: string
          name: string
          version_id: string
          version_number: number
        }[]
      }
      get_version_snapshot: {
        Args: { p_entity_id: string; p_entity_type: string; p_version: number }
        Returns: Json
      }
      has_permission: {
        Args: {
          p_required_permission: Database["public"]["Enums"]["permission_level"]
          p_resource_id: string
          p_resource_type: string
        }
        Returns: boolean
      }
      invite_to_organization: {
        Args: {
          email_address: string
          invited_by_user_id: string
          member_role: Database["public"]["Enums"]["org_role"]
          org_id: string
        }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      is_dm_participant: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: boolean
      }
      is_member_of_organization: {
        Args: { p_org_id: string }
        Returns: boolean
      }
      is_org_admin: { Args: { p_org_id: string }; Returns: boolean }
      is_org_member: { Args: { p_org_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_resource_owner: {
        Args: { p_resource_id: string; p_resource_type: string }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      list_entities_by_scopes: {
        Args: {
          p_entity_type?: string
          p_match_all?: boolean
          p_scope_ids: string[]
        }
        Returns: Json
      }
      list_field_data_types: { Args: never; Returns: string[] }
      list_scope_type_items: {
        Args: { p_scope_type_id: string }
        Returns: Json
      }
      list_scope_types: { Args: { p_org_id: string }; Returns: Json }
      list_scopes: {
        Args: {
          p_org_id: string
          p_parent_scope_id?: string
          p_type_id?: string
        }
        Returns: Json
      }
      list_table_columns: { Args: { ref: Json }; Returns: Json }
      list_table_rows: {
        Args: {
          limit_rows?: number
          offset_rows?: number
          order_by?: string
          order_dir?: string
          ref: Json
        }
        Returns: Json
      }
      list_templates: {
        Args: { p_category?: string; p_personal_only?: boolean }
        Returns: Json
      }
      list_wizard_archetypes: { Args: never; Returns: Json }
      lookup_user_by_email: {
        Args: { lookup_email: string }
        Returns: {
          user_email: string
          user_id: string
        }[]
      }
      make_resource_private: {
        Args: { p_resource_id: string; p_resource_type: string }
        Returns: Json
      }
      make_resource_public: {
        Args: { p_resource_id: string; p_resource_type: string }
        Returns: Json
      }
      mark_conversation_read: {
        Args: { p_conversation_id: string; p_message_id: string }
        Returns: undefined
      }
      mark_email_as_read: {
        Args: { _id: string }
        Returns: {
          body: string
          id: string
          is_read: boolean | null
          recipient: string
          sender: string
          subject: string
          timestamp: string | null
        }
        SetofOptions: {
          from: "*"
          to: "emails"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_invitation_code_used: {
        Args: { p_code: string; p_user_id: string }
        Returns: boolean
      }
      mark_user_message_emailed: {
        Args: { p_message_id: string }
        Returns: undefined
      }
      pin_prompt_app_to_version: {
        Args: { p_app_id: string; p_version_id: string }
        Returns: Json
      }
      promote_version: {
        Args: { p_entity_id: string; p_entity_type: string; p_version: number }
        Returns: Json
      }
      provision_mcp_server: {
        Args: {
          p_auth_strategy: Database["public"]["Enums"]["mcp_auth_strategy"]
          p_category: Database["public"]["Enums"]["mcp_server_category"]
          p_color?: string
          p_description?: string
          p_docs_url?: string
          p_endpoint_url?: string
          p_icon_url?: string
          p_is_official?: boolean
          p_name: string
          p_oauth_scopes?: string[]
          p_slug: string
          p_status?: Database["public"]["Enums"]["mcp_server_status"]
          p_transport: Database["public"]["Enums"]["mcp_transport"]
          p_vendor: string
          p_website_url?: string
        }
        Returns: Json
      }
      purge_old_versions: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_keep_count?: number
        }
        Returns: number
      }
      rag_user_can_see_cld_file: {
        Args: { p_file_id: string }
        Returns: boolean
      }
      rag_user_can_see_note: { Args: { p_note_id: string }; Returns: boolean }
      record_guest_execution: {
        Args: {
          p_fingerprint: string
          p_ip_address?: unknown
          p_referer?: string
          p_resource_id?: string
          p_resource_name?: string
          p_resource_type: string
          p_task_id?: string
          p_user_agent?: string
        }
        Returns: string
      }
      refresh_all_fields_in_group: {
        Args: { p_group_id: string }
        Returns: boolean
      }
      refresh_all_groups_in_applet: {
        Args: { p_applet_id: string }
        Returns: Json
      }
      refresh_all_groups_in_applet_debug: {
        Args: { p_applet_id: string }
        Returns: {
          db_data: Json
          group_id: string
          original_data: Json
          step: string
          updated_data: Json
        }[]
      }
      refresh_field_in_group: {
        Args: { p_field_id: string; p_group_id: string }
        Returns: Json
      }
      refresh_group_in_applet: {
        Args: { p_applet_id: string; p_group_id: string }
        Returns: boolean
      }
      remove_column_from_user_table: {
        Args: { p_field_id: string; p_table_id: string }
        Returns: Json
      }
      remove_field_from_group: {
        Args: { p_field_id: string; p_group_id: string }
        Returns: boolean
      }
      remove_sharing: {
        Args: { permission_id: string; user_id?: string }
        Returns: boolean
      }
      rename_storage_folder: {
        Args: {
          auth_user_id?: string
          bucket_name: string
          new_folder_path: string
          old_folder_path: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      reorder_keywords: {
        Args: { p_keyword_ids: string[]; p_topic_id: string }
        Returns: undefined
      }
      reply_to_user_review:
        | {
            Args: {
              p_feedback_id: string
              p_message: string
              p_sender_name?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_feedback_id: string
              p_image_urls?: string[]
              p_message: string
              p_sender_name?: string
            }
            Returns: Json
          }
      reset_daily_guest_counters: { Args: never; Returns: undefined }
      resolve_feedback_item: {
        Args: {
          p_id: string
          p_resolution_notes?: string
          p_resolved_by?: string
        }
        Returns: {
          admin_decision: string
          admin_direction: string | null
          admin_notes: string | null
          ai_assessment: string | null
          ai_complexity: string | null
          ai_estimated_files: string[] | null
          ai_solution_proposal: string | null
          ai_suggested_priority: string | null
          assigned_to: string | null
          autonomy_score: number | null
          category_id: string | null
          created_at: string
          description: string
          feedback_type: string
          has_open_issues: boolean
          id: string
          image_urls: string[] | null
          parent_id: string | null
          priority: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          route: string
          status: string
          testing_instructions: string | null
          testing_result: string | null
          testing_url: string | null
          updated_at: string
          user_confirmed_at: string | null
          user_id: string
          username: string | null
          work_priority: number | null
        }
        SetofOptions: {
          from: "*"
          to: "user_feedback"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_full_context: {
        Args: { p_entity_id: string; p_entity_type: string; p_user_id: string }
        Returns: Json
      }
      resolve_shareable_resource: {
        Args: { p_resource_type: string }
        Returns: {
          display_label: string
          id_column: string
          is_public_column: string
          owner_column: string
          resource_type: string
          table_name: string
          url_path_template: string
        }[]
      }
      resolve_with_testing: {
        Args: {
          p_id: string
          p_resolution_notes: string
          p_testing_instructions?: string
          p_testing_url?: string
        }
        Returns: {
          admin_decision: string
          admin_direction: string | null
          admin_notes: string | null
          ai_assessment: string | null
          ai_complexity: string | null
          ai_estimated_files: string[] | null
          ai_solution_proposal: string | null
          ai_suggested_priority: string | null
          assigned_to: string | null
          autonomy_score: number | null
          category_id: string | null
          created_at: string
          description: string
          feedback_type: string
          has_open_issues: boolean
          id: string
          image_urls: string[] | null
          parent_id: string | null
          priority: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          route: string
          status: string
          testing_instructions: string | null
          testing_result: string | null
          testing_url: string | null
          updated_at: string
          user_confirmed_at: string | null
          user_id: string
          username: string | null
          work_priority: number | null
        }
        SetofOptions: {
          from: "*"
          to: "user_feedback"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      restore_note_version: {
        Args: { p_note_id: string; p_version_number: number }
        Returns: boolean
      }
      restore_version: {
        Args: { p_entity_id: string; p_entity_type: string; p_version: number }
        Returns: number
      }
      revoke_resource_access: {
        Args: {
          p_resource_id: string
          p_resource_type: string
          p_target_user_id: string
        }
        Returns: Json
      }
      revoke_resource_org_access: {
        Args: {
          p_resource_id: string
          p_resource_type: string
          p_target_org_id: string
        }
        Returns: Json
      }
      sch_enqueue_manual_run: { Args: { p_task_id: string }; Returns: string }
      sch_recompute_task_next_due_at: {
        Args: { p_task_id: string }
        Returns: undefined
      }
      search_scopes: {
        Args: { p_org_id: string; p_query: string; p_type_id?: string }
        Returns: Json
      }
      search_users_intelligent: {
        Args: {
          current_user_id: string
          max_results?: number
          search_term: string
        }
        Returns: {
          avatar_url: string
          display_name: string
          email: string
          match_score: number
          user_id: string
        }[]
      }
      send_email: {
        Args: {
          _body: string
          _recipient: string
          _sender: string
          _subject: string
        }
        Returns: {
          body: string
          id: string
          is_read: boolean | null
          recipient: string
          sender: string
          subject: string
          timestamp: string | null
        }
        SetofOptions: {
          from: "*"
          to: "emails"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_user_review_message:
        | {
            Args: {
              p_feedback_id: string
              p_message: string
              p_sender_name?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_feedback_id: string
              p_image_urls?: string[]
              p_message: string
              p_sender_name?: string
            }
            Returns: Json
          }
      set_admin_decision: {
        Args: {
          p_decision: string
          p_direction?: string
          p_id: string
          p_work_priority?: number
        }
        Returns: {
          admin_decision: string
          admin_direction: string | null
          admin_notes: string | null
          ai_assessment: string | null
          ai_complexity: string | null
          ai_estimated_files: string[] | null
          ai_solution_proposal: string | null
          ai_suggested_priority: string | null
          assigned_to: string | null
          autonomy_score: number | null
          category_id: string | null
          created_at: string
          description: string
          feedback_type: string
          has_open_issues: boolean
          id: string
          image_urls: string[] | null
          parent_id: string | null
          priority: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          route: string
          status: string
          testing_instructions: string | null
          testing_result: string | null
          testing_url: string | null
          updated_at: string
          user_confirmed_at: string | null
          user_id: string
          username: string | null
          work_priority: number | null
        }
        SetofOptions: {
          from: "*"
          to: "user_feedback"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_entity_scopes: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_scope_ids: string[]
        }
        Returns: Json
      }
      set_scope_context_value: {
        Args: {
          p_change_summary?: string
          p_context_item_id: string
          p_scope_id: string
          p_value_boolean?: boolean
          p_value_document_url?: string
          p_value_json?: Json
          p_value_number?: number
          p_value_text?: string
        }
        Returns: Json
      }
      set_sensitive_item: {
        Args: {
          p_full_value: string
          p_is_primary?: boolean
          p_item_id?: string
          p_kind: string
          p_label: string
          p_metadata?: Json
          p_preview?: string
        }
        Returns: string
      }
      share_resource_with_org: {
        Args: {
          p_permission_level?: string
          p_resource_id: string
          p_resource_type: string
          p_target_org_id: string
        }
        Returns: Json
      }
      share_resource_with_user: {
        Args: {
          p_permission_level?: string
          p_resource_id: string
          p_resource_type: string
          p_target_user_id: string
        }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      split_feedback_item: {
        Args: { p_descriptions: string[]; p_parent_id: string }
        Returns: {
          admin_decision: string
          admin_direction: string | null
          admin_notes: string | null
          ai_assessment: string | null
          ai_complexity: string | null
          ai_estimated_files: string[] | null
          ai_solution_proposal: string | null
          ai_suggested_priority: string | null
          assigned_to: string | null
          autonomy_score: number | null
          category_id: string | null
          created_at: string
          description: string
          feedback_type: string
          has_open_issues: boolean
          id: string
          image_urls: string[] | null
          parent_id: string | null
          priority: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          route: string
          status: string
          testing_instructions: string | null
          testing_result: string | null
          testing_url: string | null
          updated_at: string
          user_confirmed_at: string | null
          user_id: string
          username: string | null
          work_priority: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "user_feedback"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      to_snake_case: { Args: { input_text: string }; Returns: string }
      track_system_prompt_execution: {
        Args: {
          p_error_message?: string
          p_execution_time_ms?: number
          p_success?: boolean
          p_system_prompt_id: string
          p_trigger_type: string
          p_variables_used?: Json
        }
        Returns: string
      }
      transfer_organization_ownership: {
        Args: { current_owner_id: string; new_owner_id: string; org_id: string }
        Returns: boolean
      }
      triage_feedback_item:
        | {
            Args: {
              p_ai_assessment?: string
              p_ai_complexity?: string
              p_ai_estimated_files?: string[]
              p_ai_solution_proposal?: string
              p_ai_suggested_priority?: string
              p_autonomy_score?: number
              p_id: string
            }
            Returns: {
              admin_decision: string
              admin_direction: string | null
              admin_notes: string | null
              ai_assessment: string | null
              ai_complexity: string | null
              ai_estimated_files: string[] | null
              ai_solution_proposal: string | null
              ai_suggested_priority: string | null
              assigned_to: string | null
              autonomy_score: number | null
              category_id: string | null
              created_at: string
              description: string
              feedback_type: string
              has_open_issues: boolean
              id: string
              image_urls: string[] | null
              parent_id: string | null
              priority: string
              resolution_notes: string | null
              resolved_at: string | null
              resolved_by: string | null
              route: string
              status: string
              testing_instructions: string | null
              testing_result: string | null
              testing_url: string | null
              updated_at: string
              user_confirmed_at: string | null
              user_id: string
              username: string | null
              work_priority: number | null
            }
            SetofOptions: {
              from: "*"
              to: "user_feedback"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_ai_assessment?: string
              p_ai_complexity?: string
              p_ai_estimated_files?: string[]
              p_ai_solution_proposal?: string
              p_ai_suggested_priority?: string
              p_autonomy_score?: number
              p_category_id?: string
              p_id: string
            }
            Returns: {
              admin_decision: string
              admin_direction: string | null
              admin_notes: string | null
              ai_assessment: string | null
              ai_complexity: string | null
              ai_estimated_files: string[] | null
              ai_solution_proposal: string | null
              ai_suggested_priority: string | null
              assigned_to: string | null
              autonomy_score: number | null
              category_id: string | null
              created_at: string
              description: string
              feedback_type: string
              has_open_issues: boolean
              id: string
              image_urls: string[] | null
              parent_id: string | null
              priority: string
              resolution_notes: string | null
              resolved_at: string | null
              resolved_by: string | null
              route: string
              status: string
              testing_instructions: string | null
              testing_result: string | null
              testing_url: string | null
              updated_at: string
              user_confirmed_at: string | null
              user_id: string
              username: string | null
              work_priority: number | null
            }
            SetofOptions: {
              from: "*"
              to: "user_feedback"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      update_all_bucket_tree_structures: { Args: never; Returns: Json }
      update_all_trending_scores: { Args: never; Returns: undefined }
      update_arg: {
        Args: {
          p_arg_id: string
          p_data_type: Database["public"]["Enums"]["data_type"]
          p_default_value: string
          p_name: string
          p_ready: boolean
          p_registered_function: string
          p_required: boolean
        }
        Returns: undefined
      }
      update_bucket_structure: { Args: { bucket_name: string }; Returns: Json }
      update_bucket_tree_structure: {
        Args: { bucket_name: string }
        Returns: Json
      }
      update_builtin_from_source: {
        Args: { p_builtin_id: string }
        Returns: {
          message: string
          source_prompt_id: string
          success: boolean
        }[]
      }
      update_builtins_from_prompt: {
        Args: { p_prompt_id: string }
        Returns: {
          builtin_id: string
          builtin_name: string
          error_message: string
          updated: boolean
        }[]
      }
      update_by_id: {
        Args: {
          p_payload: Json
          p_table_name: string
          p_update_function?: string
        }
        Returns: Json
      }
      update_data_row_in_user_table: {
        Args: { p_data: Json; p_row_id: string }
        Returns: Json
      }
      update_field_metadata: {
        Args: {
          p_display_name?: string
          p_field_id: string
          p_field_order?: number
          p_is_required?: boolean
          p_validation_rules?: Json
        }
        Returns: Json
      }
      update_one: {
        Args: { p_data: Json; p_id: string; p_table_name: string }
        Returns: undefined
      }
      update_permission_level: {
        Args: {
          p_new_level?: string
          p_resource_id: string
          p_resource_type: string
          p_target_org_id?: string
          p_target_user_id?: string
        }
        Returns: Json
      }
      update_registered_function:
        | {
            Args: {
              p_class_name: string
              p_description: string
              p_function_id: string
              p_module_path: string
              p_name: string
              p_return_broker: string
            }
            Returns: undefined
          }
        | { Args: { p_payload: Json }; Returns: Json }
      update_registered_function_with_args: {
        Args: {
          p_args: Json
          p_class_name: string
          p_description: string
          p_function_id: string
          p_module_path: string
          p_name: string
          p_return_broker: string
        }
        Returns: undefined
      }
      update_scope: {
        Args: {
          p_description?: string
          p_name?: string
          p_scope_id: string
          p_settings?: Json
        }
        Returns: Json
      }
      update_scope_type: {
        Args: {
          p_description?: string
          p_icon?: string
          p_label_plural?: string
          p_label_singular?: string
          p_max_assignments?: number
          p_sort_order?: number
          p_type_id: string
        }
        Returns: Json
      }
      update_user_list: {
        Args: {
          p_authenticated_read?: boolean
          p_description?: string
          p_is_public?: boolean
          p_items?: Json
          p_list_id: string
          p_list_name?: string
          p_public_read?: boolean
        }
        Returns: Json
      }
      update_user_table_config: {
        Args: {
          p_field_updates?: Json
          p_table_id: string
          p_table_updates?: Json
        }
        Returns: Json
      }
      update_user_table_default_sort: {
        Args: {
          p_sort_direction?: string
          p_sort_field?: string
          p_table_id: string
        }
        Returns: Json
      }
      update_user_table_metadata: {
        Args: {
          p_authenticated_read?: boolean
          p_description?: string
          p_is_public?: boolean
          p_table_id: string
          p_table_name?: string
        }
        Returns: Json
      }
      update_user_table_row_ordering: {
        Args: { p_enabled: boolean; p_order?: Json; p_table_id: string }
        Returns: Json
      }
      upsert_action: {
        Args: {
          p_id: string
          p_matrix: string
          p_name: string
          p_node_type: string
          p_reference_id: string
          p_transformer?: string
        }
        Returns: undefined
      }
      upsert_ai_endpoint: {
        Args: {
          p_additional_cost?: boolean
          p_cost_details?: Json
          p_description?: string
          p_id: string
          p_name: string
          p_params?: Json
          p_provider?: string
        }
        Returns: undefined
      }
      upsert_ai_model: {
        Args: {
          p_capabilities?: Json
          p_class: string
          p_common_name?: string
          p_context_window?: number
          p_controls?: Json
          p_endpoints?: Json
          p_id: string
          p_max_tokens?: number
          p_name: string
          p_provider?: string
        }
        Returns: undefined
      }
      upsert_arg: {
        Args: {
          p_data_type?: Database["public"]["Enums"]["data_type"]
          p_default?: string
          p_id: string
          p_name: string
          p_ready?: boolean
          p_registered_function?: string
          p_required?: boolean
        }
        Returns: undefined
      }
      upsert_automation_boundary_brokers: {
        Args: {
          p_beacon_destination?: Database["public"]["Enums"]["data_destination"]
          p_broker?: string
          p_id: string
          p_matrix?: string
          p_spark_source?: Database["public"]["Enums"]["data_source"]
        }
        Returns: undefined
      }
      upsert_automation_matrix: {
        Args: {
          p_average_seconds?: number
          p_cognition_matrices?: Database["public"]["Enums"]["cognition_matrices"]
          p_description?: string
          p_id: string
          p_is_automated?: boolean
          p_name: string
        }
        Returns: undefined
      }
      upsert_broker: {
        Args: {
          p_additional_params?: Json
          p_custom_source_component?: string
          p_data_type: Database["public"]["Enums"]["data_type"]
          p_default_destination?: Database["public"]["Enums"]["data_destination"]
          p_default_source?: Database["public"]["Enums"]["data_source"]
          p_description?: string
          p_display_name?: string
          p_id: string
          p_name: string
          p_other_source_params?: Json
          p_output_component?: Database["public"]["Enums"]["destination_component"]
          p_ready?: boolean
          p_sample_entries?: string
          p_tags?: Json
          p_tooltip?: string
          p_validation_rules?: Json
          p_value?: Json
        }
        Returns: undefined
      }
      upsert_broker_value:
        | {
            Args: {
              p_ai_runs_id?: string
              p_ai_tasks_id?: string
              p_broker_id: string
              p_created_by?: string
              p_is_global?: boolean
              p_organization_id?: string
              p_project_id?: string
              p_task_id?: string
              p_user_id?: string
              p_value: Json
            }
            Returns: string
          }
        | {
            Args: {
              p_broker_id: string
              p_created_by?: string
              p_organization_id?: string
              p_project_id?: string
              p_task_id?: string
              p_value: Json
            }
            Returns: string
          }
      upsert_data_output_component: {
        Args: {
          p_additional_params?: Json
          p_component_type?: Database["public"]["Enums"]["destination_component"]
          p_id: string
          p_props?: Json
          p_ui_component?: string
        }
        Returns: undefined
      }
      upsert_display_option: {
        Args: {
          p_additional_params?: Json
          p_customizable_params?: Json
          p_default_params?: Json
          p_id: string
          p_name?: string
        }
        Returns: undefined
      }
      upsert_extractor: {
        Args: {
          p_default_identifier?: string
          p_default_index?: number
          p_id: string
          p_name: string
          p_output_type?: Database["public"]["Enums"]["data_type"]
        }
        Returns: undefined
      }
      upsert_mcp_connection: {
        Args: {
          p_access_token?: string
          p_config_id?: string
          p_credentials_json?: string
          p_endpoint_override?: string
          p_oauth_client_id?: string
          p_oauth_scopes?: string[]
          p_oauth_token_endpoint?: string
          p_refresh_token?: string
          p_server_id: string
          p_token_expires_at?: string
          p_transport?: Database["public"]["Enums"]["mcp_transport"]
        }
        Returns: string
      }
      upsert_processors: {
        Args: {
          p_default_extractors?: Json
          p_depends_default?: string
          p_id: string
          p_name: string
          p_params?: Json
        }
        Returns: undefined
      }
      upsert_recipe:
        | {
            Args: {
              p_description?: string
              p_id: string
              p_is_public?: boolean
              p_messages?: Json[]
              p_name: string
              p_post_result_options?: Json
              p_sample_output?: string
              p_status: Database["public"]["Enums"]["recipe_status"]
              p_tags?: Json
              p_version?: number
            }
            Returns: undefined
          }
        | {
            Args: {
              p_description?: string
              p_id: string
              p_is_public?: boolean
              p_messages?: Json[]
              p_name: string
              p_post_result_options?: Json
              p_sample_output?: string
              p_status: Database["public"]["Enums"]["recipe_status"]
              p_tags?: Json
              p_varsion: number
            }
            Returns: undefined
          }
      upsert_recipe_broker: {
        Args: {
          p_broker: string
          p_broker_role: Database["public"]["Enums"]["broker_role"]
          p_id: string
          p_recipe: string
          p_required?: boolean
        }
        Returns: undefined
      }
      upsert_recipe_display: {
        Args: {
          p_display: string
          p_display_settings?: Json
          p_id: string
          p_priority?: number
          p_recipe: string
        }
        Returns: undefined
      }
      upsert_recipe_function: {
        Args: {
          p_function: string
          p_id: string
          p_params?: Json
          p_recipe: string
          p_role: Database["public"]["Enums"]["function_role"]
        }
        Returns: undefined
      }
      upsert_recipe_model: {
        Args: {
          p_ai_model: string
          p_id: string
          p_priority?: number
          p_recipe: string
          p_role: Database["public"]["Enums"]["model_role"]
        }
        Returns: undefined
      }
      upsert_recipe_processors: {
        Args: {
          p_id: string
          p_params?: Json
          p_processor: string
          p_recipe: string
        }
        Returns: undefined
      }
      upsert_recipe_tools: {
        Args: {
          p_id: string
          p_params?: Json
          p_recipe: string
          p_tool: string
        }
        Returns: undefined
      }
      upsert_registered_function:
        | { Args: { input_json: Json }; Returns: Json }
        | {
            Args: {
              p_class_name?: string
              p_description?: string
              p_id: string
              p_module_path: string
              p_name: string
              p_return_broker?: string
            }
            Returns: undefined
          }
      upsert_system_function: {
        Args: {
          p_description?: string
          p_id: string
          p_input_params?: Json
          p_output_options?: Json
          p_public_name: string
          p_rf_id: string
          p_sample?: string
        }
        Returns: undefined
      }
      upsert_tool: {
        Args: {
          p_additional_params?: Json
          p_description?: string
          p_id: string
          p_name: string
          p_parameters?: Json
          p_required_args?: Json
          p_source: Json
          p_system_function?: string
        }
        Returns: undefined
      }
      upsert_transformers: {
        Args: {
          p_id: string
          p_input_params?: Json
          p_name?: string
          p_ourput_params?: Json
        }
        Returns: undefined
      }
      user_form_profile_append_to_array: {
        Args: { p_column: string; p_item: Json; p_user_id: string }
        Returns: Json
      }
      user_form_profile_set_custom_field: {
        Args: { p_key: string; p_user_id: string; p_value: Json }
        Returns: Json
      }
      validate_slugs: {
        Args: { slug_array: string[] }
        Returns: {
          error: string
          is_available: boolean
          is_format_valid: boolean
          slug: string
        }[]
      }
    }
    Enums: {
      admin_level: "developer" | "senior_admin" | "super_admin"
      app_type: "recipe" | "workflow" | "other"
      artifact_status: "draft" | "published" | "archived" | "failed"
      artifact_type:
        | "html_page"
        | "flashcard_deck"
        | "org_chart"
        | "diagram"
        | "data_table"
        | "timeline"
        | "comparison_table"
        | "quiz"
        | "summary"
        | "outline"
        | "report"
        | "code_snippet"
        | "spreadsheet"
        | "presentation"
        | "other"
      broker_role: "input_broker" | "output_broker"
      code_edit_status: "applied" | "rejected" | "reverted"
      code_message_file_status: "in_progress" | "completed" | "reverted"
      cognition_matrices:
        | "agent_crew"
        | "agent_mixture"
        | "workflow"
        | "conductor"
        | "monte_carlo"
        | "hypercluster"
        | "the_matrix"
        | "knowledge_matrix"
      color:
        | "slate"
        | "gray"
        | "zinc"
        | "neutral"
        | "stone"
        | "red"
        | "orange"
        | "amber"
        | "yellow"
        | "lime"
        | "green"
        | "emerald"
        | "teal"
        | "cyan"
        | "sky"
        | "blue"
        | "indigo"
        | "violet"
        | "purple"
        | "fuchsia"
        | "pink"
        | "rose"
        | "Bot"
      context_fetch_hint:
        | "always"
        | "on_demand"
        | "batch_related"
        | "lazy"
        | "never"
      context_item_status:
        | "idea"
        | "stub"
        | "gathering"
        | "partial"
        | "needs_review"
        | "ai_enriched"
        | "in_revision"
        | "pending_approval"
        | "active"
        | "provisional"
        | "stale"
        | "needs_update"
        | "superseded"
        | "archived"
        | "deprecated"
      context_sensitivity: "public" | "internal" | "restricted" | "privileged"
      context_source_type:
        | "manual"
        | "ai_generated"
        | "ai_enriched"
        | "imported"
        | "scraped"
        | "system"
      context_value_type:
        | "string"
        | "number"
        | "boolean"
        | "object"
        | "array"
        | "document"
        | "reference"
      cx_agent_task_creator: "agent" | "user"
      cx_agent_task_status:
        | "pending"
        | "in_progress"
        | "done"
        | "blocked"
        | "skipped"
      cx_plan_status: "proposed" | "approved" | "rejected" | "superseded"
      data_destination:
        | "user_output"
        | "database"
        | "file"
        | "api_response"
        | "function"
      data_source:
        | "user_input"
        | "database"
        | "api"
        | "environment"
        | "file"
        | "chance"
        | "generated_data"
        | "function"
        | "none"
      data_type: "str" | "int" | "float" | "bool" | "dict" | "list" | "url"
      default_component:
        | "Input"
        | "Textarea"
        | "Switch"
        | "Select"
        | "Slider"
        | "UUID_Field"
        | "UUID_Array"
        | "Button"
        | "Checkbox"
        | "Chip"
        | "Color_Picker"
        | "Date_Picker"
        | "Drawer"
        | "Menu"
        | "File_Upload"
        | "Image_Display"
        | "Json_Editor"
        | "Number_Input"
        | "Phone_Input"
        | "Radio_Group"
        | "Relational_Input"
        | "Relational_Button"
        | "Search_Input"
        | "Sheet"
        | "Star_Rating"
        | "Time_Picker"
        | "Accordion_View"
        | "Accordion_View_Add_Edit"
        | "Accordion_Selected"
        | "BrokerInput"
        | "BrokerTextarea"
        | "BrokerSelect"
        | "BrokerSlider"
        | "BrokerSwitch"
        | "BrokerCheckbox"
        | "BrokerRadio"
        | "BrokerTextareaGrow"
        | "BrokerTailwindColorPicker"
        | "BrokerColorPicker"
        | "BrokerTextArrayInput"
        | "BrokerNumberPicker"
        | "BrokerNumberInput"
        | "BrokerCustomSelect"
        | "BrokerCustomInput"
        | "BrokerRadioGroup"
      destination_component:
        | "chatResponse"
        | "PlainText"
        | "Textarea"
        | "JsonViewer"
        | "CodeView"
        | "MarkdownViewer"
        | "RichTextEditor"
        | "TreeView"
        | "ImageView"
        | "AudioOutput"
        | "Presentation"
        | "RunCodeFront"
        | "RunCodeBack"
        | "ComplexMulti"
        | "FileOutput"
        | "Table"
        | "Form"
        | "VerticalList"
        | "HorizontalList"
        | "Flowchart"
        | "WordMap"
        | "GeographicMap"
        | "video"
        | "Spreadsheet"
        | "Timeline"
        | "GanttChart"
        | "NetworkGraph"
        | "Heatmap"
        | "3DModelViewer"
        | "LaTeXRenderer"
        | "DiffViewer"
        | "Checklist"
        | "KanbanBoard"
        | "PivotTable"
        | "InteractiveChart"
        | "SankeyDiagram"
        | "MindMap"
        | "Calendar"
        | "Carousel"
        | "PDFViewer"
        | "SVGEditor"
        | "DataFlowDiagram"
        | "UMLDiagram"
        | "GlossaryView"
        | "DecisionTree"
        | "WordHighlighter"
        | "SpectrumAnalyzer"
        | "LiveTraffic"
        | "WeatherMap"
        | "WeatherDashboard"
        | "Thermometer"
        | "SatelliteView"
        | "PublicLiveCam"
        | "Clock"
        | "BudgetVisualizer"
        | "MealPlanner"
        | "TaskPrioritization"
        | "VoiceSentimentAnalysis"
        | "NewsAggregator"
        | "FitnessTracker"
        | "TravelPlanner"
        | "BucketList"
        | "SocialMediaInfo"
        | "LocalEvents"
        | "NeedNewOption"
        | "none"
      field_data_type:
        | "string"
        | "number"
        | "integer"
        | "boolean"
        | "date"
        | "datetime"
        | "json"
        | "array"
      function_role:
        | "decision"
        | "validation"
        | "post_processing"
        | "pre-Processing"
        | "rating"
        | "comparison"
        | "save_data"
        | "other"
      icon_type:
        | "Brain"
        | "Code"
        | "User"
        | "Database"
        | "FaBrave"
        | "FcGoogle"
        | "FcBrokenLink"
        | "FcFilm"
        | "FcDownload"
        | "FcBiotech"
        | "FcElectronics"
        | "FcGraduationCap"
        | "FcLibrary"
        | "FcMusic"
        | "FcParallelTasks"
        | "FcSalesPerformance"
        | "FcCalendar"
        | "FcDocument"
        | "FcEngineering"
        | "FcDataProtection"
        | "FcAssistant"
        | "FcSms"
        | "FcTodoList"
        | "FcWikipedia"
        | "FcCommandLine"
        | "FcConferenceCall"
        | "FcManager"
        | "FcAreaChart"
        | "FcMultipleInputs"
        | "FcShipped"
        | "FcBusinessContact"
        | "FcAlphabeticalSortingAz"
        | "FcAlphabeticalSortingZa"
        | "FcFeedback"
        | "FcBusiness"
        | "FcSignature"
        | "Mail"
        | "Calendar"
        | "FileText"
        | "Webhook"
        | "Search"
        | "ArrowRightLeft"
        | "ArrowLeftRight"
        | "Plus"
        | "Cpu"
        | "MessageSquare"
        | "Globe"
        | "Image"
        | "Zap"
        | "Play"
        | "RotateCcw"
        | "GitBranch"
        | "Repeat"
        | "Wand2"
        | "Settings"
        | "Wrench"
        | "Filter"
        | "Layers"
        | "Package"
        | "Upload"
        | "Download"
        | "Eye"
        | "Edit"
        | "Trash"
        | "Copy"
        | "Move"
        | "Link"
        | "Unlink"
        | "Lock"
        | "Unlock"
        | "Archive"
        | "Folder"
        | "FolderOpen"
        | "File"
        | "Save"
        | "RefreshCw"
        | "Home"
        | "Star"
        | "Heart"
        | "Bell"
        | "BellOff"
        | "Check"
        | "CheckCircle"
        | "X"
        | "XCircle"
        | "AlertCircle"
        | "AlertTriangle"
        | "Info"
        | "HelpCircle"
        | "Menu"
        | "MoreHorizontal"
        | "MoreVertical"
        | "ChevronDown"
        | "ChevronUp"
        | "ChevronLeft"
        | "ChevronRight"
        | "ArrowUp"
        | "ArrowDown"
        | "ArrowLeft"
        | "ArrowRight"
        | "ExternalLink"
        | "Share"
        | "Share2"
        | "Bookmark"
        | "BookmarkPlus"
        | "Tag"
        | "Tags"
        | "User2"
        | "Users"
        | "UserPlus"
        | "UserMinus"
        | "Shield"
        | "ShieldCheck"
        | "Key"
        | "LogIn"
        | "LogOut"
        | "Phone"
        | "PhoneCall"
        | "MessageCircle"
        | "Send"
        | "Inbox"
        | "Clock"
        | "Timer"
        | "CalendarDays"
        | "MapPin"
        | "Map"
        | "Navigation"
        | "Compass"
        | "Camera"
        | "Video"
        | "Mic"
        | "MicOff"
        | "Volume2"
        | "VolumeX"
        | "Headphones"
        | "Music"
        | "Music2"
        | "PlayCircle"
        | "PauseCircle"
        | "StopCircle"
        | "SkipForward"
        | "SkipBack"
        | "Shuffle"
        | "Repeat1"
        | "MonitorSpeaker"
        | "Smartphone"
        | "Tablet"
        | "Laptop"
        | "Monitor"
        | "Wifi"
        | "WifiOff"
        | "Battery"
        | "BatteryLow"
        | "Power"
        | "PowerOff"
        | "Sun"
        | "Moon"
        | "Cloud"
        | "CloudRain"
        | "CloudSnow"
        | "Umbrella"
        | "Thermometer"
        | "TrendingUp"
        | "TrendingDown"
        | "BarChart"
        | "LineChart"
        | "PieChart"
        | "Activity"
        | "Target"
        | "Award"
        | "Trophy"
        | "Gift"
        | "ShoppingCart"
        | "ShoppingBag"
        | "CreditCard"
        | "DollarSign"
        | "PoundSterling"
        | "Euro"
        | "Bitcoin"
        | "Banknote"
        | "Receipt"
        | "Calculator"
        | "Building"
        | "Building2"
        | "Factory"
        | "Store"
        | "Car"
        | "Truck"
        | "Plane"
        | "Train"
        | "Ship"
        | "Bike"
        | "Fuel"
        | "Palette"
        | "Paintbrush"
        | "Brush"
        | "Eraser"
        | "Scissors"
        | "Ruler"
        | "Pen"
        | "PenTool"
        | "Pencil"
        | "Highlighter"
        | "Type"
        | "Bold"
        | "Italic"
        | "Underline"
        | "AlignLeft"
        | "AlignCenter"
        | "AlignRight"
        | "List"
        | "ListOrdered"
        | "Indent"
        | "Outdent"
        | "Quote"
        | "Hash"
        | "AtSign"
        | "Percent"
        | "Minus"
        | "Equal"
        | "Divide"
        | "Asterisk"
        | "Dot"
        | "Circle"
        | "Square"
        | "Triangle"
        | "Diamond"
        | "Hexagon"
        | "Octagon"
        | "Bot"
        | "Cog"
        | "BookOpen"
        | "Puzzle"
        | "Terminal"
      matrix_pathway:
        | "agent_crew"
        | "agent_mixture"
        | "workflow"
        | "conductor"
        | "monte_carlo"
        | "hypercluster"
        | "the_matrix"
        | "knowledge_matrix"
      mcp_auth_strategy:
        | "oauth_discovery"
        | "bearer"
        | "api_key"
        | "env"
        | "none"
      mcp_connection_status:
        | "connected"
        | "expired"
        | "refresh_failed"
        | "disconnected"
        | "error"
      mcp_server_category:
        | "productivity"
        | "communication"
        | "design"
        | "developer"
        | "database"
        | "payments"
        | "analytics"
        | "crm"
        | "storage"
        | "ai"
        | "search"
        | "automation"
        | "other"
      mcp_server_status:
        | "active"
        | "beta"
        | "community"
        | "deprecated"
        | "coming_soon"
      mcp_transport: "http" | "sse" | "stdio"
      message_role: "user" | "system" | "assistant" | "tool"
      message_type:
        | "text"
        | "image_url"
        | "blob"
        | "base64_image"
        | "other"
        | "tool_result"
        | "json_object"
        | "mixed"
      model_role: "primary_model" | "verified_model" | "trial_model"
      operation_type: "insert" | "update" | "delete"
      org_role: "owner" | "member" | "admin"
      orientation: "vertical" | "horizontal" | "default"
      permission_level: "viewer" | "editor" | "admin"
      project_role: "owner" | "admin" | "member"
      recipe_status:
        | "live"
        | "draft"
        | "in_review"
        | "active_testing"
        | "archived"
        | "other"
      reg_func_category:
        | "Recipes"
        | "Agents"
        | "Prompts"
        | "Processors"
        | "Extractors"
        | "Files"
        | "Database"
        | "Web"
        | "Media"
        | "Documents"
        | "Integrations"
        | "Commands"
        | "Executors"
        | "API"
        | "Other"
      size:
        | "3xs"
        | "2xs"
        | "xs"
        | "s"
        | "m"
        | "l"
        | "xl"
        | "2xl"
        | "3xl"
        | "4xl"
        | "5xl"
        | "default"
      skl_skill_type:
        | "render_block"
        | "convention"
        | "workflow"
        | "task"
        | "reference"
        | "mode"
        | "agent_behavior"
      source_component:
        | "Input"
        | "NumberInput"
        | "Textarea"
        | "Slider"
        | "YesNo"
        | "Checkbox"
        | "Switch"
        | "Select"
        | "Json"
        | "FileUpload"
        | "Image"
        | "UrlLink"
        | "none"
      task_priority: "low" | "medium" | "high"
      wc_finger_type: "index" | "middle" | "ring" | "little" | "thumb"
      wc_side: "right" | "left" | "default"
    }
    CompositeTypes: {
      operation_record: {
        table_name: string | null
        operation: Database["public"]["Enums"]["operation_type"] | null
        data: Json | null
        dependencies: string[] | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      admin_level: ["developer", "senior_admin", "super_admin"],
      app_type: ["recipe", "workflow", "other"],
      artifact_status: ["draft", "published", "archived", "failed"],
      artifact_type: [
        "html_page",
        "flashcard_deck",
        "org_chart",
        "diagram",
        "data_table",
        "timeline",
        "comparison_table",
        "quiz",
        "summary",
        "outline",
        "report",
        "code_snippet",
        "spreadsheet",
        "presentation",
        "other",
      ],
      broker_role: ["input_broker", "output_broker"],
      code_edit_status: ["applied", "rejected", "reverted"],
      code_message_file_status: ["in_progress", "completed", "reverted"],
      cognition_matrices: [
        "agent_crew",
        "agent_mixture",
        "workflow",
        "conductor",
        "monte_carlo",
        "hypercluster",
        "the_matrix",
        "knowledge_matrix",
      ],
      color: [
        "slate",
        "gray",
        "zinc",
        "neutral",
        "stone",
        "red",
        "orange",
        "amber",
        "yellow",
        "lime",
        "green",
        "emerald",
        "teal",
        "cyan",
        "sky",
        "blue",
        "indigo",
        "violet",
        "purple",
        "fuchsia",
        "pink",
        "rose",
        "Bot",
      ],
      context_fetch_hint: [
        "always",
        "on_demand",
        "batch_related",
        "lazy",
        "never",
      ],
      context_item_status: [
        "idea",
        "stub",
        "gathering",
        "partial",
        "needs_review",
        "ai_enriched",
        "in_revision",
        "pending_approval",
        "active",
        "provisional",
        "stale",
        "needs_update",
        "superseded",
        "archived",
        "deprecated",
      ],
      context_sensitivity: ["public", "internal", "restricted", "privileged"],
      context_source_type: [
        "manual",
        "ai_generated",
        "ai_enriched",
        "imported",
        "scraped",
        "system",
      ],
      context_value_type: [
        "string",
        "number",
        "boolean",
        "object",
        "array",
        "document",
        "reference",
      ],
      cx_agent_task_creator: ["agent", "user"],
      cx_agent_task_status: [
        "pending",
        "in_progress",
        "done",
        "blocked",
        "skipped",
      ],
      cx_plan_status: ["proposed", "approved", "rejected", "superseded"],
      data_destination: [
        "user_output",
        "database",
        "file",
        "api_response",
        "function",
      ],
      data_source: [
        "user_input",
        "database",
        "api",
        "environment",
        "file",
        "chance",
        "generated_data",
        "function",
        "none",
      ],
      data_type: ["str", "int", "float", "bool", "dict", "list", "url"],
      default_component: [
        "Input",
        "Textarea",
        "Switch",
        "Select",
        "Slider",
        "UUID_Field",
        "UUID_Array",
        "Button",
        "Checkbox",
        "Chip",
        "Color_Picker",
        "Date_Picker",
        "Drawer",
        "Menu",
        "File_Upload",
        "Image_Display",
        "Json_Editor",
        "Number_Input",
        "Phone_Input",
        "Radio_Group",
        "Relational_Input",
        "Relational_Button",
        "Search_Input",
        "Sheet",
        "Star_Rating",
        "Time_Picker",
        "Accordion_View",
        "Accordion_View_Add_Edit",
        "Accordion_Selected",
        "BrokerInput",
        "BrokerTextarea",
        "BrokerSelect",
        "BrokerSlider",
        "BrokerSwitch",
        "BrokerCheckbox",
        "BrokerRadio",
        "BrokerTextareaGrow",
        "BrokerTailwindColorPicker",
        "BrokerColorPicker",
        "BrokerTextArrayInput",
        "BrokerNumberPicker",
        "BrokerNumberInput",
        "BrokerCustomSelect",
        "BrokerCustomInput",
        "BrokerRadioGroup",
      ],
      destination_component: [
        "chatResponse",
        "PlainText",
        "Textarea",
        "JsonViewer",
        "CodeView",
        "MarkdownViewer",
        "RichTextEditor",
        "TreeView",
        "ImageView",
        "AudioOutput",
        "Presentation",
        "RunCodeFront",
        "RunCodeBack",
        "ComplexMulti",
        "FileOutput",
        "Table",
        "Form",
        "VerticalList",
        "HorizontalList",
        "Flowchart",
        "WordMap",
        "GeographicMap",
        "video",
        "Spreadsheet",
        "Timeline",
        "GanttChart",
        "NetworkGraph",
        "Heatmap",
        "3DModelViewer",
        "LaTeXRenderer",
        "DiffViewer",
        "Checklist",
        "KanbanBoard",
        "PivotTable",
        "InteractiveChart",
        "SankeyDiagram",
        "MindMap",
        "Calendar",
        "Carousel",
        "PDFViewer",
        "SVGEditor",
        "DataFlowDiagram",
        "UMLDiagram",
        "GlossaryView",
        "DecisionTree",
        "WordHighlighter",
        "SpectrumAnalyzer",
        "LiveTraffic",
        "WeatherMap",
        "WeatherDashboard",
        "Thermometer",
        "SatelliteView",
        "PublicLiveCam",
        "Clock",
        "BudgetVisualizer",
        "MealPlanner",
        "TaskPrioritization",
        "VoiceSentimentAnalysis",
        "NewsAggregator",
        "FitnessTracker",
        "TravelPlanner",
        "BucketList",
        "SocialMediaInfo",
        "LocalEvents",
        "NeedNewOption",
        "none",
      ],
      field_data_type: [
        "string",
        "number",
        "integer",
        "boolean",
        "date",
        "datetime",
        "json",
        "array",
      ],
      function_role: [
        "decision",
        "validation",
        "post_processing",
        "pre-Processing",
        "rating",
        "comparison",
        "save_data",
        "other",
      ],
      icon_type: [
        "Brain",
        "Code",
        "User",
        "Database",
        "FaBrave",
        "FcGoogle",
        "FcBrokenLink",
        "FcFilm",
        "FcDownload",
        "FcBiotech",
        "FcElectronics",
        "FcGraduationCap",
        "FcLibrary",
        "FcMusic",
        "FcParallelTasks",
        "FcSalesPerformance",
        "FcCalendar",
        "FcDocument",
        "FcEngineering",
        "FcDataProtection",
        "FcAssistant",
        "FcSms",
        "FcTodoList",
        "FcWikipedia",
        "FcCommandLine",
        "FcConferenceCall",
        "FcManager",
        "FcAreaChart",
        "FcMultipleInputs",
        "FcShipped",
        "FcBusinessContact",
        "FcAlphabeticalSortingAz",
        "FcAlphabeticalSortingZa",
        "FcFeedback",
        "FcBusiness",
        "FcSignature",
        "Mail",
        "Calendar",
        "FileText",
        "Webhook",
        "Search",
        "ArrowRightLeft",
        "ArrowLeftRight",
        "Plus",
        "Cpu",
        "MessageSquare",
        "Globe",
        "Image",
        "Zap",
        "Play",
        "RotateCcw",
        "GitBranch",
        "Repeat",
        "Wand2",
        "Settings",
        "Wrench",
        "Filter",
        "Layers",
        "Package",
        "Upload",
        "Download",
        "Eye",
        "Edit",
        "Trash",
        "Copy",
        "Move",
        "Link",
        "Unlink",
        "Lock",
        "Unlock",
        "Archive",
        "Folder",
        "FolderOpen",
        "File",
        "Save",
        "RefreshCw",
        "Home",
        "Star",
        "Heart",
        "Bell",
        "BellOff",
        "Check",
        "CheckCircle",
        "X",
        "XCircle",
        "AlertCircle",
        "AlertTriangle",
        "Info",
        "HelpCircle",
        "Menu",
        "MoreHorizontal",
        "MoreVertical",
        "ChevronDown",
        "ChevronUp",
        "ChevronLeft",
        "ChevronRight",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "ExternalLink",
        "Share",
        "Share2",
        "Bookmark",
        "BookmarkPlus",
        "Tag",
        "Tags",
        "User2",
        "Users",
        "UserPlus",
        "UserMinus",
        "Shield",
        "ShieldCheck",
        "Key",
        "LogIn",
        "LogOut",
        "Phone",
        "PhoneCall",
        "MessageCircle",
        "Send",
        "Inbox",
        "Clock",
        "Timer",
        "CalendarDays",
        "MapPin",
        "Map",
        "Navigation",
        "Compass",
        "Camera",
        "Video",
        "Mic",
        "MicOff",
        "Volume2",
        "VolumeX",
        "Headphones",
        "Music",
        "Music2",
        "PlayCircle",
        "PauseCircle",
        "StopCircle",
        "SkipForward",
        "SkipBack",
        "Shuffle",
        "Repeat1",
        "MonitorSpeaker",
        "Smartphone",
        "Tablet",
        "Laptop",
        "Monitor",
        "Wifi",
        "WifiOff",
        "Battery",
        "BatteryLow",
        "Power",
        "PowerOff",
        "Sun",
        "Moon",
        "Cloud",
        "CloudRain",
        "CloudSnow",
        "Umbrella",
        "Thermometer",
        "TrendingUp",
        "TrendingDown",
        "BarChart",
        "LineChart",
        "PieChart",
        "Activity",
        "Target",
        "Award",
        "Trophy",
        "Gift",
        "ShoppingCart",
        "ShoppingBag",
        "CreditCard",
        "DollarSign",
        "PoundSterling",
        "Euro",
        "Bitcoin",
        "Banknote",
        "Receipt",
        "Calculator",
        "Building",
        "Building2",
        "Factory",
        "Store",
        "Car",
        "Truck",
        "Plane",
        "Train",
        "Ship",
        "Bike",
        "Fuel",
        "Palette",
        "Paintbrush",
        "Brush",
        "Eraser",
        "Scissors",
        "Ruler",
        "Pen",
        "PenTool",
        "Pencil",
        "Highlighter",
        "Type",
        "Bold",
        "Italic",
        "Underline",
        "AlignLeft",
        "AlignCenter",
        "AlignRight",
        "List",
        "ListOrdered",
        "Indent",
        "Outdent",
        "Quote",
        "Hash",
        "AtSign",
        "Percent",
        "Minus",
        "Equal",
        "Divide",
        "Asterisk",
        "Dot",
        "Circle",
        "Square",
        "Triangle",
        "Diamond",
        "Hexagon",
        "Octagon",
        "Bot",
        "Cog",
        "BookOpen",
        "Puzzle",
        "Terminal",
      ],
      matrix_pathway: [
        "agent_crew",
        "agent_mixture",
        "workflow",
        "conductor",
        "monte_carlo",
        "hypercluster",
        "the_matrix",
        "knowledge_matrix",
      ],
      mcp_auth_strategy: [
        "oauth_discovery",
        "bearer",
        "api_key",
        "env",
        "none",
      ],
      mcp_connection_status: [
        "connected",
        "expired",
        "refresh_failed",
        "disconnected",
        "error",
      ],
      mcp_server_category: [
        "productivity",
        "communication",
        "design",
        "developer",
        "database",
        "payments",
        "analytics",
        "crm",
        "storage",
        "ai",
        "search",
        "automation",
        "other",
      ],
      mcp_server_status: [
        "active",
        "beta",
        "community",
        "deprecated",
        "coming_soon",
      ],
      mcp_transport: ["http", "sse", "stdio"],
      message_role: ["user", "system", "assistant", "tool"],
      message_type: [
        "text",
        "image_url",
        "blob",
        "base64_image",
        "other",
        "tool_result",
        "json_object",
        "mixed",
      ],
      model_role: ["primary_model", "verified_model", "trial_model"],
      operation_type: ["insert", "update", "delete"],
      org_role: ["owner", "member", "admin"],
      orientation: ["vertical", "horizontal", "default"],
      permission_level: ["viewer", "editor", "admin"],
      project_role: ["owner", "admin", "member"],
      recipe_status: [
        "live",
        "draft",
        "in_review",
        "active_testing",
        "archived",
        "other",
      ],
      reg_func_category: [
        "Recipes",
        "Agents",
        "Prompts",
        "Processors",
        "Extractors",
        "Files",
        "Database",
        "Web",
        "Media",
        "Documents",
        "Integrations",
        "Commands",
        "Executors",
        "API",
        "Other",
      ],
      size: [
        "3xs",
        "2xs",
        "xs",
        "s",
        "m",
        "l",
        "xl",
        "2xl",
        "3xl",
        "4xl",
        "5xl",
        "default",
      ],
      skl_skill_type: [
        "render_block",
        "convention",
        "workflow",
        "task",
        "reference",
        "mode",
        "agent_behavior",
      ],
      source_component: [
        "Input",
        "NumberInput",
        "Textarea",
        "Slider",
        "YesNo",
        "Checkbox",
        "Switch",
        "Select",
        "Json",
        "FileUpload",
        "Image",
        "UrlLink",
        "none",
      ],
      task_priority: ["low", "medium", "high"],
      wc_finger_type: ["index", "middle", "ring", "little", "thumb"],
      wc_side: ["right", "left", "default"],
    },
  },
} as const
