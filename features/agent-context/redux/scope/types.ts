export interface ScopeType {
  id: string;
  organization_id: string;
  parent_type_id: string | null;
  label_singular: string;
  label_plural: string;
  icon: string;
  description: string;
  color: string;
  slug?: string | null;
  sort_order: number;
  max_assignments_per_entity: number | null;
  default_variable_keys: string[];
  /**
   * When true, this scope type's context items are SYSTEM context — they always resolve
   * for every user with no scope selection (platform-wide Class 2/3 context). Read-only
   * here; set via a super-admin control (platform-global flag, protected-resources pattern).
   */
  is_system?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Scope {
  id: string;
  organization_id: string;
  scope_type_id: string;
  parent_scope_id: string | null;
  name: string;
  slug?: string | null;
  description: string;
  settings: Record<string, unknown>;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  _type_label?: string;
  _child_count?: number;
  _assignment_count?: number;
}

export interface ScopeAssignment {
  id: string;
  scope_id: string;
  entity_type: string;
  entity_id: string;
  created_by: string | null;
  created_at: string;
}

export interface ResolvedScopeContext {
  variables: Record<
    string,
    { value: string; type?: string; inject_as?: string; source: string }
  >;
  scope_labels: Record<string, string>;
  context: {
    user_id: string;
    organization_id: string;
    project_id?: string;
    task_id?: string;
  };
}

export interface ScopeContextState {
  current: ResolvedScopeContext | null;
  currentEntityKey: string | null;
  loading: boolean;
  error: string | null;
}

export interface EntityScopeLabel {
  assignment_id: string;
  scope_id: string;
  scope_name: string;
  type_id: string;
  type_label: string;
  type_color: string;
  type_icon: string;
}

export interface SidebarScopeSection {
  type_id: string;
  label_singular: string;
  label_plural: string;
  icon: string;
  color: string;
  parent_type_id: string | null;
  scopes: SidebarScopeItem[];
}

export interface SidebarScopeItem {
  id: string;
  name: string;
  assignment_count: number;
  children: SidebarScopeItem[];
}

export interface ScopePickerOption {
  type_id: string;
  label: string;
  icon: string;
  color: string;
  max_assignments: number | null;
  options: { value: string; label: string; parent_scope_id: string | null }[];
}
