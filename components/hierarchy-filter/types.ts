export interface HierarchyOrg {
  id: string;
  name: string;
  slug: string;
  // CONVERGE: C-3 — is_personal is dropped; the default organization becomes users default_organization_id preference — declared 2026-09-10, Data Doctrine R9–R12. Register: /projects/data-doctrine-adoption/REGISTER.md#DD-045
  is_personal: boolean;
  role: string;
  project_count: number;
}

export interface HierarchyProject {
  id: string;
  name: string;
  slug: string | null;
  organization_id: string | null;
  is_personal: boolean;
  role: string;
  topic_count: number;
}

export interface HierarchyData {
  organizations: HierarchyOrg[];
  projects: HierarchyProject[];
}

export interface HierarchyFilterLevel {
  id: string;
  label: string;
  pluralLabel: string;
  icon?: string;
}

export interface HierarchyFilterState {
  selectedOrgId: string | null;
  selectedProjectId: string | null;
}

export interface UseHierarchyFilterReturn {
  data: HierarchyData | null;
  isLoading: boolean;
  error: string | null;

  selectedOrgId: string | null;
  selectedProjectId: string | null;

  filteredOrgs: HierarchyOrg[];
  filteredProjects: HierarchyProject[];

  selectOrg: (orgId: string | null) => void;
  selectProject: (projectId: string | null) => void;
  resetAll: () => void;

  refresh: () => void;
}
