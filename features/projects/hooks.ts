"use client";
/**
 * Project Hooks
 *
 * React hooks for project management in components.
 * Mirrors features/organizations/hooks.ts
 *
 * NOTE: Listing hooks (useUserProjects / useOrgProjects / usePersonalProjects)
 * read from the Redux nav tree (`get_user_full_context`) — the same source the
 * agent-context hierarchy cascade uses. This keeps `/projects`,
 * `/organizations/[slug]/projects`, and any wizard view in lock-step. Mutations elsewhere
 * call `invalidateAndRefetchFullContext()` to refresh every consumer at once.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useNavTree } from "@/features/agent-context/hooks/useNavTree";
import { invalidateAndRefetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";
import type { NavOrganization } from "@/features/agent-context/redux/hierarchySlice";
import {
  Project,
  ProjectWithRole,
  ProjectMemberWithUser,
  ProjectInvitation,
  ProjectInvitationWithProject,
  ProjectRole,
  ProjectReference,
  CreateProjectOptions,
  UpdateProjectOptions,
  InviteProjectMemberOptions,
} from "./types";
import {
  getProject,
  createProject,
  updateProject,
  deleteProject,
  getProjectMembers,
  updateProjectMemberRole,
  removeProjectMember,
  leaveProject,
  getProjectUserRole,
  getProjectInvitations,
  inviteToProject,
  cancelProjectInvitation,
  resendProjectInvitation,
  getUserProjectInvitations,
  acceptProjectInvitation,
  isProjectSlugAvailable,
  getProjectReferences,
} from "./service";

// ============================================================================
// Project Listing Hooks (Redux-backed)
// ============================================================================

const EMPTY_PROJECTS: ProjectWithRole[] = [];

/** Map a NavOrganization's role to a ProjectRole. The nav tree only carries
 * org-level roles, not per-project roles. */
function roleForOrgProject(orgRole: string): ProjectRole {
  if (orgRole === "owner" || orgRole === "admin") return orgRole;
  return "member";
}

function projectsFromOrg(org: NavOrganization): ProjectWithRole[] {
  const isPersonalOrg = org.is_personal === true;
  const role: ProjectRole = isPersonalOrg
    ? "owner"
    : roleForOrgProject(org.role);
  return org.projects.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug ?? null,
    description: null,
    organizationId: org.id,
    createdBy: null,
    isPersonal: !!p.is_personal,
    // Nav-tree projects don't carry status/priority/dates; default until the
    // workspace fetches the full row. Consumers here don't render them.
    status: "active",
    settings: {},
    createdAt: "",
    updatedAt: "",
    role,
    memberCount: undefined,
  }));
}

export function useOrgProjects(organizationId: string | undefined) {
  const dispatch = useAppDispatch();
  const { orgs, isLoading, isError, error } = useNavTree();

  const projects = useMemo<ProjectWithRole[]>(() => {
    if (!organizationId) return EMPTY_PROJECTS;
    const org = orgs.find((o) => o.id === organizationId);
    if (!org) return EMPTY_PROJECTS;
    return projectsFromOrg(org).sort((a, b) => a.name.localeCompare(b.name));
  }, [orgs, organizationId]);

  const refresh = useCallback(() => {
    // Cast: the thunk returns a Promise but we surface a void-shaped refresh.
    dispatch(
      invalidateAndRefetchFullContext() as unknown as Parameters<
        typeof dispatch
      >[0],
    );
  }, [dispatch]);

  return {
    projects,
    loading: isLoading,
    error: isError ? (error ?? "Failed to fetch projects") : null,
    refresh,
  };
}

export function useUserProjects() {
  const dispatch = useAppDispatch();
  const { orgs, isLoading, isError, error } = useNavTree();

  const projects = useMemo<ProjectWithRole[]>(() => {
    const out: ProjectWithRole[] = [];
    for (const org of orgs) out.push(...projectsFromOrg(org));
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [orgs]);

  const refresh = useCallback(() => {
    dispatch(
      invalidateAndRefetchFullContext() as unknown as Parameters<
        typeof dispatch
      >[0],
    );
  }, [dispatch]);

  return {
    projects,
    loading: isLoading,
    error: isError ? (error ?? "Failed to fetch projects") : null,
    refresh,
  };
}

export function usePersonalProjects() {
  const dispatch = useAppDispatch();
  const { orgs, isLoading, isError, error } = useNavTree();

  const projects = useMemo<ProjectWithRole[]>(() => {
    const out: ProjectWithRole[] = [];
    for (const org of orgs) {
      if (!org.is_personal) continue;
      out.push(...projectsFromOrg(org));
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [orgs]);

  const refresh = useCallback(() => {
    dispatch(
      invalidateAndRefetchFullContext() as unknown as Parameters<
        typeof dispatch
      >[0],
    );
  }, [dispatch]);

  return {
    projects,
    loading: isLoading,
    error: isError ? (error ?? "Failed to fetch personal projects") : null,
    refresh,
  };
}

export function useProject(projectId: string | undefined) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProject = useCallback(async () => {
    if (!projectId) {
      setProject(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getProject(projectId);
      setProject(data);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to fetch project";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  return { project, loading, error, refresh: fetchProject };
}

// ============================================================================
// Project CRUD Hooks
// ============================================================================

export function useProjectOperations() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (options: CreateProjectOptions) => {
    setLoading(true);
    setError(null);
    try {
      const result = await createProject(options);
      if (!result.success) setError(result.error ?? "Failed to create project");
      return result;
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to create project";
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  }, []);

  const update = useCallback(
    async (projectId: string, updates: UpdateProjectOptions) => {
      setLoading(true);
      setError(null);
      try {
        const result = await updateProject(projectId, updates);
        if (!result.success)
          setError(result.error ?? "Failed to update project");
        return result;
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to update project";
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const remove = useCallback(async (projectId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await deleteProject(projectId);
      if (!result.success) setError(result.error ?? "Failed to delete project");
      return result;
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete project";
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  }, []);

  return { create, update, remove, loading, error };
}

// ============================================================================
// Member Management Hooks
// ============================================================================

export function useProjectMembers(projectId: string | undefined) {
  const [members, setMembers] = useState<ProjectMemberWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!projectId) {
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getProjectMembers(projectId);
      setMembers(data);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to fetch members";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  return { members, loading, error, refresh: fetchMembers };
}

export function useProjectMemberOperations(projectId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refresh: refreshMembers } = useProjectMembers(projectId);

  const updateRole = useCallback(
    async (userId: string, newRole: ProjectRole) => {
      setLoading(true);
      setError(null);
      try {
        const result = await updateProjectMemberRole(
          projectId,
          userId,
          newRole,
        );
        if (!result.success)
          setError(result.error ?? "Failed to update member role");
        else await refreshMembers();
        return result;
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to update member role";
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setLoading(false);
      }
    },
    [projectId, refreshMembers],
  );

  const remove = useCallback(
    async (userId: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await removeProjectMember(projectId, userId);
        if (!result.success)
          setError(result.error ?? "Failed to remove member");
        else await refreshMembers();
        return result;
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to remove member";
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setLoading(false);
      }
    },
    [projectId, refreshMembers],
  );

  const leave = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await leaveProject(projectId);
      if (!result.success) setError(result.error ?? "Failed to leave project");
      return result;
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to leave project";
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  return { updateRole, remove, leave, loading, error };
}

export function useProjectUserRole(projectId: string | undefined) {
  const [role, setRole] = useState<ProjectRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRole = async () => {
      if (!projectId) {
        setRole(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const userRole = await getProjectUserRole(projectId);
      setRole(userRole);
      setLoading(false);
    };
    fetchRole();
  }, [projectId]);

  return {
    role,
    loading,
    isOwner: role === "owner",
    isAdmin: role === "admin" || role === "owner",
    canManageMembers: role === "admin" || role === "owner",
    canManageSettings: role === "admin" || role === "owner",
    canDelete: role === "owner",
  };
}

// ============================================================================
// Invitation Hooks
// ============================================================================

export function useProjectInvitations(projectId: string | undefined) {
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvitations = useCallback(async () => {
    if (!projectId) {
      setInvitations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getProjectInvitations(projectId);
      setInvitations(data);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to fetch invitations";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  return { invitations, loading, error, refresh: fetchInvitations };
}

export function useProjectInvitationOperations(projectId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refresh: refreshInvitations } = useProjectInvitations(projectId);

  const invite = useCallback(
    async (options: Omit<InviteProjectMemberOptions, "projectId">) => {
      setLoading(true);
      setError(null);
      try {
        const result = await inviteToProject({ ...options, projectId });
        if (!result.success)
          setError(result.error ?? "Failed to send invitation");
        else await refreshInvitations();
        return result;
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to send invitation";
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setLoading(false);
      }
    },
    [projectId, refreshInvitations],
  );

  const cancel = useCallback(
    async (invitationId: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await cancelProjectInvitation(invitationId);
        if (!result.success)
          setError(result.error ?? "Failed to cancel invitation");
        else await refreshInvitations();
        return result;
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to cancel invitation";
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setLoading(false);
      }
    },
    [refreshInvitations],
  );

  const resend = useCallback(
    async (invitationId: string, email?: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await resendProjectInvitation(
          invitationId,
          email ? { projectId, email } : undefined,
        );
        if (!result.success)
          setError(result.error ?? "Failed to resend invitation");
        else await refreshInvitations();
        return result;
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to resend invitation";
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setLoading(false);
      }
    },
    [projectId, refreshInvitations],
  );

  return { invite, cancel, resend, loading, error };
}

export function useUserProjectInvitations() {
  const [invitations, setInvitations] = useState<
    ProjectInvitationWithProject[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvitations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUserProjectInvitations();
      setInvitations(data);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to fetch invitations";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  const accept = useCallback(
    async (token: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await acceptProjectInvitation(token);
        if (!result.success)
          setError(result.error ?? "Failed to accept invitation");
        else await fetchInvitations();
        return result;
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to accept invitation";
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setLoading(false);
      }
    },
    [fetchInvitations],
  );

  return { invitations, loading, error, accept, refresh: fetchInvitations };
}

// ============================================================================
// Utility Hooks
// ============================================================================

// ============================================================================
// Project References Hook
// ============================================================================

export function useProjectReferences(projectId: string | undefined) {
  const [references, setReferences] = useState<ProjectReference[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReferences = useCallback(async () => {
    if (!projectId) {
      setReferences([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getProjectReferences(projectId);
      setReferences(data);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to fetch project references";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchReferences();
  }, [fetchReferences]);

  return { references, loading, error, refresh: fetchReferences };
}

// ============================================================================
// Utility Hooks
// ============================================================================

export function useProjectSlugAvailability(
  slug: string,
  organizationId: string | undefined | null,
  debounceMs = 500,
) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const trimmedSlug = slug.trim();

  useEffect(() => {
    if (!trimmedSlug) return;

    let cancelled = false;

    const timer = setTimeout(async () => {
      if (cancelled) return;
      setChecking(true);
      const isAvailable = await isProjectSlugAvailable(
        trimmedSlug,
        organizationId ?? null,
      );
      if (cancelled) return;
      setAvailable(isAvailable);
      setChecking(false);
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmedSlug, organizationId, debounceMs]);

  return {
    available: trimmedSlug ? available : null,
    checking: trimmedSlug ? checking : false,
  };
}
