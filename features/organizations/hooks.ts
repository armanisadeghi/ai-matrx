"use client";
/**
 * Organization Hooks
 *
 * React hooks for organization management in components.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Organization,
  OrganizationWithRole,
  OrganizationMember,
  OrganizationMemberWithUser,
  OrganizationInvitation,
  OrganizationInvitationWithOrg,
  OrgRole,
  CreateOrganizationOptions,
  UpdateOrganizationOptions,
  InviteMemberOptions,
} from "./types";
import {
  getUserOrganizations,
  getOrganization,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  getOrganizationMembers,
  updateMemberRole,
  removeMember,
  leaveOrganization,
  getUserRole,
  getOrganizationInvitations,
  inviteToOrganization,
  cancelInvitation,
  resendInvitation,
  getUserInvitations,
  acceptInvitation,
  isSlugAvailable,
} from "./service";

// ============================================================================
// Organization Listing Hooks
// ============================================================================

/**
 * Hook to get all organizations for current user
 */
export function useUserOrganizations() {
  const [organizations, setOrganizations] = useState<OrganizationWithRole[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrganizations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getUserOrganizations();
      setOrganizations(data);
    } catch (err: any) {
      console.error("Error fetching organizations:", err);
      setError(err.message || "Failed to fetch organizations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  return {
    organizations,
    loading,
    error,
    refresh: fetchOrganizations,
  };
}

/**
 * Hook to get a single organization
 */
export function useOrganization(orgId: string | undefined) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrganization = useCallback(async () => {
    if (!orgId) {
      setOrganization(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getOrganization(orgId);
      setOrganization(data);
    } catch (err: any) {
      console.error("Error fetching organization:", err);
      setError(err.message || "Failed to fetch organization");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchOrganization();
  }, [fetchOrganization]);

  return {
    organization,
    loading,
    error,
    refresh: fetchOrganization,
  };
}

// ============================================================================
// Organization CRUD Hooks
// ============================================================================

/**
 * Hook for organization CRUD operations
 */
export function useOrganizationOperations() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (options: CreateOrganizationOptions) => {
    setLoading(true);
    setError(null);

    try {
      const result = await createOrganization(options);

      if (!result.success) {
        setError(result.error || "Failed to create organization");
      }

      return result;
    } catch (err: any) {
      const errorMessage = err.message || "Failed to create organization";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  const update = useCallback(
    async (orgId: string, updates: UpdateOrganizationOptions) => {
      setLoading(true);
      setError(null);

      try {
        const result = await updateOrganization(orgId, updates);

        if (!result.success) {
          setError(result.error || "Failed to update organization");
        }

        return result;
      } catch (err: any) {
        const errorMessage = err.message || "Failed to update organization";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const remove = useCallback(async (orgId: string) => {
    setLoading(true);
    setError(null);

    try {
      const result = await deleteOrganization(orgId);

      if (!result.success) {
        setError(result.error || "Failed to delete organization");
      }

      return result;
    } catch (err: any) {
      const errorMessage = err.message || "Failed to delete organization";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    create,
    update,
    remove,
    loading,
    error,
  };
}

// ============================================================================
// Member Management Hooks
// ============================================================================

/**
 * Hook to get organization members
 */
export function useOrganizationMembers(orgId: string | undefined) {
  const [members, setMembers] = useState<OrganizationMemberWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!orgId) {
      setMembers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getOrganizationMembers(orgId);
      setMembers(data);
    } catch (err: any) {
      console.error("Error fetching members:", err);
      setError(err.message || "Failed to fetch members");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  return {
    members,
    loading,
    error,
    refresh: fetchMembers,
  };
}

/**
 * Hook for member management operations
 */
export function useMemberOperations(orgId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refresh: refreshMembers } = useOrganizationMembers(orgId);

  const updateRole = useCallback(
    async (userId: string, newRole: OrgRole) => {
      setLoading(true);
      setError(null);

      try {
        const result = await updateMemberRole(orgId, userId, newRole);

        if (!result.success) {
          setError(result.error || "Failed to update member role");
        } else {
          await refreshMembers();
        }

        return result;
      } catch (err: any) {
        const errorMessage = err.message || "Failed to update member role";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [orgId, refreshMembers],
  );

  const remove = useCallback(
    async (userId: string) => {
      setLoading(true);
      setError(null);

      try {
        const result = await removeMember(orgId, userId);

        if (!result.success) {
          setError(result.error || "Failed to remove member");
        } else {
          await refreshMembers();
        }

        return result;
      } catch (err: any) {
        const errorMessage = err.message || "Failed to remove member";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [orgId, refreshMembers],
  );

  const leave = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await leaveOrganization(orgId);

      if (!result.success) {
        setError(result.error || "Failed to leave organization");
      }

      return result;
    } catch (err: any) {
      const errorMessage = err.message || "Failed to leave organization";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  return {
    updateRole,
    remove,
    leave,
    loading,
    error,
  };
}

/**
 * Hook to get current user's role in an organization
 */
export function useUserRole(orgId: string | undefined) {
  const [role, setRole] = useState<OrgRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRole = async () => {
      if (!orgId) {
        setRole(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const userRole = await getUserRole(orgId);
      setRole(userRole);
      setLoading(false);
    };

    fetchRole();
  }, [orgId]);

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

/**
 * Hook to get organization invitations
 */
export function useOrganizationInvitations(orgId: string | undefined) {
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvitations = useCallback(async () => {
    if (!orgId) {
      setInvitations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getOrganizationInvitations(orgId);
      setInvitations(data);
    } catch (err: any) {
      console.error("Error fetching invitations:", err);
      setError(err.message || "Failed to fetch invitations");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  return {
    invitations,
    loading,
    error,
    refresh: fetchInvitations,
  };
}

/**
 * Hook for invitation operations
 */
export function useInvitationOperations(orgId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refresh: refreshInvitations } = useOrganizationInvitations(orgId);

  const invite = useCallback(
    async (options: Omit<InviteMemberOptions, "organizationId">) => {
      setLoading(true);
      setError(null);

      try {
        const result = await inviteToOrganization({
          ...options,
          organizationId: orgId,
        });

        if (!result.success) {
          setError(result.error || "Failed to send invitation");
        } else {
          await refreshInvitations();
        }

        return result;
      } catch (err: any) {
        const errorMessage = err.message || "Failed to send invitation";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [orgId, refreshInvitations],
  );

  const cancel = useCallback(
    async (invitationId: string) => {
      setLoading(true);
      setError(null);

      try {
        const result = await cancelInvitation(invitationId);

        if (!result.success) {
          setError(result.error || "Failed to cancel invitation");
        } else {
          await refreshInvitations();
        }

        return result;
      } catch (err: any) {
        const errorMessage = err.message || "Failed to cancel invitation";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [refreshInvitations],
  );

  const resend = useCallback(
    async (invitationId: string) => {
      setLoading(true);
      setError(null);

      try {
        const result = await resendInvitation(invitationId);

        if (!result.success) {
          setError(result.error || "Failed to resend invitation");
        } else {
          await refreshInvitations();
        }

        return result;
      } catch (err: any) {
        const errorMessage = err.message || "Failed to resend invitation";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [refreshInvitations],
  );

  return {
    invite,
    cancel,
    resend,
    loading,
    error,
  };
}

/**
 * Hook to get invitations for current user
 */
export function useUserInvitations() {
  const [invitations, setInvitations] = useState<
    OrganizationInvitationWithOrg[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvitations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getUserInvitations();
      setInvitations(data);
    } catch (err: any) {
      console.error("Error fetching user invitations:", err);
      setError(err.message || "Failed to fetch invitations");
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
        const result = await acceptInvitation(token);

        if (!result.success) {
          setError(result.error || "Failed to accept invitation");
        } else {
          await fetchInvitations();
        }

        return result;
      } catch (err: any) {
        const errorMessage = err.message || "Failed to accept invitation";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [fetchInvitations],
  );

  return {
    invitations,
    loading,
    error,
    accept,
    refresh: fetchInvitations,
  };
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Hook to check slug availability with debouncing
 */
export function useSlugAvailability(slug: string, debounceMs: number = 500) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!slug || slug.trim().length === 0) {
      setAvailable(null);
      return undefined;
    }

    setChecking(true);

    const timer = setTimeout(async () => {
      const isAvailable = await isSlugAvailable(slug);
      setAvailable(isAvailable);
      setChecking(false);
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      // Reset both states so a stale "Available" result from a previous slug
      // can never let the form submit while a new check is still pending.
      setChecking(false);
      setAvailable(null);
    };
  }, [slug, debounceMs]);

  return {
    available,
    checking,
  };
}
